<!-- The imported profile, section by section, for the user to check before any CV is written. -->
<script lang="ts">
  import { applyEdits, setHidden, type Edits } from '../lib/edits'
  import { formatYearMonth } from '../lib/linkedin/dates'
  import { evidenceIndex, formatSpan, type Named } from '../lib/profile'
  import { profileOf, type SavedProfile } from '../lib/saved'
  import Contact from './Contact.svelte'
  import Entry from './Entry.svelte'
  import GitHub from './GitHub.svelte'
  import Points from './Points.svelte'

  interface Props {
    saved: SavedProfile
    storedOk: boolean
    notice: string
    onchange: (saved: SavedProfile) => void
    onreimport: () => void
    onforget: () => void
  }
  let { saved, storedOk, notice, onchange, onreimport, onforget }: Props = $props()

  const profile = $derived(profileOf(saved))
  const edits = $derived(saved.edits)
  const inUse = $derived(evidenceIndex(applyEdits(profile, edits)))
  const editedCount = $derived([...inUse.values()].filter((e) => e.edited).length)
  const hiddenCount = $derived(edits.hidden.length)
  const importedOn = $derived(new Date(saved.importedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }))

  const setEdits = (next: Edits) => onchange({ ...saved, edits: next })
  const isHidden = (id: string) => edits.hidden.includes(id)
  const toggle = (id: string) => setEdits(setHidden(edits, id, !isHidden(id)))
  const join = (...parts: string[]) => parts.filter(Boolean).join(', ')

  const chipGroups = $derived(
    [
      { title: 'Skills', items: profile.skills as Named[] },
      { title: 'Languages', items: profile.languages.map((l) => ({ ...l, name: l.proficiency ? `${l.name} (${l.proficiency})` : l.name })) },
      { title: 'Courses', items: profile.courses as Named[] },
    ].filter((g) => g.items.length > 0),
  )
</script>

