// Interfaz: conecta la escena 3D con el servidor (estado + eventos en tiempo real).
import { createOffice } from './office.js';

const $ = (id) => document.getElementById(id);
const state = { agents: new Map(), selected: null, streams: new Map() };
let office;

const STATUS_TEXT = {
  idle: 'Disponible',
  queued: 'En cola',
  thinking: 'Pensando…',
  working: 'Trabajando…',
  coordinating: 'Coordinando al equipo…',
  done: 'Entregó',
  error: 'Error',
};

// ------------------------------------------------------------------ markdown
function esc(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
function inline(s) {
  return s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/(^|\W)_([^_\n]+)_(?=\W|$)/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}
function markdown(src) {
  const lines = esc(src || '').split('\n');
  let html = '';
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('```')) {
      const buf = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) buf.push(lines[i++]);
      i++;
      html += `<pre><code>${buf.join('\n')}</code></pre>`;
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.*)/);
    if (h) {
      const n = Math.min(3, h[1].length);
      html += `<h${n}>${inline(h[2])}</h${n}>`;
      i++;
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      const row = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => inline(c.trim()));
      html += '<table><thead><tr>' + row(line).map((c) => `<th>${c}</th>`).join('') + '</tr></thead><tbody>';
      i += 2;
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        html += '<tr>' + row(lines[i]).map((c) => `<td>${c}</td>`).join('') + '</tr>';
        i++;
      }
      html += '</tbody></table>';
      continue;
    }
    if (/^\s*[-*]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const tag = ordered ? 'ol' : 'ul';
      html += `<${tag}>`;
      while (i < lines.length && (ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*]\s+/).test(lines[i])) {
        html += `<li>${inline(lines[i].replace(/^\s*([-*]|\d+[.)])\s+/, ''))}</li>`;
        i++;
      }
      html += `</${tag}>`;
      continue;
    }
    if (line.startsWith('&gt;')) {
      const buf = [];
      while (i < lines.length && lines[i].startsWith('&gt;')) buf.push(lines[i++].replace(/^&gt;\s?/, ''));
      html += `<blockquote>${inline(buf.join('<br>'))}</blockquote>`;
      continue;
    }
    if (/^\s*(---|\*\*\*)\s*$/.test(line)) {
      html += '<hr>';
      i++;
      continue;
    }
    if (line.trim()) {
      const buf = [];
      while (i < lines.length && lines[i].trim() && !/^(#|```|\s*[-*]\s|\s*\d+[.)]\s|&gt;|\s*\|)/.test(lines[i])) buf.push(lines[i++]);
      if (!buf.length) buf.push(lines[i++]);
      html += `<p>${inline(buf.join('<br>'))}</p>`;
      continue;
    }
    i++;
  }
  return html;
}

// ------------------------------------------------------------------ utilidades
function fmtTokens(n) {
  if (!n) return '0';
  if (n < 1000) return String(n);
  if (n < 1e6) return (n / 1000).toFixed(n < 10000 ? 1 : 0) + 'k';
  return (n / 1e6).toFixed(1) + 'M';
}
function hhmm(ts) {
  return new Date(ts).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
}
let toastTimer;
function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}
// Transporte: por defecto habla con el servidor Node. La versión publicada como
// Artifact define window.__OFFICE_TRANSPORT__ con un motor que corre en el navegador.
const httpTransport = {
  async post(path, body) {
    const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Error del servidor');
    return data;
  },
  async state() {
    return (await fetch('/api/state')).json();
  },
  connect(handler) {
    const es = new EventSource('/api/events');
    es.onmessage = (e) => handler(JSON.parse(e.data));
    es.onerror = () => {
      es.close();
      setTimeout(async () => {
        await loadState().catch(() => {});
        httpTransport.connect(handler);
      }, 2000);
    };
  },
  canDownload: true,
};
const transport = window.__OFFICE_TRANSPORT__ || httpTransport;
const api = (path, body) => transport.post(path, body);

// ------------------------------------------------------------------ estadísticas
function updateStats() {
  const list = [...state.agents.values()];
  $('statWorking').textContent = list.filter((a) => ['thinking', 'working', 'coordinating'].includes(a.status)).length;
  $('statDone').textContent = list.reduce((s, a) => s + (a.completed || 0), 0);
  $('statTokens').textContent = fmtTokens(list.reduce((s, a) => s + (a.tokens || 0), 0));
}

// ------------------------------------------------------------------ actividad
function addFeed(entry) {
  const li = document.createElement('li');
  li.className = entry.kind;
  li.innerHTML = `<time>${hhmm(entry.ts)}</time><span></span>`;
  li.querySelector('span').textContent = entry.text;
  if (entry.agentId) {
    li.style.cursor = 'pointer';
    li.onclick = () => select(entry.agentId);
  }
  const ul = $('feedList');
  ul.prepend(li);
  while (ul.children.length > 80) ul.lastChild.remove();
}

