import { BrushManager } from './brushes/BrushManager.js';

export class BezierBrushEngine {
  /**
   * @param {import('./DualCanvas.js').DualCanvasManager} dualCanvas
   */
  constructor(dualCanvas) {
    this.dualCanvas = dualCanvas;

    // 브러시 전략 매니저 인스턴스화
    this.brushManager = new BrushManager();

    // 현재 활성 도구 속성
    this.tool = 'watercolor';
    this.color = '#1B3B6F';
    this.neon = false;
    this.depth = 40;
    this.baseSize = 36;
    this.baseOpacity = 0.12;

    // 연속 곡선 보간용 포인트 버퍼
    this.points = [];
  }

  /**
   * 도구 전환 (전략 패턴 위임)
   * @param {string} toolName - 'pen' | 'pencil' | 'watercolor' | 'airbrush' | 'eraser'
   */
  setTool(toolName) {
    const config = this.brushManager.setTool(toolName);
    this.tool = config.tool;
    this.baseSize = config.defaultSize;
    this.baseOpacity = config.defaultOpacity;
    return config;
  }

  /**
   * 스트로크 시작
   * @param {import('../types/DataModels.js').Point} pt
   */
  startStroke(pt) {
    this.points = [pt];
    this.dualCanvas.clearActive();
    this.dualCanvas.activeTool = this.tool;

    const ctx = this.dualCanvas.activeCtx;
    this.renderPoint(ctx, this.points, 0);
    this.dualCanvas.updateDisplay();
  }

  /**
   * 스트로크 진행 (중간점 기반 2차 베지어 곡선 보간 및 균일 스탬핑)
   * @param {import('../types/DataModels.js').Point} pt
   */
  addPoint(pt) {
    this.points.push(pt);
    const len = this.points.length;
    const ctx = this.dualCanvas.activeCtx;

    this.renderPoint(ctx, this.points, len - 1);

    this.dualCanvas.updateDisplay();
  }

  midpoint(a, b) {
    return Object.fromEntries(['x', 'y', 'pressure', 'tiltX', 'tiltY'].map(key =>
      [key, ((a[key] ?? 0) + (b[key] ?? 0)) / 2]));
  }

  // 실시간 입력, 히스토리 복원, 타임랩스가 같은 경로를 사용합니다.
  renderPoint(ctx, points, index) {
    if (index === 0) {
      const p = points[0];
      let seed = ((p.x * 100) ^ (p.y * 100) ^ (p.time * 100)) >>> 0;
      this.random = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 4294967296;
      };
      this.renderStamp(ctx, p.x, p.y, p.pressure, p);
    } else if (index === 1) {
      this.interpolateLinear(ctx, points[0], this.midpoint(points[0], points[1]));
    } else {
      const [a, b, c] = points.slice(index - 2, index + 1);
      this.interpolateBezier(ctx, this.midpoint(a, b), b, this.midpoint(b, c));
    }
  }

  finishPath(ctx, points) {
    if (points.length < 2) return;
    const last = points.at(-1);
    this.interpolateLinear(ctx, this.midpoint(points.at(-2), last), last);
  }

  withStroke(stroke, render) {
    const previous = [this.tool, this.color, this.baseSize, this.baseOpacity];
    this.tool = stroke.tool ?? 'watercolor';
    this.color = stroke.color ?? '#1B3B6F';
    this.baseSize = stroke.size ?? 32;
    this.baseOpacity = stroke.opacity ?? 0.12;
    this.dualCanvas.activeTool = this.tool;
    try { render(); } finally {
      [this.tool, this.color, this.baseSize, this.baseOpacity] = previous;
    }
  }

  /**
   * 두 점 사이 선형 보간 드로잉
   */
  interpolateLinear(ctx, p1, p2) {
    const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const avgPressure = (p1.pressure + p2.pressure) / 2;
    const spacingRatio = this.brushManager.getSpacingRatio(this.tool);
    const size = this.baseSize * (0.3 + avgPressure * 0.7);

    const step = Math.max(1.0, size * spacingRatio);
    const steps = Math.ceil(dist / step);

    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = p1.x + (p2.x - p1.x) * t;
      const y = p1.y + (p2.y - p1.y) * t;
      const pressure = p1.pressure + (p2.pressure - p1.pressure) * t;
      const pt = {
        tiltX: p1.tiltX + (p2.tiltX - p1.tiltX) * t,
        tiltY: p1.tiltY + (p2.tiltY - p1.tiltY) * t
      };
      this.renderStamp(ctx, x, y, pressure, pt);
    }
  }

  /**
   * 중간점 기반 2차 베지어 곡선 보간 (Bézier Interpolation)
   */
  interpolateBezier(ctx, m0, p1, m1) {
    const approxDist = Math.hypot(p1.x - m0.x, p1.y - m0.y) + Math.hypot(m1.x - p1.x, m1.y - p1.y);
    const avgPressure = (m0.pressure + p1.pressure + m1.pressure) / 3;
    const spacingRatio = this.brushManager.getSpacingRatio(this.tool);
    const size = this.baseSize * (0.3 + avgPressure * 0.7);

    const step = Math.max(1.0, size * spacingRatio);
    const steps = Math.max(2, Math.ceil(approxDist / step));

    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const invT = 1 - t;

      const x = invT * invT * m0.x + 2 * invT * t * p1.x + t * t * m1.x;
      const y = invT * invT * m0.y + 2 * invT * t * p1.y + t * t * m1.y;
      const pressure = invT * m0.pressure + t * m1.pressure;
      const pt = {
        tiltX: invT * m0.tiltX + t * m1.tiltX,
        tiltY: invT * m0.tiltY + t * m1.tiltY
      };

      this.renderStamp(ctx, x, y, pressure, pt);
    }
  }

  /**
   * 브러시 전략에 스탬프 렌더링 위임
   */
  renderStamp(ctx, x, y, pressure, pt = {}) {
    this.brushManager.renderStamp(ctx, x, y, pressure, {
      random: this.random ?? Math.random,
      tool: this.tool,
      color: this.color,
      baseSize: this.baseSize,
      baseOpacity: this.baseOpacity,
      tiltX: pt.tiltX || 0,
      tiltY: pt.tiltY || 0
    });
  }

  /**
   * 스트로크 종료
   */
  endStroke() {
    this.finishPath(this.dualCanvas.activeCtx, this.points);
    this.dualCanvas.commitActiveToBackground(this.tool);
    this.points = [];
  }
}
