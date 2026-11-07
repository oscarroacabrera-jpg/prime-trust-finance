const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const icon = fs.readFileSync(path.join(__dirname, 'icono.js'), 'utf8');
const out = path.join(__dirname, '..');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 800, height: 800 }, deviceScaleFactor: 1 });
  await p.setContent(`<html><body style="margin:0"><div id=x></div><script>${icon};document.getElementById('x').innerHTML=iconSVG(800)</script></body></html>`);
  await p.screenshot({ path: path.join(out, 'logo-800x800.png'), clip: { x: 0, y: 0, width: 800, height: 800 } });

  await p.setViewportSize({ width: 2560, height: 1440 });
  await p.setContent(`<html><head><style>
  body{margin:0;width:2560px;height:1440px;overflow:hidden;font-family:Inter,sans-serif;
    background:radial-gradient(ellipse 60% 55% at 50% 50%,#1d4ed8 0%,#0f2a6b 45%,#081433 100%);position:relative}
  .grid{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.05) 1px,transparent 1px);background-size:64px 64px}
  svg.net{position:absolute;inset:0}
  .safe{position:absolute;left:662px;top:551px;width:1235px;height:338px;display:flex;align-items:center;justify-content:center;gap:44px}
  .safe .ic svg{width:230px;height:230px;border-radius:52px;box-shadow:0 20px 60px rgba(0,0,0,.35)}
  h1{margin:0;color:#fff;font-weight:900;font-size:118px;letter-spacing:-3px;line-height:1}
  h1 span{color:#93c5fd}
  p{margin:18px 0 0;color:#dbeafe;font-size:46px;font-weight:600}
  small{display:inline-block;margin-top:18px;color:#0b1a3d;background:#facc15;font-weight:800;font-size:26px;letter-spacing:2px;padding:8px 16px;border-radius:10px}
  </style></head><body><div class=grid></div><svg class=net id=net width=2560 height=1440></svg>
  <div class=safe><div class=ic id=ic></div><div><h1>AI Made <span>Simple</span></h1><p>Work smarter with AI.</p><small>NEW TUTORIALS EVERY WEEK</small></div></div>
  <script>${icon};document.getElementById('ic').innerHTML=iconSVG(230);
  // red de nodos decorativa fuera de la zona segura
  let s=7;const r=()=>{s=(s*9301+49297)%233280;return s/233280};
  const n=document.getElementById('net');let h='';const pts=[];
  for(let i=0;i<70;i++){let x=r()*2560,y=r()*1440;if(x>560&&x<2000&&y>480&&y<960)continue;pts.push([x,y])}
  for(const [x,y] of pts){for(const [a,b2] of pts){const d=Math.hypot(x-a,y-b2);if(d>0&&d<260)h+='<line x1="'+x+'" y1="'+y+'" x2="'+a+'" y2="'+b2+'" stroke="rgba(147,197,253,'+(0.25*(1-d/260))+')" stroke-width="2"/>'}}
  for(const [x,y] of pts)h+='<circle cx="'+x+'" cy="'+y+'" r="'+(3+r()*5)+'" fill="'+(r()<.15?'#facc15':'#93c5fd')+'" opacity=".8"/>';
  n.innerHTML=h;</script></body></html>`);
  await p.waitForTimeout(300);
  await p.screenshot({ path: path.join(out, 'banner-2560x1440.png'), clip: { x: 0, y: 0, width: 2560, height: 1440 } });
  // vista previa con la zona segura marcada (solo para revisar)
  await p.evaluate(() => { const d=document.createElement('div'); d.style.cssText='position:absolute;left:662px;top:551px;width:1235px;height:338px;outline:6px dashed #f43f5e'; document.body.appendChild(d); });
  await p.screenshot({ path: process.argv[2] + '/banner-safe.png', clip: { x: 0, y: 0, width: 2560, height: 1440 } });
  await b.close();
})();
