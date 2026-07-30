import { useState } from 'react'
import { Stepper, useAutoPlay } from 'ui-kit'
import { CodeBlock } from '../components/CodeBlock'
import { Demo } from '../components/Demo'
import { PropsTable } from '../components/PropsTable'

const BASIC_CODE = `
const [active, setActive] = useState(0)

<Stepper count={5} active={active} onStepClick={setActive} />
`

const VERTICAL_CODE = `
<Stepper count={4} active={active} onStepClick={setActive} orientation="vertical" />
`

const AUTOPLAY_CODE = `
const { playing, toggle, filling, fillDuration } = useAutoPlay({
  count: 5,
  active,
  onStepChange: setActive,
  stepDuration: 3000,
  loop: true,
})

<Stepper
  count={5}
  active={active}
  onStepClick={setActive}
  filling={filling}
  fillDuration={fillDuration}
/>
<button onClick={toggle}>{playing ? 'Pause' : 'Play'}</button>
`

const WINDOWING_CODE = `
<Stepper count={count} active={active} onStepClick={setActive} maxVisible={5} />
`

const THEMED_CODE = `
<Stepper count={4} active={active} onStepClick={setActive} className="my-dark-stepper" />
`

const THEMED_CSS = `
.my-dark-stepper {
  --stepper-bg: rgba(255, 255, 255, 0.15);
  --stepper-active-bg: rgba(255, 255, 255, 0.9);
  --stepper-fill-bg: rgba(255, 255, 255, 0.3);
  --stepper-container-bg: rgba(255, 255, 255, 0.1);
  --stepper-container-border: rgba(255, 255, 255, 0.12);
}
`

const PROPS = [
  { name: 'count', type: 'number', description: 'Total number of steps.' },
  { name: 'active', type: 'number', description: 'Zero-based active step index.' },
  { name: 'onStepClick', type: '(index: number) => void', description: 'Called when a step is clicked.' },
  {
    name: 'orientation',
    type: "'horizontal' | 'vertical'",
    default: "'horizontal'",
    description: 'Layout direction.',
  },
  { name: 'maxVisible', type: 'number', description: 'Visible steps before windowing kicks in.' },
  { name: 'transitionDuration', type: 'number', default: '500', description: 'Transition duration in ms.' },
  {
    name: 'easing',
    type: 'string',
    default: 'cubic-bezier(0.215, 0.61, 0.355, 1)',
    description: 'CSS transition timing function.',
  },
  {
    name: 'filling',
    type: 'boolean',
    default: 'false',
    description: 'Show fill progress on the active step (drive with useAutoPlay).',
  },
  { name: 'fillDuration', type: 'number', default: '3000', description: 'Fill animation duration in ms.' },
  { name: 'className', type: 'string', description: 'Additional class for CSS custom-property overrides.' },
]

const AUTOPLAY_OPTIONS = [
  { name: 'count', type: 'number', description: 'Total number of steps.' },
  { name: 'active', type: 'number', description: 'Current active step.' },
  { name: 'onStepChange', type: '(index: number) => void', description: 'Called to advance the step.' },
  { name: 'stepDuration', type: 'number', default: '3000', description: 'Time per step in ms.' },
  { name: 'loop', type: 'boolean', default: 'true', description: 'Loop back to the first step after the last.' },
  { name: 'enabled', type: 'boolean', default: 'true', description: 'Enable/disable autoplay.' },
]

const AUTOPLAY_RETURNS = [
  { name: 'playing', type: 'boolean', description: 'Current playback state.' },
  { name: 'toggle', type: '() => void', description: 'Toggle play/pause.' },
  { name: 'filling', type: 'boolean', description: "Pass straight through to Stepper's filling prop." },
  { name: 'fillDuration', type: 'number', description: "Pass straight through to Stepper's fillDuration prop." },
]

const THEME_VARS = [
  { name: '--stepper-dot-size', type: 'length', default: '8px', description: 'Diameter of inactive dots.' },
  {
    name: '--stepper-active-width',
    type: 'length',
    default: '24px',
    description: 'Size of the active pill (width horizontal, height vertical).',
  },
  { name: '--stepper-gap', type: 'length', default: '6px', description: 'Space between steps.' },
  { name: '--stepper-bg', type: 'color', default: 'rgba(0,0,0,0.12)', description: 'Inactive dot color.' },
  { name: '--stepper-active-bg', type: 'color', default: 'rgba(0,0,0,0.8)', description: 'Active pill color.' },
  {
    name: '--stepper-fill-bg',
    type: 'color',
    default: 'rgba(255,255,255,0.45)',
    description: 'Autoplay fill bar color.',
  },
  {
    name: '--stepper-container-bg',
    type: 'color',
    default: 'rgba(0,0,0,0.04)',
    description: 'Container background.',
  },
  {
    name: '--stepper-container-border',
    type: 'color',
    default: 'rgba(0,0,0,0.06)',
    description: 'Container border color.',
  },
  {
    name: '--stepper-container-radius',
    type: 'length',
    default: '999px',
    description: 'Container border radius.',
  },
]

