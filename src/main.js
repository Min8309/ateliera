/**
 * @file main.js
 * @description Ateliera (아틀리에라) - 중간점 2차 베지어 곡선 보간, 가우시안 스탬프, 조색 패드 및 저지연 입력 파이프라인
 * 
 * [2주차 핵심 기능]
 * 1. 중간점 2차 베지어(Midpoint Quadratic Bézier) 실시간 곡선 보간 및 균일 스탬핑 (Spacing: 0.15)
 * 2. 가우시안 페이드 브러시 팁 사전 생성(Pre-bake) 및 필압 매핑 공식 (size = brushSize * P^1.2, alpha = baseOpacity * P)
 * 3. 지우개 도구 (destination-out) 및 완전한 Undo / Redo 스택
 * 4. 14종 전문 수채화 안료 팔레트 & 실제 물감 조색(Color Mixing Pad) 픽셀 스포이드 엔진
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { AtelierEnvironment } from './environment/AtelierEnvironment.js';
import { FrameBuilder } from './frame/FrameBuilder.js';
import { CompletionManager } from './completion/CompletionManager.js';
import { createPoint, createStroke, createArtwork } from './types/DataModels.js';

/* ==========================================================================
   1. 듀얼 캔버스 레이어 관리자 (저지연 desynchronized 옵션)
   ========================================================================== */
export class DualCanvasManager {
  /**
   * @param {number} size - 캔버스 해상도 (2048x2048)
   */
  constructor(size = 2048) {
    this.size = size;

    // 백그라운드 캔버스
    this.bgCanvas = document.createElement('canvas');
    this.bgCanvas.width = this.size;
    this.bgCanvas.height = this.size;
    this.bgCtx = this.bgCanvas.getContext('2d', { willReadFrequently: true });

    // 액티브 캔버스 (저지연 드로잉 레이어)
    this.activeCanvas = document.createElement('canvas');
    this.activeCanvas.width = this.size;
    this.activeCanvas.height = this.size;
    this.activeCtx = this.activeCanvas.getContext('2d', {
      desynchronized: true,
      willReadFrequently: false
    });

    // 최종 디스플레이 캔버스 (Three.js 텍스처 소스)
    this.displayCanvas = document.createElement('canvas');
    this.displayCanvas.width = this.size;
    this.displayCanvas.height = this.size;
    this.displayCtx = this.displayCanvas.getContext('2d', {
      desynchronized: true,
      willReadFrequently: false
    });

    // Three.js CanvasTexture 생성
    this.texture = new THREE.CanvasTexture(this.displayCanvas);
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = true;
    this.texture.colorSpace = THREE.SRGBColorSpace;

    // 수채화 전용 따뜻한 미색(Cream Ivory) 바탕지 초기화
    this.initPaperBackground();
  }

