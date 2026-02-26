const axios = require('axios');

const API_URL = 'https://graph.facebook.com/v19.0';

function getHeaders() {
  return {
    Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Envía un mensaje de texto por WhatsApp Cloud API.
 * @param {string} to   - Número de teléfono del destinatario (formato E.164, sin +)
 * @param {string} text - Texto a enviar
 */
async function sendTextMessage(to, text) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_ID;

  try {
    const { data } = await axios.post(
      `${API_URL}/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { body: text },
      },
      { headers: getHeaders() }
    );

    console.log(`[WhatsApp] Mensaje enviado a ${to} — ID: ${data.messages?.[0]?.id}`);
    return data;
  } catch (error) {
    console.error(`[WhatsApp] Error enviando texto a ${to}:`, error.response?.data ?? error.message);
    throw error;
  }
}

/**
 * Envía una imagen con caption opcional por WhatsApp.
 * Tokko devuelve URLs directas de fotos que se pueden usar aquí.
 * @param {string} to       - Número destinatario
 * @param {string} imageUrl - URL pública de la imagen
 * @param {string} caption  - Texto que acompaña la imagen (opcional)
 */
async function sendImageMessage(to, imageUrl, caption = '') {
  const phoneNumberId = process.env.WHATSAPP_PHONE_ID;

  try {
    const { data } = await axios.post(
      `${API_URL}/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'image',
        image: { link: imageUrl, caption },
      },
      { headers: getHeaders() }
    );

    console.log(`[WhatsApp] Imagen enviada a ${to}`);
    return data;
  } catch (error) {
    console.error(`[WhatsApp] Error enviando imagen a ${to}:`, error.response?.data ?? error.message);
    throw error;
  }
}

module.exports = { sendTextMessage, sendImageMessage };
