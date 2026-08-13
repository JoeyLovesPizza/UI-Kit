import { useMemo } from 'react'
import type { DialConfig, ResolvedValues } from 'dialkit'

/**
 * Identity at runtime. Its only job is the `T extends DialConfig` parameter:
 * that constraint is what makes TypeScript read `[340, 220, 560]` as a slider
 * tuple rather than as `number[]`, so the resolved value comes back as a
 * `number`. It's the same inference `useDialKit` itself relies on — moving a
 * config out of the hook call and into its own function would otherwise lose
 * it.
 */
export function dialConfig<T extends DialConfig>(config: T): T {
  return config
}

function resolveControl(control: unknown): unknown {
  // Slider tuple: [initial, min, max, step?].
  if (Array.isArray(control)) return control[0]
  // A bare number, boolean or string is its own starting value.
  if (control === null || typeof control !== 'object') return control

  const record = control as Record<string, unknown>
  if (typeof record.type === 'string') {
    if (record.type === 'select') {
      if (typeof record.default === 'string') return record.default
      const first = (record.options as (string | { value: string })[] | undefined)?.[0]
      if (first === undefined) return ''
      return typeof first === 'string' ? first : first.value
    }
    if (record.type === 'color') return record.default ?? '#000000'
    if (record.type === 'text') return record.default ?? ''
    // Springs, easings and actions resolve to themselves — the panel hands
    // these back whole rather than reducing them to a single value.
    return control
  }

  return resolveGroup(record as DialConfig)
}

function resolveGroup(config: DialConfig): Record<string, unknown> {
  const values: Record<string, unknown> = {}
  for (const [key, control] of Object.entries(config)) {
    // Panel bookkeeping (a folder's collapsed state), not a value.
    if (key === '_collapsed') continue
    values[key] = resolveControl(control)
  }
  return values
}

/**
 * What a DialKit config resolves to before anything is dragged — exactly what
 * the panel hands back on its first render.
 *
 * This is the `dials={false}` half of a dialled component. Both halves read the
 * same config, so a component with its panel switched off starts precisely
 * where the panel would have started it, and switching the panel back on
 * changes nothing until a control is actually moved.
 */
export function resolveDials<T extends DialConfig>(config: T): ResolvedValues<T> {
  return resolveGroup(config) as ResolvedValues<T>
}

/**
 * `resolveDials`, memoized against the config's own contents so the object
 * keeps its identity across renders the way `useDialKit`'s does. The
 * transitions inside it flow into `useCallback` deps downstream, which would
 * otherwise be rebuilt on every render.
 */
export function useFixedDials<T extends DialConfig>(config: T): ResolvedValues<T> {
  // Keyed on the serialized config, not the object: callers rebuild the config
  // literal on every render, so its identity is never stable.
  const serialized = JSON.stringify(config)
  return useMemo(() => resolveDials(config), [serialized])
}
