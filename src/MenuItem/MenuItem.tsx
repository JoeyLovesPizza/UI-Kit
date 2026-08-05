import { motion, type Transition, type Variants } from 'motion/react'
import type { MenuItemData } from '../Menu/types'
import './MenuItem.css'

interface MenuItemProps {
  item: MenuItemData
  /** Dark text — the row is hovered, keyboard-focused, or owns the open submenu. */
  isActive: boolean
  /**
   * Renders in the selected state — either this is the page you're on, or a
   * parent whose section you're inside. Its resting colour, under hover.
   */
  isSelected: boolean
  /**
   * This row *is* the current page, as opposed to an ancestor of it. Only the
   * exact row gets `aria-current`; marking the section too would announce two
   * current items in one menu.
   */
  isCurrent: boolean
  hasSubmenu: boolean
  expanded: boolean
  tabIndex: number
  /** Drives the label/subtext color shift. Tunable from the DialKit panel. */
  hoverTransition: Transition
  /** Set on submenu rows so they stagger in behind the panel. */
  variants?: Variants
  onActivate: () => void
  onPointerEnter: () => void
  onFocus: () => void
}

export function MenuItem({
  item,
  isActive,
  isSelected,
  isCurrent,
  hasSubmenu,
  expanded,
  tabIndex,
  hoverTransition,
  variants,
  onActivate,
  onPointerEnter,
  onFocus,
}: MenuItemProps) {
  const className = [
    'menu-item',
    isActive && 'is-active',
    isSelected && 'is-selected',
    item.description && 'has-description',
    item.disabled && 'is-disabled',
  ]
    .filter(Boolean)
    .join(' ')

  // Selected is the resting colour for the current page; hover still takes
  // over while the pointer is on the row. Which selected colour resolves is
  // decided in CSS by the panel around it, so the Label and Label & Subtext
  // rows can carry different values without this needing to know which it is.
  const labelColor = isActive
    ? 'var(--menu-label-color-active)'
    : isSelected
      ? 'var(--menu-selected-label)'
      : 'var(--menu-label-color)'

  const descriptionColor = isActive
    ? 'var(--menu-description-color-active)'
    : isSelected
      ? 'var(--menu-selected-description)'
      : 'var(--menu-description-color)'

  const shared = {
    className,
    role: 'menuitem',
    tabIndex,
    variants,
    'aria-disabled': item.disabled || undefined,
    // The accessible half of "the page you're on".
    'aria-current': isCurrent ? ('page' as const) : undefined,
    ...(hasSubmenu && { 'aria-haspopup': 'menu' as const, 'aria-expanded': expanded }),
    onPointerEnter,
    onFocus,
    onClick: (event: React.MouseEvent) => {
      if (item.disabled) {
        event.preventDefault()
        return
      }
      // A parent row toggles its submenu rather than navigating, so the pattern
      // still works on touch, where there's no hover to open it with.
      if (hasSubmenu) event.preventDefault()
      onActivate()
    },
  }

  // The hover fill is its own layer rather than a background on the row: the
  // row element carries the entrance `variants`, and a Motion element can't
  // both follow a parent's variant and run its own `animate` object.
  const content = (
    <>
      <motion.span
        className="menu-item-surface"
        aria-hidden="true"
        initial={false}
        animate={{ opacity: isActive ? 1 : 0 }}
        transition={hoverTransition}
      />
      <motion.span
        className="menu-item-label"
        initial={false}
        animate={{ color: labelColor }}
        transition={hoverTransition}
      >
        {item.label}
      </motion.span>
      {item.description && (
        <motion.span
          className="menu-item-description"
          initial={false}
          animate={{ color: descriptionColor }}
          transition={hoverTransition}
        >
          {item.description}
        </motion.span>
      )}
    </>
  )

  if (item.href && !item.disabled) {
    return (
      <motion.a {...shared} href={item.href}>
        {content}
      </motion.a>
    )
  }

  return (
    <motion.button {...shared} type="button" disabled={item.disabled}>
      {content}
    </motion.button>
  )
}