// ------------------------------------------------------------------ panel del agente
function nameOf(id) {
  if (id === 'user') return 'Tú';
  return state.agents.get(id)?.name || id;
}
function msgClass(agent, m) {
  if (m.from === 'user') return 'user';
  if (m.from !== agent.id) return 'delegated';
  return 'from-agent';
}
function renderMessage(agent, m) {
  const div = document.createElement('div');
  div.className = `msg ${msgClass(agent, m)}${m.error ? ' error' : ''}${m.streaming ? ' streaming' : ''}`;
  div.dataset.id = m.id;
  const who = m.from === agent.id ? agent.name : m.from === 'user' ? 'Tú' : `${nameOf(m.from)} te asignó`;
  div.innerHTML = `<div class="who">${esc(who)} · ${hhmm(m.ts)}</div><div class="body"></div>`;
  const body = div.querySelector('.body');
  if (m.streaming && !m.text) body.innerHTML = '<span class="typing">escribiendo…</span>';
  else body.innerHTML = markdown(m.text);
  if (m.from === agent.id && !m.streaming && m.text && !m.error) {
    const tools = document.createElement('div');
    tools.className = 'tools';
    tools.innerHTML = '<button class="ghost" data-act="copy">Copiar</button>' + (transport.canDownload ? '<button class="ghost" data-act="dl">Descargar .md</button>' : '');
    tools.querySelector('[data-act=copy]').onclick = () => {
      try {
        navigator.clipboard.writeText(m.text).then(() => toast('Copiado ✓'), () => selectText(div.querySelector('.body')));
      } catch {
        selectText(div.querySelector('.body'));
      }
    };
    if (transport.canDownload) tools.querySelector('[data-act=dl]').onclick = () => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([m.text], { type: 'text/markdown' }));
      a.download = `${agent.name}-${new Date(m.ts).toISOString().slice(0, 16).replace(/[:T]/g, '-')}.md`;
      a.click();
    };
    div.appendChild(tools);
  }
  return div;
}
function selectText(node) {
  const r = document.createRange();
  r.selectNodeContents(node);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(r);
  toast('Texto seleccionado: cópialo con el menú del sistema');
}
function renderPanel() {
  const a = state.agents.get(state.selected);
  const panel = $('panel');
  if (!a) {
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
    return;
  }
  panel.classList.add('open');
  panel.setAttribute('aria-hidden', 'false');
  $('pAvatar').textContent = a.name[0];
  $('pAvatar').style.background = a.color;
  $('pName').textContent = a.name;
  $('pRole').textContent = `${a.role}${a.isDirector ? ' · reparte las tareas del equipo' : ''}`;
  renderStatus(a);
  const chat = $('chat');
  chat.innerHTML = '';
  if (!a.messages.length) {
    chat.innerHTML = `<div class="empty">Aún no hay conversación con ${esc(a.name)}.<br>Escríbele abajo o dale una tarea.</div>`;
  }
  for (const m of a.messages) chat.appendChild(renderMessage(a, m));
  const live = state.streams.get(a.id);
  if (live) chat.appendChild(renderMessage(a, live));
  chat.scrollTop = chat.scrollHeight;
  $('pText').placeholder = `Escríbele a ${a.name}…`;
}
function renderStatus(a) {
  $('pDot').className = 'dot ' + a.status;
  $('pStatus').textContent = STATUS_TEXT[a.status] + (a.queued ? ` · ${a.queued} en cola` : '') + (a.currentTask && ['thinking', 'working', 'queued'].includes(a.status) ? ` — ${a.currentTask.slice(0, 60)}${a.currentTask.length > 60 ? '…' : ''}` : '');
  $('pTokens').textContent = fmtTokens(a.tokens) + ' tokens';
  $('pBar').style.width = (a.status === 'idle' ? 0 : a.progress) + '%';
  const busy = ['thinking', 'working', 'coordinating', 'queued'].includes(a.status) || a.queued > 0;
  $('pCancel').disabled = !busy;
  $('pCancel').style.opacity = busy ? 1 : 0.4;
}
function select(id) {
  state.selected = id && state.agents.has(id) ? id : null;
  office.setSelected(state.selected);
  office.focus(state.selected);
  renderPanel();
}

