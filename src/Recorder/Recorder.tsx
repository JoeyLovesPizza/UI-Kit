import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion, type Transition } from 'motion/react'
import { useDialKit } from 'dialkit'
import { Waveform } from './Waveform'
import { useRecorder, type Recording } from './useRecorder'
import './Recorder.css'

/**
 * Per-scenario starting values for the DialKit panel. As with the other
 * components, the tunable range is fixed — this only moves where each slider
 * starts, so an app can open with a denser or calmer waveform without
 * dragging sliders by hand every time.
 */
export interface RecorderDefaults {
  waveform?: { bars?: number; barWidth?: number; height?: number; dotSize?: number; rise?: number }
  signal?: { sampleInterval?: number; sensitivity?: number; smoothing?: number }
}

export type RecorderAction = 'transcript' | 'highlight' | 'share'

export interface RecorderProps {
  /** Name of the session, shown on the card. */
  title: string
  /**
   * Called with the finished take when it's confirmed from the menu. The
   * `url` is a fresh object URL owned by the caller — revoke it when done.
   */
  onRecorded?: (recording: Recording) => void
  /** Called when a take is thrown away from the menu. */
  onDiscard?: () => void
  /** Called once the microphone is live and the take has begun. */
  onStart?: () => void
  /** Called when one of the three header actions is pressed. */
  onAction?: (action: RecorderAction) => void
  /** Which header actions to show. Defaults to all three. */
  actions?: RecorderAction[]
  /** Extra rows for the menu, above Finish and Discard. */
  menuItems?: { id: string; label: string; onSelect: () => void }[]
  /** Stop on its own once the take reaches this length, in ms. */
  maxDuration?: number
  /** Preferred container/codec — see `useRecorder`. */
  mimeType?: string
  /** Name of this widget's DialKit panel. Defaults to "Recorder". */
  panelName?: string
  /** Per-scenario starting values for the DialKit sliders. */
  defaults?: RecorderDefaults
  /** Additional class for CSS custom-property overrides (see Recorder.css). */
  className?: string
}

function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  return [hours, minutes, seconds].map((n) => n.toString().padStart(2, '0')).join(':')
}

/* Icons are the design's own UIIcon glyphs, paths carried over verbatim. The
   fill is `currentColor` so a theme can recolour them through CSS. */

function PauseIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 5.5H10V18.5H7V5.5Z" fill="currentColor" />
      <path d="M14 5.5H17V18.5H14V5.5Z" fill="currentColor" />
    </svg>
  )
}

function TranscriptIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M5.5 4.02539H7H16.5H18V5.52539V18.5254V20.0254H16.5H7H5.5V18.5254V15.5002H7V18.5254H16.5V5.52539H7V6.15872V8.50024H5.5V6.15872V5.52539V4.02539ZM5.5 10.0254H7V14.0254H5.5V10.0254ZM4 16.5254V7.52539H2.5V16.5254H4ZM8.5 8.52539H10V15.5254H8.5V8.52539ZM13 10.5254H11.5V13.5254H13V10.5254Z"
        fill="currentColor"
      />
    </svg>
  )
}

function HighlightIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M18.0224 6.66128L17.3684 5.99478C17.0601 5.67898 16.6918 5.42802 16.2852 5.25668C15.8785 5.08534 15.4417 4.99707 15.0004 4.99707C14.5591 4.99707 14.1222 5.08534 13.7156 5.25668C13.3089 5.42802 12.9406 5.67898 12.6324 5.99478L6.68987 12.0448V14.0998C6.69383 14.8976 6.38197 15.6646 5.82237 16.2333L4.54688 17.5263L7.75787 18.5968L7.97537 18.3763C8.24445 18.0989 8.5665 17.8783 8.92243 17.7278C9.27836 17.5772 9.66091 17.4997 10.0474 17.4998H12.0749L18.0249 11.4453C18.6475 10.8045 18.9956 9.94619 18.9951 9.05277C18.9947 8.15935 18.6457 7.30136 18.0224 6.66128ZM11.4459 15.9998H10.0459C9.2672 15.9983 8.50235 16.2055 7.83087 16.5998L7.58937 16.3538C7.98339 15.6663 8.19027 14.8876 8.18937 14.0953V12.6568L8.52137 12.3188L11.7909 15.6498L11.4459 15.9998ZM12.8424 14.5783L9.57337 11.2498L12.8434 7.92128L16.1119 11.2498L12.8424 14.5783ZM17.1424 10.1578L13.9154 6.87128C14.2694 6.61462 14.7027 6.49137 15.1387 6.5233C15.5748 6.55523 15.9856 6.74029 16.2984 7.04578L16.9504 7.71178C17.2624 8.03322 17.4524 8.4536 17.4873 8.90024C17.5223 9.34687 17.4001 9.79169 17.1419 10.1578H17.1424Z"
        fill="currentColor"
      />
    </svg>
  )
}

function ShareIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M21 17.5H19V15.5H17.5V17.5H15.5V19H17.5V21H19V19H21V17.5Z" fill="currentColor" />
      <path
        d="M9.25 13H14.75C15.1552 13 15.5554 13.0896 15.9218 13.2625C16.2883 13.4354 16.6119 13.6872 16.8695 14H18.6195C18.2924 13.2802 17.771 12.6659 17.1139 12.2262C16.4568 11.7865 15.6901 11.5388 14.9 11.511C15.3247 10.7442 15.5321 9.876 15.5 9C15.5 6.7125 14.464 5.3065 12.636 5.0475C12.579 5.039 12.5225 5.031 12.467 5.025C12.4243 5.02067 12.3812 5.017 12.3375 5.014C12.221 5.0055 12.1065 5 12 5C11.8935 5 11.779 5.0055 11.6625 5.014C11.6188 5.017 11.5757 5.02067 11.533 5.025C11.4775 5.031 11.421 5.039 11.364 5.0475C9.536 5.3065 8.5 6.7125 8.5 9C8.46867 9.8748 8.67608 10.7416 9.1 11.5075C8.00033 11.5463 6.95858 12.0102 6.19391 12.8014C5.42924 13.5927 5.00126 14.6496 5 15.75V19H14V17.5H6.5V15.75C6.50079 15.0209 6.79078 14.3219 7.30633 13.8063C7.82189 13.2908 8.5209 13.0008 9.25 13ZM11.8225 11.496H11.791C10.9095 11.446 10.072 11.046 10.072 9.002C10.072 6.958 10.9095 6.5565 11.791 6.508H11.8225C11.8815 6.5 11.941 6.5 12 6.5C12.059 6.5 12.1185 6.5 12.1775 6.504H12.209C13.0905 6.554 13.928 6.954 13.928 8.998C13.928 11.042 13.0905 11.4435 12.209 11.492H12.1775C12.1185 11.5 12.059 11.5 12 11.5C11.941 11.5 11.8815 11.5 11.8225 11.496Z"
        fill="currentColor"
      />
    </svg>
  )
}

function EmojiSmileIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M9.5 11.0001C9.63406 11.0108 9.76886 10.9924 9.89509 10.9459C10.0213 10.8995 10.1359 10.8262 10.231 10.7311C10.3261 10.636 10.3994 10.5214 10.4459 10.3951C10.4923 10.2689 10.5108 10.1341 10.5 10.0001C10.5108 9.866 10.4923 9.73119 10.4459 9.60497C10.3994 9.47874 10.3261 9.36412 10.231 9.26902C10.1359 9.17391 10.0213 9.10061 9.89509 9.05417C9.76886 9.00773 9.63406 8.98927 9.5 9.00006C9.36594 8.98927 9.23113 9.00773 9.10491 9.05417C8.97868 9.10061 8.86406 9.17391 8.76895 9.26902C8.67385 9.36412 8.60055 9.47874 8.55411 9.60497C8.50767 9.73119 8.48921 9.866 8.5 10.0001C8.48921 10.1341 8.50767 10.2689 8.55411 10.3951C8.60055 10.5214 8.67385 10.636 8.76895 10.7311C8.86406 10.8262 8.97868 10.8995 9.10491 10.9459C9.23113 10.9924 9.36594 11.0108 9.5 11.0001Z"
        fill="currentColor"
      />
      <path
        d="M14.5 9.00006C14.3659 8.98927 14.2311 9.00773 14.1049 9.05417C13.9787 9.10061 13.8641 9.17391 13.769 9.26902C13.6739 9.36412 13.6005 9.47874 13.5541 9.60497C13.5077 9.73119 13.4892 9.866 13.5 10.0001C13.4892 10.1341 13.5077 10.2689 13.5541 10.3951C13.6005 10.5214 13.6739 10.636 13.769 10.7311C13.8641 10.8262 13.9787 10.8995 14.1049 10.9459C14.2311 10.9924 14.3659 11.0108 14.5 11.0001C14.6341 11.0108 14.7689 10.9924 14.8951 10.9459C15.0213 10.8995 15.1359 10.8262 15.231 10.7311C15.3261 10.636 15.3994 10.5214 15.4459 10.3951C15.4923 10.2689 15.5108 10.1341 15.5 10.0001C15.5108 9.866 15.4923 9.73119 15.4459 9.60497C15.3994 9.47874 15.3261 9.36412 15.231 9.26902C15.1359 9.17391 15.0213 9.10061 14.8951 9.05417C14.7689 9.00773 14.6341 8.98927 14.5 9.00006Z"
        fill="currentColor"
      />
      <path
        d="M12 4C6.841 4 4 6.841 4 12C4 17.159 6.841 20 12 20C17.159 20 20 17.159 20 12C20 6.841 17.159 4 12 4ZM12 18.5C7.626 18.5 5.5 16.374 5.5 12C5.5 7.626 7.626 5.5 12 5.5C16.374 5.5 18.5 7.626 18.5 12C18.5 16.374 16.374 18.5 12 18.5Z"
        fill="currentColor"
      />
      <path
        d="M14 12.75C14 13.2141 13.8156 13.6592 13.4874 13.9874C13.1592 14.3156 12.7141 14.5 12.25 14.5H11.75C11.2859 14.5 10.8408 14.3156 10.5126 13.9874C10.1844 13.6592 10 13.2141 10 12.75V12.5H8.5V12.75C8.50106 13.6116 8.84381 14.4377 9.45307 15.0469C10.0623 15.6562 10.8884 15.9989 11.75 16H12.25C13.1116 15.9989 13.9377 15.6562 14.5469 15.0469C15.1562 14.4377 15.4989 13.6116 15.5 12.75V12.5H14V12.75Z"
        fill="currentColor"
      />
    </svg>
  )
}

function ChevronDownIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3.5 6.16699L7.83333 10.3337L12.1667 6.16699"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeMiterlimit="10"
      />
    </svg>
  )
}

const ACTION_ICONS: Record<RecorderAction, { label: string; icon: ReactNode }> = {
  transcript: { label: 'Transcript', icon: <TranscriptIcon /> },
  highlight: { label: 'Highlight', icon: <HighlightIcon /> },
  share: { label: 'Share', icon: <ShareIcon /> },
}

const ALL_ACTIONS: RecorderAction[] = ['transcript', 'highlight', 'share']

/**
 * A meeting recorder, ported from the Figma component: a header pill with
 * the record control, three actions and a menu, over a card carrying the
 * session's name, a waveform that fills in as the take goes on, and a clock.
 *
 * The record button cycles Record → Pause → Resume. Finishing or discarding
 * the take lives in the menu on the right. Capture is handled by
 * `useRecorder`, which is also exported on its own for apps that want a
 * different surface on the same machinery.
 */
