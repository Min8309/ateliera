import test from 'node:test';
import assert from 'node:assert/strict';
import { artworkDate } from '../src/workspace/ArtworkRepository.js';
test('artwork date uses the Seoul day across UTC midnight boundaries',()=>{
  assert.equal(artworkDate(new Date('2026-10-11T16:05:00Z')),'2026-10-12');
  assert.equal(artworkDate(new Date('2026-10-11T14:59:00Z')),'2026-10-11');
});
