export interface Point {
  x: number
  y: number
}

export type Triangle = [Point, Point, Point]

export type MenuSide = 'right' | 'left'

/**
 * The wedge between where the pointer left the root panel and the near edge of
 * the open submenu. While the pointer stays inside it the submenu is held open,
 * so a diagonal move toward the submenu doesn't close it just because the
 * cursor drifted off the trigger row on the way there.
 */
export function buildSafeTriangle(
  from: Point,
  submenu: DOMRect,
  side: MenuSide,
  buffer: number
): Triangle {
  const edgeX = side === 'right' ? submenu.left : submenu.right
  // Nudging the apex back past the edge the pointer just crossed keeps the
  // first frame or two of the move inside the wedge — without it, a fast
  // diagonal can register its next sample already outside.
  const apexX = side === 'right' ? from.x - buffer : from.x + buffer
  return [
    { x: apexX, y: from.y },
    { x: edgeX, y: submenu.top - buffer },
    { x: edgeX, y: submenu.bottom + buffer },
  ]
}

function cross(a: Point, b: Point, p: Point): number {
  return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)
}

export function pointInTriangle(p: Point, [a, b, c]: Triangle): boolean {
  const d1 = cross(a, b, p)
  const d2 = cross(b, c, p)
  const d3 = cross(c, a, p)
  // Consistent sign on all three edges means the point is on the same side of
  // each — zeros (exactly on an edge) count as inside.
  const hasNegative = d1 < 0 || d2 < 0 || d3 < 0
  const hasPositive = d1 > 0 || d2 > 0 || d3 > 0
  return !(hasNegative && hasPositive)
}

export function pointInRect(p: Point, rect: DOMRect, buffer = 0): boolean {
  return (
    p.x >= rect.left - buffer &&
    p.x <= rect.right + buffer &&
    p.y >= rect.top - buffer &&
    p.y <= rect.bottom + buffer
  )
}
