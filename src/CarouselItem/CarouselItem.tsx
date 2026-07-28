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

  return (
    <motion.article
      className="carousel-item"
      style={{ width, height, borderRadius, scale, filter }}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onDoubleClick={onActivate}
      aria-label={ariaLabel}
    >
      {children}
    </motion.article>
  )
}
