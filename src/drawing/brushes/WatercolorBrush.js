/**
 * @file WatercolorBrush.js
 * @description ③ 수채 브러시 (Watercolor) - 투명도 누적 겹침(Glazing), Water Edge(림 에지 번짐), 안료 확산
 */

import { BaseBrush } from './BaseBrush.js';

export class WatercolorBrush extends BaseBrush {
  constructor() {
    super('watercolor', {
      spacingRatio: 0.15,
      defaultSize: 36,
      defaultOpacity: 0.12,
      minSize: 4,
      maxSize: 100
    });
  }

  /**
   * Water Edge (테두리가 짙어지는 링) 수채화 팁 사전 생성
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

    // 수채화 특유의 Water Edge 그라데이션: 중심부는 맑고 가장자리(0.75~0.92)가 짙어지다 부드럽게 페이드아웃
    const grad = ctx.createRadialGradient(radius, radius, 0, radius, radius, radius);
    const rgba = (alpha) => {
      const hex = color.replace('#', '');
      const value = parseInt(hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex, 16);
      return `rgba(${value >> 16 & 255},${value >> 8 & 255},${value & 255},${alpha})`;
    };
    grad.addColorStop(0, rgba(0.28));
    grad.addColorStop(0.65, rgba(0.38));
    grad.addColorStop(0.88, rgba(0.85));   // 테두리 안료 응집(Water Edge)
    grad.addColorStop(0.96, rgba(0.4));
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
   * 필압 지름: baseSize * P^1.2
   * 필압 알파: baseOpacity * P
   */
  renderStamp(ctx, x, y, pressure, options) {
    const p = Math.max(0.01, Math.min(1.0, pressure));
    const size = options.baseSize * Math.max(0.15, Math.pow(p, 1.2));
    const alpha = options.baseOpacity * Math.max(0.2, p);
    const radius = size / 2;
    if (radius <= 0.2) return;

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = alpha;

    const tip = this.getTipCanvas(options.color);
    ctx.drawImage(tip, x - radius, y - radius, size, size);

    // 가장자리 미세 안료 번짐(Bleed Particles)
    const particleCount = Math.floor(radius * 0.28);
    ctx.fillStyle = options.color;

    for (let i = 0; i < particleCount; i++) {
      const angle = (options.random ?? Math.random)() * Math.PI * 2;
      const r = radius * (0.35 + (options.random ?? Math.random)() * 0.65);
      const px = x + Math.cos(angle) * r;
      const py = y + Math.sin(angle) * r;
      const pSize = 0.6 + (options.random ?? Math.random)() * 1.4;

      ctx.globalAlpha = alpha * (0.2 + (options.random ?? Math.random)() * 0.35);
      ctx.beginPath();
      ctx.arc(px, py, pSize, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}
