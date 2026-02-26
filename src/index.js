require('dotenv').config();
const express = require('express');

const whatsappRoutes  = require('./routes/whatsapp');
const instagramRoutes = require('./routes/instagram');

const path = require('path');

const app = express();
app.use(express.json());

// ─── Frontend de demo ─────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// ─── Chat endpoint (usado por el frontend y por chat.js) ─────────────────────
const { processMessage } = require('./services/aiService');
const stateManager       = require('./conversation/stateManager');

app.post('/chat', async (req, res) => {
  const { userId = 'web-user', message } = req.body;
  if (!message) return res.status(400).json({ error: 'Falta el campo message' });

  try {
    const state    = stateManager.getState(userId);
    const resultado = await processMessage(message, state.historial || []);

    stateManager.updateState(userId, {
      historial: resultado.updatedHistorial,
      ...(resultado.propiedades.length > 0 && { ultimasPropiedades: resultado.propiedades }),
    });

    res.json({
      ok:          true,
      respuesta:   resultado.text,
      propiedades: resultado.propiedades,
    });
  } catch (error) {
    console.error('[Chat] Error:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ─── Webhooks ────────────────────────────────────────────────────────────────
app.use('/webhook/whatsapp',  whatsappRoutes);
app.use('/webhook/instagram', instagramRoutes);

// ─── Health check ────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Endpoints de desarrollo — SOLO para testing local ───────────────────────
if (process.env.NODE_ENV !== 'production') {
  const { searchProperties, findLocationId, invalidateCache } = require('./services/tokkoService');
  const { handleMessage } = require('./conversation/flowHandler');

  /**
   * GET /dev/tokko/search
   * Prueba la búsqueda de propiedades sin pasar por WhatsApp.
   *
   * Params opcionales (query string):
   *   operation_type  1=Venta, 2=Alquiler, 3=Temporario
   *   property_type   2=Depto, 3=Casa, 13=PH, etc.
   *   location        texto libre ("Palermo", "San Isidro")
   *   price_to        precio máximo
   *   currency        USD | ARS
   *   rooms           ambientes
   *
   * Ejemplo: GET /dev/tokko/search?operation_type=1&location=Palermo&rooms=3
   */
  app.get('/dev/tokko/search', async (req, res) => {
    const filters = {};

    if (req.query.operation_type) filters.operation_type = Number(req.query.operation_type);
    if (req.query.property_type)  filters.property_type  = Number(req.query.property_type);
    if (req.query.price_from)     filters.price_from     = Number(req.query.price_from);
    if (req.query.price_to)       filters.price_to       = Number(req.query.price_to);
    if (req.query.currency)       filters.currency       = req.query.currency;
    if (req.query.rooms)          filters.rooms          = Number(req.query.rooms);
    if (req.query.location)       filters.location       = req.query.location;
    if (req.query.limit)          filters.limit          = Number(req.query.limit);

    try {
      const resultado = await searchProperties(filters);
      res.json({ ok: true, filtros: filters, ...resultado });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  /**
   * GET /dev/tokko/location?q=Palermo
   * Prueba la resolución de texto de zona a ID de Tokko.
   */
  app.get('/dev/tokko/location', async (req, res) => {
    const query = req.query.q;
    if (!query) return res.status(400).json({ error: 'Falta parámetro q' });

    const resultado = await findLocationId(query);
    res.json({ ok: true, query, resultado });
  });

  // POST /dev/tokko/cache/clear — fuerza re-fetch desde Tokko
  app.post('/dev/tokko/cache/clear', (req, res) => {
    invalidateCache();
    res.json({ ok: true, msg: 'Cache invalidado' });
  });

  /**
   * POST /dev/chat
   * Simula una conversación completa sin WhatsApp.
   * Body: { userId: "test123", message: "busco un depto en Palermo" }
   * Responde con el texto que enviaría el bot y las propiedades encontradas.
   */
  app.post('/dev/chat', async (req, res) => {
    const { userId = 'dev-user', message } = req.body;
    if (!message) return res.status(400).json({ error: 'Falta el campo message' });

    try {
      // Capturar lo que flowHandler enviaría (sin llamar a WhatsApp real)
      const { processMessage } = require('./services/aiService');
      const stateManager = require('./conversation/stateManager');
      const state = stateManager.getState(userId);

      const resultado = await processMessage(message, state.historial || []);

      stateManager.updateState(userId, {
        historial: resultado.updatedHistorial,
        ...(resultado.propiedades.length > 0 && { ultimasPropiedades: resultado.propiedades }),
      });

      res.json({
        ok:          true,
        userId,
        respuesta:   resultado.text,
        propiedades: resultado.propiedades,
        historialLen: resultado.updatedHistorial.length,
      });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  console.log('[Server] Endpoints de desarrollo activos en /dev/tokko/*');
}

// ─────────────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[Server] Corriendo en puerto ${PORT}`);
  console.log(`[Server] Health check: http://localhost:${PORT}/health`);
});
