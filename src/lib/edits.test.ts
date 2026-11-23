import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import {
  applyEdits,
  emptyEdits,
  pruneEdits,
  setHidden,
  setText,
  split,
  suggestSplit,
  unsplit,
  viewPoints,
} from './edits'
import { readLinkedInExport } from './linkedin/import'
import { evidenceIndex } from './profile'

const POSITIONS_HEADER = 'Company Name,Title,Description,Location,Started On,Finished On'
const SUMMARY = 'I build data pipelines. I like tidy data! Ask me about SQL. 👋🏻'

function profileWith(positions: string[]) {
  const files = {
    'Profile.csv': `First Name,Headline,Summary\nAda,Data Analyst,"${SUMMARY}"\n`,
    'Positions.csv': [POSITIONS_HEADER, ...positions].join('\n') + '\n',
    'Skills.csv': 'Name\nPython\nSQL\n',
  }
  const zip = zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])))
  return readLinkedInExport(zip).profile
}

const ACME = 'Acme,Analyst,"• Built a dashboard • Cut report time by 40%",Leeds,Apr 2022,'
const profile = profileWith([ACME])
const acme = profile.positions[0]!
const dashboard = acme.points[0]!

describe('hiding', () => {
  it('hides a point and can undo it', () => {
    let edits = setHidden(emptyEdits(), dashboard.id, true)
    expect(viewPoints(acme.points, edits)[0]!.hidden).toBe(true)
    expect(applyEdits(profile, edits).positions[0]!.points.map((p) => p.text)).toEqual(['Cut report time by 40%'])
    edits = setHidden(edits, dashboard.id, false)
    expect(edits.hidden).toEqual([])
  })

  it('hiding a role removes its points from the index too', () => {
    const applied = applyEdits(profile, setHidden(emptyEdits(), acme.id, true))
    expect(applied.positions).toEqual([])
    expect(evidenceIndex(applied).has(dashboard.id)).toBe(false)
  })
})

describe('rewording', () => {
  it('marks the point as edited and gives it a new citable id', () => {
    const [point] = viewPoints(acme.points, emptyEdits())
    const edits = setText(emptyEdits(), point!, 'Built a Power BI dashboard')
    const [after] = viewPoints(acme.points, edits)
    expect(after).toMatchObject({ text: 'Built a Power BI dashboard', original: 'Built a dashboard', edited: true })
    expect(after!.id).not.toBe(dashboard.id)
    expect(after!.baseId).toBe(dashboard.id)

    const applied = evidenceIndex(applyEdits(profile, edits))
    expect(applied.get(after!.id)).toMatchObject({ text: 'Built a Power BI dashboard', edited: true })
    expect(applied.has(dashboard.id)).toBe(false)
  })

  it('clears the edit when the original wording is restored or the text is empty', () => {
    const [point] = viewPoints(acme.points, emptyEdits())
    const edited = setText(emptyEdits(), point!, 'Something else')
    expect(setText(edited, point!, '  Built   a dashboard ').text).toEqual({})
    expect(setText(edited, point!, '   ').text).toEqual({})
  })
})

