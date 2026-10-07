/** 서울의 산 능선, 한강, 교량과 스카이라인을 그리는 자체 제작 파노라마. */
export function createSeoulPanorama(mode) {
  const night = mode === 'night';
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  let seed = 8309;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const sky = ctx.createLinearGradient(0, 0, 0, 700);
  sky.addColorStop(0, night ? '#101a38' : '#7db5d6');
  sky.addColorStop(0.65, night ? '#3a426c' : '#c9dee3');
  sky.addColorStop(1, night ? '#a17781' : '#f3dec0');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 2048, 1024);

  // 햇빛과 달빛의 부드러운 후광.
  const orbX = night ? 1630 : 380;
  const orbY = night ? 170 : 210;
  const halo = ctx.createRadialGradient(orbX, orbY, 5, orbX, orbY, 180);
  halo.addColorStop(0, night ? 'rgba(215,225,255,.2)' : 'rgba(255,242,198,.5)');
  halo.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(orbX - 180, orbY - 180, 360, 360);
  ctx.fillStyle = night ? '#eeeade' : '#fff1cf';
  ctx.beginPath(); ctx.arc(orbX, orbY, night ? 25 : 34, 0, Math.PI * 2); ctx.fill();
  if (night) {
    ctx.fillStyle = 'rgba(235,239,255,.65)';
    for (let i = 0; i < 90; i++) ctx.fillRect(random() * 2048, random() * 360, 1.5, 1.5);
  } else {
    for (const [x, y, w] of [[650, 160, 300], [1450, 230, 340], [100, 330, 280]]) {
      const cloud = ctx.createRadialGradient(x, y, 10, x, y, w / 2);
      cloud.addColorStop(0, 'rgba(255,255,255,.48)');
      cloud.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.save(); ctx.translate(0, y); ctx.scale(1, .18); ctx.translate(0, -y);
      ctx.fillStyle = cloud; ctx.fillRect(x - w, y - w, w * 2, w * 2); ctx.restore();
    }
  }

  const mountain = (base, amplitude, color, phase) => {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(0, 700);
    for (let x = 0; x <= 2048; x += 20) {
      ctx.lineTo(x, base - Math.sin(x / 200 + phase) * amplitude - Math.sin(x / 76 + phase) * amplitude * .22);
    }
    ctx.lineTo(2048, 740); ctx.closePath(); ctx.fill();
  };
  mountain(550, 65, night ? '#55546b' : '#a5b7b7', 1);
  mountain(590, 50, night ? '#3b4359' : '#8fa9a7', 3);

  // 남산과 N서울타워 실루엣.
  ctx.fillStyle = night ? '#263448' : '#7f9b91';
  ctx.beginPath(); ctx.moveTo(140, 675); ctx.bezierCurveTo(290, 590, 380, 435, 510, 475);
  ctx.bezierCurveTo(625, 480, 740, 620, 865, 680); ctx.closePath(); ctx.fill();
  ctx.fillStyle = night ? '#c7b7a6' : '#b9bbb1';
  ctx.fillRect(489, 367, 9, 118);
  ctx.fillRect(474, 357, 40, 12);
  ctx.fillRect(481, 343, 26, 14);
  ctx.fillRect(492, 303, 3, 40);
  if (night) { ctx.fillStyle = '#f9b09d'; ctx.fillRect(474, 357, 40, 4); }

  const riverTop = 686;
  const river = ctx.createLinearGradient(0, riverTop, 0, 1024);
  river.addColorStop(0, night ? '#57506d' : '#92b9c3');
  river.addColorStop(.45, night ? '#24394f' : '#74a9b9');
  river.addColorStop(1, night ? '#12263b' : '#4d879c');
  ctx.fillStyle = river; ctx.fillRect(0, riverTop, 2048, 1024 - riverTop);

  // 건물과 창문은 같은 시드로 생성해 낮/밤의 도시 형태를 유지합니다.
  seed = 8309;
  const reflections = [];
  for (let i = 0, x = -15; x < 2048; i++) {
    const w = 22 + random() * 35;
    const h = 35 + random() * 120;
    const y = 680 - h;
    const face = ctx.createLinearGradient(x, y, x + w, 680);
    face.addColorStop(0, night ? '#29364a' : '#acb7b6');
    face.addColorStop(1, night ? '#182738' : '#7f9299');
    ctx.fillStyle = face; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = night ? '#364557' : '#c4cdca'; ctx.fillRect(x, y, w, 3);
    for (let wy = y + 10; wy < 675; wy += 10) {
      for (let wx = x + 5; wx < x + w - 4; wx += 7) {
        const lit = random() > .4;
        ctx.fillStyle = night && lit ? ((wx + wy) % 5 > 3 ? '#e2b985' : '#f4d7a2') : night ? '#33445a' : '#6e8d9b';
        ctx.fillRect(wx, wy, 2.5, 4);
      }
    }
    reflections.push({ x: x + w / 2, width: w * .6, length: h * 1.7 });
    x += w + 5;
  }

  // 여의도의 유리 타워와 오른쪽 롯데월드타워를 단순화한 형태.
  const tower = (x, y, width, height, color) => {
    ctx.fillStyle = color; ctx.fillRect(x, y, width, height);
    ctx.fillStyle = night ? '#dbc491' : '#bdd3d9';
    for (let row = y + 8; row < y + height; row += 9) ctx.fillRect(x + 4, row, width - 8, 1.5);
    ctx.fillStyle = night ? '#6c8091' : '#dbe3e0'; ctx.fillRect(x + width * .45, y, 3, height);
  };
  tower(200, 400, 50, 280, night ? '#4f5263' : '#adbbc4');
  tower(265, 458, 36, 222, night ? '#354656' : '#94adb7');
  ctx.fillStyle = night ? '#58748a' : '#b3cbd1';
  ctx.beginPath(); ctx.moveTo(1695, 680); ctx.lineTo(1705, 389); ctx.quadraticCurveTo(1713, 325, 1725, 297);
  ctx.quadraticCurveTo(1738, 325, 1745, 389); ctx.lineTo(1755, 680); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = night ? '#ddcca8' : '#e0ebeb'; ctx.lineWidth = 2;
  for (let x = 1715; x < 1740; x += 8) { ctx.beginPath(); ctx.moveTo(x, 390); ctx.lineTo(x, 680); ctx.stroke(); }
  ctx.fillStyle = night ? '#fac697' : '#dce8e7'; ctx.fillRect(1723, 297, 4, 16);
  ctx.fillStyle = night ? '#172b3d' : '#768f83'; ctx.fillRect(0, 680, 2048, 10);

  // 한강 위 교량: 낮에는 콘크리트, 밤에는 조명과 강물 반사.
  ctx.fillStyle = night ? '#b9a184' : '#abb9bc';
  ctx.fillRect(700, 745, 1348, 9);
  ctx.fillStyle = night ? '#455364' : '#7494a1';
  for (let x = 740; x < 2048; x += 165) {
    ctx.fillRect(x, 754, 13, 73);
    ctx.beginPath(); ctx.moveTo(x - 5, 754); ctx.lineTo(x + 24, 754); ctx.lineTo(x + 13, 771); ctx.lineTo(x + 5, 771); ctx.fill();
  }
  ctx.strokeStyle = night ? '#aeafb4' : '#c9d4d5'; ctx.lineWidth = 2;
  ctx.beginPath();ctx.moveTo(700, 743);ctx.lineTo(2048, 743);ctx.stroke();
  for (let x = 718; x < 2048; x += 38) {
    ctx.fillStyle = night ? '#ffdc9d' : '#7d979f'; ctx.fillRect(x, 736, 2, 9);
    if (night) { ctx.fillStyle = 'rgba(251,204,144,.22)';ctx.fillRect(x - 2, 793, 5, 40); }
  }

  if (night) {
    for (const reflection of reflections) {
      const gradient = ctx.createLinearGradient(0, 690, 0, 690 + reflection.length);
      gradient.addColorStop(0, 'rgba(245,202,144,.22)');
      gradient.addColorStop(1, 'rgba(245,202,144,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(reflection.x, 695, reflection.width, reflection.length);
    }
  }
  for (let i = 0; i < 330; i++) {
    const y = 700 + random() * 324;
    ctx.strokeStyle = night ? `rgba(160,185,214,${random() * .12})` : `rgba(224,240,235,${random() * .35})`;
    ctx.lineWidth = .5 + (y - 700) / 180;
    const x = random() * 2048;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 12 + random() * 90, y);ctx.stroke();
  }
  return canvas;
}
