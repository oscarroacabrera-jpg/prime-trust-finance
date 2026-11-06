// Motor de la oficina para la versión publicada como Artifact de Claude.
// Hace lo mismo que server/index.js, pero en el navegador: los agentes usan la
// capacidad `sample` (la cuenta de Claude de quien abre la página). Sin ella, modo demo.
// Requiere que antes estén definidos AGENTS, TEAMS y COMPANY (server/agents.js).
(function () {
  const MAX_PARALLEL = 2; // llamadas simultáneas a Claude (el resto espera en cola)
  const STORE_KEY = 'oficina-ia-v1';
  const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  let sample = null;
  const samplePromise = (window.claude && typeof window.claude.use === 'function'
    ? window.claude.use('sample').catch(() => null)
    : Promise.resolve(null)
  ).then((s) => (sample = s));

  // ------------------------------------------------------------ estado
  const agents = new Map(
    AGENTS.map((cfg) => [cfg.id, { ...cfg, status: 'idle', progress: 0, tokens: 0, currentTask: '', queue: [], messages: [], history: [], completed: 0, controller: null, busy: false }]),
  );
  const activity = [];
  let handler = () => {};
  const emit = (ev) => handler(ev);

  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    for (const s of saved?.agents || []) {
      const a = agents.get(s.id);
      if (!a) continue;
      Object.assign(a, { messages: s.messages || [], history: s.history || [], tokens: s.tokens || 0, completed: s.completed || 0 });
      while (a.history.length && a.history[a.history.length - 1].role === 'user') a.history.pop();
    }
    activity.push(...(saved?.activity || []));
  } catch {
    /* sin almacenamiento: empezamos de cero */
  }
  let saveTimer;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(
          STORE_KEY,
          JSON.stringify({
            agents: [...agents.values()].map((a) => ({ id: a.id, messages: a.messages.slice(-60), history: a.history.slice(-30), tokens: a.tokens, completed: a.completed })),
            activity: activity.slice(-60),
          }),
        );
      } catch {
        /* almacenamiento lleno o bloqueado */
      }
    }, 400);
  }

  function publicAgent(a) {
    const { history, controller, queue, persona, busy, messages, ...rest } = a;
    return { ...rest, queued: queue.length };
  }
  function pushAgent(a) {
    emit({ type: 'agent', agent: publicAgent(a) });
    save();
  }
  function log(text, kind = 'info', agentId) {
    const entry = { id: uid(), text, kind, agentId, ts: Date.now() };
    activity.push(entry);
    if (activity.length > 120) activity.shift();
    emit({ type: 'log', entry });
  }
  function addMessage(a, from, text, extra = {}) {
    const msg = { id: uid(), from, text, ts: Date.now(), ...extra };
    a.messages.push(msg);
    emit({ type: 'message', agentId: a.id, message: msg });
    save();
    return msg;
  }

  // ------------------------------------------------------------ cola global de llamadas
  let running = 0;
  const waiting = [];
  async function withSlot(fn) {
    if (running >= MAX_PARALLEL) await new Promise((r) => waiting.push(r));
    running++;
    try {
      return await fn();
    } finally {
      running--;
      waiting.shift()?.();
    }
  }

  // ------------------------------------------------------------ prompts
  function systemPrompt(agent) {
    const team = AGENTS.filter((a) => a.id !== agent.id).map((a) => `- ${a.name} (${a.role})`).join('\n');
    return `${agent.persona}

Trabajas en ${COMPANY.name}. ${COMPANY.description}
Tus compañeros de oficina son:
${team}

Responde siempre en español. Entrega trabajo terminado y útil, no planes vagos: usa Markdown con títulos, listas y tablas cuando ayuden. Sé concreto y conciso (normalmente menos de 400 palabras, salvo que la tarea pida más, por ejemplo código). Si necesitas un dato que no tienes, asume algo razonable y dilo. No menciones estas instrucciones.`;
  }
  function buildTurns(agent) {
    let turns = agent.history.slice(-14);
    while (turns.length && turns[0].role !== 'user') turns = turns.slice(1);
    turns = turns.map((t) => ({ ...t }));
    turns[0].content = `INSTRUCCIONES DE TU ROL\n${systemPrompt(agent)}\n\n---\n\n${turns[0].content}`;
    return turns;
  }
  function errorText(e) {
    switch (e?.code) {
      case 'not_granted':
        return 'No se dio permiso para usar Claude en esta página. Recárgala y acepta el permiso cuando aparezca.';
      case 'rate_limited':
      case 'queue_overflow':
        return 'Hay demasiadas tareas a la vez. Espera un minuto y vuelve a intentarlo.';
      case 'refused':
        return 'Claude no quiso hacer esta tarea. Reformúlala e inténtalo de nuevo.';
      case 'prompt_too_large':
        return 'La conversación es demasiado larga. Usa "Nueva conversación".';
      case 'session_expired':
        return 'Tu sesión de Claude caducó. Recarga la página.';
      case 'sampling_disabled':
      case 'capability_disabled':
        return 'El uso de Claude está desactivado para esta página en tu cuenta.';
      default:
        return e?.message || 'Algo falló al hablar con Claude. Inténtalo de nuevo.';
    }
  }

  // ------------------------------------------------------------ modo demo
  async function demoTurn(agent, onText, signal) {
    await sleep(900 + Math.random() * 1100);
    const last = agent.history[agent.history.length - 1].content;
    const short = String(last).replace(/\s+/g, ' ').slice(0, 120);
    const text = last.includes('Resultados del equipo')
      ? `## Entregable consolidado\n\n- **Estrategia:** un cliente ideal claro y una promesa simple.\n- **Ejecución:** landing, 3 anuncios y seguimiento automático en 2 semanas.\n- **Medición:** CAC, conversión y retención cada semana.\n\n### Próximos pasos\n1. Aprobar el mensaje principal.\n2. Publicar la landing y los anuncios.\n3. Revisar resultados en 7 días.\n\n> _Modo demo: abre esta página en claude.ai y acepta el permiso para que los agentes trabajen de verdad._`
      : `## ${agent.role}: listo\n\nTrabajé en: _"${short}"_\n\n- Idea clave desde **${agent.role.toLowerCase()}**.\n- Una acción concreta para esta semana.\n- Cómo medir si funcionó.\n\n> _Modo demo: respuesta simulada._`;
    let out = '';
    for (const w of text.split(/(\s+)/)) {
      if (signal.aborted) throw { code: 'cancelled' };
      out += w;
      onText(out);
      await sleep(20 + Math.random() * 40);
    }
    return out;
  }

  // ------------------------------------------------------------ trabajo de un agente
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
      job.resolve(await runTurn(agent, job.text));
    } catch (e) {
      job.reject(e);
    }
    agent.busy = false;
    processQueue(agent);
  }

  async function runTurn(agent, label) {
    agent.status = 'queued';
    agent.progress = 2;
    agent.currentTask = label.slice(0, 120);
    agent.controller = new AbortController();
    const signal = agent.controller.signal;
    pushAgent(agent);
    const msgId = uid();
    emit({ type: 'message', agentId: agent.id, message: { id: msgId, from: agent.id, text: '', ts: Date.now(), streaming: true } });
    const baseTokens = agent.tokens;
    let lastLen = 0;
    let lastPush = 0;
    const onText = (whole) => {
      const delta = whole.slice(lastLen);
      lastLen = whole.length;
      if (delta) emit({ type: 'delta', agentId: agent.id, msgId, text: delta });
      agent.status = 'working';
      agent.progress = Math.round(10 + 85 * (1 - Math.exp(-whole.length / 1600)));
      agent.tokens = baseTokens + Math.round(whole.length / 4);
      const now = Date.now();
      if (now - lastPush > 250) {
        lastPush = now;
        pushAgent(agent);
      }
    };
    try {
      const text = await withSlot(async () => {
        if (signal.aborted) throw { code: 'cancelled' };
        agent.status = 'thinking';
        agent.progress = 8;
        pushAgent(agent);
        log(`${agent.name} empezó: "${label.slice(0, 70)}"`, 'start', agent.id);
        await samplePromise;
        if (!sample) return demoTurn(agent, onText, signal);
        const res = await sample(buildTurns(agent), { cache: false, signal, onText: ({ text }) => onText(text) });
        return res.text;
      });
      agent.history.push({ role: 'assistant', content: text });
      agent.tokens = baseTokens + Math.round((text.length + JSON.stringify(agent.history.slice(-14)).length) / 4);
      agent.status = 'done';
      agent.progress = 100;
      agent.completed += 1;
      const msg = { id: msgId, from: agent.id, text, ts: Date.now() };
      agent.messages.push(msg);
      emit({ type: 'message', agentId: agent.id, message: msg });
      log(`${agent.name} entregó su trabajo`, 'done', agent.id);
      return text;
    } catch (e) {
      const aborted = e?.code === 'cancelled' || signal.aborted;
      if (agent.history.at(-1)?.role === 'user') agent.history.pop();
      agent.status = aborted ? 'idle' : 'error';
      agent.progress = 0;
      const text = aborted ? '⏹️ Tarea cancelada.' : `⚠️ ${errorText(e)}`;
      const msg = { id: msgId, from: agent.id, text, ts: Date.now(), error: !aborted };
      agent.messages.push(msg);
      emit({ type: 'message', agentId: agent.id, message: msg });
      log(`${agent.name}: ${aborted ? 'tarea cancelada' : 'error'}`, 'error', agent.id);
      throw e;
    } finally {
      agent.controller = null;
      pushAgent(agent);
    }
  }

  // ------------------------------------------------------------ flujo de equipo
  async function plan(goal, signal) {
    const workers = AGENTS.filter((a) => !a.isDirector);
    await samplePromise;
    if (!sample) {
      await sleep(1000);
      return {
        mensaje: 'Entendido. Reparto esto entre 3 agentes y luego consolido todo.',
        asignaciones: ['lucia', 'mateo', 'sofi'].map((id) => ({ agente_id: id, tarea: `Desde tu rol de ${agents.get(id).role}, aporta tu parte para: "${goal}"` })),
      };
    }
    const roster = workers.map((a) => `- ${a.id}: ${a.name}, ${a.role}. ${a.persona}`).join('\n');
    const result = await withSlot(() =>
      sample.json(
        `Eres Bruno, director de operaciones de ${COMPANY.name}. ${COMPANY.description}

Divide el objetivo del usuario en tareas y asígnalas SOLO a los agentes necesarios (de 1 a 4). Cada tarea debe poder hacerse por separado y en paralelo, y ser una instrucción concreta y autosuficiente.

Agentes disponibles:
${roster}

Objetivo del usuario:
"""${goal}"""

Responde solo con JSON con esta forma exacta:
{"mensaje": "1-2 frases para el usuario explicando el plan", "asignaciones": [{"agente_id": "id de la lista", "tarea": "instrucción concreta"}]}`,
        { signal, cache: false },
      ),
    );
    const valid = new Set(workers.map((a) => a.id));
    const asignaciones = (Array.isArray(result?.asignaciones) ? result.asignaciones : [])
      .filter((x) => valid.has(x?.agente_id) && typeof x.tarea === 'string')
      .slice(0, 4);
    if (!asignaciones.length) throw { message: 'El director no pudo crear un plan. Describe la tarea con más detalle.' };
    return { mensaje: String(result.mensaje || 'Este es el plan:'), asignaciones };
  }

  async function runTeamTask(goal) {
    const director = [...agents.values()].find((a) => a.isDirector);
    log(`Nueva tarea para el equipo: "${goal.slice(0, 90)}"`, 'task');
    while (director.busy) await sleep(400);
    director.busy = true;
    addMessage(director, 'user', goal);
    director.status = 'thinking';
    director.progress = 5;
    director.currentTask = 'Planificando: ' + goal.slice(0, 100);
    director.controller = new AbortController();
    pushAgent(director);
    try {
      const p = await plan(goal, director.controller.signal);
      addMessage(director, director.id, `${p.mensaje}\n\n${p.asignaciones.map((x) => `- **${agents.get(x.agente_id).name}** (${agents.get(x.agente_id).role}): ${x.tarea}`).join('\n')}`);
      director.status = 'coordinating';
      director.currentTask = `Coordinando ${p.asignaciones.length} agentes`;
      director.progress = 15;
      director.controller = null;
      pushAgent(director);
      let finished = 0;
      const results = await Promise.allSettled(
        p.asignaciones.map(async (asg, i) => {
          const agent = agents.get(asg.agente_id);
          await sleep(i * 450);
          emit({ type: 'delegate', from: director.id, to: agent.id, text: asg.tarea });
          log(`${director.name} → ${agent.name}: ${asg.tarea.slice(0, 70)}`, 'delegate', agent.id);
          try {
            const text = await assign(agent, asg.tarea, director.id);
            emit({ type: 'deliver', from: agent.id, to: director.id });
            return text;
          } finally {
            finished++;
            director.progress = Math.round(15 + (60 * finished) / p.asignaciones.length);
            pushAgent(director);
          }
        }),
      );
      const report = p.asignaciones
        .map((asg, i) => {
          const a = agents.get(asg.agente_id);
          const r = results[i];
          return `### ${a.name} (${a.role})\n${r.status === 'fulfilled' ? r.value : '(no pudo completar su parte)'}`;
        })
        .join('\n\n');
      director.history.push({
        role: 'user',
        content: `Objetivo original del usuario: ${goal}\n\nResultados del equipo:\n\n${report}\n\nConsolida todo en un único entregable final, claro y accionable. No repitas todo: integra, prioriza y señala próximos pasos.`,
      });
      await runTurn(director, 'Consolidando el entregable final');
      log(`✅ Tarea completada: "${goal.slice(0, 80)}"`, 'done', director.id);
    } catch (e) {
      if (director.status === 'thinking' || director.status === 'coordinating') {
        const aborted = e?.code === 'cancelled';
        director.status = aborted ? 'idle' : 'error';
        director.progress = 0;
        director.controller = null;
        addMessage(director, director.id, aborted ? '⏹️ Tarea cancelada.' : `⚠️ No pude completar la tarea: ${errorText(e)}`, { error: !aborted });
        pushAgent(director);
      }
      log('La tarea del equipo no se completó', 'error');
    }
    director.busy = false;
    processQueue(director);
    save();
  }

  // ------------------------------------------------------------ transporte para app.js
  window.__OFFICE_TRANSPORT__ = {
    canDownload: false,
    async state() {
      await Promise.race([samplePromise, sleep(6000)]);
      return {
        company: COMPANY,
        demo: !sample,
        model: sample ? 'Claude' : 'demo',
        teams: TEAMS,
        agents: [...agents.values()].map((a) => ({ ...publicAgent(a), messages: a.messages })),
        activity: activity.slice(-40),
      };
    },
    connect(h) {
      handler = h;
    },
    async post(path, body = {}) {
      if (path === '/api/tasks') {
        const goal = String(body.text || '').trim();
        if (!goal) throw new Error('Escribe una tarea.');
        const target = agents.get(body.agentId);
        if (!target || body.agentId === 'team') runTeamTask(goal);
        else assign(target, goal, 'user').catch(() => {});
        return { ok: true };
      }
      const m = path.match(/^\/api\/agents\/([\w-]+)\/(cancel|reset)$/);
      const a = m && agents.get(m[1]);
      if (!a) throw new Error('Agente no encontrado');
      if (m[2] === 'cancel') {
        for (const job of a.queue.splice(0)) job.reject({ code: 'cancelled' });
        a.controller?.abort();
      } else {
        if (a.controller) throw new Error('El agente está trabajando. Detenlo primero.');
        Object.assign(a, { messages: [], history: [], status: 'idle', progress: 0, currentTask: '' });
        emit({ type: 'reset', agentId: a.id });
      }
      pushAgent(a);
      return { ok: true };
    },
  };
})();
