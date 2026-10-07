/**
 * @file main.js
 * @description Ateliera (아틀리에라) - 전략 패턴 기반 4종 브러시, 중간점 2차 베지어 곡선 보간, 조색 패드 및 저지연 입력 파이프라인
 * 
 * [브러시 전략 패턴 통합]
 * 1. BrushManager: 4종 브러시(펜, 연필/목탄, 수채, 에어브러시) + 지우개 렌더링 파이프라인
 * 2. 중간점 2차 베지어 곡선 보간 & 브러시별 고유 스탬프 간격(Spacing) 최적화
 * 3. 틸트(tiltX, tiltY) 및 필압 반응 정밀 렌더링
 * 4. 도구 전환 시 슬라이더(크기, 투명도) 자동 동기화
 * 5. 타임랩스 및 Undo/Redo 공통 렌더링 경로
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { AtelierEnvironment } from './environment/AtelierEnvironment.js';
import { FrameBuilder } from './frame/FrameBuilder.js';
import { CompletionManager } from './completion/CompletionManager.js';
import { createPoint, createStroke, createArtwork } from './types/DataModels.js';
import { DualCanvasManager } from './drawing/DualCanvas.js';
import { BezierBrushEngine } from './drawing/BrushEngine.js';
import { VolumeStrokeRenderer } from './drawing/VolumeStrokeRenderer.js';
import { CANVAS_PRESETS, canvasWorldSize, fitStrokes } from './drawing/CanvasPresets.js';

/* ==========================================================================
   3. 메인 Ateliera 플랫폼 통합 애플리케이션
   ========================================================================== */
