import { DryMediaBrush } from './DryMediaBrush.js';

export class CharcoalBrush extends DryMediaBrush {
  constructor() {
    super('charcoal', { spacingRatio: 0.12, defaultSize: 42, defaultOpacity: 0.65, minSize: 4, maxSize: 120 });
  }
}
