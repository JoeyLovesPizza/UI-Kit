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
  /** Paint the card's own drop shadow. Independent of the carousel's ambient wash — either, both, or neither can be on. */
  showShadow?: boolean
  /** Reports this card's current region colors so the carousel can light its ambient wash from them. Called at animation rates — must not set state. */
  onColorsChange?: (index: number, colors: Rgb[]) => void
  children?: ReactNode
}

export type Rgb = [number, number, number]
type SetShadowColor = (r: number, g: number, b: number) => void
type PaintGlow = (source: CanvasImageSource | null) => void

const CardShadowContext = createContext<SetShadowColor | null>(null)
const CardGlowContext = createContext<PaintGlow | null>(null)

/** Offscreen sampling grid. Averaged down to `SHADOW_REGIONS` colors in JS. */
const SAMPLE_COLS = 12
const SAMPLE_ROWS = 4
/** Horizontal regions of the artwork — each tints one of the shadow layers. */
const SHADOW_REGIONS = 3
/** Time for the shadow to cover half the remaining distance to the latest sampled color, so hard cuts glide instead of strobing. */
const GLOW_HALF_LIFE_MS = 145
/** Per-channel distance below which the ease is done: snap to target and park the loop. */
const GLOW_EPSILON = 0.5
/** Cap on a single frame's timestep, so returning to a backgrounded tab eases on from where it left off instead of jumping the whole accumulated gap at once. */
const MAX_FRAME_MS = 100

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
 *
 * Channels are rounded here and nowhere else: this is the only point that needs
 * whole numbers, and rounding any earlier would feed the loss back into the
 * ease (see `easeStep`).
 */