class AtelieraApp {
  constructor() {
    this.canvasEl = document.getElementById('webgl-canvas');
    this.dualCanvas = new DualCanvasManager(2048);
    this.brush = new BezierBrushEngine(this.dualCanvas);

    // 규격화된 Artwork 객체 및 Redo 스택
    this.currentArtwork = createArtwork(2048, 2048);
    this.canvasPreset = 'square';
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
    this.activePointerId = null;
    this.isDrawingBlocked = false;
    this.lastPointerPos = null;
    this.lastPointerTime = 0;

    this.clock = new THREE.Clock();

    // Three.js 씬 구축
    this.initThree();
    this.volumeRenderer = new VolumeStrokeRenderer(this.drawingPlane);

    // 환경 및 확장 모듈 초기화
    this.environment = new AtelierEnvironment(this.scene);
    this.frameBuilder = new FrameBuilder();
    this.completionManager = new CompletionManager({
      camera: this.camera,
      controls: this.controls,
      drawingPlane: this.drawingPlane,
      dualCanvas: this.dualCanvas,
      frameBuilder: this.frameBuilder,
      getStrokes: () => this.currentArtwork.strokes,
      getArtworkImage: () => this.volumeRenderer.exportPNG(this.renderer, this.dualCanvas, this.drawingPlane),
      setDrawingBlocked: this.setDrawingBlocked.bind(this)
    });

    // UI, HUD, 조색 패드 및 저지연 Pointer Events 바인딩
    this.initUI();
    this.initStudioControls();
    this.initHUD();
    this.initMixingPad();
    this.bindPointerEvents();

    // 렌더 루프 가동
    this.animate = this.animate.bind(this);
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
    this.camera.position.set(0, 0.3, 4.1);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvasEl,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // 3D 이젤 형태의 Quad 메쉬 (PlaneGeometry(2, 2))
    const planeGeo = new THREE.PlaneGeometry(2, 2);
    const planeMat = new THREE.MeshBasicMaterial({
      map: this.dualCanvas.texture,
      toneMapped: false
    });

    this.drawingPlane = new THREE.Mesh(planeGeo, planeMat);
    this.drawingPlane.name = 'EaselCanvas';
    this.scene.add(this.drawingPlane);

    // 기본 미니멀 테두리
    const frameGeo = new THREE.BoxGeometry(2.06, 2.06, 0.03);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x1f1b17, roughness: 0.8 });
    const frameMesh = new THREE.Mesh(frameGeo, frameMat);
    frameMesh.position.z = -0.04;
    this.drawingPlane.add(frameMesh);
    this.canvasBorder = frameMesh;

    // 궤도 컨트롤러 (우클릭 회전 / 휠 줌)
    this.controls = new OrbitControls(this.camera, this.canvasEl);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxDistance = 6;
    this.controls.maxPolarAngle = Math.PI * 0.66;
    this.controls.minPolarAngle = Math.PI * 0.2;
    this.controls.enablePan = false;
    this.controls.minDistance = 0.8;

    this.controls.mouseButtons = {
      LEFT: null,                      // 좌클릭: 드로잉 전용
      MIDDLE: THREE.MOUSE.DOLLY,       // 휠 클릭: 줌
      RIGHT: THREE.MOUSE.ROTATE        // 우클릭: 뷰 회전
    };

    this.fitStudioView();
    this.raycaster = new THREE.Raycaster();

    window.addEventListener('resize', this.onResize.bind(this));
  }

  fitStudioView() {
    const distance = Math.max(4.1, 4.1 / this.camera.aspect);
    this.camera.position.set(0, .3, distance);
    this.controls.maxDistance = Math.max(6, distance * 1.3);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    if (!this.completionManager?.isFinishing) this.fitStudioView();
  }

  /* ==========================================================================
     4. 고정밀 입력 수집 파이프라인 (e.getCoalescedEvents() 대응 & 틸트 지원)
     ========================================================================== */
  bindPointerEvents() {
    this.canvasEl.addEventListener('pointerdown', this.onPointerDown.bind(this));
    window.addEventListener('pointermove', this.onPointerMove.bind(this));
    window.addEventListener('pointerup', this.onPointerUp.bind(this));
    window.addEventListener('pointercancel', this.onPointerUp.bind(this));
    this.canvasEl.addEventListener('lostpointercapture', this.onPointerUp.bind(this));
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
    if (this.isDrawing || this.isDrawingBlocked || e.button !== 0) return;

    const tInputStart = performance.now();
    const ptrVec = this.getNormalizedPointer(e);
    const hit = this.raycastPoint(ptrVec);

    if (hit && hit.uv) {
      this.isDrawing = true;
      this.activePointerId = e.pointerId;
      this.canvasEl.setPointerCapture(e.pointerId);
      const coords = this.dualCanvas.uvToCanvasCoords(hit.uv);
      const pressure = this.resolvePressure(e, coords, null, 1);
      const tiltX = e.tiltX || 0;
      const tiltY = e.tiltY || 0;

      this.currentStroke = createStroke({
        tool: this.brush.tool,
        color: this.brush.color,
        size: this.brush.baseSize,
        opacity: this.brush.baseOpacity,
        neon: this.brush.neon,
        depth: this.brush.depth
      });

      const firstPt = createPoint(coords.x, coords.y, pressure, e.timeStamp, tiltX, tiltY);
      this.currentStroke.points.push(firstPt);

      if (this.brush.tool === 'volume') {
        this.volumeRenderer.queueStroke(this.currentStroke, this.dualCanvas.width, this.dualCanvas.height);
      } else {
        this.brush.startStroke(firstPt);
        if (this.brush.tool === 'eraser') this.volumeRenderer.queueEraser(this.currentStroke);
      }

      this.lastPointerPos = coords;
      this.lastPointerTime = e.timeStamp;

      this.recordLatency(tInputStart);
    }
  }

  onPointerMove(e) {
    if (!this.isDrawing || this.isDrawingBlocked || e.pointerId !== this.activePointerId) return;

    const tInputStart = performance.now();

    const samples = e.getCoalescedEvents?.() ?? [];
    const coalescedEvents = samples.length ? samples : [e];

    if (coalescedEvents.length > 1) {
      this.totalCoalescedCount += (coalescedEvents.length - 1);
    }

    for (const subEvent of coalescedEvents) {
      const ptrVec = this.getNormalizedPointer(subEvent);
      const hit = this.raycastPoint(ptrVec);

      if (hit && hit.uv) {
        const coords = this.dualCanvas.uvToCanvasCoords(hit.uv);
        const sampleTime = subEvent.timeStamp;
        const dt = Math.max(1, sampleTime - this.lastPointerTime);
        const pressure = this.resolvePressure(subEvent, coords, this.lastPointerPos, dt);
        const tiltX = subEvent.tiltX || 0;
        const tiltY = subEvent.tiltY || 0;

        const pt = createPoint(coords.x, coords.y, pressure, sampleTime, tiltX, tiltY);

        if (this.currentStroke) {
          this.currentStroke.points.push(pt);
        }

        if (this.currentStroke?.tool === 'volume') {
          this.volumeRenderer.queueStroke(this.currentStroke, this.dualCanvas.width, this.dualCanvas.height);
        } else {
          this.brush.addPoint(pt);
          if (this.currentStroke?.tool === 'eraser') this.volumeRenderer.queueEraser(this.currentStroke);
        }

        this.lastPointerPos = coords;
        this.lastPointerTime = sampleTime;
      }
    }

    this.recordLatency(tInputStart);
  }

  onPointerUp(e) {
    if (!this.isDrawing || (e && e.pointerId !== this.activePointerId)) return;
    this.isDrawing = false;
    if (this.canvasEl.hasPointerCapture(this.activePointerId)) {
      this.canvasEl.releasePointerCapture(this.activePointerId);
    }
    this.activePointerId = null;

    if (this.currentStroke?.tool === 'volume') this.volumeRenderer.flush();
    else {
      this.brush.endStroke();
      this.volumeRenderer.flush();
    }

    if (this.currentStroke && this.currentStroke.points.length > 0) {
      this.currentArtwork.strokes.push(this.currentStroke);
      this.undoneStrokes = [];
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
     5. 드래그 이동 가능한 실제 물감 조색 패드 (Color Mixing Pad)
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

    const resetMixingCanvas = () => {
      mCtx.save();
      mCtx.fillStyle = '#FBF8F2';
      mCtx.fillRect(0, 0, mixingCanvas.width, mixingCanvas.height);

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

    // 드래그 이동 처리
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
    let mixingPointerId = null;

    const drawOnMixingPad = (e) => {
      const rect = mixingCanvas.getBoundingClientRect();
      const x = Math.max(0, Math.min(mixingCanvas.width - 1, ((e.clientX - rect.left) / rect.width) * mixingCanvas.width));
      const y = Math.max(0, Math.min(mixingCanvas.height - 1, ((e.clientY - rect.top) / rect.height) * mixingCanvas.height));

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

      const pixel = mCtx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
      if (pixel[3] > 10) {
        const hex = `#${((1 << 24) + (pixel[0] << 16) + (pixel[1] << 8) + pixel[2]).toString(16).slice(1)}`;
        this.brush.color = hex;
        this.brush.neon = false;
        if (previewChip) previewChip.style.background = hex;

        const swatches = document.querySelectorAll('.color-swatch');
        swatches.forEach(s => s.classList.remove('active'));
      }
    };

    mixingCanvas.addEventListener('pointerdown', (e) => {
      if (this.isDrawingBlocked || e.button !== 0 || mixingPointerId !== null) return;
      mixingPointerId = e.pointerId;
      mixingCanvas.setPointerCapture(e.pointerId);
      drawOnMixingPad(e);
    });

    window.addEventListener('pointermove', (e) => {
      if (e.pointerId !== mixingPointerId || this.isDrawingBlocked) return;
      drawOnMixingPad(e);
    });

    const stopMixing = (e) => {
      if (e.pointerId !== mixingPointerId) return;
      mixingPointerId = null;
      if (mixingCanvas.hasPointerCapture(e.pointerId)) mixingCanvas.releasePointerCapture(e.pointerId);
    };
    window.addEventListener('pointerup', stopMixing);
    window.addEventListener('pointercancel', stopMixing);
    mixingCanvas.addEventListener('lostpointercapture', stopMixing);
  }

  /* ==========================================================================
     6. UI 컨트롤, 도구 툴바, Undo / Redo 스택
     ========================================================================== */
  initStudioControls() {
    const presetSelect = document.getElementById('canvas-preset');
    presetSelect.addEventListener('change', () => {
      if (this.isDrawingBlocked) {
        presetSelect.value = this.canvasPreset;
        return;
      }
      this.setCanvasPreset(presetSelect.value);
    });
    document.querySelectorAll('.time-toggle button[data-time-of-day]').forEach(button => {
      button.addEventListener('click', () => {
        const mode = button.dataset.timeOfDay;
        this.environment.setTimeOfDay(mode);
        document.body.dataset.timeOfDay = mode;
        document.querySelectorAll('.time-toggle button[data-time-of-day]').forEach(item => {
          item.setAttribute('aria-pressed', String(item === button));
        });
        document.getElementById('studio-description').textContent = mode === 'day'
          ? '햇살이 드는 한강변의 오후' : '서울의 불빛이 강 위에 머무는 밤';
      });
    });
  }

  setCanvasPreset(name) {
    const preset = CANVAS_PRESETS[name];
    if (!preset || name === this.canvasPreset) return;
    this.onPointerUp();
    const previous = { width: this.dualCanvas.width, height: this.dualCanvas.height };
    this.currentArtwork.strokes = fitStrokes(this.currentArtwork.strokes, previous, preset);
    this.undoneStrokes = fitStrokes(this.undoneStrokes, previous, preset);
    this.currentArtwork.width = preset.width;
    this.currentArtwork.height = preset.height;
    this.dualCanvas.resize(preset.width, preset.height);
    this.drawingPlane.material.map = this.dualCanvas.texture;
    this.drawingPlane.material.needsUpdate = true;
    const world = canvasWorldSize(preset.width, preset.height);
    this.drawingPlane.geometry.dispose();
    this.drawingPlane.geometry = new THREE.PlaneGeometry(world.width, world.height);
    this.canvasBorder.geometry.dispose();
    this.canvasBorder.geometry = new THREE.BoxGeometry(world.width + 0.06, world.height + 0.06, 0.03);
    this.frameBuilder.removeFrame();
    this.canvasPreset = name;
    this.redrawAllStrokes();
    this.updateHUDStats();
    this.updateHistoryButtons();
    document.getElementById('canvas-dimensions').textContent = `${preset.width} × ${preset.height} px`;
  }

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
    // 4종 브러시 + 지우개 탭 전환
    const toolTabs = document.querySelectorAll('.btn-tool-tab');
    const sizeInput = document.getElementById('brush-size');
    const sizeLabel = document.getElementById('label-brush-size');
    const opacityInput = document.getElementById('brush-opacity');
    const depthControl = document.getElementById('depth-control');
    const depthInput = document.getElementById('brush-depth');
    const depthLabel = document.getElementById('label-brush-depth');
    const opacityLabel = document.getElementById('label-brush-opacity');

    toolTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        toolTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        const toolName = tab.getAttribute('data-tool');
        this.onPointerUp();
        const config = this.brush.setTool(toolName);
        depthControl.hidden = toolName !== 'volume';
        document.getElementById('volume-brush-hint').hidden = toolName !== 'volume';
        depthInput.value = this.brush.depth;
        depthLabel.textContent = `${this.brush.depth}px`;

        // 슬라이더 범위 및 값 자동 동기화
        sizeInput.min = config.minSize;
        sizeInput.max = config.maxSize;
        sizeInput.value = config.defaultSize;
        sizeLabel.textContent = `${config.defaultSize}px`;

        const opPercent = Math.round(config.defaultOpacity * 100);
        opacityInput.value = opPercent;
        opacityLabel.textContent = `${opPercent}%`;
      });
    });

    depthInput.addEventListener('input', (e) => {
      this.brush.depth = Number(e.target.value);
      depthLabel.textContent = `${this.brush.depth}px`;
    });

    // 슬라이더 (크기 & 불투명도)
    sizeInput.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      sizeLabel.textContent = `${val}px`;
      this.brush.baseSize = val;
    });

    opacityInput.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      opacityLabel.textContent = `${val}%`;
      this.brush.baseOpacity = val / 100;
    });

    // 상단 액션 버튼
    document.getElementById('btn-clear').addEventListener('click', () => this.clearCanvas());
    document.getElementById('btn-undo').addEventListener('click', () => this.undo());
    document.getElementById('btn-redo').addEventListener('click', () => this.redo());
    document.getElementById('btn-timelapse').addEventListener('click', () => this.playTimelapse());
    document.getElementById('btn-export').addEventListener('click', () => this.exportJSON());

    // 14종 컬러 팔레트 스와치
    const customPicker = document.getElementById('custom-color-picker');
    const swatches = document.querySelectorAll('.color-swatch');
    swatches.forEach(swatch => {
      swatch.addEventListener('click', () => {
        swatches.forEach(s => s.classList.remove('active'));
        swatch.classList.add('active');
        const color = swatch.getAttribute('data-color');
        this.onPointerUp();
        this.brush.color = color;
        this.brush.neon = swatch.dataset.neon === 'true';
        if (customPicker) customPicker.value = color;

        // 지우개 모드였다면 마지막 브러시 모드로 자동 복귀
        if (this.brush.tool === 'eraser') {
          const watercolorTab = document.querySelector('[data-tool="watercolor"]');
          if (watercolorTab) watercolorTab.click();
        }
      });
    });

    // 커스텀 네이티브 컬러 피커
    if (customPicker) {
      customPicker.addEventListener('input', (e) => {
        swatches.forEach(s => s.classList.remove('active'));
        this.onPointerUp();
        this.brush.color = e.target.value;
        this.brush.neon = false;
      });
    }

    document.querySelector('[data-tool="watercolor"]').click();
    this.updateHistoryButtons();
    const dock = document.querySelector('.drawing-dock');
    const updateDockHeight = () => document.documentElement.style.setProperty('--drawing-dock-height', `${dock.offsetHeight}px`);
    this.dockObserver = new ResizeObserver(updateDockHeight);
    this.dockObserver.observe(dock);
    updateDockHeight();
  }

  updateHistoryButtons() {
    const btnUndo = document.getElementById('btn-undo');
    const btnRedo = document.getElementById('btn-redo');

    if (btnUndo) btnUndo.disabled = this.isDrawingBlocked || this.currentArtwork.strokes.length === 0;
    if (btnRedo) btnRedo.disabled = this.isDrawingBlocked || this.undoneStrokes.length === 0;
  }

  clearCanvas() {
    if (this.isDrawingBlocked) return;
    if (this.currentArtwork.strokes.length > 0 && !confirm('캔버스와 모든 스트로크 기록을 지우시겠습니까?')) {
      return;
    }
    this.onPointerUp();
    this.currentArtwork = createArtwork(this.dualCanvas.width, this.dualCanvas.height);
    this.frameBuilder.removeFrame();
    this.undoneStrokes = [];
    this.totalCoalescedCount = 0;
    this.dualCanvas.clearAll();
    this.volumeRenderer.clear();
    this.updateHUDStats();
    this.updateHistoryButtons();
  }

  undo() {
    if (this.isDrawingBlocked || this.currentArtwork.strokes.length === 0) return;

    this.onPointerUp();
    const undone = this.currentArtwork.strokes.pop();
    this.undoneStrokes.push(undone);

    this.redrawAllStrokes();
    this.updateHUDStats();
    this.updateHistoryButtons();
  }

  redo() {
    if (this.isDrawingBlocked || this.undoneStrokes.length === 0) return;

    this.onPointerUp();
    const redone = this.undoneStrokes.pop();
    this.currentArtwork.strokes.push(redone);

    this.redrawAllStrokes();
    this.updateHUDStats();
    this.updateHistoryButtons();
  }

  /**
   * 전체 스트로크 스택을 각 브러시 전략에 맞춰 재렌더링
   */
  redrawAllStrokes() {
    this.dualCanvas.clearAll();
    this.volumeRenderer.clear();
    for (const stroke of this.currentArtwork.strokes) {
      if (stroke.tool === 'volume') {
        this.volumeRenderer.updateStroke(stroke, this.dualCanvas.width, this.dualCanvas.height);
        continue;
      }
      if (stroke.tool === 'eraser') this.volumeRenderer.applyEraser(stroke);
      this.brush.withStroke(stroke, () => {
        const ctx = this.dualCanvas.activeCtx;
        stroke.points.forEach((_, i) => this.brush.renderPoint(ctx, stroke.points, i));
        this.brush.finishPath(ctx, stroke.points);
        this.dualCanvas.commitActiveToBackground(this.brush.tool);
      });
    }
  }

  playTimelapse() {
    if (this.isDrawingBlocked) return;
    if (this.currentArtwork.strokes.length === 0) {
      alert('재생할 스트로크 데이터가 없습니다. 먼저 그림을 그려보세요!');
      return;
    }

    this.setDrawingBlocked(true);
    document.getElementById('timelapse-banner')?.classList.add('active');
    this.dualCanvas.clearAll();
    this.volumeRenderer.clear();

    const strokes = [...this.currentArtwork.strokes];
    let strokeIdx = 0;
    let pointIdx = 0;
    const ctx = this.dualCanvas.activeCtx;

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

      if (stroke.tool === 'volume') {
        this.volumeRenderer.updateStroke(stroke, this.dualCanvas.width, this.dualCanvas.height, endIdx);
      } else {
        if (stroke.tool === 'eraser') this.volumeRenderer.applyEraser({ ...stroke, points: pts.slice(0, endIdx) });
        this.brush.withStroke(stroke, () => {
          for (let i = pointIdx; i < endIdx; i++) this.brush.renderPoint(ctx, pts, i);
          if (endIdx === pts.length) {
            this.brush.finishPath(ctx, pts);
            this.dualCanvas.commitActiveToBackground(this.brush.tool);
          }
        });
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
    if (blocked) this.onPointerUp();
    this.isDrawingBlocked = blocked;

    const banner = document.getElementById('timelapse-banner');
    if (banner) {
      if (!blocked) banner.classList.remove('active');
    }

    const buttons = document.querySelectorAll('.panel-btn, .btn-finish, .btn-tool-tab, .btn-history, .color-swatch, #brush-size, #brush-opacity, #brush-depth, #custom-color-picker, #canvas-preset');
    buttons.forEach(btn => {
      btn.disabled = blocked;
    });
    this.updateHistoryButtons();
  }

  exportJSON() {
    this.onPointerUp();
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
    requestAnimationFrame(this.animate);

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

    if (this.controls.enabled) this.controls.update();
    this.volumeRenderer.flush();
    this.renderer.render(this.scene, this.camera);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new AtelieraApp();
});
