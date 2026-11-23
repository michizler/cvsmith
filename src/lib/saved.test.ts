import { strToU8, zipSync } from 'fflate'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { setHidden } from './edits'
import { readLinkedInExport, type ImportOptions } from './linkedin/import'
import type { GitHubData } from './github/import'
import { contactOf, forgetSaved, fresh, loadSaved, profileOf, replaceGitHub, replaceImport, storeSaved } from './saved'

function importOf(skills: string, options?: ImportOptions) {
  const files = {
    'Profile.csv': 'First Name,Last Name,Geo Location\nAda,Example,Leeds\n',
    'Email Addresses.csv': 'Email Address,Confirmed,Primary\nada@example.com,Yes,Yes\n',
    'Skills.csv': `Name\n${skills}\n`,
  }
  return readLinkedInExport(zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)]))), options)
}

function memoryStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    key: (i) => [...data.keys()][i] ?? null,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, String(v)),
    removeItem: (k) => void data.delete(k),
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('contact details', () => {
  it('come from the import until the user changes them, and phone is typed only', () => {
    const saved = fresh(importOf('Python'))
    expect(contactOf(saved)).toEqual({
      firstName: 'Ada',
      lastName: 'Example',
      email: 'ada@example.com',
      phone: '',
      location: 'Leeds',
      emailFrom: 'export',
    })
    const changed = { ...saved, contact: { phone: '07700 900123', email: 'cv@ada.example' } }
    expect(contactOf(changed)).toMatchObject({ phone: '07700 900123', email: 'cv@ada.example', emailFrom: 'user' })
  })
})

describe('replaceImport', () => {
  it('keeps hides that still match, reports the rest, and follows the new email choice', () => {
    const first = importOf('Python\nSQL')
    const [python, sql] = first.profile.skills
    let saved = fresh(first)
    saved = { ...saved, edits: setHidden(setHidden(saved.edits, python!.id, true), sql!.id, true) }
    saved = { ...saved, contact: { phone: '07700 900123', email: 'old@ada.example' } }

    const { saved: next, dropped } = replaceImport(saved, importOf('SQL\nR', { email: { from: 'user', value: 'new@ada.example' } }))
    expect(dropped).toBe(1)
    expect(next.edits.hidden).toEqual([sql!.id])
    expect(contactOf(next)).toMatchObject({ phone: '07700 900123', email: 'new@ada.example', emailFrom: 'user' })
  })
})

describe('GitHub alongside LinkedIn', () => {
  const github = (repoIds: string[]): GitHubData => ({
    username: 'ada',
    fetchedAt: '2026-11-23T12:00:00Z',
    repos: repoIds.map((id) => ({
      id,
      source: 'github.com/ada/x',
      fullName: 'ada/x',
      url: 'https://github.com/ada/x',
      homepage: '',
      relation: 'owner' as const,
      archived: false,
      created: null,
      lastPush: null,
      description: [],
      observed: [],
      readme: [],
    })),
    contributed: [],
    forksSkipped: 0,
    warnings: [],
  })

  it('keeps GitHub hides through a LinkedIn re-import, and drops them when GitHub is removed', () => {
    let saved = replaceGitHub(fresh(importOf('Python')), github(['repo:one'])).saved
    saved = { ...saved, edits: setHidden(saved.edits, 'repo:one', true) }
    expect(profileOf(saved).repos).toHaveLength(1)

    const reimported = replaceImport(saved, importOf('Python'))
    expect(reimported.dropped).toBe(0)
    expect(reimported.saved.edits.hidden).toEqual(['repo:one'])
    expect(reimported.saved.github?.repos).toHaveLength(1)

    const removed = replaceGitHub(reimported.saved, null)
    expect(removed.dropped).toBe(1)
    expect(removed.saved.edits.hidden).toEqual([])
  })
})

describe('browser storage', () => {
  it('round trips and can be forgotten', () => {
    vi.stubGlobal('localStorage', memoryStorage())
    const saved = fresh(importOf('Python'))
    expect(storeSaved(saved)).toBe(true)
    expect(loadSaved()).toEqual(saved)
    forgetSaved()
    expect(loadSaved()).toBeNull()
  })

  it('upgrades a version 1 profile and keeps its edits', () => {
    const v1 = { ...fresh(importOf('Python')), version: 1, github: undefined }
    const { honors: _, publications: __, repos: ___, ...oldProfile } = v1.result.profile
    v1.result = { ...v1.result, profile: oldProfile as never }
    v1.edits = { hidden: ['skill:abc'], text: {}, splits: {} }
    const storage = memoryStorage()
    storage.setItem('cvsmith:profile', JSON.stringify(v1))
    vi.stubGlobal('localStorage', storage)

    const loaded = loadSaved()!
    expect(loaded.version).toBe(2)
    expect(loaded.github).toBeNull()
    expect(loaded.edits.hidden).toEqual(['skill:abc'])
    expect(loaded.result.profile).toMatchObject({ honors: [], publications: [], repos: [] })
  })

  it('ignores data saved by an older version', () => {
    const storage = memoryStorage()
    storage.setItem('cvsmith:profile', JSON.stringify({ version: 0, result: {} }))
    vi.stubGlobal('localStorage', storage)
    expect(loadSaved()).toBeNull()
  })
})
