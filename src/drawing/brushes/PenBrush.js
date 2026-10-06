/**
 * @file PenBrush.js
 * @description ① 기본 펜 (Default Pen) - 경계가 또렷하고 매끄러운 하드 에지 잉크 펜
 */

import { BaseBrush } from './BaseBrush.js';

export class PenBrush extends BaseBrush {
  constructor() {
    super('pen', {
      spacingRatio: 0.12,
      defaultSize: 18,
      defaultOpacity: 1.0,
      minSize: 1,
      maxSize: 60
    });
  }

  /**
   * 앤티앨리어싱이 적용된 하드 원형 팁 사전 생성
   * @param {string} color
   * @returns {HTMLCanvasElement}
   */
  getTipCanvas(color) {
    if (this.tipCache.has(color)) {
      return this.tipCache.get(color);
    }

    const tipCanvas = document.createElement('canvas');
    const radius = 32;
    tipCanvas.width = radius * 2;
    tipCanvas.height = radius * 2;
    const ctx = tipCanvas.getContext('2d');

    // 앤티앨리어싱을 위한 미세한 가장자리 페이드
    const grad = ctx.createRadialGradient(radius, radius, radius - 1.5, radius, radius, radius);
    grad.addColorStop(0, color);
    grad.addColorStop(0.85, color);
    grad.addColorStop(1, 'transparent');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(radius, radius, radius, 0, Math.PI * 2);
    ctx.fill();

    this.tipCache.set(color, tipCanvas);
    return tipCanvas;
  }

  /**
   * 스탬프 렌더링
   * 필압에 따라 굵기만 정직하게 선형 비례 변화 (size = baseSize * pressure)
   * 불투명도는 1.0 유지
   */
  renderStamp(ctx, x, y, pressure, options) {
    const p = Math.max(0.08, Math.min(1.0, pressure));
    const size = options.baseSize * p;
    const radius = size / 2;
    if (radius <= 0.2) return;

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = options.baseOpacity;

    const tip = this.getTipCanvas(options.color);
    ctx.drawImage(tip, x - radius, y - radius, size, size);

    ctx.restore();
  }
}
