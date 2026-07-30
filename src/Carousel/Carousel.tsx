import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
  type Transition,
} from 'motion/react'
import { useDialKit } from 'dialkit'
import { CarouselItem } from '../CarouselItem/CarouselItem'
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
// Colored shadows (itemShadowColor) are a bigger, softer glow than the
// default neutral one, so they need more reserved room to avoid the
// clipping the plain SHADOW_BLEED budget would cause.
const COLORED_SHADOW_BLEED = 60
// Release speed (px/s) at or above which a gesture counts as a flick and
// advances a card on its own, however short the drag actually was.
const FLICK_VELOCITY = 400
// ...but it still has to be a deliberate movement. Requiring both guards means
// a fast jitter during a tap can't skip a card on its own.
const MIN_FLICK_DISTANCE = 24

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function rubberBand(value: number, min: number, max: number) {
  if (value < min) return min - (min - value) * RUBBER_BAND_RESISTANCE
  if (value > max) return max + (value - max) * RUBBER_BAND_RESISTANCE
  return value
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
  // (viewportWidth 0), to avoid a one-frame flash at zero size. Halved by
  // `sidePad` centering below, so this is the *total* left+right margin —
  // 48 gives 24px of breathing room on each side.
  const CARD_EDGE_PADDING = 48
  const responsiveScale =
    viewportWidth > 0 ? Math.min(1, (viewportWidth - CARD_EDGE_PADDING) / params.card.width) : 1

  const cardWidth = params.card.width * responsiveScale
  const cardHeight = params.card.height * responsiveScale
  const cardBorderRadius = params.card.borderRadius
  const gap = params.spacing.gap * responsiveScale
  const scaleBoost = params.centerFocus.scaleBoost
  const maxBlur = params.centerFocus.blur
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

  const isPointerDown = useRef(false)
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

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Stop native image/link drag and text-selection from ever starting.
    // Relying on the `dragstart` handler alone is racy: the browser can
    // begin its own drag and fire a `pointercancel` — aborting our gesture
    // mid-flight with a stale delta — before that handler runs. preventDefault
    // here also suppresses implicit focus, so restore it explicitly for
    // keyboard-arrow nav.
    e.preventDefault()
    e.currentTarget.focus()
    isPointerDown.current = true
    setDragging(true)
    dragStart.current = { pointerX: e.clientX, trackX: trackX.get() }
    dragStartIndex.current = activeIndexRef.current
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isPointerDown.current) return
    const delta = dragStart.current.pointerX - e.clientX
    trackX.set(rubberBand(dragStart.current.trackX + delta, minX, maxX))
  }

  const endDrag = () => {
    if (!isPointerDown.current) return
    isPointerDown.current = false
    setDragging(false)
    settleAfterRelease(dragStartIndex.current)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') snapTo(activeIndexRef.current + 1)
    if (e.key === 'ArrowLeft') snapTo(activeIndexRef.current - 1)
  }

  return (
    <div className="carousel-wrapper">
      <div
        ref={viewportRef}
        className={`carousel-viewport${dragging ? ' is-dragging' : ''}`}
        style={{ paddingBlock: verticalBleed }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
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
