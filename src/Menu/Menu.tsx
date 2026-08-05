import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  type Transition,
  type Variants,
} from 'motion/react'
import { useDialKit } from 'dialkit'
import { MenuItem } from '../MenuItem/MenuItem'
import { MenuPanel } from './MenuPanel'
import { buildSafeTriangle, pointInRect, pointInTriangle, type Triangle } from './safeTriangle'
import {
  MENU_OPEN_ANCHORS,
  type MenuAlign,
  type MenuDefaults,
  type MenuItemData,
  type MenuOpenAnchor,
  type MenuSide,
} from './types'
import './Menu.css'

export interface MenuProps {
  /** Rows of the main menu. An item with `items` opens a submenu on hover. */
  items: MenuItemData[]
  /** Called when a leaf row is chosen. `path` is the ancestry, ending with the row itself. */
  onSelect?: (item: MenuItemData, path: MenuItemData[]) => void
  /** Which side the submenu opens on. Defaults to "right". */
  side?: MenuSide
  /** Vertical alignment of the submenu against the main menu. Defaults to "bottom". */
  align?: MenuAlign
  /** Hover dwell before the submenu opens, in ms. Ignored once a submenu is already open. Defaults to 90. */
  openDelay?: number
  /** Grace period after the pointer leaves the menu and its safe area, in ms. Defaults to 220. */
  closeDelay?: number
  /**
   * `id` of the row for the page you're currently on, at either level. It
   * renders in the selected state and carries `aria-current="page"`.
   */
  selectedId?: string
  /** Accessible name for the main menu. */
  label?: string
  /** Name of this menu's DialKit panel. */
  panelName?: string
  /** Per-scenario starting values for the DialKit sliders. */
  defaults?: MenuDefaults
  /** Additional class for CSS custom-property overrides (see Menu.css). */
  className?: string
}

// How far outside the wedge still counts as "heading for the submenu". Absorbs
// the gap between panels and the sampling error on a fast diagonal.
const SAFE_TRIANGLE_BUFFER = 12

/**
 * Rows of one panel. Accepts either the panel itself or a wrapper around it —
 * the submenu is wrapped in a motion element, so its rows are a level deeper
 * than the main menu's.
 */
function menuItemsIn(container: HTMLElement | null): HTMLElement[] {
  if (!container) return []
  const panel = container.classList.contains('menu-panel')
    ? container
    : container.querySelector('.menu-panel')
  if (!panel) return []
  return Array.from(panel.querySelectorAll<HTMLElement>(':scope > [role="menuitem"]'))
}

function focusableItemsIn(container: HTMLElement | null): HTMLElement[] {
  return menuItemsIn(container).filter((el) => el.getAttribute('aria-disabled') !== 'true')
}

function moveFocus(container: HTMLElement | null, delta: number) {
  const elements = focusableItemsIn(container)
  if (!elements.length) return
  const current = elements.indexOf(document.activeElement as HTMLElement)
  // -1 (nothing focused yet) + 1 lands on the first item, which is what we want.
  const next = (current + delta + elements.length) % elements.length
  elements[next]?.focus()
}

function focusEdge(container: HTMLElement | null, edge: 'first' | 'last') {
  const elements = focusableItemsIn(container)
  if (!elements.length) return
  elements[edge === 'first' ? 0 : elements.length - 1]?.focus()
}

/**
 * Maps the "opens from" anchor to a transform-origin on the submenu, so the
 * panel scales out of that point. `triggerCenter` is the trigger row's vertical
 * center as a percentage of the submenu's height, measured once it's on screen.
 */
function transformOriginFor(
  anchor: MenuOpenAnchor,
  side: MenuSide,
  triggerCenter: number
): string {
  const nearEdge = side === 'right' ? '0%' : '100%'
  switch (anchor) {
    case 'trigger row':
      return `${nearEdge} ${triggerCenter}%`
    case 'top corner':
      return `${nearEdge} 0%`
    case 'bottom corner':
      return `${nearEdge} 100%`
    case 'center':
      return '50% 50%'
    case 'panel edge':
    default:
      return `${nearEdge} 50%`
  }
}

