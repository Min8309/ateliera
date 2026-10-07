/**
 * @file FrameBuilder.js
 * @description 3D 몰딩 액자 생성기 (우드/골드/블랙 3종 프레임 및 장착 애니메이션)
 */

import * as THREE from 'three';

export class FrameBuilder {
  constructor() {
    this.currentFrameGroup = null;

    // 프레임 재질 프리셋 3종
    this.materials = {
      'classic-wood': new THREE.MeshStandardMaterial({
        color: 0x3d2719, // 다크 월넛 우드 톤
        roughness: 0.68,
        metalness: 0.05
      }),
      'antique-gold': new THREE.MeshStandardMaterial({
        color: 0xd4b26f, // 샴페인 골드 브라스 톤
        roughness: 0.32,
        metalness: 0.88
      }),
      'modern-black': new THREE.MeshStandardMaterial({
        color: 0x18181b, // 매트 미니멀 블랙 톤
        roughness: 0.85,
        metalness: 0.15
      })
    };
  }

  /**
   * 캔버스 비율에 맞는 3D 몰딩 프레임 생성
   * @param {string} style - 'classic-wood' | 'antique-gold' | 'modern-black'
   * @returns {THREE.Group}
   */
  createFrameMesh(style = 'classic-wood', canvasWidth = 2, canvasHeight = 2) {
    const group = new THREE.Group();
    group.name = `FrameMesh_${style}`;
    const mat = this.materials[style] || this.materials['classic-wood'];

    const borderThickness = 0.09; // 프레임 폭
    const frameDepth = 0.08;      // 프레임 앞뒤 두께

    // 1. 상단 바
    const topGeo = new THREE.BoxGeometry(canvasWidth + borderThickness * 2, borderThickness, frameDepth);
    const topBar = new THREE.Mesh(topGeo, mat);
    topBar.position.set(0, canvasHeight / 2 + borderThickness / 2, frameDepth / 4);
    topBar.castShadow = true;
    group.add(topBar);

    // 2. 하단 바
    const bottomBar = new THREE.Mesh(topGeo, mat);
    bottomBar.position.set(0, -(canvasHeight / 2 + borderThickness / 2), frameDepth / 4);
    bottomBar.castShadow = true;
    group.add(bottomBar);

    // 3. 좌측 바
    const sideGeo = new THREE.BoxGeometry(borderThickness, canvasHeight, frameDepth);
    const leftBar = new THREE.Mesh(sideGeo, mat);
    leftBar.position.set(-(canvasWidth / 2 + borderThickness / 2), 0, frameDepth / 4);
    leftBar.castShadow = true;
    group.add(leftBar);

    // 4. 우측 바
    const rightBar = new THREE.Mesh(sideGeo, mat);
    rightBar.position.set(canvasWidth / 2 + borderThickness / 2, 0, frameDepth / 4);
    rightBar.castShadow = true;
    group.add(rightBar);

    // 5. 액자 뒷판
    const backGeo = new THREE.PlaneGeometry(canvasWidth + borderThickness * 2, canvasHeight + borderThickness * 2);
    const backMat = new THREE.MeshBasicMaterial({ color: 0x111113 });
    const backMesh = new THREE.Mesh(backGeo, backMat);
    backMesh.position.set(0, 0, -0.02);
    group.add(backMesh);

    return group;
  }

  /**
   * 캔버스 메쉬에 액자를 '착' 하고 달라붙는 애니메이션으로 부착
   * @param {THREE.Mesh} targetMesh - 캔버스 평면 메쉬
   * @param {string} style - 선택한 액자 스타일
   * @param {Function} [onComplete] - 완료 콜백
   */
  attachFrame(targetMesh, style = 'classic-wood', onComplete = null) {
    this.removeFrame();

    const { width, height } = targetMesh.geometry.parameters;
    const frame = this.createFrameMesh(style, width, height);
    this.currentFrameGroup = frame;

    // 시작 상태 (약간 앞으로 돌출되어 있고 살짝 확대됨)
    frame.position.set(0, 0, 0.25);
    frame.scale.set(1.08, 1.08, 1.08);
    targetMesh.add(frame);

    // '착' 달라붙는 부드러운 스냅 애니메이션
    const startTime = performance.now();
    const duration = 550; // ms

    const animate = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(1.0, elapsed / duration);

      frame.position.z = (1.0 - progress) * 0.25;
      const scaleVal = 1.0 + (1.0 - progress) * 0.08;
      frame.scale.set(scaleVal, scaleVal, scaleVal);

      if (progress < 1.0) {
        requestAnimationFrame(animate);
      } else {
        frame.position.set(0, 0, 0);
        frame.scale.set(1, 1, 1);
        if (onComplete) onComplete();
      }
    };

    requestAnimationFrame(animate);
  }

  /**
   * 현재 액자 제거
   */
  removeFrame() {
    if (this.currentFrameGroup) {
      this.currentFrameGroup.removeFromParent();
      const geometries = new Set();
      this.currentFrameGroup.traverse(child => {
        if (child.geometry) geometries.add(child.geometry);
        if (child.material && !Object.values(this.materials).includes(child.material)) child.material.dispose();
      });
      geometries.forEach(geometry => geometry.dispose());
      this.currentFrameGroup = null;
    }
  }
}
