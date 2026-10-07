import { BaseBrush } from './BaseBrush.js';

export class PaintBrush extends BaseBrush {
  constructor() {
    super('paint', { spacingRatio: 0.12, defaultSize: 48, defaultOpacity: 0.9, minSize: 3, maxSize: 140 });
  }

  getTipCanvas(color) {
    if (this.tipCache.has(color)) return this.tipCache.get(color);
    const tip = document.createElement('canvas');
    tip.width = tip.height = 128;
    const ctx = tip.getContext('2d');
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(64, 64, 56, 42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.clip();
    // Parallel ridges mimic loaded bristles and light across thick pigment.
    for (let y = 23; y < 106; y += 4) {
      ctx.fillStyle = y % 8 === 7 ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.13)';
      ctx.fillRect(8, y, 112, 1);
    }
    this.tipCache.set(color, tip);
    return tip;
  }

  renderStamp(ctx, x, y, pressure, options) {
    const p = Math.max(0.05, Math.min(1, pressure));
    const size = options.baseSize * (0.4 + 0.6 * p);
    ctx.save();
    ctx.globalAlpha = options.baseOpacity * (0.65 + 0.35 * p);
    ctx.globalCompositeOperation = 'source-over';
    ctx.translate(x, y);
    ctx.rotate(Math.atan2(options.tiltY || 0, options.tiltX || 0));
    ctx.drawImage(this.getTipCanvas(options.color), -size / 2, -size / 2, size, size);
    ctx.restore();
  }
}
