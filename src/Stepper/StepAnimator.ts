export type StepPhase = 'entering' | 'stable' | 'exiting'

export interface AnimatingStep {
  key: number
  index: number
  phase: StepPhase
}

/**
 * Tracks steps across a changing `count` so added/removed steps can animate
 * in/out instead of snapping. New steps enter, then get promoted to stable
 * once the browser has painted their initial collapsed state; removed steps
 * are marked exiting (kept in the DOM mid-transition) rather than dropped
 * immediately. Held in a ref by `useAnimatingSteps` since it's mutated
 * in place across renders.
 */
export class StepAnimator {
  private keyGen: number
  private steps: AnimatingStep[]

  constructor(count: number) {
    this.keyGen = count
    this.steps = Array.from({ length: count }, (_, i) => ({ key: i, index: i, phase: 'stable' }))
  }

  reconcile(newCount: number): void {
    const liveCount = this.steps.filter((s) => s.phase !== 'exiting').length
    if (liveCount === newCount) return

    if (newCount < liveCount) {
      let seen = 0
      this.steps = this.steps.map((s) => {
        if (s.phase === 'exiting') return s
        seen++
        return seen > newCount ? { ...s, phase: 'exiting' as const } : s
      })
    }

    if (newCount > liveCount) {
      for (let i = liveCount; i < newCount; i++) {
        this.keyGen++
        this.steps.push({ key: this.keyGen, index: i, phase: 'entering' })
      }
    }

    let idx = 0
    this.steps = this.steps.map((s) => (s.phase === 'exiting' ? s : { ...s, index: idx++ }))
  }

  promoteEntering(): void {
    this.steps = this.steps.map((s) => (s.phase === 'entering' ? { ...s, phase: 'stable' as const } : s))
  }

  removeExiting(): void {
    this.steps = this.steps.filter((s) => s.phase !== 'exiting')
  }

  getSteps(): AnimatingStep[] {
    return [...this.steps]
  }
}
