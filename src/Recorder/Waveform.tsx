import { useEffect, useMemo, useRef, type CSSProperties } from 'react'

export interface WaveformProps {
  /** Your own microphone level, 0–1. Read once per animation frame. */
  getLevel: () => number
  /** The other side of the call, 0–1. Drawn as a second layer when given. */
  getParticipantLevel?: () => number
  /** Slots across the strip. Newest at the right. */
  bars: number
  barWidth: number
  /** Distance from one slot to the next, in px. */
  stride: number
  /** Height of a full-scale bar for your own voice, in px. */
  height: number
  /** Height of a full-scale bar for the participant, in px. */
  participantHeight: number
  /** Height of an empty slot's dot, in px. */
  dotSize: number
  /** ms of audio each slot stands for. A slot holds the loudest moment of its window. */
  sampleInterval: number
  /** Gain on the raw level before it's drawn. */
  sensitivity: number
  /** 0–1: how much of the previous frame's level survives into this one. */
  smoothing: number
  /** ms a bar takes to move to a new height. */
  rise: number
  /** Whether the loop is sampling. Off, the strip holds whatever it has. */
  active: boolean
  /** Bump to wipe the strip back to its dots. */
  revision: number
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

/**
 * The tiny level strip beside the record disc: a row of 1px slots that
 * scrolls right to left, the newest moment arriving at the right edge. Each
 * slot carries a dot for the baseline and a bar per voice on top of it, all
 * sized by writing transforms straight to the DOM from one animation-frame
 * loop, so nothing here re-renders while a take is running.
 */
export function Waveform({
  getLevel,
  getParticipantLevel,
  bars,
  barWidth,
  stride,
  height,
  participantHeight,
  dotSize,
  sampleInterval,
  sensitivity,
  smoothing,
  rise,
  active,
  revision,
}: WaveformProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const slots = useMemo(() => Array.from({ length: bars }, (_, i) => i), [bars])
  // Most recent samples, oldest first, at most `bars` long. Two lanes.
  const ownRef = useRef<number[]>([])
  const otherRef = useRef<number[]>([])

  const paint = (own: number[], other: number[], liveOwn: number, liveOther: number) => {
    const track = trackRef.current
    if (!track) return
    const columns = Array.from(track.children) as HTMLElement[]
    // The right-most slot is the window still being filled, drawn live.
    const ownAll = own.concat(liveOwn).slice(-bars)
    const otherAll = other.concat(liveOther).slice(-bars)
    const offset = bars - ownAll.length
    for (let i = 0; i < columns.length; i++) {
      const b = columns[i].children[0] as HTMLElement // participant
      const a = columns[i].children[1] as HTMLElement // own
      const va = ownAll[i - offset]
      const vb = otherAll[i - offset]
      a.style.transform = `scaleY(${(va ?? 0).toFixed(3)})`
      b.style.transform = `scaleY(${(vb ?? 0).toFixed(3)})`
    }
  }

  // Wipe on a new take, or whenever the geometry changes hands.
  useEffect(() => {
    ownRef.current = []
    otherRef.current = []
    paint([], [], 0, 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision, bars])

  useEffect(() => {
    if (!active) return
    const own = ownRef.current
    const other = otherRef.current
    let frame = 0
    let smoothedOwn = 0
    let smoothedOther = 0
    let peakOwn = 0
    let peakOther = 0
    let windowStart = performance.now()

    const tick = (now: number) => {
      const rawOwn = clamp(getLevel() * sensitivity, 0, 1)
      const rawOther = clamp((getParticipantLevel?.() ?? 0) * sensitivity, 0, 1)
      smoothedOwn += (rawOwn - smoothedOwn) * (1 - smoothing)
      smoothedOther += (rawOther - smoothedOther) * (1 - smoothing)
      peakOwn = Math.max(peakOwn, smoothedOwn)
      peakOther = Math.max(peakOther, smoothedOther)
      while (now - windowStart >= sampleInterval) {
        own.push(peakOwn)
        other.push(peakOther)
        if (own.length > bars) own.shift()
        if (other.length > bars) other.shift()
        peakOwn = smoothedOwn
        peakOther = smoothedOther
        windowStart += sampleInterval
      }
      paint(own, other, peakOwn, peakOther)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, bars, getLevel, getParticipantLevel, sampleInterval, sensitivity, smoothing])

  const style = {
    '--recorder-bar-width': `${barWidth}px`,
    '--recorder-bar-rise': `${rise}ms`,
    '--recorder-bar-height': `${height}px`,
    '--recorder-participant-height': `${participantHeight}px`,
    '--recorder-dot-size': `${dotSize}px`,
    width: bars * stride - (stride - barWidth),
    height,
  } as CSSProperties

  return (
    <div className="recorder-waveform" style={style} aria-hidden="true">
      <div className="recorder-waveform-track" ref={trackRef}>
        {slots.map((i) => (
          <span key={i} className="recorder-slot">
            {/* Participant first so your own voice draws over it, as in the design. */}
            <span className="recorder-bar recorder-bar-other" style={{ transform: 'scaleY(0)' }} />
            <span className="recorder-bar recorder-bar-own" style={{ transform: 'scaleY(0)' }} />
            <span className="recorder-dot" />
          </span>
        ))}
      </div>
    </div>
  )
}
