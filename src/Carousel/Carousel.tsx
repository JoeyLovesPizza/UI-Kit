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

export interface CarouselProps<T> {
  items: T[]
  itemKey: (item: T, index: number) => string
  renderItem: (item: T, index: number) => ReactNode
  itemLabel?: (item: T, index: number) => string
  panelName?: string
}

const WHEEL_IDLE_MS = 140
const RUBBER_BAND_RESISTANCE = 0.35

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
  panelName = 'Carousel',
}: CarouselProps<T>) {
  const params = useDialKit(panelName, {
    card: {
      width: [340, 220, 560],
      height: [460, 260, 640],
      borderRadius: [20, 0, 60],
    },
    spacing: {
      gap: [32, 0, 120], // how close cards sit to one another
    },
    centerFocus: {
      scaleBoost: [1.1, 1, 1.5], // how much the centered card grows
      blur: [6, 0, 40], // max blur (px) applied the further a card is from center
    },
    hover: {
      scale: [1.05, 1, 1.3], // extra scale applied on top of centering while hovered
      transition: {
        type: 'spring',
        visualDuration: 0.25, // how long the hover scale takes to settle
        bounce: 0.3, // springiness of the hover-scale transition
      },
    },
    scroll: {
      speed: [1, 0.2, 3], // wheel/trackpad sensitivity multiplier
    },
    snap: {
      enabled: true, // snap the released/idle card back to center; off = free scroll
      threshold: [0.5, 0, 0.5], // how close to a card's center (fraction of the gap between cards) is needed to trigger snap; 0.5 = anywhere snaps, near 0 = must already be almost centered
      transition: {
        type: 'spring',
        visualDuration: 0.5,
        bounce: 0.15,
      },
    },
  })

  const cardWidth = params.card.width
  const cardHeight = params.card.height
  const cardBorderRadius = params.card.borderRadius
  const gap = params.spacing.gap
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

  const viewportRef = useRef<HTMLDivElement>(null)
  const [viewportWidth, setViewportWidth] = useState(0)
  const [activeIndex, setActiveIndex] = useState(0)
  const [dragging, setDragging] = useState(false)

  const trackX = useMotionValue(0)
  const trackTranslate = useTransform(trackX, (v) => -v)

  const isPointerDown = useRef(false)
  const dragStart = useRef({ pointerX: 0, trackX: 0 })
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
  const verticalBleed = (cardHeight * (maxCardScale - 1)) / 2 + maxBlur * 3

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
  const settleAfterRelease = useCallback(() => {
    const current = trackX.get()
    const nearestIndex = clamp(Math.round(current / step), 0, maxIndex)
    const distanceFromCenter = Math.abs(current - nearestIndex * step) / step

    if (snapEnabled && distanceFromCenter <= snapThreshold) {
      snapTo(nearestIndex)
      return
    }
    const bounded = clamp(current, minX, maxX)
    if (bounded !== current) animate(trackX, bounded, snapTransition)
  }, [snapEnabled, snapThreshold, snapTo, step, maxIndex, trackX, minX, maxX, snapTransition])

  useMotionValueEvent(trackX, 'change', (latest) => {
    const nearest = clamp(Math.round(latest / step), 0, maxIndex)
    if (nearest !== activeIndexRef.current) {
      activeIndexRef.current = nearest
      setActiveIndex(nearest)
    }
  })

  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const raw = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
      trackX.set(rubberBand(trackX.get() + raw * scrollSpeed, minX, maxX))

      if (wheelIdleTimer.current) clearTimeout(wheelIdleTimer.current)
      wheelIdleTimer.current = setTimeout(settleAfterRelease, WHEEL_IDLE_MS)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [minX, maxX, scrollSpeed, settleAfterRelease, trackX])

  const handlePointerDown = (e: React.PointerEvent) => {
    isPointerDown.current = true
    setDragging(true)
    dragStart.current = { pointerX: e.clientX, trackX: trackX.get() }
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
    settleAfterRelease()
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
            >
              {renderItem(item, i)}
            </CarouselItem>
          ))}
        </motion.div>
      </div>

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
    </div>
  )
}