  initPaperBackground() {
    this.bgCtx.save();
    this.bgCtx.globalCompositeOperation = 'source-over';
    this.bgCtx.fillStyle = '#FDF8F0';
    this.bgCtx.fillRect(0, 0, this.size, this.size);

    // 미세한 종이 결(Grain) 패턴 생성
    const grainCanvas = document.createElement('canvas');
    grainCanvas.width = 64;
    grainCanvas.height = 64;
    const gCtx = grainCanvas.getContext('2d');
    const imgData = gCtx.createImageData(64, 64);
    for (let i = 0; i < imgData.data.length; i += 4) {
      const val = (Math.random() - 0.5) * 10;
      imgData.data[i] = 235 + val;
      imgData.data[i + 1] = 228 + val;
      imgData.data[i + 2] = 215 + val;
      imgData.data[i + 3] = 7;
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

  clearActive() {
    this.activeCtx.clearRect(0, 0, this.size, this.size);
  }

  /**
   * 스트로크 완료 시 커밋 (지우개 도구인 경우 destination-out으로 합성)
   * @param {'brush'|'eraser'} tool
   */
  commitActiveToBackground(tool = 'brush') {
    this.bgCtx.save();
    if (tool === 'eraser') {
      this.bgCtx.globalCompositeOperation = 'destination-out';
    } else {
      this.bgCtx.globalCompositeOperation = 'source-over';
    }
    this.bgCtx.drawImage(this.activeCanvas, 0, 0);
    this.bgCtx.restore();

    this.clearActive();
    this.updateDisplay();
  }

  updateDisplay() {
    this.displayCtx.clearRect(0, 0, this.size, this.size);
    this.displayCtx.drawImage(this.bgCanvas, 0, 0);
    this.displayCtx.drawImage(this.activeCanvas, 0, 0);
    this.texture.needsUpdate = true;
  }

  clearAll() {
    this.clearActive();
    this.initPaperBackground();
  }

  uvToCanvasCoords(uv) {
    return {
      x: uv.x * this.size,
      y: (1.0 - uv.y) * this.size
    };
  }
}

/* ==========================================================================
   2. 중간점 베지어 보간 및 가우시안 스탬프 브러시 엔진 (BezierStampEngine)
   ========================================================================== */
export class BezierStampEngine {
  /**
   * @param {DualCanvasManager} dualCanvas
   */
  constructor(dualCanvas) {
    this.dualCanvas = dualCanvas;

    // 도구 기본 속성
    this.tool = 'brush';       // 'brush' | 'eraser'
    this.color = '#1B3B6F';    // 기본 군청색
    this.baseSize = 32;        // 1 ~ 100px
    this.baseOpacity = 0.12;   // 0.05 ~ 1.0
    this.spacingRatio = 0.15;  // 스탬프 간격 비율 (0.15)

    // 연속 곡선 보간용 포인트 버퍼
    this.points = [];

    // 가우시안 팁 오프스크린 캔버스 캐시 (Pre-bake Cache)
    this.tipCache = new Map();
  }

  /**
   * 가우시안 페이드 브러시 팁 사전 생성(Pre-bake)
   * @param {string} color
   * @returns {HTMLCanvasElement}
   */
  getGaussianTip(color) {
    const key = color;
    if (this.tipCache.has(key)) {
      return this.tipCache.get(key);
    }

    const tipCanvas = document.createElement('canvas');
    const radius = 64;
    tipCanvas.width = radius * 2;
    tipCanvas.height = radius * 2;
    const ctx = tipCanvas.getContext('2d');

    const grad = ctx.createRadialGradient(radius, radius, 0, radius, radius, radius);
    grad.addColorStop(0, color);
    grad.addColorStop(0.35, color);
    grad.addColorStop(0.75, color);
    grad.addColorStop(1, 'transparent');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(radius, radius, radius, 0, Math.PI * 2);
    ctx.fill();

    this.tipCache.set(key, tipCanvas);
    return tipCanvas;
  }

  /**
   * 필압 매핑 공식 적용
   * @param {number} pressure
   */
  calcEffectiveSize(pressure) {
    const p = Math.max(0.01, Math.min(1.0, pressure));
    return this.baseSize * Math.max(0.12, Math.pow(p, 1.2));
  }

  calcEffectiveAlpha(pressure) {
    const p = Math.max(0.01, Math.min(1.0, pressure));
    return this.baseOpacity * Math.max(0.15, p);
  }

  /**
   * 스트로크 시작
   */
  startStroke(pt) {
    this.points = [pt];

    const ctx = this.dualCanvas.activeCtx;
    this.renderStamp(ctx, pt.x, pt.y, pt.pressure);
    this.dualCanvas.updateDisplay();
  }

  /**
   * 스트로크 진행 (중간점 기반 2차 베지어 곡선 보간 및 균일 스탬핑)
   */
  addPoint(pt) {
    this.points.push(pt);
    const len = this.points.length;
    const ctx = this.dualCanvas.activeCtx;

    if (len === 2) {
      // 포인트가 2개인 초기 구간: 선형 보간
      this.interpolateLinear(ctx, this.points[0], this.points[1]);
    } else if (len >= 3) {
      // 포인트가 3개 이상: 중간점 2차 베지어 곡선 보간
      const p0 = this.points[len - 3];
      const p1 = this.points[len - 2];
      const p2 = this.points[len - 1];

      // 시작 중간점 M0, 종료 중간점 M1, 제어점 P1
      const m0 = {
        x: (p0.x + p1.x) / 2,
        y: (p0.y + p1.y) / 2,
        pressure: (p0.pressure + p1.pressure) / 2
      };
      const m1 = {
        x: (p1.x + p2.x) / 2,
        y: (p1.y + p2.y) / 2,
        pressure: (p1.pressure + p2.pressure) / 2
      };

      this.interpolateBezier(ctx, m0, p1, m1);
    }

    this.dualCanvas.updateDisplay();
  }

  /**
   * 두 점 사이 선형 보간 드로잉
   */
  interpolateLinear(ctx, p1, p2) {
    const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const avgPressure = (p1.pressure + p2.pressure) / 2;
    const size = this.calcEffectiveSize(avgPressure);

    const step = Math.max(1.0, size * this.spacingRatio);
    const steps = Math.ceil(dist / step);

    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = p1.x + (p2.x - p1.x) * t;
      const y = p1.y + (p2.y - p1.y) * t;
      const pressure = p1.pressure + (p2.pressure - p1.pressure) * t;
      this.renderStamp(ctx, x, y, pressure);
    }
  }

  /**
   * 중간점 기반 2차 베지어 곡선 보간 (Bézier Interpolation)
   * B(t) = (1-t)^2 * M0 + 2(1-t)t * P1 + t^2 * M1
   */
  interpolateBezier(ctx, m0, p1, m1) {
    // 2차 베지어 곡선 호 길이 근사치
    const approxDist = Math.hypot(p1.x - m0.x, p1.y - m0.y) + Math.hypot(m1.x - p1.x, m1.y - p1.y);
    const avgPressure = (m0.pressure + p1.pressure + m1.pressure) / 3;
    const size = this.calcEffectiveSize(avgPressure);

    const step = Math.max(1.0, size * this.spacingRatio);
    const steps = Math.max(2, Math.ceil(approxDist / step));

    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const invT = 1 - t;

      const x = invT * invT * m0.x + 2 * invT * t * p1.x + t * t * m1.x;
      const y = invT * invT * m0.y + 2 * invT * t * p1.y + t * t * m1.y;
      const pressure = invT * m0.pressure + t * m1.pressure;

      this.renderStamp(ctx, x, y, pressure);
    }
  }

