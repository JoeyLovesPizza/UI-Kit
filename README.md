# ui-kit

Personal React component library. Not published — consumed by local projects via a `file:` dependency.

**Design principle:** the interaction — drag, wheel/trackpad scroll, keyboard arrows, center-snap physics, the DialKit tuning panel — is shared across every app that uses this. It lives here once. What each app draws inside the cards, and where each app's sliders start out, is fully owned by that app and costs zero edits to this repo.

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

Any field you omit falls back to the built-in default. See `CarouselDefaults` for the full shape (card size/radius, gap, center-focus scale/blur, hover scale, scroll speed, snap enabled/threshold).

### 3. `showDots` — with or without the step indicator

```tsx
<Carousel items={projects} itemKey={(item) => item.id} renderItem={(item) => <ProjectCard {...item} />} showDots={false} />
```

Defaults to `true`. A structural per-app choice like `renderItem`, not something you'd tune live — some apps want the row of step dots, some don't.

### 4. CSS custom properties — chrome color

The bits ui-kit itself draws (nav dots, card shadow) read your app's theme if it defines these, with built-in fallbacks if it doesn't:

```css
:root {
  --border: #e5e4e7;
  --accent: #aa3bff;
  --accent-border: rgba(170, 59, 255, 0.5);
  --shadow: rgba(0, 0, 0, 0.1) 0 10px 15px -3px, rgba(0, 0, 0, 0.05) 0 4px 6px -2px;
}
```

## Components

- **`Carousel`** — the container: drag-to-scroll, wheel/trackpad scroll, keyboard arrows, center-snap physics, and the DialKit panel wiring.
- **`CarouselItem`** — a single card's scale/blur/hover physics wrapper. Exported for building custom carousels; `Carousel` already composes it for you.

Ships a live [DialKit](https://www.npmjs.com/package/dialkit) panel (mount `<DialRoot />` once in your app root) for tuning card size, spacing, center-focus scale/blur, hover scale + its own spring, scroll speed, and snap (on/off, catch-radius threshold, spring) — on top of whatever `defaults` an app sets.

## Peer dependencies

`react`, `react-dom`, `motion`, `dialkit` — the consuming project must have these installed.

## Development

```bash
npm install
npm run build   # one-off build to dist/
npm run dev     # rebuild on change
```
