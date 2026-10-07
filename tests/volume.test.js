import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { VolumeStrokeRenderer, volumePath, strokeTouchesEraser } from '../src/drawing/VolumeStrokeRenderer.js';
import { VolumeBrush } from '../src/drawing/brushes/VolumeBrush.js';
import { createStroke } from '../src/types/DataModels.js';
import { fitStrokes, CANVAS_PRESETS } from '../src/drawing/CanvasPresets.js';

const point = (x, y, pressure = 1) => ({ x, y, pressure, time: 1, tiltX: 0, tiltY: 0 });
const stroke = (id = 'volume-1', extra = {}) => ({ ...createStroke({ tool: 'volume', size: 64, depth: 40, color: '#00F5FF', neon: true, opacity: 1 }),
  id, points: [point(200, 500), point(600, 700, .3), point(1200, 400)], ...extra });

function renderer() { return new VolumeStrokeRenderer(new THREE.Mesh(new THREE.PlaneGeometry(2, 2))); }

function assertFiniteGeometry(geometry) {
  for (const attribute of [geometry.attributes.position, geometry.attributes.normal]) {
    assert.ok([...attribute.array].every(Number.isFinite));
  }
}

test('3D brush registers a visible size range and opaque default', () => {
  const brush = new VolumeBrush();
  assert.equal(brush.name, 'volume');
  assert.equal(brush.defaultOpacity, 1);
  assert.ok(brush.defaultSize >= brush.minSize && brush.defaultSize <= brush.maxSize);
});

test('3D path respects rectangular canvas coordinates and pixel depth', () => {
  const path = volumePath(stroke('center', { points: [point(1280, 720)], depth: 80 }), 2560, 1440);
  assert.equal(path.points[0].x, 0); assert.equal(path.points[0].y, 0);
  assert.equal(path.points[0].z, .003 + 80 * 2 / 2560 + 64 / 2560);
});

test('volume strokes create actual tube geometry above the painting plane', () => {
  const drawing = renderer();
  drawing.updateStroke(stroke(), 2048, 2048);
  const record = drawing.records.get('volume-1');
  assert.ok(record.core.geometry instanceof THREE.TubeGeometry);
  assertFiniteGeometry(record.core.geometry);
  record.core.geometry.computeBoundingBox();
  assert.ok(record.core.geometry.boundingBox.min.z > 0);
  assert.ok(record.core.geometry.boundingBox.max.z > record.core.geometry.boundingBox.min.z);
  assert.ok(record.core.material.emissiveIntensity > 0);
  assert.ok(record.glow);
  assert.equal(record.group.children.filter(mesh => mesh.userData.isCap).length, 2);
  drawing.clear();
});

test('single taps and duplicate points produce finite spheres', () => {
  const drawing = renderer();
  drawing.updateStroke(stroke('tap', { points: [point(500, 500), point(500, 500)] }), 2048, 2048);
  const record = drawing.records.get('tap');
  assert.ok(record.core.geometry instanceof THREE.SphereGeometry);
  assertFiniteGeometry(record.core.geometry);
  drawing.clear();
});

test('long strokes preserve endpoints while bounding mesh complexity', () => {
  const input = stroke('long', { points: Array.from({ length: 10000 }, (_, i) => point(i / 5, 500 + Math.sin(i / 100) * 100)) });
  const path = volumePath(input, 2048, 2048);
  assert.ok(path.points.length <= 257);
  assert.equal(path.points.at(-1).x, input.points.at(-1).x / 1024 - 1);
  const drawing = renderer();drawing.updateStroke(input, 2048, 2048);
  assert.ok(drawing.records.get('long').core.geometry.attributes.position.count <= 385 * 13);
  drawing.clear();
});

test('live updates replace and dispose geometry rather than accumulating meshes', () => {
  const drawing = renderer();const input = stroke();
  drawing.queueStroke(input, 2048, 2048);drawing.flush();
  const record = drawing.records.get(input.id), oldGeometry = record.core.geometry;
  let disposed = false;oldGeometry.addEventListener('dispose', () => { disposed = true; });
  input.points.push(point(1400, 800));drawing.queueStroke(input, 2048, 2048);drawing.flush();
  assert.equal(disposed, true);assert.equal(drawing.records.size, 1);
  assert.equal(record.group.children.length, 4);
  drawing.clear();
});

test('eraser detects crossings between samples and ignores distant strokes or zero opacity', () => {
  const line = stroke('line', { size: 10, points: [point(100, 100), point(900, 100)] });
  const eraser = { size: 10, opacity: 1, points: [point(500, 0), point(500, 200)] };
  assert.equal(strokeTouchesEraser(line, eraser), true);
  assert.equal(strokeTouchesEraser(line, { ...eraser, points: [point(1500, 1500)] }), false);
  assert.equal(strokeTouchesEraser(line, { ...eraser, opacity: 0 }), false);
  assert.equal(strokeTouchesEraser(line, { ...eraser, points: [point(500, 100)] }), true);
});

test('erasers affect prior 3D strokes and leave later strokes visible', () => {
  const drawing = renderer();drawing.updateStroke(stroke('before'), 2048, 2048);
  drawing.applyEraser({ size: 50, opacity: 1, points: [point(200, 500)] });
  assert.equal(drawing.records.get('before').group.visible, false);
  drawing.updateStroke(stroke('after'), 2048, 2048);
  assert.equal(drawing.records.get('after').group.visible, true);
  drawing.clear();
});

test('canvas resizing scales 3D depth, and JSON retains neon and depth metadata', () => {
  const [resized] = fitStrokes([stroke()], CANVAS_PRESETS.square, CANVAS_PRESETS.compact);
  assert.equal(resized.depth, 20);assert.equal(resized.size, 32);
  const restored = JSON.parse(JSON.stringify(resized));
  assert.equal(restored.tool, 'volume');assert.equal(restored.neon, true);assert.equal(restored.depth, 20);
});

test('clear disposes all geometry and shared materials once', () => {
  const drawing = renderer();drawing.updateStroke(stroke(), 2048, 2048);
  const geometries = new Set(), materials = new Set();
  drawing.group.traverse(mesh => { if (mesh.geometry) geometries.add(mesh.geometry); if (mesh.material) materials.add(mesh.material); });
  let geometryCount = 0, materialCount = 0;
  geometries.forEach(geometry => geometry.addEventListener('dispose', () => geometryCount++));
  materials.forEach(material => material.addEventListener('dispose', () => materialCount++));
  drawing.clear();
  assert.equal(geometryCount, geometries.size);assert.equal(materialCount, materials.size);
  assert.equal(drawing.group.children.length, 0);assert.equal(drawing.records.size, 0);
});

test('incremental erasing checks new path segments and rebuild resets eraser progress', () => {
  const drawing = renderer();drawing.updateStroke(stroke('target'), 2048, 2048);
  const eraser = { id: 'erase', size: 10, opacity: 1, points: [point(1800, 1800)] };
  drawing.queueEraser(eraser);drawing.flush();
  assert.equal(drawing.records.get('target').group.visible, true);
  eraser.points.push(point(200, 500));drawing.queueEraser(eraser);drawing.flush();
  assert.equal(drawing.records.get('target').group.visible, false);
  drawing.clear();drawing.updateStroke(stroke('target'), 2048, 2048);drawing.applyEraser(eraser);
  assert.equal(drawing.records.get('target').group.visible, false);
  drawing.clear();
});
