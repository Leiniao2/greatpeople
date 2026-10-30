import type { ReactNode } from 'react'
import LoadingScreen from '@/components/LoadingScreen'
import { useAssetPreload } from '@/hooks/useAssetPreload'

interface Props {
  /** Image URLs the page needs before it is shown. */
  assets: string[]
  label?: string
  children: ReactNode
}

/**
 * Holds a page behind the loading screen until its artwork is decoded, then
 * fades the page in.  Pages that reuse already-loaded artwork render at once.
 */
export default function PageLoader({ assets, label, children }: Props) {
  const { ready, progress } = useAssetPreload(assets)
  if (!ready) return <LoadingScreen progress={progress} label={label} />
  return <div className="animate-fade-in">{children}</div>
}
