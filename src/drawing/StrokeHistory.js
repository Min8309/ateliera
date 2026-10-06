/**
 * @file StrokeHistory.js
 * @description 경량화된 스트로크 데이터 관리 및 타임랩스(Timelapse) 재생 엔진
 * 구조: { color, size, opacity, path: [{x, y, pressure, t}] }
 */

export class StrokeHistory {
  /**
   * @param {import('./DualCanvas.js').DualCanvas} dualCanvas
   * @param {import('./BrushEngine.js').BrushEngine} brushEngine
   */
  constructor(dualCanvas, brushEngine) {
    this.dualCanvas = dualCanvas;
    this.brushEngine = brushEngine;

    // 스트로크 히스토리 스택
    this.strokes = [];
    this.undoneStrokes = [];

    // 타임랩스 재생 상태 관리
    this.isPlayingTimelapse = false;
    this.timelapseAnimId = null;
  }

  /**
   * 신규 스트로크 추가
   * @param {Object} strokeData - { color, size, opacity, path: [{x, y, pressure, t}] }
   */
  push(strokeData) {
    if (!strokeData || !strokeData.path || strokeData.path.length === 0) return;
    this.strokes.push(strokeData);
    this.undoneStrokes = []; // 새로운 동작 발생 시 Redo 스택 초기화
  }

  /**
   * 마지막 스트로크 실행 취소 (Undo)
   */
  undo() {
    if (this.strokes.length === 0 || this.isPlayingTimelapse) return false;
    const undone = this.strokes.pop();
    this.undoneStrokes.push(undone);
    this.rebuildCanvas();
    return true;
  }

  /**
   * 실행 취소 되돌리기 (Redo)
   */
  redo() {
    if (this.undoneStrokes.length === 0 || this.isPlayingTimelapse) return false;
    const redone = this.undoneStrokes.pop();
    this.strokes.push(redone);
    this.rebuildCanvas();
    return true;
  }

  /**
   * 전체 히스토리 기반 캔버스 재구성
   */
  rebuildCanvas() {
    this.dualCanvas.clearAll();
    const ctx = this.dualCanvas.bgCtx;
    for (const stroke of this.strokes) {
      this.brushEngine.renderStrokeDirect(ctx, stroke);
    }
    this.dualCanvas.updateDisplay();
  }

  /**
   * 스트로크 전체 비우기
   */
  clear() {
    this.strokes = [];
    this.undoneStrokes = [];
    this.stopTimelapse();
    this.dualCanvas.clearAll();
  }

  /**
   * 타임랩스 재생 시작
   * @param {number} speedMultiplier - 재생 속도 배율 (기본 2배속)
   * @param {Function} [onProgress] - 진행률 콜백 (0.0 ~ 1.0)
   * @param {Function} [onComplete] - 완료 콜백
   */
  playTimelapse(speedMultiplier = 2.0, onProgress = null, onComplete = null) {
    if (this.strokes.length === 0) return;
    if (this.isPlayingTimelapse) this.stopTimelapse();

    this.isPlayingTimelapse = true;
    this.dualCanvas.clearAll();

    const allStrokes = [...this.strokes];
    let strokeIdx = 0;
    let pointIdx = 0;

    const ctx = this.dualCanvas.bgCtx;

    const step = () => {
      if (!this.isPlayingTimelapse) return;

      if (strokeIdx >= allStrokes.length) {
        this.isPlayingTimelapse = false;
        this.dualCanvas.updateDisplay();
        if (onProgress) onProgress(1.0);
        if (onComplete) onComplete();
        return;
      }

      const stroke = allStrokes[strokeIdx];
      const path = stroke.path;

      // 1프레임당 스피드 배율만큼 여러 포인트 렌더링
      const pointsToProcess = Math.max(1, Math.floor(4 * speedMultiplier));
      const endPointIdx = Math.min(path.length, pointIdx + pointsToProcess);

      for (let i = pointIdx; i < endPointIdx; i++) {
        if (i === 0) {
          const p = path[0];
          this.brushEngine.renderBrushStamp(ctx, p.x, p.y, stroke.size * (0.6 + p.pressure * 0.8), stroke.opacity);
        } else {
          this.brushEngine.renderLinearSegment(ctx, path[i - 1], path[i]);
        }
      }

      pointIdx = endPointIdx;
      if (pointIdx >= path.length) {
        strokeIdx++;
        pointIdx = 0;
      }

      this.dualCanvas.updateDisplay();

      if (onProgress) {
        const progress = (strokeIdx + (path.length > 0 ? pointIdx / path.length : 0)) / allStrokes.length;
        onProgress(Math.min(1.0, progress));
      }

      this.timelapseAnimId = requestAnimationFrame(step);
    };

    this.timelapseAnimId = requestAnimationFrame(step);
  }

  /**
   * 타임랩스 재생 중지 및 현재 최종본 즉시 렌더링
   */
  stopTimelapse() {
    if (!this.isPlayingTimelapse) return;
    this.isPlayingTimelapse = false;
    if (this.timelapseAnimId) {
      cancelAnimationFrame(this.timelapseAnimId);
      this.timelapseAnimId = null;
    }
    this.rebuildCanvas();
  }

  /**
   * 스트로크 데이터를 JSON 문자열로 직렬화 (공유 및 저장용)
   * @returns {string}
   */
  exportData() {
    return JSON.stringify({
      version: '1.0',
      createdAt: new Date().toISOString(),
      strokes: this.strokes
    });
  }

  /**
   * 외부 스트로크 JSON 데이터를 불러와 복원
   * @param {string|Object} rawData
   */
  importData(rawData) {
    try {
      const data = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
      if (Array.isArray(data.strokes)) {
        this.strokes = data.strokes;
        this.undoneStrokes = [];
        this.rebuildCanvas();
        return true;
      }
    } catch (err) {
      console.error('스트로크 데이터 파싱 오류:', err);
    }
    return false;
  }
}
