<script lang="ts">
  import Review from './components/Review.svelte'
  import Upload from './components/Upload.svelte'
  import type { ImportResult } from './lib/linkedin/import'
  import { forgetSaved, fresh, loadSaved, replaceImport, storeSaved, type SavedProfile } from './lib/saved'

  const steps = [
    { title: 'Bring your profile', body: 'Upload your LinkedIn data export and add your GitHub username.' },
    { title: 'Paste the job ads', body: 'One ad or twenty. Each one gets its own CV.' },
    { title: 'Check and download', body: 'Every line points back to your profile. Anything the ad wants that you do not have goes in the gap report, not on the CV.' },
  ]

  // Replaced whole on every change rather than mutated, so raw state is
  // enough and saving never sees a proxy.
  let saved = $state.raw<SavedProfile | null>(loadSaved())
  let storedOk = $state(true)
  let reimporting = $state(false)
  let notice = $state('')

  function commit(next: SavedProfile) {
    saved = next
    storedOk = storeSaved(next)
  }

  function imported(result: ImportResult) {
    if (!saved) {
      notice = ''
      commit(fresh(result))
      return
    }
    const { saved: next, dropped } = replaceImport(saved, result)
    notice =
      dropped === 0
        ? 'Updated from your newer export. All your changes carried over.'
        : `Updated from your newer export. ${dropped} of your changes were to facts that have since changed on LinkedIn, so they no longer apply.`
    reimporting = false
    commit(next)
    window.scrollTo({ top: 0 })
  }

  function forget() {
    if (!window.confirm('Remove your profile and all your changes from this browser? This cannot be undone.')) return
    forgetSaved()
    saved = null
    notice = ''
    reimporting = false
  }
</script>

<main class:wide={saved}>
  <header>
    <h1>cvsmith</h1>
    {#if saved}
      <p class="lede">Your profile, as cvsmith will use it.</p>
    {:else}
      <p class="lede">A tailored CV for every job ad, built only from what you have actually done.</p>
    {/if}
  </header>

  {#if !saved}
    <ol class="steps">
      {#each steps as step, i (step.title)}
        <li>
          <span class="num">{i + 1}</span>
          <div>
            <h2>{step.title}</h2>
            <p>{step.body}</p>
          </div>
        </li>
      {/each}
    </ol>

    <Upload onimport={imported} />

    <p class="note">
      Your profile, your job ads and your API key stay in this browser. Nothing is sent to a cvsmith server, because there isn't one.
    </p>
  {:else if reimporting}
    <div class="panel">
      <Upload replacing onimport={imported} oncancel={() => (reimporting = false)} />
    </div>
  {:else}
    <Review
      {saved}
      {storedOk}
      {notice}
      onchange={commit}
      onreimport={() => {
        notice = ''
        reimporting = true
      }}
      onforget={forget}
    />
  {/if}
</main>
