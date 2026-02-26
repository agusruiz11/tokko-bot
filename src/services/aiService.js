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
    'Busca propiedades disponibles en el catálogo de Miguel Dodórico Propiedades.',
    'Usá esta herramienta cuando el cliente exprese intención de comprar, alquilar o ver propiedades.',
    'Podés buscar con pocos filtros — no es necesario tener todos los datos.',
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

// ─── Función principal ────────────────────────────────────────────────────────

/**
 * Procesa un mensaje del usuario con Claude (tool use).
 *
 * Flujo:
 * 1. Armar el array de mensajes con el historial + mensaje actual
 * 2. Llamar a Claude
 * 3. Si Claude llama a buscar_propiedades → ejecutar → devolver resultado → continuar
 * 4. Retornar texto final + propiedades encontradas + historial actualizado
 *
 * @param {string}   userMessage - Texto del usuario
 * @param {Array}    historial   - Historial en formato Anthropic [{role, content}]
 * @returns {Promise<{text: string, propiedades: object[], updatedHistorial: Array}>}
 */
async function processMessage(userMessage, historial = []) {
  const messages = [
    ...historial.slice(-MAX_HISTORY),
    { role: 'user', content: userMessage },
  ];

  let propiedadesEncontradas = [];

  // Bucle para manejar múltiples tool calls (aunque con esta herramienta raramente pasa más de 1)
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
      const toolBlock = response.content.find(b => b.type === 'tool_use');

      // Ejecutar la herramienta
      const { texto: toolResultText, propiedades } = await executeTool(toolBlock.name, toolBlock.input);
      propiedadesEncontradas = propiedades;

      // Agregar el turno del asistente (que incluye el tool_use block) y el resultado
      messages.push({ role: 'assistant', content: response.content });
      messages.push({
        role: 'user',
        content: [{
          type:        'tool_result',
          tool_use_id: toolBlock.id,
          content:     toolResultText,
        }],
      });

      // Continuar el bucle para que Claude genere la respuesta en lenguaje natural
      continue;
    }

    // stop_reason === 'end_turn' — respuesta final
    const textoRespuesta = response.content.find(b => b.type === 'text')?.text || '';

    // Agregar respuesta final al historial y recortar para no crecer indefinidamente
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
