const axios = require('axios');

const API_URL = 'https://graph.facebook.com/v19.0';

function getHeaders() {
  return {
    Authorization: `Bearer ${process.env.INSTAGRAM_TOKEN}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Envía un mensaje de texto por Instagram DM.
 * @param {string} to   - PSID del destinatario (recipient ID de Instagram)
 * @param {string} text - Texto a enviar
 */
async function sendTextMessage(to, text) {
  const pageId = process.env.INSTAGRAM_PAGE_ID;

  try {
    const { data } = await axios.post(
      `${API_URL}/${pageId}/messages`,
      {
        recipient: { id: to },
        message: { text },
      },
      { headers: getHeaders() }
    );

    console.log(`[Instagram] Mensaje enviado a ${to}`);
    return data;
  } catch (error) {
    console.error(`[Instagram] Error enviando mensaje a ${to}:`, error.response?.data ?? error.message);
    throw error;
  }
}

module.exports = { sendTextMessage };
