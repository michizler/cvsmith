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

const pdfFile = (() => {
  try {
    return readdirSync(dir).find((f) => /\.pdf$/i.test(f))
  } catch {
    return undefined
  }
})()

// The PDF is checked against the zip from the same account. Facts that are
// in both should get the same ids, so changes made after a PDF import carry
// over when the zip is imported later.
describe.skipIf(!pdfFile || !file)('a real LinkedIn profile PDF', async () => {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const { extractLines } = await import('./pdf/lines')
  const { parseProfileLines } = await import('./pdf/parse')
  const lines = await extractLines(new Uint8Array(readFileSync(join(dir, pdfFile ?? ''))), pdfjs)
  const pdf = parseProfileLines(lines)
  const zip = readLinkedInExport(new Uint8Array(readFileSync(join(dir, file ?? '')))).profile
  const zipIds = new Set(evidenceIndex(zip).keys())

  // The PDF groups roles under each company while the zip lists them by
  // date, so only the set of roles is compared.
  it('finds the same roles as the export', () => {
    const roles = (p: typeof zip) => p.positions.map((x) => `${x.company} | ${x.title} | ${x.current}`).sort()
    expect(roles(pdf.profile)).toEqual(roles(zip))
  })

  it('gives at least 90% of job bullets the same id as the export', () => {
    const bullets = pdf.profile.positions.flatMap((x) => x.points)
    const matched = bullets.filter((b) => zipIds.has(b.id))
    expect(bullets.length).toBeGreaterThan(0)
    expect(matched.length / bullets.length).toBeGreaterThanOrEqual(0.9)
    for (const x of pdf.profile.positions) expect(zipIds.has(x.id), `${x.company} ${x.title}`).toBe(true)
  })

  it('reads the contact details but not the phone number', () => {
    expect(pdf.profile.email).toBe(zip.email)
    expect(pdf.profile.websites).toEqual(zip.websites)
    const phone = lines.find((l) => /\(mobile\)/i.test(l.text))?.text.replace(/\D/g, '') ?? ''
    if (phone) expect(JSON.stringify(pdf).replace(/\D/g, ' ')).not.toContain(phone)
  })

  it('matches the export on headline, location and education schools', () => {
    expect(pdf.profile.headline?.id).toBe(zip.headline?.id)
    expect(pdf.profile.location).toBe(zip.location)
    expect(pdf.profile.education.map((e) => e.school)).toEqual(zip.education.map((e) => e.school))
  })
})

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
