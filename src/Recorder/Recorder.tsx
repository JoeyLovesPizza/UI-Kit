import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion, type Transition } from 'motion/react'
import { useDialKit } from 'dialkit'
import { Waveform } from './Waveform'
import { useRecorder, type Recording } from './useRecorder'
import './Recorder.css'

/**
 * Per-scenario starting values for the DialKit panel. As with the other
 * components, the tunable range is fixed — this only moves where each slider
 * starts, so an app can open with a denser or calmer strip without dragging
 * sliders by hand every time.
 */
export interface RecorderDefaults {
  waveform?: {
    bars?: number
    barWidth?: number
    stride?: number
    height?: number
    participantHeight?: number
    dotSize?: number
    rise?: number
  }
  signal?: { sampleInterval?: number; sensitivity?: number; smoothing?: number }
  disc?: { haloOpacity?: number; recordSize?: number; stopSize?: number; stopRadius?: number }
}

export type RecorderAction = 'transcript' | 'highlight' | 'share'

export interface RecorderProps {
  /**
   * Called with the finished take when the disc is pressed to stop. The `url`
   * is a fresh object URL owned by the caller — revoke it when done.
   */
  onRecorded?: (recording: Recording) => void
  /** Called when a take is thrown away from the menu. */
  onDiscard?: () => void
  /** Called once the microphone is live and the take has begun. */
  onStart?: () => void
  /** Called when one of the three actions is pressed. */
  onAction?: (action: RecorderAction) => void
  /**
   * Level of the other side of the call, 0–1, read once per animation
   * frame. Drawn as a second voice in the strip — the design's pink layer.
   */
  getParticipantLevel?: () => number
  /** Which actions to show. Defaults to all three. */
  actions?: RecorderAction[]
  /** Extra rows for the menu, above Pause and Discard. */
  menuItems?: { id: string; label: string; onSelect: () => void }[]
  /** Stop on its own once the take reaches this length, in ms. */
  maxDuration?: number
  /** Preferred container/codec — see `useRecorder`. */
  mimeType?: string
  /** Accessible name for the whole widget. Defaults to "Recording". */
  label?: string
  /** Name of this widget's DialKit panel. Defaults to "Recorder". */
  panelName?: string
  /** Per-scenario starting values for the DialKit sliders. */
  defaults?: RecorderDefaults
  /** Additional class for CSS custom-property overrides (see Recorder.css). */
  className?: string
}

function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

/* Icons are the design's own UIIcon glyphs, paths carried over verbatim. The
   fill is `currentColor` so a theme can recolour them through CSS. */

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

function SliderIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M11.893 5.99998C11.7664 5.53949 11.4831 5.13762 11.0918 4.86377C10.7006 4.58991 10.226 4.46124 9.75 4.49998C9.274 4.46124 8.79942 4.58991 8.40817 4.86377C8.01692 5.13762 7.73356 5.53949 7.607 5.99998H5V7.49998H7.607C7.73356 7.96048 8.01692 8.36234 8.40817 8.6362C8.79942 8.91006 9.274 9.03872 9.75 8.99998C10.226 9.03872 10.7006 8.91006 11.0918 8.6362C11.4831 8.36234 11.7664 7.96048 11.893 7.49998H19V5.99998H11.893ZM9.75 7.49998C9.1895 7.49998 9 7.31098 9 6.74998C9 6.18898 9.1895 5.99998 9.75 5.99998C10.3105 5.99998 10.5 6.18898 10.5 6.74998C10.5 7.31098 10.3105 7.49998 9.75 7.49998Z"
        fill="currentColor"
      />
      <path
        d="M14.25 9.49998C13.774 9.46124 13.2994 9.58991 12.9082 9.86376C12.5169 10.1376 12.2336 10.5395 12.107 11H5V12.5H12.107C12.2336 12.9605 12.5169 13.3623 12.9082 13.6362C13.2994 13.9101 13.774 14.0387 14.25 14C14.726 14.0387 15.2006 13.9101 15.5918 13.6362C15.9831 13.3623 16.2664 12.9605 16.393 12.5H19V11H16.393C16.2664 10.5395 15.9831 10.1376 15.5918 9.86376C15.2006 9.58991 14.726 9.46124 14.25 9.49998ZM14.25 12.5C13.6895 12.5 13.5 12.311 13.5 11.75C13.5 11.189 13.6895 11 14.25 11C14.8105 11 15 11.189 15 11.75C15 12.311 14.8105 12.5 14.25 12.5Z"
        fill="currentColor"
      />
      <path
        d="M9.75 14.5C9.274 14.4612 8.79942 14.5899 8.40817 14.8638C8.01692 15.1376 7.73356 15.5395 7.607 16H5V17.5H7.607C7.73356 17.9605 8.01692 18.3623 8.40817 18.6362C8.79942 18.9101 9.274 19.0387 9.75 19C10.226 19.0387 10.7006 18.9101 11.0918 18.6362C11.4831 18.3623 11.7664 17.9605 11.893 17.5H19V16H11.893C11.7664 15.5395 11.4831 15.1376 11.0918 14.8638C10.7006 14.5899 10.226 14.4612 9.75 14.5ZM9.75 17.5C9.1895 17.5 9 17.311 9 16.75C9 16.189 9.1895 16 9.75 16C10.3105 16 10.5 16.189 10.5 16.75C10.5 17.311 10.3105 17.5 9.75 17.5Z"
        fill="currentColor"
      />
    </svg>
  )
}

function ChevronDownIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3.5 6.16669L7.83333 10.3334L12.1667 6.16669"
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
 * A compact meeting recorder, ported from the Figma component: one pill with
 * the record disc and a live level strip beside it, three actions, and a
 * menu. The disc is the whole transport — a dot to start, a square to stop.
 * Pausing and discarding live in the menu.
 *
 * Capture is handled by `useRecorder`, which is also exported on its own for
 * apps that want a different surface on the same machinery.
 */
export function Recorder({
  onRecorded,
  onDiscard,
  onStart,
  onAction,
  getParticipantLevel,
  actions = ALL_ACTIONS,
  menuItems,
  maxDuration,
  mimeType,
  label = 'Recording',
  panelName = 'Recorder',
  defaults,
  className,
}: RecorderProps) {
  const params = useDialKit(
    panelName,
    {
      waveform: {
        // 30 one-pixel slots at a 2px stride, per the design's 58px strip.
        bars: [defaults?.waveform?.bars ?? 30, 10, 60, 1],
        barWidth: [defaults?.waveform?.barWidth ?? 1, 0.5, 3, 0.5],
        stride: [defaults?.waveform?.stride ?? 2, 1, 6, 0.5], // slot to slot
        height: [defaults?.waveform?.height ?? 16, 8, 32, 1], // a full-scale bar, your voice
        participantHeight: [defaults?.waveform?.participantHeight ?? 14, 8, 32, 1], // theirs
        dotSize: [defaults?.waveform?.dotSize ?? 1, 0.5, 3, 0.5], // the baseline dot
        // How long a bar takes to reach a new height. 0 snaps; longer makes
        // the strip ripple as slots shift along.
        rise: [defaults?.waveform?.rise ?? 80, 0, 400, 10],
      },
      signal: {
        // ms of audio each slot stands for — 30 slots at 80ms is 2.4s across
        // the strip, so a word crosses it in about the time it takes to say.
        sampleInterval: [defaults?.signal?.sampleInterval ?? 80, 20, 400, 5],
        // Gain on the raw RMS level. Speech at a normal distance lands around
        // 0.05–0.2 RMS, so a few x is what lets it reach the top.
        sensitivity: [defaults?.signal?.sensitivity ?? 3, 0.2, 10, 0.05],
        // 0 follows the mic frame by frame, 0.95 barely moves. Applied per
        // animation frame before the peak of each window is taken.
        smoothing: [defaults?.signal?.smoothing ?? 0.5, 0, 0.95, 0.01],
      },
      disc: {
        haloOpacity: [defaults?.disc?.haloOpacity ?? 0.6, 0, 1, 0.05], // the 35px ring behind the glyph
        recordSize: [defaults?.disc?.recordSize ?? 27, 12, 35, 1], // the dot, at rest
        stopSize: [defaults?.disc?.stopSize ?? 21, 12, 35, 1], // the square, while recording
        stopRadius: [defaults?.disc?.stopRadius ?? 2, 0, 12, 0.5],
        // The dot squaring off into the stop glyph, and back.
        transition: { type: 'spring', visualDuration: 0.3, bounce: 0.25 },
      },
      motion: {
        // The menu opening and closing.
        menu: { type: 'spring', visualDuration: 0.25, bounce: 0.2 },
      },
    },
    { id: panelName }
  )

  const reduceMotion = useReducedMotion()
  const still: Transition = { duration: 0 }
  const discTransition = reduceMotion ? still : (params.disc.transition as Transition)
  const menuTransition = reduceMotion ? still : (params.motion.menu as Transition)

  const recorder = useRecorder({ mimeType, maxDuration })
  const { status, elapsed, recording, error, start, pause, resume, stop, cancel, reset, getLevel } =
    recorder

  // Bumped as each take ends so the strip wipes back to its dots.
  const [revision, setRevision] = useState(0)
  const wipe = useCallback(() => setRevision((n) => n + 1), [])

  const onStartRef = useRef(onStart)
  onStartRef.current = onStart
  useEffect(() => {
    if (status === 'recording') onStartRef.current?.()
  }, [status])

  // A finished take is handed over the moment it exists, with its own object
  // URL so the hook's cleanup can't pull it out from under the caller.
  const onRecordedRef = useRef(onRecorded)
  onRecordedRef.current = onRecorded
  useEffect(() => {
    if (status !== 'stopped' || !recording) return
    onRecordedRef.current?.({ ...recording, url: URL.createObjectURL(recording.blob) })
    wipe()
    reset()
  }, [recording, reset, status, wipe])

  const hasTake = status === 'recording' || status === 'paused'

  const handleDisc = useCallback(() => {
    if (hasTake) stop()
    else if (status === 'idle' || status === 'error') {
      wipe()
      void start()
    }
  }, [hasTake, start, status, stop, wipe])

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

  const handlePauseResume = useCallback(() => {
    setMenuOpen(false)
    if (status === 'recording') pause()
    else if (status === 'paused') resume()
  }, [pause, resume, status])

  const handleDiscard = useCallback(() => {
    setMenuOpen(false)
    cancel()
    wipe()
    onDiscard?.()
  }, [cancel, onDiscard, wipe])

  const view = status === 'recording' ? 'recording' : status === 'paused' ? 'paused' : 'idle'
  const rootClassName = ['recorder', `recorder-${view}`, className].filter(Boolean).join(' ')
  const discLabel = hasTake
    ? `Stop recording, ${formatClock(elapsed)} so far`
    : status === 'requesting'
      ? 'Starting recording'
      : 'Start recording'
  const glyphSize = hasTake ? params.disc.stopSize : params.disc.recordSize
  const glyphRadius = hasTake ? params.disc.stopRadius : params.disc.recordSize / 2

  return (
    <div className={rootClassName} data-status={status} role="group" aria-label={label}>
      <div className="recorder-primary">
        <button
          type="button"
          className="recorder-disc"
          onClick={handleDisc}
          disabled={status === 'requesting'}
          aria-label={discLabel}
          aria-pressed={hasTake}
          title={hasTake ? formatClock(elapsed) : undefined}
          style={{ '--recorder-halo-opacity': params.disc.haloOpacity } as CSSProperties}
        >
          <motion.span
            className="recorder-disc-glyph"
            animate={{ width: glyphSize, height: glyphSize, borderRadius: glyphRadius }}
            transition={discTransition}
          />
        </button>
        <Waveform
          getLevel={getLevel}
          getParticipantLevel={getParticipantLevel}
          bars={params.waveform.bars}
          barWidth={params.waveform.barWidth}
          stride={params.waveform.stride}
          height={params.waveform.height}
          participantHeight={params.waveform.participantHeight}
          dotSize={params.waveform.dotSize}
          rise={params.waveform.rise}
          sampleInterval={params.signal.sampleInterval}
          sensitivity={params.signal.sensitivity}
          smoothing={params.signal.smoothing}
          active={status === 'recording'}
          revision={revision}
        />
      </div>

      <div className="recorder-actions">
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
      </div>

      <div className="recorder-menu-section" ref={menuRef}>
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
            <SliderIcon />
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
                onClick={handlePauseResume}
                disabled={!hasTake}
              >
                {status === 'paused' ? 'Resume recording' : 'Pause recording'}
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
      </div>

      {status === 'error' && error && (
        <p className="recorder-message" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