function buildShadow(colors: Rgb[], intensity: number) {
  const [l, c, r] = colors
  const a = (base: number) => Math.min(base * intensity, 1).toFixed(3)
  const rgb = (v: Rgb) => `${Math.round(v[0])}, ${Math.round(v[1])}, ${Math.round(v[2])}`
  return [
    `-12px 20px 28px -14px rgba(${rgb(l)}, ${a(0.3)})`,
    `0 24px 40px -16px rgba(${rgb(c)}, ${a(0.35)})`,
    `12px 20px 28px -14px rgba(${rgb(r)}, ${a(0.3)})`,
    `0 8px 18px -9px rgba(${rgb(c)}, ${a(0.25)})`,
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
  showShadow = true,
  onColorsChange,
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

  // The shadow is painted from `current`, which chases `target` on its own
  // animation frame loop. Content pushes samples at whatever rate suits it — a
  // video decodes far slower than the display refreshes — so easing once per
  // *sample* would step the shadow at the sampling rate, which reads as choppy
  // however smooth the page is otherwise. Interpolating here decouples the two.
  //
  // Both stay in float. Rounding is deferred to `buildShadow`, because feeding
  // rounded values back in quantizes the ease: once a channel is within a
  // couple of steps of its target, each increment rounds away to nothing and
  // the shadow stalls until content shifts far enough to jolt it again.
  const currentRef = useRef<Rgb[] | null>(null)
  const targetRef = useRef<Rgb[] | null>(null)
  const frameRef = useRef<number | null>(null)
  const lastFrameMsRef = useRef(0)
  const paintedRef = useRef('')
  const intensityRef = useRef(shadowIntensity)

  // Read through refs so `paint` — and with it the whole ease loop below — stays
  // referentially stable. Recreating it on a mode change would leave the running
  // frame loop holding a stale closure, and would churn the `useCardGlow`
  // identity that card content keys its sampling effect on.
  const showShadowRef = useRef(showShadow)
  const indexRef = useRef(index)
  const onColorsRef = useRef(onColorsChange)
  useEffect(() => {
    indexRef.current = index
    onColorsRef.current = onColorsChange
  })

  const paint = useCallback((colors: Rgb[], intensity: number) => {
    // Published whatever the mode: the carousel's ambient wash reads these even
    // when this card is painting no shadow of its own.
    onColorsRef.current?.(indexRef.current, colors)

    const el = surfaceRef.current
    if (!el) return

    if (!showShadowRef.current) {
      if (paintedRef.current === '') return
      paintedRef.current = ''
      el.style.boxShadow = ''
      return
    }

    const shadow = buildShadow(colors, intensity)
    // Sub-integer moves and a parked intensity often rebuild an identical
    // string; skipping the write keeps those frames off the repaint path.
    if (shadow === paintedRef.current) return
    paintedRef.current = shadow
    el.style.boxShadow = shadow
  }, [])

  // Drop or restore the card's own shadow the moment the mode changes, rather
  // than waiting on the next color content happens to push.
  useEffect(() => {
    showShadowRef.current = showShadow
    if (currentRef.current) paint(currentRef.current, intensityRef.current)
  }, [showShadow, paint])

  const easeStep = useCallback(
    (now: number) => {
      const target = targetRef.current
      const current = currentRef.current
      if (!target || !current) {
        frameRef.current = null
        return
      }

      const dt = Math.min(now - lastFrameMsRef.current, MAX_FRAME_MS)
      lastFrameMsRef.current = now
      // Frame-rate independent: the shadow covers half the remaining distance
      // every GLOW_HALF_LIFE_MS regardless of how often frames actually land,
      // so a dropped frame or a 120Hz display doesn't change the feel.
      const alpha = 1 - Math.pow(2, -dt / GLOW_HALF_LIFE_MS)

      let settled = true
      for (let k = 0; k < current.length; k++) {
        for (let c = 0; c < 3; c++) {
          const delta = target[k][c] - current[k][c]
          if (Math.abs(delta) <= GLOW_EPSILON) {
            current[k][c] = target[k][c]
            continue
          }
          current[k][c] += delta * alpha
          settled = false
        }
      }

      paint(current, intensityRef.current)
      // Park the loop once there's nothing left to move; the next sample
      // restarts it. An always-on rAF would otherwise keep a still card (or a
      // paused video) waking the compositor for no visible change.
      frameRef.current = settled ? null : requestAnimationFrame(easeStep)
    },
    [paint]
  )

  const easeTo = useCallback(
    (colors: Rgb[]) => {
      targetRef.current = colors
      // Nothing to glide from on the first color — a card would otherwise fade
      // its shadow in from whatever arbitrary value it started at.
      if (!currentRef.current) {
        currentRef.current = colors.map((c) => [...c] as Rgb)
        paint(currentRef.current, intensityRef.current)
        return
      }
      if (frameRef.current == null) {
        lastFrameMsRef.current = performance.now()
        frameRef.current = requestAnimationFrame(easeStep)
      }
    },
    [paint, easeStep]
  )

  useEffect(
    () => () => {
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current)
    },
    []
  )

  // Reads intensity from a ref: these are handed to card content and may be
  // called many times a second, so they must stay referentially stable while
  // still seeing the current dial value.
  const setShadowColor = useCallback<SetShadowColor>(
    (r, g, b) =>
      easeTo([
        [r, g, b],
        [r, g, b],
        [r, g, b],
      ]),
    [easeTo]
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

      // Hand the frame's colors over as the destination and let the frame loop
      // walk there; this call does no easing of its own, so how often content
      // samples no longer decides how smoothly the shadow moves.
      easeTo(target)
    },
    [easeTo]
  )

  const parsed = shadowColor ? toRgb(shadowColor) : null
  const baseColorKey = parsed ? parsed.join() : ''

  // Applied imperatively rather than via the style object so that colors set
  // through `useCardGlow` aren't clobbered on the next React render. On mount
  // this lands as the first color and so paints outright; a later change to the
  // prop eases across like any other.
  useEffect(() => {
    if (!baseColorKey) return
    const rgb = baseColorKey.split(',').map(Number) as Rgb
    easeTo([rgb, rgb, rgb])
  }, [baseColorKey, easeTo])

  // Repaint straight away when the intensity dial moves, rather than waiting
  // on the next color the content happens to push. Intensity is not eased —
  // it's a direct control, and a drag of the slider should track the pointer.
  useEffect(() => {
    intensityRef.current = shadowIntensity
    if (currentRef.current) paint(currentRef.current, shadowIntensity)
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
      // Touch has no hover to report: a tap fires enter/leave around itself,
      // which flashes the hover scale on every tap — and when the carousel
      // takes pointer capture mid-drag, the retargeting can swallow the leave
      // and strand a card scaled up until it is touched again.
      onPointerEnter={(e) => {
        if (e.pointerType !== 'touch') setHovered(true)
      }}
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
