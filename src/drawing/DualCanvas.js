import * as THREE from 'three';

export class DualCanvasManager {
  /**
   * @param {number} width - 캔버스 너비
   * @param {number} [height=width] - 캔버스 높이
   */
  constructor(width = 2048, height = width) {
    this.width = width;
    this.height = height;

    // 백그라운드 캔버스
    this.bgCanvas = document.createElement('canvas');
    this.bgCanvas.width = this.width;
    this.bgCanvas.height = this.height;
    this.bgCtx = this.bgCanvas.getContext('2d', { willReadFrequently: true });

    // 액티브 캔버스 (저지연 실시간 드로잉 레이어)
    this.activeCanvas = document.createElement('canvas');
    this.activeCanvas.width = this.width;
    this.activeCanvas.height = this.height;
    this.activeCtx = this.activeCanvas.getContext('2d', {
      desynchronized: true,
      willReadFrequently: false
    });

    // 최종 디스플레이 캔버스 (Three.js 텍스처 소스)
    this.displayCanvas = document.createElement('canvas');
    this.displayCanvas.width = this.width;
    this.displayCanvas.height = this.height;
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

    this.paperCanvas = document.createElement('canvas');
    this.paperCanvas.width = this.width;
    this.paperCanvas.height = this.height;
    this.paperCtx = this.paperCanvas.getContext('2d');
    this.activeTool = 'watercolor';

    // 수채화 전용 따뜻한 미색(Cream Ivory) 바탕지 초기화
    this.initPaperBackground();
  }

  resize(width, height) {
    // Three.js 텍스처의 크기는 업로드 후 변경할 수 없으므로 교체합니다.
    this.texture.dispose();
    this.width = width;
    this.height = height;
    for (const canvas of [this.bgCanvas, this.activeCanvas, this.displayCanvas, this.paperCanvas]) {
      canvas.width = width;
      canvas.height = height;
    }
    this.texture = new THREE.CanvasTexture(this.displayCanvas);
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.initPaperBackground();
  }

  initPaperBackground() {
    this.paperCtx.save();
    this.paperCtx.globalCompositeOperation = 'source-over';
    this.paperCtx.fillStyle = '#FDF8F0';
    this.paperCtx.fillRect(0, 0, this.width, this.height);

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

    const pattern = this.paperCtx.createPattern(grainCanvas, 'repeat');
    if (pattern) {
      this.paperCtx.fillStyle = pattern;
      this.paperCtx.fillRect(0, 0, this.width, this.height);
    }
    this.paperCtx.restore();

    this.updateDisplay();
  }

  clearActive() {
    this.activeCtx.clearRect(0, 0, this.width, this.height);
  }

  /**
   * 스트로크 완료 시 커밋 (지우개 도구인 경우 destination-out으로 합성)
   * @param {'pen'|'pencil'|'watercolor'|'airbrush'|'eraser'} tool
   */
  commitActiveToBackground(tool = 'watercolor') {
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
    this.displayCtx.clearRect(0, 0, this.width, this.height);
    this.displayCtx.drawImage(this.bgCanvas, 0, 0);
    this.displayCtx.globalCompositeOperation = this.activeTool === 'eraser' ? 'destination-out' : 'source-over';
    this.displayCtx.drawImage(this.activeCanvas, 0, 0);
    this.displayCtx.globalCompositeOperation = 'destination-over';
    this.displayCtx.drawImage(this.paperCanvas, 0, 0);
    this.displayCtx.globalCompositeOperation = 'source-over';
    this.texture.needsUpdate = true;
  }

  clearAll() {
    this.clearActive();
    this.bgCtx.clearRect(0, 0, this.width, this.height);
    this.updateDisplay();
  }

  uvToCanvasCoords(uv) {
    return {
      x: uv.x * this.width,
      y: (1.0 - uv.y) * this.height
    };
  }
}
