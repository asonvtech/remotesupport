export function interpolatePointer(displayed: { x: number; y: number } | null, target: { x: number; y: number }, alpha = 0.22) {
  if (!displayed) return { x: target.x, y: target.y };
  return {
    x: displayed.x + (target.x - displayed.x) * alpha,
    y: displayed.y + (target.y - displayed.y) * alpha,
  };
}

export function isValidPointer(p: any): p is { x: number; y: number } {
  return p && typeof p.x === 'number' && typeof p.y === 'number' && isFinite(p.x) && isFinite(p.y);
}
