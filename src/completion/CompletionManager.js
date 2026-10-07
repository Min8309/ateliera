/**
 * @file CompletionManager.js
 * @description 작품 완성 인터랙션 플로우 (카메라 정면 줌인, 서명 각인, 3D 액자 결합, 완성작 데이터 패키징 및 로컬 스토리지 저장)
 */

import * as THREE from 'three';

export class CompletionManager {
  /**
   * @param {Object} context
   * @param {THREE.Camera} context.camera
   * @param {import('three/examples/jsm/controls/OrbitControls.js').OrbitControls} context.controls
   * @param {THREE.Mesh} context.drawingPlane
   * @param {import('../drawing/DualCanvas.js').DualCanvasManager} context.dualCanvas
   * @param {import('../frame/FrameBuilder.js').FrameBuilder} context.frameBuilder
   * @param {Function} context.getStrokes
   * @param {Function} context.setDrawingBlocked
   */
  constructor(context) {
    this.context = context;
    this.isFinishing = false;

    this.bindDOM();
  }

  /**
   * DOM 요소 바인딩
   */
  bindDOM() {
    this.btnFinish = document.getElementById('btn-finish');
    this.signatureModal = document.getElementById('signature-modal');
    this.completionModal = document.getElementById('completion-modal');

    this.inputTitle = document.getElementById('artwork-title');
    this.inputArtist = document.getElementById('artist-signature');
    this.selectFrame = document.getElementById('frame-style-select');

    this.btnConfirmSign = document.getElementById('btn-confirm-sign');
    this.btnCancelSign = document.getElementById('btn-cancel-sign');
    this.btnCloseComplete = document.getElementById('btn-close-complete');
    this.btnDownloadArt = document.getElementById('btn-download-art');

    if (this.btnFinish) {
      this.btnFinish.addEventListener('click', () => this.startFinishFlow());
    }

    if (this.btnConfirmSign) {
      this.btnConfirmSign.addEventListener('click', () => this.handleSignatureConfirm());
    }

    if (this.btnCancelSign) {
      this.btnCancelSign.addEventListener('click', () => this.cancelFinishFlow());
    }

    if (this.btnCloseComplete) {
      this.btnCloseComplete.addEventListener('click', () => this.closeCompletionModal());
    }
  }

  /**
   * 1. 완성하기 시퀀스 시작 (카메라 정면 줌인 및 입력 잠금)
   */
  startFinishFlow() {
    if (this.isFinishing) return;
    this.isFinishing = true;

    // 드로잉 입력 차단 및 궤도 컨트롤러 비활성화
    this.context.setDrawingBlocked(true);
    this.context.controls.enabled = false;

    // 가로·세로 화면 모두에서 선택한 캔버스를 잘라내지 않도록 맞춥니다.
    const { width, height } = this.context.drawingPlane.geometry.parameters;
    const halfFov = THREE.MathUtils.degToRad(this.context.camera.fov / 2);
    const distance = Math.max(height / 2, width / (2 * this.context.camera.aspect)) / Math.tan(halfFov) * 1.2;
    this.animateCameraTo(
      new THREE.Vector3(0, 0, distance),
      new THREE.Vector3(0, 0, 0),
      700,
      () => {
        // 카메라 이동 완료 후 서명 모달 표시
        if (this.signatureModal) {
          this.signatureModal.classList.add('active');
          if (this.inputArtist) this.inputArtist.focus();
        }
      }
    );
  }

  /**
   * 2. 서명 및 액자 스타일 확정 처리
   */
  handleSignatureConfirm() {
    const title = (this.inputTitle && this.inputTitle.value.trim()) || '무제 (Untitled)';
    const artist = (this.inputArtist && this.inputArtist.value.trim()) || 'Artist';
    const frameStyle = (this.selectFrame && this.selectFrame.value) || 'classic-wood';

    // 서명 모달 닫기
    if (this.signatureModal) {
      this.signatureModal.classList.remove('active');
    }

    // 캔버스 우측 하단에 작가 서명 각인
    this.stampSignatureOnCanvas(artist);

    // 3D 액자 부착 애니메이션
    this.context.frameBuilder.attachFrame(this.context.drawingPlane, frameStyle, () => {
      // 액자 부착 완료 후 최종 데이터 패키징 & 저장
      const artworkPackage = this.packageArtwork(title, artist, frameStyle);
      this.showCompletionModal(artworkPackage);
    });
  }

