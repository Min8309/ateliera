/**
 * @file AtelierEnvironment.js
 * @description 비 오는 창가 작업실(Atelier) 3D 공간 환경 및 Web Audio API 절차적 빗소리 생성 모듈
 */

import * as THREE from 'three';

export class AtelierEnvironment {
  /**
   * @param {THREE.Scene} scene
   * @param {THREE.Camera} camera
   */
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;

    this.group = new THREE.Group();
    this.group.name = 'AtelierEnvironment';
    this.scene.add(this.group);

    // 1. 작업실 룸 메쉬 구축
    this.buildRoom();

    // 2. 창문 및 빗줄기 파티클 시스템 구축
    this.buildWindowAndRain();

    // 3. 무드 라이팅 (창밖 쿨톤 조명 + 캔버스 웜톤 스포트라이트)
    this.setupLighting();

    // 4. Web Audio API 기반 절차적 빗소리 사운드 엔진
    this.initRainAudio();
  }

  /**
   * 미니멀 아틀리에 룸 메쉬 (바닥, 뒷벽, 좌측 창문 벽)
   */
  buildRoom() {
    // 1. 차분한 다크 우드 플로어
    const floorGeo = new THREE.PlaneGeometry(16, 16);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x181512,
      roughness: 0.85,
      metalness: 0.05
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -1.3, 0);
    floor.receiveShadow = true;
    this.group.add(floor);

    // 2. 매트한 콘크리트 뒷벽
    const backWallGeo = new THREE.PlaneGeometry(16, 10);
    const backWallMat = new THREE.MeshStandardMaterial({
      color: 0x1e2025,
      roughness: 0.95,
      metalness: 0.02
    });
    const backWall = new THREE.Mesh(backWallGeo, backWallMat);
    backWall.position.set(0, 3.7, -2.5);
    backWall.receiveShadow = true;
    this.group.add(backWall);

    // 3. 천장 구조
    const ceilingGeo = new THREE.PlaneGeometry(16, 16);
    const ceilingMat = new THREE.MeshStandardMaterial({
      color: 0x15161a,
      roughness: 0.9
    });
    const ceiling = new THREE.Mesh(ceilingGeo, ceilingMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, 5.0, 0);
    this.group.add(ceiling);

    // 4. 캔버스 주변 바닥 원근 그리드 (미세 발광)
    const floorGrid = new THREE.GridHelper(16, 32, 0x343a46, 0x22242a);
    floorGrid.position.set(0, -1.299, 0);
    this.group.add(floorGrid);
  }

  /**
   * 좌측 대형 통창 및 빗방울 파티클 시스템
   */
  buildWindowAndRain() {
    const windowGroup = new THREE.Group();
    windowGroup.position.set(-4.5, 1.2, 0);
    windowGroup.rotation.y = Math.PI / 2;

    // 통창 외곽 프레임
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x16181d,
      roughness: 0.7
    });

    const outerFrameGeo = new THREE.BoxGeometry(6.2, 4.2, 0.12);
    const outerFrame = new THREE.Mesh(outerFrameGeo, frameMat);
    windowGroup.add(outerFrame);

    // 십자형 창살
    const crossHoriz = new THREE.Mesh(new THREE.BoxGeometry(6.0, 0.06, 0.14), frameMat);
    const crossVert = new THREE.Mesh(new THREE.BoxGeometry(0.06, 4.0, 0.14), frameMat);
    windowGroup.add(crossHoriz);
    windowGroup.add(crossVert);

    // 반투명 창문 유리 메쉬
    const glassGeo = new THREE.PlaneGeometry(6.0, 4.0);
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xd8e6f8,
      transparent: true,
      opacity: 0.22,
      roughness: 0.1,
      metalness: 0.1,
      transmission: 0.85,
      ior: 1.5,
      reflectivity: 0.5
    });
    const glass = new THREE.Mesh(glassGeo, glassMat);
    windowGroup.add(glass);

    this.group.add(windowGroup);

    // --- 빗줄기 파티클 시스템 (Rain Particle System) ---
    const rainCount = 1600;
    const rainGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(rainCount * 3);
    const velocities = new Float32Array(rainCount);

    for (let i = 0; i < rainCount; i++) {
      // 창문 바깥 영역(-7 ~ -5, Y: -1 ~ 8, Z: -5 ~ 5)
      positions[i * 3 + 0] = -5.0 - Math.random() * 3.5;
      positions[i * 3 + 1] = Math.random() * 9.0 - 1.0;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 10.0;

      velocities[i] = 12.0 + Math.random() * 8.0; // 낙하 속도
    }

    rainGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.rainVelocities = velocities;

    const rainMat = new THREE.PointsMaterial({
      color: 0xa9c4eb,
      size: 0.05,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending
    });

    this.rainParticles = new THREE.Points(rainGeo, rainMat);
    this.group.add(this.rainParticles);
  }

  /**
   * 분위기 조명 (Mood Lighting)
   */
  setupLighting() {
    // 1. 창밖에서 들이치는 서늘한 푸른빛 (약 6500K 쿨톤)
    const coolWindowLight = new THREE.DirectionalLight(0x9db9ea, 1.4);
    coolWindowLight.position.set(-6, 3.5, 1.5);
    coolWindowLight.target.position.set(0, 0, 0);
    this.group.add(coolWindowLight);
    this.group.add(coolWindowLight.target);

    // 2. 캔버스를 집중 조명하는 따뜻한 백열광 스포트라이트 (약 3000K 웜톤)
    this.canvasSpot = new THREE.SpotLight(0xffeed6, 3.8);
    this.canvasSpot.position.set(0, 3.0, 2.6);
    this.canvasSpot.target.position.set(0, 0, 0);
    this.canvasSpot.angle = Math.PI / 4.0;
    this.canvasSpot.penumbra = 0.5;
    this.canvasSpot.castShadow = true;
    this.canvasSpot.shadow.mapSize.width = 1024;
    this.canvasSpot.shadow.mapSize.height = 1024;
    this.group.add(this.canvasSpot);
    this.group.add(this.canvasSpot.target);

    // 2-1. 캔버스 정면을 부드럽게 밝혀주는 따뜻한 직사 보조광 (미색 캔버스 발색 보장)
    const frontFillLight = new THREE.DirectionalLight(0xfff6ea, 1.1);
    frontFillLight.position.set(0, 1.0, 3.5);
    frontFillLight.target.position.set(0, 0, 0);
    this.group.add(frontFillLight);
    this.group.add(frontFillLight.target);

    // 3. 차분하고 따뜻한 실내 주변광
    const ambLight = new THREE.AmbientLight(0x525660, 0.95);
    this.group.add(ambLight);
  }

  /**
   * Web Audio API 절차적 빗소리 엔진 (외부 음원 의존성 제로)
   */
  initRainAudio() {
    this.audioCtx = null;
    this.isPlayingAudio = false;
    this.gainNode = null;
  }

  /**
   * 빗소리 재생 토글 (브라우저 정책상 사용자 상호작용 후 재생)
   */
  toggleRainAudio() {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioContextClass();
    }

    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }

    if (this.isPlayingAudio) {
      if (this.gainNode) {
        this.gainNode.gain.setTargetAtTime(0, this.audioCtx.currentTime, 0.3);
      }
      this.isPlayingAudio = false;
      return false;
    } else {
      this.startRainSoundSynthesis();
      this.isPlayingAudio = true;
      return true;
    }
  }

  /**
   * 핑크 노이즈 + 밴드패스 필터를 이용한 자연스러운 빗소리 합성
   */
  startRainSoundSynthesis() {
    if (!this.audioCtx) return;

    const bufferSize = this.audioCtx.sampleRate * 2; // 2초 루프 버퍼
    const noiseBuffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
    const output = noiseBuffer.getChannelData(0);

    // 핑크 노이즈 필터링 공식
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.06;
      b6 = white * 0.115926;
    }

    const whiteNoiseSource = this.audioCtx.createBufferSource();
    whiteNoiseSource.buffer = noiseBuffer;
    whiteNoiseSource.loop = true;

    // 저역 통과 필터 (창문을 통과해 실내로 들어오는 아늑한 빗소리)
    const lowpass = this.audioCtx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 1100;

    // 게인 노드
    this.gainNode = this.audioCtx.createGain();
    this.gainNode.gain.setValueAtTime(0.01, this.audioCtx.currentTime);
    this.gainNode.gain.setTargetAtTime(0.28, this.audioCtx.currentTime, 0.5);

    whiteNoiseSource.connect(lowpass);
    lowpass.connect(this.gainNode);
    this.gainNode.connect(this.audioCtx.destination);

    whiteNoiseSource.start();
    this.currentNoiseSource = whiteNoiseSource;
  }

  /**
   * 매 프레임 비 파티클 낙하 애니메이션 갱신
   * @param {number} delta
   */
  update(delta = 0.016) {
    if (!this.rainParticles) return;

    const positions = this.rainParticles.geometry.attributes.position.array;
    const count = positions.length / 3;

    for (let i = 0; i < count; i++) {
      const v = this.rainVelocities[i];
      positions[i * 3 + 1] -= v * delta;

      // 바닥 아래로 떨어지면 천장 위로 리셋
      if (positions[i * 3 + 1] < -1.3) {
        positions[i * 3 + 1] = 7.5 + Math.random() * 2.0;
        positions[i * 3 + 0] = -5.0 - Math.random() * 3.5;
      }
    }

    this.rainParticles.geometry.attributes.position.needsUpdate = true;
  }
}
