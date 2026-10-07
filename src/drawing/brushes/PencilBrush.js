import { DryMediaBrush } from './DryMediaBrush.js';

export class PencilBrush extends DryMediaBrush {
  constructor() {
    super('pencil', { spacingRatio: 0.18, defaultSize: 7, defaultOpacity: 0.7, minSize: 1, maxSize: 60 });
  }
}
