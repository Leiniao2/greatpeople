import { useState, useCallback } from 'react'

// A piece is defined by its cells (row, col offsets from a reference point)
// The board is a 2D grid where each cell holds a pieceId (0 = empty)
interface Piece {
  id: number
  cells: [number, number][]  // absolute [row, col] positions
  color: string
  label: string
  isGoal?: boolean
}

interface KlotskiConfig {
  title: string
  rows: number
  cols: number
  pieces: Piece[]
  // Win: goal piece (isGoal=true) top-left cell must reach targetRow, targetCol
  targetRow: number
  targetCol: number
  fact: string
}

// ── Configs ───────────────────────────────────────────────────────────────────

// pyramid-capstone: Ancient Egypt, 5×4 board
// Goal piece G (2×2) starts at (0,0), must reach (3,0)
// Verified ~12 move solution
const PYRAMID: KlotskiConfig = {
  title: 'The Capstone',
  rows: 5,
  cols: 4,
  pieces: [
    { id: 1, cells: [[0,0],[0,1],[1,0],[1,1]], color: '#f59e0b', label: '◆', isGoal: true },   // G 2×2 goal
    { id: 2, cells: [[0,2],[1,2]], color: '#818cf8', label: '|' },   // 2×1 vertical
    { id: 3, cells: [[0,3],[1,3]], color: '#818cf8', label: '|' },   // 2×1 vertical
    { id: 4, cells: [[2,0],[2,1]], color: '#34d399', label: '—' },   // 1×2 horizontal
    { id: 5, cells: [[2,2],[2,3]], color: '#34d399', label: '—' },   // 1×2 horizontal
    { id: 6, cells: [[3,0]], color: '#f87171', label: '□' },          // 1×1
    { id: 7, cells: [[3,3]], color: '#f87171', label: '□' },          // 1×1
    // rows 3 mid and row 4: empty for movement
  ],
  targetRow: 3,
  targetCol: 1,
  fact: 'The pyramids were built with a workforce of skilled, paid laborers — not slaves — who received food, medical care, and honored burial near the site.',
}

// enigma-rotors: Electricity era, L-shaped pieces
// 5×4 board, goal (1×2 horiz) at top, must reach (4,1)
const ENIGMA: KlotskiConfig = {
  title: 'The Enigma Rotors',
  rows: 5,
  cols: 4,
  pieces: [
    { id: 1, cells: [[0,1],[0,2]], color: '#f59e0b', label: '⚡', isGoal: true },      // 1×2 horiz goal
    { id: 2, cells: [[0,0],[1,0],[2,0]], color: '#818cf8', label: 'L' },               // 3×1 vertical
    { id: 3, cells: [[0,3],[1,3],[2,3]], color: '#818cf8', label: 'L' },               // 3×1 vertical
    { id: 4, cells: [[1,1],[1,2],[2,1]], color: '#34d399', label: '⌐' },              // L-shape
    { id: 5, cells: [[2,2],[3,2],[3,3]], color: '#60a5fa', label: '⌐' },              // L-shape mirror
    { id: 6, cells: [[3,0],[3,1]], color: '#f87171', label: '—' },                     // 1×2 horiz
    { id: 7, cells: [[4,0]], color: '#a78bfa', label: '□' },                            // 1×1
    { id: 8, cells: [[4,1],[4,2]], color: '#a78bfa', label: '—' },                     // 1×2 horiz
    { id: 9, cells: [[4,3]], color: '#a78bfa', label: '□' },                            // 1×1
  ],
  targetRow: 3,
  targetCol: 1,
  fact: 'The Enigma machine used a series of rotating cipher wheels. Alan Turing\'s bombe machine exploited a flaw — encrypted messages never mapped a letter to itself — to crack it.',
}