  /**
   * 스탬프 단일 렌더링 (가우시안 팁 & 지우개 destination-out 처리)
   */
  renderStamp(ctx, x, y, pressure) {
    const size = this.calcEffectiveSize(pressure);
    const alpha = this.calcEffectiveAlpha(pressure);
    const radius = size / 2;
    if (radius <= 0.2) return;

    ctx.save();

    if (this.tool === 'eraser') {
      // 지우개 모드: destination-out으로 알파를 부드럽게 깎아냄
      ctx.globalCompositeOperation = 'destination-out';
      ctx.globalAlpha = Math.min(1.0, alpha * 2.2);

      const grad = ctx.createRadialGradient(x, y, radius * 0.2, x, y, radius);
      grad.addColorStop(0, 'rgba(0,0,0,1)');
      grad.addColorStop(0.7, 'rgba(0,0,0,0.8)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // 수채화 브러시 모드: 사전 생성된 가우시안 팁 오프스크린 고속 스탬핑
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = alpha;

      const tipCanvas = this.getGaussianTip(this.color);
      ctx.drawImage(tipCanvas, x - radius, y - radius, size, size);
    }

    ctx.restore();
  }

  /**
   * 스트로크 종료
   */
  endStroke() {
    this.dualCanvas.commitActiveToBackground(this.tool);
    this.points = [];
  }
}

/* ==========================================================================
   3. 메인 Ateliera 플랫폼 통합 애플리케이션
   ========================================================================== */
class AtelieraApp {
  constructor() {
    this.canvasEl = document.getElementById('webgl-canvas');
    this.dualCanvas = new DualCanvasManager(2048);
    this.brush = new BezierStampEngine(this.dualCanvas);

    // 규격화된 Artwork 객체 및 Redo 스택
    this.currentArtwork = createArtwork(2048, 2048);
    this.currentStroke = null;
    this.undoneStrokes = [];

    // 성능 및 지연 측정 지표
    this.totalCoalescedCount = 0;
    this.lastLatency = 0;
    this.lastTime = performance.now();
    this.frameCount = 0;
    this.fps = 60.0;
    this.frameTime = 16.6;

    // 상태 플래그
    this.isDrawing = false;
    this.isDrawingBlocked = false;
    this.lastPointerPos = null;
    this.lastPointerTime = 0;

    this.clock = new THREE.Clock();

    // Three.js 씬 구축
    this.initThree();

    // 환경 및 확장 모듈 초기화
    this.environment = new AtelierEnvironment(this.scene, this.camera);
    this.frameBuilder = new FrameBuilder(this.scene);
    this.completionManager = new CompletionManager({
      camera: this.camera,
      controls: this.controls,
      drawingPlane: this.drawingPlane,
      dualCanvas: this.dualCanvas,
      frameBuilder: this.frameBuilder,
      strokesData: this.currentArtwork.strokes,
      setDrawingBlocked: this.setDrawingBlocked.bind(this)
    });

    // UI, HUD, 조색 패드 및 저지연 Pointer Events 바인딩
    this.initUI();
    this.initHUD();
    this.initMixingPad();
    this.bindPointerEvents();

    // 렌더 루프 가동
    this.animate();
  }

