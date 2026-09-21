import { useState } from 'react'
import { Recorder, type Recording } from 'ui-kit'
import { CodeBlock } from '../components/CodeBlock'
import { Demo } from '../components/Demo'
import { PropsTable } from '../components/PropsTable'

const BASIC_CODE = `
import { Recorder } from 'ui-kit'
import 'ui-kit/style.css'

<Recorder
  title="Acme Standup"
  onRecorded={(take) => upload(take.blob)}
  onAction={(action) => console.log(action)} // 'transcript' | 'highlight' | 'share'
/>
`

const HOOK_CODE = `
import { useRecorder } from 'ui-kit'

const { status, elapsed, start, pause, resume, stop, recording, getLevel } = useRecorder()

<button onClick={status === 'recording' ? pause : status === 'paused' ? resume : start}>
  {status === 'recording' ? 'Pause' : status === 'paused' ? 'Resume' : 'Record'}
</button>
<button onClick={stop} disabled={status !== 'recording' && status !== 'paused'}>
  Finish
</button>
`

const THEMED_CODE = `
<Recorder title="Acme Standup" className="my-dark-recorder" />
`

const THEMED_CSS = `
.my-dark-recorder {
  --recorder-header-bg: #232226;
  --recorder-header-border: rgba(255, 255, 255, 0.12);
  --recorder-label-color: #f5f3f0;
  --recorder-icon-color: #f5f3f0;
  --recorder-card-bg: #2b2a2f;
  --recorder-title-color: #f5f3f0;
  --recorder-bar-idle: rgba(255, 255, 255, 0.28);
  --recorder-clock-color: #f5f3f0;
}
`

const PROPS = [
  { name: 'title', type: 'string', description: 'Name of the session, shown on the card.' },
  {
    name: 'onRecorded',
    type: '(recording: Recording) => void',
    description:
      'Called with the finished take when Finish is chosen from the menu. Its url is a fresh object URL owned by the caller — revoke it when done.',
  },
  { name: 'onDiscard', type: '() => void', description: 'Called when Discard is chosen from the menu.' },
  { name: 'onStart', type: '() => void', description: 'Called once the microphone is live and the take has begun.' },
  {
    name: 'onAction',
    type: "(action: 'transcript' | 'highlight' | 'share') => void",
    description: 'Called when one of the three header actions is pressed.',
  },
  {
    name: 'actions',
    type: 'RecorderAction[]',
    default: "['transcript', 'highlight', 'share']",
    description: 'Which header actions to show, in order.',
  },
  {
    name: 'menuItems',
    type: '{ id, label, onSelect }[]',
    description: 'Extra rows for the menu, listed above Finish and Discard.',
  },
  { name: 'maxDuration', type: 'number', description: 'Stop on its own once the take reaches this length, in ms.' },
  {
    name: 'mimeType',
    type: 'string',
    description: "Preferred container/codec. Falls back through webm/opus, webm, mp4 and ogg/opus when the browser can't do it.",
  },
  { name: 'panelName', type: 'string', default: "'Recorder'", description: 'DialKit panel title. Recorders sharing a name share one panel.' },
  {
    name: 'defaults',
    type: 'RecorderDefaults',
    description: 'Per-scenario starting values for the DialKit sliders (waveform, signal).',
  },
  { name: 'className', type: 'string', description: 'Additional class for CSS custom-property overrides.' },
]

const DIALS = [
  { name: 'waveform.bars', type: 'number', default: '63', description: 'Slots across the strip. Fewer is chunkier.' },
  { name: 'waveform.barWidth', type: 'px', default: '3', description: 'Width of every slot.' },
  { name: 'waveform.height', type: 'px', default: '104', description: 'Height of a full-scale bar.' },
  { name: 'waveform.dotSize', type: 'px', default: '3', description: 'Height of an empty slot.' },
  {
    name: 'waveform.rise',
    type: 'ms',
    default: '120',
    description: 'How long a bar takes to reach a new height. 0 snaps; longer ripples as the strip scrolls.',
  },
  {
    name: 'signal.sampleInterval',
    type: 'ms',
    default: '250',
    description: 'Audio each slot stands for. 63 slots at 250ms is about 16s across the strip before it scrolls.',
  },
  {
    name: 'signal.sensitivity',
    type: 'number',
    default: '3',
    description: 'Gain on the raw RMS level. Speech at a normal distance lands around 0.05–0.2, so a few × reaches the top.',
  },
  {
    name: 'signal.smoothing',
    type: '0–1',
    default: '0.5',
    description: 'How much of the previous frame survives into this one. 0 follows the mic frame by frame.',
  },
  { name: 'motion.header', type: 'spring', description: 'The left section resizing as the label changes length.' },
  { name: 'motion.label', type: 'spring', description: 'The label swapping between Record, Pause and Resume.' },
  { name: 'motion.labelOffsetY', type: 'px', default: '6', description: 'Where the incoming label starts.' },
  { name: 'motion.menu', type: 'spring', description: 'The menu opening and closing.' },
]

