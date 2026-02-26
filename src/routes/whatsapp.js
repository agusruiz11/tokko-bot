const express = require('express');
const router = express.Router();
const {
  verifyWhatsAppWebhook,
  handleWhatsAppWebhook,
} = require('../controllers/messageController');

// GET — verificación del webhook (Meta lo llama al configurar)
router.get('/', verifyWhatsAppWebhook);

// POST — mensajes entrantes
router.post('/', handleWhatsAppWebhook);

module.exports = router;
