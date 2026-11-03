export function previewDimensions(width: number, height: number, columns: number, cellAspect = 2) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error("Image dimensions must be positive and finite.")
  }
  const available = Math.max(1, Math.min(80, Math.floor(Number.isFinite(columns) ? columns : 80)))
  const aspect = width / height * (Number.isFinite(cellAspect) && cellAspect > 0 ? cellAspect : 2)
  const rows = Math.min(12, available / aspect)
  return {
    width: Math.max(1, Math.min(available, Math.round(aspect * rows))),
    height: Math.max(1, Math.round(rows)),
  }
}
