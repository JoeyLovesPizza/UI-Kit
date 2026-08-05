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

### 6. Ambient auras — lighting the background from the artwork

The same sampled colors can also light the space *behind* the carousel. It's a separate switch from the card shadows, not a replacement for them: **Shadow › Enabled** and **Ambient › Enabled** toggle independently, so either, both, or neither can be on.

| Shadow | Ambient | Effect |
| --- | --- | --- |
| on | off | Each card casts its own tinted shadow. The default. |
| off | on | No card shadows; each card lights the page behind it with its own colors. |
| on | on | Both — a lit page with the cards still grounded by their own shadows. |
| off | off | Neither; flat cards. |

```tsx
<Carousel
  defaults={{
    shadow: { enabled: false },
    ambient: { enabled: true, intensity: 0.9, spread: 1.6, saturation: 1.9 },
  }}
  {...rest}
/>
```

Ambient is off by default — the light is an option, not a replacement.

**Every card carries its own aura, and the aura travels with the card.** The auras sit on a track that mirrors the card track's transform, so a card's light is locked to it at any position — mid-drag, mid-spring, or at rest. That's the whole design: a single wash pinned to the page center would only *recolor* itself as cards went past, which reads as a blur stuck to the background rather than as light coming off the artwork.

Three consequences worth knowing:

- **Neighbours cross-fade by overlapping**, not by switching at the midpoint — the outgoing aura dims as the incoming one comes up. Two differently-colored cards that are both on screen each keep their own color in their own place instead of being averaged into one blob.
- **Total strength is constant across the transition.** Two translucent layers don't add up to the sum of their parts — two auras at half strength composite to 0.75, not 1.0 — so each aura's opacity is solved backwards from the composite (`1 - (1 - intensity)^weight`) to hold the total at exactly `intensity` everywhere. Without that, the light dips every time you cross between cards.
- **Only the cards near center have an aura mounted.** An aura is fully faded by one step off center, so the window is small and fixed however many items you pass in.

Two dial choices are deliberate:

- **`spread` stays close to the card (1.6×).** This is *one card's* aura, so it has to read as light coming off that card. Past roughly 2× it stops being attached to anything: a 340×460 card at 3.2 throws a 1360×1620 box — bigger than most containers a carousel sits in — so every card's light covers the whole frame and you're back to the undifferentiated page-wide wash this replaced.
- **`saturation` (1.9×) counteracts averaging.** Sampling a whole frame pulls hard toward grey — untreated, a vividly blue card washes the page in beige rather than blue.

Ambient mode draws into the carousel's own wrapper, so it needs no cooperation from the host page; the wrapper creates its own stacking context and the auras sit behind the cards within it. They're clipped to the wrapper's width and `100svh`, so a large spread can light the whole visible page but never paint past the page's edge and hand the host a scrollbar — with the horizontal cut tapered rather than hard, so a carousel inside a narrower container doesn't show a seam.

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

## Menu

A two-level hover menu on frosted glass, ported from the Figma component. There are two row types and no prop to pick between them — a panel renders as the label-and-subtext variant when any of its rows has a `description`, and as the single-line variant otherwise. That's the only structural difference between the main menu and a submenu.

```tsx
import { Menu } from 'ui-kit'
import 'ui-kit/style.css'

const items = [
  {
    id: 'work',
    label: 'Work',
    items: [
      { id: 'wildflower', label: 'Wildflower', description: 'Agentic principles…' },
      { id: 'hitl', label: 'Human In The Loop', description: 'Agentic principles…' },
    ],
  },
  { id: 'projects', label: 'Projects' },
  { id: 'about', label: 'About' },
]

<Menu items={items} onSelect={(item) => navigate(item.id)} />
```

The panels are translucent with a backdrop blur, so they need something with color and variation behind them to read as glass.

### Typeface

The design is drawn in **Söhne Buch** (Klim), which is licensed per-domain and so can't live in a public repo. The docs site stands in **Inter**, self-hosted through `@fontsource/inter` so the published site needs no font CDN at runtime:

```css
@import '@fontsource/inter/400.css';

.menu-stage {
  --menu-font-family: 'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
}
```

