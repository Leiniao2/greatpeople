import { useMemo, useState } from 'react'

export function useSort<T>(rows: T[], initial: string, get: (r: T, key: string) => string | number | null | undefined) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: initial, dir: 1 })
  const sorted = useMemo(() => {
    const out = [...rows]
    out.sort((a, b) => {
      const va = get(a, sort.key), vb = get(b, sort.key)
      if (va == null && vb == null) return 0
      if (va == null) return 1
      if (vb == null) return -1
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sort.dir
      return String(va).localeCompare(String(vb)) * sort.dir
    })
    return out
  }, [rows, sort, get])
  const toggle = (key: string) => setSort(s => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }))
  const Th = ({ k, children }: { k: string; children: React.ReactNode }) => (
    <th onClick={() => toggle(k)}>{children}{sort.key === k ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}</th>
  )
  return { sorted, Th }
}
