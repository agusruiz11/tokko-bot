const { processMessage } = require('../services/aiService');
const whatsappService  = require('../services/whatsappService');
const instagramService = require('../services/instagramService');
const stateManager     = require('./stateManager');

// ─── Punto de entrada principal ───────────────────────────────────────────────

/**
 * Maneja un mensaje de texto entrante de cualquier canal.
 * Orquesta: estado → IA (con tool use) → Tokko → respuesta al usuario.
 *
 * @param {string} userId  - ID único del usuario en el canal
 * @param {string} channel - 'whatsapp' | 'instagram'
 * @param {string} text    - Texto del mensaje del usuario
 */
async function handleMessage(userId, channel, text) {
  const state = stateManager.getState(userId);

  console.log(`[Flow] ${channel}/${userId} | fase: "${state.fase}" | msg: "${text.slice(0, 60)}"`);

  try {
    const { text: respuesta, propiedades, updatedHistorial } = await processMessage(
      text,
      state.historial || []
    );

    // Actualizar estado con historial nuevo y últimas propiedades si las hubo
    stateManager.updateState(userId, {
      historial: updatedHistorial,
      ...(propiedades.length > 0 && { ultimasPropiedades: propiedades }),
    });

    // Enviar fotos de las propiedades encontradas (antes del texto, para mejor UX)
    if (propiedades.length > 0) {
      for (const prop of propiedades) {
        if (prop.fotoPrincipal) {
          // Caption corto: precio + zona (el detalle completo va en el texto de Claude)
          const caption = formatCaption(prop);
          await sendMessage(channel, userId, null, prop.fotoPrincipal, caption);
        }
      }
    }

    // Enviar la respuesta de texto de Claude
    if (respuesta) {
      await sendMessage(channel, userId, respuesta);
    }

  } catch (error) {
    console.error(`[Flow] Error procesando mensaje de ${userId}:`, error.message);
    await sendMessage(
      channel,
      userId,
      'Disculpá, tuve un problema técnico momentáneo. ¿Podés repetir tu consulta?'
    );
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Arma un caption breve para acompañar la foto de una propiedad.
 * El detalle completo lo incluye Claude en su texto.
 */
function formatCaption(prop) {
  const partes = [];
  if (prop.titulo) partes.push(prop.titulo);
  if (prop.precio && prop.moneda) {
    partes.push(`${prop.moneda} ${prop.precio.toLocaleString('es-AR')}`);
  }
  if (prop.urlFicha) partes.push(`Ver ficha: ${prop.urlFicha}`);
  return partes.join('\n');
}

/**
 * Envía un mensaje de texto o imagen según el canal.
 *
 * @param {string}      channel   - 'whatsapp' | 'instagram'
 * @param {string}      userId    - Destinatario
 * @param {string|null} text      - Texto a enviar (null si es solo imagen)
 * @param {string|null} imageUrl  - URL de imagen (opcional)
 * @param {string}      caption   - Caption de la imagen (opcional)
 */
async function sendMessage(channel, userId, text, imageUrl = null, caption = '') {
  try {
    if (channel === 'whatsapp') {
      if (imageUrl) {
        await whatsappService.sendImageMessage(userId, imageUrl, caption);
      } else if (text) {
        await whatsappService.sendTextMessage(userId, text);
      }
    } else if (channel === 'instagram') {
      // Instagram no soporta envío de imágenes por URL en la API básica,
      // así que por ahora solo enviamos texto
      if (text) {
        await instagramService.sendTextMessage(userId, text);
      }
    }
  } catch (error) {
    // Log pero no interrumpir el flujo completo por un mensaje fallido
    console.error(`[Flow] Error enviando mensaje a ${userId} (${channel}):`, error.message);
  }
}

module.exports = { handleMessage };