function BasicDemo() {
  const [active, setActive] = useState(0)
  return (
    <Demo
      title="Basic — click-to-navigate"
      controls={
        <>
          <button className="btn" onClick={() => setActive((a) => Math.max(0, a - 1))}>
            Prev
          </button>
          <button className="btn" onClick={() => setActive((a) => Math.min(4, a + 1))}>
            Next
          </button>
          <span className="field-readout">active: {active}</span>
        </>
      }
    >
      <Stepper count={5} active={active} onStepClick={setActive} />
    </Demo>
  )
}

function VerticalDemo() {
  const [active, setActive] = useState(0)
  return (
    <Demo title="Vertical orientation">
      <Stepper count={4} active={active} onStepClick={setActive} orientation="vertical" />
    </Demo>
  )
}

function AutoplayDemo() {
  const [active, setActive] = useState(0)
  const { playing, toggle, filling, fillDuration } = useAutoPlay({
    count: 5,
    active,
    onStepChange: setActive,
    stepDuration: 2000,
    loop: true,
  })
  return (
    <Demo
      title="Autoplay — fill bar, 2s/step"
      controls={
        <button className="btn" onClick={toggle}>
          {playing ? 'Pause' : 'Play'}
        </button>
      }
    >
      <Stepper
        count={5}
        active={active}
        onStepClick={setActive}
        filling={filling}
        fillDuration={fillDuration}
      />
    </Demo>
  )
}

function WindowingDemo() {
  const [count, setCount] = useState(10)
  const [active, setActive] = useState(4)
  return (
    <Demo
      title={`Windowing — maxVisible=5, count=${count}, active=${active}`}
      controls={
        <>
          <button className="btn" onClick={() => setActive((a) => Math.max(0, a - 1))}>
            Prev
          </button>
          <button className="btn" onClick={() => setActive((a) => Math.min(count - 1, a + 1))}>
            Next
          </button>
          <button className="btn" onClick={() => setCount((c) => c + 1)}>
            Add step
          </button>
          <button className="btn" onClick={() => setCount((c) => Math.max(1, c - 1))}>
            Remove step
          </button>
        </>
      }
    >
      <Stepper count={count} active={active} onStepClick={setActive} maxVisible={5} />
    </Demo>
  )
}

function ThemedDemo() {
  const [active, setActive] = useState(1)
  return (
    <Demo title="Themed — via className override" dark>
      <Stepper count={4} active={active} onStepClick={setActive} className="dark-stepper" />
    </Demo>
  )
}

export function StepperPage() {
  return (
    <div>
      <p className="page-eyebrow">Component</p>
      <h1 className="page-title">Stepper</h1>
      <p className="page-lede">
        A tiny, themeable pill-stepper — click-to-navigate, optional autoplay with a fill animation,
        vertical orientation, and windowing for long step sequences. Ported from{' '}
        <a href="https://joshpuckett.me/pasito" target="_blank" rel="noreferrer">
          Pasito
        </a>{' '}
        by Josh Puckett (MIT licensed) — pure CSS transitions, no Motion/DialKit dependency.
      </p>

      <p className="section-title">Live demos</p>
      <BasicDemo />
      <CodeBlock code={BASIC_CODE} />

      <VerticalDemo />
      <CodeBlock code={VERTICAL_CODE} />

      <AutoplayDemo />
      <div className="prose">
        <p>
          <code>useAutoPlay</code> drives timed step changes with a visible fill animation on the
          active step. Pause, resume, and loop are built in.
        </p>
      </div>
      <CodeBlock code={AUTOPLAY_CODE} />

      <WindowingDemo />
      <div className="prose">
        <p>
          When there are more steps than fit, the track slides to keep the active step centered in
          the window and the container clips to a fixed size.
        </p>
      </div>
      <CodeBlock code={WINDOWING_CODE} />

      <ThemedDemo />
      <CodeBlock code={THEMED_CODE} />
      <CodeBlock code={THEMED_CSS} language="css" />

      <p className="section-title">Props</p>
      <PropsTable rows={PROPS} />

      <p className="section-title">useAutoPlay(options)</p>
      <PropsTable rows={AUTOPLAY_OPTIONS} />
      <div className="prose">
        <p>
          Returns <code>{'{ playing, toggle, filling, fillDuration }'}</code> — pass <code>filling</code>{' '}
          and <code>fillDuration</code> straight through to <code>{'<Stepper />'}</code>.
        </p>
      </div>
      <PropsTable rows={AUTOPLAY_RETURNS} />

      <p className="section-title">Theming</p>
      <div className="prose">
        <p>Every visual detail is a CSS custom property, overridable via a class passed to `className`.</p>
      </div>
      <PropsTable rows={THEME_VARS} />

      <p className="section-title">Accessibility</p>
      <ul className="a11y-list">
        <li>
          Steps use <code>role="tab"</code> with <code>aria-selected</code>, wrapped in a{' '}
          <code>role="tablist"</code> container
        </li>
        <li>
          Each step has an <code>aria-label</code> (<code>"Step 1"</code>, <code>"Step 2"</code>, …)
        </li>
        <li>
          The active step is keyboard-focusable via <code>tabIndex={'{0}'}</code>
        </li>
        <li>
          Respects <code>prefers-reduced-motion</code> — all transitions resolve instantly
        </li>
      </ul>
    </div>
  )
}