  /**
   * 캔버스 우측 하단에 자연스러운 수채화 잉크 서명 각인
   * @param {string} artistName
   */
  stampSignatureOnCanvas(artistName) {
    const ctx = this.context.dualCanvas.bgCtx;
    const { width, height } = this.context.dualCanvas;
    const scale = Math.min(width, height) / 2048;

    ctx.save();
    ctx.font = `italic ${44 * scale}px "Outfit", cursive, sans-serif`;
    ctx.fillStyle = 'rgba(28, 30, 36, 0.72)'; // 은은한 먹색 수채화 잉크
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';

    // 우측 하단 여백 배치
    const posX = width - 80 * scale;
    const posY = height - 60 * scale;
    ctx.fillText(`— ${artistName}`, posX, posY);

    // 연도 표기
    ctx.font = `300 ${24 * scale}px "Outfit", sans-serif`;
    ctx.fillStyle = 'rgba(28, 30, 36, 0.45)';
    ctx.fillText(new Date().getFullYear().toString(), posX, posY + 32 * scale);

    ctx.restore();

    this.context.dualCanvas.updateDisplay();
  }

  /**
   * 완성작 데이터 패키징 및 localStorage 저장
   */
  packageArtwork(title, artist, frameStyle) {
    // 배경과 서명이 합쳐진 최종 고해상도 DataURL
    const dataUrl = this.context.getArtworkImage
      ? this.context.getArtworkImage()
      : this.context.dualCanvas.displayCanvas.toDataURL('image/png');

    const artwork = {
      id: `art_${Date.now()}`,
      title: title,
      artist: artist,
      frameStyle: frameStyle,
      width: this.context.dualCanvas.width,
      height: this.context.dualCanvas.height,
      completedAt: new Date().toISOString(),
      strokesCount: this.context.getStrokes().length,
      strokesData: structuredClone(this.context.getStrokes()),
      previewUrl: dataUrl
    };

    // 로컬 스토리지에 아틀리에라 갤러리 컬렉션으로 보관
    try {
      const storageKey = 'ateliera_gallery_artworks';
      const existing = JSON.parse(localStorage.getItem(storageKey) || '[]');
      existing.unshift(artwork);
      localStorage.setItem(storageKey, JSON.stringify(existing.slice(0, 20))); // 최근 20개 보관
    } catch (err) {
      console.warn('LocalStorage 저장 공간 초과 가능성:', err);
    }

    return artwork;
  }

  /**
   * 완성 축하 모달 표시
   */
  showCompletionModal(artwork) {
    if (!this.completionModal) return;

    const previewImg = document.getElementById('completed-art-preview');
    const titleEl = document.getElementById('completed-art-title');
    const artistEl = document.getElementById('completed-art-artist');

    if (previewImg) previewImg.src = artwork.previewUrl;
    if (titleEl) titleEl.textContent = artwork.title;
    if (artistEl) artistEl.textContent = `Artist: ${artwork.artist}`;

    // 이미지 다운로드 이벤트 연결
    if (this.btnDownloadArt) {
      this.btnDownloadArt.onclick = () => {
        const a = document.createElement('a');
        a.href = artwork.previewUrl;
        a.download = `${artwork.title.replace(/\s+/g, '_')}_${artwork.artist}.png`;
        a.click();
      };
    }

    this.completionModal.classList.add('active');
  }

  /**
   * 완료 모달 닫기 (작업실 복귀)
   */
  closeCompletionModal() {
    if (this.completionModal) {
      this.completionModal.classList.remove('active');
    }
    this.isFinishing = false;
    this.context.setDrawingBlocked(false);
    this.context.controls.enabled = true;
  }

  /**
   * 완성 플로우 취소
   */
  cancelFinishFlow() {
    if (this.signatureModal) {
      this.signatureModal.classList.remove('active');
    }
    this.isFinishing = false;
    this.context.setDrawingBlocked(false);
    this.context.controls.enabled = true;
  }

  /**
   * 카메라 부드러운 전환 함수
   */
  animateCameraTo(targetPos, lookAtTarget, duration = 600, onDone = null) {
    const startPos = this.context.camera.position.clone();
    const startTime = performance.now();

    const animate = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(1.0, elapsed / duration);
      // EaseInOutCubic
      const ease = progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;

      this.context.camera.position.lerpVectors(startPos, targetPos, ease);
      this.context.camera.lookAt(lookAtTarget);

      if (progress < 1.0) {
        requestAnimationFrame(animate);
      } else {
        if (onDone) onDone();
      }
    };

    requestAnimationFrame(animate);
  }
}
