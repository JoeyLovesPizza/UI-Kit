export type StepperOrientation = 'horizontal' | 'vertical'

export interface StepWindow {
  transformValue: string
  containerSize: number | undefined
}

// Mirrors the defaults baked into Stepper.css (--stepper-dot-size,
// --stepper-active-width, --stepper-gap). The windowed transform/size math
// below is only correct against those defaults — overriding the CSS vars
// while also using `maxVisible` will drift the window from the real layout.
const DOT_SIZE = 8
const ACTIVE_WIDTH = 24
const GAP = 6
const SLOT_SIZE = DOT_SIZE + GAP

/**
 * When `maxVisible` is set and there are more steps than fit, slides the
 * track so the active step stays centered in the visible window and caps
 * the container to a fixed size (so growing/shrinking step counts outside
 * the window don't resize the pill strip).
 */
export function computeStepWindow(
  count: number,
  active: number,
  maxVisible: number | undefined,
  orientation: StepperOrientation
): StepWindow {
  if (maxVisible == null || count <= maxVisible) {
    return { transformValue: 'none', containerSize: undefined }
  }

  const half = Math.floor(maxVisible / 2)
  const windowStart = Math.max(0, Math.min(active - half, count - maxVisible))
  const offset = windowStart * SLOT_SIZE
  const axis = orientation === 'vertical' ? 'Y' : 'X'

  const containerSize = (maxVisible - 1) * DOT_SIZE + ACTIVE_WIDTH + (maxVisible - 1) * GAP

  return { transformValue: `translate${axis}(-${offset}px)`, containerSize }
}
