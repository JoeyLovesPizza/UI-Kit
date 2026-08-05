import { forwardRef, type ReactNode } from 'react'
import { motion, type Variants } from 'motion/react'

interface MenuPanelProps {
  /** `multi` is the label-and-subtext variant: padded rows, tighter gap. */
  variant: 'single' | 'multi'
  label: string
  children: ReactNode
  /**
   * Orchestrates the staggered entrance of the rows inside. Only the submenu
   * passes this — the main menu is always on screen and never animates in.
   */
  variants?: Variants
  style?: React.CSSProperties
  onPointerLeave?: (event: React.PointerEvent<HTMLDivElement>) => void
  onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void
}

/** The frosted glass surface both menu levels share. */
export const MenuPanel = forwardRef<HTMLDivElement, MenuPanelProps>(function MenuPanel(
  { variant, label, children, variants, style, onPointerLeave, onKeyDown },
  ref
) {
  return (
    <motion.div
      ref={ref}
      className={`menu-panel menu-panel-${variant}`}
      role="menu"
      aria-label={label}
      aria-orientation="vertical"
      style={style}
      variants={variants}
      initial={variants ? 'hidden' : undefined}
      animate={variants ? 'visible' : undefined}
      onPointerLeave={onPointerLeave}
      onKeyDown={onKeyDown}
    >
      {children}
    </motion.div>
  )
})
