// Servidor de la Oficina IA: sirve la escena 3D, guarda el estado y orquesta a los agentes.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { AGENTS, TEAMS, COMPANY } from './agents.js';
import { DEMO, MODEL, runAgentTurn, planTask } from './ai.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');
const PUBLIC = path.join(ROOT, 'public');
const THREE_DIR = path.join(ROOT, 'node_modules', 'three');
const DATA_DIR = path.join(ROOT, 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const PORT = Number(process.env.PORT || 3000);

// ------------------------------------------------------------------ estado
const agents = new Map(
  AGENTS.map((cfg) => [
    cfg.id,
    {
      ...cfg,
      status: 'idle', // idle | queued | thinking | working | coordinating | done | error
      progress: 0,
      tokens: 0,
      currentTask: '',
      queue: [],
      messages: [], // para la interfaz: {id, from, text, ts}
      history: [], // para la API de Claude
      completed: 0,
      controller: null,
      busy: false,
    },
  ]),
);
const tasks = [];
const activity = [];

function loadState() {
  try {
    const saved = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    for (const s of saved.agents || []) {
      const a = agents.get(s.id);
      if (!a) continue;
      Object.assign(a, { messages: s.messages || [], history: s.history || [], tokens: s.tokens || 0, completed: s.completed || 0 });
      // Un historial que termina en un mensaje del usuario quedó a medias: se descarta ese último turno.
      while (a.history.length && a.history[a.history.length - 1].role === 'user') a.history.pop();
    }
    tasks.push(...(saved.tasks || []).map((t) => (t.status === 'done' || t.status === 'error' ? t : { ...t, status: 'error' })));
    activity.push(...(saved.activity || []));
  } catch {
    /* primer arranque */
  }
}
let saveTimer = null;
function saveState() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const data = {
      agents: [...agents.values()].map((a) => ({
        id: a.id, messages: a.messages.slice(-200), history: a.history, tokens: a.tokens, completed: a.completed,
      })),
      tasks: tasks.slice(-100),
      activity: activity.slice(-200),
    };
    fs.writeFile(STATE_FILE, JSON.stringify(data), () => {});
  }, 500);
}

// ------------------------------------------------------------- tiempo real
const clients = new Set();
function broadcast(event) {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of clients) res.write(payload);
}
function publicAgent(a) {
  const { history, controller, queue, persona, busy, ...rest } = a;
  return { ...rest, queued: queue.length, messages: undefined };
}
function pushAgent(a) {
  broadcast({ type: 'agent', agent: publicAgent(a) });
  saveState();
}
function log(text, kind = 'info', agentId) {
  const entry = { id: randomUUID(), text, kind, agentId, ts: Date.now() };
  activity.push(entry);
  if (activity.length > 300) activity.shift();
  broadcast({ type: 'log', entry });
}
function addMessage(a, from, text, extra = {}) {
  const msg = { id: randomUUID(), from, text, ts: Date.now(), ...extra };
  a.messages.push(msg);
  broadcast({ type: 'message', agentId: a.id, message: msg });
  saveState();
  return msg;
}

function friendlyError(err) {
  if (err?.status === 401) return 'Tu ANTHROPIC_API_KEY no es válida. Revisa la clave y reinicia el servidor.';
  if (err?.status === 429) return 'Límite de uso de la API alcanzado. Espera un momento e inténtalo de nuevo.';
  if (err?.status >= 500) return 'La API de Claude no respondió. Inténtalo de nuevo en unos segundos.';
  return err?.message || String(err);
}

// ---------------------------------------------------------- trabajo de agentes
/** Encola una tarea para un agente. Devuelve una promesa con el texto entregado. */
function assign(agent, text, from = 'user') {
  return new Promise((resolve, reject) => {
    agent.queue.push({ text, from, resolve, reject });
    if (!agent.busy) processQueue(agent);
    else pushAgent(agent);
  });
}

async function processQueue(agent) {
  const job = agent.queue.shift();
  if (!job) return;
  agent.busy = true;
  addMessage(agent, job.from, job.text);
  agent.history.push({ role: 'user', content: job.from === 'user' ? job.text : `[Tarea asignada por ${agents.get(job.from)?.name || job.from}]\n${job.text}` });
  try {
    const result = await runTurn(agent, job.text);
    job.resolve(result);
  } catch (err) {
    job.reject(err);
  }
  agent.busy = false;
  processQueue(agent);
}

