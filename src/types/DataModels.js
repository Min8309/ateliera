/**
 * @file DataModels.js
 * @description Ateliera 규격화된 드로잉 데이터 모델 정의 (JSDoc 규격 준수)
 */

/**
 * 단일 입력 좌표 포인트 모델
 * @typedef {Object} Point
 * @property {number} x - 캔버스 2D X 좌표 (0 ~ width)
 * @property {number} y - 캔버스 2D Y 좌표 (0 ~ height)
 * @property {number} pressure - 정규화된 필압 (0.0 ~ 1.0)
 * @property {number} time - 입력 수신 타임스탬프 (performance.now() ms)
 * @property {number} [tiltX] - 스타일러스 X축 기울기 (-90 ~ 90)
 * @property {number} [tiltY] - 스타일러스 Y축 기울기 (-90 ~ 90)
 */

/**
 * 단일 스트로크(붓질 획) 모델
 * @typedef {Object} Stroke
 * @property {string} id - 고유 스트로크 UUID
 * @property {'pen'|'pencil'|'paint'|'charcoal'|'watercolor'|'airbrush'|'volume'|'eraser'} tool - 드로잉 도구 종류
 * @property {string} color - 브러시 색상 (#RRGGBB 또는 rgba)
 * @property {number} size - 브러시 기본 지름 (픽셀)
 * @property {number} opacity - 기본 불투명도 (0.0 ~ 1.0)
 * @property {boolean} neon - 네온 발광 여부 (3D 브러시)
 * @property {number} depth - 3D 획의 돌출 높이 (캔버스 픽셀 단위)
 * @property {Point[]} points - 연속된 coalesced 포인트 배열
 */

/**
 * 전체 작품 데이터 모델
 * @typedef {Object} Artwork
 * @property {string} id - 작품 고유 ID
 * @property {number} width - 캔버스 해상도 너비
 * @property {number} height - 캔버스 해상도 높이
 * @property {Stroke[]} strokes - 누적된 전체 스트로크 배열
 * @property {string} createdAt - 작품 생성 ISO 일시
 */

/**
 * 새 Point 객체 생성 팩토리
 * @param {number} x
 * @param {number} y
 * @param {number} pressure
 * @param {number} time
 * @param {number} [tiltX=0]
 * @param {number} [tiltY=0]
 * @returns {Point}
 */
export function createPoint(x, y, pressure = 0.5, time = performance.now(), tiltX = 0, tiltY = 0) {
  return {
    x: Number(x.toFixed(2)),
    y: Number(y.toFixed(2)),
    pressure: Number(Math.max(0.01, Math.min(1.0, pressure)).toFixed(3)),
    time: Number(time.toFixed(2)),
    tiltX: Number(tiltX.toFixed(1)),
    tiltY: Number(tiltY.toFixed(1))
  };
}

/**
 * 새 Stroke 객체 생성 팩토리
 * @param {Object} options
 * @param {'pen'|'pencil'|'paint'|'charcoal'|'watercolor'|'airbrush'|'volume'|'eraser'} [options.tool='watercolor']
 * @param {string} [options.color='#1B3B6F']
 * @param {number} [options.size=32]
 * @param {number} [options.opacity=0.12]
 * @returns {Stroke}
 */
export function createStroke({ tool = 'watercolor', color = '#1B3B6F', size = 32, opacity = 0.12, neon = false, depth = 40 } = {}) {
  return {
    id: `stroke_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    tool,
    color,
    size,
    opacity,
    neon,
    depth,
    points: []
  };
}

/**
 * 새 Artwork 객체 생성 팩토리
 * @param {number} width
 * @param {number} height
 * @returns {Artwork}
 */
export function createArtwork(width = 2048, height = 2048) {
  return {
    id: `art_${Date.now()}`,
    width,
    height,
    strokes: [],
    createdAt: new Date().toISOString()
  };
}
