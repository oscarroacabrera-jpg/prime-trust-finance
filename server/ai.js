// Capa de IA: llamadas reales a Claude o simulación (modo demo) con la misma interfaz.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { AGENTS, COMPANY } from './agents.js';

export const MODEL = process.env.CLAUDE_MODEL || 'claude-opus-5-5';

function hasCredentials() {
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_PROFILE) return true;
  if (process.env.ANTHROPIC_FEDERATION_RULE_ID) return true;
  // Perfil creado con `ant auth login`
  return fs.existsSync(path.join(os.homedir(), '.config', 'anthropic'));
}

export const DEMO = process.env.DEMO_MODE === '1' || process.env.DEMO_MODE === 'true' || !hasCredentials();
const client = DEMO ? null : new Anthropic();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function systemPromptFor(agent) {
  const team = AGENTS.filter((a) => a.id !== agent.id)
    .map((a) => `- ${a.name} (${a.role})`)
    .join('\n');
  return `${agent.persona}

Trabajas en ${COMPANY.name}. ${COMPANY.description}
Tus compañeros de oficina son:
${team}

Responde siempre en español. Entrega trabajo terminado y útil, no planes vagos: usa Markdown con títulos, listas y tablas cuando ayuden. Sé concreto y conciso (normalmente menos de 450 palabras, salvo que la tarea pida más, por ejemplo código). Si necesitas un dato que no tienes, asume algo razonable y dilo.`;
}

/**
 * Ejecuta un turno de un agente con streaming.
 * @param {object} agent
 * @param {Array} history  mensajes de la API (se modifica: se agrega la respuesta)
 * @param {object} cb { onThinking, onText(delta), onTokens(n), signal }
 * @returns {Promise<{text:string, tokens:number}>}
 */
export async function runAgentTurn(agent, history, cb) {
  if (DEMO) return demoTurn(agent, history, cb);

  const stream = client.beta.messages.stream(
    {
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium' },
      system: systemPromptFor(agent),
      messages: history,
    },
    { signal: cb.signal },
  );

  let text = '';
  for await (const event of stream) {
    if (event.type === 'content_block_start' && event.content_block.type === 'thinking') cb.onThinking?.();
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      text += event.delta.text;
      cb.onText?.(event.delta.text);
    }
    if (event.type === 'message_delta' && event.usage?.output_tokens) cb.onTokens?.(event.usage.output_tokens);
  }
  const final = await stream.finalMessage();
  if (final.stop_reason === 'refusal') {
    throw new Error('El modelo rechazó esta tarea por políticas de seguridad. Reformúlala e inténtalo de nuevo.');
  }
  // Se devuelve el contenido completo (incluye bloques de pensamiento) para mantener el historial válido.
  history.push({ role: 'assistant', content: final.content });
  const tokens = (final.usage?.input_tokens || 0) + (final.usage?.output_tokens || 0);
  return { text, tokens };
}

const PlanSchema = z.object({
  mensaje: z.string().describe('Mensaje breve del director al usuario explicando el plan (1-2 frases).'),
  asignaciones: z
    .array(
      z.object({
        agente_id: z.string().describe(`Uno de: ${AGENTS.filter((a) => !a.isDirector).map((a) => a.id).join(', ')}`),
        tarea: z.string().describe('Instrucción concreta y autosuficiente para ese agente.'),
      }),
    )
    .describe('Entre 1 y 5 asignaciones a los agentes más adecuados.'),
});

/** El director divide un objetivo en tareas para el equipo. */
export async function planTask(director, goal, signal) {
  if (DEMO) return demoPlan(goal);

  const roster = AGENTS.filter((a) => !a.isDirector)
    .map((a) => `- ${a.id}: ${a.name}, ${a.role}. ${a.persona}`)
    .join('\n');
  const response = await client.messages.parse(
    {
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: 'low', format: zodOutputFormat(PlanSchema) },
      system: `${systemPromptFor(director)}

Ahora mismo tu trabajo es planificar: divide el objetivo del usuario en tareas y asígnalas solo a los agentes necesarios (de 1 a 5). Cada tarea debe poder hacerse por separado y en paralelo. Agentes disponibles:
${roster}`,
      messages: [{ role: 'user', content: goal }],
    },
    { signal },
  );
  if (response.stop_reason === 'refusal') throw new Error('El director rechazó planificar esta tarea por políticas de seguridad.');
  const plan = response.parsed_output;
  const valid = new Set(AGENTS.filter((a) => !a.isDirector).map((a) => a.id));
  if (plan) plan.asignaciones = plan.asignaciones.filter((x) => valid.has(x.agente_id)).slice(0, 5);
  if (!plan || !plan.asignaciones.length) throw new Error('El director no pudo crear un plan. Intenta describir mejor la tarea.');
  return plan;
}

