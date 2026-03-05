# tokkoBot — Asistente Virtual para Miguel D'Odorico Propiedades

Bot conversacional 24hs que atiende clientes por **WhatsApp** e **Instagram**. Consulta propiedades en tiempo real desde **Tokko Broker**, responde con **Claude (Anthropic)** y guía al cliente hasta agendar una visita.

---

## Stack

| Capa | Tecnología |
|------|-----------|
| Servidor | Node.js + Express |
| IA | Anthropic API — `claude-sonnet-4-6` |
| CRM | Tokko Broker REST API v1 |
| Canales | Meta Cloud API (WhatsApp) + Meta Graph API (Instagram DM) |
| Deploy | Railway (staging) / Hostinger VPS (producción) |

---

## Estructura

```
src/
├── index.js                  # Entry point: Express + rutas + endpoint /chat
├── routes/                   # Rutas de webhooks (whatsapp.js, instagram.js)
├── controllers/
│   └── messageController.js  # Handlers de webhooks + verificación de firma Meta
├── services/
│   ├── aiService.js          # Tool use loop con Claude
│   ├── tokkoService.js       # Fetch + cache + filtrado de propiedades
│   ├── whatsappService.js    # Envío de mensajes por WhatsApp
│   └── instagramService.js   # Envío de mensajes por Instagram
├── conversation/
│   ├── stateManager.js       # Estado por usuario en memoria (Map, TTL 24h)
│   └── flowHandler.js        # Orquestador: IA → Tokko → respuesta al canal
└── config/
    └── prompts.js            # SYSTEM_PROMPT + formatToolResult()
```

---

## Variables de entorno

Crear un archivo `.env` en la raíz con:

```env
PORT=3000

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Tokko Broker
TOKKO_API_KEY=...

# WhatsApp (Meta Cloud API)
WHATSAPP_TOKEN=...
WHATSAPP_VERIFY_TOKEN=...        # string inventado, tiene que coincidir con Meta
WHATSAPP_PHONE_ID=...

# Instagram (Meta Graph API)
INSTAGRAM_TOKEN=...
INSTAGRAM_VERIFY_TOKEN=...       # string inventado, tiene que coincidir con Meta
INSTAGRAM_PAGE_ID=...

# Seguridad — firma de webhooks (obligatorio en producción)
META_APP_SECRET=...              # Meta for Developers → Configuración → Básico → App Secret
```

> `META_APP_SECRET` permite verificar que los webhooks POST realmente vienen de Meta.
> Si no está definida, la verificación se omite (útil en desarrollo local).

Para la guía completa de cómo obtener cada variable y conectar la app a Meta,
ver **[CONEXION_META.md](./CONEXION_META.md)**.

---

## Correr el proyecto

```bash
# Instalar dependencias
npm install

# Desarrollo (auto-reload)
npm run dev

# Producción
node src/index.js
```

El servidor queda en `http://localhost:3000`.

---

## Endpoints

### Siempre activos

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/chat` | Chat web — body: `{ userId, message }` |
| GET | `/webhook/whatsapp` | Verificación del webhook de WhatsApp |
| POST | `/webhook/whatsapp` | Mensajes entrantes de WhatsApp |
| GET | `/webhook/instagram` | Verificación del webhook de Instagram |
| POST | `/webhook/instagram` | Mensajes entrantes de Instagram DM |

### Solo en desarrollo (`NODE_ENV !== 'production'`)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/dev/tokko/search` | Probar búsqueda de propiedades |
| GET | `/dev/tokko/location?q=Palermo` | Resolver zona a ID |
| POST | `/dev/tokko/cache/clear` | Forzar re-fetch desde Tokko |
| POST | `/dev/chat` | Simular conversación sin WhatsApp/Instagram |

---

## Deployment

### Railway (staging)

1. Subir el código a GitHub
2. Crear proyecto en `railway.app` y conectar el repo
3. Agregar las variables de entorno en el panel → Railway redespliega automáticamente
4. La URL pública HTTPS queda disponible en Settings → Networking

### Hostinger VPS (producción)

```bash
git clone <repo>
cd tokkoBot
npm install
cp .env.example .env   # completar con las claves reales

npm install -g pm2
pm2 start src/index.js --name tokkoBot
pm2 save && pm2 startup
```

Configurar nginx como reverse proxy y certbot para SSL.

### ngrok (demo local)

```bash
# Terminal 1
node src/index.js

# Terminal 2
ngrok http 3000
```

La URL de ngrok cambia en cada reinicio (plan gratis). Útil para mostrarle el bot al cliente.

---

## Notas importantes

- **Tokko `/property/search/` no funciona** — devuelve 400 siempre. El bot trae todas las propiedades con `/property/?limit=500` y filtra en memoria.
- **Meta puede entregar el mismo mensaje dos veces** — el controller deduplica por ID de mensaje.
- **El estado de conversaciones es en memoria** — si el servidor se reinicia, las conversaciones en curso se pierden. Para producción con alta concurrencia, migrar a Redis.
