interface DialsToggleProps {
  on: boolean
  onChange: (on: boolean) => void
  /** Which panel this switches, for the button's label. */
  name: string
}

/**
 * Flips one component's `dials` prop. Turning them off leaves that component
 * running on its `defaults` and takes its panel off screen, so the panels that
 * are left belong to the thing you're actually tuning.
 */
export function DialsToggle({ on, onChange, name }: DialsToggleProps) {
  return (
    <button type="button" className="btn" aria-pressed={on} onClick={() => onChange(!on)}>
      {on ? `Turn ${name} dials off` : `Turn ${name} dials on`}
    </button>
  )
}
