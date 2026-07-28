import type { StepPhase } from '../Stepper/StepAnimator'
import './Step.css'

interface StepProps {
  index: number
  isActive: boolean
  phase: StepPhase
  filling?: boolean
  fillDuration?: number
  onClick?: () => void
}

export function Step({ index, isActive, phase, filling, fillDuration, onClick }: StepProps) {
  const className = [
    'step',
    isActive && 'is-active',
    isActive && filling && 'is-filling',
    phase === 'entering' && 'is-entering',
    phase === 'exiting' && 'is-exiting',
  ]
    .filter(Boolean)
    .join(' ')

  const style =
    isActive && filling && fillDuration
      ? ({ '--stepper-fill-duration': `${fillDuration}ms` } as React.CSSProperties)
      : undefined

  return (
    <button
      type="button"
      className={className}
      style={style}
      onClick={onClick}
      role="tab"
      aria-selected={isActive}
      aria-label={`Step ${index + 1}`}
      tabIndex={isActive ? 0 : -1}
    />
  )
}