The library ships font-agnostic — it inherits whatever it's placed in unless you set `--menu-font-family` — so an app that holds a Söhne licence swaps the two on that one line and gets rows matching the Figma frame to within a pixel (`Work` 38×19, `Writing` 52×19, `About` 44×19). Inter is a little wider, so those measurements drift slightly on the docs site.

### Hover behavior

Hovering a row darkens its label; a row with children opens its submenu after `openDelay`. The parent row stays dark for as long as its submenu is open, including while the pointer is over the submenu itself.

Leaving the main panel while a submenu is open arms a **safe triangle** — a wedge from the point where the pointer left to the submenu's near edge. Inside that wedge the submenu is held open even though the pointer is over neither panel, so a diagonal move toward the submenu doesn't close it just because the cursor drifted off the row on the way there. Outside it, the menu closes after `closeDelay`.

Swapping between rows while a submenu is open is instant — the dwell delay only applies to opening the first one. Clicking a parent row toggles its submenu instead of selecting, so the menu still works on touch, where there's no hover to open it with.

### The selected row

`selectedId` marks the page you're currently on. It matches by `id` at either level, renders that row in the selected state, and sets `aria-current="page"` on it.

On a subpage, the section stays lit: `selectedId="wildflower"` selects the Wildflower row *and* the Work row that owns it. Only the exact row gets `aria-current` — marking the section too would announce two current items in one menu.

```tsx
<Menu items={items} selectedId={currentPageId} onSelect={(item) => navigate(item.id)} />
```

A row that owns a submenu can be the selected one too — a parent like "Work" is usually a real page in its own right. Clicking it both reports the selection and toggles its submenu, so the menu still works on touch, where there's no hover to open it with.

None of the menu's type is painted flat — every label and subtext is blended into the panel's backdrop. The panel is frosted glass, so its own pixels are already a blurred sample of the page behind it; blending the text into that gives each row a shade of whatever the menu is sitting on, and holds its contrast as the page moves underneath. `multiply` can only ever darken the text relative to what's behind it and `screen` can only ever lighten it, so whichever one matches the panel's polarity keeps the type on the correct side of its own backdrop no matter what slides under the glass. A light panel wants `multiply`, a dark one `screen` — `--menu-text-blend-mode: normal` opts out and paints the colours literally.

That's a floor on contrast, not a guaranteed ratio: text that starts too close to the backdrop's own lightness stays low-contrast in the same direction. The resting colours still have to be chosen. How strongly the tint reads is a function of how much colour is behind the glass — over a near-white page it settles to roughly the base grey, over something saturated it picks up the hue.

The current-page row reads as its own state through its colours rather than through blending. It follows `--menu-text-blend-mode` by default; set `--menu-selected-blend-mode` on its own to give it a different blend from every other row.

Selected is the row's *resting* colour — hover still takes over while the pointer is on it. The two row components carry their own selected values, so the levels can diverge: `--menu-selected-label-color` for the Label component, and `--menu-selected-subtext-label-color` / `--menu-selected-subtext-description-color` for Label & Subtext. Which one applies is resolved by the panel in CSS, so overriding one never leaks into the other.

### Tuning the motion

