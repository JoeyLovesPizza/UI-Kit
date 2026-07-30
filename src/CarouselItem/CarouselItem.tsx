import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
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
  /** Tints the card's drop shadow (e.g. a color sampled from the card's own artwork). */
  shadowColor?: string
  /** Multiplies the shadow strength. 0 hides it, 1 is the built-in weight. */
  shadowIntensity?: number
  children?: ReactNode
}

type Rgb = [number, number, number]
type SetShadowColor = (r: number, g: number, b: number) => void
type PaintGlow = (source: CanvasImageSource | null) => void

const CardShadowContext = createContext<SetShadowColor | null>(null)
const CardGlowContext = createContext<PaintGlow | null>(null)

/** Offscreen sampling grid. Averaged down to `SHADOW_REGIONS` colors in JS. */
const SAMPLE_COLS = 12
const SAMPLE_ROWS = 4
/** Horizontal regions of the artwork — each tints one of the shadow layers. */
const SHADOW_REGIONS = 3
/** Fraction each new sample moves the shadow toward the frame's colors, so hard cuts glide instead of strobing. */
const GLOW_EASING = 0.25

/**
 * Lets a card's own content set that card's shadow to one uniform color.
 *
 * The setter writes straight to the card's DOM node, so it is safe to call at
 * animation rates: no state, no re-render of the carousel or its siblings.
 * Returns `null` when called outside a `CarouselItem`.
 */
export function useCardShadowColor() {
  return useContext(CardShadowContext)
}

/**
 * Drives the card's shadow from the content's own pixels. Hand it any drawable
 * source (a `<video>`, `<img>`, or `<canvas>`) and the frame is averaged into
 * left / center / right regions, each tinting its own shadow layer — so the
 * light under the card follows the layout of the scene above it.
 *
 * Deliberately NOT a blurred visible copy of the frame: a colored rectangle
 * only reads as a shadow under heavy blur, which then washes out or clips at
 * the screen edge — and the canvas `filter` it needs is ignored by older
 * Safari, leaving hard-edged blocks on iOS. Real box-shadows have correct
 * falloff everywhere by construction.
 *
 * Writes straight to the DOM, safe to call every frame. Returns `null` when
 * called outside a `CarouselItem`.
 */
export function useCardGlow() {
  return useContext(CardGlowContext)
}

/** Parses `#rgb`, `#rrggbb`, and `rgb()`/`rgba()` into channel values. */
function toRgb(color: string): Rgb | null {
  const value = color.trim()
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(value)
  if (short) {
    return [
      parseInt(short[1] + short[1], 16),
      parseInt(short[2] + short[2], 16),
      parseInt(short[3] + short[3], 16),
    ]
  }
  const long = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value)
  if (long) return [parseInt(long[1], 16), parseInt(long[2], 16), parseInt(long[3], 16)]
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(value)
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]
  return null
}

/**
 * Four stacked shadows: a left- and right-leaning pair tinted by their side of
 * the artwork, the main drop tinted by the center, and a tight contact shadow
 * for grounding. Sideways reach (offset + blur − |spread|) is kept ≈26px so
 * the falloff finishes inside the 24px margin a phone gives the card instead
 * of being clipped flat at the screen edge.
 *
 * `intensity` scales opacity only. Geometry stays fixed so the vertical bleed
 * `Carousel` reserves stays correct at any setting.
 */
