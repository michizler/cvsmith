// Pulls positioned lines of text out of a LinkedIn "Save to PDF" file.
//
// This is the only part that touches pdfjs. Everything that decides what a
// line means lives in parse.ts and works on plain TextLine objects, so it can
// be tested without any PDF tooling.

import type * as PdfJs from 'pdfjs-dist'

export interface TextLine {
  page: number
  // LinkedIn's PDF has a narrow sidebar on the left and the main column on
  // the right.
  column: 'side' | 'main'
  x: number
  // PDF coordinates, so larger is higher up the page.
  y: number
  size: number
  text: string
}

// The sidebar sits in the left third of the page.
const SIDEBAR_FRACTION = 0.3

// Pieces of text closer together than this vertically are on the same line.
const SAME_LINE = 1.5

interface Piece {
  x: number
  y: number
  size: number
  text: string
}

export async function extractLines(bytes: Uint8Array, pdfjs: Pick<typeof PdfJs, 'getDocument'>): Promise<TextLine[]> {
  // The file is untrusted. Only text is read, so font loading and XFA forms
  // are switched off. pdfjs 6 no longer evaluates code from fonts at all,
  // which is why the old isEvalSupported switch is gone.
  const task = pdfjs.getDocument({
    data: bytes,
    disableFontFace: true,
    useSystemFonts: false,
    enableXfa: false,
  })
  const doc = await task.promise

  const lines: TextLine[] = []
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n)
      const width = page.view[2] ?? 612
      const content = await page.getTextContent()
      const columns: Record<TextLine['column'], Piece[]> = { side: [], main: [] }

      for (const item of content.items) {
        if (!('str' in item) || !item.str.trim()) continue
        const [, , , d, x, y] = item.transform as number[]
        const column = x! < width * SIDEBAR_FRACTION ? 'side' : 'main'
        columns[column].push({ x: x!, y: y!, size: Math.round(Math.abs(d!) * 10) / 10, text: item.str })
      }

      for (const column of ['side', 'main'] as const) {
        for (const group of groupLines(columns[column])) {
          const first = group[0]!
          lines.push({
            page: n,
            column,
            x: first.x,
            y: first.y,
            size: first.size,
            text: group
              .map((p) => p.text)
              .join(' ')
              .replace(/\s+/g, ' ')
              .trim(),
          })
        }
      }
      page.cleanup()
    }
  } finally {
    await task.destroy()
  }
  return lines
}

// Top to bottom, then left to right within a line.
function groupLines(pieces: Piece[]): Piece[][] {
  const sorted = [...pieces].sort((a, b) => b.y - a.y || a.x - b.x)
  const groups: Piece[][] = []
  for (const piece of sorted) {
    const last = groups[groups.length - 1]
    if (last && Math.abs(last[0]!.y - piece.y) <= SAME_LINE) last.push(piece)
    else groups.push([piece])
  }
  return groups.map((g) => g.sort((a, b) => a.x - b.x))
}
