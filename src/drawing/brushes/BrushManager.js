/**
 * @file BrushManager.js
 * @description 브러시 전략 패턴(Strategy Pattern) 매니저
 * 재료별 브러시 및 지우개(Eraser)의 렌더링 파이프라인 관리
 */

import { PenBrush } from './PenBrush.js';
import { PencilBrush } from './PencilBrush.js';
import { WatercolorBrush } from './WatercolorBrush.js';
import { Airbrush } from './Airbrush.js';
import { PaintBrush } from './PaintBrush.js';
import { CharcoalBrush } from './CharcoalBrush.js';
import { VolumeBrush } from './VolumeBrush.js';

export class BrushManager {
  constructor() {
    // 재료별 브러시 전략 인스턴스 등록
    this.brushes = {
      pen: new PenBrush(),
      pencil: new PencilBrush(),
      paint: new PaintBrush(),
      charcoal: new CharcoalBrush(),
      watercolor: new WatercolorBrush(),
      airbrush: new Airbrush(),
      volume: new VolumeBrush()
    };

    // 현재 활성화된 도구 ('pen' | 'pencil' | 'watercolor' | 'airbrush' | 'eraser')
    this.currentTool = 'watercolor';
    this.activeBrush = this.brushes.watercolor;
  }

  /**
   * 브러시 도구 전환
   * @param {string} toolName - 'pen' | 'pencil' | 'watercolor' | 'airbrush' | 'eraser'
   * @returns {{ tool: string, defaultSize: number, defaultOpacity: number, minSize: number, maxSize: number }}
   */
  setTool(toolName) {
    this.currentTool = toolName === 'eraser' || this.brushes[toolName] ? toolName : 'watercolor';

    if (toolName === 'eraser') {
      return {
        tool: 'eraser',
        defaultSize: 36,
        defaultOpacity: 1.0,
        minSize: 4,
        maxSize: 120
      };
    }

    const brush = this.brushes[toolName] || this.brushes.watercolor;
    this.activeBrush = brush;

    return {
      tool: brush.name,
      defaultSize: brush.defaultSize,
      defaultOpacity: brush.defaultOpacity,
      minSize: brush.minSize,
      maxSize: brush.maxSize
    };
  }

  /**
   * 특정 도구의 스탬프 간격 비율 반환
   * @param {string} [toolName]
   * @returns {number}
   */
  getSpacingRatio(toolName) {
    const t = toolName || this.currentTool;
    if (t === 'eraser') return 0.15;
    const brush = this.brushes[t] || this.activeBrush;
    return brush.spacingRatio;
  }

  /**
   * 스탬프 단일 렌더링
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x
   * @param {number} y
   * @param {number} pressure
   * @param {Object} options - { tool, color, baseSize, baseOpacity, tiltX, tiltY }
   */
  renderStamp(ctx, x, y, pressure, options) {
    const tool = options.tool || this.currentTool;

    if (tool === 'eraser') {
      // 투명 활성 레이어에 불투명 마스크를 쌓고, 합성 단계에서 destination-out 적용
      const p = Math.max(0.01, Math.min(1.0, pressure));
      const size = options.baseSize * (0.3 + p * 0.7);
      const radius = size / 2;
      if (radius <= 0.2) return;

      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = Math.min(1.0, options.baseOpacity * 1.8);

      const grad = ctx.createRadialGradient(x, y, radius * 0.2, x, y, radius);
      grad.addColorStop(0, 'rgba(0,0,0,1)');
      grad.addColorStop(0.75, 'rgba(0,0,0,0.85)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    // 선택한 재료의 브러시 전략에 위임
    const brush = this.brushes[tool] || this.activeBrush;
    brush.renderStamp(ctx, x, y, pressure, options);
  }

  /**
   * 전체 팁 캐시 초기화
   */
  clearAllCaches() {
    Object.values(this.brushes).forEach(b => b.clearCache());
  }
}
