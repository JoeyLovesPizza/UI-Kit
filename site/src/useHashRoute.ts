import { useEffect, useState } from 'react'

function currentRoute(): string {
  return window.location.hash.replace(/^#/, '') || '/'
}

/** Minimal hash-based router — no react-router needed for a handful of pages. */
export function useHashRoute(): string {
  const [route, setRoute] = useState(currentRoute)

  useEffect(() => {
    const onHashChange = () => setRoute(currentRoute())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  return route
}
