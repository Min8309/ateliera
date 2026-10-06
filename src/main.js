/**
 * @file main.js
 * @description Ateliera (아틀리에라) - 비 오는 창가 작업실 3D 수채화 드로잉 및 완성 플로우 통합 진입점
 * 
 * [모듈 구성]
 * 1. DualCanvasManager: Background + Active + Display 듀얼 레이어 캔버스 파이프라인
 * 2. WatercolorBrushEngine: 반투명 알파(0.08~0.15), 미세 입자 흩뿌림, 선형 보간, 하이브리드 필압
 * 3. AtelierEnvironment: 비 오는 통창 방 구조, 빗방울 파티클, 무드 조명, 절차적 빗소리 Web Audio
 * 4. FrameBuilder: 3D 몰딩 액자 3종(우드/골드/블랙) 및 스냅 결합 애니메이션
 * 5. CompletionManager: 정면 줌인, 서명 각인, 액자 씌우기, 데이터 패키징 & 로컬 스토리지 보관
 * 6. AtelieraApp: Three.js 씬, OrbitControls 분리, 타임랩스 재생 및 전체 통합 제어
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { AtelierEnvironment } from './environment/AtelierEnvironment.js';
import { FrameBuilder } from './frame/FrameBuilder.js';
import { CompletionManager } from './completion/CompletionManager.js';

/* ==========================================================================
   1. 듀얼 캔버스 레이어 관리자 (DualCanvasManager)
   ========================================================================== */
export class DualCanvasManager {
  /**
   * @param {number} size - 캔버스 가로/세로 해상도 (2048x2048)
   */
  constructor(size = 2048) {
    this.size = size;

    // 백그라운드 캔버스: 완료된 이전 획들이 영구 보관되는 캔버스
    this.bgCanvas = document.createElement('canvas');
    this.bgCanvas.width = this.size;
    this.bgCanvas.height = this.size;
    this.bgCtx = this.bgCanvas.getContext('2d', { willReadFrequently: false });

    // 액티브 캔버스: 현재 그리고 있는 실시간 1개의 획만 그리는 임시 캔버스
    this.activeCanvas = document.createElement('canvas');
    this.activeCanvas.width = this.size;
    this.activeCanvas.height = this.size;
    this.activeCtx = this.activeCanvas.getContext('2d', { willReadFrequently: false });

    // 최종 디스플레이 캔버스: Three.js CanvasTexture에 바인딩되는 합성 버퍼
    this.displayCanvas = document.createElement('canvas');
    this.displayCanvas.width = this.size;
    this.displayCanvas.height = this.size;
    this.displayCtx = this.displayCanvas.getContext('2d', { willReadFrequently: false });

    // Three.js CanvasTexture 생성
    this.texture = new THREE.CanvasTexture(this.displayCanvas);
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = true;
    this.texture.colorSpace = THREE.SRGBColorSpace;

    // 수채화 전용 바탕지(캔버스지) 초기화
    this.initPaperBackground();
  }

  /**
   * 수채화 캔버스지 질감 초기화 (부드러운 미색 + 은은한 종이 결)
   */
  initPaperBackground() {
    this.bgCtx.save();
    this.bgCtx.fillStyle = '#FAF7F2';
    this.bgCtx.fillRect(0, 0, this.size, this.size);

    // 미세한 종이 결(Grain) 패턴 생성
    const grainCanvas = document.createElement('canvas');
    grainCanvas.width = 64;
    grainCanvas.height = 64;
    const gCtx = grainCanvas.getContext('2d');
    const imgData = gCtx.createImageData(64, 64);
    for (let i = 0; i < imgData.data.length; i += 4) {
      const val = 150 + (Math.random() - 0.5) * 16;
      imgData.data[i] = val;
      imgData.data[i + 1] = val - 3;
      imgData.data[i + 2] = val - 8;
      imgData.data[i + 3] = 10;
    }
    gCtx.putImageData(imgData, 0, 0);

    const pattern = this.bgCtx.createPattern(grainCanvas, 'repeat');
    if (pattern) {
      this.bgCtx.fillStyle = pattern;
      this.bgCtx.fillRect(0, 0, this.size, this.size);
    }
    this.bgCtx.restore();

    this.updateDisplay();
  }