// last-general: Medieval, HuaRong Road variant
// Classic 5×4: one 2×2, two 1×2 vert, three 1×2 horiz, four 1×1
const LAST_GENERAL: KlotskiConfig = {
  title: 'Last General',
  rows: 5,
  cols: 4,
  pieces: [
    { id: 1, cells: [[0,1],[0,2],[1,1],[1,2]], color: '#f59e0b', label: '将', isGoal: true },   // 2×2 Cao Cao
    { id: 2, cells: [[0,0],[1,0]], color: '#818cf8', label: '|' },   // vertical left
    { id: 3, cells: [[0,3],[1,3]], color: '#818cf8', label: '|' },   // vertical right
    { id: 4, cells: [[2,0],[2,1]], color: '#34d399', label: '—' },   // horiz
    { id: 5, cells: [[2,2],[2,3]], color: '#34d399', label: '—' },   // horiz
    { id: 6, cells: [[3,1],[4,1]], color: '#60a5fa', label: '|' },   // vertical mid-left
    { id: 7, cells: [[3,2],[4,2]], color: '#60a5fa', label: '|' },   // vertical mid-right
    { id: 8, cells: [[3,0]], color: '#f87171', label: '□' },
    { id: 9, cells: [[3,3]], color: '#f87171', label: '□' },
    { id: 10, cells: [[4,0]], color: '#f87171', label: '□' },
    { id: 11, cells: [[4,3]], color: '#f87171', label: '□' },
  ],
  targetRow: 3,
  targetCol: 1,
  fact: 'HuaRong Road (华容道) is a classic Chinese sliding puzzle based on the story of Cao Cao\'s escape after the Battle of Red Cliffs (208 AD) — one of the most studied puzzles in combinatorics.',
}

// sword-formation: Renaissance, T-shaped pieces
// 5×4 board
const SWORD_FORMATION: KlotskiConfig = {
  title: 'The Sword Formation',
  rows: 5,
  cols: 4,
  pieces: [
    { id: 1, cells: [[0,1],[0,2],[1,1],[1,2]], color: '#f59e0b', label: '⚔', isGoal: true },   // 2×2 goal
    { id: 2, cells: [[0,0],[1,0],[2,0],[2,1]], color: '#818cf8', label: '⌐' },   // L-shape
    { id: 3, cells: [[0,3],[1,3],[2,3],[2,2]], color: '#818cf8', label: '¬' },   // mirror-L
    { id: 4, cells: [[2,1],[2,2],[3,2]], color: '#34d399', label: 'T' },          // T-shape (partial)
    { id: 5, cells: [[3,0],[3,1],[4,0]], color: '#60a5fa', label: '⌐' },         // small L
    { id: 6, cells: [[3,3],[4,3]], color: '#a78bfa', label: '|' },                // vertical
    { id: 7, cells: [[4,1]], color: '#f87171', label: '□' },
    { id: 8, cells: [[4,2]], color: '#f87171', label: '□' },
  ],
  targetRow: 3,
  targetCol: 1,
  fact: 'Renaissance military tacticians like Machiavelli revived Roman formation tactics. The "sword and shield" formation allowed disciplined infantry to hold against cavalry charges.',
}

const CONFIGS: Record<string, KlotskiConfig> = {
  'pyramid-capstone': PYRAMID,
  'enigma-rotors': ENIGMA,
  'last-general': LAST_GENERAL,
  'sword-formation': SWORD_FORMATION,
}

// ── Board helpers ─────────────────────────────────────────────────────────────

function buildBoard(rows: number, cols: number, pieces: Piece[]): number[][] {
  const board = Array.from({ length: rows }, () => Array(cols).fill(0))
  for (const p of pieces) {
    for (const [r, c] of p.cells) {
      if (r >= 0 && r < rows && c >= 0 && c < cols) board[r][c] = p.id
    }
  }
  return board
}

type Dir = 'up' | 'down' | 'left' | 'right'
const DELTAS: Record<Dir, [number, number]> = {
  up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1],
}

function canMove(piece: Piece, dir: Dir, board: number[][], rows: number, cols: number): boolean {
  const [dr, dc] = DELTAS[dir]
  const myIds = new Set(piece.cells.map(([r, c]) => r * cols + c))
  for (const [r, c] of piece.cells) {
    const nr = r + dr, nc = c + dc
    if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) return false
    const idx = nr * cols + nc
    if (!myIds.has(idx) && board[nr][nc] !== 0) return false
  }
  return true
}