// ---------------------------------------------------------------------------
// Modo demo: sin API key. Simula el trabajo para poder ver la oficina en acción.
// ---------------------------------------------------------------------------

const KEYWORDS = {
  lucia: ['tendencia', 'tema', 'idea', 'viral', 'contenido'],
  diego: ['rentable', 'nicho', 'rpm', 'monetiz', 'dinero', 'ingreso'],
  valen: ['público', 'publico', 'audiencia', 'espectador'],
  ana: ['hora', 'horario', 'calendario', 'día', 'cuándo', 'cuando'],
  sofi: ['guion', 'guión', 'video', 'gancho'],
  tomi: ['edición', 'edicion', 'editar', 'grabar', 'video'],
  mateo: ['miniatura', 'título', 'titulo', 'thumbnail'],
  nico: ['short', 'clip', 'tiktok', 'vertical'],
  clara: ['canal', 'crear', 'cero', 'nombre', 'banner', 'comunidad'],
  pablo: ['seo', 'visitas', 'crecimiento', 'métrica', 'metrica', 'plan', '500'],
};

async function demoPlan(goal) {
  await sleep(1200);
  const g = goal.toLowerCase();
  let ids = Object.entries(KEYWORDS)
    .filter(([, words]) => words.some((w) => g.includes(w)))
    .map(([id]) => id);
  if (!ids.length) ids = ['lucia', 'mateo', 'sofi'];
  ids = [...new Set(ids)].slice(0, 4);
  return {
    mensaje: `Entendido. Voy a repartir esto entre ${ids.length} agentes y luego consolido todo.`,
    asignaciones: ids.map((id) => {
      const a = AGENTS.find((x) => x.id === id);
      return { agente_id: id, tarea: `Desde tu rol de ${a.role}, aporta tu parte para: "${goal}"` };
    }),
  };
}

async function demoTurn(agent, history, cb) {
  const last = history[history.length - 1];
  const prompt = typeof last.content === 'string' ? last.content : '';
  cb.onThinking?.();
  await sleep(900 + Math.random() * 1200);
  const text = demoText(agent, prompt);
  const words = text.split(/(\s+)/);
  let tokens = 0;
  for (const w of words) {
    if (cb.signal?.aborted) throw Object.assign(new Error('Cancelado'), { name: 'AbortError' });
    cb.onText?.(w);
    tokens += w.trim() ? 1.3 : 0;
    cb.onTokens?.(Math.round(tokens));
    await sleep(25 + Math.random() * 45);
  }
  history.push({ role: 'assistant', content: text });
  return { text, tokens: Math.round(tokens + prompt.length / 4) };
}

function demoText(agent, prompt) {
  const short = prompt.replace(/\s+/g, ' ').slice(0, 140);
  if (agent.isDirector && prompt.includes('Resultados del equipo')) {
    return `## Entregable consolidado\n\nEl equipo terminó su parte. Resumen de lo más importante:\n\n- **Estrategia:** enfocarnos en un cliente ideal claro y una promesa simple.\n- **Ejecución:** lanzar en 2 semanas con una landing, 3 anuncios y un flujo de seguimiento automático.\n- **Medición:** revisar CAC, conversión y retención cada semana.\n\n### Próximos pasos\n1. Aprobar el mensaje principal.\n2. Publicar la landing y los anuncios.\n3. Reunión de resultados en 7 días.\n\n> _Modo demo: configura tu ANTHROPIC_API_KEY para que los agentes trabajen de verdad con Claude._`;
  }
  return `## ${agent.role}: listo\n\nTrabajé en: _"${short}"_\n\n### Lo que propongo\n- Punto clave 1 desde la perspectiva de **${agent.role.toLowerCase()}**.\n- Punto clave 2 con una acción concreta para esta semana.\n- Punto clave 3 con cómo medir si funcionó.\n\n| Acción | Responsable | Plazo |\n|---|---|---|\n| Primer borrador | ${agent.name} | Hoy |\n| Revisión | Bruno | Mañana |\n\n> _Modo demo: esta respuesta es simulada. Agrega tu ANTHROPIC_API_KEY para respuestas reales._`;
}