const HOOK_RETURNS = [
  {
    name: 'status',
    type: "'idle' | 'requesting' | 'recording' | 'paused' | 'stopped' | 'error'",
    description: 'Where the take is.',
  },
  { name: 'elapsed', type: 'number', description: 'Recorded time so far in ms, excluding pauses. Updates ~10×/s.' },
  { name: 'recording', type: 'Recording | null', description: "The finished take once status is 'stopped': blob, url, duration, mimeType." },
  { name: 'error', type: 'string | null', description: "Why status is 'error' — a permission denial, no microphone, unsupported browser." },
  { name: 'start', type: '() => Promise<void>', description: 'Ask for the microphone and begin.' },
  { name: 'pause / resume', type: '() => void', description: 'Hold the take and carry on. The clock stops while held.' },
  { name: 'stop', type: '() => void', description: 'Finish and produce recording.' },
  { name: 'cancel', type: '() => void', description: 'Throw the current take away.' },
  { name: 'reset', type: '() => void', description: "Discard a finished recording and return to 'idle'. Revokes its url." },
  { name: 'getLevel', type: '() => number', description: 'Instantaneous mic level, 0–1 RMS. Read it from an animation-frame loop — no re-render.' },
]

const THEME_VARS = [
  { name: '--recorder-width', type: 'length', default: '380px', description: 'Width of the whole widget.' },
  { name: '--recorder-header-bg', type: 'color', default: '#ffffff', description: 'Header pill fill.' },
  { name: '--recorder-header-border', type: 'color', default: 'rgba(0,0,0,0.14)', description: 'Dividers between the three header sections.' },
  { name: '--recorder-record', type: 'color', default: '#fa551e', description: 'The record disc.' },
  { name: '--recorder-label-color', type: 'color', default: '#1a1918', description: 'Record / Pause / Resume label.' },
  { name: '--recorder-icon-color', type: 'color', default: '#1a1918', description: 'Header action and menu icons.' },
  { name: '--recorder-icon-hover-bg', type: 'color', default: 'rgba(155,100,0,0.1)', description: 'Hover fill behind an icon button and menu row.' },
  { name: '--recorder-card-bg', type: 'color', default: '#f7f5f2', description: 'Card fill.' },
  { name: '--recorder-card-min-height', type: 'length', default: '265px', description: 'Card height at rest.' },
  { name: '--recorder-title-color', type: 'color', default: '#1a1918', description: 'Session title.' },
  { name: '--recorder-bar-idle', type: 'color', default: '#bbb5ae', description: 'An empty slot in the waveform.' },
  { name: '--recorder-bar-live', type: 'color', default: '#fb9d83', description: 'A filled slot while recording.' },
  { name: '--recorder-bar-held', type: 'color', default: '#5f9dff', description: 'A filled slot while paused.' },
  { name: '--recorder-dot-idle', type: 'color', default: '#0061fe', description: 'The status dot at rest and while paused.' },
  { name: '--recorder-dot-live', type: 'color', default: '#fa551e', description: 'The status dot while recording.' },
  { name: '--recorder-clock-color', type: 'color', default: '#1a1918', description: 'The clock.' },
  { name: '--recorder-font-family', type: 'font', default: 'inherit', description: 'Label and menu type.' },
  { name: '--recorder-title-font-family', type: 'font', default: 'var(--recorder-font-family)', description: 'Title type.' },
  { name: '--recorder-clock-font-family', type: 'font', default: 'ui-monospace, …', description: 'Clock type.' },
]

interface Take {
  id: number
  url: string
  duration: number
  size: number
}

