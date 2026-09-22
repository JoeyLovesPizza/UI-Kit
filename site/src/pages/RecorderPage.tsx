import { useCallback, useRef, useState } from 'react'
import { Recorder, type Recording } from 'ui-kit'
import { CodeBlock } from '../components/CodeBlock'
import { Demo } from '../components/Demo'
import { PropsTable } from '../components/PropsTable'

const BASIC_CODE = `
import { Recorder } from 'ui-kit'
import 'ui-kit/style.css'

<Recorder
  onRecorded={(take) => upload(take.blob)}
  onAction={(action) => console.log(action)} // 'transcript' | 'highlight' | 'share'
/>
`

const PARTICIPANT_CODE = `
// e.g. an AnalyserNode on the remote audio track — 0–1, read per frame
<Recorder getParticipantLevel={() => remoteLevel()} />
`

const HOOK_CODE = `
import { useRecorder } from 'ui-kit'

const { status, elapsed, start, pause, resume, stop, recording, getLevel } = useRecorder()

<button onClick={status === 'idle' ? start : stop}>
  {status === 'idle' ? 'Record' : 'Stop'}
</button>
`

const THEMED_CODE = `
<Recorder className="my-dark-recorder" />
`

const THEMED_CSS = `
.my-dark-recorder {
  --recorder-bg: #232226;
  --recorder-border: rgba(255, 255, 255, 0.12);
  --recorder-shadow: 0 16px 31px rgba(0, 0, 0, 0.45);
  --recorder-icon-color: #f5f3f0;
  --recorder-icon-hover-bg: rgba(255, 255, 255, 0.1);
  --recorder-menu-bg: #2b2a2f;
  --recorder-menu-item-color: #f5f3f0;
}
`

const PROPS = [
  {
    name: 'onRecorded',
    type: '(recording: Recording) => void',
    description:
      'Called with the finished take when the disc is pressed to stop. Its url is a fresh object URL owned by the caller — revoke it when done.',
  },
  { name: 'onDiscard', type: '() => void', description: 'Called when Discard is chosen from the menu.' },
  { name: 'onStart', type: '() => void', description: 'Called once the microphone is live and the take has begun.' },
  {
    name: 'onAction',
    type: "(action: 'transcript' | 'highlight' | 'share') => void",
    description: 'Called when one of the three actions is pressed.',
  },
  {
    name: 'getParticipantLevel',
    type: '() => number',
    description: 'Level of the other side of the call, 0–1, read once per animation frame. Drawn as the pink voice in the strip.',
  },
  {
    name: 'actions',
    type: 'RecorderAction[]',
    default: "['transcript', 'highlight', 'share']",
    description: 'Which actions to show, in order.',
  },
  {
    name: 'menuItems',
    type: '{ id, label, onSelect }[]',
    description: 'Extra rows for the menu, listed above Pause and Discard.',
  },
  { name: 'maxDuration', type: 'number', description: 'Stop on its own once the take reaches this length, in ms.' },
  {
    name: 'mimeType',
    type: 'string',
    description: "Preferred container/codec. Falls back through webm/opus, webm, mp4 and ogg/opus when the browser can't do it.",
  },
  { name: 'label', type: 'string', default: "'Recording'", description: 'Accessible name for the whole widget.' },
  { name: 'panelName', type: 'string', default: "'Recorder'", description: 'DialKit panel title. Recorders sharing a name share one panel.' },
  {
    name: 'defaults',
    type: 'RecorderDefaults',
    description: 'Per-scenario starting values for the DialKit sliders (waveform, signal, disc).',
  },
  { name: 'className', type: 'string', description: 'Additional class for CSS custom-property overrides.' },
]

