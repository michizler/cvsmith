import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { evidenceIndex } from '../profile'
import { ExportError, isProfileFile, looksLikeEmail, readLinkedInExport } from './import'

// A made up person, laid out the way a real export is. Columns, date formats
// and the flattened bullets all copy what LinkedIn produces.
const FIXTURE: Record<string, string> = {
  'Profile.csv':
    'First Name,Last Name,Maiden Name,Address,Birth Date,Headline,Summary,Industry,Zip Code,Geo Location,Twitter Handles,Websites,Instant Messengers\n' +
    'Ada,Example,Byron,"1 Some Street, Town",Dec 10,Data Analyst | SQL and Python,"Analyst who likes tidy data. 👋🏻",Analytics,M1 1AA,"Manchester, England",,[PERSONAL:https://ada.example],\n',
  'Positions.csv':
    'Company Name,Title,Description,Location,Started On,Finished On\n' +
    'Acme Health,Data Analyst,"• Built a dashboard in Power BI.  • Cut report time by 40%. ● Trained 5 staff","Leeds, England",Apr 2022,\n' +
    'Beta Ltd,Junior Analyst,Ran weekly reports.,Remote,Oct 2020,Mar 2022\n',
  'Education.csv':
    'School Name,Start Date,End Date,Notes,Degree Name,Activities\n' +
    'University of Somewhere,2016,2020,Dissertation on hospital waiting lists,BSc Mathematics,Chess club\n',
  'Skills.csv': 'Name\nPython\nSQL\nPython\n',
  'Certifications.csv':
    'Name,Url,Authority,Started On,Finished On,License Number\n' +
    'PL-300 Power BI Data Analyst,https://learn.example/cert,Microsoft,Jun 2025,,ABC123\n',
  'Projects.csv':
    'Title,Description,Url,Started On,Finished On\n' +
    'Waiting list model,"• Forecast demand • Wrote it up",,Jan 2026,Mar 2026\n',
  'Volunteering.csv':
    'Company Name,Role,Cause,Started On,Finished On,Description\n' +
    'Code Club,Volunteer tutor,Education,Jun 2022,Jun 2022,Taught Scratch to children.\n',
  'Languages.csv': 'Name,Proficiency\nEnglish,Native or bilingual proficiency\n',
  'Courses.csv': 'Name,Number\nMachine Learning,\n',
  'Recommendations_Received.csv':
    'First Name,Last Name,Company,Job Title,Text,Creation Date,Status\n' +
    'Sam,Lee,Acme Health,Head of Data,"Ada is great, and fast.","03/16/25, 12:21 PM",VISIBLE\n' +
    'Kim,Ray,Beta Ltd,Manager,Hidden one.,"01/07/23, 11:24 PM",HIDDEN\n',
  'Email Addresses.csv':
    'Email Address,Confirmed,Primary,Updated On\n' +
    'old@example.com,Yes,No,"7/7/20, 1:51 AM"\n' +
    'ada@example.com,Yes,Yes,"9/7/26, 3:40 AM"\n',
  // Files we must never read.
  'messages.csv': 'CONVERSATION ID,FROM,TO,CONTENT\n1,Ada,Sam,private\n',
  'Connections.csv': 'First Name,Last Name,Email Address\nSam,Lee,sam@example.com\n',
  'PhoneNumbers.csv': 'Extension,Number,Type\n,07700900000,Mobile\n',
  'Jobs/Saved Jobs.csv': 'Saved Date,Job Url\n',
}

function zip(files: Record<string, string>): Uint8Array {
  return zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])))
}