  /**
   * Three.js 뷰포트 & 레티나 devicePixelRatio 스케일링
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
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // 3D 이젤 형태의 Quad 메쉬 (PlaneGeometry(2, 2))
    const planeGeo = new THREE.PlaneGeometry(2, 2);
    const planeMat = new THREE.MeshStandardMaterial({
      map: this.dualCanvas.texture,
      roughness: 0.88,
      metalness: 0.0,
      emissive: 0xfdf8f0,
      emissiveIntensity: 0.36
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

  /* ==========================================================================
     4. 고정밀 입력 수집 파이프라인 (e.getCoalescedEvents() 대응)
     ========================================================================== */
  bindPointerEvents() {
    this.canvasEl.addEventListener('pointerdown', this.onPointerDown.bind(this));
    window.addEventListener('pointermove', this.onPointerMove.bind(this));
    window.addEventListener('pointerup', this.onPointerUp.bind(this));
    window.addEventListener('pointercancel', this.onPointerUp.bind(this));
  }

  getNormalizedPointer(event) {
    const rect = this.canvasEl.getBoundingClientRect();
    return new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
  }

  raycastPoint(pointerVec) {
    this.raycaster.setFromCamera(pointerVec, this.camera);
    const intersects = this.raycaster.intersectObject(this.drawingPlane, false);
    return intersects.length > 0 ? intersects[0] : null;
  }

  resolvePressure(event, currentCoord, prevCoord, dt) {
    if (event.pointerType === 'pen' || (event.pressure > 0 && event.pressure !== 0.5)) {
      return event.pressure;
    }
    if (!prevCoord || dt <= 0) return 0.5;
    const dist = Math.hypot(currentCoord.x - prevCoord.x, currentCoord.y - prevCoord.y);
    const speed = dist / dt;
    return THREE.MathUtils.clamp(1.0 - speed * 0.42, 0.28, 0.95);
  }

  onPointerDown(e) {
    if (this.isDrawingBlocked || e.button !== 0) return;

    const tInputStart = performance.now();
    const ptrVec = this.getNormalizedPointer(e);
    const hit = this.raycastPoint(ptrVec);

    if (hit && hit.uv) {
      this.isDrawing = true;
      const coords = this.dualCanvas.uvToCanvasCoords(hit.uv);
      const pressure = this.resolvePressure(e, coords, null, 1);

      this.currentStroke = createStroke({
        tool: this.brush.tool,
        color: this.brush.color,
        size: this.brush.baseSize,
        opacity: this.brush.baseOpacity
      });

      const firstPt = createPoint(coords.x, coords.y, pressure, tInputStart);
      this.currentStroke.points.push(firstPt);

      this.brush.startStroke(firstPt);

      this.lastPointerPos = coords;
      this.lastPointerTime = tInputStart;

      this.recordLatency(tInputStart);
    }
  }

  onPointerMove(e) {
    if (!this.isDrawing || this.isDrawingBlocked) return;

    const tInputStart = performance.now();

    const coalescedEvents = (typeof e.getCoalescedEvents === 'function')
      ? e.getCoalescedEvents()
      : [e];

    if (coalescedEvents.length > 1) {
      this.totalCoalescedCount += (coalescedEvents.length - 1);
    }

    for (const subEvent of coalescedEvents) {
      const ptrVec = this.getNormalizedPointer(subEvent);
      const hit = this.raycastPoint(ptrVec);

      if (hit && hit.uv) {
        const coords = this.dualCanvas.uvToCanvasCoords(hit.uv);
        const dt = Math.max(1, tInputStart - this.lastPointerTime);
        const pressure = this.resolvePressure(subEvent, coords, this.lastPointerPos, dt);

        const pt = createPoint(coords.x, coords.y, pressure, tInputStart);

        if (this.currentStroke) {
          this.currentStroke.points.push(pt);
        }

        this.brush.addPoint(pt);

        this.lastPointerPos = coords;
        this.lastPointerTime = tInputStart;
      }
    }

    this.recordLatency(tInputStart);
  }

