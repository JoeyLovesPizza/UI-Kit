import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
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
import { useDialKit } from 'dialkit'
import { CarouselItem, type Rgb } from '../CarouselItem/CarouselItem'
import './Carousel.css'

/**
 * Per-scenario starting values for the DialKit panel. The tunable range and
 * the interaction feel (springs, snap behavior) stay fixed — this only moves
 * where each slider starts, so different apps can open with card sizes/gaps
 * that suit their layout without dragging sliders by hand every time.
 */
/**
 * Which edge cards of differing heights line up on. Only visible alongside
 * `itemSize` — uniform cards are all the same height, so every alignment
 * looks identical.
 */
export type CarouselAlign = 'center' | 'top' | 'bottom'

export const CAROUSEL_ALIGNMENTS: CarouselAlign[] = ['center', 'top', 'bottom']

export interface CarouselDefaults {
  /** `width`/`height` size the uniform card; `scale` is the starting value of
      the scale dial that replaces them when `itemSize` is provided;
      `align` picks the edge cards of differing heights share. */
  card?: {
    width?: number
    height?: number
    borderRadius?: number
    scale?: number
    align?: CarouselAlign
  }
  /** `centerOffset` moves where the focused card rests, in px right of the
      viewport's midline — the track shifts, not the viewport, so cards still
      clip at the true screen edges. `endsCentered` lets the rail scroll the
      extra `centerOffset` at its end so the final card stops on the page's
      own centre rather than at that resting offset. */
  spacing?: { gap?: number; centerOffset?: number; endsCentered?: boolean }
  centerFocus?: { scaleBoost?: number; blur?: number }
  /** Tint each card's own drop shadow. On by default. */
  shadow?: { enabled?: boolean; intensity?: number }
  /** Wash the space behind the carousel with the centered card's colors. Off by default — independent of `shadow`, so either, both, or neither can be on. */
  ambient?: { enabled?: boolean; intensity?: number; spread?: number; saturation?: number }
  hover?: { scale?: number }
  scroll?: { speed?: number }
  /** How far the rail gives when dragged, before springing back. */
  drag?: { give?: number; maxPull?: number }
  snap?: { enabled?: boolean; threshold?: number }
}

export interface CarouselProps<T> {
  items: T[]
  itemKey: (item: T, index: number) => string
  renderItem: (item: T, index: number) => ReactNode
  itemLabel?: (item: T, index: number) => string
  /** Tints each card's drop shadow with a color derived from that item (e.g. sampled from its image), instead of the shared neutral shadow. Return undefined for an item to fall back to the default. */
  itemShadowColor?: (item: T, index: number) => string | undefined
  /**
   * Natural (design) size of each item's card. When provided, every card keeps
   * its own aspect ratio and footprint — the track spaces varying widths with
   * one shared gap — and the panel's width/height dials are replaced by a
   * single `scale` dial that grows or shrinks all cards together.
   */
  itemSize?: (item: T, index: number) => { width: number; height: number }
  /**
   * Extra transform laid over an item, for a host animating one card out of
   * the rail — into a detail page, say — while the rest clear out of the way.
   * Applied to a wrapper *outside* the card's own centre scale, so offsets
   * measured from a rendered `getBoundingClientRect()` map straight across
   * with nothing double-counted. Origin is the card's top-left.
   *
   * Return undefined (or nothing at all) to leave an item alone.
   */
  itemTransform?: (
    item: T,
    index: number
  ) => { x?: number; y?: number; scale?: number; opacity?: number } | undefined
  /**
   * How `itemTransform` animates. The host owns this rather than a dial here:
   * a handoff is one motion shared with whatever the card is expanding into,
   * so both ends have to be tuned from the same value.
   */
  itemTransformTransition?: Transition
  /**
   * Lets cards escape the rail's own box. The scroller normally clips, which
   * is what keeps neighbours out of sight — but a card being handed off has
   * to travel outside it. Setting this freezes the current scroll offset into
   * a transform and stops clipping, so nothing moves on screen but the rail
   * is no longer a boundary. Clearing it restores the scroll exactly.
   */
  unclipped?: boolean
  panelName?: string
  defaults?: CarouselDefaults
  /** Show the row of step dots below the carousel. Defaults to true. */
  showDots?: boolean
  /** Controlled active index — when it changes, the carousel snaps to it. Lets an external control (e.g. a `Stepper`) drive the carousel. */
  activeIndex?: number
  /** Called whenever the centered index changes, from any interaction (drag, wheel, keyboard, or an external `activeIndex` change). */
  onActiveIndexChange?: (index: number) => void
}

