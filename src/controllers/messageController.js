const crypto = require('crypto');
const whatsappService = require('../services/whatsappService');
const instagramService = require('../services/instagramService');
const { handleMessage } = require('../conversation/flowHandler');

// Set para deduplicar mensajes — Meta puede entregar el mismo evento dos veces
const processedMessageIds = new Set();

/**
 * Verifica la firma HMAC-SHA256 que Meta incluye en cada webhook POST.
 * Usa timingSafeEqual para prevenir ataques de timing.
 *
 * @param {Buffer}      rawBody   - Body crudo (req.rawBody capturado en express.json verify)
 * @param {string}      secret    - App Secret de Meta
 * @param {string|undefined} header - Valor del header X-Hub-Signature-256
 * @returns {boolean}
 */
function verifyMetaSignature(rawBody, secret, header) {
  if (!rawBody || !secret) return false;
  if (!header || !header.startsWith('sha256=')) return false;

  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  // Ambos buffers deben tener la misma longitud para timingSafeEqual
  if (header.length !== expected.length) return false;

  return crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}

// ─────────────────────────────────────────────
// WHATSAPP
// ─────────────────────────────────────────────

/**
 * GET /webhook/whatsapp
 * Meta llama a este endpoint al registrar el webhook.
 * Verifica el token y responde con el challenge.
 */
function verifyWhatsAppWebhook(req, res) {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log('[WhatsApp] Webhook verificado correctamente');
    return res.status(200).send(challenge);
  }

  console.warn('[WhatsApp] Fallo de verificación — token incorrecto o mode inválido');
  return res.sendStatus(403);
}

/**
 * POST /webhook/whatsapp
 * Recibe eventos de mensajes. Meta requiere respuesta 200 inmediata;
 * el procesamiento real se hace de forma asíncrona.
 */
async function handleWhatsAppWebhook(req, res) {
  // Verificar firma antes de procesar — rechaza requests falsas
  const appSecret = process.env.META_APP_SECRET;
  if (appSecret && !verifyMetaSignature(req.rawBody, appSecret, req.headers['x-hub-signature-256'])) {
    console.warn('[WhatsApp] Firma de webhook inválida — request rechazada');
    return res.sendStatus(403);
  }

  // Responder 200 de inmediato para evitar que Meta reintente
  res.sendStatus(200);

  const body = req.body;

  if (body.object !== 'whatsapp_business_account') return;

  try {
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== 'messages') continue;

        const value    = change.value;
        const messages = value.messages || [];

        for (const message of messages) {
          // Deduplicar
          if (processedMessageIds.has(message.id)) {
            console.log(`[WhatsApp] Mensaje duplicado ignorado: ${message.id}`);
            continue;
          }
          processedMessageIds.add(message.id);

          // Evitar memory leak: descartar IDs viejos si el Set crece mucho
          if (processedMessageIds.size > 1000) {
            const oldest = processedMessageIds.values().next().value;
            processedMessageIds.delete(oldest);
          }

          await processWhatsAppMessage(message, value);
        }
      }
    }
  } catch (error) {
    console.error('[WhatsApp] Error procesando webhook:', error.message);
  }
}

/**
 * Procesa un mensaje individual de WhatsApp.
 */
async function processWhatsAppMessage(message, value) {
  const senderId = message.from;
  const type     = message.type;

  console.log(`[WhatsApp] Mensaje de ${senderId} (tipo: ${type})`);

  if (type !== 'text') {
    await whatsappService.sendTextMessage(
      senderId,
      'Por el momento solo proceso mensajes de texto. ¡Escribime tu consulta!'
    );
    return;
  }

  const text = message.text?.body || '';
  console.log(`[WhatsApp] Texto: "${text}"`);

  await handleMessage(senderId, 'whatsapp', text);
}

// ─────────────────────────────────────────────
// INSTAGRAM
// ─────────────────────────────────────────────

/**
 * GET /webhook/instagram
 */
function verifyInstagramWebhook(req, res) {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.INSTAGRAM_VERIFY_TOKEN) {
    console.log('[Instagram] Webhook verificado correctamente');
    return res.status(200).send(challenge);
  }

  console.warn('[Instagram] Fallo de verificación — token incorrecto o mode inválido');
  return res.sendStatus(403);
}

/**
 * POST /webhook/instagram
 */
async function handleInstagramWebhook(req, res) {
  // Verificar firma antes de procesar — rechaza requests falsas
  const appSecret = process.env.META_APP_SECRET;
  if (appSecret && !verifyMetaSignature(req.rawBody, appSecret, req.headers['x-hub-signature-256'])) {
    console.warn('[Instagram] Firma de webhook inválida — request rechazada');
    return res.sendStatus(403);
  }

  res.sendStatus(200);

  const body = req.body;

  // Instagram usa object: "instagram" o "page" según la configuración
  if (body.object !== 'instagram' && body.object !== 'page') return;

  try {
    for (const entry of body.entry || []) {
      // Recolectar eventos de ambos formatos:
      // - entry.messaging[] → Webhooks product (DMs reales)
      // - entry.changes[].value → Casos de uso / test button
      const events = [
        ...(entry.messaging || []),
        ...(entry.changes || [])
          .filter(c => c.field === 'messages')
          .map(c => c.value),
      ];

      for (const event of events) {
        if (!event.message) continue;
        if (event.message.is_echo) continue;

        const messageId = event.message.mid;

        // Deduplicar
        if (processedMessageIds.has(messageId)) {
          console.log(`[Instagram] Mensaje duplicado ignorado: ${messageId}`);
          continue;
        }
        processedMessageIds.add(messageId);

        await processInstagramMessage(event);
      }
    }
  } catch (error) {
    console.error('[Instagram] Error procesando webhook:', error.message);
  }
}

/**
 * Procesa un mensaje individual de Instagram DM.
 */
async function processInstagramMessage(event) {
  const senderId = event.sender.id;
  const text     = event.message.text || '';

  console.log(`[Instagram] Mensaje de ${senderId}: "${text}"`);

  if (text) {
    await handleMessage(senderId, 'instagram', text);
  }
}

module.exports = {
  verifyWhatsAppWebhook,
  handleWhatsAppWebhook,
  verifyInstagramWebhook,
  handleInstagramWebhook,
};