describe('readLinkedInExport', () => {
  const { profile, warnings, filesRead } = readLinkedInExport(zip(FIXTURE))

  it('reads the profile basics and leaves the private fields out', () => {
    expect(profile.firstName).toBe('Ada')
    expect(profile.lastName).toBe('Example')
    expect(profile.location).toBe('Manchester, England')
    expect(profile.email).toBe('ada@example.com')
    expect(profile.websites).toEqual([{ label: 'personal', url: 'https://ada.example' }])
    expect(profile.headline?.text).toBe('Data Analyst | SQL and Python')
    expect(profile.summary.map((s) => s.text)).toEqual(['Analyst who likes tidy data. 👋🏻'])

    const everything = JSON.stringify(profile)
    for (const secret of ['Dec 10', 'M1 1AA', 'Some Street', 'Byron']) {
      expect(everything).not.toContain(secret)
    }
  })

  it('only unpacks profile files', () => {
    expect(filesRead).not.toContain('messages.csv')
    expect(JSON.stringify(profile)).not.toMatch(/private|07700900000|sam@example/)
    expect(isProfileFile('messages.csv')).toBe(false)
    expect(isProfileFile('Connections.csv')).toBe(false)
    expect(isProfileFile('PhoneNumbers.csv')).toBe(false)
    expect(isProfileFile('Basic_LinkedInDataExport/Positions.csv')).toBe(true)
  })

  it('splits job descriptions into points and marks current roles', () => {
    const [acme, beta] = profile.positions
    expect(acme!.current).toBe(true)
    expect(acme!.end).toBeNull()
    expect(acme!.start).toEqual({ year: 2022, month: 4 })
    expect(acme!.points.map((p) => p.text)).toEqual([
      'Built a dashboard in Power BI.',
      'Cut report time by 40%.',
      'Trained 5 staff',
    ])
    expect(beta!.current).toBe(false)
    expect(beta!.points.map((p) => p.text)).toEqual(['Ran weekly reports.'])
  })

  it('reads year only education dates and keeps notes as points', () => {
    const [uni] = profile.education
    expect(uni!.start).toEqual({ year: 2016, month: null })
    expect(uni!.points.map((p) => p.text)).toEqual(['Dissertation on hospital waiting lists', 'Chess club'])
  })

  it('treats a blank certificate end date as no expiry', () => {
    const [cert] = profile.certifications
    expect(cert!.issued).toEqual({ year: 2025, month: 6 })
    expect(cert!.expires).toBeNull()
    expect(cert!.licenceNumber).toBe('ABC123')
  })

  it('keeps visible recommendations for context, with no evidence id', () => {
    expect(profile.recommendations).toHaveLength(1)
    expect(profile.recommendations[0]!.author).toBe('Sam Lee')
    expect(profile.recommendations[0]).not.toHaveProperty('id')
    const index = evidenceIndex(profile)
    expect([...index.values()].some((e) => e.text.includes('Ada is great'))).toBe(false)
  })

  it('gives every fact a unique id that survives a re-import', () => {
    const index = evidenceIndex(profile)
    const again = evidenceIndex(readLinkedInExport(zip(FIXTURE)).profile)
    expect([...again.keys()]).toEqual([...index.keys()])
    // Two roles, one degree, one cert, one project, one volunteering role,
    // three skills, one language and one course, plus the headline, one
    // summary point and 3 + 1 + 2 + 2 + 1 points.
    expect(index.size).toBe(2 + 1 + 1 + 1 + 1 + 3 + 1 + 1 + 1 + 1 + 9)
    expect(index.get(profile.positions[0]!.id)?.text).toBe('Data Analyst, Acme Health, Leeds, England, Apr 2022 to present')
  })

  it('keeps ids steady when a newer export adds a role above', () => {
    const [header, ...rows] = FIXTURE['Positions.csv']!.split('\n')
    const newer = {
      ...FIXTURE,
      'Positions.csv': [header, 'New Co,Senior Analyst,• Started here,Leeds,Jan 2027,', ...rows].join('\n'),
    }
    const moved = readLinkedInExport(zip(newer)).profile.positions[1]!
    expect(moved.id).toBe(profile.positions[0]!.id)
    expect(moved.points.map((p) => p.id)).toEqual(profile.positions[0]!.points.map((p) => p.id))
  })

  it('has nothing to warn about in a clean export', () => {
    expect(warnings).toEqual([])
  })
})

// Column names for these two files come from other importers, not from a
// real export, so both the most likely spelling and the alternatives are
// tested.
describe('honors and publications', () => {
  const base = { 'Profile.csv': 'First Name\nAda\n' }

  it('reads the most likely layout', () => {
    const { profile, warnings } = readLinkedInExport(
      zip({
        ...base,
        'Honors.csv': 'Title,Description,Issued On\nDean’s List,"• Top 5% of cohort • Two years running",Jun 2019\n',
        'Publications.csv':
          'Name,Published On,Description,Publisher,Url\n' +
          'Waiting lists and weekends,Mar 2024,A study of NHS waiting lists.,Health Data Journal,https://doi.example/1\n',
      }),
    )
    expect(warnings).toEqual([])

    const [honor] = profile.honors
    expect(honor!.title).toBe('Dean’s List')
    expect(honor!.issued).toEqual({ year: 2019, month: 6 })
    expect(honor!.points.map((p) => p.text)).toEqual(['Top 5% of cohort', 'Two years running'])

    const [pub] = profile.publications
    expect(pub!.title).toBe('Waiting lists and weekends')
    expect(pub!.publisher).toBe('Health Data Journal')
    expect(pub!.url).toBe('https://doi.example/1')
    expect(pub!.published).toEqual({ year: 2024, month: 3 })

    const index = evidenceIndex(profile)
    expect(index.get(honor!.id)?.text).toBe('Dean’s List, Jun 2019')
    expect(index.get(pub!.id)?.text).toBe('Waiting lists and weekends, Health Data Journal, Mar 2024')
    expect(index.get(pub!.points[0]!.id)?.text).toBe('A study of NHS waiting lists.')
  })

  it('accepts the other spellings seen in the wild', () => {
    const { profile, warnings } = readLinkedInExport(
      zip({
        ...base,
        'Honors.csv': 'Name,Issuer,Issued Date,Description\nBest Poster,RSS,"Sep 12, 2023",\n',
        'Publications.csv': 'Title,Date Published,Publisher,URL\nA Paper,2021,Some Press,https://p.example\n',
      }),
    )
    expect(warnings).toEqual([])
    expect(profile.honors[0]).toMatchObject({ title: 'Best Poster', issuer: 'RSS', issued: { year: 2023, month: 9 } })
    expect(profile.publications[0]).toMatchObject({
      title: 'A Paper',
      publisher: 'Some Press',
      url: 'https://p.example',
      published: { year: 2021, month: null },
    })
  })

  it('skips a file it cannot recognise rather than guessing', () => {
    const { profile, warnings } = readLinkedInExport(
      zip({ ...base, 'Honors.csv': 'Award,When\nBest Poster,2023\n' }),
    )
    expect(profile.honors).toEqual([])
    expect(warnings).toEqual([
      'Honors.csv is missing the Title column, so it was skipped. LinkedIn may have changed its export format.',
    ])
  })

  it('finds volunteering under its other file names', () => {
    for (const name of ['Volunteering_Experiences.csv', 'Volunteer Experience.csv']) {
      const { profile, filesRead } = readLinkedInExport(
        zip({ ...base, [name]: 'Organization,Role,Start Date\nCode Club,Tutor,2022\n' }),
      )
      expect(filesRead).toContain('Volunteering.csv')
      expect(profile.volunteering[0]).toMatchObject({ organisation: 'Code Club', role: 'Tutor' })
    }
  })
})