/** Corre un turno con el último mensaje del historial y transmite el progreso. */
async function runTurn(agent, label) {
  agent.status = 'thinking';
  agent.progress = 4;
  agent.currentTask = label.slice(0, 120);
  agent.controller = new AbortController();
  pushAgent(agent);
  log(`${agent.name} empezó: "${label.slice(0, 80)}"`, 'start', agent.id);

  const msgId = randomUUID();
  broadcast({ type: 'message', agentId: agent.id, message: { id: msgId, from: agent.id, text: '', ts: Date.now(), streaming: true } });

  let chars = 0;
  let lastPush = 0;
  const baseTokens = agent.tokens;
  try {
    const { text, tokens } = await runAgentTurn(agent, agent.history, {
      signal: agent.controller.signal,
      onThinking() {
        agent.status = 'thinking';
        agent.progress = Math.max(agent.progress, 8);
        pushAgent(agent);
      },
      onText(delta) {
        chars += delta.length;
        broadcast({ type: 'delta', agentId: agent.id, msgId, text: delta });
        agent.status = 'working';
        agent.progress = Math.round(10 + 85 * (1 - Math.exp(-chars / 1600)));
        const now = Date.now();
        if (now - lastPush > 250) {
          lastPush = now;
          pushAgent(agent);
        }
      },
      onTokens(n) {
        agent.tokens = baseTokens + n;
      },
    });
    agent.tokens = baseTokens + tokens;
    agent.status = 'done';
    agent.progress = 100;
    agent.completed += 1;
    const msg = { id: msgId, from: agent.id, text, ts: Date.now() };
    agent.messages.push(msg);
    broadcast({ type: 'message', agentId: agent.id, message: msg });
    log(`${agent.name} entregó su trabajo`, 'done', agent.id);
    return text;
  } catch (err) {
    const aborted = err?.name === 'AbortError' || agent.controller?.signal.aborted;
    // El turno fallido no se queda en el historial (evita dos mensajes de usuario seguidos).
    if (agent.history.at(-1)?.role === 'user') agent.history.pop();
    agent.status = aborted ? 'idle' : 'error';
    agent.progress = 0;
    const text = aborted ? '⏹️ Tarea cancelada.' : `⚠️ Error: ${friendlyError(err)}`;
    const msg = { id: msgId, from: agent.id, text, ts: Date.now(), error: !aborted };
    agent.messages.push(msg);
    broadcast({ type: 'message', agentId: agent.id, message: msg });
    log(`${agent.name}: ${aborted ? 'tarea cancelada' : 'error'}`, 'error', agent.id);
    console.error(`[${agent.name}]`, err?.message || err);
    throw err;
  } finally {
    agent.controller = null;
    pushAgent(agent);
  }
}

/** Flujo de equipo: el director planifica, delega en paralelo y consolida. */
async function runTeamTask(goal) {
  const director = [...agents.values()].find((a) => a.isDirector);
  const task = { id: randomUUID(), goal, status: 'planning', assignments: [], createdAt: Date.now() };
  tasks.push(task);
  broadcast({ type: 'task', task });
  log(`Nueva tarea para el equipo: "${goal.slice(0, 90)}"`, 'task');

  // Si el director está ocupado con otra cosa, espera su turno.
  while (director.busy) await new Promise((r) => setTimeout(r, 500));
  director.busy = true;
  addMessage(director, 'user', goal);
  director.status = 'thinking';
  director.progress = 5;
  director.currentTask = 'Planificando: ' + goal.slice(0, 100);
  director.controller = new AbortController();
  pushAgent(director);

  try {
    const plan = await planTask(director, goal, director.controller.signal);
    task.assignments = plan.asignaciones.map((x) => ({ agentId: x.agente_id, task: x.tarea, status: 'working' }));
    task.status = 'working';
    broadcast({ type: 'task', task });
    addMessage(
      director,
      director.id,
      `${plan.mensaje}\n\n${task.assignments.map((x) => `- **${agents.get(x.agentId).name}** (${agents.get(x.agentId).role}): ${x.task}`).join('\n')}`,
    );

    director.status = 'coordinating';
    director.currentTask = `Coordinando ${task.assignments.length} agentes`;
    director.progress = 15;
    director.controller = null;
    pushAgent(director);

    let finished = 0;
    const results = await Promise.allSettled(
      task.assignments.map(async (asg, i) => {
        const agent = agents.get(asg.agentId);
        await new Promise((r) => setTimeout(r, i * 450)); // pequeño escalonado para ver los envíos
        broadcast({ type: 'delegate', from: director.id, to: agent.id, text: asg.task });
        log(`${director.name} → ${agent.name}: ${asg.task.slice(0, 70)}`, 'delegate', agent.id);
        try {
          const text = await assign(agent, asg.task, director.id);
          asg.status = 'done';
          broadcast({ type: 'deliver', from: agent.id, to: director.id });
          return text;
        } catch (e) {
          asg.status = 'error';
          throw e;
        } finally {
          finished += 1;
          director.progress = Math.round(15 + (60 * finished) / task.assignments.length);
          pushAgent(director);
          broadcast({ type: 'task', task });
        }
      }),
    );

    const report = task.assignments
      .map((asg, i) => {
        const a = agents.get(asg.agentId);
        const r = results[i];
        return `### ${a.name} (${a.role})\n${r.status === 'fulfilled' ? r.value : `(no pudo completar: ${r.reason?.message || r.reason})`}`;
      })
      .join('\n\n');

    director.history.push({
      role: 'user',
      content: `Objetivo original del usuario: ${goal}\n\nResultados del equipo:\n\n${report}\n\nConsolida todo en un único entregable final, claro y accionable para el usuario. No repitas todo: integra, prioriza y señala próximos pasos.`,
    });
    const final = await runTurn(director, 'Consolidando el entregable final');
    task.status = 'done';
    task.result = final;
    broadcast({ type: 'task', task });
    log(`✅ Tarea completada: "${goal.slice(0, 80)}"`, 'done', director.id);
  } catch (err) {
    task.status = 'error';
    task.error = friendlyError(err);
    broadcast({ type: 'task', task });
    if (director.status === 'thinking' || director.status === 'coordinating') {
      director.status = 'error';
      director.progress = 0;
      director.controller = null;
      addMessage(director, director.id, `⚠️ No pude completar la tarea: ${task.error}`, { error: true });
      pushAgent(director);
    }
    log(`La tarea falló: ${task.error}`, 'error');
  }
  director.busy = false;
  processQueue(director);
  saveState();
}

