import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Aji } from '../src/pet/Aji.js';
import { PetState } from '../src/pet/PetState.js';

function pet(){
  const a=Object.create(Aji.prototype);
  Object.assign(a,{app:{scene:new THREE.Scene()},state:new PetState(),time:0,activity:'idle',hungerPhase:null,nextBark:0,barkUntil:0,group:new THREE.Group(),head:new THREE.Group(),bowl:new THREE.Group(),bowlGround:new THREE.Vector3(-2.2,-1.52,1.6),goal:new THREE.Vector3(),barks:0});
  a.app.scene.add(a.bowl);a.group.add(a.head);a.bark=()=>a.barks++;
  return a;
}

test('hungry pet brings the same bowl to the canvas and stops asking after food',()=>{
  const a=pet();a.state.fullness=10;a.updateHunger();assert.equal(a.barks,1);
  a.group.position.copy(a.goal);a.updateHunger();assert.equal(a.bowl.parent,a.head);
  a.group.position.copy(a.goal);a.updateHunger();assert.equal(a.bowl.parent,a.app.scene);assert.ok(a.bowl.position.distanceTo(a.group.position)<.4);
  a.time=2;a.updateHunger();assert.equal(a.barks,1);
  a.state.act('feed');a.updateHunger();assert.equal(a.hungerPhase,null);
  a.time=20;a.updateHunger();assert.equal(a.barks,1);
});

test('sleep interrupts bowl carrying and leaves the bowl available for the next hunger cycle',()=>{
  const a=pet();a.state.fullness=5;a.updateHunger();a.group.position.copy(a.goal);a.updateHunger();assert.equal(a.bowl.parent,a.head);
  a.state.act('sleep');a.updateHunger();assert.equal(a.bowl.parent,a.app.scene);assert.equal(a.hungerPhase,null);
  a.time=30;a.updateHunger();assert.equal(a.barks,1);
  a.state.act('sleep');a.updateHunger();assert.equal(a.bowl.parent,a.head);a.group.position.copy(a.goal);a.updateHunger();assert.equal(a.barks,2);
});
