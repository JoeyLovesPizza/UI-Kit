# ui-kit

## What this is
A private, unpublished React 19 + TypeScript component library (Carousel, Stepper, Menu, and a Recorder in progress) built with Vite in library mode to `dist/`. Local projects consume it through a `file:` dependency, and `site/` is a separate Vite app that documents every component live. Motion comes from `motion`, and most components expose a DialKit tuning panel.

## Layout
- `src/` : one folder per component (`Carousel/`, `CarouselItem/`, `Stepper/`, `Step/`, `Menu/`, `MenuItem/`, `Recorder/`), each with its `.tsx` and a sibling `.css`.
- `src/index.ts` : the single public entry; everything the library exports is listed here.
- `site/` : docs site (own `package.json`, `vite.config.ts`, `src/pages/*Page.tsx`, `src/components/`). Aliases `ui-kit` to `../src/index.ts`, not to `dist/`.
- `dist/` : library build output (gitignored). This is what Portfolio actually imports.
- `.github/workflows/deploy-site.yml` : builds `site/` and deploys to GitHub Pages on push to `main`.
- `.claude/launch.json` : `site` (docs on :5175) and `portfolio` (starts `../Portfolio` dev server on :5174).
- `README.md` : the real per-component docs (props, theming, accessibility). Read it before changing a component's API.

## Commands
Root (library), from `package.json`:
- `npm run build` : `tsc --noEmit && vite build`
- `npm run dev` : `vite build --watch` (rebuilds `dist/`; it is not a dev server)

Docs site, from `site/package.json` (run inside `site/`, or `npm --prefix site run ...`):
- `npm run dev` : `vite`
- `npm run build` : `tsc --noEmit && vite build`
- `npm run preview` : `vite preview`

There are no test or lint scripts in either package.

## Conventions
- Components are PascalCase folders containing `Name.tsx` plus `Name.css`, imported at the top of the tsx (`import './Name.css'`). Helpers and hooks sit beside the component (`useAutoPlay.ts`, `useRecorder.ts`, `safeTriangle.ts`).
- Export every public component, hook, and type from `src/index.ts`; `vite-plugin-dts` generates `dist/index.d.ts` from it.
- Styling is plain CSS with BEM-ish class names prefixed by component (`.menu-item-label`, `.recorder-bar-own`) and theming via CSS custom properties (`--menu-bg`, `--accent`). No CSS modules, no CSS-in-JS.
- `react`, `react-dom`, `motion`, and `dialkit` are peer dependencies and are marked external in `vite.config.ts`; never bundle them.
- DialKit: Carousel, Menu, and Recorder call `useDialKit(panelName, {...})` with sliders written as `[default, min, max, step]`. Each accepts `panelName` and a `defaults` prop (`CarouselDefaults`, `MenuDefaults`, `RecorderDefaults`) that only moves slider starting values; the ranges live in the component. Stepper has no panel and is tuned via CSS variables. The host app mounts `<DialRoot />` once (the site does this in `site/src/App.tsx`).
- Exported props and types carry JSDoc comments; keep that up when adding props.

## Gotchas
- Two `package.json` files and two `node_modules`. Both installs are needed to build the site, because the alias to `../src` resolves `react`/`motion`/`dialkit` from the root install. CI runs `npm ci` in both.
- `../Portfolio` depends on `"ui-kit": "file:../ui-kit"`, which npm symlinks. Portfolio sees `dist/`, so a library change is invisible there until `npm run build` (or `npm run dev`) runs at the root. The docs site does not need a build.
- Duplicate-React "Invalid hook call" errors mean a consumer is missing `resolve.dedupe: ['react', 'react-dom', 'motion', 'dialkit']` in its Vite config.
- `site/vite.config.ts` sets `base` to `/UI-Kit/` only for builds; the dev server stays at `/`.
- `site/src/fonts/` is gitignored on purpose (licensed Sohne webfont); the site uses Inter and Geist from `@fontsource` instead. Never add font files to git.
- `references/` (reference motion clips) and `.claude/worktrees/` are gitignored; do not rely on them existing.
- The Recorder is in-progress work on the `claude/recording-widget-9iaupx` branch and is not on `main` yet. Check `git status` and `git branch` before touching `src/Recorder/`, and do not describe it as shipped.
