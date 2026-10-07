export const CANVAS_PRESETS = Object.freeze({
  square: { label: '정사각형', width: 2048, height: 2048 },
  landscape: { label: '가로형', width: 2560, height: 1440 },
  portrait: { label: '세로형', width: 1440, height: 2560 },
  compact: { label: '작은 정사각형', width: 1024, height: 1024 }
});

export function canvasWorldSize(width, height) {
  const scale = 2 / Math.max(width, height);
  return { width: width * scale, height: height * scale };
}

// 화면 비율이 바뀌어도 그림을 늘이거나 잘라내지 않고 중앙에 맞춥니다.
export function fitStrokes(strokes, from, to) {
  const scale = Math.min(to.width / from.width, to.height / from.height);
  const offsetX = (to.width - from.width * scale) / 2;
  const offsetY = (to.height - from.height * scale) / 2;
  return strokes.map(stroke => ({
    ...stroke,
    size: stroke.size * scale,
    ...(stroke.depth === undefined ? {} : { depth: stroke.depth * scale }),
    points: stroke.points.map(point => ({
      ...point,
      x: point.x * scale + offsetX,
      y: point.y * scale + offsetY
    }))
  }));
}