describe('splitting', () => {
  const summary = profile.summary[0]!

  it('suggests sentence pieces and keeps a trailing emoji with its sentence', () => {
    expect(suggestSplit(SUMMARY)).toEqual(['I build data pipelines.', 'I like tidy data!', 'Ask me about SQL. 👋🏻'])
  })

  it('does not split inside a sentence that just has a lower case word after a stop', () => {
    expect(suggestSplit('Used e.g. pandas daily. Then left.')).toEqual(['Used e.g. pandas daily.', 'Then left.'])
  })

  it('splits where LinkedIn dropped the line break between sentences', () => {
    expect(suggestSplit('Drove measurable results.A hobby of mine is code (github.com/ada).Feel free to say hi.')).toEqual([
      'Drove measurable results.',
      'A hobby of mine is code (github.com/ada).',
      'Feel free to say hi.',
    ])
  })

  it('leaves names like Node.JS and ASP.NET alone', () => {
    expect(suggestSplit('Built APIs in Node.JS and ASP.NET daily.')).toEqual(['Built APIs in Node.JS and ASP.NET daily.'])
  })

  it('turns one point into pieces that keep the original source', () => {
    const edits = split(emptyEdits(), summary.id, summary.text, suggestSplit(summary.text))
    const pieces = viewPoints(profile.summary, edits)
    expect(pieces.map((p) => p.text)).toEqual(['I build data pipelines.', 'I like tidy data!', 'Ask me about SQL. 👋🏻'])
    expect(pieces.every((p) => p.source === 'Profile.csv' && !p.edited && p.splitFrom === summary.id)).toBe(true)
    expect(new Set(pieces.map((p) => p.id)).size).toBe(3)
  })

  it('refuses pieces that are not in the original', () => {
    expect(() => split(emptyEdits(), summary.id, summary.text, ['I build data pipelines.', 'I lead a team of ten.'])).toThrow()
  })

  it('lets each piece be hidden or reworded, and unsplitting clears those', () => {
    let edits = split(emptyEdits(), summary.id, summary.text, suggestSplit(summary.text))
    const [first, second] = viewPoints(profile.summary, edits)
    edits = setHidden(edits, first!.baseId, true)
    edits = setText(edits, second!, 'I really like tidy data!')
    expect(applyEdits(profile, edits).summary.map((p) => p.text)).toEqual(['I really like tidy data!', 'Ask me about SQL. 👋🏻'])

    edits = unsplit(edits, summary.id)
    expect(edits).toEqual(emptyEdits())
  })

  it('drops a whole point edit when the point is split', () => {
    const [whole] = viewPoints(profile.summary, emptyEdits())
    let edits = setHidden(emptyEdits(), summary.id, true)
    edits = setText(edits, whole!, 'Reworded')
    edits = split(edits, summary.id, summary.text, suggestSplit(summary.text))
    expect(edits.hidden).toEqual([])
    expect(edits.text).toEqual({})
  })
})

describe('pruneEdits after a newer export', () => {
  it('keeps changes whose facts survive and drops the rest, with a count', () => {
    const summary = profile.summary[0]!
    let edits = setHidden(emptyEdits(), acme.points[1]!.id, true)
    edits = setHidden(edits, profile.skills[0]!.id, true)
    edits = split(edits, summary.id, summary.text, suggestSplit(summary.text))
    edits = setHidden(edits, viewPoints(profile.summary, edits)[0]!.baseId, true)

    // The newer export adds a role, rewords one Acme bullet, drops Python
    // and changes the summary.
    const newer = {
      ...profileWith(['NewCo,Lead,• Started,Leeds,Jan 2027,', 'Acme,Analyst,"• Built a dashboard • Cut report time by half",Leeds,Apr 2022,']),
      skills: [],
      summary: [{ id: 'summary/zzzzzzz', source: 'Profile.csv', text: 'Different now.' }],
    }
    const { edits: kept, dropped } = pruneEdits(edits, newer)
    // Hidden bullet (reworded on LinkedIn), hidden skill, the split and the
    // hidden piece all go. Nothing survives here, by design.
    expect(dropped).toBe(4)
    expect(kept).toEqual(emptyEdits())
  })

  it('carries a hide over when the fact is unchanged', () => {
    const edits = setHidden(emptyEdits(), dashboard.id, true)
    const newer = profileWith(['NewCo,Lead,• Started,Leeds,Jan 2027,', ACME])
    const { edits: kept, dropped } = pruneEdits(edits, newer)
    expect(dropped).toBe(0)
    expect(applyEdits(newer, kept).positions[1]!.points.map((p) => p.text)).toEqual(['Cut report time by 40%'])
  })
})
