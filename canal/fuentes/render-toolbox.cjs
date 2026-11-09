const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const icon = fs.readFileSync(path.join(__dirname, 'icono-toolbox.js'), 'utf8');
const out = path.join(__dirname, '..', 'the-ai-toolbox');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 800, height: 800 }, deviceScaleFactor: 1 });
  p.on('pageerror', (e) => console.error(String(e)));
  await p.setContent(`<html><body style="margin:0"><div id=x></div><script>${icon};document.getElementById('x').innerHTML=toolboxSVG(800)</script></body></html>`);
  await p.screenshot({ path: path.join(out, 'logo-800x800.png'), clip: { x: 0, y: 0, width: 800, height: 800 } });
  await p.setViewportSize({ width: 2560, height: 1440 });
  await p.setContent(`<html><head><style>
  body{margin:0;width:2560px;height:1440px;overflow:hidden;font-family:Inter,sans-serif;position:relative;
    background:radial-gradient(ellipse 60% 55% at 50% 50%,#1d4ed8 0%,#0f2a6b 45%,#081433 100%)}
  .grid{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.05) 1px,transparent 1px);background-size:64px 64px}
  .tools{position:absolute;inset:0}
  .safe{position:absolute;left:662px;top:551px;width:1235px;height:338px;display:flex;align-items:center;justify-content:center;gap:44px}
  .ic svg{width:230px;height:230px;border-radius:52px;box-shadow:0 20px 60px rgba(0,0,0,.35)}
  h1{margin:0;color:#fff;font-weight:900;font-size:112px;letter-spacing:-3px;line-height:1;white-space:nowrap}
  h1 span{color:#93c5fd}
  p{margin:18px 0 0;color:#dbeafe;font-size:44px;font-weight:600}
  small{display:inline-block;margin-top:18px;color:#0b1a3d;background:#facc15;font-weight:800;font-size:26px;letter-spacing:2px;padding:8px 16px;border-radius:10px}
  </style></head><body><div class=grid></div><svg class=tools id=tools width=2560 height=1440></svg>
  <div class=safe><div class=ic id=ic></div><div><h1>The AI <span>Toolbox</span></h1><p>Free AI tools, tested for real.</p><small>NEW TUTORIALS EVERY WEEK</small></div></div>
  <script>${icon};{document.getElementById('ic').innerHTML=toolboxSVG(230);
  // iconos decorativos (llave, engranaje, chispa) fuera de la zona segura
  let s=11;const r=()=>{s=(s*9301+49297)%233280;return s/233280};
  const shapes=[
    (x,y,k)=>'<circle cx="'+x+'" cy="'+y+'" r="'+22*k+'" fill="none" stroke="#93c5fd" stroke-width="'+6*k+'"/><circle cx="'+x+'" cy="'+y+'" r="'+6*k+'" fill="#93c5fd"/>',
    (x,y,k)=>'<path d="M'+(x-30*k)+','+(y+30*k)+' L'+(x+14*k)+','+(y-14*k)+'" stroke="#93c5fd" stroke-width="'+12*k+'" stroke-linecap="round"/><circle cx="'+(x+22*k)+'" cy="'+(y-22*k)+'" r="'+16*k+'" fill="none" stroke="#93c5fd" stroke-width="'+8*k+'"/>',
    (x,y,k)=>'<path d="M'+x+','+(y-30*k)+' L'+(x+8*k)+','+(y-8*k)+' L'+(x+30*k)+','+y+' L'+(x+8*k)+','+(y+8*k)+' L'+x+','+(y+30*k)+' L'+(x-8*k)+','+(y+8*k)+' L'+(x-30*k)+','+y+' L'+(x-8*k)+','+(y-8*k)+'Z" fill="#facc15"/>',
    (x,y,k)=>'<rect x="'+(x-26*k)+'" y="'+(y-18*k)+'" width="'+52*k+'" height="'+36*k+'" rx="'+8*k+'" fill="none" stroke="#93c5fd" stroke-width="'+6*k+'"/><path d="M'+(x-10*k)+','+(y-4*k)+' l'+8*k+','+8*k+' l'+12*k+','+(-12*k)+'" stroke="#93c5fd" stroke-width="'+6*k+'" fill="none" stroke-linecap="round"/>'
  ];
  let h='';for(let i=0;i<46;i++){const x=r()*2560,y=r()*1440;if(x>520&&x<2040&&y>440&&y<1000)continue;const k=1+r()*1.6;h+='<g opacity="'+(0.25+r()*0.45)+'">'+shapes[(r()*4)|0](x,y,k)+'</g>'}
  document.getElementById('tools').innerHTML=h;}</script></body></html>`);
  await p.waitForTimeout(200);
  await p.screenshot({ path: path.join(out, 'banner-2560x1440.png'), clip: { x: 0, y: 0, width: 2560, height: 1440 } });
  await b.close();
})();