/**
 * Whether the panel opens by transform rather than by growing its real size.
 *
 * Growing the sizer's actual width and height is what makes an open read as an
 * open: the panel is pinned by CSS at the corner nearest the main menu, so
 * both dimensions expand away from that corner and the rows are uncovered from
 * behind the travelling edges. A transform can't do that — it stretches the
 * rows along with the box instead of revealing them.
 *
 * A centred anchor is the exception. Real dimensions can only ever grow away
 * from the pinned corner, so there's no way to expand about the middle; that
 * one keeps a transform, which honours its transform-origin.
 */
function opensByTransform(anchor: MenuOpenAnchor): boolean {
  return anchor === 'center'
}

/**
 * Two-level hover menu. The main menu is one line of text per row; a row with
 * children opens a submenu whose rows carry a label and a line of subtext.
 *
 * Moving diagonally from a row into its submenu is protected by a safe
 * triangle — while the pointer is inside the wedge between the row it left and
 * the submenu's near edge, the submenu is held open even though the pointer is
 * over neither panel.
 */
export function Menu({
  items,
  onSelect,
  side = 'right',
  align = 'bottom',
  openDelay = 90,
  closeDelay = 220,
  selectedId,
  label = 'Menu',
  panelName = 'Menu',
  defaults,
  className,
}: MenuProps) {
  // The explicit id keys the panel to `panelName` rather than to this hook
  // instance. Without it DialKit falls back to a per-instance useId(), so every
  // menu on a page would register its own duplicate copy of these controls.
  // Sharing a name now means sharing one panel; give a menu its own name to
  // tune it separately.
  const params = useDialKit(panelName, {
    openFrom: {
      // The point the submenu scales out of.
      anchor: {
        type: 'select',
        options: MENU_OPEN_ANCHORS,
        // Bottom corner by default: this menu is built to sit at the bottom
        // left of a page, so it opens and resizes out of its own bottom edge.
        default: defaults?.openFrom?.anchor ?? 'bottom corner',
      },
      // Start offset along the open axis — negative slides in from the main
      // menu's side. Sign is flipped automatically when side="left".
      // Every slider carries an explicit step: DialKit otherwise derives a
      // coarse one from the range, which rounds these values off.
      offsetX: [defaults?.openFrom?.offsetX ?? -8, -80, 80, 1],
      offsetY: [defaults?.openFrom?.offsetY ?? 0, -80, 80, 1],
      scale: [defaults?.openFrom?.scale ?? 0.96, 0.5, 1.2, 0.01], // < 1 grows out of the anchor
    },
    menu: {
      // How the panel itself opens and closes on hover.
      transition: { type: 'spring', visualDuration: 0.28, bounce: 0.18 },
      // How it grows or shrinks when moving straight from one parent's
      // submenu to another's, instead of crossfading between them.
      resize: { type: 'spring', visualDuration: 0.35, bounce: 0.15 },
    },
    content: {
      delay: [defaults?.content?.delay ?? 0.05, 0, 0.6, 0.005], // head start the panel gets before rows begin
      stagger: [defaults?.content?.stagger ?? 0.035, 0, 0.2, 0.005], // gap between consecutive rows
      offsetX: [defaults?.content?.offsetX ?? 0, -60, 60, 1], // where each row starts
      offsetY: [defaults?.content?.offsetY ?? 8, -60, 60, 1],
      scale: [defaults?.content?.scale ?? 1, 0.6, 1.2, 0.01],
      blur: [defaults?.content?.blur ?? 2, 0, 12, 0.5], // rows resolve out of a blur as they arrive
      // Moving between two parents holds the rows back until the panel has
      // very nearly finished resizing — 0.9 = wait for 90% of it. A fresh
      // open ignores this and uses `delay` instead.
      resizeHandoff: [defaults?.content?.resizeHandoff ?? 0.9, 0, 1.5, 0.05],
      transition: { type: 'spring', visualDuration: 0.32, bounce: 0.22 },
    },
    rowHover: {
      // The label/subtext color shift as the pointer moves between rows.
      transition: { type: 'easing', duration: 0.16, ease: [0.215, 0.61, 0.355, 1] },
    },
  }, { id: panelName })

  const [openId, setOpenId] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [activeSubId, setActiveSubId] = useState<string | null>(null)
  const [itemOffset, setItemOffset] = useState(0)
  const [triggerCenter, setTriggerCenter] = useState(50)
  // The sizer's dimensions are driven imperatively rather than through an
  // `animate` prop. With a prop, the first measurement is what *establishes*
  // width/height — there is no previous value to leave, so the first move
  // between parents lands instantly and only later ones spring. Owning the
  // values here makes the difference explicit: the first measurement jumps,
  // every one after it animates. They start at `auto` so the panel is its
  // natural size for the frame before the first measurement lands.
  const sizerWidth = useMotionValue<number | string>('auto')
  const sizerHeight = useMotionValue<number | string>('auto')
  const hasMeasuredSize = useRef(false)
  // The panel's natural size, kept so closing can shrink relative to it. Using
  // the sizer's live value instead would measure whatever the open animation
  // had reached, so closing part-way through an open would shrink from a
  // fraction of a fraction.
  const naturalSize = useRef<{ width: number; height: number } | null>(null)
  // What the current move is: whether it's a switch between two parents rather
  // than a fresh open, and which way the panel is travelling.
  //
  // Worked out the moment `openId` changes and then held, rather than derived
  // from refs on every render. Refs get updated by effects afterwards, which
  // silently flips these back part-way through the transition — the rows keep
  // the entrance they mounted with, but the anchor jumps under them.
  const [move, setMove] = useState<{
    openId: string | null
    count: number
    switching: boolean
    shrinking: boolean
  }>({ openId: null, count: 0, switching: false, shrinking: false })

  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const submenuRef = useRef<HTMLDivElement>(null)
  // The panel inside the sizer, left unconstrained so its natural size can be
  // measured and handed to the sizer as the target to animate toward.
  const submenuPanelRef = useRef<HTMLDivElement>(null)
  const triangleRef = useRef<Triangle | null>(null)
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Set when the keyboard opens a submenu, consumed once it has mounted.
  const pendingFocusRef = useRef(false)

  // Mirrors of state for the document-level listeners and event handlers, which
  // would otherwise read whatever was current when they were created.
  const openIdRef = useRef<string | null>(null)
  const activeIdRef = useRef<string | null>(null)
  openIdRef.current = openId
  activeIdRef.current = activeId

  const reduceMotion = useReducedMotion()
  const openItem = items.find((item) => item.id === openId) ?? null
  const subItems = openItem?.items ?? []

  // Settle what this move is the moment `openId` changes, then hold it. React
  // re-runs this render with the new state, so the rows and the anchor both
  // read the same answer on the render that mounts them.
  let isSwitchingParents = move.switching
  let isShrinking = move.shrinking
  if (move.openId !== openId) {
    isSwitchingParents = move.openId !== null && openId !== null
    // Row count stands in for height: it's the one thing known before the new
    // panel has been laid out, and rows within a submenu are a uniform height,
    // so it orders the two sizes correctly without measuring them.
    isShrinking = isSwitchingParents && subItems.length < move.count
    setMove({
      openId,
      count: subItems.length,
      switching: isSwitchingParents,
      shrinking: isShrinking,
    })
  }

  const cancelClose = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }, [])

  const closeSubmenu = useCallback(() => {
    cancelClose()
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current)
      openTimerRef.current = null
    }
    triangleRef.current = null
    setOpenId(null)
    setActiveSubId(null)
  }, [cancelClose])

  const scheduleClose = useCallback(() => {
    if (closeTimerRef.current) return
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null
      closeSubmenu()
      // This path only runs once the pointer has left the menu and its safe
      // area, so the trigger row shouldn't stay lit either. Closing for any
      // other reason (hovering a sibling row) leaves the highlight alone.
      setActiveId(null)
    }, closeDelay)
  }, [closeDelay, closeSubmenu])

  const openSubmenu = useCallback(
    (id: string, immediate = false) => {
      cancelClose()
      if (openTimerRef.current) {
        clearTimeout(openTimerRef.current)
        openTimerRef.current = null
      }
      if (openIdRef.current === id) return
      const commit = () => {
        setOpenId(id)
        setActiveSubId(null)
      }
      // Once one submenu is open, swapping to another should feel instant —
      // the dwell delay is only there to stop a pass-over from opening one.
      if (immediate || openDelay <= 0 || openIdRef.current) {
        commit()
        return
      }
      openTimerRef.current = setTimeout(() => {
        openTimerRef.current = null
        commit()
      }, openDelay)
    },
    [cancelClose, openDelay]
  )

  useEffect(() => {
    return () => {
      if (openTimerRef.current) clearTimeout(openTimerRef.current)
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    }
  }, [])

  // Hover intent. While a submenu is open the pointer is allowed to be over the
  // main panel, over the submenu, or inside the safe triangle between them.
  useEffect(() => {
    if (!openId) return

    function handlePointerMove(event: PointerEvent) {
      const point = { x: event.clientX, y: event.clientY }
      const panelRect = panelRef.current?.getBoundingClientRect()
      const submenuRect = submenuRef.current?.getBoundingClientRect()

      if (
        (panelRect && pointInRect(point, panelRect)) ||
        (submenuRect && pointInRect(point, submenuRect))
      ) {
        triangleRef.current = null
        cancelClose()
        return
      }

      if (triangleRef.current && pointInTriangle(point, triangleRef.current)) {
        cancelClose()
        return
      }

      triangleRef.current = null
      // A keyboard user sitting inside the submenu shouldn't lose it to a
      // stray mouse nudge somewhere else on the page.
      if (submenuRef.current?.contains(document.activeElement)) return
      scheduleClose()
    }

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) closeSubmenu()
    }

    document.addEventListener('pointermove', handlePointerMove)
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('mouseleave', scheduleClose)
    window.addEventListener('blur', closeSubmenu)
    return () => {
      document.removeEventListener('pointermove', handlePointerMove)
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('mouseleave', scheduleClose)
      window.removeEventListener('blur', closeSubmenu)
    }
  }, [openId, cancelClose, scheduleClose, closeSubmenu])

  // Measures the trigger row: its offset pins the submenu when align="item",
  // and its center becomes the transform-origin the panel scales out of.
  // Runs before paint, so the origin is in place for the first animated frame.
  useLayoutEffect(() => {
    if (!openId) return
    const index = items.findIndex((item) => item.id === openId)
    const trigger = menuItemsIn(panelRef.current)[index]
    const submenu = submenuRef.current
    if (!trigger) return
    setItemOffset(trigger.offsetTop)
    if (!submenu) return
    // Against the panel's natural height, not the wrapper's. Moving between
    // parents leaves the wrapper mid-resize, so reading it there would measure
    // the outgoing size and pin the origin to the submenu you just left.
    const panel = submenuPanelRef.current
    const height = panel?.offsetHeight ?? submenu.offsetHeight
    if (!height) return
    const center = trigger.offsetTop + trigger.offsetHeight / 2 - submenu.offsetTop
    setTriggerCenter(Math.max(0, Math.min(100, (center / height) * 100)))
    // itemOffset is a dependency because with align="item" it moves the
    // submenu, which moves the center this measures — one extra pass settles it.
  }, [openId, items, align, side, itemOffset])

  // Measures the panel at its natural size for the current parent's rows, so
  // the sizer has a target to animate to. Runs after the rows have swapped,
  // while the sizer still holds the outgoing size — which is what gives the
  // spring something to travel from.
  useLayoutEffect(() => {
    // Only while a submenu is actually open. On the way out the panel is still
    // mounted for the exit animation, and measuring it there would both fight
    // the close and re-enter this effect.
    if (!openId) return
    const panel = submenuPanelRef.current
    if (!panel) return
    const width = panel.offsetWidth
    const height = panel.offsetHeight
    naturalSize.current = { width, height }

    if (!hasMeasuredSize.current) {
      // First open of a session. Both dimensions start short and grow to
      // natural, so the panel opens away from the corner it's pinned at and
      // the rows are uncovered from behind the travelling edges. Either way
      // this leaves real numbers behind, which is what gives a later move
      // between parents something to spring from.
      const openFrom = reduceMotion || opensByTransform(anchor) ? 1 : params.openFrom.scale
      const fromWidth = width * openFrom
      const fromHeight = height * openFrom

      sizerWidth.jump(fromWidth)
      sizerHeight.jump(fromHeight)
      hasMeasuredSize.current = true

      if (fromWidth !== width) animate(sizerWidth, width, menuTransition)
      if (fromHeight !== height) animate(sizerHeight, height, menuTransition)
    } else if (sizerWidth.get() !== width || sizerHeight.get() !== height) {
      const spec = reduceMotion ? { duration: 0 } : resizeTransition
      animate(sizerWidth, width, spec)
      animate(sizerHeight, height, spec)
    }
  }, [openId, items])

  // Forget the measured size as soon as the submenu is closed, so the next
  // open adopts its own natural size outright instead of springing out of the
  // previous parent's dimensions — and, since the panel is bottom-anchored,
  // out of its position too.
  //
  // Keyed on being closed rather than on AnimatePresence's exit finishing: an
  // exit that never completes — interrupted by a re-open, or a tab the browser
  // has throttled — would otherwise strand the old size indefinitely. The
  // measuring effect below already ignores a closed menu, so nothing re-writes
  // this before the next open, and the motion values keep their current
  // numbers so the panel on its way out doesn't collapse mid-exit.
  //
  // `move` needs no reset here — it re-derives itself when `openId` next
  // changes, and a closed menu leaves it holding `openId: null`.
  useEffect(() => {
    if (openId) return
    hasMeasuredSize.current = false

    // Closing mirrors opening: the panel shrinks back toward the corner it's
    // pinned at while it fades, rather than only fading at full size. Driven
    // here rather than through `exit`, because the size lives on the sizer's
    // motion values and AnimatePresence only animates the wrapper's own
    // properties. The centred anchor already scales by transform on the way
    // out, so it needs nothing extra.
    if (reduceMotion || opensByTransform(anchor)) return
    const natural = naturalSize.current
    if (!natural) return
    // Relative to the natural size, so closing part-way through an open still
    // lands on the same size the next open will start from.
    animate(sizerWidth, natural.width * params.openFrom.scale, menuTransition)
    animate(sizerHeight, natural.height * params.openFrom.scale, menuTransition)
  }, [openId])

  // Keyboard-opened submenus take focus; hover-opened ones must not.
  useEffect(() => {
    if (!openId || !pendingFocusRef.current) return
    pendingFocusRef.current = false
    focusEdge(submenuRef.current, 'first')
  }, [openId])

  const focusRootItem = useCallback(
    (id: string | null) => {
      if (!id) return
      const index = items.findIndex((item) => item.id === id)
      menuItemsIn(panelRef.current)[index]?.focus()
    },
    [items]
  )

  const handleSelect = useCallback(
    (item: MenuItemData, parent?: MenuItemData) => {
      if (item.items?.length) {
        // Clicking a parent toggles its submenu, so the menu is still usable
        // on touch, where there's no hover to open it. It still reports the
        // selection: a parent like "Work" is usually a real page in its own
        // right, so it can be the selected row regardless of having children.
        // The submenu is left open rather than closed, unlike a leaf.
        setOpenId((current) => (current === item.id ? null : item.id))
        setActiveSubId(null)
        onSelect?.(item, [item])
        return
      }
      onSelect?.(item, parent ? [parent, item] : [item])
      closeSubmenu()
      setActiveId(null)
    },
    [onSelect, closeSubmenu]
  )

  function handleRootPointerEnter(item: MenuItemData) {
    setActiveId(item.id)
    if (item.disabled) return
    if (item.items?.length) {
      openSubmenu(item.id)
    } else {
      closeSubmenu()
    }
  }

  function handlePanelPointerLeave(event: React.PointerEvent<HTMLDivElement>) {
    if (!openIdRef.current) {
      setActiveId(null)
      return
    }
    const submenu = submenuRef.current
    if (!submenu) return
    triangleRef.current = buildSafeTriangle(
      { x: event.clientX, y: event.clientY },
      submenu.getBoundingClientRect(),
      side,
      SAFE_TRIANGLE_BUFFER
    )
  }

  function handleRootKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        event.preventDefault()
        moveFocus(panelRef.current, event.key === 'ArrowDown' ? 1 : -1)
        break
      case 'Home':
      case 'End':
        event.preventDefault()
        focusEdge(panelRef.current, event.key === 'Home' ? 'first' : 'last')
        break
      case 'Escape':
        if (openIdRef.current) {
          event.preventDefault()
          closeSubmenu()
        }
        break
      case 'ArrowRight':
      case 'ArrowLeft': {
        const opens = event.key === (side === 'right' ? 'ArrowRight' : 'ArrowLeft')
        if (!opens) break
        // Read the row from what's actually focused rather than from hover
        // state, which hasn't committed yet on the first key after tabbing in.
        const index = menuItemsIn(panelRef.current).indexOf(document.activeElement as HTMLElement)
        const item =
          index >= 0 ? items[index] : items.find((candidate) => candidate.id === activeIdRef.current)
        if (!item?.items?.length || item.disabled) break
        event.preventDefault()
        pendingFocusRef.current = true
        openSubmenu(item.id, true)
        break
      }
    }
  }

  function handleSubmenuKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        event.preventDefault()
        moveFocus(submenuRef.current, event.key === 'ArrowDown' ? 1 : -1)
        break
      case 'Home':
      case 'End':
        event.preventDefault()
        focusEdge(submenuRef.current, event.key === 'Home' ? 'first' : 'last')
        break
      case 'Escape':
      case 'ArrowRight':
      case 'ArrowLeft': {
        const closes =
          event.key === 'Escape' || event.key === (side === 'right' ? 'ArrowLeft' : 'ArrowRight')
        if (!closes) break
        event.preventDefault()
        const parentId = openIdRef.current
        closeSubmenu()
        focusRootItem(parentId)
        break
      }
    }
  }

  // Being on a subpage keeps its section lit: /work/wildflower selects the
  // Wildflower row *and* the Work row that owns it. Undefined when the
  // selection is already a top-level row, or matches nothing.
  const selectedSectionId = useMemo(() => {
    if (!selectedId) return undefined
    return items.find((item) => item.items?.some((child) => child.id === selectedId))?.id
  }, [items, selectedId])

  const rootVariant = items.some((item) => item.description) ? 'multi' : 'single'
  const subVariant = subItems.some((item) => item.description) ? 'multi' : 'single'
  // Roving tabindex: exactly one row of each panel is in the tab order.
  const rootTabId = activeId ?? items[0]?.id
  const subTabId = activeSubId ?? subItems[0]?.id

  // Casts: DialKit's resolved transition type also covers its "Easing" tab
  // (`type: 'easing'`), which isn't part of Motion's `Transition` union even
  // though Motion accepts the shape fine at runtime. Safe to narrow here since
  // these values only ever flow into Motion.
  const menuTransition = params.menu.transition as Transition
  const resizeTransition = params.menu.resize as Transition
  const contentTransition = params.content.transition as Transition
  const rowTransition = (
    reduceMotion ? { duration: 0 } : params.rowHover.transition
  ) as Transition

  const anchor = params.openFrom.anchor as MenuOpenAnchor
  const transformOrigin = transformOriginFor(anchor, side, triggerCenter)
  // The offset dial reads as "along the open axis", so opening leftward
  // mirrors it rather than sliding the panel the wrong way.
  const openX = (side === 'right' ? 1 : -1) * params.openFrom.offsetX

  // Every other anchor grows the sizer's real width and height instead (see
  // opensByTransform), so scaling here as well would double it up.
  const panelHidden = reduceMotion
    ? { opacity: 0 }
    : {
        opacity: 0,
        x: openX,
        y: params.openFrom.offsetY,
        scale: opensByTransform(anchor) ? params.openFrom.scale : 1,
      }
  const panelShown = { opacity: 1, x: 0, y: 0, scale: 1 }

  // The panel and its rows animate on separate clocks: the wrapper handles the
  // panel, these variants stagger the rows in behind it.
  // A move between parents hands off to the rows only once the panel has
  // nearly finished resizing; a fresh open uses the plain delay. The resize's
  // own length drives it, so retuning the resize dial carries the handoff with
  // it — read from whichever field the dial's current tab exposes (a spring
  // reports visualDuration, the easing tab reports duration).
  const resizeSpec = params.menu.resize as { visualDuration?: number; duration?: number }
  const resizeDuration = resizeSpec.visualDuration ?? resizeSpec.duration ?? 0.35
  const contentDelay = isSwitchingParents
    ? params.content.resizeHandoff * resizeDuration
    : params.content.delay

  // Where the rows start, on every open. The `content` dials own this outright
  // — a fresh open used to borrow the panel's own opening vector and scale
  // instead, which left offsetX/offsetY steering nothing but a magnitude and
  // discarded `scale` altogether. Worse, rows that travel with the panel are
  // motionless relative to it, so the first open of any row read as a plain
  // fade and only a move between two parents showed the dials doing anything.
  //
  // The one thing still derived is the direction of the vertical offset:
  // shrinking, the panel's top edge is sweeping down onto the rows, so they
  // start above their resting place and ride it down rather than climbing
  // into it. The dial sets how far; only the sign is flipped.
  const rowHiddenX = params.content.offsetX
  const rowHiddenY = isShrinking ? -params.content.offsetY : params.content.offsetY
  const rowHiddenScale = params.content.scale

  const listVariants: Variants = useMemo(
    () => ({
      hidden: {},
      visible: {
        transition: reduceMotion
          ? { delayChildren: 0, staggerChildren: 0 }
          : { delayChildren: contentDelay, staggerChildren: params.content.stagger },
      },
    }),
    [reduceMotion, contentDelay, params.content.stagger]
  )

  const rowVariants: Variants = useMemo(
    () => ({
      hidden: reduceMotion
        ? { opacity: 1 }
        : {
            opacity: 0,
            x: rowHiddenX,
            y: rowHiddenY,
            scale: rowHiddenScale,
            filter: `blur(${params.content.blur}px)`,
          },
      visible: {
        opacity: 1,
        x: 0,
        y: 0,
        scale: 1,
        filter: 'blur(0px)',
        transition: contentTransition,
      },
    }),
    [reduceMotion, rowHiddenX, rowHiddenY, rowHiddenScale, params.content.blur, contentTransition]
  )

  return (
    <div
      ref={rootRef}
      className={['menu', `menu-side-${side}`, `menu-align-${align}`, className]
        .filter(Boolean)
        .join(' ')}
      style={{ '--menu-submenu-offset': `${itemOffset}px` } as CSSProperties}
    >
      <MenuPanel
        ref={panelRef}
        variant={rootVariant}
        label={label}
        onPointerLeave={handlePanelPointerLeave}
        onKeyDown={handleRootKeyDown}
      >
        {items.map((item) => (
          <MenuItem
            key={item.id}
            item={item}
            isActive={item.id === activeId || item.id === openId}
            isSelected={item.id === selectedId || item.id === selectedSectionId}
            isCurrent={item.id === selectedId}
            hasSubmenu={Boolean(item.items?.length)}
            expanded={item.id === openId}
            tabIndex={item.id === rootTabId ? 0 : -1}
            hoverTransition={rowTransition}
            onActivate={() => handleSelect(item)}
            onPointerEnter={() => handleRootPointerEnter(item)}
            onFocus={() => setActiveId(item.id)}
          />
        ))}
      </MenuPanel>

      <AnimatePresence>
        {openItem && subItems.length > 0 && (
          <motion.div
            ref={submenuRef}
            className="menu-submenu"
            style={{ transformOrigin }}
            initial={panelHidden}
            animate={panelShown}
            exit={panelHidden}
            transition={reduceMotion ? { duration: 0 } : menuTransition}
            onPointerEnter={cancelClose}
          >
            <motion.div
              className="menu-submenu-sizer"
              data-resize={isShrinking ? 'shrink' : 'grow'}
              style={{ width: sizerWidth, height: sizerHeight }}
            >
              <MenuPanel
                // Keyed per parent so the rows remount and re-run their
                // staggered entrance on every move. The sizer above is
                // deliberately not keyed, so it keeps animating across the swap.
                key={openId}
                ref={submenuPanelRef}
                variant={subVariant}
                label={openItem.label}
                variants={listVariants}
                onPointerLeave={() => setActiveSubId(null)}
                onKeyDown={handleSubmenuKeyDown}
              >
              {subItems.map((item) => (
                <MenuItem
                  key={item.id}
                  item={item}
                  isActive={item.id === activeSubId}
                  isSelected={item.id === selectedId}
                  isCurrent={item.id === selectedId}
                  hasSubmenu={false}
                  expanded={false}
                  tabIndex={item.id === subTabId ? 0 : -1}
                  hoverTransition={rowTransition}
                  variants={rowVariants}
                  onActivate={() => handleSelect(item, openItem)}
                  onPointerEnter={() => setActiveSubId(item.id)}
                  onFocus={() => setActiveSubId(item.id)}
                />
              ))}
              </MenuPanel>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
