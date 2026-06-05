import { describe, it, expect } from 'vitest'

// ── ColorMixGame logic (inlined from ColorMixGame.tsx) ─────────────────────────

type RGB = [number, number, number]

interface Pigment { id: string; rgb: RGB }

function mixRGB(pigments: Pigment[], amounts: Record<string, number>): RGB {
  let totalW = 0
  let r = 0, g = 0, b = 0
  for (const p of pigments) {
    const w = amounts[p.id] ?? 0
    if (w > 0) {
      r += p.rgb[0] * w
      g += p.rgb[1] * w
      b += p.rgb[2] * w
      totalW += w
    }
  }
  if (totalW === 0) return [220, 220, 220]
  return [Math.round(r / totalW), Math.round(g / totalW), Math.round(b / totalW)]
}

function colourDist(a: RGB, b: RGB): number {
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]))
}

function rgbToHex(rgb: RGB): string {
  return '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('')
}

// ── PipelineGame logic (inlined from PipelineGame.tsx) ─────────────────────────

type Dir = 0 | 1 | 2 | 3  // 0=N 1=E 2=S 3=W

interface PipeTile { openings: Dir[]; fixed: boolean }

function rotateDir(d: Dir, turns: number): Dir {
  return ((d + turns) % 4) as Dir
}

function getOpenings(base: Dir[], rotation: number): Dir[] {
  return base.map(d => rotateDir(d, rotation))
}

function hasOpening(openings: Dir[], d: Dir): boolean {
  return openings.includes(d)
}

function floodFill(tiles: PipeTile[], cols: number, rows: number, sourceIdx: number): Set<number> {
  const reached = new Set<number>()
  const queue = [sourceIdx]
  reached.add(sourceIdx)

  const neighbour = (idx: number, dir: Dir): number | null => {
    const col = idx % cols
    const row = Math.floor(idx / cols)
    if (dir === 0 && row > 0) return idx - cols
    if (dir === 1 && col < cols - 1) return idx + 1
    if (dir === 2 && row < rows - 1) return idx + cols
    if (dir === 3 && col > 0) return idx - 1
    return null
  }

  const opposite: Dir[] = [2, 3, 0, 1]

  while (queue.length > 0) {
    const cur = queue.shift()!
    for (const dir of tiles[cur].openings) {
      const nb = neighbour(cur, dir)
      if (nb === null || reached.has(nb)) continue
      if (hasOpening(tiles[nb].openings, opposite[dir] as Dir)) {
        reached.add(nb)
        queue.push(nb)
      }
    }
  }
  return reached
}

// ── StorySortGame shuffle (inlined) ────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('ColorMixGame — mixRGB', () => {
  const red:   Pigment = { id: 'r', rgb: [255, 0,   0  ] }
  const white: Pigment = { id: 'w', rgb: [255, 255, 255] }
  const black: Pigment = { id: 'b', rgb: [0,   0,   0  ] }
  const blue:  Pigment = { id: 'bl', rgb: [0,  0,   255] }

  it('returns grey when no pigment selected', () => {
    expect(mixRGB([red], { r: 0 })).toEqual([220, 220, 220])
  })

  it('returns pure pigment colour when only one is used', () => {
    expect(mixRGB([red, white], { r: 1, w: 0 })).toEqual([255, 0, 0])
    expect(mixRGB([red, white], { r: 0, w: 3 })).toEqual([255, 255, 255])
  })

  it('50/50 red+white produces pink', () => {
    const [r, g, b] = mixRGB([red, white], { r: 1, w: 1 })
    expect(r).toBe(255)
    expect(g).toBe(128)  // Math.round(255/2)
    expect(b).toBe(128)
  })

  it('equal red+blue produces purple (128, 0, 128)', () => {
    const result = mixRGB([red, blue], { r: 1, bl: 1 })
    expect(result).toEqual([128, 0, 128])
  })

  it('3:1 red-to-white weighting skews towards red', () => {
    const [r, g, b] = mixRGB([red, white], { r: 3, w: 1 })
    // r = (255*3 + 255*1)/4 = 255, g = (0*3 + 255*1)/4 = 64
    expect(r).toBe(255)
    expect(g).toBe(64)
    expect(b).toBe(64)
  })

  it('adding black darkens proportionally', () => {
    const [r, g, b] = mixRGB([white, black], { w: 1, b: 1 })
    expect(r).toBe(128)
    expect(g).toBe(128)
    expect(b).toBe(128)
  })

  it('ignores pigments with zero amount', () => {
    const result = mixRGB([red, white, black], { r: 2, w: 0, b: 0 })
    expect(result).toEqual([255, 0, 0])
  })
})

describe('ColorMixGame — colourDist (Chebyshev)', () => {
  it('is 0 for identical colours', () => {
    expect(colourDist([100, 150, 200], [100, 150, 200])).toBe(0)
  })

  it('returns the largest channel difference', () => {
    expect(colourDist([0, 0, 0], [10, 20, 30])).toBe(30)
    expect(colourDist([255, 0, 0], [0, 255, 0])).toBe(255)
  })

  it('is symmetric', () => {
    const a: RGB = [100, 50, 200]
    const b: RGB = [80, 130, 150]
    expect(colourDist(a, b)).toBe(colourDist(b, a))
  })
})

