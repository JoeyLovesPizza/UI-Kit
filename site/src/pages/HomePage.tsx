const COMPONENTS = [
  {
    href: '#/carousel',
    title: 'Carousel',
    desc: 'Drag-to-scroll, wheel/trackpad, keyboard arrows, and center-snap physics with a live DialKit tuning panel.',
  },
  {
    href: '#/stepper',
    title: 'Stepper',
    desc: 'A fluid pill/dot progress indicator — click-to-navigate, autoplay, vertical orientation, and windowing.',
  },
  {
    href: '#/menu',
    title: 'Menu',
    desc: 'A two-level hover menu on frosted glass — single-line rows, a label & support submenu, and safe-triangle hover intent.',
  },
  {
    href: '#/recorder',
    title: 'Recorder',
    desc: 'A compact meeting recorder — a record disc with a live two-voice level strip beside it, three actions, and a menu, all in one pill.',
  },
  {
    href: '#/combined',
    title: 'Carousel + Stepper',
    desc: 'Wiring the two together so a Stepper drives and reflects a Carousel.',
  },
]

export function HomePage() {
  return (
    <div>
      <p className="page-eyebrow">ui-kit</p>
      <h1 className="page-title">A personal React component library</h1>
      <p className="page-lede">
        Browse each component, try it live, and copy the usage snippet straight into your app. Not
        published — consumed by local projects via a <code>file:</code> dependency.
      </p>

      <div className="home-grid">
        {COMPONENTS.map((c) => (
          <a key={c.href} className="home-card" href={c.href}>
            <div className="home-card-title">{c.title}</div>
            <div className="home-card-desc">{c.desc}</div>
          </a>
        ))}
      </div>
    </div>
  )
}
