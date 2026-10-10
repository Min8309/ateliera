export const PRODUCTS = [
  { id: 'brush', name: '수채화 붓', description: '둥근 붓과 납작한 붓을 모은 진열입니다.', kind: 'brush' },
  { id: 'paint', name: '튜브 물감', description: '수채·아크릴 작업에 사용할 물감을 살펴보세요.', kind: 'paint' },
  { id: 'pencil', name: '드로잉 연필', description: '스케치와 명암 표현을 위한 연필입니다.', kind: 'pencil' },
  { id: 'charcoal', name: '목탄', description: '넓은 면과 거친 질감을 표현하는 드로잉 재료입니다.', kind: 'charcoal' },
  { id: 'canvas', name: '캔버스', description: '진열장 위쪽에 세워 둔 작업용 캔버스입니다.', kind: 'canvas' },
  { id: 'paper', name: '수채화 종이', description: '층층이 쌓인 두꺼운 수채화용 종이입니다.', kind: 'paper' }
].map(product => ({ ...product, priceUrl: 'https://hwabang.net/' }));

export function sanitizeCart(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(PRODUCTS.filter(p => Number.isInteger(value[p.id]) && value[p.id] > 0)
    .map(p => [p.id, Math.min(99, value[p.id])]));
}

export function changeQuantity(cart, id, delta) {
  const result = sanitizeCart(cart);
  if (!PRODUCTS.some(p => p.id === id)) return result;
  const next = Math.max(0, Math.min(99, (result[id] || 0) + delta));
  if (next) result[id] = next; else delete result[id];
  return result;
}