  onPointerUp(e) {
    if (!this.isDrawing) return;
    this.isDrawing = false;

    this.brush.endStroke();

    if (this.currentStroke && this.currentStroke.points.length > 0) {
      this.currentArtwork.strokes.push(this.currentStroke);
      this.undoneStrokes = []; // 새 작업 시 Redo 스택 클리어
      this.updateHUDStats();
      this.updateHistoryButtons();
    }

    this.currentStroke = null;
    this.lastPointerPos = null;
  }

  recordLatency(tInputStart) {
    this.lastLatency = performance.now() - tInputStart;
    const latencyEl = document.getElementById('hud-latency');
    if (latencyEl) {
      latencyEl.innerHTML = `${this.lastLatency.toFixed(1)} <small>ms</small>`;
    }
  }

  /* ==========================================================================
     5. 실제 물감 조색 패드 (Color Mixing Pad) 구현
     ========================================================================== */
  initMixingPad() {
    const popover = document.getElementById('mixing-palette-popover');
    const toggleBtn = document.getElementById('btn-toggle-mixing');
    const mixingCanvas = document.getElementById('mixing-canvas');
    const btnClean = document.getElementById('btn-clean-pad');
    const btnClose = document.getElementById('btn-close-mixing');
    const previewChip = document.getElementById('preview-mixed-color');
    const dragHandle = document.getElementById('mixing-drag-handle');

    if (!mixingCanvas) return;
    const mCtx = mixingCanvas.getContext('2d', { willReadFrequently: true });

    // 조색 캔버스 도자기 백자 텍스처 초기화
    const resetMixingCanvas = () => {
      mCtx.save();
      mCtx.fillStyle = '#FBF8F2';
      mCtx.fillRect(0, 0, mixingCanvas.width, mixingCanvas.height);

      // 은은한 오목한 접시 그림자
      const grad = mCtx.createRadialGradient(
        mixingCanvas.width / 2, mixingCanvas.height / 2, 20,
        mixingCanvas.width / 2, mixingCanvas.height / 2, 160
      );
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(1, 'rgba(0,0,0,0.06)');
      mCtx.fillStyle = grad;
      mCtx.fillRect(0, 0, mixingCanvas.width, mixingCanvas.height);
      mCtx.restore();
    };

    resetMixingCanvas();

    // 토글 팝오버
    toggleBtn.addEventListener('click', () => {
      const isActive = popover.classList.toggle('active');
      toggleBtn.classList.toggle('active', isActive);
    });

    if (btnClose) {
      btnClose.addEventListener('click', () => {
        popover.classList.remove('active');
        toggleBtn.classList.remove('active');
      });
    }

    btnClean.addEventListener('click', () => {
      resetMixingCanvas();
    });

    // --- 헤더 드래그 이동 로직 (Draggable Floating Panel) ---
    let isDraggingPanel = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let panelInitialLeft = 0;
    let panelInitialTop = 0;

    if (dragHandle) {
      dragHandle.addEventListener('pointerdown', (e) => {
        if (e.target.closest('button') || e.target.closest('input')) return;

        isDraggingPanel = true;
        dragHandle.classList.add('dragging');

        const rect = popover.getBoundingClientRect();
        panelInitialLeft = rect.left;
        panelInitialTop = rect.top;
        dragStartX = e.clientX;
        dragStartY = e.clientY;

        // 고정 위치를 픽셀 절대 좌표로 전환
        popover.style.right = 'auto';
        popover.style.bottom = 'auto';
        popover.style.left = `${panelInitialLeft}px`;
        popover.style.top = `${panelInitialTop}px`;

        dragHandle.setPointerCapture(e.pointerId);
      });

      dragHandle.addEventListener('pointermove', (e) => {
        if (!isDraggingPanel) return;

        const dx = e.clientX - dragStartX;
        const dy = e.clientY - dragStartY;

        let nextLeft = panelInitialLeft + dx;
        let nextTop = panelInitialTop + dy;

        // 화면 밖으로 이탈 방지 클램핑
        const padW = popover.offsetWidth || 340;
        const padH = popover.offsetHeight || 240;
        nextLeft = Math.max(10, Math.min(window.innerWidth - padW - 10, nextLeft));
        nextTop = Math.max(10, Math.min(window.innerHeight - padH - 10, nextTop));

        popover.style.left = `${nextLeft}px`;
        popover.style.top = `${nextTop}px`;
      });

      const stopDrag = (e) => {
        if (isDraggingPanel) {
          isDraggingPanel = false;
          dragHandle.classList.remove('dragging');
          try {
            dragHandle.releasePointerCapture(e.pointerId);
          } catch (_) {}
        }
      };

      dragHandle.addEventListener('pointerup', stopDrag);
      dragHandle.addEventListener('pointercancel', stopDrag);
    }

    // 조색 패드 드로잉 & 컬러 스포이드 채취
    let isMixing = false;

    const drawOnMixingPad = (e) => {
      const rect = mixingCanvas.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * mixingCanvas.width;
      const y = ((e.clientY - rect.top) / rect.height) * mixingCanvas.height;

      mCtx.save();
      mCtx.globalAlpha = Math.min(0.28, this.brush.baseOpacity * 1.5);
      mCtx.globalCompositeOperation = 'source-over';

      const radius = Math.max(12, this.brush.baseSize * 0.45);
      const grad = mCtx.createRadialGradient(x, y, radius * 0.1, x, y, radius);
      grad.addColorStop(0, this.brush.color);
      grad.addColorStop(0.8, this.brush.color);
      grad.addColorStop(1, 'transparent');

      mCtx.fillStyle = grad;
      mCtx.beginPath();
      mCtx.arc(x, y, radius, 0, Math.PI * 2);
      mCtx.fill();
      mCtx.restore();

      // 드래그 또는 클릭 지점의 혼합 픽셀 색상 실시간 채취(Eyedropper Pick)
      const pixel = mCtx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
      if (pixel[3] > 10) {
        const hex = `#${((1 << 24) + (pixel[0] << 16) + (pixel[1] << 8) + pixel[2]).toString(16).slice(1)}`;
        this.brush.color = hex;
        if (previewChip) previewChip.style.background = hex;

        // 메인 컬러 팔레트 active 상태 갱신
        const swatches = document.querySelectorAll('.color-swatch');
        swatches.forEach(s => s.classList.remove('active'));
      }
    };

    mixingCanvas.addEventListener('pointerdown', (e) => {
      isMixing = true;
      drawOnMixingPad(e);
    });

    window.addEventListener('pointermove', (e) => {
      if (!isMixing) return;
      drawOnMixingPad(e);
    });

    window.addEventListener('pointerup', () => {
      isMixing = false;
    });
  }

