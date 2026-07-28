import { useMemo, type CSSProperties } from 'react'
import { Step } from '../Step/Step'
import { computeStepWindow, type StepperOrientation } from './computeStepWindow'
import { useAnimatingSteps } from './useAnimatingSteps'
import './Stepper.css'

export interface StepperProps {
  /** Total number of steps. */
  count: number
  /** Zero-based active step index. */
  active: number
  /** Called when a step is clicked. */
  onStepClick?: (index: number) => void
  /** Layout direction. Defaults to "horizontal". */
  orientation?: StepperOrientation
  /** Visible steps before windowing kicks in. */
  maxVisible?: number
  /** Transition duration in ms. Defaults to 500. */
  transitionDuration?: number
  /** CSS transition timing function. */
  easing?: string
  /** Show fill progress on the active step (drive with `useAutoPlay`). */
  filling?: boolean
  /** Fill animation duration in ms. Defaults to 3000. */
  fillDuration?: number
  /** Additional class for CSS custom-property overrides (see Stepper.css). */
  className?: string
}

export function Stepper({
  count,
  active,
  onStepClick,
  orientation = 'horizontal',
  maxVisible,
  transitionDuration = 500,
  easing,
  filling,
  fillDuration,
  className,
}: StepperProps) {
  const { transformValue, containerSize } = useMemo(
    () => computeStepWindow(count, active, maxVisible, orientation),
    [count, active, maxVisible, orientation]
  )

  const animatingSteps = useAnimatingSteps(count)

  const containerClassName = ['stepper', orientation === 'vertical' && 'stepper-vertical', className]
    .filter(Boolean)
    .join(' ')

  const sizeStyle: CSSProperties = {}
  if (containerSize != null) {
    if (orientation === 'vertical') sizeStyle.height = containerSize
    else sizeStyle.width = containerSize
  }

  return (
    <div
      className={containerClassName}
      role="tablist"
      aria-label="Progress steps"
      style={
        {
          '--stepper-duration': `${transitionDuration}ms`,
          ...(easing && { '--stepper-easing': easing }),
          ...sizeStyle,
        } as CSSProperties
      }
    >
      <div className="stepper-track" style={{ transform: transformValue }}>
        {animatingSteps.map((step) => (
          <Step
            key={step.key}
            index={step.index}
            isActive={step.index === active}
            phase={step.phase}
            filling={step.index === active && filling}
            fillDuration={fillDuration}
            onClick={onStepClick ? () => onStepClick(step.index) : undefined}
          />
        ))}
      </div>
    </div>
  )
}
