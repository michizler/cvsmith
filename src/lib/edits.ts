// The user's changes to an imported profile: hiding facts, rewording them and
// splitting long paragraphs into separate points.
//
// Changes are kept apart from the imported profile and keyed by evidence id,
// rather than written into it. A newer export can then replace the import
// and every change whose fact is still there carries over. Changes to facts
// that have since changed on LinkedIn no longer match and are dropped.

import { hashText } from './ids'
import { evidenceIndex, type Evidence, type Profile } from './profile'

export interface Edits {
  // Ids of hidden facts. Hiding a role or degree hides its points too.
  hidden: string[]
  // New wording, keyed by the id of the point it replaces.
  text: Record<string, string>
  // Pieces a point was split into, keyed by the point's id. Pieces are always
  // exact pieces of the original, so they keep its source.
  splits: Record<string, string[]>
}

export function emptyEdits(): Edits {
  return { hidden: [], text: {}, splits: {} }
}

export interface PointView {
  // The id this point is tracked by for hiding and editing.
  baseId: string
  // The id a CV line cites. It changes when the wording does, so a CV made
  // before an edit no longer matches and has to be checked again.
  id: string
  source: string
  text: string
  original: string
  edited: boolean
  hidden: boolean
  // Set on pieces made by a split, pointing at the point they came from.
  splitFrom: string | null
  basis?: Evidence['basis']
}

function pieceIds(parentId: string, pieces: string[]): string[] {
  const seen = new Set<string>()
  return pieces.map((piece) => {
    let id = `${parentId}#${hashText(piece)}`
    for (let n = 2; seen.has(id); n++) id = `${parentId}#${hashText(piece)}~${n}`
    seen.add(id)
    return id
  })
}

function view(e: Evidence, edits: Edits, splitFrom: string | null): PointView {
  const replacement = edits.text[e.id]
  const edited = replacement !== undefined && replacement !== e.text
  const text = edited ? replacement : e.text
  return {
    baseId: e.id,
    id: edited ? `${e.id}@${hashText(text)}` : e.id,
    source: e.source,
    text,
    original: e.text,
    edited,
    hidden: edits.hidden.includes(e.id),
    splitFrom,
    ...(e.basis ? { basis: e.basis } : {}),
  }
}

// Expands splits and applies hides and rewording. Hidden points are kept in
// the list so the review screen can show them greyed out with an undo.
export function viewPoints(points: Evidence[], edits: Edits): PointView[] {
  return points.flatMap((p) => {
    const pieces = edits.splits[p.id]
    if (!pieces) return [view(p, edits, null)]
    const ids = pieceIds(p.id, pieces)
    return pieces.map((text, i) => view({ id: ids[i]!, source: p.source, text, basis: p.basis }, edits, p.id))
  })
}

