/**
 * @file SceneManager.js
 * @description Three.js 씬, 카메라, 조명, 3D 이젤 및 캔버스 평면(Quad Mesh) 관리
 */

import * as THREE from 'three';

export class SceneManager {
  /**
   * @param {HTMLCanvasElement} canvasElement - WebGL 렌더러가 바인딩될 캔버스
   * @param {import('../drawing/DualCanvas.js').DualCanvas} dualCanvas
   */
  constructor(canvasElement, dualCanvas) {
    this.canvasElement = canvasElement;
    this.dualCanvas = dualCanvas;

    // 1. 씬 생성
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#121316');
    this.scene.fog = new THREE.FogExp2('#121316', 0.08);

    // 2. 카메라 설정
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      100
    );
    // 작업실 기본 시점 (캔버스 정면 및 약간 위에서 바라봄)
    this.camera.position.set(0, 1.45, 1.55);

    // 3. 렌더러 생성 (WebXR 지원 활성화)
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvasElement,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    // WebXR 대응 활성화
    this.renderer.xr.enabled = true;

    // 4. 조명 설정
    this.setupLights();

    // 5. 가상 아틀리에(작업실) 환경 구축
    this.setupEnvironment();

    // 6. 드로잉 대상 캔버스 쿼드 메시(Plane Quad Mesh) 생성
    this.setupDrawingPlane();