  /**
   * 액티브 캔버스 클리어
   */
  clearActive() {
    this.activeCtx.clearRect(0, 0, this.size, this.size);
  }

  /**
   * 스트로크 완료 시: activeCanvas 내용을 backgroundCanvas에 스탬핑하고 activeCanvas는 클리어
   */
  commitActiveToBackground() {
    this.bgCtx.drawImage(this.activeCanvas, 0, 0);
    this.clearActive();
    this.updateDisplay();
  }

  /**
   * 최종 캔버스 합성 및 Three.js 텍스처 갱신 알림
   */
  updateDisplay() {
    this.displayCtx.clearRect(0, 0, this.size, this.size);
    this.displayCtx.drawImage(this.bgCanvas, 0, 0);
    this.displayCtx.drawImage(this.activeCanvas, 0, 0);
    this.texture.needsUpdate = true;
  }

  /**
   * 캔버스 완전 초기화
   */
  clearAll() {
    this.clearActive();
    this.initPaperBackground();
  }

  /**
   * Raycast UV -> 2D 캔버스 픽셀 좌표 변환 (Y축 반전 보정: (1 - uv.y) * size)
   * @param {THREE.Vector2} uv
   * @returns {{ x: number, y: number }}
   */
  uvToCanvasCoords(uv) {
    return {
      x: uv.x * this.size,
      y: (1.0 - uv.y) * this.size
    };
  }
}

/* ==========================================================================
   2. 수채화 브러시 엔진 (WatercolorBrushEngine)
   ========================================================================== */
export class WatercolorBrushEngine {
  /**
   * @param {DualCanvasManager} dualCanvas
   */
  constructor(dualCanvas) {
    this.dualCanvas = dualCanvas;

    // 브러시 기본 설정 (반투명 알파 0.08 ~ 0.15)
    this.color = '#2F528F';
    this.baseSize = 32;
    this.opacity = 0.12;

    this.currentPath = [];
    this.lastTime = 0;
    this.lastPoint = null;
  }

  /**
   * 스트로크 시작
   */
  startStroke(pt) {
    this.currentPath = [pt];
    this.lastPoint = pt;
    this.lastTime = pt.t;

    const effectiveSize = this.calcEffectiveSize(this.baseSize, pt.pressure);
    this.drawWatercolorStamp(this.dualCanvas.activeCtx, pt.x, pt.y, effectiveSize, this.opacity, this.color);
    this.dualCanvas.updateDisplay();
  }

  /**
   * 스트로크 진행 (선형 보간 및 가상 필압 적용)
   */
  continueStroke(rawPt) {
    if (!this.lastPoint) {
      this.startStroke(rawPt);
      return;
    }

    const dt = Math.max(1, rawPt.t - this.lastTime);
    const dist = Math.hypot(rawPt.x - this.lastPoint.x, rawPt.y - this.lastPoint.y);

    if (dist < 1.0) return;

    let pressure = rawPt.rawPressure;
    if (pressure === undefined || pressure === 0 || pressure === 0.5) {
      const speed = dist / dt;
      pressure = THREE.MathUtils.clamp(1.0 - speed * 0.45, 0.35, 0.95);
    }

    const pt = {
      x: rawPt.x,
      y: rawPt.y,
      pressure: pressure,
      t: rawPt.t
    };

    this.interpolateAndDraw(this.dualCanvas.activeCtx, this.lastPoint, pt, this.color, this.baseSize, this.opacity);

    this.currentPath.push(pt);
    this.lastPoint = pt;
    this.lastTime = pt.t;

    this.dualCanvas.updateDisplay();
  }

  /**
   * 스트로크 종료
   */
  endStroke() {
    if (this.currentPath.length === 0) return null;

    const strokeRecord = {
      color: this.color,
      size: this.baseSize,
      opacity: this.opacity,
      path: [...this.currentPath]
    };

    this.dualCanvas.commitActiveToBackground();
    this.currentPath = [];
    this.lastPoint = null;
    return strokeRecord;
  }

