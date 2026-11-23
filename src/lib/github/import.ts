// Fetches a user's GitHub repos and turns them into profile facts.

import { IdMaker } from '../ids'
import { parseDate } from '../linkedin/dates'
import type { Evidence, Repo } from '../profile'
import { GitHubClient, GitHubError, inBatches, type RawRepo } from './client'
import { readmePoints } from './readme'

export interface GitHubData {
  username: string
  fetchedAt: string
  repos: Repo[]
  // Other people's repos the user asked to add, kept so a refresh can fetch
  // them again.
  contributed: string[]
  forksSkipped: number
  // Plain sentences for the review screen.
  warnings: string[]
}

export function buildRepo(raw: RawRepo, readme: string | null, relation: Repo['relation'], commits: number | null, username: string): Repo {
  const ids = new IdMaker()
  const id = ids.make('repo', raw.full_name.toLowerCase())
  const source = `github.com/${raw.full_name}`
  const fact = (text: string, basis: 'observed' | 'stated', from = source): Evidence => ({
    id: ids.child(id, text),
    source: from,
    text,
    basis,
  })

  const observed: Evidence[] = []
  if (raw.language) observed.push(fact(`Main language on GitHub is ${raw.language}`, 'observed'))
  for (const topic of raw.topics ?? []) observed.push(fact(`Tagged with the topic ${topic}`, 'observed'))
  if (commits !== null) observed.push(fact(`${commits} ${commits === 1 ? 'commit' : 'commits'} by ${username}`, 'observed'))

  const description = raw.description?.trim()
  return {
    id,
    source,
    fullName: raw.full_name,
    url: raw.html_url,
    homepage: /^https?:\/\//i.test(raw.homepage ?? '') ? raw.homepage!.trim() : '',
    relation,
    archived: raw.archived,
    created: parseDate(raw.created_at),
    lastPush: raw.pushed_at ? parseDate(raw.pushed_at) : null,
    description: description ? [fact(description, 'stated')] : [],
    observed,
    readme: readme ? readmePoints(readme).map((t) => fact(t, 'stated', `${source} README`)) : [],
  }
}

export async function fetchGitHub(
  username: string,
  contributed: string[],
  client = new GitHubClient(),
  now = new Date(),
): Promise<GitHubData> {
  const warnings: string[] = []
  const all = await client.ownRepos(username)
  const own = all.filter((r) => !r.fork)

  let skipped = 0
  const readmes = await inBatches(own, 6, async (r) => {
    const { text, skipped: s } = await client.readme(r)
    if (s) skipped++
    return text
  })
  const repos = own.map((r, i) => buildRepo(r, readmes[i] ?? null, 'owner', null, username))

  // A contributed repo that fails on refresh is reported and kept in the
  // list, so a repo that is briefly unavailable comes back next time.
  // Running out of lookups stops everything, because every later call
  // would fail the same way.
  for (const name of contributed) {
    const [owner, repo] = name.split('/') as [string, string]
    try {
      repos.push(await fetchContributed(client, owner, repo, username))
    } catch (e) {
      if (e instanceof GitHubError && e.kind === 'rate-limit') throw e
      warnings.push(e instanceof Error ? e.message : `Could not refresh ${name}.`)
    }
  }

  if (skipped > 0) {
    warnings.push(
      `${skipped} ${skipped === 1 ? 'README was' : 'READMEs were'} not fetched to stay under GitHub's hourly limit. Refresh later to get ${skipped === 1 ? 'it' : 'them'}.`,
    )
  }

  return {
    username,
    fetchedAt: now.toISOString(),
    repos,
    contributed: [...contributed],
    forksSkipped: all.length - own.length,
    warnings,
  }
}

// Someone else's repo only counts if GitHub lists the user among its
// contributors. Being a member of the organisation is not enough, because
// that says nothing about what they did there.
export async function fetchContributed(client: GitHubClient, owner: string, repo: string, username: string): Promise<Repo> {
  const raw = await client.repo(owner, repo)
  if (raw.owner.login.toLowerCase() === username.toLowerCase()) {
    throw new GitHubError(`${raw.full_name} is one of your own repos, so it is already in the list.`, 'other')
  }
  const commits = await client.commitsBy(owner, repo, username)
  if (commits === null) {
    throw new GitHubError(
      `GitHub does not list ${username} as a contributor to ${raw.full_name}, so it was not added. Commits made under a different email address than your GitHub account will not count.`,
      'not-found',
    )
  }
  const { text } = await client.readme(raw)
  return buildRepo(raw, text, 'contributor', commits, username)
}
