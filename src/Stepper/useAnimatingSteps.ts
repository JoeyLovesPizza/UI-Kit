import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { StepAnimator, type AnimatingStep } from './StepAnimator'

// Buffer past the 250ms enter/exit transition defined in Step.css.
const EXIT_CLEANUP_MS = 300

export function useAnimatingSteps(count: number): AnimatingStep[] {
  const animatorRef = useRef<StepAnimator | null>(null)
  if (animatorRef.current === null) {
    animatorRef.current = new StepAnimator(count)
  }
  const animator = animatorRef.current

  const [steps, setSteps] = useState<AnimatingStep[]>(() => animator.getSteps())

  // Reconcile when count changes — runs before paint so there's no flash.
  useLayoutEffect(() => {
    animator.reconcile(count)
    setSteps(animator.getSteps())
  }, [count, animator])

  // Promote entering -> stable only after the browser paints the
  // width:0/opacity:0 state, so the transition to full size actually fires.
  const hasEntering = steps.some((s) => s.phase === 'entering')
  useEffect(() => {
    if (!hasEntering) return
    let raf2 = 0
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        animator.promoteEntering()
        setSteps(animator.getSteps())
      })
    })
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
    }
  }, [hasEntering, animator])

  // Drop exiting steps from the DOM once their collapse transition finishes.
  const exitingCount = steps.filter((s) => s.phase === 'exiting').length
  useEffect(() => {
    if (exitingCount === 0) return
    const timer = setTimeout(() => {
      animator.removeExiting()
      setSteps(animator.getSteps())
    }, EXIT_CLEANUP_MS)
    return () => clearTimeout(timer)
  }, [exitingCount, animator])

  return steps
}
