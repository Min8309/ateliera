import test from 'node:test';
import assert from 'node:assert/strict';
import { BezierBrushEngine } from '../src/drawing/BrushEngine.js';
import { CompletionManager } from '../src/completion/CompletionManager.js';
import { FrameBuilder } from '../src/frame/FrameBuilder.js';
import * as THREE from 'three';

function recordingEngine() {
  const stamps = [];
  const engine = Object.assign(Object.create(BezierBrushEngine.prototype), {
    tool: 'pen', color: '#123456', baseSize: 20, baseOpacity: 1, points: [],
    brushManager: { getSpacingRatio: () => 0.15 },
    dualCanvas: { activeCtx: {}, clearActive() {}, updateDisplay() {}, commitActiveToBackground() {} },
    renderStamp(ctx, x, y, pressure) { stamps.push({ x, y, pressure }); }
  });
  return { engine, stamps };
}
const points = [
  { x: 10, y: 20, pressure: 0.5, time: 1, tiltX: 0, tiltY: 0 },
  { x: 50, y: 25, pressure: 0.7, time: 2, tiltX: 5, tiltY: 0 },
  { x: 80, y: 65, pressure: 0.9, time: 3, tiltX: 10, tiltY: 5 }
];

for (const count of [1, 2, 3]) {
  test(`${count}-point strokes retain their first and last points during replay`, () => {
    const selected = points.slice(0, count);
    const live = recordingEngine();
    live.engine.startStroke(selected[0]);
    selected.slice(1).forEach(point => live.engine.addPoint(point));
    live.engine.endStroke();
    const replay = recordingEngine();
    replay.engine.withStroke({ tool: 'pen', size: 20, opacity: 1 }, () => {
      selected.forEach((_, i) => replay.engine.renderPoint({}, selected, i));
      replay.engine.finishPath({}, selected);
    });
    assert.deepEqual(replay.stamps, live.stamps);
    assert.deepEqual(live.stamps[0], { x: selected[0].x, y: selected[0].y, pressure: selected[0].pressure });
    assert.deepEqual(live.stamps.at(-1), { x: selected.at(-1).x, y: selected.at(-1).y, pressure: selected.at(-1).pressure });
  });
}

test('replay preserves zero opacity and restores brush settings after errors', () => {
  const { engine } = recordingEngine();
  assert.throws(() => engine.withStroke({ tool: 'eraser', opacity: 0 }, () => {
    assert.equal(engine.baseOpacity, 0);
    assert.equal(engine.dualCanvas.activeTool, 'eraser');
    throw Error('render failure');
  }));
  assert.equal(engine.tool, 'pen');
  assert.equal(engine.color, '#123456');
  assert.equal(engine.baseSize, 20);
  assert.equal(engine.baseOpacity, 1);
});

test('particle random sequence repeats for the same stroke', () => {
  const { engine } = recordingEngine();
  engine.renderPoint({}, points, 0);
  const first = Array.from({ length: 10 }, () => engine.random());
  engine.renderPoint({}, points, 0);
  assert.deepEqual(Array.from({ length: 10 }, () => engine.random()), first);
});

test('completion reads the current artwork after clear and snapshots stroke data', () => {
  let strokes = [{ id: 'old' }];
  const manager = Object.assign(Object.create(CompletionManager.prototype), {
    context: { getStrokes: () => strokes, dualCanvas: { width: 1440, height: 2560, displayCanvas: { toDataURL: () => 'data:image/png;base64,' } } }
  });
  globalThis.localStorage = { getItem: () => '[]', setItem() {} };
  try {
    strokes = [{ id: 'new' }, { id: 'second' }];
    const artwork = manager.packageArtwork('Title', 'Artist', 'classic-wood');
    assert.equal(artwork.width, 1440);
    assert.equal(artwork.height, 2560);
    assert.equal(artwork.strokesCount, 2);
    assert.equal(artwork.strokesData[0].id, 'new');
    strokes[0].id = 'changed';
    assert.equal(artwork.strokesData[0].id, 'new');
  } finally { delete globalThis.localStorage; }
});

test('replacing frames disposes geometry but retains shared preset materials', () => {
  const builder = new FrameBuilder();
  const target = new THREE.Mesh();
  const frame = builder.createFrameMesh();
  builder.currentFrameGroup = frame;
  target.add(frame);
  let disposedGeometries = 0;
  const geometries = new Set();
  frame.traverse(child => { if (child.geometry) geometries.add(child.geometry); });
  geometries.forEach(geometry => geometry.addEventListener('dispose', () => disposedGeometries++));
  let presetDisposed = false;
  builder.materials['classic-wood'].addEventListener('dispose', () => { presetDisposed = true; });
  builder.removeFrame(target);
  assert.equal(disposedGeometries, geometries.size);
  assert.equal(presetDisposed, false);
  assert.equal(target.children.length, 0);
  assert.equal(builder.currentFrameGroup, null);
});
