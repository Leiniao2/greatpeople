import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { cardsApi } from '@/api/cards'
import type { Card } from '@/types'

export default function CollectionPage() {
  const [cards, setCards] = useState<Card[]>([])
  const navigate = useNavigate()

  useEffect(() => {
    cardsApi.getAll().then(setCards)
  }, [])

  return (
    <div style={{ padding: 24 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>My Collection ({cards.length})</h2>
        <button onClick={() => navigate('/battle')}>Battle</button>
      </header>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16, marginTop: 24 }}>
        {cards.map((card) => (
          <div key={card.id} style={{ border: '1px solid #ccc', borderRadius: 8, padding: 12 }}>
            <img src={card.portraitUrl} alt={card.figureName} style={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 4 }} />
            <strong style={{ display: 'block', marginTop: 8 }}>{card.figureName}</strong>
            <small>{card.tier} · {card.domain}</small>
          </div>
        ))}
      </div>
    </div>
  )
}
