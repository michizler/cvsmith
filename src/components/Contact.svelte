<!-- Contact details for the top of every CV. Not evidence, so freely editable. -->
<script lang="ts">
  import { looksLikeEmail } from '../lib/linkedin/import'
  import { contactOf, type Contact, type SavedProfile } from '../lib/saved'

  interface Props {
    saved: SavedProfile
    onchange: (contact: Partial<Contact>) => void
  }
  let { saved, onchange }: Props = $props()

  const current = $derived(contactOf(saved))
  const profile = $derived(saved.result.profile)

  // What each field would be with no change from the user. Typing it back
  // in removes the override, so a newer export can update it again.
  const imported = $derived<Contact>({
    firstName: profile.firstName,
    lastName: profile.lastName,
    email: profile.email,
    phone: '',
    location: profile.location,
  })

  function set(field: keyof Contact, value: string) {
    const clean = value.trim()
    const { [field]: _, ...rest } = saved.contact
    onchange(clean === imported[field] ? rest : { ...rest, [field]: clean })
  }

  const fields: { key: keyof Contact; label: string; type: string; autocomplete: AutoFill }[] = [
    { key: 'firstName', label: 'First name', type: 'text', autocomplete: 'given-name' },
    { key: 'lastName', label: 'Last name', type: 'text', autocomplete: 'family-name' },
    { key: 'email', label: 'Email', type: 'email', autocomplete: 'email' },
    { key: 'phone', label: 'Phone (optional)', type: 'tel', autocomplete: 'tel' },
    { key: 'location', label: 'Location', type: 'text', autocomplete: 'address-level2' },
  ]

  const emailNote = $derived(
    current.emailFrom === 'export' ? 'From your LinkedIn export' : current.emailFrom === 'user' ? 'Typed by you' : '',
  )
</script>

<div class="grid">
  {#each fields as f (f.key)}
    <label>
      <span>{f.label}</span>
      <input
        class="text"
        type={f.type}
        autocomplete={f.autocomplete}
        value={current[f.key]}
        aria-invalid={f.key === 'email' && current.email !== '' && !looksLikeEmail(current.email)}
        onchange={(e) => set(f.key, e.currentTarget.value)}
      />
      {#if f.key === 'email' && emailNote}<small class="muted">{emailNote}</small>{/if}
      {#if f.key === 'phone'}<small class="muted">Never read from your export. Only what you type here.</small>{/if}
    </label>
  {/each}
</div>

{#if profile.websites.length > 0}
  <p class="sites">
    {#each profile.websites as site (site.url)}
      <a href={site.url} rel="noopener noreferrer" target="_blank">{site.url.replace(/^https?:\/\//, '')}</a>
    {/each}
  </p>
{/if}

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
    gap: 0.75rem 1rem;
  }

  label {
    display: grid;
    align-content: start;
    gap: 0.2rem;
  }

  label span {
    font-size: 0.85rem;
    font-weight: 600;
  }

  .sites {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1rem;
    margin-top: 0.75rem;
  }
</style>
