# ui-kit

Personal React component library. Not published — consumed by local projects via a `file:` dependency.

**Design principle:** the interaction — drag, wheel/trackpad scroll, keyboard arrows, center-snap physics, the DialKit tuning panel — is shared across every app that uses this. It lives here once. What each app draws inside the cards, and where each app's sliders start out, is fully owned by that app and costs zero edits to this repo.

## Docs site

`site/` is a small Vite/React app for browsing every component, trying it live, and copying usage snippets — it aliases straight to `src/`, so it always reflects what's currently there, no build step needed.

```bash
cd site
npm install
npm run dev
```

Builds as a static site (`npm run build` → `site/dist`) with a GitHub Actions workflow ([.github/workflows/deploy-site.yml](.github/workflows/deploy-site.yml)) that deploys it to GitHub Pages on push to `main`.

## Setup in a consuming project

```bash
npm install ../ui-kit
```

This adds `"ui-kit": "file:../ui-kit"` to the consuming project's `package.json` (adjust the relative path if the two folders aren't siblings). npm installs `file:` dependencies as a symlink, so rebuilding `ui-kit` (`npm run build`) picks up immediately in every project that depends on it — no reinstall needed.

Because `ui-kit` is resolved outside the consuming project's root, its own copies of `react`/`react-dom` must be deduped against the consuming project's. If you hit "Invalid hook call" or duplicate-React errors, add to the consuming project's `vite.config.ts`:

```ts
export default defineConfig({
  resolve: { dedupe: ['react', 'react-dom', 'motion', 'dialkit'] },
})
```

## Customizing per app

Three levers, none of which require editing this repo:

### 1. `renderItem` — what's inside each card

This is the real customization surface. It's a render prop: return whatever JSX fits that app's style — an icon, a title, a description, a whole layout. `Carousel` just spins, drags, and snaps whatever you hand it.

```tsx
import { Carousel } from 'ui-kit'
import 'ui-kit/style.css'

const projects = [
  { id: 'aurora', title: 'Aurora Health', icon: '🩺', color: '#ff5e7e' },
  { id: 'ledger', title: 'Ledger', icon: '💳', color: '#38f9d7' },
]

<Carousel
  items={projects}
  itemKey={(item) => item.id}
  itemLabel={(item) => item.title}
  panelName="Projects"
  renderItem={(item) => (
    <div className="project-card" style={{ background: item.color }}>
      <span className="project-card__icon">{item.icon}</span>
      <h3 className="project-card__title">{item.title}</h3>
    </div>
  )}
/>
```

`project-card` and its styling above are app-specific CSS you write in the consuming app — ui-kit never sees it. Swap in icons, badges, images, multi-section layouts, whatever that app's design system calls for.

### 2. `defaults` — where each app's sliders start

The DialKit panel's tunable *range* (e.g. card width can go from 220–560) and the interaction *feel* (springs, snap behavior) are fixed — that's the shared machine. `defaults` only moves the starting value within that range, per app, so you don't have to hand-drag sliders every time you drop the carousel into a new project:

```tsx
<Carousel
  items={projects}
  itemKey={(item) => item.id}
  renderItem={(item) => <ProjectCard {...item} />}
  defaults={{
    card: { width: 280, height: 360, borderRadius: 12 },
    spacing: { gap: 16 },
    centerFocus: { scaleBoost: 1.15, blur: 4 },
  }}
/>
```

Any field you omit falls back to the built-in default. See `CarouselDefaults` for the full shape (card size/radius, gap, center-focus scale/blur, shadow and ambient toggles/strength, hover scale, scroll speed, snap enabled/threshold).

### 3. `showDots` — with or without the step indicator

```tsx
<Carousel items={projects} itemKey={(item) => item.id} renderItem={(item) => <ProjectCard {...item} />} showDots={false} />
```

Defaults to `true`. A structural per-app choice like `renderItem`, not something you'd tune live — some apps want the row of step dots, some don't.

### 4. `activeIndex` / `onActiveIndexChange` — driving the carousel externally