describe('ColorMixGame — rgbToHex', () => {
  it('formats black correctly', () => {
    expect(rgbToHex([0, 0, 0])).toBe('#000000')
  })

  it('formats white correctly', () => {
    expect(rgbToHex([255, 255, 255])).toBe('#ffffff')
  })

  it('formats arbitrary colour correctly', () => {
    expect(rgbToHex([196, 52, 40])).toBe('#c43428')
  })

  it('pads single-digit hex values', () => {
    expect(rgbToHex([1, 2, 15])).toBe('#01020f')
  })
})

describe('PipelineGame — rotateDir', () => {
  it('0 turns leaves direction unchanged', () => {
    expect(rotateDir(0, 0)).toBe(0)
    expect(rotateDir(3, 0)).toBe(3)
  })

  it('1 turn CW: N→E→S→W→N', () => {
    expect(rotateDir(0, 1)).toBe(1)  // N→E
    expect(rotateDir(1, 1)).toBe(2)  // E→S
    expect(rotateDir(2, 1)).toBe(3)  // S→W
    expect(rotateDir(3, 1)).toBe(0)  // W→N
  })

  it('4 turns returns to original direction', () => {
    for (let d = 0; d < 4; d++) {
      expect(rotateDir(d as Dir, 4)).toBe(d)
    }
  })

  it('2 turns gives opposite direction', () => {
    expect(rotateDir(0, 2)).toBe(2)  // N→S
    expect(rotateDir(1, 2)).toBe(3)  // E→W
  })
})

describe('PipelineGame — getOpenings', () => {
  it('rotation 0 returns base unchanged', () => {
    expect(getOpenings([0, 2], 0)).toEqual([0, 2])  // vertical pipe: N+S
  })

  it('rotation 1 rotates all openings CW by 90°', () => {
    expect(getOpenings([0, 2], 1)).toEqual([1, 3])  // vertical → horizontal
  })

  it('cross pipe has same openings at any rotation', () => {
    const cross: Dir[] = [0, 1, 2, 3]
    for (let r = 0; r < 4; r++) {
      const result = getOpenings(cross, r).sort()
      expect(result).toEqual([0, 1, 2, 3])
    }
  })
})

describe('PipelineGame — floodFill BFS', () => {
  // Helper: build a minimal flat tile array for a 3×1 grid
  function tile(openings: Dir[]): PipeTile { return { openings, fixed: false } }

  it('source reaches only itself when no openings connect', () => {
    // 3×1: [E] [nothing] [W]
    const tiles = [tile([1]), tile([]), tile([3])]
    const reached = floodFill(tiles, 3, 1, 0)
    expect(reached.size).toBe(1)
    expect(reached.has(0)).toBe(true)
  })

  it('reaches all tiles in a straight connected horizontal pipe', () => {
    // 3×1: source[E] — [E,W] — sink[W]
    const tiles = [tile([1]), tile([1, 3]), tile([3])]
    const reached = floodFill(tiles, 3, 1, 0)
    expect(reached.size).toBe(3)
  })

  it('stops at a misaligned elbow', () => {
    // 3×1: source[E] — [W,S] — sink[W]
    // tile 1 opens W (receives from source) and S (out of bounds in 1-row grid)
    // tile 1 has no E opening so cannot send to tile 2
    const tiles = [tile([1]), tile([3, 2]), tile([3])]
    const reached = floodFill(tiles, 3, 1, 0)
    expect(reached.has(0)).toBe(true)   // source always in set
    expect(reached.has(1)).toBe(true)   // source E → tile 1 W: connects
    expect(reached.has(2)).toBe(false)  // tile 1 has no E opening → cannot reach tile 2
  })

  it('traverses a 2×2 L-shaped path', () => {
    // Grid (2 cols × 2 rows):
    //  [0]=source E+S  [1]=W
    //  [2]=N           [3]=sink (unreachable)
    const tiles = [
      tile([1, 2]),  // 0: opens E and S
      tile([3]),     // 1: opens W only (no N/S so can't go down)
      tile([0]),     // 2: opens N only
      tile([]),      // 3: not connected
    ]
    const reached = floodFill(tiles, 2, 2, 0)
    expect(reached.has(0)).toBe(true)   // source
    expect(reached.has(1)).toBe(true)   // 0→E connects to 1←W
    expect(reached.has(2)).toBe(true)   // 0→S connects to 2←N
    expect(reached.has(3)).toBe(false)  // not connected
  })

  it('does not revisit already-reached cells', () => {
    // Loop: 4 tiles in a square, all open inward — ensures BFS terminates
    const tiles = [
      tile([1, 2]),  // 0: E+S
      tile([2, 3]),  // 1: S+W
      tile([0, 1]),  // 2: N+E (but row 1 col 0, its N is row 0 col 0)
      tile([0, 3]),  // 3: N+W
    ]
    const reached = floodFill(tiles, 2, 2, 0)
    // All four should be reachable without infinite loop
    expect(reached.size).toBe(4)
  })
})

describe('StorySortGame — shuffle', () => {
  const original = ['A', 'B', 'C', 'D', 'E']

  it('returns same length as input', () => {
    const result = shuffle(original)
    expect(result).toHaveLength(original.length)
  })

  it('contains every element exactly once (is a permutation)', () => {
    const result = shuffle(original)
    expect([...result].sort()).toEqual([...original].sort())
  })

  it('does not mutate the input array', () => {
    const copy = [...original]
    shuffle(copy)
    expect(copy).toEqual(original)
  })

  it('produces different orderings over many runs', () => {
    // With 5 items there are 120 permutations; 20 shuffles should not all match
    const allSame = Array.from({ length: 20 }, () => shuffle(original).join(','))
      .every(s => s === original.join(','))
    expect(allSame).toBe(false)
  })
})