Every transition is driven by Motion and tuned from a live [DialKit](https://www.npmjs.com/package/dialkit) panel — mount `<DialRoot />` once in your app root. The panel is keyed to `panelName`, so menus sharing a name share one panel and move together; give a menu its own name to tune it separately. `defaults` sets where each slider starts.

Moving straight from one parent's submenu to another's keeps a single panel and springs it between the two sizes rather than crossfading — Work's five rows shrink down to Writing's two. The frosted surface sits on a sizer that carries the animated width and height, so the panel inside stays at its natural size and gets clipped as the surface grows or shrinks; nothing scales, so the text never distorts.

The rows sit against whichever edge the panel is anchored to, so a resize never drags them along with the edge that's moving. With the default `align="bottom"` the panel is fixed at its bottom and grows upward, and the rows stay a constant `--menu-padding-y` above that bottom edge; `align="top"` and `align="item"` grow downward and hold the rows at the top instead.

The `content` group owns where the rows start, and it owns it on every open — a first open from closed and a move between two parents both begin from `content.offsetX`/`offsetY`/`scale`. Only the sign of the vertical offset is derived: shrinking, the panel's top edge sweeps down onto the rows, so they start above their resting place and ride that edge down instead of climbing into it. Growing, they sit against the bottom edge and rise with it. Sharing one direction across both moves makes the rows run against the box on one of them, which reads as wildly overdone rather than as a single movement. Moving between parents the rows also hold back until `content.resizeHandoff` of the resize has elapsed, rather than crossfading over a box that's still moving; a first open uses `content.delay` instead.

The panel and its rows animate on separate clocks — `menu.transition` is the panel itself, and the `content` group brings the rows in behind it, so the surface can arrive first and the content catch up.

| Dial | Default | |
| --- | --- | --- |
| `surface.blur` | `34` | Backdrop blur radius behind both panels, in CSS pixels — the Figma background-blur value taken at face value rather than halved |
| `openFrom.anchor` | `'bottom corner'` | The point the submenu opens and resizes out of — either corner, the near panel edge, the trigger row, or its own center |
| `openFrom.offsetX` / `offsetY` | `-8` / `0` | Where the panel starts. `offsetX` runs along the open axis and mirrors when `side="left"` |
| `openFrom.scale` | `0.96` | How small the panel opens from, as a fraction of natural. Both dimensions grow away from the corner it is pinned at; centre scales by transform instead. Lower it for a more pronounced open |
| `menu.transition` | spring, `0.28` / `0.18` | Physics of the panel opening and closing on hover |
| `menu.resize` | spring, `0.35` / `0.15` | Physics of the panel growing or shrinking when moving straight from one parent to another |
| `content.delay` | `0.05` | Head start the panel gets before the rows begin arriving |
| `content.stagger` | `0.035` | Gap between consecutive rows |
| `content.blur` | `2` | Blur each row resolves out of as it arrives |
| `content.resizeHandoff` | `0.9` | Moving between parents holds the rows back until this fraction of the resize is done |
| `content.offsetX` / `offsetY` / `scale` | `0` / `8` / `1` | Where each row starts, independent of the panel around it, on every open. `offsetY` describes the growing direction and flips when the panel shrinks |
| `content.transition` | spring, `0.32` / `0.22` | Physics of the rows settling into place |
| `rowHover.transition` | easing, `0.16s` | Physics of the label/subtext color shift as the pointer moves between rows |

Each transition dial has both a Spring and an Easing tab, so any of them can be a spring or a cubic-bezier.

### `<Menu />` props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `items` | `MenuItemData[]` | — | Rows of the main menu. |
| `onSelect` | `(item, path) => void` | — | Called when any row is chosen, including a parent that owns a submenu. `path` is the ancestry, ending with the row itself. |
| `side` | `'right' \| 'left'` | `'right'` | Which side the submenu opens on. |
| `align` | `'bottom' \| 'top' \| 'item'` | `'bottom'` | Vertical alignment of the submenu against the main menu. `'bottom'` matches the design — both panels share a baseline. |
| `openDelay` | `number` | `90` | Hover dwell before the submenu opens, in ms. |
| `closeDelay` | `number` | `220` | Grace period after the pointer leaves the menu and its safe area, in ms. |
| `selectedId` | `string` | — | `id` of the row for the page you're on, at either level. Renders selected and carries `aria-current="page"`. |
| `label` | `string` | `'Menu'` | Accessible name for the main menu. |
| `panelName` | `string` | `'Menu'` | DialKit panel title. Menus sharing a name share one panel. |
| `defaults` | `MenuDefaults` | — | Per-scenario starting values for the DialKit sliders (`openFrom`, `content`). |
| `className` | `string` | — | Additional class for CSS custom-property overrides. |

### `MenuItemData`

| Field | Type | Description |
| --- | --- | --- |
| `id` | `string` | Stable key, also used for open/active tracking. |
| `label` | `string` | The single line of text on the row. |
| `description` | `string` | Subtext under the label. Its presence is what makes a panel render the taller variant. |
| `href` | `string` | Renders the row as a link instead of a button. |
| `disabled` | `boolean` | Greys the row out and takes it out of the tab order. |
| `items` | `MenuItemData[]` | Nested rows. An item with children opens a submenu. |

### Theming

Every value from the design is a CSS custom property, overridable via a class passed to `className`.

| Variable | Default | |
| --- | --- | --- |
| `--menu-bg` | `rgba(255, 255, 255, 0.4)` | Panel fill |
| `--menu-blur` | `34px` | Backdrop blur radius. **Driven by the `surface.blur` dial**, which writes it inline and so wins over a value set here — set `defaults.surface.blur` instead |
| `--menu-radius` | `20px` | Panel corner radius |
| `--menu-padding-y` / `--menu-padding-x` | `18px` / `20px` | Panel padding |
| `--menu-panel-gap` | `14px` | Gap between the two panels |
| `--menu-row-gap` | `14px` | Gap between single-line rows |
| `--menu-item-gap` | `8px` | Gap between label & support rows |
| `--menu-item-padding` | `12px` | Padding on label & support rows |
| `--menu-item-radius` | `8px` | Row corner radius |
| `--menu-item-bg` / `--menu-item-bg-active` | `transparent` | Row fill, resting and active |
| `--menu-label-size` | `16px` | Label type size |
| `--menu-label-color` | `#8f8f8f` | Resting label (Grey/500) |
| `--menu-label-color-active` | `#373737` | Active label (Grey/900) |
| `--menu-description-size` | `14px` | Subtext type size |
| `--menu-description-width` | `200px` | Subtext wrap width |
| `--menu-description-color` | `#8f8f8f` | Resting subtext (Grey/500) |
| `--menu-description-color-active` | `#636363` | Active subtext (Grey/700) |
| `--menu-text-blend-mode` | `multiply` | How every label and subtext blends into the panel backdrop. `multiply` for a light panel, `screen` for a dark one, `normal` to paint them literally |
| `--menu-selected-blend-mode` | `var(--menu-text-blend-mode)` | Overrides the blend for the selected row alone |
| `--menu-selected-label-color` | `#5c5c5c` | Selected label — Label component (main menu row) |
| `--menu-selected-subtext-label-color` | `#5c5c5c` | Selected label — Label & Subtext component (submenu row) |
| `--menu-selected-subtext-description-color` | `#808080` | Selected subtext — Label & Subtext component |
| `--menu-focus-ring` | `rgba(55, 55, 55, 0.45)` | Focus outline color |
| `--menu-font-family` | `inherit` | Set this to the menu's typeface |

### Accessibility

- Panels are `role="menu"`, rows are `role="menuitem"`; parent rows carry `aria-haspopup` and `aria-expanded`
- Roving tabindex — one row per panel is in the tab order
- `↑`/`↓` move between rows, `Home`/`End` jump to the ends
- `→` opens a submenu and focuses its first row; `←` or `Esc` closes it and returns focus to the parent row (mirrored when `side="left"`)
- A submenu opened by hover never steals focus; one opened by keyboard always does
- Respects `prefers-reduced-motion` — the open/close transition resolves instantly

## Components

- **`Carousel`** — the container: drag-to-scroll, wheel/trackpad scroll, keyboard arrows, center-snap physics, and the DialKit panel wiring.
- **`CarouselItem`** — a single card's scale/blur/hover physics wrapper. Exported for building custom carousels; `Carousel` already composes it for you.
- **`Stepper`** — the pill/dot progress indicator: click-to-navigate, windowing, and orientation.
- **`Step`** — a single dot/pill button with its enter/exit/active/filling states. Exported for building custom steppers; `Stepper` already composes it for you.
- **`Menu`** — the two-level hover menu: both panels, hover intent with the safe triangle, keyboard navigation, and its DialKit motion panel.
- **`MenuItem`** — a single row in either variant. Exported for building custom menus; `Menu` already composes it for you.

Ships a live [DialKit](https://www.npmjs.com/package/dialkit) panel (mount `<DialRoot />` once in your app root) for tuning card size, spacing, center-focus scale/blur, hover scale + its own spring, scroll speed, and snap (on/off, catch-radius threshold, spring) — on top of whatever `defaults` an app sets. `Stepper` has no DialKit panel — it's tuned via the CSS custom properties above instead.

## Peer dependencies

`react`, `react-dom`, `motion`, `dialkit` — the consuming project must have these installed.

## Development

```bash
npm install
npm run build   # one-off build to dist/
npm run dev     # rebuild on change
```
