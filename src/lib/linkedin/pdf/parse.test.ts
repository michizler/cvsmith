import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { evidenceIndex } from '../../profile'
import { readLinkedInExport } from '../import'
import type { TextLine } from './lines'
import { joinWrapped, parseProfileLines } from './parse'

// A made up person laid out the way LinkedIn's PDF is. Sizes, gaps and the
// sidebar copy a real profile PDF.
const side = (page: number, y: number, size: number, text: string): TextLine => ({ page, column: 'side', x: 22, y, size, text })
const main = (page: number, y: number, size: number, text: string): TextLine => ({ page, column: 'main', x: 224, y, size, text })

const LINES: TextLine[] = [
  side(1, 738, 13, 'Contact'),
  side(1, 718, 10.5, '07700 900123 (Mobile)'),
  side(1, 706, 10.5, 'ada.example@exam'),
  side(1, 693, 10.5, 'ple.com'),
  side(1, 669, 11, 'www.linkedin.com/in/ada-example'),
  side(1, 654, 11, '(LinkedIn)'),
  side(1, 641, 11, 'ada.example.dev (Personal)'),
  side(1, 606, 13, 'Top Skills'),
  side(1, 586, 10.5, 'Python'),
  side(1, 569, 10.5, 'SQL'),
  side(1, 516, 13, 'Languages'),
  side(1, 497, 10.5, 'English (Native or Bilingual)'),
  side(1, 445, 13, 'Certifications'),
  side(1, 425, 10.5, 'Google Data Analytics:'),
  side(1, 413, 10.5, 'Professional Certificate'),
  side(1, 395, 10.5, 'PL-300'),

  main(1, 726, 26, 'Ada Example'),
  main(1, 705, 12, 'Data Analyst | SQL and'),
  main(1, 691, 12, 'Python'),
  main(1, 675, 12, 'Leeds, England'),
  main(1, 638, 15.8, 'Summary'),
  main(1, 612, 12, 'Analyst who likes tidy'),
  main(1, 594, 12, 'data.'),
  main(1, 560, 15.8, 'Experience'),
  main(1, 530, 12, 'Acme Health'),
  main(1, 514, 11.5, 'Data Analyst'),
  main(1, 499, 10.5, 'April 2022 - Present (4 years)'),
  main(1, 484, 10.5, 'Leeds, England'),
  main(1, 462, 10.5, '• Built a dashboard in Power BI for weekly human-'),
  main(1, 444, 10.5, 'resources reporting.'),
  main(1, 408, 10.5, '• Cut report time by 40%.'),
  main(1, 14, 9, 'Page 1 of 2'),

  main(2, 737, 12, 'AIESEC'),
  main(2, 721, 10.5, '3 years 1 month'),
  main(2, 705, 11.5, 'Team Lead'),
  main(2, 690, 10.5, 'February 2023 - February 2024 (1 year 1 month)'),
  main(2, 675, 10.5, 'Lagos, Nigeria'),
  main(2, 653, 10.5, '• Led a team of 6 - mostly new joiners'),
  main(2, 620, 11.5, 'Volunteer'),
  main(2, 605, 10.5, 'August 2022 - February 2023 (7 months)'),
  main(2, 583, 10.5, 'Ran weekly reports'),
  main(2, 540, 15.8, 'Education'),
  main(2, 510, 12, 'University of Somewhere'),
  main(2, 493, 10.5, 'Bachelor of Science - BSc, Mathematics · (2016 -'),
  main(2, 478, 10.5, '2020)'),
  main(2, 450, 12, 'Some College'),
  main(2, 433, 10.5, '· (2010 - 2016)'),
  main(2, 400, 15.8, 'Honors-Awards'),
  main(2, 380, 10.5, "Dean's List"),
  main(2, 14, 9, 'Page 2 of 2'),
]

describe('joinWrapped', () => {
  it('joins a word broken by a hyphen but keeps a spaced dash', () => {
    expect(joinWrapped(['weekly human-', 'resources'])).toBe('weekly human-resources')
    expect(joinWrapped(['data science -', 'specialising'])).toBe('data science - specialising')
    expect(joinWrapped(['Data Analysts, UI/', 'UX Designers'])).toBe('Data Analysts, UI/UX Designers')
    expect(joinWrapped(['ends with a hyphen-', '• New bullet'])).toBe('ends with a hyphen- • New bullet')
  })
})

