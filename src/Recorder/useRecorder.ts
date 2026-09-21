import { useCallback, useEffect, useRef, useState } from 'react'

export type RecorderStatus = 'idle' | 'requesting' | 'recording' | 'paused' | 'stopped' | 'error'

export interface Recording {
  blob: Blob
  /** Object URL for `blob` — revoked automatically on `reset` and unmount. */
  url: string
  /** Length of the recording in ms, not counting time spent paused. */
  duration: number
  mimeType: string
}

export interface UseRecorderOptions {
  /**
   * Preferred container/codec, e.g. `'audio/webm;codecs=opus'`. Falls back
   * through a short list of common types when the browser can't do this one.
   */
  mimeType?: string
  /** Stop on its own once the recording reaches this length, in ms. */
  maxDuration?: number
  /** Called with the finished recording as soon as `stop` resolves. */
  onStop?: (recording: Recording) => void
}

export interface UseRecorderReturn {
  status: RecorderStatus
  /** Recorded time so far in ms, excluding pauses. Updates ~10×/s while recording. */
  elapsed: number
  /** The finished recording, once `status` is `'stopped'`. */
  recording: Recording | null
  /** Why `status` is `'error'` — a permission denial, no microphone, unsupported browser. */
  error: string | null
  /** Ask for the microphone and begin recording. */
  start: () => Promise<void>
  /** Hold the take. The clock stops and the microphone stays open. */
  pause: () => void
  /** Carry on after `pause`. */
  resume: () => void
  /** Finish and produce `recording`. */
  stop: () => void
  /** Throw the current take away and return to `'idle'`. */
  cancel: () => void
  /** Discard a finished recording and return to `'idle'`. */
  reset: () => void
  /**
   * Instantaneous microphone level, 0–1 (RMS of the current audio frame).
   * Read it from an animation-frame loop — it costs no re-render.
   */
  getLevel: () => number
}

const MIME_FALLBACKS = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']

function pickMimeType(preferred?: string): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined
  const candidates = preferred ? [preferred, ...MIME_FALLBACKS] : MIME_FALLBACKS
  return candidates.find((type) => MediaRecorder.isTypeSupported(type))
}

function describeError(err: unknown): string {
  if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return 'Recording is not supported in this browser'
  }
  const name = err instanceof Error ? err.name : ''
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Microphone access was blocked'
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No microphone was found'
    case 'NotReadableError':
      return 'The microphone is in use by another app'
    default:
      return err instanceof Error && err.message ? err.message : 'Could not start recording'
  }
}

/**
 * Microphone capture for the `Recorder` widget — or for a widget of your own.
 *
 * Owns the `getUserMedia` stream, a `MediaRecorder` for the file, and an
 * `AnalyserNode` for the live level. Everything is torn down on `cancel`,
 * `reset`, and unmount, so the browser's recording indicator goes away as
 * soon as the take does.
 */