function movePiece(piece: Piece, dir: Dir): Piece {
  const [dr, dc] = DELTAS[dir]
  return { ...piece, cells: piece.cells.map(([r, c]) => [r + dr, c + dc] as [number, number]) }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function KlotskiGame({ configId, onWin }: { configId: string; onWin: () => void }) {
  const cfg = CONFIGS[configId] ?? PYRAMID
  const [pieces, setPieces] = useState<Piece[]>(() => cfg.pieces.map(p => ({ ...p, cells: [...p.cells] })))
  const [selected, setSelected] = useState<number | null>(null)
  const [moves, setMoves] = useState(0)
  const [won, setWon] = useState(false)

  const board = buildBoard(cfg.rows, cfg.cols, pieces)

  const checkWin = useCallback((ps: Piece[]) => {
    const goal = ps.find(p => p.isGoal)
    if (!goal) return
    const topLeft = goal.cells.reduce((min, [r, c]) =>
      r < min[0] || (r === min[0] && c < min[1]) ? [r, c] : min, goal.cells[0])
    if (topLeft[0] === cfg.targetRow && topLeft[1] === cfg.targetCol) {
      setWon(true)
      setTimeout(onWin, 600)
    }
  }, [cfg.targetRow, cfg.targetCol, onWin])

  const handleMove = useCallback((dir: Dir) => {
    if (selected === null || won) return
    const piece = pieces.find(p => p.id === selected)
    if (!piece) return
    if (!canMove(piece, dir, board, cfg.rows, cfg.cols)) return
    const newPieces = pieces.map(p => p.id === selected ? movePiece(p, dir) : p)
    setPieces(newPieces)
    setMoves(m => m + 1)
    checkWin(newPieces)
  }, [selected, won, pieces, board, cfg.rows, cfg.cols, checkWin])

  const reset = () => {
    setPieces(cfg.pieces.map(p => ({ ...p, cells: [...p.cells] })))
    setSelected(null)
    setMoves(0)
    setWon(false)
  }

  const CELL = 56  // px per cell

  return (
    <div className="flex flex-col items-center gap-4 p-4 bg-slate-950 rounded-xl select-none">
      {/* Title + moves */}
      <div className="flex items-center justify-between w-full">
        <span className="text-amber-400 font-bold text-sm tracking-wide">{cfg.title}</span>
        <span className="text-slate-500 text-xs">{moves} moves</span>
      </div>

      {/* Target hint */}
      <p className="text-slate-400 text-xs text-center leading-relaxed">
        Slide the <span className="text-amber-400 font-bold">gold piece</span> to the marked target ✦
      </p>

      {/* Board */}
      <div
        className="relative rounded-xl overflow-hidden"
        style={{
          width: cfg.cols * CELL,
          height: cfg.rows * CELL,
          background: '#0f172a',
          border: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        {/* Grid lines */}
        {Array.from({ length: cfg.rows }).map((_, r) =>
          Array.from({ length: cfg.cols }).map((_, c) => (
            <div key={`${r}-${c}`}
              className="absolute"
              style={{
                left: c * CELL, top: r * CELL,
                width: CELL, height: CELL,
                border: '1px solid rgba(255,255,255,0.04)',
              }}
            />
          ))
        )}

        {/* Target marker */}
        <div
          className="absolute flex items-center justify-center text-amber-500/40 text-xl font-bold"
          style={{
            left: cfg.targetCol * CELL,
            top: cfg.targetRow * CELL,
            width: CELL * 2,
            height: CELL * 2,
            border: '2px dashed rgba(245,158,11,0.35)',
            borderRadius: 8,
          }}
        >
          ✦
        </div>

        {/* Pieces */}
        {pieces.map(piece => {
          const minR = Math.min(...piece.cells.map(([r]) => r))
          const minC = Math.min(...piece.cells.map(([, c]) => c))
          const maxR = Math.max(...piece.cells.map(([r]) => r))
          const maxC = Math.max(...piece.cells.map(([, c]) => c))
          const isSelected = selected === piece.id

          // For non-rectangular L/T shapes, render each cell individually
          const isRect = (maxR - minR + 1) * (maxC - minC + 1) === piece.cells.length

          if (isRect) {
            return (
              <button
                key={piece.id}
                onClick={() => setSelected(isSelected ? null : piece.id)}
                className="absolute flex items-center justify-center font-bold text-lg transition-all duration-150"
                style={{
                  left: minC * CELL + 3,
                  top: minR * CELL + 3,
                  width: (maxC - minC + 1) * CELL - 6,
                  height: (maxR - minR + 1) * CELL - 6,
                  background: isSelected
                    ? `${piece.color}33`
                    : `${piece.color}1a`,
                  border: `2px solid ${isSelected ? piece.color : piece.color + '66'}`,
                  borderRadius: 8,
                  color: piece.color,
                  boxShadow: isSelected ? `0 0 12px ${piece.color}44` : 'none',
                  zIndex: isSelected ? 10 : 1,
                }}
              >
                {piece.label}
              </button>
            )
          }

          // Non-rectangular: render cells individually
          return piece.cells.map(([r, c]) => (
            <button
              key={`${piece.id}-${r}-${c}`}
              onClick={() => setSelected(isSelected ? null : piece.id)}
              className="absolute flex items-center justify-center font-bold text-sm transition-all duration-150"
              style={{
                left: c * CELL + 3,
                top: r * CELL + 3,
                width: CELL - 6,
                height: CELL - 6,
                background: isSelected ? `${piece.color}33` : `${piece.color}1a`,
                border: `2px solid ${isSelected ? piece.color : piece.color + '66'}`,
                borderRadius: 6,
                color: piece.color,
                boxShadow: isSelected ? `0 0 8px ${piece.color}44` : 'none',
                zIndex: isSelected ? 10 : 1,
              }}
            >
              {r === minR && c === minC ? piece.label : ''}
            </button>
          ))
        })}
      </div>

      {/* Direction controls */}
      <div className="flex flex-col items-center gap-1">
        <button onClick={() => handleMove('up')} disabled={selected === null || won}
          className="w-12 h-10 rounded-xl bg-white/[0.06] border border-white/10 text-slate-300 hover:bg-white/[0.12] hover:text-white disabled:opacity-30 transition-all text-lg">
          ▲
        </button>
        <div className="flex gap-1">
          <button onClick={() => handleMove('left')} disabled={selected === null || won}
            className="w-12 h-10 rounded-xl bg-white/[0.06] border border-white/10 text-slate-300 hover:bg-white/[0.12] hover:text-white disabled:opacity-30 transition-all text-lg">
            ◀
          </button>
          <div className="w-12 h-10 flex items-center justify-center text-slate-600 text-xs">
            {selected ? '✦' : '—'}
          </div>
          <button onClick={() => handleMove('right')} disabled={selected === null || won}
            className="w-12 h-10 rounded-xl bg-white/[0.06] border border-white/10 text-slate-300 hover:bg-white/[0.12] hover:text-white disabled:opacity-30 transition-all text-lg">
            ▶
          </button>
        </div>
        <button onClick={() => handleMove('down')} disabled={selected === null || won}
          className="w-12 h-10 rounded-xl bg-white/[0.06] border border-white/10 text-slate-300 hover:bg-white/[0.12] hover:text-white disabled:opacity-30 transition-all text-lg">
          ▼
        </button>
      </div>

      {/* Win overlay */}
      {won && (
        <div className="w-full p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-center">
          <p className="text-emerald-300 font-bold mb-1">Solved in {moves} moves!</p>
          <p className="text-slate-400 text-xs leading-relaxed">{cfg.fact}</p>
        </div>
      )}

      {/* Reset */}
      <button onClick={reset}
        className="text-slate-600 text-xs hover:text-slate-400 transition-all underline underline-offset-2">
        Reset
      </button>
    </div>
  )
}
