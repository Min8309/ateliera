/**
 * @file PencilBrush.js
 * @description ② 연필 / 목탄 (Pencil & Charcoal) - 종이 요철 텍스처, 필압별 흑연 입자 분산, 틸트 기울기 반응
 */

import { BaseBrush } from './BaseBrush.js';

export class PencilBrush extends BaseBrush {
  constructor() {
    super('pencil', {
      spacingRatio: 0.18,
      defaultSize: 24,
      defaultOpacity: 0.75,
      minSize: 1,
      maxSize: 80
    });

    // 흑연 입자 노이즈 패턴 마스크 사전 생성
    this.grainMask = this.createGrainPattern();
  }

  /**
   * 종이 요철(Tooth/Grain) 절차적 노이즈 패턴 마스크 생성
   */
  createGrainPattern() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.createImageData(128, 128);

    for (let i = 0; i < imgData.data.length; i += 4) {
      // 거친 흑연 가루 분포를 모사하는 임계값 노이즈
      const rand = Math.random();
      const density = rand > 0.65 ? Math.floor(rand * 255) : 0;
      imgData.data[i] = 0;
      imgData.data[i + 1] = 0;
      imgData.data[i + 2] = 0;
      imgData.data[i + 3] = density;
    }

    ctx.putImageData(imgData, 0, 0);
    return canvas;
  }

  /**
   * 연필 브러시 팁 사전 생성
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

    // 기본 형태: 노이즈 마스크 합성
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(radius, radius, radius - 1, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalCompositeOperation = 'destination-out';
    const pattern = ctx.createPattern(this.grainMask, 'repeat');
    if (pattern) {
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, tipCanvas.width, tipCanvas.height);
    }

    this.tipCache.set(color, tipCanvas);
    return tipCanvas;
  }

  /**
   * 스탬프 렌더링
   * 필압: 낮은 필압(성긴 입자) ↔ 높은 필압(빽빽한 흑연)
   * 틸트(tiltX, tiltY): 스타일러스 기울기 감지 시 타원형으로 눕혀 목탄을 눕혀 칠하는 효과 적용
   */
  renderStamp(ctx, x, y, pressure, options) {
    const p = Math.max(0.05, Math.min(1.0, pressure));
    const baseSize = options.baseSize;
    const size = baseSize * (0.4 + p * 0.7);
    const radius = size / 2;
    if (radius <= 0.2) return;

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';

    // 필압에 따른 흑연 농도 (지수적 반응)
    ctx.globalAlpha = Math.min(1.0, options.baseOpacity * Math.pow(p, 0.7));

    // 스타일러스 틸트(기울기) 감지 시 회전 및 타원형 변형
    const tiltX = options.tiltX || 0;
    const tiltY = options.tiltY || 0;
    const tiltMag = Math.hypot(tiltX, tiltY);

    ctx.translate(x, y);

    if (tiltMag > 5) {
      // 각도 계산 및 타원형 스케일 (목탄 눕혀 쓰기 효과)
      const angle = Math.atan2(tiltY, tiltX);
      ctx.rotate(angle);
      const scaleFactor = 1.0 + Math.min(1.8, (tiltMag / 45) * 1.5);
      ctx.scale(scaleFactor, Math.max(0.45, 1.0 / scaleFactor));
    }

    const tip = this.getTipCanvas(options.color);
    ctx.drawImage(tip, -radius, -radius, size, size);

    // 높은 필압일 때 추가 흑연 가루 입자 산포
    if (p > 0.4) {
      const extraParticles = Math.floor(radius * 0.4 * p);
      ctx.fillStyle = options.color;
      ctx.globalAlpha = options.baseOpacity * 0.35 * p;

      for (let i = 0; i < extraParticles; i++) {
        const dist = Math.random() * radius * 0.9;
        const ang = Math.random() * Math.PI * 2;
        const px = Math.cos(ang) * dist;
        const py = Math.sin(ang) * dist;
        ctx.beginPath();
        ctx.arc(px, py, 0.75, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }
}