function buildShadow(colors: Rgb[], intensity: number) {
  const [l, c, r] = colors
  const a = (base: number) => Math.min(base * intensity, 1).toFixed(3)
  return [
    `-12px 20px 28px -14px rgba(${l[0]}, ${l[1]}, ${l[2]}, ${a(0.3)})`,
    `0 24px 40px -16px rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a(0.35)})`,
    `12px 20px 28px -14px rgba(${r[0]}, ${r[1]}, ${r[2]}, ${a(0.3)})`,
    `0 8px 18px -9px rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a(0.25)})`,
  ].join(', ')
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
  shadowIntensity = 1,
  children,
}: CarouselItemProps) {
  const [hovered, setHovered] = useState(false)
  const surfaceRef = useRef<HTMLElement>(null)
  const sampleRef = useRef<HTMLCanvasElement | null>(null)

  const hoverBoost = useMotionValue(1)

  useEffect(() => {
    const controls = animate(hoverBoost, hovered ? hoverScaleAmount : 1, hoverTransition)
    return () => controls.stop()
  }, [hovered, hoverScaleAmount, hoverTransition, hoverBoost])

  // The last colors painted, whether they came from the `shadowColor` prop or
  // a `useCardGlow`/`useCardShadowColor` caller — so an intensity change can
  // repaint using whichever is currently in effect.
  const lastColorsRef = useRef<Rgb[] | null>(null)
  const intensityRef = useRef(shadowIntensity)

  const paint = useCallback((colors: Rgb[], intensity: number) => {
    lastColorsRef.current = colors
    const el = surfaceRef.current
    if (el) el.style.boxShadow = buildShadow(colors, intensity)
  }, [])

  // Reads intensity from a ref: these are handed to card content and may be
  // called many times a second, so they must stay referentially stable while
  // still seeing the current dial value.
  const setShadowColor = useCallback<SetShadowColor>(
    (r, g, b) =>
      paint(
        [
          [r, g, b],
          [r, g, b],
          [r, g, b],
        ],
        intensityRef.current
      ),
    [paint]
  )

  const paintGlow = useCallback<PaintGlow>(
    (source) => {
      if (!source) return
      let sample = sampleRef.current
      if (!sample) {
        sample = document.createElement('canvas')
        sample.width = SAMPLE_COLS
        sample.height = SAMPLE_ROWS
        sampleRef.current = sample
      }
      const ctx = sample.getContext('2d', { willReadFrequently: true })
      if (!ctx) return

      // Downscaling averages *locally*; the per-region JS average below is
      // deliberate belt-and-suspenders, since single-step downscale filtering
      // quality varies between engines.
      ctx.drawImage(source, 0, 0, SAMPLE_COLS, SAMPLE_ROWS)
      const { data } = ctx.getImageData(0, 0, SAMPLE_COLS, SAMPLE_ROWS)
      const colsPerRegion = SAMPLE_COLS / SHADOW_REGIONS

      const target: Rgb[] = []
      for (let k = 0; k < SHADOW_REGIONS; k++) {
        let r = 0
        let g = 0
        let b = 0
        let n = 0
        for (let row = 0; row < SAMPLE_ROWS; row++) {
          for (let col = k * colsPerRegion; col < (k + 1) * colsPerRegion; col++) {
            const i = (row * SAMPLE_COLS + col) * 4
            r += data[i]
            g += data[i + 1]
            b += data[i + 2]
            n++
          }
        }
        target.push([r / n, g / n, b / n])
      }

      const prev = lastColorsRef.current
      const eased =
        prev && prev.length === SHADOW_REGIONS
          ? target.map(
              (t, k) => t.map((ch, c) => prev[k][c] + (ch - prev[k][c]) * GLOW_EASING) as Rgb
            )
          : target
      paint(
        eased.map((c) => c.map(Math.round) as Rgb),
        intensityRef.current
      )
    },
    [paint]
  )

  const parsed = shadowColor ? toRgb(shadowColor) : null
  const baseColorKey = parsed ? parsed.join() : ''

  // Applied imperatively rather than via the style object so that colors set
  // through `useCardGlow` aren't clobbered on the next React render.
  useEffect(() => {
    if (!baseColorKey) return
    const rgb = baseColorKey.split(',').map(Number) as Rgb
    paint([rgb, rgb, rgb], intensityRef.current)
  }, [baseColorKey, paint])

  // Repaint straight away when the intensity dial moves, rather than waiting
  // on the next color the content happens to push.
  useEffect(() => {
    intensityRef.current = shadowIntensity
    if (lastColorsRef.current) paint(lastColorsRef.current, shadowIntensity)
  }, [shadowIntensity, paint])

  const centerScale = useTransform(trackX, (latest) => {
    const d = distanceFromCenter(latest, index, step)
    return 1 + (scaleBoost - 1) * (1 - d)
  })

  const scale = useTransform([centerScale, hoverBoost], ([c, h]: number[]) => c * h)

  // Applied to the whole card, not just its contents, so an off-center card
  // defocuses as one object — edges, corner radius and shadow together. (An
  // earlier version blurred only the inner content to avoid a pale halo, but
  // that halo came from the since-removed glow canvas being blurred alongside
  // the card, and it left off-center cards with disconcertingly crisp edges
  // around a blurred picture.)
  const filter = useTransform(trackX, (latest) => {
    const d = distanceFromCenter(latest, index, step)
    const blur = d * maxBlur
    // `blur(0px)` is not free: it still promotes this element to its own
    // compositing layer, and iOS WebKit clips descendants to that layer's box.
    // Emit `none` when there is nothing to blur so the focused card never does.
    return blur < 0.05 ? 'none' : `blur(${blur.toFixed(2)}px)`
  })

  // Cards paint in DOM order by default, so a right-hand neighbor would
  // stack over the (scaled-up, focused) centered card whenever they visually
  // overlap. Rank stacking by proximity to center instead so the focused
  // card is always on top.
  const zIndex = useTransform(trackX, (latest) => {
    const d = distanceFromCenter(latest, index, step)
    return Math.round((1 - d) * 100)
  })

  return (
    <motion.div
      className="carousel-item"
      style={{ width, height, scale, filter, zIndex }}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onDoubleClick={onActivate}
    >
      <article
        ref={surfaceRef}
        className="carousel-item__surface"
        style={{ borderRadius }}
        aria-label={ariaLabel}
      >
        <CardGlowContext.Provider value={paintGlow}>
          <CardShadowContext.Provider value={setShadowColor}>{children}</CardShadowContext.Provider>
        </CardGlowContext.Provider>
      </article>
    </motion.div>
  )
}
