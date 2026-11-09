// Icono de The AI Toolbox: caja de herramientas con un rayo, en azul y blanco.
function toolboxSVG(size, { bg = true } = {}) {
  const s = size / 800;
  const t = (n) => (n * s).toFixed(1);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <radialGradient id="tg" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="#3b82f6"/><stop offset="1" stop-color="#1e3a8a"/></radialGradient>
  </defs>
  ${bg ? `<rect width="${size}" height="${size}" fill="url(#tg)"/>` : ''}
  <path d="M${t(300)},${t(255)} V${t(210)} Q${t(300)},${t(180)} ${t(330)},${t(180)} H${t(470)} Q${t(500)},${t(180)} ${t(500)},${t(210)} V${t(255)}"
        fill="none" stroke="#ffffff" stroke-width="${t(34)}" stroke-linecap="round"/>
  <rect x="${t(160)}" y="${t(255)}" width="${t(480)}" height="${t(360)}" rx="${t(44)}" fill="#ffffff"/>
  <rect x="${t(160)}" y="${t(345)}" width="${t(480)}" height="${t(22)}" fill="#1e3a8a" opacity=".9"/>
  <rect x="${t(360)}" y="${t(325)}" width="${t(80)}" height="${t(62)}" rx="${t(12)}" fill="#facc15"/>
  <polygon points="${[[418, 405], [338, 520], [393, 520], [372, 600], [462, 478], [405, 478], [440, 405]].map(([x, y]) => `${t(x)},${t(y)}`).join(' ')}"
        fill="#2563eb"/>
</svg>`;
}