// ------------------------------------------------------------------ eventos del servidor
function onEvent(ev) {
  switch (ev.type) {
    case 'agent': {
      const cur = state.agents.get(ev.agent.id);
      const merged = { ...cur, ...ev.agent, messages: cur?.messages || [] };
      state.agents.set(merged.id, merged);
      office.setAgentState(merged);
      if (state.selected === merged.id) renderStatus(merged);
      updateStats();
      break;
    }
    case 'message': {
      const a = state.agents.get(ev.agentId);
      if (!a) break;
      const m = ev.message;
      if (m.streaming) state.streams.set(a.id, { ...m });
      else {
        state.streams.delete(a.id);
        if (!a.messages.some((x) => x.id === m.id)) a.messages.push(m);
      }
      if (state.selected === a.id) {
        const chat = $('chat');
        chat.querySelector('.empty')?.remove();
        const existing = chat.querySelector(`[data-id="${m.id}"]`);
        const node = renderMessage(a, m);
        if (existing) existing.replaceWith(node);
        else chat.appendChild(node);
        chat.scrollTop = chat.scrollHeight;
      }
      break;
    }
    case 'delta': {
      const live = state.streams.get(ev.agentId);
      if (!live) break;
      live.text += ev.text;
      if (state.selected === ev.agentId) {
        const node = $('chat').querySelector(`[data-id="${ev.msgId}"] .body`);
        if (node) {
          scheduleRender(node, live);
        }
      }
      break;
    }
    case 'delegate':
      office.delegate(ev.from, ev.to);
      break;
    case 'deliver':
      office.deliver(ev.from, ev.to);
      break;
    case 'log':
      addFeed(ev.entry);
      break;
    case 'reset': {
      const a = state.agents.get(ev.agentId);
      if (a) a.messages = [];
      if (state.selected === ev.agentId) renderPanel();
      break;
    }
  }
}
let renderPending = null;
function scheduleRender(node, live) {
  if (renderPending) return;
  renderPending = requestAnimationFrame(() => {
    renderPending = null;
    node.innerHTML = markdown(live.text);
    const chat = $('chat');
    if (chat.scrollHeight - chat.scrollTop - chat.clientHeight < 160) chat.scrollTop = chat.scrollHeight;
  });
}

async function loadState() {
  const data = await transport.state();
  for (const a of data.agents) {
    state.agents.set(a.id, a);
    office?.setAgentState(a);
  }
  return data;
}

// ------------------------------------------------------------------ inicio
async function init() {
  const data = await loadState();
  $('companyName').textContent = data.company.name;
  if (data.company.subtitle) $('companySub').textContent = data.company.subtitle;
  const chips = $('chips');
  for (const q of data.company.quickTasks || []) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = q.label;
    b.title = q.text;
    b.onclick = () => {
      $('cmdText').value = q.text;
      $('cmdTarget').value = 'team';
      $('cmdText').focus();
      toast('Revisa la tarea y toca Asignar');
    };
    chips.appendChild(b);
  }
  chips.hidden = !chips.children.length;
  document.title = `Oficina IA · ${data.company.name}`;
  const badge = $('modeBadge');
  badge.textContent = data.demo ? 'DEMO' : 'EN VIVO';
  badge.className = 'mode ' + (data.demo ? 'demo' : 'live');
  badge.title = data.demo ? 'Respuestas simuladas. Define ANTHROPIC_API_KEY y reinicia para usar Claude.' : `Modelo: ${data.model}`;

  office = createOffice($('scene'), { teams: data.teams, agents: data.agents, onSelect: select, company: data.company });
  for (const a of data.agents) office.setAgentState(a);
  updateStats();
  for (const e of data.activity) addFeed(e);

  const sel = $('cmdTarget');
  sel.innerHTML = `<option value="team">🏢 Todo el equipo (Bruno reparte)</option>` + data.agents.map((a) => `<option value="${a.id}">${esc(a.name)} · ${esc(a.role)}</option>`).join('');

  $('cmdForm').onsubmit = async (e) => {
    e.preventDefault();
    const text = $('cmdText').value.trim();
    if (!text) return;
    const target = sel.value;
    try {
      await api('/api/tasks', { text, agentId: target });
      $('cmdText').value = '';
      toast(target === 'team' ? 'Tarea enviada al equipo. Bruno la está repartiendo…' : `Tarea enviada a ${nameOf(target)}`);
      const director = data.agents.find((a) => a.isDirector);
      select(target === 'team' ? director?.id : target);
    } catch (err) {
      toast(err.message);
    }
  };

  $('pForm').onsubmit = async (e) => {
    e.preventDefault();
    const text = $('pText').value.trim();
    if (!text || !state.selected) return;
    try {
      await api('/api/tasks', { text, agentId: state.selected });
      $('pText').value = '';
    } catch (err) {
      toast(err.message);
    }
  };
  $('pText').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      $('pForm').requestSubmit();
    }
  });
  $('pClose').onclick = () => select(null);
  $('pCancel').onclick = () => state.selected && api(`/api/agents/${state.selected}/cancel`).catch((err) => toast(err.message));
  $('pReset').onclick = () =>
    state.selected &&
    api(`/api/agents/${state.selected}/reset`)
      .then(() => toast('Conversación reiniciada'))
      .catch((err) => toast(err.message));
  $('feedToggle').onclick = () => {
    const f = $('feed');
    f.classList.toggle('collapsed');
    $('feedToggle').textContent = f.classList.contains('collapsed') ? '+' : '–';
  };
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') select(null);
  });
  setTimeout(() => ($('hint').style.opacity = 0), 9000);

  transport.connect(onEvent);
}

init().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML('beforeend', `<div class="toast show">No se pudo cargar la oficina: ${esc(err.message)}</div>`);
});
