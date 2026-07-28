import { useCallback, useEffect, useRef, useState } from 'react'

export interface UseAutoPlayOptions {
  count: number
  active: number
  onStepChange: (index: number) => void
  /** Time per step in ms. Defaults to 3000. */
  stepDuration?: number
  /** Loop back to the first step after the last. Defaults to true. */
  loop?: boolean
  /** When false, stops playback and resets `playing`. Defaults to true. */
  enabled?: boolean
}

export interface UseAutoPlayReturn {
  playing: boolean
  toggle: () => void
  /** Pass straight through to `Stepper`'s `filling` prop. */
  filling: boolean
  /** Pass straight through to `Stepper`'s `fillDuration` prop. */
  fillDuration: number
}

function computeNextStep(active: number, count: number, loop: boolean): number | null {
  if (active < count - 1) return active + 1
  return loop ? 0 : null
}

/** Drives timed step changes with a visible fill animation. Pause, resume, and loop are all built in. */
export function useAutoPlay({
  count,
  active,
  onStepChange,
  stepDuration = 3000,
  loop = true,
  enabled = true,
}: UseAutoPlayOptions): UseAutoPlayReturn {
  const [playing, setPlaying] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const toggle = useCallback(() => setPlaying((p) => !p), [])

  useEffect(() => {
    if (!enabled) {
      setPlaying(false)
      clearTimer()
    }
  }, [enabled, clearTimer])

  useEffect(() => {
    if (!playing || !enabled) {
      clearTimer()
      return
    }

    timerRef.current = setTimeout(() => {
      const next = computeNextStep(active, count, loop)
      if (next !== null) {
        onStepChange(next)
      } else {
        setPlaying(false)
      }
    }, stepDuration)

    return clearTimer
  }, [playing, enabled, active, count, stepDuration, loop, onStepChange, clearTimer])

  const isActive = playing && enabled

  return { playing: isActive, toggle, filling: isActive, fillDuration: stepDuration }
}
