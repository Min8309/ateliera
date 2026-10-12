import test from 'node:test';
import assert from 'node:assert/strict';
import { PetState } from '../src/pet/PetState.js';
test('pet state survives a reload and bounded offline time',()=>{
 const pet=new PetState({fullness:65,happiness:80,energy:70,lastUpdated:0},3600000);
 assert.ok(pet.fullness<65&&pet.energy<70);assert.deepEqual(new PetState(pet.serialize(),3600000).serialize(),pet.serialize());
 const long=new PetState({fullness:100,happiness:100,energy:0,sleeping:true,lastUpdated:0},1000000000);
 assert.ok(long.fullness>30);assert.equal(long.energy,100);
});
test('feeding, affection, playing and sleep keep stats in range and express needs',()=>{
 const p=new PetState({fullness:10,happiness:20,energy:10},0);assert.equal(p.emotion,'배가 고파요');
 assert.ok(p.act('play',0).includes('쉬고'));p.act('feed',0);p.act('pet',0);assert.equal(p.fullness,38);assert.equal(p.happiness,40);
 p.act('sleep',0);assert.equal(p.sleeping,true);p.advance(60000);assert.ok(p.energy>18);p.act('sleep',60000);p.act('play',60000);assert.ok(p.happiness>50);
 for(let i=0;i<20;i++)p.act('feed',60000);assert.ok(p.fullness<=100);assert.ok(p.act('feed',60000).includes('배불러요'));
});
test('corrupt stats and backwards clocks do not produce negative values or NaN',()=>{
 const p=new PetState({fullness:Infinity,happiness:-10,energy:200,lastUpdated:5000},1000);assert.equal(p.fullness,65);assert.equal(p.happiness,0);assert.equal(p.energy,100);p.advance(0);assert.ok(Object.values(p.serialize()).filter(v=>typeof v==='number').every(Number.isFinite));
});