  /* ==========================================================================
     6. UI 컨트롤, 도구 툴바, Undo / Redo 스택
     ========================================================================== */
  initHUD() {
    const toggleBtn = document.getElementById('btn-toggle-hud');
    const content = document.getElementById('hud-content');
    if (toggleBtn && content) {
      toggleBtn.addEventListener('click', () => {
        const isCollapsed = content.classList.toggle('collapsed');
        toggleBtn.textContent = isCollapsed ? '+' : '−';
      });
    }
  }

  updateHUDStats() {
    const strokesEl = document.getElementById('hud-strokes');
    const pointsEl = document.getElementById('hud-points');
    const coalescedEl = document.getElementById('hud-coalesced');

    const totalStrokes = this.currentArtwork.strokes.length;
    let totalPoints = 0;
    for (const s of this.currentArtwork.strokes) {
      totalPoints += s.points.length;
    }

    if (strokesEl) strokesEl.textContent = totalStrokes;
    if (pointsEl) pointsEl.textContent = totalPoints;
    if (coalescedEl) coalescedEl.innerHTML = `${this.totalCoalescedCount} <small>pts</small>`;
  }

  initUI() {
    // 도구 전환 (브러시 ↔ 지우개)
    const btnBrush = document.getElementById('btn-tool-brush');
    const btnEraser = document.getElementById('btn-tool-eraser');

    if (btnBrush && btnEraser) {
      btnBrush.addEventListener('click', () => {
        btnBrush.classList.add('active');
        btnEraser.classList.remove('active');
        this.brush.tool = 'brush';
      });

      btnEraser.addEventListener('click', () => {
        btnEraser.classList.add('active');
        btnBrush.classList.remove('active');
        this.brush.tool = 'eraser';
      });
    }

    // 상단 액션 버튼
    document.getElementById('btn-clear').addEventListener('click', () => this.clearCanvas());
    document.getElementById('btn-undo').addEventListener('click', () => this.undo());
    document.getElementById('btn-redo').addEventListener('click', () => this.redo());
    document.getElementById('btn-timelapse').addEventListener('click', () => this.playTimelapse());
    document.getElementById('btn-export').addEventListener('click', () => this.exportJSON());

    // 14종 컬러 팔레트 스와치
    const swatches = document.querySelectorAll('.color-swatch');
    swatches.forEach(swatch => {
      swatch.addEventListener('click', () => {
        swatches.forEach(s => s.classList.remove('active'));
        swatch.classList.add('active');
        const color = swatch.getAttribute('data-color');
        this.brush.color = color;
        // 지우개 모드였다면 자동으로 브러시 모드로 복귀
        if (this.brush.tool === 'eraser' && btnBrush && btnEraser) {
          btnBrush.classList.add('active');
          btnEraser.classList.remove('active');
          this.brush.tool = 'brush';
        }
      });
    });

    // 커스텀 네이티브 컬러 피커
    const customPicker = document.getElementById('custom-color-picker');
    if (customPicker) {
      customPicker.addEventListener('input', (e) => {
        swatches.forEach(s => s.classList.remove('active'));
        this.brush.color = e.target.value;
      });
    }

    // 슬라이더 (크기 & 불투명도)
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
      this.brush.baseOpacity = val / 100;
    });

