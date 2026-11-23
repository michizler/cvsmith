<!-- One role, degree, project or similar, with a control to hide it. -->
<script lang="ts">
  import type { Snippet } from 'svelte'

  interface Props {
    title: string
    meta?: string
    hidden: boolean
    ontoggle: () => void
    children?: Snippet
  }
  let { title, meta = '', hidden, ontoggle, children }: Props = $props()
</script>

<article class="entry" class:hidden>
  <header>
    <div>
      <h4>{title}</h4>
      {#if meta}<p class="muted">{meta}</p>{/if}
    </div>
    <button class="link" onclick={ontoggle} aria-label={`${hidden ? 'Show' : 'Hide'} ${title}`}>{hidden ? 'Show' : 'Hide'}</button>
  </header>
  {#if hidden}<span class="badge">hidden from CVs, with everything under it</span>{/if}
  {@render children?.()}
</article>

<style>
  .entry {
    padding: 0.9rem 0;
    border-top: 1px solid var(--line);
  }

  header {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    align-items: flex-start;
  }

  h4 {
    margin: 0;
    font-size: 1rem;
  }

  .hidden h4,
  .hidden header p {
    color: var(--muted);
    text-decoration: line-through;
  }
</style>