describe('parseProfileLines', () => {
  const result = parseProfileLines(LINES)
  const p = result.profile

  it('reads the header and summary', () => {
    expect([p.firstName, p.lastName]).toEqual(['Ada', 'Example'])
    expect(p.headline?.text).toBe('Data Analyst | SQL and Python')
    expect(p.location).toBe('Leeds, England')
    expect(p.summary.map((s) => s.text)).toEqual(['Analyst who likes tidy data.'])
    expect(result.format).toBe('pdf')
    expect(result.filesRead).toEqual(['Profile.pdf'])
  })

  it('reads roles, including several under one company', () => {
    expect(p.positions.map((x) => [x.company, x.title, x.location, x.current])).toEqual([
      ['Acme Health', 'Data Analyst', 'Leeds, England', true],
      ['AIESEC', 'Team Lead', 'Lagos, Nigeria', false],
      ['AIESEC', 'Volunteer', '', false],
    ])
    const [acme, lead, volunteer] = p.positions
    expect(acme!.start).toEqual({ year: 2022, month: 4 })
    expect(acme!.end).toBeNull()
    expect(acme!.points.map((x) => x.text)).toEqual([
      'Built a dashboard in Power BI for weekly human-resources reporting.',
      'Cut report time by 40%.',
    ])
    expect(lead!.end).toEqual({ year: 2024, month: 2 })
    expect(lead!.points.map((x) => x.text)).toEqual(['Led a team of 6 - mostly new joiners'])
    // Too far below the dates to be a location, so it is description.
    expect(volunteer!.points.map((x) => x.text)).toEqual(['Ran weekly reports'])
  })

  it('reads education with wrapped dates and a missing degree', () => {
    expect(p.education.map((e) => [e.school, e.degree, e.start, e.end])).toEqual([
      ['University of Somewhere', 'Bachelor of Science - BSc, Mathematics', { year: 2016, month: null }, { year: 2020, month: null }],
      ['Some College', '', { year: 2010, month: null }, { year: 2016, month: null }],
    ])
  })

  it('reads the sidebar and never the phone number', () => {
    expect(p.email).toBe('ada.example@example.com')
    expect(result.emailFrom).toBe('export')
    expect(p.websites).toEqual([{ label: 'personal', url: 'https://ada.example.dev' }])
    expect(p.skills.map((s) => s.name)).toEqual(['Python', 'SQL'])
    expect(p.languages).toMatchObject([{ name: 'English', proficiency: 'Native or Bilingual' }])
    expect(p.certifications.map((c) => c.name)).toEqual(['Google Data Analytics: Professional Certificate', 'PL-300'])
    expect(JSON.stringify(result)).not.toMatch(/07700|900123/)
  })

  it('says which sections it skipped', () => {
    expect(result.warnings).toEqual(['The "Honors-Awards" section of the PDF is not read yet. The data export zip includes it.'])
  })

  it('uses a typed email instead, when asked', () => {
    const typed = parseProfileLines(LINES, { email: { from: 'user', value: 'cv@ada.example' } })
    expect(typed.profile.email).toBe('cv@ada.example')
    expect(typed.emailFrom).toBe('user')
  })

  it('gives the same ids as the data export for the same facts', () => {
    const files = {
      'Profile.csv': 'First Name,Headline\nAda,Data Analyst | SQL and Python\n',
      'Positions.csv':
        'Company Name,Title,Description,Location,Started On,Finished On\n' +
        'Acme Health,Data Analyst,"• Built a dashboard in Power BI for weekly human-resources reporting.  • Cut report time by 40%.","Leeds, England",Apr 2022,\n',
      'Skills.csv': 'Name\nPython\n',
    }
    const zip = zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])))
    const fromZip = evidenceIndex(readLinkedInExport(zip).profile)
    const acme = p.positions[0]!
    for (const id of [acme.id, ...acme.points.map((x) => x.id), p.headline!.id, p.skills[0]!.id]) {
      expect(fromZip.has(id), id).toBe(true)
    }
  })

  it('refuses a PDF in another language', () => {
    const spanish = LINES.map((l) => ({
      ...l,
      text: l.text === 'Experience' ? 'Experiencia' : l.text === 'Education' ? 'Educación' : l.text === 'Summary' ? 'Extracto' : l.text,
    }))
    expect(() => parseProfileLines(spanish)).toThrow(/saved in English/)
  })

  it('refuses a layout it does not recognise', () => {
    const flat = LINES.map((l) => ({ ...l, size: l.text === 'Experience' || l.text === 'Summary' || l.text === 'Education' ? 30 : l.size }))
    expect(() => parseProfileLines(flat)).toThrow(/layout is not one we recognise/)
  })
})
