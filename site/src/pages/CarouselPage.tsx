import { useState } from 'react'
import { Carousel } from 'ui-kit'
import { CodeBlock } from '../components/CodeBlock'
import { Demo } from '../components/Demo'
import { PropsTable } from '../components/PropsTable'

const PROJECTS = [
  { id: 'aurora', title: 'Aurora', gradient: 'linear-gradient(135deg, #ff5e7e, #ff9a5e)' },
  { id: 'ledger', title: 'Ledger', gradient: 'linear-gradient(135deg, #38f9d7, #43e97b)' },
  { id: 'nimbus', title: 'Nimbus', gradient: 'linear-gradient(135deg, #4facfe, #00f2fe)' },
  { id: 'orbit', title: 'Orbit', gradient: 'linear-gradient(135deg, #a18cd1, #fbc2eb)' },
  { id: 'quartz', title: 'Quartz', gradient: 'linear-gradient(135deg, #f6d365, #fda085)' },
]

const BASIC_USAGE = `
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
  renderItem={(item) => (
    <div className="project-card" style={{ background: item.color }}>
      <span>{item.icon}</span>
      <h3>{item.title}</h3>
    </div>
  )}
/>
`

const DEFAULTS_USAGE = `
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
`

const CONTROLLED_USAGE = `
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
`

const PROPS = [
  { name: 'items', type: 'T[]', description: 'The data to render — one card per item.' },
  {
    name: 'itemKey',
    type: '(item: T, index: number) => string',
    description: 'React key for each item.',
  },
  {
    name: 'renderItem',
    type: '(item: T, index: number) => ReactNode',
    description: "What's drawn inside each card — full control over the content.",
  },
  {
    name: 'itemLabel',
    type: '(item: T, index: number) => string',
    description: 'Optional accessible label per item, used for aria-label on cards and dots.',
  },
  { name: 'panelName', type: 'string', default: "'Carousel'", description: 'DialKit panel title.' },
  {
    name: 'defaults',
    type: 'CarouselDefaults',
    description:
      'Per-app starting values for the DialKit sliders (card size/radius, gap, center-focus, hover, scroll speed, snap).',
  },
  { name: 'showDots', type: 'boolean', default: 'true', description: 'Show the row of step dots.' },
  {
    name: 'activeIndex',
    type: 'number',
    description: 'Controlled active index — the carousel snaps to it when it changes.',
  },
  {
    name: 'onActiveIndexChange',
    type: '(index: number) => void',
    description: 'Fires on every interaction that changes the centered index.',
  },
]

export function CarouselPage() {
  const [showDots, setShowDots] = useState(true)

  return (
    <div>
      <p className="page-eyebrow">Component</p>
      <h1 className="page-title">Carousel</h1>
      <p className="page-lede">
        Drag-to-scroll, wheel/trackpad scroll, keyboard arrows, and center-snap physics. The DialKit
        panel on the right tunes card size, spacing, focus scale/blur, hover, scroll speed, and snap
        live — try it.
      </p>

      <p className="section-title">Live demo</p>
      <Demo
        controls={
          <button type="button" className="btn" onClick={() => setShowDots((v) => !v)}>
            {showDots ? 'Hide dots' : 'Show dots'}
          </button>
        }
      >
        <Carousel
          items={PROJECTS}
          itemKey={(item) => item.id}
          itemLabel={(item) => item.title}
          panelName="Carousel"
          showDots={showDots}
          renderItem={(item) => (
            <div className="gradient-card" style={{ background: item.gradient }}>
              {item.title}
            </div>
          )}
        />
      </Demo>

      <p className="section-title">Usage</p>
      <CodeBlock code={BASIC_USAGE} />

      <p className="section-title">Tuning defaults per app</p>
      <div className="prose">
        <p>
          The DialKit panel's tunable range and interaction feel are fixed — <code>defaults</code>{' '}
          only moves where each slider starts, so a new app can open with card sizes that already fit
          without dragging sliders by hand.
        </p>
      </div>
      <CodeBlock code={DEFAULTS_USAGE} />

      <p className="section-title">Driving it externally</p>
      <div className="prose">
        <p>
          Pass <code>activeIndex</code> and <code>onActiveIndexChange</code> together to let something
          else — a <a href="#/stepper">Stepper</a>, deep-linked routing — control and observe the
          carousel. See the <a href="#/combined">combined example</a>.
        </p>
      </div>
      <CodeBlock code={CONTROLLED_USAGE} />

      <p className="section-title">Props</p>
      <PropsTable rows={PROPS} />

      <div className="prose">
        <p>
          <code>CarouselItem</code> is also exported — a single card's scale/blur/hover physics
          wrapper, for building a custom carousel. <code>Carousel</code> already composes it for you.
        </p>
      </div>
    </div>
  )
}
