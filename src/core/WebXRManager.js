/**
 * @file WebXRManager.js
 * @description WebXR Device API 대응 및 VR 컨트롤러 레이캐스트 드로잉 관리 모듈
 */

import * as THREE from 'three';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';

export class WebXRManager {
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

    this.renderer = sceneManager.renderer;
    this.scene = sceneManager.scene;

    this.controllers = [];
    this.isXRDrawing = false;
    this.activeController = null;

    this.tempMatrix = new THREE.Matrix4();
    this.raycaster = new THREE.Raycaster();

    this.initXR();
  }

  /**
   * WebXR 및 VRButton 초기화
   */
  initXR() {
    // Three.js VR 버튼 DOM에 추가
    const vrButton = VRButton.createButton(this.renderer);
    vrButton.id = 'webxr-vr-button';
    document.body.appendChild(vrButton);

    // 양손 컨트롤러(0, 1) 세팅
    for (let i = 0; i < 2; i++) {
      const controller = this.renderer.xr.getController(i);
      
      // 컨트롤러 광선(레이) 시각화
      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -2.5)
      ]);
      const lineMat = new THREE.LineBasicMaterial({
        color: 0x7a9ee6,
        transparent: true,
        opacity: 0.6
      });
      const rayLine = new THREE.Line(lineGeo, lineMat);
      rayLine.name = 'rayLine';
      controller.add(rayLine);

      // XR 트리거 버튼 이벤트
      controller.addEventListener('selectstart', () => this.onSelectStart(controller));
      controller.addEventListener('selectend', () => this.onSelectEnd(controller));

      this.scene.add(controller);
      this.controllers.push(controller);
    }
  }

  /**
   * XR 컨트롤러 트리거 누름 (드로잉 시작)
   */
  onSelectStart(controller) {
    if (this.strokeHistory.isPlayingTimelapse) return;

    const hit = this.getControllerIntersection(controller);
    if (hit && hit.uv) {
      this.isXRDrawing = true;
      this.activeController = controller;

      // UV -> 캔버스 픽셀 변환 (철저한 Y축 반전: (1 - uv.y) * height)
      const coords = this.dualCanvas.uvToCanvasCoords(hit.uv);
      this.brushEngine.startStroke({
        x: coords.x,
        y: coords.y,
        pressure: 0.7, // VR 기본 트리거 필압
        t: performance.now()
      });
    }
  }

  /**
   * XR 컨트롤러 트리거 뗌 (드로잉 종료)
   */
  onSelectEnd(controller) {
    if (this.isXRDrawing && this.activeController === controller) {
      this.isXRDrawing = false;
      this.activeController = null;
      const strokeData = this.brushEngine.endStroke();
      if (strokeData) {
        this.strokeHistory.push(strokeData);
      }
    }
  }

  /**
   * 매 프레임 XR 컨트롤러 레이캐스트 업데이트
   */
  update() {
    if (!this.renderer.xr.isPresenting) return;

    if (this.isXRDrawing && this.activeController) {
      const hit = this.getControllerIntersection(this.activeController);
      if (hit && hit.uv) {
        const coords = this.dualCanvas.uvToCanvasCoords(hit.uv);
        this.brushEngine.continueStroke({
          x: coords.x,
          y: coords.y,
          pressure: 0.7,
          t: performance.now()
        });
      } else {
        // 이젤 영역 밖으로 벗어남
        this.onSelectEnd(this.activeController);
      }
    }
  }

  /**
   * 컨트롤러 방향 기반 레이캐스트 교차점 계산
   */
  getControllerIntersection(controller) {
    this.tempMatrix.identity().extractRotation(controller.matrixWorld);
    this.raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(this.tempMatrix);

    const intersects = this.raycaster.intersectObject(this.sceneManager.drawingPlane, false);
    return intersects.length > 0 ? intersects[0] : null;
  }
}
