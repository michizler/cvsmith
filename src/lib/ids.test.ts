import { describe, expect, it } from 'vitest'
import { IdMaker, hashText } from './ids'

describe('hashText', () => {
  it('ignores case and spacing but not wording', () => {
    expect(hashText('Built  a Pipeline ')).toBe(hashText('built a pipeline'))
    expect(hashText('built a pipeline')).not.toBe(hashText('built two pipelines'))
  })

  it('is always seven characters', () => {
    for (const s of ['', 'a', 'a much longer piece of text than that']) {
      expect(hashText(s)).toMatch(/^[0-9a-z]{7}$/)
    }
  })
})

describe('IdMaker', () => {
  it('gives the same ids for the same facts in a fresh run', () => {
    const run = () => {
      const ids = new IdMaker()
      const parent = ids.make('position', 'Acme', 'Analyst', 'Apr 2022')
      return [parent, ids.child(parent, 'Built a pipeline')]
    }
    expect(run()).toEqual(run())
  })

  it('keeps duplicates apart', () => {
    const ids = new IdMaker()
    const a = ids.make('skill', 'Python')
    const b = ids.make('skill', 'Python')
    expect(a).not.toBe(b)
    expect(b).toBe(`${a}~2`)
  })
})
