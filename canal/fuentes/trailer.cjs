// Genera las escenas del tráiler (1920x1080) como imágenes.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const icon = fs.readFileSync(path.join(__dirname, 'icono.js'), 'utf8');
const scenes = [
  { big: 'Tired of wasting <span>hours</span>', small: 'on tasks AI can do in minutes?' },
  { big: 'I test <span>free</span> AI tools', small: 'so you don’t have to.' },
  { big: 'And show you <span>exactly</span>', small: 'how to use them, step by step.' },
  { big: 'Real tests. <span>No hype.</span>', small: 'Just what actually works.' },
  { big: 'New tutorials <span>every week</span>', small: 'ChatGPT · automation · free AI tools' },
  { logo: true },
];
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  p.on('pageerror', (e) => console.error('pageerror', String(e)));
  const dir = process.argv[2];
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    const inner = s.logo
      ? `<div class=end><div id=ic></div><h1>AI Made <span>Simple</span></h1><p>Subscribe and work smarter.</p><small>NEW TUTORIALS EVERY WEEK</small></div>`
      : `<div class=txt><h1>${s.big}</h1><p>${s.small}</p></div>`;
    await p.setContent(`<html><head><style>
      body{margin:0;width:1920px;height:1080px;overflow:hidden;font-family:Inter,sans-serif;display:grid;place-items:center;
        background:radial-gradient(ellipse 70% 60% at 50% 45%,#1d4ed8 0%,#0f2a6b 50%,#081433 100%)}
      body::before{content:"";position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.05) 1px,transparent 1px);background-size:60px 60px}
      .txt,.end{position:relative;text-align:center;padding:0 120px}
      h1{margin:0;color:#fff;font-weight:900;font-size:124px;letter-spacing:-3px;line-height:1.05}
      h1 span{color:#facc15}
      .end h1 span{color:#93c5fd}
      p{margin:34px 0 0;color:#dbeafe;font-size:58px;font-weight:600}
      #ic svg{width:260px;height:260px;border-radius:60px;box-shadow:0 20px 60px rgba(0,0,0,.4);margin-bottom:40px}
      small{display:inline-block;margin-top:34px;color:#0b1a3d;background:#facc15;font-weight:800;font-size:32px;letter-spacing:3px;padding:10px 20px;border-radius:12px}
      .bar{position:absolute;left:0;bottom:0;height:12px;background:#facc15;width:${((i + 1) / scenes.length) * 100}%}
    </style></head><body>${inner}<div class=bar></div>
    <script>${icon};{const el=document.getElementById('ic');if(el)el.innerHTML=iconSVG(260)}</script></body></html>`);
    await p.screenshot({ path: path.join(dir, `scene${i}.png`) });
  }
  await b.close();
})();
