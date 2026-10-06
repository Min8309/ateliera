/**
 * @file main.js
 * @description Ateliera (아틀리에라) - 저지연 입력 파이프라인 및 드로잉 기반 구축 통합 진입점
 * 
 * [핵심 파이프라인]
 * 1. 저지연 캔버스 렌더러 (desynchronized: true, devicePixelRatio 스케일링)
 * 2. e.getCoalescedEvents() 기반 고정밀 입력 수집 파이프라인
 * 3. 하이브리드 필압 정규화 (스타일러스 펜 하드웨어 필압 + 속도 감쇠 가상 필압)
 * 4. Input-to-Screen 레이턴시(ms) & FPS 실시간 디버그 HUD
 * 5. 규격화된 데이터 모델 (Point, Stroke, Artwork) 실시간 누적 관리
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { AtelierEnvironment } from './environment/AtelierEnvironment.js';
import { FrameBuilder } from './frame/FrameBuilder.js';
import { CompletionManager } from './completion/CompletionManager.js';
import { createPoint, createStroke, createArtwork } from './types/DataModels.js';

/* ==========================================================================
   1. 듀얼 캔버스 레이어 관리자 (저지연 desynchronized 옵션 적용)
   ========================================================================== */
export class DualCanvasManager {
  /**
   * @param {number} size - 캔버스 가로/세로 해상도 (2048x2048)
   */
  constructor(size = 2048) {
    this.size = size;

    // 1-1. 백그라운드 캔버스: 완료된 이전 획들이 영구 보관되는 캔버스
    this.bgCanvas = document.createElement('canvas');
    this.bgCanvas.width = this.size;
    this.bgCanvas.height = this.size;
    this.bgCtx = this.bgCanvas.getContext('2d', { willReadFrequently: false });

    // 1-2. 액티브 캔버스: 저지연 렌더링을 위해 desynchronized: true 적용
    this.activeCanvas = document.createElement('canvas');
    this.activeCanvas.width = this.size;
    this.activeCanvas.height = this.size;
    this.activeCtx = this.activeCanvas.getContext('2d', {
      desynchronized: true,
      willReadFrequently: false
    });

    // 1-3. 최종 디스플레이 캔버스: 저지연 합성 버퍼 (Three.js CanvasTexture 소스)
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

  /**
   * 수채화 캔버스지 질감 초기화 (따뜻하고 화사한 크림 미색 + 은은한 종이 결)
   */
  initPaperBackground() {
    this.bgCtx.save();
    this.bgCtx.fillStyle = '#FDF8F0';
    this.bgCtx.fillRect(0, 0, this.size, this.size);

    // 미세한 종이 결(Grain) 패턴 생성 (밝고 은은한 베이지 톤)
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

  /**
   * 액티브 캔버스 클리어
   */
  clearActive() {
    this.activeCtx.clearRect(0, 0, this.size, this.size);
  }

  /**
   * 스트로크 완료 시: activeCanvas 내용을 backgroundCanvas에 스탬핑하고 activeCanvas 클리어
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
    this.tool = 'brush';
    this.color = '#2F528F';
    this.baseSize = 32;
    this.opacity = 0.12;

    this.currentPoints = [];
    this.lastPoint = null;
  }

  /**
   * 스트로크 시작
   * @param {import('./types/DataModels.js').Point} pt
   */
  startStroke(pt) {
    this.currentPoints = [pt];
    this.lastPoint = pt;

    const effectiveSize = this.calcEffectiveSize(this.baseSize, pt.pressure);
    this.drawWatercolorStamp(this.dualCanvas.activeCtx, pt.x, pt.y, effectiveSize, this.opacity, this.color);
    this.dualCanvas.updateDisplay();
  }

  /**
   * 스트로크 연속 보간 및 렌더링
   * @param {import('./types/DataModels.js').Point} pt
   */
  addPoint(pt) {
    if (!this.lastPoint) {
      this.startStroke(pt);
      return;
    }

    const dist = Math.hypot(pt.x - this.lastPoint.x, pt.y - this.lastPoint.y);
    // 초미세 지터 방지
    if (dist < 0.6) return;

    // 연속된 점 사이 선형 보간 렌더링
    this.interpolateAndDraw(this.dualCanvas.activeCtx, this.lastPoint, pt, this.color, this.baseSize, this.opacity);

    this.currentPoints.push(pt);
    this.lastPoint = pt;
    this.dualCanvas.updateDisplay();
  }

  /**
   * 스트로크 종료
   * @returns {import('./types/DataModels.js').Point[]}
   */
  endStroke() {
    const finishedPoints = [...this.currentPoints];
    this.dualCanvas.commitActiveToBackground();
    this.currentPoints = [];
    this.lastPoint = null;
    return finishedPoints;
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

    // 규격화된 Artwork 객체 관리
    this.currentArtwork = createArtwork(2048, 2048);
    this.currentStroke = null;

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

    // UI 및 저지연 Pointer Events 바인딩
    this.initUI();
    this.initHUD();
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
    // 레티나/고해상도 디스플레이 대응 스케일링
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

  /**
   * 단일 포인터 이벤트로부터 정규화된 마우스 벡터 산출
   */
  getNormalizedPointer(event) {
    const rect = this.canvasEl.getBoundingClientRect();
    return new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
  }

  /**
   * 정규화된 좌표로부터 3D 캔버스 교차점 계산
   */
  raycastPoint(pointerVec) {
    this.raycaster.setFromCamera(pointerVec, this.camera);
    const intersects = this.raycaster.intersectObject(this.drawingPlane, false);
    return intersects.length > 0 ? intersects[0] : null;
  }

  /**
   * 하이브리드 필압 계산 (스타일러스 하드웨어 필압 + 속도 감쇠 가상 필압)
   */
  resolvePressure(event, currentCoord, prevCoord, dt) {
    // 1. 스타일러스 펜 또는 물리 필압을 지원하는 기기
    if (event.pointerType === 'pen' || (event.pressure > 0 && event.pressure !== 0.5)) {
      return event.pressure;
    }

    // 2. 마우스/트랙패드: 이동 속도 기반 가상 필압
    if (!prevCoord || dt <= 0) return 0.5;
    const dist = Math.hypot(currentCoord.x - prevCoord.x, currentCoord.y - prevCoord.y);
    const speed = dist / dt; // 픽셀/ms
    // 빠르면 얇고 옅어지고, 느리면 굵고 진해짐
    return THREE.MathUtils.clamp(1.0 - speed * 0.42, 0.28, 0.95);
  }

  /**
   * 드로잉 시작 (pointerdown)
   */
  onPointerDown(e) {
    if (this.isDrawingBlocked || e.button !== 0) return;

    const tInputStart = performance.now();
    const ptrVec = this.getNormalizedPointer(e);
    const hit = this.raycastPoint(ptrVec);

    if (hit && hit.uv) {
      this.isDrawing = true;
      const coords = this.dualCanvas.uvToCanvasCoords(hit.uv);
      const pressure = this.resolvePressure(e, coords, null, 1);

      // 데이터 모델 규격에 맞춘 Stroke 및 첫 Point 생성
      this.currentStroke = createStroke({
        tool: this.brush.tool,
        color: this.brush.color,
        size: this.brush.baseSize,
        opacity: this.brush.opacity
      });

      const firstPt = createPoint(coords.x, coords.y, pressure, tInputStart);
      this.currentStroke.points.push(firstPt);

      // 브러시 엔진에 전달
      this.brush.startStroke(firstPt);

      this.lastPointerPos = coords;
      this.lastPointerTime = tInputStart;

      // 레이턴시 측정 (이벤트 수신 -> 렌더 완료)
      this.recordLatency(tInputStart);
    }
  }

  /**
   * 드로잉 진행 (pointermove: getCoalescedEvents() 완벽 수집)
   */
  onPointerMove(e) {
    if (!this.isDrawing || this.isDrawingBlocked) return;

    const tInputStart = performance.now();

    // [핵심] 브라우저 이벤트 큐에 뭉쳐진 미세 좌표를 전부 추출
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

    // 레이턴시 측정 및 HUD 업데이트
    this.recordLatency(tInputStart);
  }

  /**
   * 드로잉 종료 (pointerup / pointercancel)
   */
  onPointerUp(e) {
    if (!this.isDrawing) return;
    this.isDrawing = false;

    this.brush.endStroke();

    if (this.currentStroke && this.currentStroke.points.length > 0) {
      this.currentArtwork.strokes.push(this.currentStroke);
      this.updateHUDStats();
    }

    this.currentStroke = null;
    this.lastPointerPos = null;
  }

  /**
   * 실시간 지연 시간(Input Latency ms) 기록 및 HUD 반영
   */
  recordLatency(tInputStart) {
    this.lastLatency = performance.now() - tInputStart;
    const latencyEl = document.getElementById('hud-latency');
    if (latencyEl) {
      latencyEl.innerHTML = `${this.lastLatency.toFixed(1)} <small>ms</small>`;
    }
  }

  /* ==========================================================================
     5. 실시간 성능 & 지연 디버그 HUD 관리
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

  /**
   * HUD 통계 수치 갱신
   */
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
    if (this.currentArtwork.strokes.length > 0 && !confirm('캔버스와 모든 스트로크 기록을 지우시겠습니까?')) {
      return;
    }
    this.currentArtwork.strokes = [];
    this.totalCoalescedCount = 0;
    this.dualCanvas.clearAll();
    this.updateHUDStats();
  }

  undo() {
    if (this.isDrawingBlocked || this.currentArtwork.strokes.length === 0) return;

    this.currentArtwork.strokes.pop();
    this.dualCanvas.clearAll();
    const ctx = this.dualCanvas.bgCtx;

    for (const stroke of this.currentArtwork.strokes) {
      const pts = stroke.points;
      if (!pts || pts.length === 0) continue;

      if (pts.length === 1) {
        const p = pts[0];
        const size = this.brush.calcEffectiveSize(stroke.size, p.pressure);
        this.brush.drawWatercolorStamp(ctx, p.x, p.y, size, stroke.opacity, stroke.color);
      } else {
        for (let i = 0; i < pts.length - 1; i++) {
          this.brush.interpolateAndDraw(ctx, pts[i], pts[i + 1], stroke.color, stroke.size, stroke.opacity);
        }
      }
    }

    this.dualCanvas.updateDisplay();
    this.updateHUDStats();
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

      const currentStroke = strokes[strokeIdx];
      const pts = currentStroke.points;
      const pointsPerFrame = 4;
      const endIdx = Math.min(pts.length, pointIdx + pointsPerFrame);

      for (let i = pointIdx; i < endIdx; i++) {
        if (i === 0) {
          const p = pts[0];
          const size = this.brush.calcEffectiveSize(currentStroke.size, p.pressure);
          this.brush.drawWatercolorStamp(ctx, p.x, p.y, size, currentStroke.opacity, currentStroke.color);
        } else {
          this.brush.interpolateAndDraw(ctx, pts[i - 1], pts[i], currentStroke.color, currentStroke.size, currentStroke.opacity);
        }
      }

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

    const buttons = document.querySelectorAll('.panel-btn, .btn-finish');
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

    // FPS 및 프레임 타임 계산 (0.5초 간격 갱신)
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
