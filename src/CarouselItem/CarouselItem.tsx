import { useEffect, useState, type ReactNode } from 'react'
import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type MotionValue,
  type Transition,
} from 'motion/react'
import './CarouselItem.css'

interface CarouselItemProps {
  index: number
  trackX: MotionValue<number>
  step: number
  width: number
  height: number
  borderRadius: number
  scaleBoost: number
  maxBlur: number
  hoverScaleAmount: number
  hoverTransition: Transition
  onActivate: () => void
  ariaLabel?: string
  /** Tints the card's drop shadow with this color instead of the default neutral one (e.g. a color sampled from the card's own image). */
  shadowColor?: string
  children?: ReactNode
}

/** Normalized distance (0 = centered, 1+ = a full item-step away or further). */
function distanceFromCenter(trackPos: number, index: number, step: number) {
  return Math.min(Math.abs((trackPos - index * step) / step), 1)
}

export function CarouselItem({
  index,
  trackX,
  step,
  width,
  height,
  borderRadius,
  scaleBoost,
  maxBlur,
  hoverScaleAmount,
  hoverTransition,
  onActivate,
  ariaLabel,
  shadowColor,
  children,
}: CarouselItemProps) {
  const [hovered, setHovered] = useState(false)

  const hoverBoost = useMotionValue(1)

  useEffect(() => {
    const controls = animate(hoverBoost, hovered ? hoverScaleAmount : 1, hoverTransition)
    return () => controls.stop()
  }, [hovered, hoverScaleAmount, hoverTransition, hoverBoost])

  const centerScale = useTransform(trackX, (latest) => {
    const d = distanceFromCenter(latest, index, step)
    return 1 + (scaleBoost - 1) * (1 - d)
  })

  const scale = useTransform([centerScale, hoverBoost], ([c, h]: number[]) => c * h)

  const filter = useTransform(trackX, (latest) => {
    const d = distanceFromCenter(latest, index, step)
    return `blur(${(d * maxBlur).toFixed(2)}px)`
  })

  // Cards paint in DOM order by default, so a right-hand neighbor would
  // stack over the (scaled-up, focused) centered card whenever they visually
  // overlap. Rank stacking by proximity to center instead so the focused
  // card is always on top.
  const zIndex = useTransform(trackX, (latest) => {
    const d = distanceFromCenter(latest, index, step)
    return Math.round((1 - d) * 100)
  })

  // Two-layer glow tinted with the card's own color, in place of the default
  // neutral shadow — a soft wide layer plus a tighter one close to the edge,
  // similar to how album art / poster shadows pick up the artwork's color.
  const coloredShadow = shadowColor
    ? `0 24px 48px -16px ${shadowColor}59, 0 8px 24px -10px ${shadowColor}40`
    : undefined

  return (
    <motion.article
      className="carousel-item"
      style={{
        width,
        height,
        borderRadius,
        scale,
        filter,
        zIndex,
        ...(coloredShadow ? { boxShadow: coloredShadow } : {}),
      }}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onDoubleClick={onActivate}
      aria-label={ariaLabel}
    >
      {children}
    </motion.article>
  )
}
