import { describe, expect, it } from 'vitest'
import { emptyProfile, evidenceIndex } from '../profile'
import { GitHubClient, GitHubError, parseRepoName, parseUsername, type RawRepo } from './client'
import { fetchContributed, fetchGitHub } from './import'

function repo(name: string, extra: Partial<RawRepo> = {}): RawRepo {
  const owner = extra.owner?.login ?? 'ada'
  return {
    full_name: `${owner}/${name}`,
    name,
    owner: { login: owner },
    html_url: `https://github.com/${owner}/${name}`,
    description: null,
    homepage: null,
    language: null,
    topics: [],
    fork: false,
    archived: false,
    created_at: '2025-01-10T09:00:00Z',
    pushed_at: '2026-03-02T09:00:00Z',
    default_branch: 'main',
    ...extra,
  }
}

interface Route {
  status?: number
  body?: unknown
  headers?: Record<string, string>
}

// A stand-in for fetch that answers from a table of URLs and records every
// call, so tests can count how many API lookups were spent.
function fakeGitHub(routes: Record<string, Route>, remaining = 50) {
  const calls: string[] = []
  const fn = (async (input: RequestInfo | URL) => {
    const url = String(input)
    calls.push(url)
    const isApi = url.startsWith('https://api.github.com')
    if (isApi) remaining--
    const route = routes[url] ?? { status: 404, body: { message: 'Not Found' } }
    const headers = new Headers(route.headers)
    if (isApi && !headers.has('x-ratelimit-remaining')) {
      headers.set('x-ratelimit-remaining', String(remaining))
      headers.set('x-ratelimit-reset', '1795452408')
    }
    const body = typeof route.body === 'string' ? route.body : JSON.stringify(route.body ?? null)
    return new Response(route.status === 204 ? null : body, { status: route.status ?? 200, headers })
  }) as typeof fetch
  return { fn, calls, apiCalls: () => calls.filter((c) => c.startsWith('https://api.github.com')).length }
}

const LIST = 'https://api.github.com/users/ada/repos?type=owner&sort=pushed&per_page=100&page=1'
const raw = (owner: string, name: string, file = 'README.md', branch = 'main') =>
  `https://raw.githubusercontent.com/${owner}/${name}/${branch}/${file}`

describe('parsing what people type', () => {
  it.each([
    ['ada', 'ada'],
    ['@ada-lovelace', 'ada-lovelace'],
    ['https://github.com/Ada99/', 'Ada99'],
    ['-ada', null],
    ['ada--l', null],
    ['ada lovelace', null],
    ['a'.repeat(40), null],
  ])('username %j gives %j', (input, expected) => {
    expect(parseUsername(input)).toBe(expected)
  })

  it.each([
    ['Rebel-Hive/friction-tool', { owner: 'Rebel-Hive', repo: 'friction-tool' }],
    ['https://github.com/Rebel-Hive/friction-tool.git', { owner: 'Rebel-Hive', repo: 'friction-tool' }],
    ['friction-tool', null],
    ['a/b/c', null],
  ])('repo %j gives %j', (input, expected) => {
    expect(parseRepoName(input)).toEqual(expected)
  })
})