// ------------------------------------------------------------------- HTTP
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 200_000) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}
function json(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;

  if (p === '/api/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(': conectado\n\n');
    clients.add(res);
    const ping = setInterval(() => res.write(': ping\n\n'), 20000);
    req.on('close', () => {
      clearInterval(ping);
      clients.delete(res);
    });
    return;
  }

  if (p === '/api/state' && req.method === 'GET') {
    return json(res, 200, {
      company: COMPANY,
      demo: DEMO,
      model: DEMO ? 'demo' : MODEL,
      teams: TEAMS,
      agents: [...agents.values()].map((a) => ({ ...publicAgent(a), messages: a.messages })),
      tasks: tasks.slice(-30),
      activity: activity.slice(-60),
    });
  }

  if (p === '/api/tasks' && req.method === 'POST') {
    try {
      const { text, agentId } = await readBody(req);
      const goal = String(text || '').trim();
      if (!goal) return json(res, 400, { error: 'Escribe una tarea.' });
      const target = agentId && agents.get(agentId);
      if (!target || agentId === 'team') {
        runTeamTask(goal);
        return json(res, 202, { ok: true, mode: 'team' });
      }
      assign(target, goal, 'user').catch(() => {});
      return json(res, 202, { ok: true, mode: 'agent' });
    } catch {
      return json(res, 400, { error: 'Petición inválida' });
    }
  }

  const m = p.match(/^\/api\/agents\/([\w-]+)\/(cancel|reset)$/);
  if (m && req.method === 'POST') {
    const a = agents.get(m[1]);
    if (!a) return json(res, 404, { error: 'Agente no encontrado' });
    if (m[2] === 'cancel') {
      for (const job of a.queue.splice(0)) job.reject(Object.assign(new Error('Cancelado'), { name: 'AbortError' }));
      a.controller?.abort();
    } else {
      if (a.controller) return json(res, 409, { error: 'El agente está trabajando. Cancélalo primero.' });
      a.messages = [];
      a.history = [];
      a.status = 'idle';
      a.progress = 0;
      a.currentTask = '';
      broadcast({ type: 'reset', agentId: a.id });
    }
    pushAgent(a);
    return json(res, 200, { ok: true });
  }

  // archivos estáticos (Three.js se sirve desde node_modules: funciona sin CDN)
  if (req.method === 'GET') {
    const isVendor = p.startsWith('/vendor/three/');
    const baseDir = isVendor ? THREE_DIR : PUBLIC;
    const rel = isVendor ? p.slice('/vendor/three/'.length) : p === '/' ? 'index.html' : p;
    const file = path.normalize(path.join(baseDir, rel));
    if (!file.startsWith(baseDir + path.sep)) return json(res, 403, { error: 'Prohibido' });
    fs.readFile(file, (err, data) => {
      if (err) return json(res, 404, { error: 'No encontrado' });
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    });
    return;
  }
  json(res, 405, { error: 'Método no permitido' });
});

loadState();
server.listen(PORT, () => {
  console.log(`\n🏢  Oficina IA de ${COMPANY.name} lista en http://localhost:${PORT}`);
  console.log(DEMO ? '🧪  Modo DEMO (respuestas simuladas). Define ANTHROPIC_API_KEY para usar Claude de verdad.\n' : `🤖  Usando Claude (${MODEL}).\n`);
});