  /**
   * 두 점 사이 선형 보간 드로잉
   */
  interpolateAndDraw(ctx, p1, p2, color, baseSize, opacity) {
    const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const avgPressure = (p1.pressure + p2.pressure) / 2;
    const avgSize = this.calcEffectiveSize(baseSize, avgPressure);

    const stepDist = Math.max(1.2, avgSize * 0.15);
    const steps = Math.ceil(dist / stepDist);

    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = p1.x + (p2.x - p1.x) * t;
      const y = p1.y + (p2.y - p1.y) * t;
      const pressure = p1.pressure + (p2.pressure - p1.pressure) * t;
      const size = this.calcEffectiveSize(baseSize, pressure);

      this.drawWatercolorStamp(ctx, x, y, size, opacity, color);
    }
  }

  calcEffectiveSize(baseSize, pressure) {
    return baseSize * (0.5 + pressure * 0.7);
  }

  /**
   * 수채화 번짐(Bleed) 및 미세 입자 흩뿌림 스탬프
   */
  drawWatercolorStamp(ctx, x, y, size, opacity, color) {
    const radius = size * 0.5;
    if (radius <= 0) return;

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';

    const grad = ctx.createRadialGradient(x, y, radius * 0.15, x, y, radius);
    grad.addColorStop(0, color);
    grad.addColorStop(0.75, color);
    grad.addColorStop(0.92, color);
    grad.addColorStop(1, 'transparent');

    ctx.globalAlpha = opacity;
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    // 수채화 번짐 입자 흩뿌림
    const particleCount = Math.floor(radius * 0.35);
    ctx.fillStyle = color;

    for (let i = 0; i < particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = radius * (0.3 + Math.random() * 0.7);
      const px = x + Math.cos(angle) * r;
      const py = y + Math.sin(angle) * r;
      const pSize = 0.7 + Math.random() * 1.5;

      ctx.globalAlpha = opacity * (0.2 + Math.random() * 0.4);
      ctx.beginPath();
      ctx.arc(px, py, pSize, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

/* ==========================================================================
   3. 메인 Ateliera 플랫폼 통합 애플리케이션
   ========================================================================== */
class AtelieraApp {
  constructor() {
    this.canvasEl = document.getElementById('webgl-canvas');
    this.dualCanvas = new DualCanvasManager(2048);
    this.brush = new WatercolorBrushEngine(this.dualCanvas);

    this.strokesData = [];
    this.isDrawing = false;
    this.isDrawingBlocked = false;
    this.timelapseAnimId = null;

    this.clock = new THREE.Clock();

    // Three.js 씬 구축
    this.initThree();

    // 로드맵 2단계 모듈 초기화
    this.environment = new AtelierEnvironment(this.scene, this.camera);
    this.frameBuilder = new FrameBuilder(this.scene);
    this.completionManager = new CompletionManager({
      camera: this.camera,
      controls: this.controls,
      drawingPlane: this.drawingPlane,
      dualCanvas: this.dualCanvas,
      frameBuilder: this.frameBuilder,
      strokesData: this.strokesData,
      setDrawingBlocked: this.setDrawingBlocked.bind(this)
    });

    // UI 및 이벤트 바인딩
    this.initUI();
    this.bindPointerEvents();

    // 렌더 루프 가동
    this.animate();
  }

  /**
   * Three.js 뷰포트 & OrbitControls 설정
   */
  initThree() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#0a0c10');
    this.scene.fog = new THREE.FogExp2('#0a0c10', 0.07);

    this.camera = new THREE.PerspectiveCamera(54, window.innerWidth / window.innerHeight, 0.1, 100);
    this.camera.position.set(0, 0, 2.5);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvasEl,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // 3D 이젤 형태의 Quad 메쉬 (PlaneGeometry(2, 2))
    const planeGeo = new THREE.PlaneGeometry(2, 2);
    const planeMat = new THREE.MeshStandardMaterial({
      map: this.dualCanvas.texture,
      roughness: 0.9,
      metalness: 0.02
    });

    this.drawingPlane = new THREE.Mesh(planeGeo, planeMat);
    this.drawingPlane.name = 'EaselCanvas';
    this.scene.add(this.drawingPlane);

    // 기본 미니멀 테두리
    const frameGeo = new THREE.BoxGeometry(2.06, 2.06, 0.03);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x1f1b17, roughness: 0.8 });
    const frameMesh = new THREE.Mesh(frameGeo, frameMat);
    frameMesh.position.z = -0.016;
    this.drawingPlane.add(frameMesh);

    // 궤도 컨트롤러 (우클릭 회전 / 휠 줌)
    this.controls = new OrbitControls(this.camera, this.canvasEl);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxDistance = 5.5;
    this.controls.minDistance = 0.8;

    this.controls.mouseButtons = {
      LEFT: null,                      // 좌클릭: 드로잉 전용
      MIDDLE: THREE.MOUSE.DOLLY,       // 휠 클릭: 줌
      RIGHT: THREE.MOUSE.ROTATE        // 우클릭: 뷰 회전
    };

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    window.addEventListener('resize', this.onResize.bind(this));
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  bindPointerEvents() {
    this.canvasEl.addEventListener('pointerdown', this.onPointerDown.bind(this));
    window.addEventListener('pointermove', this.onPointerMove.bind(this));
    window.addEventListener('pointerup', this.onPointerUp.bind(this));
  }

  updatePointerCoords(e) {
    const rect = this.canvasEl.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  raycastCanvas() {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const intersects = this.raycaster.intersectObject(this.drawingPlane, false);
    return intersects.length > 0 ? intersects[0] : null;
  }

  onPointerDown(e) {
    if (this.isDrawingBlocked || e.button !== 0) return;

    this.updatePointerCoords(e);
    const hit = this.raycastCanvas();

    if (hit && hit.uv) {
      this.isDrawing = true;
      const coords = this.dualCanvas.uvToCanvasCoords(hit.uv);

      this.brush.startStroke({
        x: coords.x,
        y: coords.y,
        pressure: e.pressure,
        t: performance.now()
      });
    }
  }

  onPointerMove(e) {
    if (!this.isDrawing || this.isDrawingBlocked) return;

    this.updatePointerCoords(e);
    const hit = this.raycastCanvas();

    if (hit && hit.uv) {
      const coords = this.dualCanvas.uvToCanvasCoords(hit.uv);

      this.brush.continueStroke({
        x: coords.x,
        y: coords.y,
        rawPressure: e.pressure,
        t: performance.now()
      });
    } else {
      this.endCurrentStroke();
    }
  }

  onPointerUp(e) {
    if (this.isDrawing && e.button === 0) {
      this.endCurrentStroke();
    }
  }

  endCurrentStroke() {
    if (!this.isDrawing) return;
    this.isDrawing = false;

    const strokeRecord = this.brush.endStroke();
    if (strokeRecord) {
      this.strokesData.push(strokeRecord);
    }
  }

  initUI() {
    // 빗소리 토글 버튼
    const btnRain = document.getElementById('btn-rain-audio');
    if (btnRain) {
      btnRain.addEventListener('click', () => {
        const isPlaying = this.environment.toggleRainAudio();
        btnRain.textContent = isPlaying ? '🌧️ 빗소리 OFF' : '🌧️ 빗소리 ON';
        btnRain.classList.toggle('accent', isPlaying);
      });
    }

    // 상단 액션 버튼
    document.getElementById('btn-clear').addEventListener('click', () => this.clearCanvas());
    document.getElementById('btn-undo').addEventListener('click', () => this.undo());
    document.getElementById('btn-timelapse').addEventListener('click', () => this.playTimelapse());
    document.getElementById('btn-export').addEventListener('click', () => this.exportJSON());

    // 하단 컬러 팔레트 & 슬라이더
    const swatches = document.querySelectorAll('.color-swatch');
    swatches.forEach(swatch => {
      swatch.addEventListener('click', () => {
        swatches.forEach(s => s.classList.remove('active'));
        swatch.classList.add('active');
        this.brush.color = swatch.getAttribute('data-color');
      });
    });

    const sizeInput = document.getElementById('brush-size');
    const sizeLabel = document.getElementById('label-brush-size');
    sizeInput.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      sizeLabel.textContent = `${val}px`;
      this.brush.baseSize = val;
    });

    const opacityInput = document.getElementById('brush-opacity');
    const opacityLabel = document.getElementById('label-brush-opacity');
    opacityInput.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      opacityLabel.textContent = `${val}%`;
      this.brush.opacity = val / 100;
    });
  }

  clearCanvas() {
    if (this.isDrawingBlocked) return;
    if (this.strokesData.length > 0 && !confirm('캔버스와 모든 스트로크 기록을 지우시겠습니까?')) {
      return;
    }
    this.strokesData = [];
    this.dualCanvas.clearAll();
  }

  undo() {
    if (this.isDrawingBlocked || this.strokesData.length === 0) return;

    this.strokesData.pop();
    this.dualCanvas.clearAll();
    const ctx = this.dualCanvas.bgCtx;

    for (const stroke of this.strokesData) {
      const path = stroke.path;
      if (!path || path.length === 0) continue;

      if (path.length === 1) {
        const p = path[0];
        const size = this.brush.calcEffectiveSize(stroke.size, p.pressure);
        this.brush.drawWatercolorStamp(ctx, p.x, p.y, size, stroke.opacity, stroke.color);
      } else {
        for (let i = 0; i < path.length - 1; i++) {
          this.brush.interpolateAndDraw(ctx, path[i], path[i + 1], stroke.color, stroke.size, stroke.opacity);
        }
      }
    }

    this.dualCanvas.updateDisplay();
  }

  playTimelapse() {
    if (this.isDrawingBlocked) return;
    if (this.strokesData.length === 0) {
      alert('재생할 스트로크 데이터가 없습니다. 먼저 그림을 그려보세요!');
      return;
    }

    this.setDrawingBlocked(true);
    this.dualCanvas.clearAll();

    const strokes = [...this.strokesData];
    let strokeIdx = 0;
    let pointIdx = 0;
    const ctx = this.dualCanvas.bgCtx;

    const animateStep = () => {
      if (!this.isDrawingBlocked) return;

      if (strokeIdx >= strokes.length) {
        this.dualCanvas.updateDisplay();
        this.setDrawingBlocked(false);
        return;
      }

      const currentStroke = strokes[strokeIdx];
      const path = currentStroke.path;
      const pointsPerFrame = 4;
      const endIdx = Math.min(path.length, pointIdx + pointsPerFrame);

      for (let i = pointIdx; i < endIdx; i++) {
        if (i === 0) {
          const p = path[0];
          const size = this.brush.calcEffectiveSize(currentStroke.size, p.pressure);
          this.brush.drawWatercolorStamp(ctx, p.x, p.y, size, currentStroke.opacity, currentStroke.color);
        } else {
          this.brush.interpolateAndDraw(ctx, path[i - 1], path[i], currentStroke.color, currentStroke.size, currentStroke.opacity);
        }
      }

      pointIdx = endIdx;
      if (pointIdx >= path.length) {
        strokeIdx++;
        pointIdx = 0;
      }

      this.dualCanvas.updateDisplay();
      this.timelapseAnimId = requestAnimationFrame(animateStep);
    };

    this.timelapseAnimId = requestAnimationFrame(animateStep);
  }

  setDrawingBlocked(blocked) {
    this.isDrawingBlocked = blocked;

    const banner = document.getElementById('timelapse-banner');
    if (banner) {
      if (blocked) banner.classList.add('active');
      else banner.classList.remove('active');
    }

    const buttons = document.querySelectorAll('.panel-btn, .btn-finish');
    buttons.forEach(btn => {
      btn.disabled = blocked;
    });
  }

  exportJSON() {
    const exportPayload = {
      project: 'Ateliera',
      version: '1.2.0',
      exportedAt: new Date().toISOString(),
      canvasResolution: { width: this.dualCanvas.size, height: this.dualCanvas.size },
      totalStrokes: this.strokesData.length,
      strokesData: this.strokesData
    };

    console.group('🎨 [Ateliera] Exported Strokes Data JSON');
    console.log(exportPayload);
    console.groupEnd();

    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ateliera-strokes-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  animate() {
    requestAnimationFrame(this.animate.bind(this));

    const delta = this.clock.getDelta();

    // 비 오는 룸 파티클 애니메이션 갱신
    if (this.environment) {
      this.environment.update(delta);
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new AtelieraApp();
});
