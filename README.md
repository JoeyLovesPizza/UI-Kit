# ui-kit

Personal React component library. Not published — consumed by local projects via a `file:` dependency.

## Setup in a consuming project

```bash
npm install ../ui-kit
```

This adds `"ui-kit": "file:../ui-kit"` to the consuming project's `package.json` (adjust the relative path if the two folders aren't siblings). npm installs `file:` dependencies as a symlink, so rebuilding `ui-kit` (`npm run build`) picks up immediately in every project that depends on it — no reinstall needed.

Because `ui-kit` is resolved outside the consuming project's root, its own copies of `react`/`react-dom` must be deduped against the consuming project's. If you hit "Invalid hook call" or duplicate-React errors, add to the consuming project's `vite.config.ts`:

```ts
export default defineConfig({
  resolve: { preserveSymlinks: true },
})
```

## Usage

```tsx
import { Carousel } from 'ui-kit'
import 'ui-kit/style.css'

<Carousel
  items={items}
  itemKey={(item) => item.id}
  itemLabel={(item) => item.title}
  renderItem={(item) => <div style={{ width: '100%', height: '100%', background: item.color }} />}
  panelName="My Carousel"
/>
```

`Carousel<T>` is generic over any item type. `renderItem` decides what fills each card — a color swatch, an image, arbitrary markup. `itemLabel` is optional and only feeds accessibility labels (dot buttons, `aria-label`); nothing renders it as visible text.

Ships a live [DialKit](https://www.npmjs.com/package/dialkit) panel (mount `<DialRoot />` once in your app root) for tuning card size, spacing, center-focus scale/blur, hover scale + its own spring, scroll speed, and snap (on/off, catch-radius threshold, spring).

Theming: dots and card shadow read `--border`, `--accent`, `--accent-border`, `--shadow` CSS custom properties if your app defines them, with sane fallbacks if it doesn't.

## Components

- **`Carousel`** — the container: drag-to-scroll, wheel/trackpad scroll, keyboard arrows, center-snap physics, and the DialKit panel wiring.
- **`CarouselItem`** — a single card's scale/blur/hover physics wrapper. Exported for building custom carousels; `Carousel` already composes it for you.

## Peer dependencies

`react`, `react-dom`, `motion`, `dialkit` — the consuming project must have these installed.

## Development

```bash
npm install
npm run build   # one-off build to dist/
npm run dev     # rebuild on change
```