    this.updateHistoryButtons();
  }

  updateHistoryButtons() {
    const btnUndo = document.getElementById('btn-undo');
    const btnRedo = document.getElementById('btn-redo');

    if (btnUndo) btnUndo.disabled = this.currentArtwork.strokes.length === 0;
    if (btnRedo) btnRedo.disabled = this.undoneStrokes.length === 0;
  }

  clearCanvas() {
    if (this.isDrawingBlocked) return;
    if (this.currentArtwork.strokes.length > 0 && !confirm('캔버스와 모든 스트로크 기록을 지우시겠습니까?')) {
      return;
    }
    this.currentArtwork.strokes = [];
    this.undoneStrokes = [];
    this.totalCoalescedCount = 0;
    this.dualCanvas.clearAll();
    this.updateHUDStats();
    this.updateHistoryButtons();
  }

  /**
   * 실행 취소 (Undo)
   */
  undo() {
    if (this.isDrawingBlocked || this.currentArtwork.strokes.length === 0) return;

    const undone = this.currentArtwork.strokes.pop();
    this.undoneStrokes.push(undone);

    this.redrawAllStrokes();
    this.updateHUDStats();
    this.updateHistoryButtons();
  }

  /**
   * 다시 실행 (Redo)
   */
  redo() {
    if (this.isDrawingBlocked || this.undoneStrokes.length === 0) return;

    const redone = this.undoneStrokes.pop();
    this.currentArtwork.strokes.push(redone);

    this.redrawAllStrokes();
    this.updateHUDStats();
    this.updateHistoryButtons();
  }

  /**
   * 전체 스트로크 스택을 순서대로 백그라운드 캔버스에 재렌더링
   */
  redrawAllStrokes() {
    this.dualCanvas.clearAll();
    const ctx = this.dualCanvas.bgCtx;

    for (const stroke of this.currentArtwork.strokes) {
      const pts = stroke.points;
      if (!pts || pts.length === 0) continue;

      // 도구별 상태 백업
      const prevTool = this.brush.tool;
      const prevColor = this.brush.color;
      const prevSize = this.brush.baseSize;
      const prevOpacity = this.brush.baseOpacity;

      this.brush.tool = stroke.tool || 'brush';
      this.brush.color = stroke.color || '#1B3B6F';
      this.brush.baseSize = stroke.size || 32;
      this.brush.baseOpacity = stroke.opacity || 0.12;

      if (pts.length === 1) {
        this.brush.renderStamp(ctx, pts[0].x, pts[0].y, pts[0].pressure);
      } else if (pts.length === 2) {
        this.brush.interpolateLinear(ctx, pts[0], pts[1]);
      } else {
        for (let i = 2; i < pts.length; i++) {
          const p0 = pts[i - 2];
          const p1 = pts[i - 1];
          const p2 = pts[i];
          const m0 = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2, pressure: (p0.pressure + p1.pressure) / 2 };
          const m1 = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2, pressure: (p1.pressure + p2.pressure) / 2 };
          this.brush.interpolateBezier(ctx, m0, p1, m1);
        }
      }

      this.brush.tool = prevTool;
      this.brush.color = prevColor;
      this.brush.baseSize = prevSize;
      this.brush.baseOpacity = prevOpacity;
    }

    this.dualCanvas.updateDisplay();
  }

  playTimelapse() {
    if (this.isDrawingBlocked) return;
    if (this.currentArtwork.strokes.length === 0) {
      alert('재생할 스트로크 데이터가 없습니다. 먼저 그림을 그려보세요!');
      return;
    }

    this.setDrawingBlocked(true);
    this.dualCanvas.clearAll();

    const strokes = [...this.currentArtwork.strokes];
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

      const stroke = strokes[strokeIdx];
      const pts = stroke.points;
      const pointsPerFrame = 4;
      const endIdx = Math.min(pts.length, pointIdx + pointsPerFrame);

      const prevTool = this.brush.tool;
      const prevColor = this.brush.color;
      const prevSize = this.brush.baseSize;
      const prevOpacity = this.brush.baseOpacity;

      this.brush.tool = stroke.tool || 'brush';
      this.brush.color = stroke.color || '#1B3B6F';
      this.brush.baseSize = stroke.size || 32;
      this.brush.baseOpacity = stroke.opacity || 0.12;

      for (let i = pointIdx; i < endIdx; i++) {
        if (i === 0) {
          this.brush.renderStamp(ctx, pts[0].x, pts[0].y, pts[0].pressure);
        } else if (i === 1) {
          this.brush.interpolateLinear(ctx, pts[0], pts[1]);
        } else {
          const p0 = pts[i - 2];
          const p1 = pts[i - 1];
          const p2 = pts[i];
          const m0 = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2, pressure: (p0.pressure + p1.pressure) / 2 };
          const m1 = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2, pressure: (p1.pressure + p2.pressure) / 2 };
          this.brush.interpolateBezier(ctx, m0, p1, m1);
        }
      }

      this.brush.tool = prevTool;
      this.brush.color = prevColor;
      this.brush.baseSize = prevSize;
      this.brush.baseOpacity = prevOpacity;

      pointIdx = endIdx;
      if (pointIdx >= pts.length) {
        strokeIdx++;
        pointIdx = 0;
      }

      this.dualCanvas.updateDisplay();
      requestAnimationFrame(animateStep);
    };

    requestAnimationFrame(animateStep);
  }

  setDrawingBlocked(blocked) {
    this.isDrawingBlocked = blocked;

    const banner = document.getElementById('timelapse-banner');
    if (banner) {
      if (blocked) banner.classList.add('active');
      else banner.classList.remove('active');
    }

    const buttons = document.querySelectorAll('.panel-btn, .btn-finish, .btn-tool-tab');
    buttons.forEach(btn => {
      btn.disabled = blocked;
    });
  }

  exportJSON() {
    console.group('🎨 [Ateliera] Exported Artwork JSON');
    console.log(this.currentArtwork);
    console.groupEnd();

    const blob = new Blob([JSON.stringify(this.currentArtwork, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ateliera-${this.currentArtwork.id}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  animate() {
    requestAnimationFrame(this.animate.bind(this));

    const now = performance.now();
    const delta = this.clock.getDelta();

    // FPS 및 프레임 타임 계산
    this.frameCount++;
    if (now - this.lastTime >= 500) {
      this.fps = (this.frameCount * 1000) / (now - this.lastTime);
      this.frameTime = 1000 / Math.max(1, this.fps);
      this.frameCount = 0;
      this.lastTime = now;

      const fpsEl = document.getElementById('hud-fps');
      const ftEl = document.getElementById('hud-frametime');
      if (fpsEl && ftEl) {
        fpsEl.innerHTML = `${this.fps.toFixed(1)} <small>fps</small> (<span id="hud-frametime">${this.frameTime.toFixed(1)}</span>ms)`;
      }
    }

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
