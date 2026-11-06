// Genera artifact/oficina-ia.html: la oficina en un solo archivo, lista para publicar
// como Artifact de Claude (se abre con un enlace, también desde el teléfono).
// Uso: node scripts/build-artifact.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const THREE_VERSION = '0.160.0';

const html = read('public/index.html');
const body = html.slice(html.indexOf('<div id="scene">'), html.indexOf('<script type="module"')).trim();
const css = read('public/style.css');
const agents = read('server/agents.js').replace(/^export /gm, '');
const engine = read('artifact/engine.js');
const office = read('public/office.js').replace(/^export function/m, 'function');
const app = read('public/app.js').replace(/^import .*office\.js';\n/m, '');

const noClose = (s) => s.replace(/<\/script/gi, '<\\/script');

const out = `<title>Oficina IA</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap">
<style>
:root { color-scheme: light; }
${css}
</style>
<script type="importmap">
{ "imports": {
  "three": "https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/build/three.module.js",
  "three/addons/": "https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/examples/jsm/"
} }
</script>
${body}
<script>
${noClose(agents)}
${noClose(engine)}
</script>
<script type="module">
${noClose(office)}
${noClose(app)}
</script>
`;

fs.writeFileSync(path.join(root, 'artifact', 'oficina-ia.html'), out);
console.log(`artifact/oficina-ia.html (${(out.length / 1024).toFixed(0)} KB)`);
