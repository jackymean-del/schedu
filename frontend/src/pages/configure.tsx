/**
 * Configure — redirects to Settings (org profile lives there).
 */
import { useEffect } from 'react'

export function ConfigurePage() {
  useEffect(() => { window.location.replace('/settings') }, [])
  return null
}
