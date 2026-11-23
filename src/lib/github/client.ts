// Talks to GitHub straight from the browser, without signing in.
//
// Unauthenticated calls to api.github.com are limited to 60 an hour per
// network, so this file is careful with them. Repo lists cost one call per
// hundred repos. READMEs come from raw.githubusercontent.com, which does not
// count towards that limit, and only fall back to the API when the raw file
// is not called README.md. Both hosts allow calls from any web page.

export type Fetch = typeof fetch

const API = 'https://api.github.com'
const RAW = 'https://raw.githubusercontent.com'

// Leave a few calls spare so the user can still add a repo or refresh after
// a big fetch.
const KEEP_IN_RESERVE = 5

export class GitHubError extends Error {
  override name = 'GitHubError'
  constructor(
    message: string,
    readonly kind: 'not-found' | 'rate-limit' | 'network' | 'other',
    readonly resetAt: Date | null = null,
  ) {
    super(message)
  }
}

// The parts of GitHub's repo object we use.
export interface RawRepo {
  full_name: string
  name: string
  owner: { login: string }
  html_url: string
  description: string | null
  homepage: string | null
  language: string | null
  topics?: string[]
  fork: boolean
  archived: boolean
  created_at: string
  pushed_at: string | null
  default_branch: string
}

export interface RateState {
  remaining: number | null
  resetAt: Date | null
}

// GitHub usernames are letters, digits and single hyphens, up to 39
// characters, and cannot start or end with a hyphen. People also paste their
// profile link, so that is accepted too.
export function parseUsername(input: string): string | null {
  const s = input.trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?github\.com\//i, '').replace(/\/+$/, '')
  return /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i.test(s) ? s : null
}

// "owner/repo" or a GitHub repo link.
export function parseRepoName(input: string): { owner: string; repo: string } | null {
  const s = input
    .trim()
    .replace(/^https?:\/\/(www\.)?github\.com\//i, '')
    .replace(/\.git$/i, '')
    .replace(/\/+$/, '')
  const m = /^([a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38})\/([\w.-]{1,100})$/i.exec(s)
  return m ? { owner: m[1]!, repo: m[2]! } : null
}

function resetTime(res: Response): Date | null {
  const reset = Number(res.headers.get('x-ratelimit-reset'))
  return reset > 0 ? new Date(reset * 1000) : null
}

function rateLimitError(resetAt: Date | null): GitHubError {
  const when = resetAt ? ` Try again after ${resetAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}.` : ''
  return new GitHubError(
    `GitHub allows 60 lookups an hour without signing in, and this network has used them all.${when}`,
    'rate-limit',
    resetAt,
  )
}

export class GitHubClient {
  readonly rate: RateState = { remaining: null, resetAt: null }

  constructor(private readonly fetchFn: Fetch = (...args) => fetch(...args)) {}

  // Every API call goes through here so the rate limit is always tracked.
  private async api(path: string, accept = 'application/vnd.github+json'): Promise<Response> {
    // Count the call before it goes out. READMEs are fetched several at a
    // time, and without this they would all see the same remaining count
    // and all decide they can afford a lookup. GitHub's own figure replaces
    // this guess as soon as the reply arrives.
    if (this.rate.remaining !== null) this.rate.remaining--
    let res: Response
    try {
      res = await this.fetchFn(`${API}${path}`, { headers: { Accept: accept } })
    } catch {
      throw new GitHubError('Could not reach GitHub. Check your connection and try again.', 'network')
    }
    const remaining = res.headers.get('x-ratelimit-remaining')
    if (remaining !== null) this.rate.remaining = Number(remaining)
    this.rate.resetAt = resetTime(res) ?? this.rate.resetAt

    if ((res.status === 403 || res.status === 429) && (remaining === '0' || res.status === 429)) {
      throw rateLimitError(this.rate.resetAt)
    }
    return res
  }

  private canSpend(calls: number): boolean {
    return this.rate.remaining === null || this.rate.remaining - calls >= KEEP_IN_RESERVE
  }

  // The user's own public repos, forks included. The caller decides what to
  // do with forks. Three pages covers 300 repos, which is plenty for a CV.
  async ownRepos(username: string): Promise<RawRepo[]> {
    const repos: RawRepo[] = []
    for (let page = 1; page <= 3; page++) {
      const res = await this.api(`/users/${encodeURIComponent(username)}/repos?type=owner&sort=pushed&per_page=100&page=${page}`)
      if (res.status === 404) throw new GitHubError(`There is no GitHub user called ${username}.`, 'not-found')
      if (!res.ok) throw new GitHubError(`GitHub returned an error (${res.status}). Please try again later.`, 'other')
      const batch = (await res.json()) as RawRepo[]
      repos.push(...batch)
      if (batch.length < 100 || !res.headers.get('link')?.includes('rel="next"')) break
    }
    return repos
  }

  async repo(owner: string, repo: string): Promise<RawRepo> {
    const res = await this.api(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`)
    if (res.status === 404) {
      throw new GitHubError(`Could not find ${owner}/${repo}. It may be private, which cvsmith cannot see.`, 'not-found')
    }
    if (!res.ok) throw new GitHubError(`GitHub returned an error (${res.status}). Please try again later.`, 'other')
    return (await res.json()) as RawRepo
  }

  // How many commits GitHub credits this user with in a repo, or null if
  // they are not listed. Contributors come sorted by commit count, so three
  // pages reaches everyone except on very large projects.
  async commitsBy(owner: string, repo: string, username: string): Promise<number | null> {
    const me = username.toLowerCase()
    for (let page = 1; page <= 3; page++) {
      const res = await this.api(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contributors?per_page=100&page=${page}`)
      // 204 means an empty repo with no commits at all.
      if (res.status === 204) return null
      if (!res.ok) throw new GitHubError(`GitHub returned an error (${res.status}). Please try again later.`, 'other')
      const batch = (await res.json()) as { login?: string; contributions: number }[]
      const found = batch.find((c) => c.login?.toLowerCase() === me)
      if (found) return found.contributions
      if (batch.length < 100) return null
    }
    return null
  }

  // The README as plain markdown, or null if there is none or it could not
  // be fetched without eating into the reserve.
  async readme(repo: RawRepo): Promise<{ text: string | null; skipped: boolean }> {
    const branch = repo.default_branch.split('/').map(encodeURIComponent).join('/')
    try {
      const raw = await this.fetchFn(`${RAW}/${repo.owner.login}/${repo.name}/${branch}/README.md`)
      if (raw.ok) return { text: await raw.text(), skipped: false }
    } catch {
      // Fall through to the API, which finds READMEs under any file name.
    }
    if (!this.canSpend(1)) return { text: null, skipped: true }
    const res = await this.api(`/repos/${repo.full_name}/readme`, 'application/vnd.github.raw+json')
    return { text: res.ok ? await res.text() : null, skipped: false }
  }
}

// Runs jobs a few at a time. Firing forty README requests at once is rude
// to GitHub and slower on a phone connection.
export async function inBatches<T, R>(items: T[], size: number, job: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(job))))
  }
  return out
}
