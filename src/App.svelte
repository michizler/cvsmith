<script lang="ts">
  const steps = [
    { title: 'Bring your profile', body: 'Upload your LinkedIn data export and add your GitHub username.' },
    { title: 'Paste the job ads', body: 'One ad or twenty. Each one gets its own CV.' },
    { title: 'Check and download', body: 'Every line points back to your profile. Anything the ad wants that you do not have goes in the gap report, not on the CV.' },
  ]
</script>

<main>
  <header>
    <h1>cvsmith</h1>
    <p class="lede">A tailored CV for every job ad, built only from what you have actually done.</p>
  </header>

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

  <p class="note">
    Your profile, your job ads and your API key stay in this browser. Nothing is sent to a cvsmith server, because there isn't one.
  </p>

  <p class="status">Early build. Profile import comes next.</p>
</main>