    // 리사이즈 이벤트 바인딩
    window.addEventListener('resize', this.onResize.bind(this));
  }

  /**
   * 조명 설정 (자연스럽고 따뜻한 아틀리에 채광)
   */
  setupLights() {
    // 부드러운 환경광
    const ambientLight = new THREE.AmbientLight(0xfff7ea, 0.7);
    this.scene.add(ambientLight);

    // 캔버스를 비추는 메인 스포트라이트 (갤러리 스팟 조명 효과)
    const spotLight = new THREE.SpotLight(0xfff5e6, 2.2);
    spotLight.position.set(0, 3.2, 2.0);
    spotLight.angle = Math.PI / 4.5;
    spotLight.penumbra = 0.5;
    spotLight.castShadow = true;
    spotLight.shadow.mapSize.width = 1024;
    spotLight.shadow.mapSize.height = 1024;
    this.scene.add(spotLight);

    // 은은한 보조광 (바닥 및 이젤 그림자 완화)
    const fillLight = new THREE.DirectionalLight(0xdbe6f6, 0.4);
    fillLight.position.set(-2, 2, -1);
    this.scene.add(fillLight);
  }

  /**
   * 가상 작업실 바닥 및 감성적인 분위기 구축
   */
  setupEnvironment() {
    // 따뜻한 원목 느낌의 바닥 평면
    const floorGeo = new THREE.PlaneGeometry(14, 14);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x1c1a17,
      roughness: 0.85,
      metalness: 0.1
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // 미니멀한 공간 그리드 (원근감 부여)
    const gridHelper = new THREE.GridHelper(14, 28, 0x3d3831, 0x242220);
    gridHelper.position.y = 0.001;
    this.scene.add(gridHelper);

    // 이젤(Easel) 스탠드 프레임 모델링 (경량 3D 구조물)
    this.setupEasel();
  }

  /**
   * 절차적 미니멀 이젤(Easel) 구축
   */
  setupEasel() {
    const easelGroup = new THREE.Group();
    const woodMat = new THREE.MeshStandardMaterial({
      color: 0x4a3728, // 다크 월넛 우드 톤
      roughness: 0.7,
      metalness: 0.05
    });

    // 뒷받침 기둥
    const backLegGeo = new THREE.CylinderGeometry(0.025, 0.03, 2.3, 8);
    const backLeg = new THREE.Mesh(backLegGeo, woodMat);
    backLeg.position.set(0, 1.15, -0.35);
    backLeg.rotation.x = -0.25;
    backLeg.castShadow = true;
    easelGroup.add(backLeg);

    // 앞 좌/우 다리
    const leftLeg = new THREE.Mesh(backLegGeo, woodMat);
    leftLeg.position.set(-0.55, 1.15, -0.05);
    leftLeg.rotation.z = 0.12;
    leftLeg.rotation.x = 0.1;
    leftLeg.castShadow = true;
    easelGroup.add(leftLeg);

    const rightLeg = new THREE.Mesh(backLegGeo, woodMat);
    rightLeg.position.set(0.55, 1.15, -0.05);
    rightLeg.rotation.z = -0.12;
    rightLeg.rotation.x = 0.1;
    rightLeg.castShadow = true;
    easelGroup.add(rightLeg);

    // 캔버스 받침대 선반
    const shelfGeo = new THREE.BoxGeometry(1.5, 0.04, 0.12);
    const shelf = new THREE.Mesh(shelfGeo, woodMat);
    shelf.position.set(0, 0.72, 0.06);
    shelf.castShadow = true;
    shelf.receiveShadow = true;
    easelGroup.add(shelf);

    this.scene.add(easelGroup);
    this.easel = easelGroup;
  }

  /**
   * 실시간 드로잉이 반영되는 Three.js Plane Quad Mesh 생성
   */
  setupDrawingPlane() {
    const width = 1.3;
    const height = 1.3;

    // 캔버스 판 지오메트리
    const canvasGeo = new THREE.PlaneGeometry(width, height);
    
    // 오프스크린 캔버스의 CanvasTexture를 맵핑
    const canvasMat = new THREE.MeshStandardMaterial({
      map: this.dualCanvas.getTexture(),
      roughness: 0.9,
      metalness: 0.02,
      side: THREE.FrontSide
    });

    this.drawingPlane = new THREE.Mesh(canvasGeo, canvasMat);
    this.drawingPlane.position.set(0, 1.42, 0.03);
    this.drawingPlane.rotation.x = -0.08; // 이젤에 기댄 듯한 자연스러운 미세 기울기
    this.drawingPlane.castShadow = true;
    this.drawingPlane.receiveShadow = true;
    this.drawingPlane.name = 'DrawingCanvasPlane';

    // 캔버스 테두리 프레임(액자) 추가
    const frameGeo = new THREE.BoxGeometry(width + 0.06, height + 0.06, 0.03);
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x22201d,
      roughness: 0.8
    });
    const frame = new THREE.Mesh(frameGeo, frameMat);
    frame.position.set(0, 0, -0.016);
    this.drawingPlane.add(frame);

    this.scene.add(this.drawingPlane);
  }

  /**
   * 화면 리사이즈 대응
   */
  onResize() {
    if (this.renderer.xr.isPresenting) return;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  /**
   * 뷰 모드 전환 (아틀리에 모드 <-> 갤러리 감상 모드)
   * @param {string} mode - 'studio' | 'gallery'
   */
  setCameraMode(mode) {
    if (mode === 'gallery') {
      // 작품을 정면에서 크게 감상하는 시점
      this.animateCameraTo(new THREE.Vector3(0, 1.42, 1.7), new THREE.Vector3(0, 1.42, 0));
    } else {
      // 작업실 작업 시점
      this.animateCameraTo(new THREE.Vector3(0, 1.45, 1.55), new THREE.Vector3(0, 1.4, 0));
    }
  }

  /**
   * 부드러운 카메라 이동
   */
  animateCameraTo(targetPos, lookAtTarget) {
    const startPos = this.camera.position.clone();
    const startTime = performance.now();
    const duration = 800; // ms

    const animate = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(1.0, elapsed / duration);
      // 부드러운 EaseInOutCubic
      const ease = progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;

      this.camera.position.lerpVectors(startPos, targetPos, ease);
      this.camera.lookAt(lookAtTarget);

      if (progress < 1.0) {
        requestAnimationFrame(animate);
      }
    };
    requestAnimationFrame(animate);
  }
}
