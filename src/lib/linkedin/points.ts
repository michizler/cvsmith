// Splits a LinkedIn description into the separate points a CV line can cite.
//
// The export flattens each description onto one line. The bullets survive as
// characters ("•" or "●") with uneven spacing around them, and the line
// breaks are gone. Splitting on the bullet characters gets the original
// points back. Without this a CV line could only cite a whole job, and the
// fact check would have a 1,700 character haystack to search.

const BULLETS = /[•●▪◦‣■]/

export function splitPoints(text: string): string[] {
  return text
    .split(new RegExp(`\\r?\\n|${BULLETS.source}`))
    .map((piece) =>
      piece
        // Hand-typed bullets only count at the start of a line, so a dash
        // in the middle of a sentence is left alone.
        .replace(/^\s*[-*]\s+/, '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter((piece) => /[\p{L}\p{N}]/u.test(piece))
}
