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

## 6. Only the profile files are unpacked

*November 2026*

A LinkedIn data export holds far more than a profile. It has private messages, connections, phone numbers and payment receipts. cvsmith reads thirteen named files from the zip and leaves everything else compressed and untouched. The list is `PROFILE_FILES` in `src/lib/linkedin/import.ts`.

Birth date, postal address, postcode and maiden name sit in Profile.csv alongside the useful fields. They are skipped too. A CV does not need them.

The contact email is the user's choice at upload. cvsmith can take the primary address from the export, or the user can type the one they want on their CVs. If they type one, the export's email file is not opened. Phone numbers are never read from the export.

Honors.csv and Publications.csv are read, but their column names come from other open source importers rather than a real export we have seen, and those importers do not fully agree. Columns are matched by name, every spelling they use is accepted, and a file with none of the expected columns is skipped with a warning instead of being read wrongly. The same goes for the other names the volunteering file has had. When someone shares a real example, the list can be tightened.

## 7. Recommendations are context, not evidence

*November 2026*

Recommendations are someone else's words about the user. They can help the user remember what they did, so they are shown. A CV line cannot cite one, because the rule in decision 3 is about what the user did, and a recommendation is an opinion about it.

Recommendations the user hid on LinkedIn are left out.

## 8. The user's changes sit on top of the import

*November 2026*

On the review screen the user can hide any fact, reword a point and split a long paragraph into separate points. These changes are stored apart from the import and keyed by evidence id, so importing a newer export keeps every change whose fact is still the same. Changes to facts that have since changed on LinkedIn are dropped, and the user is told how many.

A reworded point is marked "edited by you" everywhere it appears and gets a new evidence id. A CV written before the edit then no longer matches and has to be checked again. Split pieces must be exact pieces of the original text, so a split can never add a claim.

Roles, degrees and other entries can be hidden but not edited here. Their titles, employers and dates are what the strict fact check matches against, so they stay as LinkedIn has them. Adding facts that are not on LinkedIn at all is planned for later.

Everything is saved in the browser's local storage by default, with a button to remove it.

## 9. GitHub without signing in

*November 2026*

The user types their GitHub username and the browser asks GitHub directly. There is no sign in and no token, which keeps setup to one box. The cost is GitHub's limit of 60 lookups an hour per network. One lookup lists up to 100 repos, and READMEs come from raw.githubusercontent.com, which does not count towards the limit. The app keeps five lookups in reserve and says how many are left.

Forks are left out, because they are mostly other people's work.

GitHub facts come in two kinds and are labelled as such. "GitHub shows" covers what GitHub itself records, such as a repo's main language, its topics and a commit count. These can be hidden but not reworded. "Your README says" covers text the user wrote, which can claim more than the code shows. Both can be cited, but the CV writer will prefer what GitHub shows when either would do.

README sections about installing, running, licensing or contributing are skipped, since they describe how to use the project rather than what the author did.

Work in someone else's repo can be added by name. It is only accepted if GitHub lists the user as a contributor, and the commit count is recorded as a GitHub fact. Membership of an organisation is not enough. Private repos cannot be seen at all.

The per-repo language breakdown is not fetched. It costs one lookup per repo, and for notebook projects it mostly repeats "Jupyter Notebook".
