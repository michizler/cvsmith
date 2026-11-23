<!-- The GitHub part of the review screen: fetch repos, add contributed ones, refresh or remove. -->
<script lang="ts">
  import { GitHubClient, GitHubError, parseRepoName, parseUsername } from '../lib/github/client'
  import { fetchContributed, fetchGitHub } from '../lib/github/import'
  import type { Edits } from '../lib/edits'
  import { replaceGitHub, type SavedProfile } from '../lib/saved'
  import RepoEntry from './RepoEntry.svelte'

  interface Props {
    saved: SavedProfile
    onchange: (saved: SavedProfile) => void
  }
  let { saved, onchange }: Props = $props()

  const github = $derived(saved.github)
  const shownCount = $derived(github ? github.repos.filter((r) => !saved.edits.hidden.includes(r.id)).length : 0)

  let usernameInput = $state('')
  let repoInput = $state('')
  let busy = $state<'' | 'fetch' | 'add'>('')
  let error = $state('')
  let notice = $state('')

  const client = new GitHubClient()

  function lookupsLeft(): string {
    const left = client.rate.remaining
    return left === null ? '' : ` You have ${left} GitHub ${left === 1 ? 'lookup' : 'lookups'} left this hour.`
  }

  function failed(e: unknown) {
    error = e instanceof GitHubError ? e.message : 'Something went wrong talking to GitHub. Please try again.'
  }

  async function fetchAll(username: string) {
    busy = 'fetch'
    error = ''
    notice = ''
    try {
      const data = await fetchGitHub(username, github?.username === username ? github.contributed : [], client)
      const { saved: next, dropped } = replaceGitHub(saved, data)
      notice =
        (github
          ? dropped === 0
            ? 'Refreshed from GitHub. All your changes carried over.'
            : `Refreshed from GitHub. ${dropped} of your changes were to facts that have since changed, so they no longer apply.`
          : `Found ${data.repos.length} repos.`) + lookupsLeft()
      onchange(next)
    } catch (e) {
      failed(e)
    } finally {
      busy = ''
    }
  }

  function start(event: SubmitEvent) {
    event.preventDefault()
    const username = parseUsername(usernameInput)
    if (!username) {
      error = 'That is not a valid GitHub username. It should be letters, numbers and single hyphens.'
      return
    }
    void fetchAll(username)
  }

  async function addRepo(event: SubmitEvent) {
    event.preventDefault()
    if (!github) return
    const parsed = parseRepoName(repoInput)
    if (!parsed) {
      error = 'Type the repo as owner/name, for example Rebel-Hive/friction-tool, or paste its GitHub link.'
      return
    }
    const fullName = `${parsed.owner}/${parsed.repo}`
    if (github.repos.some((r) => r.fullName.toLowerCase() === fullName.toLowerCase())) {
      error = `${fullName} is already in your list.`
      return
    }
    busy = 'add'
    error = ''
    notice = ''
    try {
      const repo = await fetchContributed(client, parsed.owner, parsed.repo, github.username)
      onchange({
        ...saved,
        github: { ...github, repos: [...github.repos, repo], contributed: [...github.contributed, repo.fullName] },
      })
      repoInput = ''
      notice = `Added ${repo.fullName}.` + lookupsLeft()
    } catch (e) {
      failed(e)
    } finally {
      busy = ''
    }
  }

  function removeGitHub() {
    if (!window.confirm('Remove your GitHub repos and any changes you made to them?')) return
    onchange(replaceGitHub(saved, null).saved)
    notice = ''
    error = ''
  }

  const setEdits = (edits: Edits) => onchange({ ...saved, edits })
  const fetchedOn = $derived(
    github ? new Date(github.fetchedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '',
  )
</script>

{#if !github}
  <form class="row" onsubmit={start}>
    <input
      class="text"
      type="text"
      autocomplete="username"
      autocapitalize="off"
      spellcheck="false"
      placeholder="Your GitHub username"
      aria-label="Your GitHub username"
      bind:value={usernameInput}
    />
    <button class="primary" type="submit" disabled={!usernameInput.trim() || busy !== ''}>
      {busy === 'fetch' ? 'Fetching…' : 'Get my repos'}
    </button>
  </form>
  <p class="hint">
    Your browser asks GitHub directly for your public repos and their READMEs. GitHub sees the request the same way it sees any visit. Private repos cannot be seen.
  </p>
{:else}
  <p class="muted">
    <a href={`https://github.com/${github.username}`} target="_blank" rel="noopener noreferrer">@{github.username}</a>, fetched {fetchedOn}.
    {shownCount} of {github.repos.length} repos in use.
    {#if github.forksSkipped > 0}{github.forksSkipped} {github.forksSkipped === 1 ? 'fork was' : 'forks were'} left out, since forks are mostly other people's work.{/if}
  </p>
  <p class="hint">
    Untick a repo to keep it off your CVs. Facts marked “GitHub shows” are things GitHub records. Facts marked “your README says” are your own words, which a CV can use but are weaker evidence.
  </p>
{/if}

{#if error}<p class="error" role="alert">{error}</p>{/if}
{#if notice}<p class="notice" role="status">{notice}</p>{/if}

{#if github}
  {#each github.warnings as w, i (i)}<p class="hint warn">{w}</p>{/each}

  <div class="repos">
    {#each github.repos as repo (repo.id)}
      <RepoEntry {repo} edits={saved.edits} onedits={setEdits} />
    {/each}
  </div>

  <form class="add" onsubmit={addRepo}>
    <label for="contributed"><strong>Add a repo you contributed to</strong></label>
    <p class="hint">
      For work in someone else's repo, such as a client or an organisation. It is only added if GitHub lists you as a contributor, and your commit count comes with it.
    </p>
    <div class="row">
      <input id="contributed" class="text" type="text" placeholder="owner/repo" autocapitalize="off" spellcheck="false" bind:value={repoInput} />
      <button type="submit" disabled={!repoInput.trim() || busy !== ''}>{busy === 'add' ? 'Checking…' : 'Add'}</button>
    </div>
  </form>

  <div class="row actions">
    <button onclick={() => fetchAll(github.username)} disabled={busy !== ''}>{busy === 'fetch' ? 'Refreshing…' : 'Refresh from GitHub'}</button>
    <button class="danger" onclick={removeGitHub} disabled={busy !== ''}>Remove GitHub</button>
  </div>
{/if}

<style>
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .row .text {
    flex: 1 1 12rem;
    width: auto;
  }

  .hint {
    margin-top: 0.5rem;
  }

  .notice {
    margin-top: 0.75rem;
    padding: 0.5rem 0.75rem;
    border-left: 3px solid var(--accent);
    background: var(--surface);
  }

  .error {
    margin-top: 0.75rem;
  }

  .repos {
    margin-top: 1rem;
    border-bottom: 1px solid var(--line);
  }

  .add {
    display: grid;
    gap: 0.25rem;
    margin-top: 1.5rem;
  }

  .add .hint {
    margin: 0 0 0.25rem;
  }

  .actions {
    margin-top: 1.25rem;
  }
</style>
