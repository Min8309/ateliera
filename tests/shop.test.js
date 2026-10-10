import test from 'node:test';
import assert from 'node:assert/strict';
import { PRODUCTS, sanitizeCart, changeQuantity } from '../src/shop/Catalog.js';
import { StudioExplorer } from '../src/shop/StudioExplorer.js';

test('cart discards stale or malformed storage and caps quantities', () => {
  assert.deepEqual(sanitizeCart(null), {});
  assert.deepEqual(sanitizeCart({ brush: 2, paint: 120, pencil: -1, paper: '2', unknown: 7 }), {brush:2,paint:99});
  let cart = changeQuantity({}, 'brush', 1);
  assert.deepEqual(changeQuantity(cart, 'unknown', 1), cart);
  assert.deepEqual(changeQuantity(cart, 'brush', -1), {});
  assert.deepEqual(cart, {brush:1});
  assert.ok(PRODUCTS.every(product => product.priceUrl === 'https://hwabang.net/' && product.price === undefined));
});

test('walking respects doorway, closed door and room bounds', () => {
  const explorer = Object.create(StudioExplorer.prototype);
  explorer.room = {doorOpen:false};explorer.colliders = [];
  assert.equal(explorer.canMove(-6,1.3),false);
  explorer.room.doorOpen = true;
  assert.equal(explorer.canMove(-6,1.3),true);
  assert.equal(explorer.canMove(-6,0),false);
  assert.equal(explorer.canMove(-6,2.3),false);
  assert.equal(explorer.canMove(-11,1.3),false);
  assert.equal(explorer.canMove(-8,1.3),true);
});


test('walking covers the same distance across frame rates and cannot cross a closed wall', () => {
  const createExplorer = () => {
    const explorer = Object.create(StudioExplorer.prototype);
    explorer.app = {camera:{position:{x:0,z:3}}};
    explorer.keys = new Set(['KeyW']);explorer.yaw = 0;
    explorer.room = {doorOpen:false};explorer.colliders = [];
    return explorer;
  };
  const fast = createExplorer(), slow = createExplorer();
  for(let i=0;i<60;i++) fast.move(1/60);
  for(let i=0;i<4;i++) slow.move(.25);
  assert.ok(Math.abs(fast.app.camera.position.z-slow.app.camera.position.z)<1e-10);
  const blocked = createExplorer();blocked.app.camera.position = {x:-5.3,z:1.3};blocked.yaw=Math.PI/2;
  for(let i=0;i<4;i++) blocked.move(.25);
  assert.ok(blocked.app.camera.position.x > -5.68);
  blocked.room.doorOpen=true;
  for(let i=0;i<4;i++) blocked.move(.25);
  assert.ok(blocked.app.camera.position.x < -6.5);
});
