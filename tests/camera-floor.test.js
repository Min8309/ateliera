import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MIN_CAMERA_HEIGHT, floorOrbitLimit, keepCameraAboveFloor } from '../src/workspace/CameraBounds.js';
test('orbiting at any drawing zoom and vertical offset cannot place the camera under the floor',()=>{
  for(const targetY of [-1.2,0,1.2])for(const distance of [.3,1,4,20]){
    const limit=floorOrbitLimit(targetY,distance);
    assert.ok(targetY+Math.cos(limit)*distance>=MIN_CAMERA_HEIGHT-1e-9);
  }
});
test('a below-floor camera is corrected and a normal walking viewpoint keeps its height',()=>{
  const camera=new THREE.PerspectiveCamera(),controls={target:new THREE.Vector3(0,-1.2,0)};
  camera.position.set(0,-3,4);keepCameraAboveFloor(camera,controls);assert.equal(camera.position.y,MIN_CAMERA_HEIGHT);
  camera.position.set(0,.1,4);keepCameraAboveFloor(camera,controls);assert.equal(camera.position.y,.1);
  assert.ok(Number.isFinite(controls.maxPolarAngle));
});