const DIALS = [
  { name: 'waveform.bars', type: 'number', default: '30', description: 'Slots across the strip. Newest at the right.' },
  { name: 'waveform.barWidth', type: 'px', default: '1', description: 'Width of every slot.' },
  { name: 'waveform.stride', type: 'px', default: '2', description: 'Distance from one slot to the next.' },
  { name: 'waveform.height', type: 'px', default: '16', description: 'A full-scale bar for your own voice.' },
  { name: 'waveform.participantHeight', type: 'px', default: '14', description: 'A full-scale bar for the other side.' },
  { name: 'waveform.dotSize', type: 'px', default: '1', description: 'The baseline dot in every slot.' },
  {
    name: 'waveform.rise',
    type: 'ms',
    default: '80',
    description: 'How long a bar takes to reach a new height. 0 snaps; longer ripples as the strip scrolls.',
  },
  {
    name: 'signal.sampleInterval',
    type: 'ms',
    default: '80',
    description: 'Audio each slot stands for. 30 slots at 80ms is 2.4s across the strip.',
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
  { name: 'disc.haloOpacity', type: '0–1', default: '0.6', description: 'The 35px ring behind the glyph.' },
  { name: 'disc.recordSize', type: 'px', default: '27', description: 'The dot, at rest.' },
  { name: 'disc.stopSize', type: 'px', default: '21', description: 'The square, while recording.' },
  { name: 'disc.stopRadius', type: 'px', default: '2', description: 'Corner radius of the square.' },
  { name: 'disc.transition', type: 'spring', description: 'The dot squaring off into the stop glyph, and back.' },
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
  { name: '--recorder-bg', type: 'color', default: '#ffffff', description: 'Pill fill.' },
  { name: '--recorder-border', type: 'color', default: 'rgba(0,0,0,0.14)', description: 'Dividers between the three sections.' },
  { name: '--recorder-shadow', type: 'shadow', default: '0 16px 31px rgba(30,25,25,0.1)', description: 'Drop shadow under the pill.' },
  { name: '--recorder-record', type: 'color', default: '#fa551e', description: "The disc's halo and glyph." },
  { name: '--recorder-baseline', type: 'color', default: '#fa551e', description: "The strip's dotted baseline." },
  { name: '--recorder-bar-own', type: 'color', default: '#fa931e', description: 'Your own voice.' },
  { name: '--recorder-bar-other', type: 'color', default: '#f949d9', description: 'The other side of the call.' },
  { name: '--recorder-icon-color', type: 'color', default: '#1a1918', description: 'Action and menu icons.' },
  { name: '--recorder-icon-hover-bg', type: 'color', default: 'rgba(155,100,0,0.1)', description: 'Hover fill behind an icon button and menu row.' },
  { name: '--recorder-menu-bg', type: 'color', default: '#ffffff', description: 'Menu fill.' },
  { name: '--recorder-menu-item-color', type: 'color', default: '#1a1918', description: 'Menu row text.' },
  { name: '--recorder-font-family', type: 'font', default: 'inherit', description: 'Menu type.' },
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

/**
 * A stand-in for the other side of a call: a slow random walk with the odd
 * burst, so the pink layer has something to draw without a second person.
 */
function useSimulatedParticipant(enabled: boolean) {
  const stateRef = useRef({ level: 0, target: 0, nextChange: 0 })
  return useCallback(() => {
    if (!enabled) return 0
    const s = stateRef.current
    const now = performance.now()
    if (now > s.nextChange) {
      s.target = Math.random() < 0.55 ? Math.random() * 0.22 : 0.005
      s.nextChange = now + 120 + Math.random() * 400
    }
    s.level += (s.target - s.level) * 0.25
    return s.level
  }, [enabled])
}

function BasicDemo() {
  const [takes, setTakes] = useState<Take[]>([])
  const [lastAction, setLastAction] = useState<string | null>(null)
  const [simulate, setSimulate] = useState(false)
  const getParticipantLevel = useSimulatedParticipant(simulate)

  const keep = (recording: Recording) => {
    setTakes((list) => [
      { id: Date.now(), url: recording.url, duration: recording.duration, size: recording.blob.size },
      ...list,
    ])
  }

  return (
    <Demo
      title="Press the disc to record, press it again to stop"
      controls={
        <>
          <label className="field">
            <input type="checkbox" checked={simulate} onChange={(e) => setSimulate(e.target.checked)} />
            Simulate a participant (pink)
          </label>
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
        <Recorder onRecorded={keep} onAction={setLastAction} getParticipantLevel={getParticipantLevel} />
      </div>
    </Demo>
  )
}

function ThemedDemo() {
  return (
    <Demo title="Themed — via className override" dark>
      <div className="recorder-stage recorder-stage-dark demo-stage">
        <Recorder className="dark-recorder" panelName="Recorder (dark)" />
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
        A compact meeting recorder ported from the Figma component: one pill with the record disc
        and a live level strip beside it, three actions, and a menu. The disc is the whole transport
        — a dot to start, a square to stop. Pausing and discarding live in the menu. Real microphone
        capture via <code>MediaRecorder</code>, with the live level drawn from an{' '}
        <code>AnalyserNode</code>.
      </p>

      <p className="section-title">Live demos</p>
      <BasicDemo />
      <div className="prose">
        <p>
          The browser will ask for the microphone the first time you press the disc. The strip is
          thirty one-pixel slots that scroll right to left, the newest moment arriving at the right
          edge; each slot stands for 80ms and holds the loudest moment of its window. Your own voice
          draws in orange. Hand the widget a level for the other side of the call and it draws that
          in pink on top — the checkbox above fakes one so you can see the two together. Stopping
          hands the take to <code>onRecorded</code> as a <code>Blob</code> with its own object URL.
        </p>
      </div>
      <CodeBlock code={BASIC_CODE} />
      <CodeBlock code={PARTICIPANT_CODE} />

      <ThemedDemo />
      <CodeBlock code={THEMED_CODE} />
      <CodeBlock code={THEMED_CSS} language="css" />

      <p className="section-title">Props</p>
      <PropsTable rows={PROPS} />

      <p className="section-title">Dials</p>
      <div className="prose">
        <p>
          The strip's density, how it reads the microphone, and the disc's geometry are tuned live
          from the DialKit panel — mount <code>{'<DialRoot />'}</code> once in your app root. Seed
          the starting values per app with <code>defaults</code>.
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
          <code>className</code>. Only the menu carries any type; the docs site stands Geist Sans in
          through <code>--recorder-font-family</code>.
        </p>
      </div>
      <PropsTable rows={THEME_VARS} />

      <p className="section-title">Accessibility</p>
      <ul className="a11y-list">
        <li>
          The disc is a toggle button: <code>aria-pressed</code> while a take is running, and its
          label carries the elapsed time ("Stop recording, 0:12 so far")
        </li>
        <li>The strip is decorative and hidden from assistive tech</li>
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