Both optional and uncontrolled by default. Pass them together to let an external control — a [`Stepper`](#stepper), a custom pagination row, deep-linked routing — drive the carousel and stay in sync with it:

```tsx
const [active, setActive] = useState(0)

<Carousel
  items={projects}
  itemKey={(item) => item.id}
  renderItem={(item) => <ProjectCard {...item} />}
  showDots={false}
  activeIndex={active}
  onActiveIndexChange={setActive}
/>
<Stepper count={projects.length} active={active} onStepClick={setActive} />
```

`onActiveIndexChange` fires from every interaction (drag, wheel, keyboard, or `activeIndex` itself changing), so it also works as a plain "tell me what's centered" callback if you only pass that one prop.

### 5. `itemShadowColor` / `useCardGlow` — shadows lit by the artwork

Each card can cast a shadow tinted by its own content instead of a flat grey one. `itemShadowColor` sets a static tint per item:

```tsx
<Carousel
  items={projects}
  itemKey={(item) => item.id}
  renderItem={(item) => <ProjectCard {...item} />}
  itemShadowColor={(item) => item.shadowColor}
/>
```

For artwork that should light its own shadow — a photo, or a playing video — call `useCardGlow` from inside `renderItem`. Hand it any drawable source and the frame is averaged into left/center/right regions, each tinting its own shadow layer, so the light under the card follows the layout of the scene above it:

```tsx
function CardArtwork({ src, alt }: { src: string; alt: string }) {
  const ref = useRef<HTMLImageElement>(null)
  const paintGlow = useCardGlow()

  useEffect(() => {
    const el = ref.current
    if (!el || !paintGlow) return
    if (el.complete) return paintGlow(el)
    const onLoad = () => paintGlow(el)
    el.addEventListener('load', onLoad)
    return () => el.removeEventListener('load', onLoad)
  }, [src, paintGlow])

  return <img ref={ref} src={src} alt={alt} />
}
```

It writes straight to the DOM, so a video can call it every frame without re-rendering the carousel. `useCardShadowColor(r, g, b)` is the simpler sibling when one uniform color is enough. Both return `null` outside a `CarouselItem`. Strength is tuned live via the panel's **Shadow › Intensity** dial, or seeded per app with `defaults.shadow.intensity`.

However often content samples, the painted color is interpolated on its own animation frame loop, so the shadow moves at the display's refresh rate rather than stepping at the sampling rate.

### 6. Ambient wash — lighting the background from the artwork

The same sampled colors can also light the space *behind* the carousel. It's a separate switch from the card shadows, not a replacement for them: **Shadow › Enabled** and **Ambient › Enabled** toggle independently, so either, both, or neither can be on.

| Shadow | Ambient | Effect |
| --- | --- | --- |
| on | off | Each card casts its own tinted shadow. The default. |
| off | on | No card shadows; the page behind the carousel is tinted by the centered card. |
| on | on | Both — a tinted page with the cards still grounded by their own shadows. |
| off | off | Neither; flat cards. |

```tsx
<Carousel
  defaults={{
    shadow: { enabled: false },
    ambient: { enabled: true, intensity: 0.9, spread: 3.2, saturation: 1.9 },
  }}
  {...rest}
/>
```

Ambient is off by default — the wash is an option, not a replacement.

The wash is centered on the card and sized to a multiple of it, so color spills outward from the artwork's own edges, and it cross-fades between the two cards either side of center as you drag rather than switching at the midpoint. Two things are deliberate:

- **`spread` is generous (3.2× the card).** Kept close in, the color reads as a halo around the card; only once it disperses well past the edges does it read as the page itself being tinted, which is the point of the mode. It's capped to the wrapper's width and `100svh` so a large spread can tint the whole visible page but never paint past the page's right or bottom edge, which would hand the host a scrollbar.
- **`saturation` (1.9×) counteracts averaging.** Sampling a whole frame pulls hard toward grey — untreated, a vividly blue card washes the page in beige rather than blue.

Ambient mode draws into the carousel's own wrapper, so it needs no cooperation from the host page; the wrapper creates its own stacking context and the wash sits behind the cards within it.

### 7. Where to keep card artwork

ui-kit ships no images. Artwork belongs to the consuming app, since `renderItem` decides what a card draws — which also means each app can organise its own assets. The layout that works well:

```
your-app/
  assets/carousel/          # full-resolution masters, gitignored
    aurora-health.png
    README.md               # tracked: the commands that regenerate the below
  public/carousel/          # web-optimised, committed, actually served
    aurora-health.jpg
```

Keep masters and derivatives in separate trees, name each master after the derivative it produces, and gitignore the masters — originals are typically 10x the size of what you ship, and git history keeps them forever. Track a README beside them holding the conversion commands, so the pipeline is versioned even when the binaries aren't. `Portfolio/assets/carousel/README.md` is a worked example.

Sizing: export stills at roughly **2x the widest card** the dials allow (a 480px card wants ~1600px, covering retina plus the center-focus scale-up), and video at **800px wide** with `-movflags +faststart` so playback starts before the file finishes downloading. Match the card's aspect ratio where you can — `object-fit: cover` handles the rest, but a source that's wildly off-ratio loses its subject to cropping.

### 8. CSS custom properties — chrome color

The bits ui-kit itself draws (nav dots, card shadow) read your app's theme if it defines these, with built-in fallbacks if it doesn't:

```css
:root {
  --border: #e5e4e7;
  --accent: #aa3bff;
  --accent-border: rgba(170, 59, 255, 0.5);
  --shadow: rgba(0, 0, 0, 0.1) 0 10px 15px -3px, rgba(0, 0, 0, 0.05) 0 4px 6px -2px;
}
```

## Stepper

A tiny, themeable pill-stepper: click-to-navigate, optional autoplay with a fill animation, vertical orientation, and windowing for long step sequences. Ported from [Pasito](https://joshpuckett.me/pasito) by Josh Puckett (MIT licensed) — pure CSS transitions, no Motion/DialKit dependency.

```tsx
import { useState } from 'react'
import { Stepper } from 'ui-kit'
import 'ui-kit/style.css'

function Wizard() {
  const [active, setActive] = useState(0)
  return <Stepper count={5} active={active} onStepClick={setActive} />
}
```

### Autoplay

`useAutoPlay` drives timed step changes with a visible fill animation on the active step. Pause, resume, and loop are built in.

```tsx
import { useState } from 'react'
import { Stepper, useAutoPlay } from 'ui-kit'
import 'ui-kit/style.css'

function AutoWizard() {
  const [active, setActive] = useState(0)
  const { playing, toggle, filling, fillDuration } = useAutoPlay({
    count: 5,
    active,
    onStepChange: setActive,
    stepDuration: 3000,
    loop: true,
  })

  return (
    <>
      <Stepper
        count={5}
        active={active}
        onStepClick={setActive}
        filling={filling}
        fillDuration={fillDuration}
      />
      <button onClick={toggle}>{playing ? 'Pause' : 'Play'}</button>
    </>
  )
}
```

### `<Stepper />` props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `count` | `number` | — | Total number of steps |
| `active` | `number` | — | Zero-based active step index |
| `onStepClick` | `(index: number) => void` | — | Called when a step is clicked |
| `orientation` | `'horizontal' \| 'vertical'` | `'horizontal'` | Layout direction |
| `maxVisible` | `number` | — | Visible steps before windowing kicks in |
| `transitionDuration` | `number` | `500` | Transition duration in ms |
| `easing` | `string` | `cubic-bezier(0.215, 0.61, 0.355, 1)` | CSS transition timing function |
| `filling` | `boolean` | `false` | Show fill progress on the active step (drive with `useAutoPlay`) |
| `fillDuration` | `number` | `3000` | Fill animation duration in ms |
| `className` | `string` | — | Additional class for CSS custom-property overrides |

### `useAutoPlay(options)`

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `count` | `number` | — | Total number of steps |
| `active` | `number` | — | Current active step |
| `onStepChange` | `(index: number) => void` | — | Called to advance the step |
| `stepDuration` | `number` | `3000` | Time per step in ms |
| `loop` | `boolean` | `true` | Loop back to the first step after the last |
| `enabled` | `boolean` | `true` | Enable/disable autoplay |

Returns `{ playing, toggle, filling, fillDuration }` — pass `filling` and `fillDuration` straight through to `<Stepper />`.

### Theming

Every visual detail is a CSS custom property, overridable via a class passed to `className`:

| Variable | Default | Description |
| --- | --- | --- |
| `--stepper-dot-size` | `8px` | Diameter of inactive dots |
| `--stepper-active-width` | `24px` | Size of the active pill (width horizontal, height vertical) |
| `--stepper-gap` | `6px` | Space between steps |
| `--stepper-bg` | `rgba(0,0,0,0.12)` | Inactive dot color |
| `--stepper-active-bg` | `rgba(0,0,0,0.8)` | Active pill color |
| `--stepper-fill-bg` | `rgba(255,255,255,0.45)` | Autoplay fill bar color |
| `--stepper-container-bg` | `rgba(0,0,0,0.04)` | Container background |
| `--stepper-container-border` | `rgba(0,0,0,0.06)` | Container border color |
| `--stepper-container-radius` | `999px` | Container border radius |

```css
.my-dark-stepper {
  --stepper-bg: rgba(255, 255, 255, 0.15);
  --stepper-active-bg: rgba(255, 255, 255, 0.9);
  --stepper-fill-bg: rgba(255, 255, 255, 0.3);
  --stepper-container-bg: rgba(255, 255, 255, 0.1);
  --stepper-container-border: rgba(255, 255, 255, 0.12);
}
```

```tsx
<Stepper count={5} active={active} onStepClick={setActive} className="my-dark-stepper" />
```

### Accessibility

- Steps use `role="tab"` with `aria-selected`, wrapped in a `role="tablist"` container
- Each step has an `aria-label` (`"Step 1"`, `"Step 2"`, …)
- The active step is keyboard-focusable via `tabIndex={0}`
- Respects `prefers-reduced-motion` — all transitions resolve instantly

## Components

- **`Carousel`** — the container: drag-to-scroll, wheel/trackpad scroll, keyboard arrows, center-snap physics, and the DialKit panel wiring.
- **`CarouselItem`** — a single card's scale/blur/hover physics wrapper. Exported for building custom carousels; `Carousel` already composes it for you.
- **`Stepper`** — the pill/dot progress indicator: click-to-navigate, windowing, and orientation.
- **`Step`** — a single dot/pill button with its enter/exit/active/filling states. Exported for building custom steppers; `Stepper` already composes it for you.

Ships a live [DialKit](https://www.npmjs.com/package/dialkit) panel (mount `<DialRoot />` once in your app root) for tuning card size, spacing, center-focus scale/blur, hover scale + its own spring, scroll speed, and snap (on/off, catch-radius threshold, spring) — on top of whatever `defaults` an app sets. `Stepper` has no DialKit panel — it's tuned via the CSS custom properties above instead.

## Peer dependencies

`react`, `react-dom`, `motion`, `dialkit` — the consuming project must have these installed.

## Development

```bash
npm install
npm run build   # one-off build to dist/
npm run dev     # rebuild on change
```
