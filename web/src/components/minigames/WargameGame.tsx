import { useState, useEffect, useCallback, useRef } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────────

type Color = 'light' | 'dark'
type PieceType = 'man' | 'king'

interface Piece { color: Color; type: PieceType }
type Board = (Piece | null)[][]

interface Move {
  from: [number, number]
  to: [number, number]
  captures: [number, number][]
}

type Phase = 'playing' | 'cpu-thinking' | 'player-won' | 'cpu-won'

// ── Config ─────────────────────────────────────────────────────────────────────

interface WargameConfig {
  title: string
  playerLabel: string
  cpuLabel: string
}

const CONFIGS: Record<string, WargameConfig> = {
  'belisarius-battle': { title: 'Battle of Ad Decimum', playerLabel: 'Byzantine Forces', cpuLabel: 'Vandal Army' },
  'an-jung-geun':      { title: 'Defense of Korea',    playerLabel: 'Korean Resistance',  cpuLabel: 'Imperial Forces' },
  'mao-tactics':       { title: 'Jiangxi Campaign',    playerLabel: 'Red Army',            cpuLabel: 'KMT Forces' },
  'pleistoanax-war':   { title: 'Attica Campaign',     playerLabel: 'Spartan Army',        cpuLabel: 'Athenian Forces' },
  'sargon-battle':     { title: 'Conquest of Sumer',   playerLabel: 'Akkadian Forces',     cpuLabel: 'Sumerian Cities' },
  'gilgamesh-war':     { title: 'War of Uruk',         playerLabel: 'Uruk Forces',         cpuLabel: 'Forest Spirits' },
}

// ── Initial board ──────────────────────────────────────────────────────────────

function makeInitialBoard(): Board {
  const board: Board = Array.from({ length: 8 }, () => Array(8).fill(null))
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 === 1) board[r][c] = { color: 'dark', type: 'man' }
    }
  }
  for (let r = 5; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 === 1) board[r][c] = { color: 'light', type: 'man' }
    }
  }
  return board
}

// ── Move generation ────────────────────────────────────────────────────────────

function getValidMoves(board: Board, color: Color): Move[] {
  const moves: Move[] = []

  const forwardDir = color === 'light' ? -1 : 1

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c]
      if (!piece || piece.color !== color) continue

      const dirs: [number, number][] =
        piece.type === 'king'
          ? [[-1,-1],[-1,1],[1,-1],[1,1]]
          : [[forwardDir,-1],[forwardDir,1]]

      // Capture moves (multi-jump)
      collectCaptures(board, r, c, piece, dirs, [], moves)

      // Simple moves (only if no captures found yet)
      for (const [dr, dc] of dirs) {
        const nr = r + dr, nc = c + dc
        if (inBounds(nr, nc) && board[nr][nc] === null) {
          moves.push({ from: [r, c], to: [nr, nc], captures: [] })
        }
      }
    }
  }

  // Mandatory capture: if any captures, return only captures
  const captures = moves.filter(m => m.captures.length > 0)
  return captures.length > 0 ? captures : moves.filter(m => m.captures.length === 0)
}

function collectCaptures(
  board: Board,
  r: number,
  c: number,
  piece: Piece,
  dirs: [number, number][],
  alreadyCaptured: [number, number][],
  result: Move[],
): void {
  let foundFurther = false

  for (const [dr, dc] of dirs) {
    const er = r + dr, ec = c + dc   // enemy cell
    const lr = r + dr * 2, lc = c + dc * 2  // landing cell

    if (!inBounds(er, ec) || !inBounds(lr, lc)) continue
    const enemy = board[er][ec]
    if (!enemy || enemy.color === piece.color) continue
    if (board[lr][lc] !== null) continue
    if (alreadyCaptured.some(([ar, ac]) => ar === er && ac === ec)) continue

    foundFurther = true

    // Simulate capture to check for further jumps
    const newBoard = board.map(row => [...row])
    newBoard[er][ec] = null
    newBoard[r][c] = null
    newBoard[lr][lc] = piece

    const newCaptures: [number, number][] = [...alreadyCaptured, [er, ec]]

    // Check if piece would king at landing
    const wouldKing = piece.type === 'man' && (
      (piece.color === 'light' && lr === 0) || (piece.color === 'dark' && lr === 7)
    )
    const landingPiece: Piece = wouldKing ? { color: piece.color, type: 'king' } : piece
    const nextDirs: [number, number][] = landingPiece.type === 'king'
      ? [[-1,-1],[-1,1],[1,-1],[1,1]]
      : dirs

    const sub: Move[] = []
    collectCaptures(newBoard, lr, lc, landingPiece, nextDirs, newCaptures, sub)

    if (sub.length > 0) {
      for (const m of sub) result.push({ from: [r, c], to: m.to, captures: m.captures })
    } else {
      result.push({ from: [r, c], to: [lr, lc], captures: newCaptures })
    }
  }

  if (!foundFurther && alreadyCaptured.length > 0) {
    // Terminal multi-jump — already pushed by caller
  }
}

