// Dibuja el icono del canal (engranaje con un rayo) como SVG.
function gearPath(cx, cy, rOuter, rInner, teeth) {
  const pts = [];
  const step = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    const w = step * 0.22;
    pts.push([a - step / 2 + w, rInner], [a - w * 1.1, rOuter], [a + w * 1.1, rOuter], [a + step / 2 - w, rInner]);
  }
  return 'M' + pts.map(([a, r]) => `${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r).toFixed(1)}`).join('L') + 'Z';
}
function iconSVG(size, { bg = true } = {}) {
  const c = size / 2;
  const gear = gearPath(c, c, size * 0.40, size * 0.33, 9);
  const hole = size * 0.255;
  const s = size / 800;
  const bolt = [[430, 205], [290, 430], [395, 430], [360, 595], [515, 355], [405, 355], [455, 205]]
    .map(([x, y]) => `${x * s},${y * s}`).join(' ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <radialGradient id="g" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="#3b82f6"/><stop offset="1" stop-color="#1e3a8a"/></radialGradient>
    <mask id="m"><rect width="${size}" height="${size}" fill="#fff"/><circle cx="${c}" cy="${c}" r="${hole}" fill="#000"/></mask>
  </defs>
  ${bg ? `<rect width="${size}" height="${size}" fill="url(#g)"/>` : ''}
  <path d="${gear}" fill="#ffffff" mask="url(#m)"/>
  <polygon points="${bolt}" fill="#ffffff" stroke="#1e3a8a" stroke-width="${10 * s}" stroke-linejoin="round" paint-order="stroke"/>
</svg>`;
}
