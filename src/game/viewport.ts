/** Keep one coordinate system for rendering, movement and circular collisions. */
export function measureViewport(width: number, height: number, pixelRatio = 1) {
  const scale = Math.min(1, width / 600, height / 400);
  return {
    width,
    height,
    worldWidth: width / scale,
    worldHeight: height / scale,
    scale,
    // Cap both DPR and backing-buffer area (about 4 million pixels).
    resolution: Math.min(pixelRatio || 1, 2, Math.sqrt(4_000_000 / (width * height))),
  };
}
