/**
 * @file BaseBrush.js
 * @description 브러시 전략 패턴(Strategy Pattern)의 기본 베이스 클래스
 */

export class BaseBrush {
  /**
   * @param {string} name - 브러시 식별자
   * @param {Object} options
   * @param {number} [options.spacingRatio=0.15] - 스탬프 간격 비율
   * @param {number} [options.defaultSize=32] - 기본 추천 브러시 지름
   * @param {number} [options.defaultOpacity=1.0] - 기본 추천 불투명도
   * @param {number} [options.minSize=1]
   * @param {number} [options.maxSize=100]
   */
  constructor(name, options = {}) {
    this.name = name;
    this.spacingRatio = options.spacingRatio ?? 0.15;
    this.defaultSize = options.defaultSize ?? 32;
    this.defaultOpacity = options.defaultOpacity ?? 1.0;
    this.minSize = options.minSize ?? 1;
    this.maxSize = options.maxSize ?? 100;

    // 브러시 팁 오프스크린 캔버스 캐시 (색상/크기별 재사용)
    this.tipCache = new Map();
  }

  /**
   * 브러시 팁 사전 생성 및 캐시 반환
   * @param {string} color
   * @param {number} size
   * @returns {HTMLCanvasElement}
   */
  getTipCanvas(color, size) {
    throw new Error('getTipCanvas는 하위 클래스에서 구현해야 합니다.');
  }

  /**
   * 단일 스탬프 렌더링
   * @param {CanvasRenderingContext2D} ctx - 대상 캔버스 2D 컨텍스트
   * @param {number} x - 캔버스 X 좌표
   * @param {number} y - 캔버스 Y 좌표
   * @param {number} pressure - 필압 (0.0 ~ 1.0)
   * @param {Object} options - { color, baseSize, baseOpacity, tiltX, tiltY }
   */
  renderStamp(ctx, x, y, pressure, options) {
    throw new Error('renderStamp는 하위 클래스에서 구현해야 합니다.');
  }

  /**
   * 캐시 초기화
   */
  clearCache() {
    this.tipCache.clear();
  }
}