export function Recorder({
  title,
  onRecorded,
  onDiscard,
  onStart,
  onAction,
  actions = ALL_ACTIONS,
  menuItems,
  maxDuration,
  mimeType,
  panelName = 'Recorder',
  defaults,
  className,
}: RecorderProps) {
  const params = useDialKit(
    panelName,
    {
      waveform: {
        // 63 slots across the design's 379px strip. Fewer is chunkier; more
        // is finer but each slot then stands for less time (see signal).
        bars: [defaults?.waveform?.bars ?? 63, 16, 120, 1],
        barWidth: [defaults?.waveform?.barWidth ?? 3, 1, 6, 0.5],
        height: [defaults?.waveform?.height ?? 104, 24, 160, 1], // a full-scale bar
        dotSize: [defaults?.waveform?.dotSize ?? 3, 1, 6, 0.5], // an empty slot
        // How long a bar takes to reach a new height. 0 snaps; longer makes
        // the strip ripple as slots shift once it's full.
        rise: [defaults?.waveform?.rise ?? 120, 0, 600, 10],
      },
      signal: {
        // ms of audio each slot stands for — 63 slots at 250ms is about 16
        // seconds across the strip before it starts scrolling.
        sampleInterval: [defaults?.signal?.sampleInterval ?? 250, 40, 1000, 10],
        // Gain on the raw RMS level. Speech at a normal distance lands around
        // 0.05–0.2 RMS, so a few x is what lets it reach the top.
        sensitivity: [defaults?.signal?.sensitivity ?? 3, 0.2, 10, 0.05],
        // 0 follows the mic frame by frame, 0.95 barely moves. Applied per
        // animation frame before the peak of each window is taken.
        smoothing: [defaults?.signal?.smoothing ?? 0.5, 0, 0.95, 0.01],
      },
      motion: {
        // The header's left section resizing as the label changes length.
        header: { type: 'spring', visualDuration: 0.35, bounce: 0.15 },
        // The label itself swapping between Record, Pause and Resume.
        label: { type: 'spring', visualDuration: 0.25, bounce: 0.2 },
        labelOffsetY: [6, -24, 24, 1], // where the incoming label starts
        // The menu opening and closing.
        menu: { type: 'spring', visualDuration: 0.25, bounce: 0.2 },
      },
    },
    { id: panelName }
  )

  const reduceMotion = useReducedMotion()
  const still: Transition = { duration: 0 }
  const headerTransition = reduceMotion ? still : (params.motion.header as Transition)
  const labelTransition = reduceMotion ? still : (params.motion.label as Transition)
  const menuTransition = reduceMotion ? still : (params.motion.menu as Transition)

  const recorder = useRecorder({ mimeType, maxDuration })
  const { status, elapsed, recording, error, start, pause, resume, stop, cancel, reset, getLevel } =
    recorder

  // Every level sample of the current take. Cleared as each take ends, with
  // a revision the strip watches so it repaints the empty buffer.
  const samplesRef = useRef<number[]>([])
  const [revision, setRevision] = useState(0)
  const clearSamples = useCallback(() => {
    samplesRef.current = []
    setRevision((n) => n + 1)
  }, [])

  const onStartRef = useRef(onStart)
  onStartRef.current = onStart
  useEffect(() => {
    if (status === 'recording') onStartRef.current?.()
  }, [status])

  // There's no review state in the design: a finished take is handed over
  // the moment it exists, with its own object URL so the hook's cleanup
  // can't pull it out from under the caller.
  const onRecordedRef = useRef(onRecorded)
  onRecordedRef.current = onRecorded
  useEffect(() => {
    if (status !== 'stopped' || !recording) return
    onRecordedRef.current?.({ ...recording, url: URL.createObjectURL(recording.blob) })
    clearSamples()
    reset()
  }, [clearSamples, recording, reset, status])

  const handlePrimary = useCallback(() => {
    switch (status) {
      case 'recording':
        pause()
        break
      case 'paused':
        resume()
        break
      case 'idle':
      case 'error':
        clearSamples()
        void start()
        break
    }
  }, [clearSamples, pause, resume, start, status])

  // Menu
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  useEffect(() => {
    if (!menuOpen) return
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  const hasTake = status === 'recording' || status === 'paused'
  const handleFinish = useCallback(() => {
    setMenuOpen(false)
    stop()
  }, [stop])
  const handleDiscard = useCallback(() => {
    setMenuOpen(false)
    cancel()
    clearSamples()
    onDiscard?.()
  }, [cancel, clearSamples, onDiscard])

  const label =
    status === 'recording'
      ? 'Pause'
      : status === 'paused'
        ? 'Resume'
        : status === 'requesting'
          ? 'Starting'
          : 'Record'

  const view = status === 'recording' ? 'recording' : status === 'paused' ? 'paused' : 'idle'
  const rootClassName = ['recorder', `recorder-${view}`, className].filter(Boolean).join(' ')

  return (
    <div className={rootClassName} data-status={status}>
      <motion.div className="recorder-header" layout transition={headerTransition}>
        <motion.div className="recorder-header-primary" layout transition={headerTransition}>
          <button
            type="button"
            className="recorder-record"
            onClick={handlePrimary}
            disabled={status === 'requesting'}
            aria-label={`${label} recording`}
          >
            <span className="recorder-record-disc">
              <AnimatePresence initial={false}>
                {status === 'recording' && (
                  <motion.span
                    key="pause"
                    className="recorder-record-glyph"
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.6 }}
                    transition={labelTransition}
                  >
                    <PauseIcon />
                  </motion.span>
                )}
              </AnimatePresence>
            </span>
            <span className="recorder-record-label">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={label}
                  className="recorder-record-label-text"
                  initial={{ opacity: 0, y: params.motion.labelOffsetY }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -params.motion.labelOffsetY }}
                  transition={labelTransition}
                >
                  {label}
                </motion.span>
              </AnimatePresence>
            </span>
          </button>
        </motion.div>

        <motion.div className="recorder-header-actions" layout transition={headerTransition}>
          {actions.map((action) => (
            <button
              key={action}
              type="button"
              className="recorder-action"
              onClick={() => onAction?.(action)}
              aria-label={ACTION_ICONS[action].label}
            >
              {ACTION_ICONS[action].icon}
            </button>
          ))}
        </motion.div>

        <motion.div className="recorder-header-menu" layout transition={headerTransition} ref={menuRef}>
          <button
            type="button"
            className="recorder-menu-button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-controls={menuId}
            aria-label="Recording options"
          >
            <span className="recorder-menu-button-icon">
              <EmojiSmileIcon />
            </span>
            <span className="recorder-menu-button-chevron">
              <ChevronDownIcon />
            </span>
          </button>
          <AnimatePresence>
            {menuOpen && (
              <motion.div
                id={menuId}
                role="menu"
                className="recorder-menu"
                initial={{ opacity: 0, scale: 0.94, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.94, y: -4 }}
                transition={menuTransition}
              >
                {menuItems?.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="menuitem"
                    className="recorder-menu-item"
                    onClick={() => {
                      setMenuOpen(false)
                      item.onSelect()
                    }}
                  >
                    {item.label}
                  </button>
                ))}
                <button
                  type="button"
                  role="menuitem"
                  className="recorder-menu-item"
                  onClick={handleFinish}
                  disabled={!hasTake}
                >
                  Finish recording
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="recorder-menu-item recorder-menu-item-danger"
                  onClick={handleDiscard}
                  disabled={!hasTake}
                >
                  Discard recording
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>

      <div className="recorder-card">
        <h2 className="recorder-title">{title}</h2>
        <Waveform
          getLevel={getLevel}
          bars={params.waveform.bars}
          barWidth={params.waveform.barWidth}
          height={params.waveform.height}
          dotSize={params.waveform.dotSize}
          rise={params.waveform.rise}
          sampleInterval={params.signal.sampleInterval}
          sensitivity={params.signal.sensitivity}
          smoothing={params.signal.smoothing}
          active={status === 'recording'}
          revision={revision}
          samplesRef={samplesRef}
        />
        <div className="recorder-status">
          <span className="recorder-dot" aria-hidden="true" />
          <span className="recorder-clock" role="timer" aria-live="off">
            {formatClock(elapsed)}
          </span>
        </div>
        {status === 'error' && error && (
          <p className="recorder-message" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