<section class="summary">
  <p>
    <strong>{inUse.size}</strong> facts your CVs can draw on{#if hiddenCount}, <strong>{hiddenCount}</strong> hidden{/if}{#if editedCount}, <strong>{editedCount}</strong> edited by you{/if}.
  </p>
  <p class="muted">
    Imported {importedOn}.
    {#if storedOk}
      Saved in this browser only.
    {:else}
      <span class="warn">Not saved. This browser is blocking storage, so your changes will be gone when you close the tab.</span>
    {/if}
  </p>
  {#if notice}<p class="notice" role="status">{notice}</p>{/if}

  {#if saved.result.warnings.length > 0}
    <div class="warnings" role="note">
      <p><strong>A few things could not be read</strong></p>
      <ul>
        {#each saved.result.warnings as w, i (i)}<li>{w}</li>{/each}
      </ul>
    </div>
  {/if}

  <details>
    <summary>Which files were read</summary>
    <p class="muted">{saved.result.filesRead.join(', ')}. Nothing else in the zip was opened.</p>
  </details>
</section>

<p class="intro">
  Check everything below. Hide anything you never want on a CV, and reword anything that is out of date. Every line on your CVs will point back to one of these facts.
</p>

<section>
  <h3>Contact details</h3>
  <Contact {saved} onchange={(contact) => onchange({ ...saved, contact })} />
</section>

{#if profile.headline || profile.summary.length > 0}
  <section>
    <h3>About you</h3>
    {#if profile.headline}
      <h4 class="sub">Headline</h4>
      <Points points={[profile.headline]} {edits} onedits={setEdits} canSplit={false} />
    {/if}
    {#if profile.summary.length > 0}
      <h4 class="sub">Summary</h4>
      <Points points={profile.summary} {edits} onedits={setEdits} />
    {/if}
  </section>
{/if}

{#if profile.positions.length > 0}
  <section>
    <h3>Experience</h3>
    {#each profile.positions as x (x.id)}
      <Entry title={x.title} meta={join(x.company, x.location, formatSpan(x.start, x.end, x.current))} hidden={isHidden(x.id)} ontoggle={() => toggle(x.id)}>
        <Points points={x.points} {edits} onedits={setEdits} disabled={isHidden(x.id)} />
      </Entry>
    {/each}
  </section>
{/if}

{#if profile.education.length > 0}
  <section>
    <h3>Education</h3>
    {#each profile.education as x (x.id)}
      <Entry title={x.degree || x.school} meta={join(x.degree ? x.school : '', formatSpan(x.start, x.end))} hidden={isHidden(x.id)} ontoggle={() => toggle(x.id)}>
        <Points points={x.points} {edits} onedits={setEdits} disabled={isHidden(x.id)} />
      </Entry>
    {/each}
  </section>
{/if}

{#if profile.certifications.length > 0}
  <section>
    <h3>Certifications</h3>
    {#each profile.certifications as x (x.id)}
      <Entry
        title={x.name}
        meta={join(x.authority, x.issued ? `issued ${formatYearMonth(x.issued)}` : '', x.expires ? `expires ${formatYearMonth(x.expires)}` : '')}
        hidden={isHidden(x.id)}
        ontoggle={() => toggle(x.id)}
      />
    {/each}
  </section>
{/if}

{#if profile.projects.length > 0}
  <section>
    <h3>Projects</h3>
    {#each profile.projects as x (x.id)}
      <Entry title={x.title} meta={formatSpan(x.start, x.end)} hidden={isHidden(x.id)} ontoggle={() => toggle(x.id)}>
        <Points points={x.points} {edits} onedits={setEdits} disabled={isHidden(x.id)} />
      </Entry>
    {/each}
  </section>
{/if}

<section>
  <h3>GitHub</h3>
  <GitHub {saved} {onchange} />
</section>

{#if profile.volunteering.length > 0}
  <section>
    <h3>Volunteering</h3>
    {#each profile.volunteering as x (x.id)}
      <Entry title={x.role || x.organisation} meta={join(x.role ? x.organisation : '', x.cause, formatSpan(x.start, x.end))} hidden={isHidden(x.id)} ontoggle={() => toggle(x.id)}>
        <Points points={x.points} {edits} onedits={setEdits} disabled={isHidden(x.id)} />
      </Entry>
    {/each}
  </section>
{/if}

{#if profile.honors.length > 0}
  <section>
    <h3>Honours and awards</h3>
    {#each profile.honors as x (x.id)}
      <Entry title={x.title} meta={join(x.issuer, x.issued ? formatYearMonth(x.issued) : '')} hidden={isHidden(x.id)} ontoggle={() => toggle(x.id)}>
        <Points points={x.points} {edits} onedits={setEdits} disabled={isHidden(x.id)} />
      </Entry>
    {/each}
  </section>
{/if}

{#if profile.publications.length > 0}
  <section>
    <h3>Publications</h3>
    {#each profile.publications as x (x.id)}
      <Entry title={x.title} meta={join(x.publisher, x.published ? formatYearMonth(x.published) : '')} hidden={isHidden(x.id)} ontoggle={() => toggle(x.id)}>
        <Points points={x.points} {edits} onedits={setEdits} disabled={isHidden(x.id)} />
      </Entry>
    {/each}
  </section>
{/if}

{#each chipGroups as group (group.title)}
  <section>
    <h3>{group.title}</h3>
    <p class="muted small">Select one to hide it from your CVs.</p>
    <ul class="chips">
      {#each group.items as item (item.id)}
        <li>
          <button class="chip" class:off={isHidden(item.id)} aria-pressed={!isHidden(item.id)} onclick={() => toggle(item.id)}>{item.name}</button>
        </li>
      {/each}
    </ul>
  </section>
{/each}

{#if profile.recommendations.length > 0}
  <section>
    <details>
      <summary><h3 class="inline">Recommendations, for your reference</h3></summary>
      <p class="muted small">These are other people's words about you. They can jog your memory, but a CV line cannot use one as its evidence.</p>
      {#each profile.recommendations as r, i (i)}
        <blockquote>
          <p>{r.text}</p>
          <footer class="muted">{join(r.author, r.authorTitle, r.company, r.date ? formatYearMonth(r.date) : '')}</footer>
        </blockquote>
      {/each}
    </details>
  </section>
{/if}

<section class="actions">
  <button onclick={onreimport}>Import a newer export</button>
  <button class="danger" onclick={onforget}>Remove my data from this browser</button>
</section>

<style>
  section {
    margin-top: 2.25rem;
  }

  .summary {
    display: grid;
    gap: 0.4rem;
    margin-top: 1.5rem;
    padding: 1rem;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--surface);
  }

  .intro {
    margin-top: 1.5rem;
    color: var(--muted);
  }

  h3 {
    margin: 0 0 0.5rem;
    font-size: 1.15rem;
  }

  h3.inline {
    display: inline;
  }

  .sub {
    margin: 1rem 0 0;
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted);
  }

  .warnings {
    padding: 0.75rem 1rem;
    border-left: 3px solid var(--warn);
    background: var(--bg);
  }

  .warnings ul {
    margin: 0.25rem 0 0;
    padding-left: 1.25rem;
  }

  .notice {
    padding: 0.5rem 0.75rem;
    border-left: 3px solid var(--accent);
    background: var(--bg);
  }

  .chips {
    list-style: none;
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin: 0.5rem 0 0;
    padding: 0;
  }

  .chip {
    padding: 0.2rem 0.7rem;
    border-radius: 999px;
    font-size: 0.9rem;
  }

  .chip.off {
    color: var(--muted);
    text-decoration: line-through;
    border-style: dashed;
  }

  blockquote {
    margin: 1rem 0 0;
    padding-left: 1rem;
    border-left: 2px solid var(--line);
  }

  blockquote footer {
    margin-top: 0.25rem;
    font-size: 0.85rem;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    padding-top: 1.5rem;
    border-top: 1px solid var(--line);
  }

  .small {
    font-size: 0.85rem;
  }
</style>
