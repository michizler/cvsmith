# Decisions

Why cvsmith is built the way it is. Newest at the bottom. If you want to change one of these, open an issue first and say what changed.

## 1. LinkedIn comes in as the user's own export

*November 2026*

LinkedIn's API gives outside apps a name, an email address and a photo. It does not give work history. Its user agreement also forbids scraping, and LinkedIn has gone to court over it before.

So the user downloads their own data and uploads it. The data export zip is preferred because its files are tidy and named. The profile "Save to PDF" file is also accepted because it is instant, though harder to read reliably.

## 2. No server

*November 2026*

The user brings the model, either Ollama on their own machine or their own API key. Once nothing needs paying for centrally, nothing needs to run centrally either. Reading the export, calling GitHub, tailoring, checking and making the files all happen in the browser.

This means no hosting bill, no database of other people's CVs to protect, and nothing to fall over when traffic spikes. The app is a static site.

The cost is that all the logic is TypeScript running in the browser rather than Python on a server.

## 3. Every line traces back to the profile

*November 2026*

A CV line is only allowed if it can be traced to something in the user's profile. Checking happens in two layers. A strict code check catches numbers, tools, employers and job titles that do not appear in the source. A model check then reads each line against the evidence it cites.

Anything the ad asks for that the profile cannot support goes in the gap report.

This is the product. If the check is not reliable, nothing else matters, so it is measured on real job ads before anyone else uses the tool.

## 4. Svelte, Vite and TypeScript

*November 2026*

The app has real state, with a profile being edited, a list of ads and a set of results per ad. Doing that with hand-written DOM code gets messy quickly. Svelte compiles away, so the bundle stays small, and its components read close to plain HTML, which helps people who want to contribute.

Versions are pinned exactly. Bump them on purpose and test before you do.

## 5. Outputs in the first version

*November 2026*

Each job ad gets a tailored CV, a match summary and a gap report. Cover letters can come later and will go through the same check.
