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
