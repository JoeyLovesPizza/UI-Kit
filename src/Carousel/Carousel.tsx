import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
  type MotionValue,
  type Transition,
} from 'motion/react'
import { useDialKit } from 'dialkit'
import { CarouselItem, type Rgb } from '../CarouselItem/CarouselItem'
import './Carousel.css'

/**
 * Per-scenario starting values for the DialKit panel. The tunable range and
 * the interaction feel (springs, snap behavior) stay fixed — this only moves
 * where each slider starts, so different apps can open with card sizes/gaps
 * that suit their layout without dragging sliders by hand every time.
 */
export interface CarouselDefaults {
  card?: { width?: number; height?: number; borderRadius?: number }
  spacing?: { gap?: number }
  centerFocus?: { scaleBoost?: number; blur?: number }
  /** Tint each card's own drop shadow. On by default. */
  shadow?: { enabled?: boolean; intensity?: number }
  /** Wash the space behind the carousel with the centered card's colors. Off by default — independent of `shadow`, so either, both, or neither can be on. */
  ambient?: { enabled?: boolean; intensity?: number; spread?: number; saturation?: number }
  hover?: { scale?: number }
  scroll?: { speed?: number }
  snap?: { enabled?: boolean; threshold?: number }
}

export interface CarouselProps<T> {
  items: T[]
  itemKey: (item: T, index: number) => string
  renderItem: (item: T, index: number) => ReactNode
  itemLabel?: (item: T, index: number) => string
  /** Tints each card's drop shadow with a color derived from that item (e.g. sampled from its image), instead of the shared neutral shadow. Return undefined for an item to fall back to the default. */
  itemShadowColor?: (item: T, index: number) => string | undefined
  panelName?: string
  defaults?: CarouselDefaults
  /** Show the row of step dots below the carousel. Defaults to true. */
  showDots?: boolean
  /** Controlled active index — when it changes, the carousel snaps to it. Lets an external control (e.g. a `Stepper`) drive the carousel. */
  activeIndex?: number
  /** Called whenever the centered index changes, from any interaction (drag, wheel, keyboard, or an external `activeIndex` change). */
  onActiveIndexChange?: (index: number) => void
}

const WHEEL_IDLE_MS = 140
const RUBBER_BAND_RESISTANCE = 0.35
// Room to reserve for CarouselItem's box-shadow, which bleeds ~22px below
// the card regardless of the blur dial (that dial only controls the
// distance-based filter blur, not this fixed shadow).
const SHADOW_BLEED = 24
// The tinted multi-layer shadow (see CarouselItem's buildShadow) reaches
// ~48px below the card (24px offset + 40px blur − 16px spread), so it needs
// more room than the plain SHADOW_BLEED budget reserves.
const COLORED_SHADOW_BLEED = 64
// Release speed (px/s) at or above which a gesture counts as a flick and
// advances a card on its own, however short the drag actually was.
const FLICK_VELOCITY = 400
// ...but it still has to be a deliberate movement. Requiring both guards means
// a fast jitter during a tap can't skip a card on its own.
const MIN_FLICK_DISTANCE = 24
// How far a touch has to travel before its axis is judged. Below this a finger
// is still ambiguous — a vertical swipe always drifts a few pixels sideways —
// and claiming it early is what makes a carousel feel like it has eaten the
// page's scroll.
const AXIS_LOCK_SLOP = 8
// A press that never travels this far is a tap, not a drag, so it centers the
// card it landed on instead of settling the track.
const TAP_SLOP = 6

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function rubberBand(value: number, min: number, max: number) {
  if (value < min) return min - (min - value) * RUBBER_BAND_RESISTANCE
  if (value > max) return max + (value - max) * RUBBER_BAND_RESISTANCE
  return value
}

// Only cards this far from the centered one get an aura mounted. A card's own
// aura is fully faded out by the time it is one step off center (see the weight
// below), so ±1 is all that can ever be visible; the extra step is slack so an
// aura is always already in the DOM, with its colors painted, before it has any
// strength to show.
const AURA_WINDOW = 2

interface CarouselAuraProps {
  index: number
  trackX: MotionValue<number>
  step: number
  maxIndex: number
  /** Composited strength of the whole layer — see the opacity note below. */
  intensity: number
  radiusX: number
  radiusY: number
  lobeOffset: number
  register: (index: number, el: HTMLDivElement | null) => void
}

