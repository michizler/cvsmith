import { describe, expect, it } from 'vitest'
import { cell, parseCsv, toRows } from './csv'

describe('parseCsv', () => {
  it('reads plain rows', () => {
    expect(parseCsv('a,b\n1,2\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('keeps commas, quotes and line breaks inside quoted fields', () => {
    const text = 'Title,Description\n"Analyst","Did this, then ""that""\nand more"\n'
    expect(parseCsv(text)).toEqual([
      ['Title', 'Description'],
      ['Analyst', 'Did this, then "that"\nand more'],
    ])
  })

  it('handles CRLF, a BOM and a missing final newline', () => {
    expect(parseCsv('﻿a,b\r\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('skips blank lines but keeps empty fields', () => {
    expect(parseCsv('a,b,c\n\n1,,3\n\n')).toEqual([
      ['a', 'b', 'c'],
      ['1', '', '3'],
    ])
  })

  it('treats a stray quote mid field as text', () => {
    expect(parseCsv('a\n15" laptop\n')).toEqual([['a'], ['15" laptop']])
  })

  it('keeps emoji and non Latin text intact', () => {
    expect(parseCsv('a\nHi 👋🏻 Cohen’s κ\n')).toEqual([['a'], ['Hi 👋🏻 Cohen’s κ']])
  })
})

describe('toRows and cell', () => {
  it('matches headers loosely and pads short rows', () => {
    const { rows } = toRows('Started On , Title\nApr 2022\n')
    const row = rows[0]!
    expect(cell(row, 'started on')).toBe('Apr 2022')
    expect(cell(row, 'Title')).toBe('')
  })

  it('falls back through alternative column names', () => {
    const { rows } = toRows('Start Date\n2018\n')
    expect(cell(rows[0]!, 'Started On', 'Start Date')).toBe('2018')
  })
})
