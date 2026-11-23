# cvsmith

A tailored CV for every job ad, built only from what you have actually done.

You bring your LinkedIn data export and your GitHub username. You paste in the job ads you want to apply for. cvsmith writes one CV per ad, a short note on how well you match, and a gap report listing what the ad asks for that your profile does not show.

It is free and open source. It has no server, so your profile, your job ads and your API key never leave your browser.

## Status

Early. You can import your LinkedIn data export and your public GitHub repos, then check, hide, reword and split what was found. Reading the LinkedIn profile PDF comes next. See [docs/DECISIONS.md](docs/DECISIONS.md) for how it is being built and why.

## The one rule

Every line on a cvsmith CV must trace back to something in your profile. If a job ad asks for a skill you have no evidence of, cvsmith tells you in the gap report. It does not quietly add it to your CV.

Plenty of CV tools will invent experience for you. Recruiters notice, and so do interviewers. This one won't.

## How the AI part works

cvsmith does not pay for anyone's AI use, so you bring your own model. There are two ways to do that.

**Your own Ollama.** Run a model on your own computer with [Ollama](https://ollama.com). It is free and fully private. It is slower, and smaller models are less careful, so check the fact report.

**Your own API key.** Paste a key from an AI provider. The browser talks to the provider directly. The key is kept in this browser only, and you can clear it at any time.

## Why not just a LinkedIn link?

LinkedIn does not let outside apps read your work history, and its terms forbid scraping. Downloading your own data takes a minute from your LinkedIn settings, and it is yours to use.

## Running it locally

You need Node 22.12 or newer.

```sh
npm install
npm run dev
```

Other commands are `npm test`, `npm run check` for type checks and `npm run build` for a production build.

## Licence

MIT. See [LICENSE](LICENSE).