/**
 * One card's own aura, laid out on the track that mirrors the cards' transform,
 * so it travels with the card that cast it.
 *
 * Because each card carries its own light, neighbours cross-fade by simply
 * overlapping: the outgoing aura dims as the incoming one comes up, and two
 * differently-colored cards that are both on screen each keep their own color
 * in their own place rather than being averaged into a single blob.
 */
function CarouselAura({
  index,
  trackX,
  step,
  maxIndex,
  intensity,
  radiusX,
  radiusY,
  lobeOffset,
  register,
}: CarouselAuraProps) {
  const opacity = useTransform(trackX, (latest) => {
    // Clamped, so a rubber-band overshoot past the first or last card doesn't
    // fade the light down — that card is still the one on screen. Its aura
    // still *moves* with it, since position comes from the track transform.
    const position = clamp(latest / step, 0, maxIndex)
    const weight = Math.max(0, 1 - Math.abs(position - index))
    if (weight === 0) return 0
    // Two overlapping translucent layers do not add up to the sum of their
    // parts: at the midpoint between cards, two auras at 0.5 each composite to
    // 0.75, so a naive weight would dip the light every time you cross between
    // cards — the pulsing this design exists to avoid. Solving the compositing
    // the other way round (1 - Π(1 - aᵢ) = intensity, with weights that sum to
    // 1) holds the total exactly at `intensity` everywhere, while still mixing
    // the two colors in proportion.
    return 1 - Math.pow(1 - intensity, weight)
  })

  return (
    <motion.div
      ref={(el: HTMLDivElement | null) => register(index, el)}
      className="carousel-ambient"
      style={{
        opacity,
        ...({
          '--ambient-x': `${index * step}px`,
          '--ambient-rx': `${radiusX}px`,
          '--ambient-ry': `${radiusY}px`,
          '--ambient-offset': `${lobeOffset}px`,
        } as CSSProperties),
      }}
    />
  )
}