export function useRecorder(options: UseRecorderOptions = {}): UseRecorderReturn {
  const { mimeType, maxDuration, onStop } = options

  const [status, setStatus] = useState<RecorderStatus>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [recording, setRecording] = useState<Recording | null>(null)
  const [error, setError] = useState<string | null>(null)

  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const contextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const samplesRef = useRef<Float32Array<ArrayBuffer> | null>(null)
  const chunksRef = useRef<Blob[]>([])
  // The clock: recorded time banked before the current run, plus when the
  // current run began (0 while paused).
  const bankedRef = useRef(0)
  const runStartedAtRef = useRef(0)
  const tickRef = useRef<number | null>(null)
  // Whether the take that's finishing should be kept. `cancel` flips this so
  // the recorder's final `stop` event knows to drop its data.
  const keepRef = useRef(true)
  const onStopRef = useRef(onStop)
  onStopRef.current = onStop
  const recordingRef = useRef<Recording | null>(null)

  const recordedTime = useCallback(() => {
    const running = runStartedAtRef.current ? performance.now() - runStartedAtRef.current : 0
    return bankedRef.current + running
  }, [])

  const stopClock = useCallback(() => {
    if (tickRef.current != null) {
      window.clearInterval(tickRef.current)
      tickRef.current = null
    }
  }, [])

  const releaseHardware = useCallback(() => {
    stopClock()
    recorderRef.current = null
    analyserRef.current = null
    samplesRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    void contextRef.current?.close().catch(() => {})
    contextRef.current = null
  }, [stopClock])

  const releaseRecording = useCallback(() => {
    if (recordingRef.current) URL.revokeObjectURL(recordingRef.current.url)
    recordingRef.current = null
    setRecording(null)
  }, [])

  const getLevel = useCallback(() => {
    const analyser = analyserRef.current
    const samples = samplesRef.current
    if (!analyser || !samples) return 0
    analyser.getFloatTimeDomainData(samples)
    let sum = 0
    for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i]
    return Math.min(1, Math.sqrt(sum / samples.length))
  }, [])

  const stop = useCallback(() => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state === 'inactive') return
    keepRef.current = true
    recorder.stop()
  }, [])

  const startClock = useCallback(() => {
    runStartedAtRef.current = performance.now()
    stopClock()
    tickRef.current = window.setInterval(() => {
      const now = recordedTime()
      setElapsed(now)
      if (maxDuration != null && now >= maxDuration) stop()
    }, 100)
  }, [maxDuration, recordedTime, stop, stopClock])

  const pause = useCallback(() => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state !== 'recording') return
    recorder.pause()
    bankedRef.current = recordedTime()
    runStartedAtRef.current = 0
    stopClock()
    setElapsed(bankedRef.current)
    setStatus('paused')
  }, [recordedTime, stopClock])

  const resume = useCallback(() => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state !== 'paused') return
    recorder.resume()
    startClock()
    setStatus('recording')
  }, [startClock])

  const cancel = useCallback(() => {
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      keepRef.current = false
      recorder.stop()
    } else {
      releaseHardware()
    }
    releaseRecording()
    bankedRef.current = 0
    runStartedAtRef.current = 0
    setElapsed(0)
    setError(null)
    setStatus('idle')
  }, [releaseHardware, releaseRecording])

  const reset = useCallback(() => {
    releaseHardware()
    releaseRecording()
    bankedRef.current = 0
    runStartedAtRef.current = 0
    setElapsed(0)
    setError(null)
    setStatus('idle')
  }, [releaseHardware, releaseRecording])

  const start = useCallback(async () => {
    if (recorderRef.current) return
    releaseRecording()
    setError(null)
    setElapsed(0)
    bankedRef.current = 0
    runStartedAtRef.current = 0
    setStatus('requesting')

    let stream: MediaStream
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        throw new Error('unsupported')
      }
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (err) {
      setError(describeError(err))
      setStatus('error')
      return
    }

    streamRef.current = stream
    const context = new AudioContext()
    contextRef.current = context
    const analyser = context.createAnalyser()
    // Small window so the level tracks syllables rather than smearing over
    // them — 1024 samples is ~21ms at 48kHz.
    analyser.fftSize = 1024
    analyser.smoothingTimeConstant = 0
    context.createMediaStreamSource(stream).connect(analyser)
    analyserRef.current = analyser
    samplesRef.current = new Float32Array(analyser.fftSize)

    const type = pickMimeType(mimeType)
    const recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined)
    recorderRef.current = recorder
    chunksRef.current = []
    keepRef.current = true

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data)
    }
    recorder.onerror = () => {
      releaseHardware()
      setError('Recording failed')
      setStatus('error')
    }
    recorder.onstop = () => {
      const duration = recordedTime()
      const keep = keepRef.current
      const chunks = chunksRef.current
      chunksRef.current = []
      bankedRef.current = duration
      runStartedAtRef.current = 0
      releaseHardware()
      if (!keep) return
      const blob = new Blob(chunks, { type: recorder.mimeType || type || 'audio/webm' })
      const next: Recording = {
        blob,
        url: URL.createObjectURL(blob),
        duration,
        mimeType: blob.type,
      }
      recordingRef.current = next
      setRecording(next)
      setElapsed(duration)
      setStatus('stopped')
      onStopRef.current?.(next)
    }

    // Timeslice so a crash mid-take still leaves most of the audio behind.
    recorder.start(250)
    startClock()
    setStatus('recording')
  }, [mimeType, recordedTime, releaseHardware, releaseRecording, startClock])

  useEffect(() => {
    return () => {
      const recorder = recorderRef.current
      if (recorder && recorder.state !== 'inactive') {
        keepRef.current = false
        recorder.stop()
      }
      releaseHardware()
      if (recordingRef.current) URL.revokeObjectURL(recordingRef.current.url)
    }
  }, [releaseHardware])

  return { status, elapsed, recording, error, start, pause, resume, stop, cancel, reset, getLevel }
}
