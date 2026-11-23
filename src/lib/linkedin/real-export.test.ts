/// <reference types="node" />
// Runs the importer against a real export if one is sitting in
// samples/private, which git ignores. Skipped everywhere else, including CI.
// It checks shape only and never prints profile content.

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { evidenceIndex } from '../profile'
import { readLinkedInExport } from './import'

const dir = join(import.meta.dirname, '../../../samples/private')

function findExport(): string | undefined {
  try {
    return readdirSync(dir).find((f) => /\.zip$/i.test(f) && /linkedin/i.test(f))
  } catch {
    return undefined
  }
}

const file = findExport()

describe.skipIf(!file)('a real LinkedIn export', () => {
  const bytes = new Uint8Array(readFileSync(join(dir, file ?? '')))
  const result = readLinkedInExport(bytes)
  const index = evidenceIndex(result.profile)

  it('imports with no warnings', () => {
    expect(result.warnings).toEqual([])
    expect(result.profile.firstName).not.toBe('')
    expect(result.profile.positions.length).toBeGreaterThan(0)
  })

  it('reads only profile files', () => {
    expect(result.filesRead).not.toContain('messages.csv')
    expect(result.filesRead).toContain('Positions.csv')
  })

  it('gives every fact non empty text', () => {
    for (const e of index.values()) expect(e.text.trim()).not.toBe('')
  })

  it('produces the same ids on a second import', () => {
    expect([...evidenceIndex(readLinkedInExport(bytes).profile).keys()]).toEqual([...index.keys()])
  })

  it('splits descriptions that use bullets', () => {
    const withBullets = result.profile.positions.filter((p) => p.points.length > 1)
    expect(withBullets.length).toBeGreaterThan(0)
    for (const p of withBullets) {
      for (const point of p.points) expect(point.text).not.toMatch(/[•●]/)
    }
  })
})
