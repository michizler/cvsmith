// Parses the CSV files inside a LinkedIn data export.
//
// The files are ordinary RFC 4180 CSV. A hand-written parser is short and
// saves every visitor from downloading a CSV library. It is lenient on
// purpose. A stray quote in the middle of a field is kept as text rather than
// failing the whole import, because one odd job description should not stop
// someone from getting a CV.

export function parseCsv(input: string): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let i = 0

  const endField = () => {
    row.push(field)
    field = ''
  }
  const endRow = () => {
    endField()
    // Blank lines show up at the end of most files. They are not records.
    if (!(row.length === 1 && row[0] === '')) rows.push(row)
    row = []
  }

  while (i < text.length) {
    const c = text.charAt(i)

    if (quoted) {
      if (c === '"' && text.charAt(i + 1) === '"') {
        field += '"'
        i += 2
      } else if (c === '"') {
        quoted = false
        i++
      } else {
        field += c
        i++
      }
      continue
    }

    if (c === '"' && field === '') {
      quoted = true
    } else if (c === ',') {
      endField()
    } else if (c === '\n') {
      endRow()
    } else if (c === '\r') {
      endRow()
      if (text.charAt(i + 1) === '\n') i++
    } else {
      field += c
    }
    i++
  }

  if (field !== '' || row.length > 0) endRow()
  return rows
}

export type Row = Map<string, string>

// LinkedIn has renamed columns before ("Start Date" in one file, "Started On"
// in the next), so headers are matched loosely and callers can name more than
// one spelling.
export function normaliseHeader(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function toRows(text: string): { headers: string[]; rows: Row[] } {
  const [header, ...body] = parseCsv(text)
  if (!header) return { headers: [], rows: [] }
  const headers = header.map(normaliseHeader)
  const rows = body.map(
    (cells) => new Map(headers.map((h, i) => [h, (cells[i] ?? '').trim()])),
  )
  return { headers, rows }
}

export function cell(row: Row, ...names: string[]): string {
  for (const name of names) {
    const value = row.get(normaliseHeader(name))
    if (value) return value
  }
  return ''
}
