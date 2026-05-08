import { useEffect, useRef, useState } from 'react'
import { battleApi, createBattleSocket } from '@/api/battle'
import type { Match, BattleMessage } from '@/types'
import type { Socket } from 'socket.io-client'

export default function BattlePage() {
  const [match, setMatch] = useState<Match | null>(null)
  const [messages, setMessages] = useState<BattleMessage[]>([])
  const socketRef = useRef<Socket | null>(null)

  const findMatch = async () => {
    const m = await battleApi.findMatch()
    setMatch(m)
    if (m.status === 'active') {
      socketRef.current = createBattleSocket(m.id, (msg) => {
        setMessages((prev) => [...prev, msg])
      })
    }
  }

  const forfeit = async () => {
    if (!match) return
    await battleApi.forfeit(match.id)
    socketRef.current?.disconnect()
    setMatch(null)
  }

  useEffect(() => () => { socketRef.current?.disconnect() }, [])

  return (
    <div style={{ padding: 24 }}>
      <h2>Battle</h2>
      {!match ? (
        <button onClick={findMatch}>Find Match</button>
      ) : (
        <>
          <p>Match {match.id} — {match.status}</p>
          <p>Score: {match.scoreA} — {match.scoreB}</p>
          <ul>{messages.map((m, i) => <li key={i}>{m.event}</li>)}</ul>
          <button onClick={forfeit}>Forfeit</button>
        </>
      )}
    </div>
  )
}