export function Carousel<T>({
  items,
  itemKey,
  renderItem,
  itemLabel,
  itemShadowColor,
  panelName = 'Carousel',
  defaults,
  showDots = true,
  activeIndex: controlledActiveIndex,
  onActiveIndexChange,
}: CarouselProps<T>) {
  const params = useDialKit(panelName, {
    card: {
      width: [defaults?.card?.width ?? 340, 220, 560],
      height: [defaults?.card?.height ?? 460, 260, 640],
      borderRadius: [defaults?.card?.borderRadius ?? 20, 0, 60],
    },
    spacing: {
      gap: [defaults?.spacing?.gap ?? 32, 0, 120], // how close cards sit to one another
    },
    centerFocus: {
      scaleBoost: [defaults?.centerFocus?.scaleBoost ?? 1.1, 1, 1.5], // how much the centered card grows
      blur: [defaults?.centerFocus?.blur ?? 6, 0, 40], // max blur (px) applied the further a card is from center
    },
    // The two ways sampled colors can be shown are independent switches, not
    // one three-way choice: either, both, or neither is a valid look.
    shadow: {
      enabled: defaults?.shadow?.enabled ?? true, // tint each card's own drop shadow
      // Multiplies the opacity of the tinted card shadow (see `itemShadowColor`).
      // 0 removes it entirely, 1 is the built-in weight. Geometry is deliberately
      // left alone so the reserved bleed below stays correct at any setting.
      // Explicit 0.05 step: the inferred one for this range is 0.1, which is too
      // coarse to settle a shadow's weight by eye.
      intensity: [defaults?.shadow?.intensity ?? 1, 0, 3, 0.05],
    },
    ambient: {
      enabled: defaults?.ambient?.enabled ?? false, // light the space behind each card
      // Overall strength of a card's aura. This lands on the layer's CSS
      // `opacity`, which clamps at 1 — a wider range would leave everything
      // above 1.0 rendering identically, so the dial stops exactly where it
      // stops doing anything. 0.01 steps because the useful settings sit in a
      // narrow band and the difference between, say, 0.80 and 0.85 is worth
      // being able to hit.
      intensity: [defaults?.ambient?.intensity ?? 0.85, 0, 1, 0.01],
      // Multiples of the card's own size. Kept close to the card deliberately:
      // this is one card's aura, so it has to read as light coming off *that*
      // card. Past roughly 2x it stops being attached to anything — a 340x460
      // card at 3.2 throws a 1360x1620 box, bigger than most containers a
      // carousel sits in, so every card's light covers the whole frame and the
      // result is the undifferentiated page-wide wash this replaced.
      spread: [defaults?.ambient?.spread ?? 1.6, 1, 4, 0.1],
      saturation: [defaults?.ambient?.saturation ?? 1.9, 1, 4], // counteracts the greying caused by averaging a whole frame
    },
    hover: {
      scale: [defaults?.hover?.scale ?? 1.05, 1, 1.3], // extra scale applied on top of centering while hovered
      transition: {
        type: 'spring',
        visualDuration: 0.25, // how long the hover scale takes to settle
        bounce: 0.3, // springiness of the hover-scale transition
      },
    },
    scroll: {
      speed: [defaults?.scroll?.speed ?? 1, 0.2, 3], // wheel/trackpad sensitivity multiplier
    },
    snap: {
      enabled: defaults?.snap?.enabled ?? true, // snap the released/idle card back to center; off = free scroll
      threshold: [defaults?.snap?.threshold ?? 0.5, 0, 0.5], // how close to a card's center (fraction of the gap between cards) is needed to trigger snap; 0.5 = anywhere snaps, near 0 = must already be almost centered
      transition: {
        type: 'spring',
        visualDuration: 0.5,
        bounce: 0.15,
      },
    },
  })

  const viewportRef = useRef<HTMLDivElement>(null)
  const [viewportWidth, setViewportWidth] = useState(0)

  // Shrinks the card (preserving aspect ratio) when the dial-configured
  // width doesn't fit the viewport, so a card sized for desktop doesn't
  // overflow a phone screen. Only ever scales down, never past the dial's
  // own value. Skipped before the first ResizeObserver measurement lands
  // (viewportWidth 0), to avoid a one-frame flash at zero size.
  //
  // Halved by `sidePad` centering below, so this is the *total* left+right
  // margin. Unlike the vertical direction, nothing reserves room outside the
  // viewport's own box — it is `overflow: hidden` with no horizontal padding —
  // so this margin is the only thing standing between the centered card's
  // tinted side shadows and a flat cut at the edge. `buildShadow` reaches
  // ~26px sideways, so each side needs at least that: 56 leaves 28.
  const CARD_EDGE_PADDING = 56
  // Measured against the *centered* card's width, i.e. after `scaleBoost`
  // enlarges it. Sizing the unscaled card instead lets the focused one grow
  // back into the margin and sit nearly flush with the screen edge.
  const responsiveScale =
    viewportWidth > 0
      ? Math.min(
          1,
          (viewportWidth - CARD_EDGE_PADDING) / (params.card.width * params.centerFocus.scaleBoost)
        )
      : 1

  const cardWidth = params.card.width * responsiveScale
  const cardHeight = params.card.height * responsiveScale
  const cardBorderRadius = params.card.borderRadius
  const scaleBoost = params.centerFocus.scaleBoost

  // The centered card grows by `scaleBoost`, overhanging into the gap on both
  // sides. Add that overhang back so the dialled gap is the space you actually
  // see beside the focused card, instead of collapsing to a few pixels and
  // leaving it near-touching its neighbours.
  const centerOverhang = (cardWidth * (scaleBoost - 1)) / 2
  let gap = params.spacing.gap * responsiveScale + centerOverhang

  // Once the card has had to shrink to fit (i.e. a phone), there is no longer
  // room for a neighbour to read as a deliberate peek — it can only appear as
  // a thin cropped sliver jammed against the edge. Park neighbours fully
  // offscreen so a single card reads cleanly instead.
  if (responsiveScale < 1 && viewportWidth > 0) {
    gap = Math.max(gap, viewportWidth / 2 - cardWidth / 2 + CARD_EDGE_PADDING / 2)
  }
  const maxBlur = params.centerFocus.blur
  const shadowIntensity = params.shadow.intensity
  const showShadow = params.shadow.enabled
  const showAmbient = params.ambient.enabled
  const ambientIntensity = params.ambient.intensity
  const ambientSpread = params.ambient.spread
  const ambientSaturation = params.ambient.saturation
  const hoverScaleAmount = params.hover.scale
  // Cast: DialKit's resolved transition type also covers its "Easing" tab
  // (`type: 'easing'`), which isn't part of Motion's `Transition` union even
  // though Motion accepts the shape fine at runtime (duration + cubic-bezier
  // ease). Safe to narrow here since this value only ever flows into Motion.
  const hoverTransition = params.hover.transition as Transition
  const scrollSpeed = params.scroll.speed
  const snapEnabled = params.snap.enabled
  const snapThreshold = params.snap.threshold
  const snapTransition = params.snap.transition as Transition

  const step = cardWidth + gap
  const maxIndex = items.length - 1

  const [activeIndex, setActiveIndex] = useState(0)
  const [dragging, setDragging] = useState(false)

  const trackX = useMotionValue(0)
  const trackTranslate = useTransform(trackX, (v) => -v)

  // Exactly one pointer drives the track. A second finger landing mid-drag
  // (the start of a pinch, or just a clumsy grab) used to re-baseline the
  // gesture onto itself and snap the track sideways; it is now ignored
  // outright until the first one is released.
  const activePointerId = useRef<number | null>(null)
  // A touch is only "claimed" once it has proved itself horizontal. Until then
  // the browser still owns the gesture, so a vertical swipe scrolls the page.
  const claimed = useRef(false)
  const pressOrigin = useRef({ x: 0, y: 0 })
  const dragStart = useRef({ pointerX: 0, trackX: 0 })
  const dragStartIndex = useRef(0)
  const activeIndexRef = useRef(0)
  const wheelIdleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      setViewportWidth(entries[0].contentRect.width)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const sidePad = Math.max(0, (viewportWidth - cardWidth) / 2)
  const minX = 0
  const maxX = maxIndex * step

  // Auras are painted straight to the DOM from the cards' live sampled colors:
  // those change every frame, and routing them through React state would
  // re-render the whole track at animation rates.
  //
  // Each aura reads only its own card's colors, so a color push repaints one
  // node — and moving the track repaints none of them, since position comes
  // from the shared track transform and strength from a motion value.
  const auraNodes = useRef(new Map<number, HTMLDivElement>())
  // Each entry is an item's own live color array rather than a copy — the item
  // mutates it in place as it eases, so what's read here is always current.
  const cardColorsRef = useRef(new Map<number, Rgb[]>())
  // Read through a ref so dragging the slider doesn't rebuild `paintAura` (and
  // with it the callback every card holds) on each pointer move.
  const saturationRef = useRef(ambientSaturation)

  const paintAura = useCallback((index: number) => {
    const el = auraNodes.current.get(index)
    // No node whenever the layer is switched off or this card is outside the
    // mounted window, and no colors until the card has sampled itself once.
    // Either way there is nothing to paint — and leaving the last colors in
    // place beats flashing an aura off and back on.
    const colors = cardColorsRef.current.get(index)
    if (!el || !colors) return

    // Averaging a whole frame pulls hard toward grey — the colors that make a
    // scene read (a sky, a jacket) get cancelled by everything around them. Left
    // as sampled, an aura lands on the page as a dirty smudge rather than as
    // light, so push each channel back out from the average's own luminance.
    const saturation = saturationRef.current
    // Bare space-separated channels, not a full color: the stylesheet feeds
    // each one through `rgb(… / a)` at a ladder of alphas to shape the falloff.
    const channels = ([r, g, b]: Rgb) => {
      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
      const boost = (v: number) =>
        Math.round(clamp(luminance + (v - luminance) * saturation, 0, 255))
      return `${boost(r)} ${boost(g)} ${boost(b)}`
    }
    el.style.setProperty('--ambient-left', channels(colors[0]))
    el.style.setProperty('--ambient-center', channels(colors[1]))
    el.style.setProperty('--ambient-right', channels(colors[2]))
  }, [])

  // Painting on register matters as much as painting on sample: a still card
  // pushes its color exactly once, on load, so an aura mounting later — when
  // the window slides onto it, or when the layer is switched on — would
  // otherwise sit colorless until that card happened to resample.
  const registerAura = useCallback(
    (index: number, el: HTMLDivElement | null) => {
      if (!el) {
        auraNodes.current.delete(index)
        return
      }
      auraNodes.current.set(index, el)
      paintAura(index)
    },
    [paintAura]
  )

  const handleItemColors = useCallback(
    (index: number, colors: Rgb[]) => {
      cardColorsRef.current.set(index, colors)
      paintAura(index)
    },
    [paintAura]
  )

  // Saturation is a direct control, not an eased one: a drag of the slider
  // should show on every mounted aura as it moves, not on the next color the
  // content happens to push.
  useEffect(() => {
    saturationRef.current = ambientSaturation
    for (const index of auraNodes.current.keys()) paintAura(index)
  }, [paintAura, ambientSaturation])

  // Room above/below the cards so center-scale, hover-scale, and blur bleed
  // never get clipped by the viewport's own box, however the dials are set.
  const maxCardScale = scaleBoost * hoverScaleAmount
  const verticalBleed =
    (cardHeight * (maxCardScale - 1)) / 2 +
    maxBlur * 3 +
    (itemShadowColor ? COLORED_SHADOW_BLEED : SHADOW_BLEED)

  const snapTo = useCallback(
    (index: number) => {
      const target = clamp(index, 0, maxIndex)
      animate(trackX, target * step, snapTransition)
    },
    [maxIndex, step, snapTransition, trackX]
  )

  // Called after a drag/wheel gesture ends. With snap on, settles to the
  // nearest card only if release landed within `snapThreshold` of its center
  // (a fraction of the step, 0.5 = anywhere between two cards catches).
  // Otherwise (snap off, or released outside the threshold), only rubber-band
  // overshoot is corrected back into bounds and the position is left alone.
  const settleAfterRelease = useCallback(
    (gestureStartIndex?: number) => {
      const current = trackX.get()
      const nearestIndex = clamp(Math.round(current / step), 0, maxIndex)
      const distanceFromCenter = Math.abs(current - nearestIndex * step) / step

      // A quick flick advances one card in the direction of travel even when
      // the gesture never covered half a card. Position alone (`nearestIndex`)
      // means anything shorter than `step / 2` settles back onto the card it
      // started from — 255px of dragging for a 480px card — which reads as the
      // carousel refusing to move.
      if (snapEnabled && gestureStartIndex != null) {
        const velocity = trackX.getVelocity()
        const travelled = Math.abs(current - gestureStartIndex * step)
        if (Math.abs(velocity) >= FLICK_VELOCITY && travelled >= MIN_FLICK_DISTANCE) {
          snapTo(gestureStartIndex + (velocity > 0 ? 1 : -1))
          return
        }
      }

      if (snapEnabled && distanceFromCenter <= snapThreshold) {
        snapTo(nearestIndex)
        return
      }
      const bounded = clamp(current, minX, maxX)
      if (bounded !== current) animate(trackX, bounded, snapTransition)
    },
    [snapEnabled, snapThreshold, snapTo, step, maxIndex, trackX, minX, maxX, snapTransition]
  )

  useMotionValueEvent(trackX, 'change', (latest) => {
    const nearest = clamp(Math.round(latest / step), 0, maxIndex)
    if (nearest !== activeIndexRef.current) {
      activeIndexRef.current = nearest
      setActiveIndex(nearest)
      onActiveIndexChange?.(nearest)
    }
  })

  // External control (e.g. a `Stepper` driving this carousel): snap to the
  // controlled index whenever it changes from outside.
  useEffect(() => {
    if (controlledActiveIndex == null) return
    if (controlledActiveIndex === activeIndexRef.current) return
    snapTo(controlledActiveIndex)
  }, [controlledActiveIndex, snapTo])

  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      // Swallow the whole gesture so a vertical scroll landing on the carousel
      // neither scrolls the page nor nudges the track — the component responds
      // to horizontal intent only. Vertical scrolling behaves normally anywhere
      // above or below it.
      e.preventDefault()
      if (e.deltaX === 0) return
      trackX.set(rubberBand(trackX.get() + e.deltaX * scrollSpeed, minX, maxX))

      if (wheelIdleTimer.current) clearTimeout(wheelIdleTimer.current)
      // No gesture-start index: wheel/trackpad already moves incrementally, so
      // it settles on the nearest card rather than flick-advancing.
      wheelIdleTimer.current = setTimeout(() => settleAfterRelease(), WHEEL_IDLE_MS)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [minX, maxX, scrollSpeed, settleAfterRelease, trackX])

  // Takes over the gesture: from here on the pointer belongs to the track, and
  // the browser gets no say in it. Split out because a mouse claims on press
  // while a touch claims later, on the first horizontal move.
  const claim = (e: React.PointerEvent<HTMLDivElement>) => {
    claimed.current = true
    setDragging(true)
    // Re-baselined at the moment of the claim, not at press: for a touch, the
    // slop travelled while the axis was still undecided must not land on the
    // track in one jump.
    dragStart.current = { pointerX: e.clientX, trackX: trackX.get() }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // A *non-primary* pointer is an extra finger arriving on a gesture already
    // in progress — the start of a pinch, or a second thumb. Ignore it, so it
    // can't re-baseline the drag onto itself and jump the track sideways.
    if (!e.isPrimary && activePointerId.current !== null) return
    // A primary pointer means nothing else is down, so anything still recorded
    // here belongs to a gesture whose end never arrived: a `pointercancel`
    // dropped while the tab was backgrounded, a capture stolen mid-drag. Adopt
    // it rather than refusing, or one lost event wedges the carousel — every
    // later touch rejected against a pointer that will never be released.
    activePointerId.current = e.pointerId
    claimed.current = false
    setDragging(false)
    pressOrigin.current = { x: e.clientX, y: e.clientY }
    dragStart.current = { pointerX: e.clientX, trackX: trackX.get() }
    dragStartIndex.current = activeIndexRef.current

    // A touch is left alone for now — `touch-action: pan-y` lets the browser
    // scroll the page with it, and it is only taken over once it turns out to
    // be horizontal. A mouse or pen has no browser gesture to compete with, so
    // it starts dragging on contact.
    if (e.pointerType === 'touch') return

    // Stop native image/link drag and text-selection from ever starting.
    // Relying on the `dragstart` handler alone is racy: the browser can
    // begin its own drag and fire a `pointercancel` — aborting our gesture
    // mid-flight with a stale delta — before that handler runs. preventDefault
    // here also suppresses implicit focus, so restore it explicitly for
    // keyboard-arrow nav. Deliberately not done for touch: there it would
    // suppress the tap that centers a card, and the native drag it guards
    // against is a mouse behavior anyway.
    e.preventDefault()
    e.currentTarget.focus()
    claim(e)
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== activePointerId.current) return

    if (!claimed.current) {
      const dx = e.clientX - pressOrigin.current.x
      const dy = e.clientY - pressOrigin.current.y
      // Still ambiguous — wait for a clearer intent rather than guessing from
      // the first pixel of travel.
      if (Math.abs(dx) < AXIS_LOCK_SLOP && Math.abs(dy) < AXIS_LOCK_SLOP) return
      if (Math.abs(dy) >= Math.abs(dx)) {
        // Vertical: hand the gesture back. The page scrolls, and this pointer
        // is dropped for good — releasing it must not settle the track or read
        // as a tap.
        activePointerId.current = null
        return
      }
      claim(e)
    }

    const delta = dragStart.current.pointerX - e.clientX
    trackX.set(rubberBand(dragStart.current.trackX + delta, minX, maxX))
  }

  // Which card sits under a given viewport x. Card `i`'s center is laid out at
  // `sidePad + cardWidth / 2 + i * step` from the track's left edge, and the
  // track is shifted left by `trackX` — so inverting that gives the index.
  //
  // Deliberately reconstructed from the same values that positioned the cards
  // rather than from the viewport's measured center: the two agree only while
  // `sidePad` is unclamped, and it is clamped to 0 exactly when the card is
  // wider than the viewport — the narrow-screen case this is most needed for.
  const indexAt = (clientX: number) => {
    const box = viewportRef.current?.getBoundingClientRect()
    if (!box) return activeIndexRef.current
    const offsetInTrack = clientX - box.left + trackX.get()
    return clamp(Math.round((offsetInTrack - sidePad - cardWidth / 2) / step), 0, maxIndex)
  }

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== activePointerId.current) return
    activePointerId.current = null

    if (!claimed.current) {
      // Never became a drag. A press that stayed put is a tap: center the card
      // it landed on. This is the touch counterpart of the double-click a
      // CarouselItem already handles — on a phone there is otherwise no way at
      // all to reach a neighbouring card except by dragging it across.
      if (e.type === 'pointerup') {
        const moved = Math.hypot(e.clientX - pressOrigin.current.x, e.clientY - pressOrigin.current.y)
        if (moved <= TAP_SLOP) snapTo(indexAt(e.clientX))
      }
      return
    }

    claimed.current = false
    setDragging(false)
    settleAfterRelease(dragStartIndex.current)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') snapTo(activeIndexRef.current + 1)
    if (e.key === 'ArrowLeft') snapTo(activeIndexRef.current - 1)
  }

  return (
    <div className="carousel-wrapper">
      {showAmbient && (
        <div
          className="carousel-ambient-layer"
          aria-hidden
          style={{
            // Centered on the card rather than the wrapper: the wrapper also
            // contains the dots row, so its own center sits below the card.
            top: verticalBleed + cardHeight / 2,
          }}
        >
          <motion.div className="carousel-ambient-track" style={{ x: trackTranslate }}>
            {items.map((item, i) =>
              Math.abs(i - activeIndex) <= AURA_WINDOW ? (
                <CarouselAura
                  key={itemKey(item, i)}
                  index={i}
                  trackX={trackX}
                  step={step}
                  maxIndex={maxIndex}
                  intensity={ambientIntensity}
                  // How far the color reaches. This — not the element's own box
                  // — is what `spread` drives.
                  radiusX={(cardWidth * scaleBoost * ambientSpread) / 2}
                  radiusY={(cardHeight * scaleBoost * ambientSpread) / 2}
                  // Separation of the left/right lobes, tied to the card's own
                  // width so they stay anchored to the artwork.
                  lobeOffset={cardWidth * scaleBoost * 0.22}
                  register={registerAura}
                />
              ) : null
            )}
          </motion.div>
        </div>
      )}
      <div
        ref={viewportRef}
        className={`carousel-viewport${dragging ? ' is-dragging' : ''}`}
        style={{ paddingBlock: verticalBleed }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        // The browser can take a captured pointer away mid-drag (a native
        // gesture winning, the element being removed). Without this the track
        // would be left mid-swipe, unsettled, with the gesture still marked
        // live. Fires after `pointerup` on a normal release, where the id no
        // longer matches and it costs nothing.
        onLostPointerCapture={endDrag}
        onKeyDown={handleKeyDown}
        // <img>/<a> elements a renderItem might return are natively
        // draggable; left unchecked, the browser's own ghost-image drag
        // fights our pointer-based drag-to-scroll below.
        onDragStart={(e) => e.preventDefault()}
        tabIndex={0}
        role="region"
        aria-roledescription="carousel"
        aria-label={panelName}
      >
        <motion.div
          className="carousel-track"
          style={{ x: trackTranslate, paddingLeft: sidePad, paddingRight: sidePad, gap }}
        >
          {items.map((item, i) => (
            <CarouselItem
              key={itemKey(item, i)}
              index={i}
              trackX={trackX}
              step={step}
              width={cardWidth}
              height={cardHeight}
              borderRadius={cardBorderRadius}
              scaleBoost={scaleBoost}
              maxBlur={maxBlur}
              hoverScaleAmount={hoverScaleAmount}
              hoverTransition={hoverTransition}
              onActivate={() => snapTo(i)}
              ariaLabel={itemLabel?.(item, i)}
              shadowColor={itemShadowColor?.(item, i)}
              shadowIntensity={shadowIntensity}
              showShadow={showShadow}
              onColorsChange={handleItemColors}
            >
              {renderItem(item, i)}
            </CarouselItem>
          ))}
        </motion.div>
      </div>

      {showDots && (
        <div className="carousel-dots">
          {items.map((item, i) => (
            <button
              key={itemKey(item, i)}
              type="button"
              className={`dot${i === activeIndex ? ' is-active' : ''}`}
              onClick={() => snapTo(i)}
              aria-label={itemLabel ? `Go to ${itemLabel(item, i)}` : `Go to slide ${i + 1}`}
              aria-current={i === activeIndex}
            />
          ))}
        </div>
      )}
    </div>
  )
}
