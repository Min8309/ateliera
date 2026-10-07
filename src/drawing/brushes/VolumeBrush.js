import { BaseBrush } from './BaseBrush.js';

// 실제 획은 VolumeStrokeRenderer가 Three.js 메시로 그립니다.
export class VolumeBrush extends BaseBrush {
  constructor() {
    super('volume', { defaultSize: 64, defaultOpacity: 1, minSize: 8, maxSize: 160, spacingRatio: .1 });
  }

  renderStamp() {}
}
