/**
 * @file InteractionManager.js
 * @description 데스크톱/모바일 포인터 입력 및 Raycaster UV 추출 관리
 * 3D 평면과의 교차점을 찾아 Y축 반전 공식((1 - uv.y) * height)으로 2D 캔버스 좌표로 변환합니다.
 */

import * as THREE from 'three';

export class InteractionManager {
  /**
   * @param {import('./SceneManager.js').SceneManager} sceneManager
   * @param {import('../drawing/DualCanvas.js').DualCanvas} dualCanvas
   * @param {import('../drawing/BrushEngine.js').BrushEngine} brushEngine
   * @param {import('../drawing/StrokeHistory.js').StrokeHistory} strokeHistory
   */
  constructor(sceneManager, dualCanvas, brushEngine, strokeHistory) {
    this.sceneManager = sceneManager;
    this.dualCanvas = dualCanvas;
    this.brushEngine = brushEngine;
    this.strokeHistory = strokeHistory;

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    this.isDrawing = false;
    this.isEnabled = true;

    // 브러시 3D 포인터 인디케이터 (캔버스 위 브러시 위치 표시)
    this.setupPointerIndicator();

    // DOM 이벤트 리스너 바인딩
    this.bindEvents();
  }

  /**
   * 캔버스 표면 위 브러시 위치를 안내하는 3D 원형 링 인디케이터
   */
  setupPointerIndicator() {
    const ringGeo = new THREE.RingGeometry(0.012, 0.015, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x2f528f,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8,
      depthTest: false
    });
    this.indicator = new THREE.Mesh(ringGeo, ringMat);
    this.indicator.visible = false;
    this.sceneManager.scene.add(this.indicator);
  }

  /**
   * 이벤트 바인딩
   */
  bindEvents() {
    const dom = this.sceneManager.canvasElement;

    dom.addEventListener('pointerdown', this.onPointerDown.bind(this));
    window.addEventListener('pointermove', this.onPointerMove.bind(this));
    window.addEventListener('pointerup', this.onPointerUp.bind(this));
    dom.addEventListener('pointerleave', this.onPointerLeave.bind(this));
  }

  /**
   * 포인터 이벤트의 정규화 좌표(-1 ~ +1) 계산
   */
  updateMouseCoords(e) {
    const rect = this.sceneManager.canvasElement.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  /**
   * 3D 드로잉 평면과 레이캐스트 교차 검사
   * @returns {THREE.Intersection|null}
   */
  getCanvasIntersection() {
    this.raycaster.setFromCamera(this.mouse, this.sceneManager.camera);
    const intersects = this.raycaster.intersectObject(this.sceneManager.drawingPlane, false);
    return intersects.length > 0 ? intersects[0] : null;
  }

  /**
   * 포인터 누름 (드로잉 시작)
   */
  onPointerDown(e) {
    if (!this.isEnabled || e.button !== 0) return; // 좌클릭/터치만 허용
    if (this.strokeHistory.isPlayingTimelapse) return;

    this.updateMouseCoords(e);
    const hit = this.getCanvasIntersection();
    if (hit && hit.uv) {
      this.isDrawing = true;

      // UV -> 캔버스 픽셀 변환 (철저한 Y축 반전: (1 - uv.y) * height)
      const coords = this.dualCanvas.uvToCanvasCoords(hit.uv);
      const pressure = e.pressure && e.pressure > 0 ? e.pressure : 0.5;

      this.brushEngine.startStroke({
        x: coords.x,
        y: coords.y,
        pressure: pressure,
        t: performance.now()
      });
    }
  }

  /**
   * 포인터 이동 (드로잉 진행 및 인디케이터 갱신)
   */
  onPointerMove(e) {
    if (!this.isEnabled) return;
    this.updateMouseCoords(e);

    const hit = this.getCanvasIntersection();

    if (hit && hit.uv) {
      // 3D 인디케이터 위치 및 회전 맞춤
      this.indicator.visible = true;
      this.indicator.position.copy(hit.point);
      this.indicator.position.addScaledVector(hit.face.normal, 0.002); // 표면 바로 위
      this.indicator.quaternion.copy(this.sceneManager.drawingPlane.quaternion);

      // 브러시 색상에 맞춘 인디케이터 색상 동기화
      this.indicator.material.color.set(this.brushEngine.brushColor);

      if (this.isDrawing) {
        // UV -> 캔버스 픽셀 변환 (Y축 반전)
        const coords = this.dualCanvas.uvToCanvasCoords(hit.uv);
        const pressure = e.pressure && e.pressure > 0 ? e.pressure : 0.5;

        this.brushEngine.continueStroke({
          x: coords.x,
          y: coords.y,
          pressure: pressure,
          t: performance.now()
        });
      }
    } else {
      this.indicator.visible = false;
      if (this.isDrawing) {
        // 캔버스 영역을 벗어났을 경우 스트로크 종료 처리
        this.finishStroke();
      }
    }
  }

  /**
   * 포인터 뗌 (스트로크 확정)
   */
  onPointerUp() {
    if (this.isDrawing) {
      this.finishStroke();
    }
  }

  /**
   * 캔버스 영역 이탈
   */
  onPointerLeave() {
    this.indicator.visible = false;
    if (this.isDrawing) {
      this.finishStroke();
    }
  }

  /**
   * 스트로크 종료 및 히스토리 스택에 누적
   */
  finishStroke() {
    this.isDrawing = false;
    const strokeData = this.brushEngine.endStroke();
    if (strokeData) {
      this.strokeHistory.push(strokeData);
    }
  }

  /**
   * 상호작용 활성화/비활성화 (예: 갤러리 모드 또는 타임랩스 재생 중)
   */
  setEnabled(enabled) {
    this.isEnabled = enabled;
    if (!enabled && this.isDrawing) {
      this.finishStroke();
    }
    if (!enabled) {
      this.indicator.visible = false;
    }
  }
}
