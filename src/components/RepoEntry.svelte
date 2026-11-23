<!-- One GitHub repo on the review screen, folded shut until opened. -->
<script lang="ts">
  import { setHidden, type Edits } from '../lib/edits'
  import { formatSpan, type Repo } from '../lib/profile'
  import Points from './Points.svelte'

  interface Props {
    repo: Repo
    edits: Edits
    onedits: (edits: Edits) => void
  }
  let { repo, edits, onedits }: Props = $props()

  const hidden = $derived(edits.hidden.includes(repo.id))
  const factCount = $derived(repo.description.length + repo.observed.length + repo.readme.length)
  const meta = $derived(
    [
      repo.relation === 'contributor' ? 'contributor' : '',
      formatSpan(repo.created, repo.lastPush) ? `active ${formatSpan(repo.created, repo.lastPush)}` : '',
      repo.archived ? 'archived' : '',
    ]
      .filter(Boolean)
      .join(', '),
  )
</script>

<article class="repo" class:hidden>
  <label class="use">
    <input type="checkbox" checked={!hidden} onchange={() => onedits(setHidden(edits, repo.id, !hidden))} />
    <span class="sr">Use {repo.fullName} on CVs</span>
  </label>
  <div class="body">
    <h4><a href={repo.url} target="_blank" rel="noopener noreferrer">{repo.fullName}</a></h4>
    {#if meta}<p class="muted small">{meta}</p>{/if}
    {#if !hidden && factCount > 0}
      <details>
        <summary class="small">{factCount} {factCount === 1 ? 'fact' : 'facts'}</summary>
        <Points points={repo.description} {edits} {onedits} label="your repo description says" />
        <Points points={repo.observed} {edits} {onedits} label="GitHub shows" canEdit={false} />
        <Points points={repo.readme} {edits} {onedits} label="your README says" />
        {#if repo.homepage}
          <p class="small">Live site <a href={repo.homepage} target="_blank" rel="noopener noreferrer">{repo.homepage.replace(/^https?:\/\//, '')}</a></p>
        {/if}
      </details>
    {:else if !hidden}
      <p class="muted small">No description, topics or README to draw on.</p>
    {/if}
  </div>
</article>

<style>
  .repo {
    display: grid;
    grid-template-columns: 1.5rem 1fr;
    gap: 0.5rem;
    padding: 0.7rem 0;
    border-top: 1px solid var(--line);
  }

  .use {
    padding-top: 0.2rem;
  }

  .use input {
    width: 1.1rem;
    height: 1.1rem;
    accent-color: var(--accent);
  }

  .body {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  h4 {
    margin: 0;
    font-size: 1rem;
  }

  .hidden h4 a {
    color: var(--muted);
    text-decoration: line-through;
  }

  .small {
    font-size: 0.85rem;
  }

  details {
    margin-top: 0.25rem;
  }

  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
