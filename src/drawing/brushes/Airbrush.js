import { BaseBrush } from './BaseBrush.js';

export class Airbrush extends BaseBrush {
  constructor() {
    super('airbrush', {
      spacingRatio: 0.035,
      defaultSize: 72,
      defaultOpacity: 0.45,
      minSize: 8,
      maxSize: 180
    });
  }

  getTipCanvas(color) {
    if (this.tipCache.has(color)) return this.tipCache.get(color);
    const tip = document.createElement('canvas');
    tip.width = tip.height = 128;
    const ctx = tip.getContext('2d');
    // Every radius loses density: no solid disk or abrupt transparent rim.
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 128, 128);
    const pixels = ctx.getImageData(0, 0, 128, 128);
    for (let y = 0; y < 128; y++) {
      for (let x = 0; x < 128; x++) {
        const r = Math.hypot(x - 63.5, y - 63.5) / 64;
        const fade = Math.max(0, 1 - r * r);
        pixels.data[(y * 128 + x) * 4 + 3] = Math.round(255 * Math.exp(-4.5 * r * r) * fade * fade);
      }
    }
    ctx.putImageData(pixels, 0, 0);
    this.tipCache.set(color, tip);
    return tip;
  }

  renderStamp(ctx, x, y, pressure, options) {
    const p = Math.max(0.01, Math.min(1, pressure));
    // Pressure controls paint flow, while the spray cone stays broad and soft.
    const size = options.baseSize * (0.8 + 0.2 * p);
    const flow = options.baseOpacity * (0.15 + 0.85 * p);
    if (flow <= 0 || size <= 0.4) return;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = flow * 0.045;
    ctx.drawImage(this.getTipCanvas(options.color), x - size / 2, y - size / 2, size, size);

    // Fresh droplets per sample, seeded by the stroke engine for exact replay.
    const random = options.random ?? Math.random;
    ctx.fillStyle = options.color;
    ctx.globalAlpha = flow * 0.12;
    const count = Math.max(12, Math.min(64, Math.round(size * 0.35)));
    for (let i = 0; i < count; i++) {
      const distance = Math.sqrt(-2 * Math.log(Math.max(0.000001, random()))) * size * 0.16;
      const angle = random() * Math.PI * 2;
      const droplet = 0.25 + random() * 0.45;
      if (distance > size * 0.55) continue;
      ctx.beginPath();
      ctx.arc(x + Math.cos(angle) * distance, y + Math.sin(angle) * distance, droplet, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