describe('choosing the contact email', () => {
  it('reads the primary address from the export by default', () => {
    const result = readLinkedInExport(zip(FIXTURE))
    expect(result.profile.email).toBe('ada@example.com')
    expect(result.emailFrom).toBe('export')
    expect(result.filesRead).toContain('Email Addresses.csv')
  })

  it('uses a typed address and never opens the email file', () => {
    const result = readLinkedInExport(zip(FIXTURE), { email: { from: 'user', value: '  ada.cv@example.org ' } })
    expect(result.profile.email).toBe('ada.cv@example.org')
    expect(result.emailFrom).toBe('user')
    expect(result.filesRead).not.toContain('Email Addresses.csv')
    expect(JSON.stringify(result.profile)).not.toContain('ada@example.com')
    expect(result.warnings).toEqual([])
  })

  it('keeps a typed address that looks wrong, with a warning', () => {
    const result = readLinkedInExport(zip(FIXTURE), { email: { from: 'user', value: 'ada.example.org' } })
    expect(result.profile.email).toBe('ada.example.org')
    expect(result.warnings).toEqual(['"ada.example.org" does not look like an email address. Check it before using it on a CV.'])
  })

  it('reports no source when the user leaves it blank', () => {
    const result = readLinkedInExport(zip(FIXTURE), { email: { from: 'user', value: '' } })
    expect(result.profile.email).toBe('')
    expect(result.emailFrom).toBeNull()
  })

  it('reports no source when the export has no email file', () => {
    const { 'Email Addresses.csv': _, ...noEmail } = FIXTURE
    const result = readLinkedInExport(zip(noEmail))
    expect(result.profile.email).toBe('')
    expect(result.emailFrom).toBeNull()
  })

  it.each([
    ['ada@example.com', true],
    ['ada.cv+jobs@mail.example.co.uk', true],
    ['ada.example.com', false],
    ['ada@example', false],
    ['ada @example.com', false],
  ])('looksLikeEmail(%j) is %s', (value, expected) => {
    expect(looksLikeEmail(value)).toBe(expected)
  })
})

describe('readLinkedInExport warnings and errors', () => {
  it('warns about unreadable dates instead of failing', () => {
    const files = {
      'Positions.csv': 'Company Name,Title,Description,Location,Started On,Finished On\nAcme,Analyst,,,Spring 2022,\n',
    }
    const { profile, warnings } = readLinkedInExport(zip(files))
    expect(profile.positions[0]!.start).toBeNull()
    expect(warnings).toEqual(['Positions.csv has a date we could not read, "Spring 2022". It was left blank.'])
  })

  it('skips a file whose key column has gone', () => {
    const files = { 'Profile.csv': 'First Name\nAda\n', 'Positions.csv': 'Company,Role\nAcme,Analyst\n' }
    const { profile, warnings } = readLinkedInExport(zip(files))
    expect(profile.positions).toEqual([])
    expect(warnings[0]).toContain('Positions.csv is missing the Title column')
  })

  it('rejects a PDF, a non zip, an unrelated zip and a broken zip', () => {
    expect(() => readLinkedInExport(strToU8('%PDF-1.7'))).toThrow(/This is a PDF/)
    expect(() => readLinkedInExport(strToU8('hello'))).toThrow(ExportError)
    expect(() => readLinkedInExport(zip({ 'notes.txt': 'hi' }))).toThrow(/doesn't look like a LinkedIn/)
    expect(() => readLinkedInExport(zip(FIXTURE).subarray(0, 200))).toThrow(/could not be opened/)
  })
})