function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function BasicDemo() {
  const [takes, setTakes] = useState<Take[]>([])
  const [lastAction, setLastAction] = useState<string | null>(null)

  const keep = (recording: Recording) => {
    setTakes((list) => [
      { id: Date.now(), url: recording.url, duration: recording.duration, size: recording.blob.size },
      ...list,
    ])
  }

  return (
    <Demo
      title="Record → Pause → Resume, finish from the menu"
      controls={
        <>
          {lastAction && <span className="field-readout">last action: {lastAction}</span>}
          {takes.length > 0 && (
            <ul className="recorder-takes">
              {takes.map((take) => (
                <li key={take.id} className="recorder-take">
                  <audio controls src={take.url} />
                  <span>
                    {formatClock(take.duration)} · {Math.round(take.size / 1024)} KB
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      }
    >
      <div className="recorder-stage demo-stage">
        <Recorder title="Acme Standup" onRecorded={keep} onAction={setLastAction} />
      </div>
    </Demo>
  )
}

function ThemedDemo() {
  return (
    <Demo title="Themed — via className override" dark>
      <div className="recorder-stage recorder-stage-dark demo-stage">
        <Recorder title="Acme Standup" className="dark-recorder" panelName="Recorder (dark)" />
      </div>
    </Demo>
  )
}

export function RecorderPage() {
  return (
    <div>
      <p className="page-eyebrow">Component</p>
      <h1 className="page-title">Recorder</h1>
      <p className="page-lede">
        A meeting recorder ported from the Figma component: a header pill with the record control,
        three actions and a menu, over a card carrying the session's name, a waveform that fills in
        as the take goes on, and a clock. The record button cycles Record → Pause → Resume; finishing
        or discarding the take lives in the menu. Real microphone capture via{' '}
        <code>MediaRecorder</code>, with the live level drawn from an <code>AnalyserNode</code>.
      </p>

      <p className="section-title">Live demos</p>
      <BasicDemo />
      <div className="prose">
        <p>
          The browser will ask for the microphone the first time you press Record. Each slot in the
          strip stands for a quarter second and holds the loudest moment of its window; once every
          slot is spoken for, the strip shows the most recent stretch of the take. Pause holds the
          clock and turns the bars blue, per the design. Finish hands the take to{' '}
          <code>onRecorded</code> as a <code>Blob</code> with its own object URL.
        </p>
      </div>
      <CodeBlock code={BASIC_CODE} />

      <ThemedDemo />
      <CodeBlock code={THEMED_CODE} />
      <CodeBlock code={THEMED_CSS} language="css" />

      <p className="section-title">Props</p>
      <PropsTable rows={PROPS} />

      <p className="section-title">Dials</p>
      <div className="prose">
        <p>
          The waveform's density and how it reads the microphone are tuned live from the DialKit
          panel — mount <code>{'<DialRoot />'}</code> once in your app root. Seed the starting values
          per app with <code>defaults</code>.
        </p>
      </div>
      <PropsTable rows={DIALS} />

      <p className="section-title">useRecorder(options)</p>
      <div className="prose">
        <p>
          The capture machinery on its own, for an app that wants a different surface. It owns the
          stream, the <code>MediaRecorder</code> and the analyser, and tears all three down on
          cancel, reset and unmount so the browser's recording indicator goes away with the take.
          Options: <code>mimeType</code>, <code>maxDuration</code>, <code>onStop</code>.
        </p>
      </div>
      <CodeBlock code={HOOK_CODE} />
      <PropsTable rows={HOOK_RETURNS} />

      <p className="section-title">Theming</p>
      <div className="prose">
        <p>
          Every colour is a CSS custom property, overridable via a class passed to{' '}
          <code>className</code>. The design is set in Atlas Grotesk, Sharp Grotesk DB Book and
          Atlas Typewriter — all licensed, so the library ships font-agnostic and the docs site stands
          Geist in: Geist Sans through <code>--recorder-font-family</code>, Geist Mono for the clock
          through <code>--recorder-clock-font-family</code>.
        </p>
      </div>
      <PropsTable rows={THEME_VARS} />

      <p className="section-title">Accessibility</p>
      <ul className="a11y-list">
        <li>
          The record button's <code>aria-label</code> follows its state: "Record recording", "Pause
          recording", "Resume recording"
        </li>
        <li>
          The clock is a <code>role="timer"</code>; the waveform is decorative and hidden from
          assistive tech
        </li>
        <li>
          The menu button carries <code>aria-haspopup</code> / <code>aria-expanded</code>; the menu
          closes on Escape and on a click outside
        </li>
        <li>A microphone that's blocked or missing is announced through a <code>role="alert"</code></li>
        <li>
          Respects <code>prefers-reduced-motion</code> — springs and bar transitions resolve
          instantly
        </li>
      </ul>
    </div>
  )
}
