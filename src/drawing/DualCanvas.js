/**
 * @file DualCanvas.js
 * @description 듀얼 레이어 캔버스 (Background + Active) 오프스크린 관리 모듈
 * Three.js CanvasTexture와 직접 연동되어 렌더링 부하를 최소화합니다.
 */

import * as THREE from 'three';

export class DualCanvas {
  /**
   * @param {number} width - 캔버스 픽셀 너비 (기본 2048)
   * @param {number} height - 캔버스 픽셀 높이 (기본 2048)
   */
  constructor(width = 2048, height = 2048) {
    this.width = width;
    this.height = height;

    // 1. 백그라운드 레이어 (완료된 스트로크가 누적 고정되는 오프스크린 캔버스)
    this.bgCanvas = document.createElement('canvas');
    this.bgCanvas.width = this.width;
    this.bgCanvas.height = this.height;
    this.bgCtx = this.bgCanvas.getContext('2d', { willReadFrequently: false });

    // 2. 액티브 레이어 (현재 실시간 드로잉 중인 획만 렌더링하는 오프스크린 캔버스)
    this.activeCanvas = document.createElement('canvas');
    this.activeCanvas.width = this.width;
    this.activeCanvas.height = this.height;
    this.activeCtx = this.activeCanvas.getContext('2d', { willReadFrequently: false });

    // 3. 디스플레이 캔버스 (Three.js CanvasTexture의 소스로 사용되는 최종 합성 캔버스)
    this.displayCanvas = document.createElement('canvas');
    this.displayCanvas.width = this.width;
    this.displayCanvas.height = this.height;
    this.displayCtx = this.displayCanvas.getContext('2d', { willReadFrequently: false });

    // Three.js CanvasTexture 생성 및 최적화 설정
    this.texture = new THREE.CanvasTexture(this.displayCanvas);
    this.texture.generateMipmaps = true;
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.colorSpace = THREE.SRGBColorSpace;

    // 초기 종이(캔버스) 질감/배경색 채우기
    this.initCanvasBackground();
  }

  /**
   * 캔버스 초기 배경 설정 (수채화 전용 질감의 부드러운 오프화이트 톤 및 미세 입자)
   */
  initCanvasBackground() {
    this.bgCtx.save();
    // 부드러운 수채화지 톤 (#FAF7F2)
    this.bgCtx.fillStyle = '#FAF7F2';
    this.bgCtx.fillRect(0, 0, this.width, this.height);

    // 종이 미세 질감 생성 (자연스러운 수채화지 입자감)
    const grainCanvas = document.createElement('canvas');
    grainCanvas.width = 128;
    grainCanvas.height = 128;
    const gCtx = grainCanvas.getContext('2d');
    const imgData = gCtx.createImageData(128, 128);
    for (let i = 0; i < imgData.data.length; i += 4) {
      const noise = (Math.random() - 0.5) * 14;
      imgData.data[i] = 160 + noise;     // R
      imgData.data[i + 1] = 155 + noise; // G
      imgData.data[i + 2] = 145 + noise; // B
      imgData.data[i + 3] = 12;          // 아주 미세한 알파
    }
    gCtx.putImageData(imgData, 0, 0);

    const pattern = this.bgCtx.createPattern(grainCanvas, 'repeat');
    if (pattern) {
      this.bgCtx.fillStyle = pattern;
      this.bgCtx.fillRect(0, 0, this.width, this.height);
    }
    this.bgCtx.restore();

    this.updateDisplay();
  }

  /**
   * 액티브 캔버스 클리어 (현재 스트로크 리셋)
   */
  clearActive() {
    this.activeCtx.clearRect(0, 0, this.width, this.height);
  }

  /**
   * 액티브 레이어를 백그라운드 레이어로 병합하고 액티브 레이어 비우기
   */
  commitActiveToBackground() {
    this.bgCtx.drawImage(this.activeCanvas, 0, 0);
    this.clearActive();
    this.updateDisplay();
  }

  /**
   * 백그라운드와 액티브 레이어를 디스플레이 캔버스에 합성하고 Three.js 텍스처 갱신 알림
   */
  updateDisplay() {
    this.displayCtx.clearRect(0, 0, this.width, this.height);
    this.displayCtx.drawImage(this.bgCanvas, 0, 0);
    this.displayCtx.drawImage(this.activeCanvas, 0, 0);
    this.texture.needsUpdate = true;
  }

  /**
   * 전체 캔버스 초기화
   */
  clearAll() {
    this.clearActive();
    this.initCanvasBackground();
  }

  /**
   * 3D Raycast UV 좌표를 캔버스 픽셀 좌표로 변환 (철저한 Y축 반전 공식 적용)
   * @param {THREE.Vector2|{x: number, y: number}} uv - 레이캐스트 교차점의 UV (0.0 ~ 1.0)
   * @returns {{x: number, y: number}} 캔버스 픽셀 좌표
   */
  uvToCanvasCoords(uv) {
    return {
      x: uv.x * this.width,
      y: (1.0 - uv.y) * this.height // Y축 반전 규칙 철저 유지
    };
  }

  /**
   * Three.js 메시 재질에 바인딩할 텍스처 반환
   * @returns {THREE.CanvasTexture}
   */
  getTexture() {
    return this.texture;
  }
}
