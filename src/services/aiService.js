const Anthropic = require('@anthropic-ai/sdk');
const { searchProperties } = require('./tokkoService');
const { SYSTEM_PROMPT, formatToolResult } = require('../config/prompts');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';

// Máximo de mensajes del historial a enviar a la API (para no superar el context window)
const MAX_HISTORY = 30;

// ─── Definición de la herramienta de búsqueda ────────────────────────────────

const SEARCH_TOOL = {
  name: 'buscar_propiedades',
  description: [
    "Busca propiedades disponibles en el catálogo de Miguel D'Odorico Propiedades.",
    "Usá esta herramienta cuando el cliente exprese intención de comprar, alquilar o ver propiedades.",
    "Podés buscar con pocos filtros — no es necesario tener todos los datos.",
  ].join(' '),
  input_schema: {
    type: 'object',
    properties: {
      operation_type: {
        type: 'integer',
        description: 'Tipo de operación: 1=Venta, 2=Alquiler, 3=Alquiler temporario',
        enum: [1, 2, 3],
      },
      property_type: {
        type: 'integer',
        description: 'Tipo de propiedad: 2=Departamento, 3=Casa, 5=Oficina, 7=Local, 13=PH, 1=Terreno, 24=Galpón',
      },
      rooms: {
        type: 'integer',
        description: 'Cantidad mínima de ambientes que necesita el cliente',
      },
      price_from: {
        type: 'number',
        description: 'Precio mínimo (en la moneda indicada)',
      },
      price_to: {
        type: 'number',
        description: 'Precio máximo (en la moneda indicada)',
      },
      currency: {
        type: 'string',
        enum: ['USD', 'ARS'],
        description: 'Moneda del precio. USD para dólares americanos, ARS para pesos argentinos.',
      },
      location: {
        type: 'string',
        description: 'Nombre del barrio o zona (ej: "Palermo", "Flores", "San Isidro", "Belgrano")',
      },
      offset: {
        type: 'integer',
        description: 'Para paginar resultados. Primera búsqueda: omitir o usar 0. Para ver más: usar 3, luego 6, 9, etc.',
      },
    },
  },
};

// ─── Ejecución del tool ───────────────────────────────────────────────────────

/**
 * Ejecuta la herramienta buscar_propiedades con los parámetros que eligió Claude.
 * Devuelve el texto formateado para enviárselo de vuelta como tool_result.
 */
async function executeTool(toolName, toolInput) {
  if (toolName !== 'buscar_propiedades') {
    return `Herramienta desconocida: ${toolName}`;
  }

  console.log('[AI] Claude invocó buscar_propiedades con:', JSON.stringify(toolInput));

  const { propiedades, total } = await searchProperties(toolInput);
  const resultado = formatToolResult(propiedades, total, toolInput);

  console.log(`[AI] Tool result: ${total} total, ${propiedades.length} en esta página`);
  return { texto: resultado, propiedades };
}

// ─── Sanitización del historial ───────────────────────────────────────────────

/**
 * Elimina pares tool_use/tool_result incompletos del historial almacenado.
 * Previene el error 400 "tool_use ids were found without tool_result blocks
 * immediately after" cuando el historial guardado tiene una secuencia rota.
 *
 * Un par es válido sólo si:
 *   - el mensaje del asistente tiene N bloques tool_use
 *   - el mensaje de usuario siguiente tiene exactamente los N tool_result
 *     con los IDs correspondientes
 */