function inBounds(r: number, c: number): boolean {
  return r >= 0 && r < 8 && c >= 0 && c < 8
}

function applyMove(board: Board, move: Move): Board {
  const next = board.map(row => [...row])
  const piece = next[move.from[0]][move.from[1]]!
  next[move.from[0]][move.from[1]] = null
  for (const [cr, cc] of move.captures) next[cr][cc] = null

  // Crown if reaching back rank
  const [tr, tc] = move.to
  let finalPiece: Piece = piece
  if (piece.type === 'man') {
    if (piece.color === 'light' && tr === 0) finalPiece = { color: 'light', type: 'king' }
    if (piece.color === 'dark' && tr === 7) finalPiece = { color: 'dark', type: 'king' }
  }
  next[tr][tc] = finalPiece
  return next
}

function countPieces(board: Board, color: Color): number {
  let n = 0
  for (const row of board) for (const p of row) if (p?.color === color) n++
  return n
}

// ── CPU AI ─────────────────────────────────────────────────────────────────────

function cpuPickMove(board: Board): Move | null {
  const moves = getValidMoves(board, 'dark')
  if (moves.length === 0) return null

  // Score each move: captures * 10 + king bonus
  const scored = moves.map(m => {
    let score = m.captures.length * 10
    // King creation bonus
    const piece = board[m.from[0]][m.from[1]]!
    if (piece.type === 'man' && m.to[0] === 7) score += 5
    // Add small random noise
    score += Math.random()
    return { move: m, score }
  })

  scored.sort((a, b) => b.score - a.score)
  // Among top-scored (within 0.5 of max), pick randomly
  const best = scored[0].score
  const top = scored.filter(s => s.score >= best - 0.5)
  return top[Math.floor(Math.random() * top.length)].move
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function WargameGame({ configId, onWin }: { configId: string; onWin: () => void }) {
  const config = CONFIGS[configId] ?? CONFIGS['belisarius-battle']

  const [board, setBoard] = useState<Board>(makeInitialBoard)
  const [selected, setSelected] = useState<[number, number] | null>(null)
  const [validMoves, setValidMoves] = useState<Move[]>([])
  const [phase, setPhase] = useState<Phase>('playing')
  const [allPlayerMoves, setAllPlayerMoves] = useState<Move[]>(() => getValidMoves(makeInitialBoard(), 'light'))

  const boardRef = useRef(board)
  useEffect(() => { boardRef.current = board }, [board])

  // Recompute player moves whenever board changes and it's player's turn
  useEffect(() => {
    if (phase === 'playing') {
      const moves = getValidMoves(board, 'light')
      setAllPlayerMoves(moves)
      if (moves.length === 0) setPhase('cpu-won')
    }
  }, [board, phase])

  // CPU turn
  useEffect(() => {
    if (phase !== 'cpu-thinking') return
    const id = setTimeout(() => {
      const b = boardRef.current
      const move = cpuPickMove(b)
      if (!move) {
        setPhase('player-won')
        return
      }
      const next = applyMove(b, move)
      setBoard(next)
      // Check if player has pieces left
      if (countPieces(next, 'light') === 0) {
        setPhase('cpu-won')
      } else {
        setPhase('playing')
      }
    }, 600)
    return () => clearTimeout(id)
  }, [phase])

  const handleCellClick = useCallback((r: number, c: number) => {
    if (phase !== 'playing') return

    const piece = board[r][c]

    // Clicking own piece: select it
    if (piece?.color === 'light') {
      const pieceMoves = allPlayerMoves.filter(m => m.from[0] === r && m.from[1] === c)
      setSelected([r, c])
      setValidMoves(pieceMoves)
      return
    }

    // Clicking a valid move target
    if (selected) {
      const move = validMoves.find(m => m.to[0] === r && m.to[1] === c)
      if (move) {
        const next = applyMove(board, move)
        setBoard(next)
        setSelected(null)
        setValidMoves([])
        if (countPieces(next, 'dark') === 0) {
          setPhase('player-won')
        } else {
          setPhase('cpu-thinking')
        }
        return
      }
    }

    // Deselect
    setSelected(null)
    setValidMoves([])
  }, [phase, board, selected, validMoves, allPlayerMoves])

  const reset = () => {
    const b = makeInitialBoard()
    setBoard(b)
    setSelected(null)
    setValidMoves([])
    setPhase('playing')
    setAllPlayerMoves(getValidMoves(b, 'light'))
  }

  const lightCount = countPieces(board, 'light')
  const darkCount = countPieces(board, 'dark')

  const validTargets = new Set(validMoves.map(m => `${m.to[0]},${m.to[1]}`))

  // Highlight all pieces that have mandatory captures
  const captureSources = new Set(
    allPlayerMoves.filter(m => m.captures.length > 0).map(m => `${m.from[0]},${m.from[1]}`)
  )
  const hasMandatoryCapture = captureSources.size > 0

  return (
    <div className="flex flex-col items-center gap-3 text-white select-none">

      {/* Header */}
      <div className="text-center">
        <p className="text-amber-400 font-bold text-sm tracking-wide">{config.title}</p>
      </div>

      {/* Piece counts */}
      <div className="flex items-center gap-6 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded-full bg-amber-500 shadow-[0_0_5px_rgba(245,158,11,0.5)]" />
          <span className="text-slate-300">{config.playerLabel}</span>
          <span className="text-amber-400 font-bold">{lightCount}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded-full bg-red-700" />
          <span className="text-slate-300">{config.cpuLabel}</span>
          <span className="text-red-400 font-bold">{darkCount}</span>
        </div>
      </div>

      {/* Status bar */}
      <div className="text-xs font-semibold">
        {phase === 'playing' && (
          <span className="text-amber-300">
            {hasMandatoryCapture ? '⚔ Capture required — Your Turn' : 'Your Turn'}
          </span>
        )}
        {phase === 'cpu-thinking' && <span className="text-slate-400 animate-pulse">Enemy thinking…</span>}
        {phase === 'player-won' && <span className="text-emerald-400">Victory!</span>}
        {phase === 'cpu-won' && <span className="text-red-400">Defeated!</span>}
      </div>

      {/* Board */}
      <div className="relative rounded-xl overflow-hidden border border-slate-600/40"
           style={{ background: '#080812' }}>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(8, 36px)', gridTemplateRows: 'repeat(8, 36px)' }}>
          {Array.from({ length: 8 }, (_, r) =>
            Array.from({ length: 8 }, (_, c) => {
              const isDark = (r + c) % 2 === 1
              const piece = board[r][c]
              const isSelected = selected?.[0] === r && selected?.[1] === c
              const isTarget = isDark && validTargets.has(`${r},${c}`)
              const isCaptureSource = captureSources.has(`${r},${c}`) && !selected

              return (
                <div
                  key={`${r}-${c}`}
                  onClick={() => isDark ? handleCellClick(r, c) : undefined}
                  className={[
                    'relative flex items-center justify-center transition-colors duration-100',
                    isDark ? 'bg-slate-700 cursor-pointer' : 'bg-slate-800/50',
                    isSelected ? 'ring-2 ring-inset ring-amber-400' : '',
                    isCaptureSource ? 'ring-1 ring-inset ring-amber-500/60' : '',
                  ].join(' ')}
                  style={{ width: 36, height: 36 }}
                >
                  {/* Valid move dot */}
                  {isTarget && !piece && (
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-400/70 pointer-events-none" />
                  )}

                  {/* Capture target highlight */}
                  {isTarget && piece && (
                    <div className="absolute inset-0.5 rounded border border-amber-400/60 pointer-events-none" />
                  )}

                  {/* Piece */}
                  {piece && (
                    <div
                      className={[
                        'relative flex items-center justify-center rounded-full transition-transform duration-100',
                        piece.color === 'light'
                          ? 'bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.5)]'
                          : 'bg-red-700 shadow-[0_0_4px_rgba(185,28,28,0.4)]',
                        isSelected ? 'scale-110' : '',
                      ].join(' ')}
                      style={{ width: 26, height: 26 }}
                    >
                      {piece.type === 'king' && (
                        <span className="absolute -top-1.5 text-[9px] leading-none">★</span>
                      )}
                      <span className="text-[11px] leading-none">
                        {piece.color === 'light' ? '⚔' : '🛡'}
                      </span>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Instructions */}
      {phase === 'playing' && (
        <p className="text-slate-500 text-[10px] text-center">
          {selected ? 'Tap a highlighted square to move' : 'Tap your piece ⚔ to select'}
        </p>
      )}

      {/* Result overlay */}
      {(phase === 'player-won' || phase === 'cpu-won') && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-8 flex flex-col items-center gap-4 max-w-xs w-full mx-4">
            {phase === 'player-won' ? (
              <>
                <div className="text-5xl">🏆</div>
                <p className="text-amber-400 font-bold text-xl">Victory!</p>
                <p className="text-slate-300 text-sm text-center">
                  {config.playerLabel} has prevailed over {config.cpuLabel}.
                </p>
                <button
                  onClick={onWin}
                  className="w-full py-2.5 rounded-xl bg-amber-500 text-slate-900 font-bold text-sm hover:bg-amber-400 active:bg-amber-600 transition-colors"
                >
                  Continue →
                </button>
                <button
                  onClick={reset}
                  className="w-full py-2 rounded-xl bg-slate-700 text-slate-300 text-sm hover:bg-slate-600 transition-colors"
                >
                  Play Again
                </button>
              </>
            ) : (
              <>
                <div className="text-5xl">⚔</div>
                <p className="text-red-400 font-bold text-xl">Defeated</p>
                <p className="text-slate-300 text-sm text-center">
                  {config.cpuLabel} has overpowered your forces.
                </p>
                <button
                  onClick={reset}
                  className="w-full py-2.5 rounded-xl bg-amber-500 text-slate-900 font-bold text-sm hover:bg-amber-400 active:bg-amber-600 transition-colors"
                >
                  Try Again
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
