import test from 'node:test';
import assert from 'node:assert/strict';
import { CANVAS_PRESETS, canvasWorldSize, fitStrokes } from '../src/drawing/CanvasPresets.js';
import { DualCanvasManager } from '../src/drawing/DualCanvas.js';
import { FrameBuilder } from '../src/frame/FrameBuilder.js';
import { AtelierEnvironment } from '../src/environment/AtelierEnvironment.js';

const stroke = { id: 'stroke-1', tool: 'pen', color: '#123456', size: 32, opacity: .8,
  points: [{ x: 0, y: 0, pressure: .5, time: 10, tiltX: 20 }, { x: 2048, y: 2048, pressure: 1, time: 20, tiltX: 30 }] };

for (const name of ['landscape', 'portrait', 'compact']) {
  test(`resize into ${name} preserves aspect ratio, stroke metadata and bounds`, () => {
    const preset = CANVAS_PRESETS[name];
    const [resized] = fitStrokes([stroke], CANVAS_PRESETS.square, preset);
    const [a, b] = resized.points;
    assert.equal(b.x - a.x, b.y - a.y);
    assert.equal(a.x + b.x, preset.width);
    assert.equal(a.y + b.y, preset.height);
    assert.equal(resized.id, stroke.id);
    assert.equal(a.time, 10);
    assert.equal(a.tiltX, 20);
    assert.equal(resized.size, 32 * Math.min(preset.width / 2048, preset.height / 2048));
    for (const point of resized.points) {
      assert.ok(point.x >= 0 && point.x <= preset.width);
      assert.ok(point.y >= 0 && point.y <= preset.height);
    }
    assert.equal(stroke.size, 32);
    assert.equal(stroke.points[1].x, 2048);
  });
}

test('contain fitting remains centered, and resolution-only round trips restore strokes', () => {
  const landscape = fitStrokes([stroke], CANVAS_PRESETS.square, CANVAS_PRESETS.landscape);
  const restored = fitStrokes(landscape, CANVAS_PRESETS.landscape, CANVAS_PRESETS.square);
  // Contain fitting is intentionally not reversible when switching aspect ratio twice:
  // every step keeps the complete image within its new paper, without cropping it.
  assert.equal(restored[0].points[0].x + restored[0].points[1].x, 2048);
  assert.equal(restored[0].points[0].y + restored[0].points[1].y, 2048);
  const small = fitStrokes([stroke], CANVAS_PRESETS.square, CANVAS_PRESETS.compact);
  assert.deepEqual(fitStrokes(small, CANVAS_PRESETS.compact, CANVAS_PRESETS.square), [stroke]);
});

test('non-square canvas UV uses independent width and height', () => {
  const canvas = Object.assign(Object.create(DualCanvasManager.prototype), { width: 2560, height: 1440 });
  assert.deepEqual(canvas.uvToCanvasCoords({ x: .25, y: .75 }), { x: 640, y: 360 });
});

test('3D canvas and frame dimensions follow each selected aspect ratio', () => {
  const builder = new FrameBuilder();
  for (const preset of Object.values(CANVAS_PRESETS)) {
    const world = canvasWorldSize(preset.width, preset.height);
    assert.equal(Math.max(world.width, world.height), 2);
    assert.equal(world.width / world.height, preset.width / preset.height);
    const frame = builder.createFrameMesh('classic-wood', world.width, world.height);
    const [top, bottom, left, right] = frame.children;
    assert.ok(top.position.y > world.height / 2);
    assert.ok(bottom.position.y < -world.height / 2);
    assert.ok(left.position.x < -world.width / 2);
    assert.ok(right.position.x > world.width / 2);
    builder.currentFrameGroup = frame;
    builder.removeFrame();
  }
});

test('time-of-day control accepts day and night and rejects invalid modes', () => {
  const studio = Object.assign(Object.create(AtelierEnvironment.prototype), { timeOfDay: 'day' });
  studio.setTimeOfDay('night'); assert.equal(studio.timeOfDay, 'night');
  studio.setTimeOfDay('invalid'); assert.equal(studio.timeOfDay, 'night');
  studio.setTimeOfDay('day'); assert.equal(studio.timeOfDay, 'day');
});
