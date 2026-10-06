/**
 * @file BrushEngine.js
 * @description 고속 입력 보간(Bézier Interpolation) 및 수채화(Watercolor) 브러시 렌더링 엔진
 */

export class BrushEngine {
  /**
   * @param {import('./DualCanvas.js').DualCanvas} dualCanvas
   */
  constructor(dualCanvas) {
    this.dualCanvas = dualCanvas;

    // 브러시 기본 설정
    this.brushColor = '#2F528F';     // 기본 수채화 블루
    this.brushSize = 36;             // 픽셀 단위 붓 지름
    this.brushOpacity = 0.35;        // 기본 투명도 (겹칠수록 진해지는 수채화 특성)
    this.waterContent = 0.6;         // 수분감 (번짐 및 가장자리 부드러움 계수)

    // 진행 중인 스트로크 포인트 버퍼
    this.currentPoints = [];

    // 수채화 붓 팁(Stamp/Dab) 캐시 캔버스
    this.stampCache = new Map();
  }

  /**
   * 브러시 속성 업데이트
   * @param {Object} options
   */
  setProperties({ color, size, opacity, waterContent }) {
    if (color !== undefined) this.brushColor = color;
    if (size !== undefined) this.brushSize = size;
    if (opacity !== undefined) this.brushOpacity = opacity;
    if (waterContent !== undefined) this.waterContent = waterContent;
  }

  /**
   * 스트로크 시작
   * @param {{x: number, y: number, pressure?: number, t?: number}} point
   */
  startStroke(point) {
    const p = {
      x: point.x,
      y: point.y,
      pressure: point.pressure ?? 0.5,
      t: point.t ?? performance.now()
    };
    this.currentPoints = [p];

    // 첫 점 단일 브러시 탭 찍기
    this.renderBrushStamp(this.dualCanvas.activeCtx, p.x, p.y, this.brushSize * (0.6 + p.pressure * 0.8), this.brushOpacity);
    this.dualCanvas.updateDisplay();
  }

  /**
   * 스트로크 진행 (신규 좌표 수신 및 보간 처리)
   * 고속 입력 시 점선 방지를 위해 2차 베지에(Quadratic Bézier) 및 선형 보간을 실행합니다.
   * @param {{x: number, y: number, pressure?: number, t?: number}} point
   */
  continueStroke(point) {
    const p = {
      x: point.x,
      y: point.y,
      pressure: point.pressure ?? 0.5,
      t: point.t ?? performance.now()
    };

    const prev = this.currentPoints[this.currentPoints.length - 1];
    if (!prev) {
      this.startStroke(point);
      return;
    }

    // 너무 인접한 점은 스킵 (미세 노이즈 방지)
    const dist = Math.hypot(p.x - prev.x, p.y - prev.y);
    if (dist < 1.5) return;

    this.currentPoints.push(p);

    const ctx = this.dualCanvas.activeCtx;

    // 2차 베지에 곡선 보간을 이용한 부드러운 궤적 렌더링
    if (this.currentPoints.length >= 3) {
      const p0 = this.currentPoints[this.currentPoints.length - 3];
      const p1 = this.currentPoints[this.currentPoints.length - 2];
      const p2 = this.currentPoints[this.currentPoints.length - 1];

      // 이전 중간점 -> 현재 중간점을 잇는 곡선
      const startMid = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2, pressure: (p0.pressure + p1.pressure) / 2 };
      const endMid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2, pressure: (p1.pressure + p2.pressure) / 2 };