function sanitizeHistorial(historial) {
  if (!historial || historial.length === 0) return [];

  const result = [];
  let i = 0;

  while (i < historial.length) {
    const msg = historial[i];
    const content = Array.isArray(msg.content) ? msg.content : [];
    const toolUseIds = msg.role === 'assistant'
      ? content.filter(b => b.type === 'tool_use').map(b => b.id)
      : [];

    if (toolUseIds.length > 0) {
      // Verificar que el siguiente mensaje tiene TODOS los tool_result correspondientes
      const next = historial[i + 1];
      const nextContent = (next && Array.isArray(next.content)) ? next.content : [];
      const nextResultIds = nextContent
        .filter(b => b.type === 'tool_result')
        .map(b => b.tool_use_id);

      const allPaired = toolUseIds.every(id => nextResultIds.includes(id));

      if (allPaired && next) {
        result.push(msg, next);
        i += 2;
      } else {
        // Par incompleto — descartar ambos para no enviar un tool_use sin tool_result
        console.warn(`[AI] Historial sanitizado: par tool_use sin tool_result descartado (ids: ${toolUseIds.join(', ')})`);
        i += (next && next.role === 'user') ? 2 : 1;
      }
    } else {
      result.push(msg);
      i++;
    }
  }

  // Normalizar extremos: debe empezar con 'user' y terminar con 'assistant'
  while (result.length > 0 && result[0].role !== 'user') result.shift();
  while (result.length > 0 && result[result.length - 1].role !== 'assistant') result.pop();

  return result;
}

// ─── Función principal ────────────────────────────────────────────────────────

/**
 * Procesa un mensaje del usuario con Claude (tool use).
 *
 * Flujo:
 * 1. Sanitizar el historial para eliminar pares tool_use/tool_result incompletos
 * 2. Armar el array de mensajes con el historial + mensaje actual
 * 3. Llamar a Claude
 * 4. Si Claude invoca herramientas → ejecutar TODAS → devolver TODOS los resultados → continuar
 * 5. Retornar texto final + propiedades encontradas + historial actualizado
 *
 * @param {string}   userMessage - Texto del usuario
 * @param {Array}    historial   - Historial en formato Anthropic [{role, content}]
 * @returns {Promise<{text: string, propiedades: object[], updatedHistorial: Array}>}
 */
async function processMessage(userMessage, historial = []) {
  const messages = [
    ...sanitizeHistorial(historial).slice(-MAX_HISTORY),
    { role: 'user', content: userMessage },
  ];

  let propiedadesEncontradas = [];

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const response = await client.messages.create({
      model:      CLAUDE_MODEL,
      max_tokens: 1024,
      system:     SYSTEM_PROMPT,
      tools:      [SEARCH_TOOL],
      messages,
    });

    console.log(`[AI] Claude stop_reason: ${response.stop_reason} | tokens: ${response.usage?.input_tokens}in/${response.usage?.output_tokens}out`);

    if (response.stop_reason === 'tool_use') {
      // Claude puede invocar VARIAS herramientas en paralelo en un mismo turno.
      // Hay que ejecutarlas TODAS y devolver un tool_result por cada una,
      // en el mismo mensaje de usuario, antes de que el asistente pueda continuar.
      const toolBlocks = response.content.filter(b => b.type === 'tool_use');

      const toolResults = [];
      for (const toolBlock of toolBlocks) {
        const { texto: toolResultText, propiedades } = await executeTool(toolBlock.name, toolBlock.input);
        if (propiedades.length > 0) propiedadesEncontradas = propiedades;
        toolResults.push({
          type:        'tool_result',
          tool_use_id: toolBlock.id,   // mismo id que el tool_use correspondiente
          content:     toolResultText,
        });
      }

      // 1. Turno del asistente (contiene todos los tool_use blocks)
      messages.push({ role: 'assistant', content: response.content });
      // 2. Turno del usuario (contiene TODOS los tool_result, en el mismo mensaje)
      messages.push({ role: 'user', content: toolResults });

      // 3. Volver al inicio del bucle para que Claude genere la respuesta final
      continue;
    }

    // stop_reason === 'end_turn' — respuesta final en lenguaje natural
    const textoRespuesta = response.content.find(b => b.type === 'text')?.text || '';

    messages.push({ role: 'assistant', content: response.content });
    const updatedHistorial = messages.slice(-MAX_HISTORY);

    return {
      text:              textoRespuesta,
      propiedades:       propiedadesEncontradas,
      updatedHistorial,
    };
  }
}

module.exports = { processMessage };
