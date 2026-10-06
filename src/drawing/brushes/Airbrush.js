/**
 * @file Airbrush.js
 * @description ④ 에어브러시 (Airbrush) - 밴딩 없는 가우시안 래디얼 그라데이션, 초밀도 스프레이 분사
 */

import { BaseBrush } from './BaseBrush.js';

export class Airbrush extends BaseBrush {
  constructor() {
    super('airbrush', {
      spacingRatio: 0.06, // 무밴딩 그라데이션을 위한 초밀도 스탬핑 간격
      defaultSize: 52,
      defaultOpacity: 0.18,
      minSize: 8,
      maxSize: 120
    });
  }

  /**
   * 완만한 2D 가우시안 감쇄 팁 사전 생성
   * @param {string} color
   * @returns {HTMLCanvasElement}
   */
  getTipCanvas(color) {
    if (this.tipCache.has(color)) {
      return this.tipCache.get(color);
    }

    const tipCanvas = document.createElement('canvas');
    const radius = 64;
    tipCanvas.width = radius * 2;
    tipCanvas.height = radius * 2;
    const ctx = tipCanvas.getContext('2d');

    // 순수 가우시안 형태의 부드러운 방사형 감쇄
    const grad = ctx.createRadialGradient(radius, radius, 0, radius, radius, radius);
    grad.addColorStop(0, color);
    grad.addColorStop(0.2, color);
    grad.addColorStop(0.5, color);
    grad.addColorStop(0.78, 'transparent');
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
   * 필압에 따라 분사 압력(투명도)과 분사 반경 동시 조절
   */
  renderStamp(ctx, x, y, pressure, options) {
    const p = Math.max(0.01, Math.min(1.0, pressure));
    // 필압에 따른 반경 및 분사 압력(누적 속도)
    const size = options.baseSize * (0.35 + p * 0.75);
    const alpha = options.baseOpacity * (0.15 + p * 0.85) * 0.35; // 초밀도 스탬핑이므로 스탬프당 알파를 곱해 부드럽게 누적
    const radius = size / 2;
    if (radius <= 0.2) return;

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = alpha;

    const tip = this.getTipCanvas(options.color);
    ctx.drawImage(tip, x - radius, y - radius, size, size);

    ctx.restore();
  }
}
