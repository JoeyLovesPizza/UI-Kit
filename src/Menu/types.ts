export interface MenuItemData {
  id: string
  label: string
  /**
   * Second line under the label. A panel where any item has one renders as the
   * taller "label & support" variant — that's the whole difference between the
   * main menu and a submenu.
   */
  description?: string
  /** Renders the row as a link instead of a button. */
  href?: string
  disabled?: boolean
  /** Nested rows. An item with children opens a submenu instead of selecting. */
  items?: MenuItemData[]
}

/** Which side of the main menu the submenu opens on. */
export type MenuSide = 'right' | 'left'

/**
 * How the submenu lines up with the main menu vertically. `bottom` matches the
 * design (both panels share a baseline); `item` pins it to the trigger row.
 */
export type MenuAlign = 'bottom' | 'top' | 'item'

/** The point the submenu scales out of when it opens. */
export type MenuOpenAnchor =
  | 'trigger row'
  | 'panel edge'
  | 'top corner'
  | 'bottom corner'
  | 'center'

export const MENU_OPEN_ANCHORS: MenuOpenAnchor[] = [
  'trigger row',
  'panel edge',
  'top corner',
  'bottom corner',
  'center',
]

/**
 * Per-scenario starting values for the DialKit panel. The tunable ranges and
 * the transition editors stay fixed — this only moves where each slider opens,
 * so different apps can start from motion that suits them without dragging
 * dials by hand every time.
 */
export interface MenuDefaults {
  /** The frosted panel itself, rather than how it moves. */
  surface?: {
    /** Backdrop blur radius in CSS pixels, matching the Figma value directly. */
    blur?: number
  }
  /** Where the submenu opens from. */
  openFrom?: {
    anchor?: MenuOpenAnchor
    offsetX?: number
    offsetY?: number
    scale?: number
  }
  /** How the rows render in separately from the panel around them. */
  content?: {
    delay?: number
    stagger?: number
    offsetX?: number
    offsetY?: number
    scale?: number
    blur?: number
    resizeHandoff?: number
  }
}