// Room to reserve for CarouselItem's box-shadow, which bleeds ~22px below
// the card regardless of the blur dial (that dial only controls the
// distance-based filter blur, not this fixed shadow).
const SHADOW_BLEED = 24
// The tinted multi-layer shadow (see CarouselItem's buildShadow) reaches
// ~52px below the card (24px offset + 48px blur − 20px spread), so it needs
// more room than the plain SHADOW_BLEED budget reserves.
const COLORED_SHADOW_BLEED = 64

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

// Only cards this far from the centered one get an aura mounted. A card's own
// aura is fully faded out by the time it is one step off center (see the weight
// below), so ±1 is all that can ever be visible; the extra step is slack so an
// aura is always already in the DOM, with its colors painted, before it has any
// strength to show.
const AURA_WINDOW = 2

interface CarouselAuraProps {
  index: number
  /** Continuous track position in index units (see `positionFor`). */
  trackPos: MotionValue<number>
  /** This card's center offset along the track, in px. */
  x: number
  /** This card's center offset from the layer's own middle, in px. Non-zero
      only under top/bottom alignment, where a shorter card's center sits off
      the tallest card's center. */
  y: number
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
  trackPos,
  x,
  y,
  maxIndex,
  intensity,
  radiusX,
  radiusY,
  lobeOffset,
  register,
}: CarouselAuraProps) {
  const opacity = useTransform(trackPos, (latest) => {
    // Clamped, so a rubber-band overshoot past the first or last card doesn't
    // fade the light down — that card is still the one on screen. Its aura
    // still *moves* with it, since position comes from the track transform.
    const position = clamp(latest, 0, maxIndex)
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
          '--ambient-x': `${x}px`,
          '--ambient-y': `${y}px`,
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
  itemSize,
  itemTransform,
  itemTransformTransition = { type: 'spring', visualDuration: 0.55, bounce: 0.18 },
  unclipped = false,
  panelName = 'Carousel',
  defaults,
  showDots = true,
  activeIndex: controlledActiveIndex,
  onActiveIndexChange,
}: CarouselProps<T>) {
  // With per-item sizes the width/height dials would fight the items' own
  // ratios, so the panel swaps them for one scale dial. The presence of
  // `itemSize` must not change across a mount (it decides the hook's config).
  // Widened to an index signature so the two shapes don't form a union —
  // that would defeat useDialKit's config inference for the whole panel.
  type CardDial =
    | [number, number, number]
    | [number, number, number, number]
    | { type: 'select'; options: string[]; default: string }
  const alignDial: CardDial = {
    type: 'select',
    options: CAROUSEL_ALIGNMENTS,
    default: defaults?.card?.align ?? 'center',
  }
  const cardFolder: Record<string, CardDial> = itemSize
    ? {
        scale: [defaults?.card?.scale ?? 1, 0.4, 2, 0.05],
        borderRadius: [defaults?.card?.borderRadius ?? 20, 0, 60],
        align: alignDial,
      }
    : {
        width: [defaults?.card?.width ?? 340, 220, 560],
        height: [defaults?.card?.height ?? 460, 260, 640],
        borderRadius: [defaults?.card?.borderRadius ?? 20, 0, 60],
        align: alignDial,
      }
  const params = useDialKit(panelName, {
    card: cardFolder,
    spacing: {
      // Range reaches 240: DialKit clamps a default into its dial's range, so
      // a host asking for a wider editorial gap (the portfolio's 142) must not
      // be silently pulled back to the old 120 cap.
      gap: [defaults?.spacing?.gap ?? 32, 0, 240], // how close cards sit to one another
      // Where the focused card rests, in px right of the viewport's midline.
      // Shifting the page's layout around the carousel instead (a transform on
      // the wrapper) drags the overflow clip along with it and cuts cards off
      // at a hard edge mid-page — this shifts only the track inside the clip.
      centerOffset: [defaults?.spacing?.centerOffset ?? 0, -300, 300],
      // With a resting offset every card sits off the page's centre, the
      // last one included — so the rail ends with its final card pushed to
      // one side and dead space on the other. This lets the end of the rail
      // travel that offset out, resolving on the page's own centre.
      endsCentered: defaults?.spacing?.endsCentered ?? false,
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
    // Dragging is a tug, not a scroll: the rail gives a little and springs
    // back to where it was. Scrolling is what actually moves between cards.
    drag: {
      give: [defaults?.drag?.give ?? 0.22, 0, 1, 0.02], // fraction of the pointer's travel the rail follows
      maxPull: [defaults?.drag?.maxPull ?? 72, 0, 240], // furthest it will ever move, however hard you pull
      release: {
        type: 'spring',
        visualDuration: 0.4,
        bounce: 0.36, // a little overshoot on the way home reads as elastic
      },
    },
    snap: {
      // Hands the rail to CSS scroll snapping. Off is free scroll — a
      // released gesture coasts and stops wherever it lands.
      //
      // There is deliberately no threshold or spring to tune here any more:
      // snapping is `scroll-snap-type` now, so the browser owns the
      // momentum, and it does it on the compositor. Dials for values the
      // browser no longer takes would just be dead controls.
      enabled: defaults?.snap?.enabled ?? true,
    },
  })

  const viewportRef = useRef<HTMLDivElement>(null)
  const [viewportWidth, setViewportWidth] = useState(0)

  // The index signature above erases each dial's own resolved type, and which
  // keys exist follows `itemSize` — so treat them all as possibly absent and
  // narrow at each read.
  // Through `unknown`: the folder's index signature is a union of dial
  // shapes, so DialKit's resolver can't map it to any single value type.
  const cardDials = params.card as unknown as Record<string, number | string | undefined>

  // Natural per-card footprints. Without `itemSize`, every card shares the
  // dialled width/height and all the array math below degenerates to the old
  // uniform-step behavior.
  const naturalSizes = useMemo(
    () => (itemSize ? items.map((item, i) => itemSize(item, i)) : null),
    [items, itemSize]
  )
  const sizeScale = (cardDials.scale as number) ?? 1
  const baseWidths = naturalSizes
    ? naturalSizes.map((s) => s.width * sizeScale)
    : items.map(() => (cardDials.width as number) ?? 340)
  const baseHeights = naturalSizes
    ? naturalSizes.map((s) => s.height * sizeScale)
    : items.map(() => (cardDials.height as number) ?? 460)
  const maxBaseWidth = baseWidths.length ? Math.max(...baseWidths) : 0
  const maxBaseHeight = baseHeights.length ? Math.max(...baseHeights) : 0

  // Shrinks the cards (preserving aspect ratio) when the widest of them
  // doesn't fit the viewport, so cards sized for desktop don't overflow a
  // phone screen. Only ever scales down, never past the dialled size.
  // Skipped before the first ResizeObserver measurement lands (viewportWidth
  // 0), to avoid a one-frame flash at zero size. Halved by the side padding
  // centering below, so this is the *total* left+right margin — 48 gives 24px
  // of breathing room on each side.
  const CARD_EDGE_PADDING = 48
  // Measured against the *centered* card's width, i.e. after `scaleBoost`
  // enlarges it. Sizing the unscaled card instead lets the focused one grow
  // back into the margin and sit nearly flush with the screen edge.
  const responsiveScale =
    viewportWidth > 0 && maxBaseWidth > 0
      ? Math.min(
          1,
          (viewportWidth - CARD_EDGE_PADDING) / (maxBaseWidth * params.centerFocus.scaleBoost)
        )
      : 1

  const widths = baseWidths.map((w) => w * responsiveScale)
  const heights = baseHeights.map((h) => h * responsiveScale)
  const maxCardWidth = maxBaseWidth * responsiveScale
  const maxCardHeight = maxBaseHeight * responsiveScale
  const cardBorderRadius = (cardDials.borderRadius as number) ?? 20
  const cardAlign = ((cardDials.align as CarouselAlign) ?? 'center') satisfies CarouselAlign
  const trackAlignItems =
    cardAlign === 'top' ? 'flex-start' : cardAlign === 'bottom' ? 'flex-end' : 'center'
  // Cards grow out of the edge they're aligned to, so focusing or hovering
  // one never pushes it off the line its neighbours share.
  const cardTransformOrigin =
    cardAlign === 'top' ? 'center top' : cardAlign === 'bottom' ? 'center bottom' : 'center'
  const scaleBoost = params.centerFocus.scaleBoost

  // The centered card grows by `scaleBoost`, overhanging into the gap on both
  // sides. Add that overhang back so the dialled gap is the space you actually
  // see beside the focused card, instead of collapsing to a few pixels and
  // leaving it near-touching its neighbours. Sized to the widest card so no
  // pairing can close the gap entirely.
  const centerOverhang = (maxCardWidth * (scaleBoost - 1)) / 2
  let gap = params.spacing.gap * responsiveScale + centerOverhang

  // Once the cards have had to shrink to fit (i.e. a phone), there is no
  // longer room for a neighbour to read as a deliberate peek — it can only
  // appear as a thin cropped sliver jammed against the edge. Park neighbours
  // fully offscreen so a single card reads cleanly instead.
  if (responsiveScale < 1 && viewportWidth > 0) {
    gap = Math.max(gap, viewportWidth / 2 - maxCardWidth / 2 + CARD_EDGE_PADDING / 2)
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
  const dragGive = params.drag.give
  const dragMaxPull = params.drag.maxPull
  const dragRelease = params.drag.release as Transition
  const snapEnabled = params.snap.enabled

  const maxIndex = items.length - 1
  const centerOffset = params.spacing.centerOffset

  // Where each card's center sits along the track, relative to the first
  // card's center. With uniform cards this is `index * (width + gap)` — the
  // old single `step` — but per-item sizes make the spacing between centers
  // vary pair by pair, so every "index * step" below reads this instead.
  const centers: number[] = []
  {
    let acc = 0
    for (let i = 0; i < widths.length; i++) {
      if (i > 0) acc += (widths[i - 1] + widths[i]) / 2 + gap
      centers.push(acc)
    }
  }
  // Where the track comes to rest for each card. Identical to `centers`,
  // except the last card may travel the resting offset back out so it stops
  // on the page's centre — see `endsCentered`.
  const endsCentered = params.spacing.endsCentered
  const restFor = (index: number) =>
    (centers[index] ?? 0) + (endsCentered && index === maxIndex ? centerOffset : 0)

  // Read through refs inside motion transforms and stable callbacks so a
  // dial drag doesn't rebuild every subscriber.
  const centersRef = useRef(centers)
  centersRef.current = centers
  const restForRef = useRef(restFor)
  restForRef.current = restFor

  /**
   * Continuous index for a track position: 1.5 is halfway between cards 1 and
   * 2 *by pixel distance between those two centers*, however wide each one
   * is. Extrapolates past the ends so rubber-band overshoot keeps moving the
   * derived effects.
   */
  const positionFor = useCallback((x: number) => {
    const c = centersRef.current
    if (c.length < 2) return 0
    let i = 0
    while (i < c.length - 2 && x > c[i + 1]) i++
    return i + (x - c[i]) / (c[i + 1] - c[i])
  }, [])

  const [activeIndex, setActiveIndex] = useState(0)
  const [dragging, setDragging] = useState(false)

  // The scroller's own scrollLeft, mirrored into a motion value. Native
  // scrolling is the only thing that moves the cards — nothing in here drives
  // their position — so this is read, never written to the DOM. The mapping is
  // exact: the paddings below are chosen so scrollLeft equals `centers[i]`
  // when card i is at rest.
  const scrollX = useMotionValue(0)
  /**
   * Everything applied to the track as a transform rather than as scroll:
   * the elastic give while dragging, and — while unclipped — the scroll
   * offset the scroller handed back. Zero at rest, which is the normal case.
   */
  const trackOffset = useMotionValue(0)
  // Where `trackOffset` returns to. Non-zero only while unclipped.
  const trackRest = useRef(0)
  // The ambient layer lives outside the scroller, so it is offset by hand to
  // stay locked to the cards that cast it — including through a drag's give.
  const ambientTranslate = useTransform(
    [scrollX, trackOffset],
    ([s, o]: number[]) => -s + o
  )
  // Shared continuous position every card and aura derives its distance from.
  // Clamped to the real card range so the extra stretch `endsCentered` adds
  // doesn't start defocusing the card that is actually on screen.
  const trackPos = useTransform(scrollX, (v) => clamp(positionFor(v), 0, maxIndex))

  const isPointerDown = useRef(false)
  const dragStart = useRef({ pointerX: 0, scrollLeft: 0 })
  const activeIndexRef = useRef(0)

  // Where the rail was when clipping stopped. Held so the track can be
  // translated by exactly the scroll it gave up, leaving the cards where they
  // already were, and so the scroll can be handed back untouched afterwards.
  const [frozenScroll, setFrozenScroll] = useState<number | null>(null)

  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      setViewportWidth(entries[0].contentRect.width)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Each end pads by its own card's width, so both the first and last card
  // can sit exactly centered — plus the dialled resting offset, which slides
  // the whole rail without touching the viewport's own clip box.
  const sidePadLeft = Math.max(0, (viewportWidth - (widths[0] ?? 0)) / 2 + centerOffset)
  // The extra room `endsCentered` scrolls into has to exist on the right, or
  // the last card would simply run out of track before reaching the centre.
  const sidePadRight = Math.max(
    0,
    (viewportWidth - (widths[maxIndex] ?? 0)) / 2 - (endsCentered ? 0 : centerOffset)
  )
  // No bounds to track: the scroller's own extent is the limit, and the
  // browser clamps every scroll against it — including a drag that writes
  // scrollLeft directly.

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
    (maxCardHeight * (maxCardScale - 1)) / 2 +
    maxBlur * 3 +
    (itemShadowColor ? COLORED_SHADOW_BLEED : SHADOW_BLEED)

  // Programmatic moves (keyboard, dots, an external activeIndex) hand off to
  // the browser's own smooth scroll rather than animating a transform.
  const snapTo = useCallback(
    (index: number) => {
      const el = viewportRef.current
      if (!el) return
      el.scrollTo({ left: restForRef.current(clamp(index, 0, maxIndex)), behavior: 'smooth' })
    },
    [maxIndex]
  )

  // Dial and viewport changes move every card's center, so the track has to
  // be corrected to keep the active card centered.
  //
  // Set, never animate. Card sizes and the gap are layout properties, so the
  // row reflows in a single frame with every card already at its new
  // position — springing the track afterwards means the layout snaps and the
  // track then glides to catch up, which is exactly the jump you see when
  // dragging the size dials. Matching the instant change with an instant
  // correction leaves the centered card visually still while the cards around
  // it resize. Skipped mid-drag: the drag owns the track until release.
  const centersKey = centers.map((c) => Math.round(c)).join(',')
  useEffect(() => {
    if (isPointerDown.current) return
    const el = viewportRef.current
    if (!el) return
    const target = restForRef.current(activeIndexRef.current)
    if (Math.abs(el.scrollLeft - target) > 0.5) el.scrollLeft = target
    // Keyed on the rounded geometry alone: re-running on every transition
    // tweak would fight a scroll that is already where it should be.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centersKey])

  // Stop clipping without moving anything: take the scroll offset the
  // scroller is about to lose — `overflow: visible` stops it being a scroll
  // container at all, which discards it — and re-apply it as a transform on
  // the track. `scrollX` is left parked at the frozen value so the ambient
  // layer, which offsets itself by it, stays locked to the cards.
  const pendingRestore = useRef<number | null>(null)
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    if (unclipped) {
      const at = el.scrollLeft
      pendingRestore.current = at
      setFrozenScroll(at)
      scrollX.set(at)
      trackRest.current = -at
      trackOffset.set(-at)
    } else {
      setFrozenScroll(null)
    }
  }, [unclipped, scrollX, trackOffset])

  // Handing the scroll back has to wait for the element to be a scroller
  // again: writing scrollLeft while overflow is still `visible` is silently
  // dropped, which lost the position entirely and snapped the rail to zero.
  // Restoring the scroll and releasing the transform together, before paint,
  // means the swap is invisible.
  useLayoutEffect(() => {
    if (frozenScroll != null) return
    const el = viewportRef.current
    const at = pendingRestore.current
    if (!el || at == null) return
    pendingRestore.current = null
    el.scrollLeft = at
    trackRest.current = 0
    trackOffset.set(0)
    scrollX.set(el.scrollLeft)
  }, [frozenScroll, scrollX, trackOffset])

  // Mirror the scroller into the motion value, and track which card is
  // centred. `scroll` fires before the frame is painted, so the derived
  // transforms land in the same frame as the scroll that caused them.
  //
  // Where a settle step used to live: releasing a drag is now the browser's
  // problem. With snap on it carries the card to its snap point with real
  // momentum; with snap off it coasts and stops. Either way there is no
  // flick threshold, no rubber band and no spring to tune — and none of it
  // runs on the main thread.
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const onScroll = () => {
      // While unclipped there is no scrollport to speak of; the parked value
      // is the truth, and letting a 0 through here would snap the aura across.
      if (frozenScroll != null) return
      scrollX.set(el.scrollLeft)
      const nearest = clamp(Math.round(positionFor(el.scrollLeft)), 0, maxIndex)
      if (nearest !== activeIndexRef.current) {
        activeIndexRef.current = nearest
        setActiveIndex(nearest)
        onActiveIndexChange?.(nearest)
      }
    }
    onScroll()
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [scrollX, positionFor, maxIndex, onActiveIndexChange, frozenScroll])

  // External control (e.g. a `Stepper` driving this carousel): snap to the
  // controlled index whenever it changes from outside.
  const isFirstControlledRun = useRef(true)
  useEffect(() => {
    const isFirstRun = isFirstControlledRun.current
    isFirstControlledRun.current = false
    if (controlledActiveIndex == null) return
    if (controlledActiveIndex === activeIndexRef.current) return
    // Mounting with a card already selected means the rail is being restored,
    // not moved — a host returning from that card's own page, say. Animating
    // would slide the whole rail in from the first card, reading as the
    // carousel flying back into place. Start where it should already be.
    if (isFirstRun) {
      const el = viewportRef.current
      if (el) el.scrollLeft = restForRef.current(clamp(controlledActiveIndex, 0, maxIndex))
      return
    }
    snapTo(controlledActiveIndex)
  }, [controlledActiveIndex, snapTo, maxIndex])

  // Horizontal intent — a trackpad swipe, a tilt wheel — is the scroller's own
  // job and is left entirely alone. Only a vertical-only wheel needs
  // redirecting, so a plain mouse can still move the rail.
  //
  // Both are armed only while the pointer is over a card. The rail's box is
  // much wider than the cards in it, and a wheel over the empty page beside
  // them belongs to the page, not here. (The stylesheet gates native
  // scrolling the same way, on `:has(.carousel-item:hover)`.)
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      const overCard = e.target instanceof Element && Boolean(e.target.closest('.carousel-item'))
      const horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY)
      if (!overCard) {
        // Off the cards the rail is inert. Horizontal intent would otherwise
        // be taken by the scroller this sits on, so it has to be refused
        // outright; vertical is left alone so the page still gets it.
        if (horizontal) e.preventDefault()
        return
      }
      // Over a card, a horizontal gesture is the scroller's own to handle —
      // that is the native, compositor-driven path and the good one.
      if (horizontal || e.deltaY === 0) return
      // Only a vertical-only wheel needs redirecting, so a plain mouse can
      // move the rail too.
      e.preventDefault()
      el.scrollLeft += e.deltaY * scrollSpeed
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [scrollSpeed])

  /**
   * Dragging is a tug on the rail, not a way to scroll it.
   *
   * The rail follows a fraction of the pointer's travel up to a hard ceiling,
   * then springs back to exactly where it was — so a drag reads as the cards
   * being on a tether. Scrolling is what actually moves between them, which
   * keeps momentum and snapping in the browser's hands where they belong.
   *
   * Mice only: on a touchscreen this gesture *is* the scroll.
   */
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse') return
    // Only a card can be tugged. Pressing the empty page beside the rail
    // does nothing, matching where scrolling is armed.
    if (!(e.target instanceof Element) || !e.target.closest('.carousel-item')) return
    // Stop native image/link drag and text selection from ever starting. This
    // also suppresses implicit focus, so restore it for keyboard-arrow nav.
    e.preventDefault()
    e.currentTarget.focus()
    isPointerDown.current = true
    setDragging(true)
    dragStart.current = { pointerX: e.clientX, scrollLeft: 0 }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isPointerDown.current) return
    const pulled = e.clientX - dragStart.current.pointerX
    // Diminishing follow, then a ceiling: pulling harder keeps giving a
    // little more travel, but never enough to read as scrolling.
    const eased = Math.sign(pulled) * Math.min(Math.abs(pulled) * dragGive, dragMaxPull)
    trackOffset.set(trackRest.current + eased)
  }

  const endDrag = () => {
    if (!isPointerDown.current) return
    isPointerDown.current = false
    setDragging(false)
    animate(trackOffset, trackRest.current, dragRelease)
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
            top: verticalBleed + maxCardHeight / 2,
          }}
        >
          <motion.div className="carousel-ambient-track" style={{ x: ambientTranslate }}>
            {items.map((item, i) =>
              Math.abs(i - activeIndex) <= AURA_WINDOW ? (
                <CarouselAura
                  key={itemKey(item, i)}
                  index={i}
                  trackPos={trackPos}
                  x={centers[i] + centerOffset}
                  // Under top/bottom alignment a shorter card's own center
                  // sits off the tallest card's, which is what the layer is
                  // anchored to; shift its light by the same amount.
                  y={
                    cardAlign === 'top'
                      ? (heights[i] - maxCardHeight) / 2
                      : cardAlign === 'bottom'
                        ? (maxCardHeight - heights[i]) / 2
                        : 0
                  }
                  maxIndex={maxIndex}
                  intensity={ambientIntensity}
                  // How far the color reaches. This — not the element's own box
                  // — is what `spread` drives.
                  radiusX={(widths[i] * scaleBoost * ambientSpread) / 2}
                  radiusY={(heights[i] * scaleBoost * ambientSpread) / 2}
                  // Separation of the left/right lobes, tied to the card's own
                  // width so they stay anchored to the artwork.
                  lobeOffset={widths[i] * scaleBoost * 0.22}
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
        style={{
          paddingBlock: verticalBleed,
          // Snap is the browser's, not ours — but it has to be off while a
          // mouse drag is writing scrollLeft directly, or every write gets
          // snapped back under the pointer. Re-enabling it on release is what
          // carries the card home.
          // Unclipped, the rail stops being a boundary so a card can travel
          // out of it. Snapping goes with it — there is no scrollport left to
          // snap within. Left unset otherwise, so the stylesheet can arm
          // scrolling on card hover.
          overflowX: frozenScroll != null ? 'visible' : undefined,
          overflowY: frozenScroll != null ? 'visible' : undefined,
          scrollSnapType: snapEnabled && !dragging && frozenScroll == null ? 'x mandatory' : 'none',
          // `scroll-snap-align: center` centres cards in the snapport, which
          // knows nothing of the resting offset. Padding the snapport's start
          // by twice the offset moves its midpoint over by exactly that much.
          scrollPaddingLeft: snapEnabled ? centerOffset * 2 : undefined,
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={handleKeyDown}
        // <img>/<a> elements a renderItem might return are natively
        // draggable; left unchecked, the browser's own ghost-image drag
        // fights the pointer drag-to-scroll above.
        onDragStart={(e) => e.preventDefault()}
        tabIndex={0}
        role="region"
        aria-roledescription="carousel"
        aria-label={panelName}
      >
        {/* Normally a plain element — its position *is* the scroller's
            scrollLeft, so there is nothing here to keep in sync. The only
            exception is while unclipped, when it carries the scroll offset
            the scroller gave up. */}
        <motion.div
          className="carousel-track"
          style={{
            x: trackOffset,
            paddingLeft: sidePadLeft,
            paddingRight: sidePadRight,
            gap,
            alignItems: trackAlignItems,
          }}
        >
          {items.map((item, i) => {
            const handoff = itemTransform?.(item, i)
            return (
              // The slot is the snap target and the handoff's handle. Keeping
              // the host's transform out here means it multiplies with the
              // card's own centre scale rather than replacing it — which is
              // what lets an offset measured from a rendered rect be applied
              // verbatim, with the card's top-left as the origin.
              <motion.div
                key={itemKey(item, i)}
                className="carousel-slot"
                animate={{
                  x: handoff?.x ?? 0,
                  y: handoff?.y ?? 0,
                  scale: handoff?.scale ?? 1,
                  opacity: handoff?.opacity ?? 1,
                }}
                transition={itemTransformTransition}
              >
                <CarouselItem
                  index={i}
                  trackPos={trackPos}
                  width={widths[i]}
                  height={heights[i]}
                  transformOrigin={cardTransformOrigin}
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
              </motion.div>
            )
          })}
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
