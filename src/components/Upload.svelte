<!-- Picks the LinkedIn export zip and the contact email choice, then imports. -->
<script lang="ts">
  import { ExportError, looksLikeEmail, readLinkedInExport, type ImportResult } from '../lib/linkedin/import'

  interface Props {
    // True when a profile is already loaded and this would replace it.
    replacing?: boolean
    onimport: (result: ImportResult) => void
    oncancel?: () => void
  }
  let { replacing = false, onimport, oncancel }: Props = $props()

  let file = $state<File | null>(null)
  let emailMode = $state<'export' | 'user'>('export')
  let emailValue = $state('')
  let error = $state('')
  let busy = $state(false)
  let dragging = $state(false)

  const emailLooksWrong = $derived(emailMode === 'user' && emailValue.trim() !== '' && !looksLikeEmail(emailValue))

  function choose(files: FileList | null | undefined) {
    error = ''
    file = files?.[0] ?? null
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault()
    if (!file) return
    busy = true
    error = ''
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const email = emailMode === 'user' ? { from: 'user' as const, value: emailValue } : { from: 'export' as const }
      onimport(readLinkedInExport(bytes, { email }))
    } catch (e) {
      // ExportError messages are written for the user. Anything else is our
      // bug, and the raw message would not help them.
      error =
        e instanceof ExportError
          ? e.message
          : 'Something went wrong reading this file. Please try again, and if it keeps happening, open an issue on GitHub.'
    } finally {
      busy = false
    }
  }
</script>

<form class="upload" onsubmit={submit}>
  <h2>{replacing ? 'Import a newer export' : 'Bring your LinkedIn profile'}</h2>
  {#if replacing}
    <p class="muted">
      Your hidden facts and edits carry over wherever the fact is still the same on LinkedIn. We will tell you if any no longer match.
    </p>
  {/if}

  <label
    class="drop"
    class:dragging
    class:chosen={file}
    ondragover={(e) => {
      e.preventDefault()
      dragging = true
    }}
    ondragleave={() => (dragging = false)}
    ondrop={(e) => {
      e.preventDefault()
      dragging = false
      choose(e.dataTransfer?.files)
    }}
  >
    <input type="file" accept=".zip,application/zip" onchange={(e) => choose(e.currentTarget.files)} />
    {#if file}
      <strong>{file.name}</strong>
      <span class="muted">Choose a different file</span>
    {:else}
      <strong>Drop your LinkedIn data export here</strong>
      <span class="muted">or click to choose the zip file</span>
    {/if}
  </label>

  {#if !replacing}
    <details class="howto">
      <summary>How do I get my LinkedIn data export?</summary>
      <ol>
        <li>On LinkedIn, open Settings and Privacy, then Data privacy.</li>
        <li>Choose Get a copy of your data and request the archive. Asking for particular data rather than everything is quicker.</li>
        <li>LinkedIn emails you when it is ready. Download the zip and bring it here without unzipping it.</li>
      </ol>
    </details>
  {/if}

  <fieldset>
    <legend>Email for your CVs</legend>
    <label class="radio">
      <input type="radio" name="email" value="export" bind:group={emailMode} />
      Use my LinkedIn email
    </label>
    <label class="radio">
      <input type="radio" name="email" value="user" bind:group={emailMode} />
      Use this email
    </label>
    {#if emailMode === 'user'}
      <input
        class="text"
        type="email"
        autocomplete="email"
        placeholder="you@example.com"
        aria-label="Email for your CVs"
        aria-invalid={emailLooksWrong}
        bind:value={emailValue}
      />
      {#if emailLooksWrong}
        <p class="hint warn">That does not look like an email address yet.</p>
      {:else}
        <p class="hint">Your LinkedIn email addresses will not be read at all.</p>
      {/if}
    {/if}
  </fieldset>

  {#if error}
    <p class="error" role="alert">{error}</p>
  {/if}

  <div class="actions">
    <button class="primary" type="submit" disabled={!file || busy}>{busy ? 'Reading…' : 'Import'}</button>
    {#if oncancel}
      <button type="button" onclick={oncancel}>Cancel</button>
    {/if}
  </div>

  <p class="hint">
    The file is read in this browser. Only your profile files are opened. Your messages, connections and phone numbers are left untouched, and nothing is uploaded anywhere.
  </p>
</form>

<style>
  .upload {
    display: grid;
    gap: 1rem;
  }

  .drop {
    position: relative;
    display: grid;
    gap: 0.25rem;
    justify-items: center;
    padding: 2rem 1rem;
    border: 2px dashed var(--line);
    border-radius: var(--radius);
    background: var(--surface);
    text-align: center;
    cursor: pointer;
  }

  .drop:hover,
  .drop.dragging,
  .drop:focus-within {
    border-color: var(--accent);
  }

  .drop.chosen {
    border-style: solid;
  }

  .drop input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }

  .howto ol {
    margin: 0.5rem 0 0;
    padding-left: 1.25rem;
    color: var(--muted);
  }

  fieldset {
    display: grid;
    gap: 0.4rem;
    margin: 0;
    padding: 0.75rem 1rem 1rem;
    border: 1px solid var(--line);
    border-radius: var(--radius);
  }

  legend {
    padding: 0 0.25rem;
    font-weight: 600;
  }

  .radio {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
  }
</style>