// Suggests where a long paragraph could be split, at sentence ends. Only a
// suggestion. The user sees the pieces before anything changes, because a
// full stop after "MSc" or "e.g" will fool it.
//
// The export drops line breaks, so a paragraph break often arrives as
// "results.A hobby", with no space at all. That counts as a sentence end
// when a capital starts a normal word after it. "Node.JS" and "ASP.NET" do
// not match, because the capital is followed by another capital.
const SENTENCE_END = /(?<=[.!?])\s+(?=[\p{Lu}\p{N}"“'(])|(?<=[\p{Ll}\p{N})][.!?])(?=\p{Lu}[\p{Ll}\s])/u

export function suggestSplit(text: string): string[] {
  const pieces: string[] = []
  for (const raw of text.split(SENTENCE_END)) {
    const piece = raw.trim()
    if (!piece) continue
    // A trailing emoji or stray symbol is not a point on its own.
    if (!/[\p{L}\p{N}]/u.test(piece) && pieces.length > 0) {
      pieces[pieces.length - 1] += ` ${piece}`
    } else {
      pieces.push(piece)
    }
  }
  return pieces
}

export function setHidden(edits: Edits, id: string, hidden: boolean): Edits {
  const rest = edits.hidden.filter((h) => h !== id)
  return { ...edits, hidden: hidden ? [...rest, id] : rest }
}

// Saving the original wording, or nothing at all, clears the edit. Empty
// text is not a point, and hiding is the way to remove one.
export function setText(edits: Edits, point: PointView, text: string): Edits {
  const clean = text.replace(/\s+/g, ' ').trim()
  const { [point.baseId]: _, ...rest } = edits.text
  if (!clean || clean === point.original) return { ...edits, text: rest }
  return { ...edits, text: { ...rest, [point.baseId]: clean } }
}

export function split(edits: Edits, pointId: string, original: string, pieces: string[]): Edits {
  // Pieces must come from the original, otherwise a split would be a quiet
  // way to add new claims with LinkedIn as their source.
  const squash = (s: string) => s.replace(/\s+/g, ' ').trim()
  const whole = squash(original)
  let from = 0
  for (const piece of pieces.map(squash)) {
    const at = whole.indexOf(piece, from)
    if (at === -1) throw new Error('A split piece is not part of the original text')
    from = at + piece.length
  }
  if (pieces.length < 2) return edits
  // Hiding or rewording the whole point no longer applies once it is in
  // pieces. Each piece can be hidden or reworded on its own.
  const cleared = dropKeys(edits, (k) => k === pointId)
  return { ...cleared, splits: { ...cleared.splits, [pointId]: pieces.map(squash) } }
}

export function unsplit(edits: Edits, pointId: string): Edits {
  const { [pointId]: _, ...splits } = edits.splits
  return dropKeys({ ...edits, splits }, (k) => k.startsWith(`${pointId}#`))
}

function dropKeys(edits: Edits, drop: (key: string) => boolean): Edits {
  return {
    hidden: edits.hidden.filter((k) => !drop(k)),
    text: Object.fromEntries(Object.entries(edits.text).filter(([k]) => !drop(k))),
    splits: Object.fromEntries(Object.entries(edits.splits).filter(([k]) => !drop(k))),
  }
}

// Every id a change could be keyed by in this profile.
function knownIds(profile: Profile, edits: Edits): Set<string> {
  const ids = new Set(evidenceIndex(profile).keys())
  for (const [parent, pieces] of Object.entries(edits.splits)) {
    if (ids.has(parent)) pieceIds(parent, pieces).forEach((id) => ids.add(id))
  }
  return ids
}

// Keeps only the changes that still match a fact. Used after importing a
// newer export. The count is shown to the user so nothing vanishes silently.
export function pruneEdits(edits: Edits, profile: Profile): { edits: Edits; dropped: number } {
  const ids = knownIds(profile, edits)
  // A split whose original is gone takes its piece edits with it.
  const kept = dropKeys(edits, (k) => !ids.has(k))
  const before = edits.hidden.length + Object.keys(edits.text).length + Object.keys(edits.splits).length
  const after = kept.hidden.length + Object.keys(kept.text).length + Object.keys(kept.splits).length
  return { edits: kept, dropped: before - after }
}

// The profile with every change applied and hidden facts removed. This is
// what the CV writer and the fact check will work from.
export function applyEdits(profile: Profile, edits: Edits): Profile {
  const shown = <T extends { id: string }>(items: T[]) => items.filter((x) => !edits.hidden.includes(x.id))
  const points = (items: Evidence[]): Evidence[] =>
    viewPoints(items, edits)
      .filter((p) => !p.hidden)
      .map(
        (p): Evidence => ({
          id: p.id,
          source: p.source,
          text: p.text,
          ...(p.edited ? { edited: true } : {}),
          ...(p.basis ? { basis: p.basis } : {}),
        }),
      )
  const withPoints = <T extends { id: string; points: Evidence[] }>(items: T[]) =>
    shown(items).map((x) => ({ ...x, points: points(x.points) }))

  return {
    ...profile,
    headline: profile.headline ? (points([profile.headline])[0] ?? null) : null,
    summary: points(profile.summary),
    positions: withPoints(profile.positions),
    education: withPoints(profile.education),
    certifications: shown(profile.certifications),
    projects: withPoints(profile.projects),
    volunteering: withPoints(profile.volunteering),
    honors: withPoints(profile.honors),
    publications: withPoints(profile.publications),
    skills: shown(profile.skills),
    languages: shown(profile.languages),
    courses: shown(profile.courses),
    repos: shown(profile.repos ?? []).map((r) => ({
      ...r,
      description: points(r.description),
      observed: points(r.observed),
      readme: points(r.readme),
    })),
  }
}