describe('fetchGitHub', () => {
  it('turns own repos into facts with one API call, skipping forks', async () => {
    const gh = fakeGitHub({
      [LIST]: {
        body: [
          repo('waiting-lists', {
            description: 'Forecasting NHS waiting lists',
            language: 'Python',
            topics: ['nhs', 'lightgbm'],
            homepage: 'https://waits.example',
          }),
          repo('notes', { default_branch: 'trunk' }),
          repo('someone-elses', { fork: true }),
        ],
      },
      [raw('ada', 'waiting-lists')]: { body: '# Waits\n\n- Built a LightGBM model on ten years of data\n' },
    })
    const data = await fetchGitHub('ada', [], new GitHubClient(gh.fn), new Date('2026-11-23T12:00:00Z'))

    expect(data.forksSkipped).toBe(1)
    expect(data.repos.map((r) => r.fullName)).toEqual(['ada/waiting-lists', 'ada/notes'])

    const [waits, notes] = data.repos
    expect(waits!.observed.map((e) => e.text)).toEqual([
      'Main language on GitHub is Python',
      'Tagged with the topic nhs',
      'Tagged with the topic lightgbm',
    ])
    expect(waits!.observed.every((e) => e.basis === 'observed')).toBe(true)
    expect(waits!.description).toMatchObject([{ text: 'Forecasting NHS waiting lists', basis: 'stated' }])
    expect(waits!.readme).toMatchObject([
      { text: 'Built a LightGBM model on ten years of data', basis: 'stated', source: 'github.com/ada/waiting-lists README' },
    ])
    expect(waits!.homepage).toBe('https://waits.example')
    expect(waits!.created).toEqual({ year: 2025, month: 1 })
    expect(waits!.lastPush).toEqual({ year: 2026, month: 3 })

    // No README.md on raw, so it tried the API, which found nothing either.
    expect(notes!.readme).toEqual([])
    expect(gh.calls).toContain(raw('ada', 'notes', 'README.md', 'trunk'))
    expect(gh.apiCalls()).toBe(2)
  })

  it('stops using the API for READMEs when the hour is nearly spent', async () => {
    const gh = fakeGitHub({ [LIST]: { body: [repo('a'), repo('b'), repo('c')] } }, 7)
    const data = await fetchGitHub('ada', [], new GitHubClient(gh.fn))
    // Six left after the list, five kept in reserve, so one fallback call.
    expect(gh.apiCalls()).toBe(2)
    expect(data.warnings).toEqual([
      "2 READMEs were not fetched to stay under GitHub's hourly limit. Refresh later to get them.",
    ])
  })

  it('reports an unknown user and the rate limit in plain words', async () => {
    const missing = fakeGitHub({})
    await expect(fetchGitHub('ada', [], new GitHubClient(missing.fn))).rejects.toThrow('There is no GitHub user called ada.')

    const limited = fakeGitHub({
      [LIST]: { status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1795452408' } },
    })
    const err = await fetchGitHub('ada', [], new GitHubClient(limited.fn)).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(GitHubError)
    expect((err as GitHubError).kind).toBe('rate-limit')
    expect((err as GitHubError).resetAt).toEqual(new Date(1795452408 * 1000))
  })

  it('says so when GitHub cannot be reached', async () => {
    const offline = (async () => {
      throw new TypeError('Failed to fetch')
    }) as typeof fetch
    await expect(fetchGitHub('ada', [], new GitHubClient(offline))).rejects.toMatchObject({ kind: 'network' })
  })

  it('refreshes contributed repos and keeps one that fails, with a warning', async () => {
    const gh = fakeGitHub({
      [LIST]: { body: [] },
      'https://api.github.com/repos/Org/tool': { body: repo('tool', { owner: { login: 'Org' } }) },
      'https://api.github.com/repos/Org/tool/contributors?per_page=100&page=1': { body: [{ login: 'ADA', contributions: 42 }] },
    })
    const data = await fetchGitHub('ada', ['Org/tool', 'Org/gone'], new GitHubClient(gh.fn))
    expect(data.repos.map((r) => r.fullName)).toEqual(['Org/tool'])
    expect(data.contributed).toEqual(['Org/tool', 'Org/gone'])
    expect(data.warnings[0]).toContain('Could not find Org/gone')
  })
})

describe('fetchContributed', () => {
  const routes = (contributors: unknown[], status = 200): Record<string, Route> => ({
    'https://api.github.com/repos/Org/tool': { body: repo('tool', { owner: { login: 'Org' }, language: 'Python' }) },
    'https://api.github.com/repos/Org/tool/contributors?per_page=100&page=1': { status, body: contributors },
    [raw('Org', 'tool')]: { body: 'Friction diagnostics for social housing providers.' },
  })

  it('adds the repo with the commit count GitHub records', async () => {
    const gh = fakeGitHub(routes([{ login: 'bob', contributions: 90 }, { login: 'Ada', contributions: 1 }]))
    const r = await fetchContributed(new GitHubClient(gh.fn), 'Org', 'tool', 'ada')
    expect(r.relation).toBe('contributor')
    expect(r.observed.map((e) => e.text)).toEqual(['Main language on GitHub is Python', '1 commit by ada'])
    expect(r.readme.map((e) => e.text)).toEqual(['Friction diagnostics for social housing providers.'])
    expect(evidenceIndex({ ...emptyProfile(), repos: [r] }).get(r.id)?.text).toBe('Org/tool, GitHub repository, as a contributor, Jan 2025 to Mar 2026')
  })

  it('refuses a repo the user has no commits in', async () => {
    const gh = fakeGitHub(routes([{ login: 'bob', contributions: 90 }]))
    await expect(fetchContributed(new GitHubClient(gh.fn), 'Org', 'tool', 'ada')).rejects.toThrow(
      'GitHub does not list ada as a contributor to Org/tool',
    )
  })

  it('refuses an empty repo', async () => {
    const gh = fakeGitHub(routes([], 204))
    await expect(fetchContributed(new GitHubClient(gh.fn), 'Org', 'tool', 'ada')).rejects.toThrow('does not list ada')
  })

  it('points out when the repo is actually the user’s own', async () => {
    const gh = fakeGitHub({ 'https://api.github.com/repos/ada/mine': { body: repo('mine') } })
    await expect(fetchContributed(new GitHubClient(gh.fn), 'ada', 'mine', 'ada')).rejects.toThrow('one of your own repos')
  })
})