      this.renderCurveSegment(ctx, startMid, p1, endMid);
    } else {
      // 포인트가 2개인 초기 구간은 직선 보간
      this.renderLinearSegment(ctx, prev, p);
    }

    this.dualCanvas.updateDisplay();
  }

  /**
   * 스트로크 종료 (액티브 캔버스를 백그라운드로 커밋)
   * @returns {Object} 직렬화 가능한 완성된 스트로크 데이터
   */
  endStroke() {
    if (this.currentPoints.length === 0) return null;

    const strokeData = {
      color: this.brushColor,
      size: this.brushSize,
      opacity: this.brushOpacity,
      waterContent: this.waterContent,
      path: [...this.currentPoints]
    };

    // 액티브 레이어 영구 반영 후 클리어
    this.dualCanvas.commitActiveToBackground();
    this.currentPoints = [];

    return strokeData;
  }

  /**
   * 두 점 사이 선형 보간 렌더링 (점선 방지)
   */
  renderLinearSegment(ctx, p1, p2) {
    const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const avgSize = this.brushSize * (0.6 + ((p1.pressure + p2.pressure) / 2) * 0.8);
    // 스탬프 간격은 브러시 크기의 15%로 촘촘히 보간
    const step = Math.max(1, avgSize * 0.15);
    const steps = Math.ceil(dist / step);

    for (let i = 0; i <= steps; i++) {
      const t = steps === 0 ? 0 : i / steps;
      const x = p1.x + (p2.x - p1.x) * t;
      const y = p1.y + (p2.y - p1.y) * t;
      const pressure = p1.pressure + (p2.pressure - p1.pressure) * t;
      const size = this.brushSize * (0.6 + pressure * 0.8);
      this.renderBrushStamp(ctx, x, y, size, this.brushOpacity);
    }
  }

  /**
   * 2차 베지에 곡선 세그먼트 보간 렌더링
   */
  renderCurveSegment(ctx, start, control, end) {
    const approxDist = Math.hypot(control.x - start.x, control.y - start.y) +
                       Math.hypot(end.x - control.x, end.y - control.y);
    const avgPressure = (start.pressure + control.pressure + end.pressure) / 3;
    const avgSize = this.brushSize * (0.6 + avgPressure * 0.8);
    const step = Math.max(1, avgSize * 0.15);
    const steps = Math.max(2, Math.ceil(approxDist / step));

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const invT = 1 - t;
      // 2차 베지에 공식: B(t) = (1-t)^2 * P0 + 2(1-t)t * P1 + t^2 * P2
      const x = invT * invT * start.x + 2 * invT * t * control.x + t * t * end.x;
      const y = invT * invT * start.y + 2 * invT * t * control.y + t * t * end.y;
      const pressure = invT * start.pressure + t * end.pressure;
      const size = this.brushSize * (0.6 + pressure * 0.8);

      this.renderBrushStamp(ctx, x, y, size, this.brushOpacity);
    }
  }

  /**
   * 수채화 붓 팁(Stamp) 렌더링
   * 부드러운 수채화 특유의 외곽 번짐(Wet edge)과 은은한 반투명도를 방사형 그라데이션으로 구현합니다.
   */
  renderBrushStamp(ctx, x, y, size, opacity) {
    const radius = size / 2;
    if (radius <= 0) return;

    ctx.save();
    ctx.globalAlpha = Math.min(1.0, opacity * 0.35); // 다중 겹침을 위한 부드러운 알파
    ctx.globalCompositeOperation = 'source-over';

    const grad = ctx.createRadialGradient(x, y, radius * 0.2, x, y, radius);
    
    // 수채화 특유의 미세한 Wet Edge (테두리가 약간 또렷해지다 부드럽게 페이드아웃되는 효과)
    grad.addColorStop(0, this.brushColor);
    grad.addColorStop(0.7, this.brushColor);
    grad.addColorStop(0.9, this.brushColor);
    grad.addColorStop(1, 'transparent');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  /**
   * 외부 스트로크 데이터를 전달받아 재생(재렌더링)
   * 타임랩스 재생 및 Undo/Redo 시 사용됩니다.
   * @param {CanvasRenderingContext2D} targetCtx
   * @param {Object} strokeData
   */
  renderStrokeDirect(targetCtx, strokeData) {
    const prevColor = this.brushColor;
    const prevSize = this.brushSize;
    const prevOpacity = this.brushOpacity;

    this.brushColor = strokeData.color;
    this.brushSize = strokeData.size;
    this.brushOpacity = strokeData.opacity;

    const path = strokeData.path;
    if (!path || path.length === 0) return;

    if (path.length === 1) {
      const p = path[0];
      this.renderBrushStamp(targetCtx, p.x, p.y, this.brushSize * (0.6 + p.pressure * 0.8), this.brushOpacity);
    } else {
      for (let i = 0; i < path.length - 1; i++) {
        this.renderLinearSegment(targetCtx, path[i], path[i + 1]);
      }
    }

    this.brushColor = prevColor;
    this.brushSize = prevSize;
    this.brushOpacity = prevOpacity;
  }
}
