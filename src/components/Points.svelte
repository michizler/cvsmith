<!-- The points under a fact, with hide, reword and split controls on each. -->
<script lang="ts">
  import { setHidden, setText, split, suggestSplit, unsplit, viewPoints, type Edits, type PointView } from '../lib/edits'
  import type { Evidence } from '../lib/profile'

  interface Props {
    points: Evidence[]
    edits: Edits
    onedits: (edits: Edits) => void
    // The headline is one line on a CV, so splitting it makes no sense.
    canSplit?: boolean
    // Points of a hidden role are shown dimmed and cannot be changed.
    disabled?: boolean
    // Facts GitHub records, like a repo's language, can be hidden but not
    // reworded. Rewording them would turn a record into a claim.
    canEdit?: boolean
    // Says where these points come from, such as "your README says".
    label?: string
  }
  let { points, edits, onedits, canSplit = true, disabled = false, canEdit = true, label = '' }: Props = $props()

  // Long enough that splitting is worth offering. Shorter points are almost
  // always one claim already.
  const SPLIT_FROM_CHARS = 160

  const views = $derived(viewPoints(points, edits))
  let editing = $state<string | null>(null)
  let draft = $state('')
  let splitting = $state<string | null>(null)

  function startEdit(p: PointView) {
    splitting = null
    editing = p.baseId
    draft = p.text
  }

  function saveEdit(p: PointView) {
    onedits(setText(edits, p, draft))
    editing = null
  }

  function splittable(p: PointView): string[] | null {
    if (!canSplit || !canEdit || p.splitFrom || p.edited || p.text.length < SPLIT_FROM_CHARS) return null
    const pieces = suggestSplit(p.text)
    return pieces.length > 1 ? pieces : null
  }
</script>

{#if views.length > 0}
  <ul class="points">
    {#each views as p, i (p.baseId)}
      {@const pieces = splittable(p)}
      <li class:hidden={p.hidden || disabled}>
        {#if editing === p.baseId}
          <textarea bind:value={draft} rows={Math.min(8, Math.ceil(draft.length / 70) + 1)} aria-label="Reword this point"></textarea>
          {#if p.edited || draft.trim() !== p.original}
            <p class="hint">On LinkedIn it says “{p.original}”</p>
          {/if}
          <div class="row">
            <button class="primary small" onclick={() => saveEdit(p)} disabled={!draft.trim()}>Save</button>
            <button class="small" onclick={() => (editing = null)}>Cancel</button>
            {#if p.edited}
              <button class="small" onclick={() => { draft = p.original; saveEdit(p) }}>Use the LinkedIn wording</button>
            {/if}
          </div>
        {:else if splitting === p.baseId && pieces}
          <p class="hint">Split into these {pieces.length} points?</p>
          <ol class="preview">
            {#each pieces as piece, n (n)}<li>{piece}</li>{/each}
          </ol>
          <div class="row">
            <button class="primary small" onclick={() => { onedits(split(edits, p.baseId, p.text, pieces)); splitting = null }}>Split</button>
            <button class="small" onclick={() => (splitting = null)}>Cancel</button>
          </div>
        {:else}
          <p>{p.text}</p>
          <div class="row">
            {#if label}<span class="badge source">{label}</span>{/if}
            {#if p.edited}<span class="badge">edited by you</span>{/if}
            {#if p.hidden}<span class="badge">hidden from CVs</span>{/if}
            {#if !disabled}
              <button class="link" onclick={() => onedits(setHidden(edits, p.baseId, !p.hidden))}>{p.hidden ? 'Show' : 'Hide'}</button>
              {#if !p.hidden && canEdit}
                <button class="link" onclick={() => startEdit(p)}>Reword</button>
              {/if}
              {#if pieces && !p.hidden}
                <button class="link" onclick={() => { editing = null; splitting = p.baseId }}>Split into points</button>
              {/if}
              {#if p.splitFrom && views[i - 1]?.splitFrom !== p.splitFrom}
                <button class="link" onclick={() => onedits(unsplit(edits, p.splitFrom!))}>Undo split</button>
              {/if}
            {/if}
          </div>
        {/if}
      </li>
    {/each}
  </ul>
{/if}

<style>
  .points {
    list-style: none;
    margin: 0.5rem 0 0;
    padding: 0;
    display: grid;
    gap: 0.6rem;
  }

  .points > li {
    /* Grid items will not shrink below their content by default, and a bare
       URL in a point is one very long word. */
    min-width: 0;
    overflow-wrap: anywhere;
    padding-left: 0.85rem;
    border-left: 2px solid var(--line);
  }

  .points > li.hidden p {
    color: var(--muted);
    text-decoration: line-through;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 0.75rem;
    align-items: center;
    margin-top: 0.15rem;
  }

  textarea {
    width: 100%;
    font: inherit;
    padding: 0.5rem;
    border: 1px solid var(--accent);
    border-radius: var(--radius);
    background: var(--bg);
    color: var(--fg);
    resize: vertical;
  }

  .badge.source {
    border-style: dashed;
  }

  .preview {
    margin: 0.25rem 0;
    padding-left: 1.25rem;
  }
</style>
