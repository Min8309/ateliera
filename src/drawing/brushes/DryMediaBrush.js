import { BaseBrush } from './BaseBrush.js';

// Fixed paper coordinates keep the grain visible even where adjacent stamps overlap.
export class DryMediaBrush extends BaseBrush {
  constructor(name, options) {
    super(name, options);
  }

  getTipCanvas(color) {
    if (this.tipCache.has(color)) return this.tipCache.get(color);
    const tile = document.createElement('canvas');
    tile.width = tile.height = 128;
    const ctx = tile.getContext('2d');
    let seed = 613;
    const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    const charcoal = this.name === 'charcoal';
    ctx.fillStyle = color;
    for (let y = 0; y < 128; y += charcoal ? 2 : 1) {
      for (let x = 0; x < 128; x += charcoal ? 2 : 1) {
        const grain = random();
        if (grain < (charcoal ? 0.42 : 0.22)) continue;
        ctx.globalAlpha = 0.25 + grain * 0.75;
        ctx.fillRect(x, y, charcoal ? 1 + random() * 1.7 : 1, charcoal ? 1 + random() * 1.7 : 1);
      }
    }
    this.tipCache.set(color, tile);
    return tile;
  }

  renderStamp(ctx, x, y, pressure, options) {
    const p = Math.max(0.05, Math.min(1, pressure));
    const charcoal = this.name === 'charcoal';
    const radius = options.baseSize * (charcoal ? 0.3 + 0.3 * p : 0.15 + 0.35 * p);
    const tilt = Math.min(1, Math.hypot(options.tiltX || 0, options.tiltY || 0) / 70);
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = options.baseOpacity * Math.pow(p, charcoal ? 0.65 : 1.1);
    ctx.fillStyle = ctx.createPattern(this.getTipCanvas(options.color), 'repeat');
    ctx.beginPath();
    ctx.ellipse(x, y, radius * (1 + tilt), radius * (charcoal ? 0.65 : 1) / (1 + tilt), Math.atan2(options.tiltY || 0, options.tiltX || 0), 0, Math.PI * 2);
    ctx.fill();
    if (charcoal) {
      // A light dusty skirt surrounds the dense, broken charcoal core.
      ctx.globalAlpha *= 0.12;
      ctx.beginPath();
      ctx.ellipse(x, y, radius * 1.25, radius * 0.9, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
