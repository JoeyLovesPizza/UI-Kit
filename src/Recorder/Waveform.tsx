import { useEffect, useMemo, useRef, type CSSProperties, type RefObject } from 'react'

export interface WaveformProps {
  /** Instantaneous level, 0–1. Read once per animation frame. */
  getLevel: () => number
  /** Number of slots across the strip. */
  bars: number
  barWidth: number
  /** Height of a full-scale bar, in px. */
  height: number
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
  /** Bump whenever `samplesRef` is replaced wholesale, so the strip repaints. */
  revision: number
  /**
   * Every sample of the current take, oldest first. Owned by the parent so it
   * outlives this component and can be cleared as each new take begins.
   */
  samplesRef: RefObject<number[]>
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

/**
 * A row of slots that fills left to right as the take goes on, one slot per
 * `sampleInterval`. An empty slot is a dot; a filled one is a bar. Once every
 * slot is spoken for, the strip shows the most recent stretch of the take.
 *
 * Bars are sized by writing transforms straight to the DOM from one
 * animation-frame loop, so nothing here re-renders while a take is running.
 */
export function Waveform({
  getLevel,
  bars,
  barWidth,
  height,
  dotSize,
  sampleInterval,
  sensitivity,
  smoothing,
  rise,
  active,
  revision,
  samplesRef,
}: WaveformProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const slots = useMemo(() => Array.from({ length: bars }, (_, i) => i), [bars])
  const floor = dotSize / height

  // Paint the samples that already exist whenever the geometry or the sample
  // list changes hands (a fresh take, a resize of the dial), so the strip is
  // never blank while the loop below isn't running.
  useEffect(() => {
    const track = trackRef.current
    if (!track) return
    const elements = Array.from(track.children) as HTMLElement[]
    const samples = samplesRef.current
    const first = Math.max(0, samples.length - bars)
    for (let i = 0; i < elements.length; i++) {
      const value = samples[first + i]
      elements[i].style.transform = `scaleY(${Math.max(floor, value ?? 0).toFixed(3)})`
      elements[i].classList.toggle('is-filled', value != null)
    }
  }, [bars, floor, samplesRef, active, revision])

  useEffect(() => {
    const track = trackRef.current
    if (!track || !active) return
    const elements = Array.from(track.children) as HTMLElement[]
    const samples = samplesRef.current

    let frame = 0
    let smoothed = 0
    let peak = 0
    let windowStart = performance.now()

    const paint = () => {
      // The slot still being filled is drawn live at its loudest moment so
      // far; everything before it is settled.
      const total = samples.length + 1
      const first = Math.max(0, total - bars)
      for (let i = 0; i < elements.length; i++) {
        const index = first + i
        const value = index === samples.length ? peak : samples[index]
        elements[i].style.transform = `scaleY(${Math.max(floor, value ?? 0).toFixed(3)})`
        elements[i].classList.toggle('is-filled', value != null)
      }
    }

    const tick = (now: number) => {
      const raw = clamp(getLevel() * sensitivity, 0, 1)
      smoothed += (raw - smoothed) * (1 - smoothing)
      peak = Math.max(peak, smoothed)
      while (now - windowStart >= sampleInterval) {
        samples.push(peak)
        peak = smoothed
        windowStart += sampleInterval
      }
      paint()
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [active, bars, floor, getLevel, sampleInterval, samplesRef, sensitivity, smoothing])

  const style = {
    '--recorder-bar-width': `${barWidth}px`,
    '--recorder-bar-rise': `${rise}ms`,
    height,
  } as CSSProperties

  return (
    <div className="recorder-waveform" style={style} aria-hidden="true">
      <div className="recorder-waveform-track" ref={trackRef}>
        {slots.map((i) => (
          <span key={i} className="recorder-bar" style={{ transform: `scaleY(${floor.toFixed(3)})` }} />
        ))}
      </div>
    </div>
  )
}
