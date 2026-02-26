const express = require('express');
const router = express.Router();
const {
  verifyInstagramWebhook,
  handleInstagramWebhook,
} = require('../controllers/messageController');

// GET — verificación del webhook
router.get('/', verifyInstagramWebhook);

// POST — mensajes entrantes
router.post('/', handleInstagramWebhook);

module.exports = router;
