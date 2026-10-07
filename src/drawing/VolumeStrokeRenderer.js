import * as THREE from 'three';
import { canvasWorldSize } from './CanvasPresets.js';

function distanceToSegment(point, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const t = length ? THREE.MathUtils.clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / length, 0, 1) : 0;
  return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy);
}

function segmentDistance(a, b, c, d) {
  const cross = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b);
  if (abC * abD < 0 && cdA * cdB < 0) return 0;
  return Math.min(distanceToSegment(a, c, d), distanceToSegment(b, c, d), distanceToSegment(c, a, b), distanceToSegment(d, a, b));
}

export function strokeTouchesEraser(stroke, eraser) {
  if (!stroke.points.length || !eraser.points.length || eraser.opacity === 0) return false;
  const radius = (stroke.size + eraser.size) / 2;
  const bounds = points => points.reduce((b, p) => ({ minX: Math.min(b.minX, p.x), maxX: Math.max(b.maxX, p.x), minY: Math.min(b.minY, p.y), maxY: Math.max(b.maxY, p.y) }),
    { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
  const a = bounds(stroke.points), b = bounds(eraser.points);
  if (a.maxX + radius < b.minX || b.maxX + radius < a.minX || a.maxY + radius < b.minY || b.maxY + radius < a.minY) return false;
  for (let i = 0; i < Math.max(1, stroke.points.length - 1); i++) {
    const start = stroke.points[i], end = stroke.points[Math.min(i + 1, stroke.points.length - 1)];
    for (let j = 0; j < Math.max(1, eraser.points.length - 1); j++) {
      if (segmentDistance(start, end, eraser.points[j], eraser.points[Math.min(j + 1, eraser.points.length - 1)]) <= radius) return true;
    }
  }
  return false;
}

export function volumePath(stroke, width, height) {
  const world = canvasWorldSize(width, height);
  const unit = world.width / width;
  const radius = stroke.size * unit / 2;
  const depth = (stroke.depth ?? 40) * unit;
  const samples = [];
  // 중복 좌표의 접선 오류를 피하고 긴 획의 실시간 메시 생성 비용을 제한합니다.
  const step = Math.max(1, Math.ceil(stroke.points.length / 256));
  for (let i = 0; i < stroke.points.length; i += step) samples.push(stroke.points[i]);
  if (stroke.points.length && samples.at(-1) !== stroke.points.at(-1)) samples.push(stroke.points.at(-1));
  const points = [], pressures = [], canvasPoints = [];
  for (const sample of samples) {
    const pressure = THREE.MathUtils.clamp(sample.pressure ?? .5, .01, 1);
    const point = new THREE.Vector3(sample.x * unit - world.width / 2, world.height / 2 - sample.y * unit,
      .003 + depth + radius * (.35 + pressure * .65));
    if (points.length && point.distanceToSquared(points.at(-1)) < 1e-10) continue;
    points.push(point); pressures.push(pressure); canvasPoints.push(sample);
  }
  return { points, pressures, canvasPoints, radius, world };
}

function tubeGeometry(path) {
  if (path.points.length === 1) {
    const geometry = new THREE.SphereGeometry(path.radius * (.35 + path.pressures[0] * .65), 16, 12);
    geometry.translate(...path.points[0].toArray());
    return geometry;
  }
  const curve = new THREE.CatmullRomCurve3(path.points, false, 'centripetal');
  const segments = Math.min(384, Math.max(12, path.points.length * 3));
  const radialSegments = 12;
  const geometry = new THREE.TubeGeometry(curve, segments, path.radius, radialSegments, false);
  const position = geometry.attributes.position;
  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    const center = curve.getPointAt(u);
    const pressureIndex = curve.getUtoTmapping(u) * (path.pressures.length - 1);
    const index = Math.floor(pressureIndex);
    const pressure = THREE.MathUtils.lerp(path.pressures[index], path.pressures[Math.min(index + 1, path.pressures.length - 1)], pressureIndex - index);
    const scale = .35 + pressure * .65;
    for (let j = 0; j <= radialSegments; j++) {
      const k = i * (radialSegments + 1) + j;
      const vertex = new THREE.Vector3().fromBufferAttribute(position, k).sub(center).multiplyScalar(scale).add(center);
      position.setXYZ(k, vertex.x, vertex.y, vertex.z);
    }
  }
  geometry.computeVertexNormals();
  return geometry;
}

function glowMaterial(color, opacity) {
  return new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(color) }, opacity: { value: opacity * .22 } },
    vertexShader: `varying vec3 vNormal; varying vec3 vView; void main(){ vec4 p=modelViewMatrix*vec4(position,1.0); vNormal=normalize(normalMatrix*normal); vView=-p.xyz; gl_Position=projectionMatrix*p; }`,
    fragmentShader: `
      uniform vec3 color; uniform float opacity;
      varying vec3 vNormal; varying vec3 vView;
      void main() {
        float fade = pow(abs(dot(normalize(vNormal), normalize(vView))), 2.0);
        gl_FragColor = vec4(color, opacity * fade);
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, toneMapped: false
  });
}

export class VolumeStrokeRenderer {
  constructor(drawingPlane) {
    this.group = new THREE.Group();
    this.group.name = 'VolumeStrokes';
    drawingPlane.add(this.group);
    this.records = new Map();
    this.pending = null;
    this.eraserProgress = new Map();
  }

  queueStroke(stroke, width, height) {
    this.pending = { stroke, width, height };
  }

  queueEraser(stroke) {
    this.pending = { stroke, eraser: true };
  }

  flush() {
    if (!this.pending) return;
    const { stroke, width, height, eraser } = this.pending;
    this.pending = null;
    if (eraser) this.applyEraser(stroke);
    else this.updateStroke(stroke, width, height);
  }

  updateStroke(stroke, width, height, count = stroke.points.length) {
    const partial = count === stroke.points.length ? stroke : { ...stroke, points: stroke.points.slice(0, count) };
    const path = volumePath(partial, width, height);
    if (!path.points.length) return;
    let record = this.records.get(stroke.id);
    if (!record) {
      const group = new THREE.Group();
      group.name = `VolumeStroke_${stroke.id}`;
      group.userData.strokeId = stroke.id;
      const coreMaterial = new THREE.MeshStandardMaterial({
        color: stroke.color, roughness: .3, metalness: .12,
        emissive: stroke.neon ? stroke.color : '#000000', emissiveIntensity: stroke.neon ? .65 : 0,
        transparent: stroke.opacity < 1, opacity: stroke.opacity
      });
      const core = new THREE.Mesh(new THREE.BufferGeometry(), coreMaterial);
      group.add(core);
      let glow;
      if (stroke.neon) {
        glow = new THREE.Mesh(new THREE.BufferGeometry(), glowMaterial(stroke.color, stroke.opacity));
        group.add(glow);
      }
      this.group.add(group);
      record = { group, core, glow, stroke: partial };
      this.records.set(stroke.id, record);
    }
    record.stroke = { ...partial, points: path.canvasPoints };
    record.core.geometry.dispose();
    record.core.geometry = tubeGeometry(path);
    if (record.glow) {
      record.glow.geometry.dispose();
      record.glow.geometry = tubeGeometry({ ...path, radius: path.radius * 2.2 });
      // 중심 획을 감싸는 부드러운 네온 광륜.
    }
    // 구체로 튜브 양 끝을 마감합니다.
    for (const cap of record.group.children.filter(child => child.userData.isCap)) {
      cap.geometry.dispose(); record.group.remove(cap);
    }
    if (path.points.length > 1) {
      for (const i of [0, path.points.length - 1]) {
        const cap = new THREE.Mesh(new THREE.SphereGeometry(path.radius * (.35 + path.pressures[i] * .65), 12, 8), record.core.material);
        cap.position.copy(path.points[i]); cap.userData.isCap = true;record.group.add(cap);
      }
    }
  }

  applyEraser(eraser) {
    const processed = eraser.id ? (this.eraserProgress.get(eraser.id) ?? 0) : 0;
    if (processed === eraser.points.length) return;
    const recent = { ...eraser, points: eraser.points.slice(Math.max(0, processed - 1)) };
    if (eraser.id) this.eraserProgress.set(eraser.id, eraser.points.length);
    for (const record of this.records.values()) {
      if (record.group.visible && strokeTouchesEraser(record.stroke, recent)) record.group.visible = false;
    }
  }

  clear() {
    this.pending = null;
    const geometries = new Set(), materials = new Set();
    this.group.traverse(child => {
      if (child.geometry) geometries.add(child.geometry);
      if (child.material) materials.add(child.material);
    });
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
    this.group.clear(); this.records.clear(); this.eraserProgress.clear();
  }

  exportPNG(renderer, dualCanvas, drawingPlane) {
    this.flush();
    if (![...this.records.values()].some(record => record.group.visible)) return dualCanvas.displayCanvas.toDataURL('image/png');
    const { width, height } = dualCanvas;
    const world = canvasWorldSize(width, height);
    const scene = new THREE.Scene();
    const paper = new THREE.Mesh(drawingPlane.geometry, drawingPlane.material);
    scene.add(paper, this.group.clone(true));
    scene.add(new THREE.AmbientLight('#ffffff', 1.5));
    const light = new THREE.DirectionalLight('#ffffff', 2);
    light.position.set(-1, 2, 3); scene.add(light);
    const camera = new THREE.OrthographicCamera(-world.width / 2, world.width / 2, world.height / 2, -world.height / 2, .01, 10);
    camera.position.z = 2;
    const target = new THREE.WebGLRenderTarget(width, height, { samples: Math.min(4, renderer.capabilities.maxSamples) });
    target.texture.colorSpace = THREE.SRGBColorSpace;
    const previousTarget = renderer.getRenderTarget();
    const previousColor = renderer.getClearColor(new THREE.Color());
    const previousAlpha = renderer.getClearAlpha();
    const previousAutoClear = renderer.autoClear;
    const pixels = new Uint8Array(width * height * 4);
    try {
      renderer.setRenderTarget(target);
      renderer.setClearColor('#ffffff', 1);
      renderer.autoClear = true;
      renderer.render(scene, camera);
      renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
    } finally {
      renderer.setRenderTarget(previousTarget);
      renderer.setClearColor(previousColor, previousAlpha);
      renderer.autoClear = previousAutoClear;
      target.dispose();
    }
    const canvas = document.createElement('canvas');canvas.width = width;canvas.height = height;
    const context = canvas.getContext('2d');
    const image = context.createImageData(width, height);
    const rowSize = width * 4;
    for (let y = 0; y < height; y++) image.data.set(pixels.subarray((height - y - 1) * rowSize, (height - y) * rowSize), y * rowSize);
    context.putImageData(image, 0, 0);
    return canvas.toDataURL('image/png');
  }
}
