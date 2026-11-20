import { afterEach, describe, expect, it, vi } from 'vitest'
import { load, remove, save } from './storage'

// Node has no localStorage, so each test gets a small in-memory stand-in.
function fakeStorage(overrides: Partial<Storage> = {}): Storage {
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
    ...overrides,
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('storage', () => {
  it('round-trips a value', () => {
    vi.stubGlobal('localStorage', fakeStorage())
    expect(save('profile', { name: 'Ada' })).toBe(true)
    expect(load('profile', null)).toEqual({ name: 'Ada' })
    remove('profile')
    expect(load('profile', 'gone')).toBe('gone')
  })

  it('falls back when the stored JSON is broken', () => {
    const storage = fakeStorage()
    storage.setItem('cvsmith:profile', '{"name": ')
    vi.stubGlobal('localStorage', storage)
    expect(load('profile', 'fallback')).toBe('fallback')
  })

  it('reports a failed write instead of throwing', () => {
    vi.stubGlobal(
      'localStorage',
      fakeStorage({
        setItem: () => {
          throw new DOMException('quota', 'QuotaExceededError')
        },
      }),
    )
    expect(save('profile', { name: 'Ada' })).toBe(false)
  })

  it('copes with no storage at all', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(load('profile', 'fallback')).toBe('fallback')
    expect(save('profile', 1)).toBe(false)
    expect(() => remove('profile')).not.toThrow()
  })
})
