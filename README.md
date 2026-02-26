# tokkoBot — Asistente Virtual para Miguel Dodórico Propiedades

Bot conversacional 24hs que atiende clientes por **WhatsApp** e **Instagram**, consulta propiedades en tiempo real desde el CRM **Tokko Broker**, responde con inteligencia artificial (**Claude de Anthropic**) y guía al cliente hasta agendar una visita.

---

## Índice

1. [¿Qué hace exactamente?](#qué-hace-exactamente)
2. [Stack tecnológico](#stack-tecnológico)
3. [Estructura de archivos](#estructura-de-archivos)
4. [Variables de entorno](#variables-de-entorno)
5. [Cómo correr el proyecto](#cómo-correr-el-proyecto)
6. [Módulos explicados](#módulos-explicados)
7. [API de Tokko Broker](#api-de-tokko-broker)
8. [Integración con Anthropic (Claude)](#integración-con-anthropic-claude)
9. [Webhooks de Meta (WhatsApp e Instagram)](#webhooks-de-meta-whatsapp-e-instagram)
10. [Frontend web](#frontend-web)
11. [Endpoints disponibles](#endpoints-disponibles)
12. [Deployment](#deployment)
13. [Estado del proyecto](#estado-del-proyecto)
14. [Problemas conocidos y soluciones](#problemas-conocidos-y-soluciones)

---

## ¿Qué hace exactamente?

1. El cliente escribe un mensaje por WhatsApp o Instagram (o desde el frontend web de demo).
2. El servidor recibe el mensaje y lo pasa a **Claude** junto con el historial de la conversación.
3. Si el cliente está buscando una propiedad, Claude llama a la herramienta `buscar_propiedades`.
4. El bot consulta **Tokko Broker** en tiempo real, filtra el catálogo y devuelve los resultados.
5. Claude recibe esos resultados y redacta una respuesta en español rioplatense.
6. El bot envía la respuesta y las fotos al cliente por el mismo canal.
7. Si el cliente quiere visitar una propiedad, el bot lo dirige al link de la ficha de Tokko, que tiene el sistema de agendamiento integrado.

---

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Servidor | Node.js + Express |
| IA | Anthropic API — modelo `claude-sonnet-4-6` |
| CRM | Tokko Broker REST API v1 |
| Canales | Meta Cloud API (WhatsApp) + Meta Graph API (Instagram DM) |
| Frontend de demo | React 18 + Vite + TypeScript + Tailwind CSS + shadcn/ui |
| Configuración | dotenv (.env) |
| Deploy | ngrok (demo local) / Railway (staging) / Hostinger VPS (producción) |

---

## Estructura de archivos

```
tokkoBot/
│
├── src/
│   ├── index.js                        # Entry point: Express + rutas + endpoint /chat
│   │
│   ├── routes/
│   │   ├── whatsapp.js                 # GET verificación + POST mensajes WhatsApp
│   │   └── instagram.js                # GET verificación + POST mensajes Instagram
│   │
│   ├── controllers/
│   │   └── messageController.js        # Handlers de webhooks + deduplicación de mensajes
│   │
│   ├── services/
│   │   ├── aiService.js                # Integración Anthropic: tool use loop con Claude
│   │   ├── tokkoService.js             # Integración Tokko: fetch, cache, filtrado, normalización
│   │   ├── whatsappService.js          # sendTextMessage + sendImageMessage vía Meta Cloud API
│   │   └── instagramService.js         # sendTextMessage vía Meta Graph API
│   │
│   ├── conversation/
│   │   ├── stateManager.js             # Estado de cada usuario en memoria (Map)
│   │   └── flowHandler.js              # Orquestador: IA → Tokko → envía respuesta al canal
│   │
│   ├── config/
│   │   └── prompts.js                  # SYSTEM_PROMPT de Claude + formatToolResult()
│   │
│   ├── public/                         # Build del frontend React (generado, no editar aquí)
│   └── assets/
│       └── logoMD.png                  # Logo de Miguel Dodórico Propiedades
│
├── client/                             # Código fuente del frontend (React + Vite)
│   ├── src/
│   │   ├── components/
│   │   │   ├── Chat.tsx                # Componente principal del chat (modal)
│   │   │   ├── PropertyCard.tsx        # Tarjeta de propiedad
│   │   │   └── ui/                     # Componentes shadcn/ui
│   │   │       ├── button.tsx
│   │   │       ├── input.tsx
│   │   │       └── badge.tsx
│   │   ├── lib/
│   │   │   └── utils.ts                # Función cn() para Tailwind (clsx + tailwind-merge)
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── index.css                   # Tailwind + variables CSS + animación typing
│   ├── index.html
│   ├── vite.config.ts                  # Proxy /chat y /assets a :3000 en dev; build → src/public/
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   └── package.json
│
├── chat.js                             # CLI interactiva para probar el bot en la terminal
├── package.json
├── .env                                # Variables de entorno (NO commitear)
├── .env.example                        # Plantilla de variables
└── .gitignore
```

---

## Variables de entorno

Copiar `.env.example` como `.env` y completar:

```env
# Servidor
PORT=3000

# Anthropic
ANTHROPIC_API_KEY=sk-ant-api03-...

# Tokko Broker
TOKKO_API_KEY=tu_api_key_de_tokko
TOKKO_BRANCH_ID=10928             # Solo referencial, NO se puede usar como filtro en la API

# WhatsApp (Meta Cloud API)
WHATSAPP_TOKEN=tu_token_permanente
WHATSAPP_VERIFY_TOKEN=una_palabra_secreta_cualquiera
WHATSAPP_PHONE_ID=id_del_numero_de_whatsapp

# Instagram (Meta Graph API)
INSTAGRAM_TOKEN=tu_token_de_instagram
INSTAGRAM_VERIFY_TOKEN=otra_palabra_secreta
INSTAGRAM_PAGE_ID=id_de_la_pagina

# Notificaciones
NOTIFY_EMAIL=email_para_escalados
```

---

## Cómo correr el proyecto

### Requisitos previos

- Node.js 18+
- Cuenta de Anthropic con créditos cargados
- API key de Tokko Broker

### 1. Instalar dependencias del servidor

```bash
npm install
```

### 2. Correr el servidor

```bash
# Producción
node src/index.js

# Desarrollo con auto-reload
npm run dev
```

El servidor queda corriendo en `http://localhost:3000`.

### 3. Abrir el frontend de demo

Navegar a `http://localhost:3000` — sirve el build de React directamente.

### 4. Probar el bot en la terminal (sin navegador)

```bash
node chat.js
```

Abre un chat interactivo. Escribir `salir` para terminar.

### 5. Exponer con ngrok (para demo a cliente)

```bash
# En otra terminal, con el servidor ya corriendo
ngrok http 3000
```

Ngrok muestra una URL pública tipo `https://abc123.ngrok-free.app`. Esa URL se comparte con el cliente.

### 6. Compilar el frontend después de cambios

```bash
cd client
npm run build
```

El build se vuelca automáticamente a `src/public/` y Express lo sirve.

### 7. Modo desarrollo del frontend (hot reload)

```bash
# Terminal 1: servidor backend
node src/index.js

# Terminal 2: frontend con Vite
cd client
npm run dev
```

Vite corre en `:5173` y proxea `/chat` y `/assets` al backend en `:3000`.

---

## Módulos explicados

### `src/services/aiService.js` — El cerebro

Maneja toda la comunicación con la API de Anthropic usando el patrón **tool use**.

**Función principal: `processMessage(userMessage, historial)`**

```
1. Armar array de mensajes: historial recortado + mensaje nuevo del usuario
2. Llamar a Claude con el SYSTEM_PROMPT y la herramienta buscar_propiedades
3. Si Claude responde con stop_reason: "tool_use":
   → ejecutar buscar_propiedades con los filtros que eligió Claude
   → agregar el resultado al array de mensajes como tool_result
   → volver a llamar a Claude (continuar el bucle)
4. Cuando stop_reason: "end_turn":
   → extraer el texto final
   → devolver { text, propiedades, updatedHistorial }
```

El historial se limita a los últimos 30 mensajes para no superar el context window de Claude.

---

### `src/services/tokkoService.js` — Conexión con el CRM

Trae las propiedades de Tokko Broker y las filtra según lo que pidió Claude.

**Estrategia de búsqueda:**

> El endpoint `/property/search/` de Tokko **no funciona** (siempre devuelve 400).
> La solución es traer *todas* las propiedades con `/property/?limit=500` y filtrar en memoria.

**Cache:** Las propiedades se guardan en memoria con TTL de 5 minutos. Con 36 propiedades en la cuenta, esto es más que suficiente.

**Filtros disponibles:**

| Filtro | Campo en Tokko | Descripción |
|--------|---------------|-------------|
| `operation_type` | `operations[].operation_id` | 1=Venta, 2=Alquiler, 3=Temporario |
| `property_type` | `type.id` | 2=Depto, 3=Casa, 13=PH, 5=Oficina... |
| `rooms` | `room_amount` | Mínimo de ambientes |
| `price_to` / `price_from` | `operations[].prices[].price` | Con moneda (USD o ARS) |
| `location` | `location.id` | Texto libre → se resuelve a ID con `/location/quicksearch/` |

**Normalización:** El objeto crudo de Tokko tiene campos con nombres distintos a la documentación oficial. `normalizeProperty()` los mapea al formato limpio que usa el bot:

```js
{
  id, titulo, tipo, tipoId, operacion, operacionId,
  precio, moneda, ambientes, banos, cocheras,
  superficieCubierta, superficieTotal,
  direccion, zona, zonaCompleta, descripcion,
  fotoPrincipal, urlFicha
}
```

---

### `src/services/aiService.js` — Herramienta `buscar_propiedades`

Claude puede llamar a esta herramienta con los siguientes parámetros (todos opcionales):

```json
{
  "operation_type": 1,       // 1=Venta, 2=Alquiler, 3=Temporario
  "property_type":  2,       // 2=Departamento, 3=Casa, 13=PH, etc.
  "rooms":          3,       // ambientes mínimos
  "price_to":       150000,  // precio máximo
  "currency":       "USD",   // USD o ARS
  "location":       "Palermo",
  "offset":         0        // para paginación: 0, 3, 6, 9...
}
```

---

### `src/conversation/stateManager.js` — Estado de conversaciones

Guarda el estado de cada usuario en un `Map` en memoria.

```js
{
  fase:               'bienvenida',  // bienvenida | buscando | mostrando_resultados | escalando
  filtros:            {},            // criterios de búsqueda acumulados
  ultimasPropiedades: [],            // propiedades mostradas en el último mensaje
  contacto:           {},            // nombre y teléfono del cliente (si ya los dio)
  historial:          [],            // mensajes en formato Anthropic [{role, content}]
  creadoEn:           '...',
  ultimaActividad:    '...'
}
```

> **Importante:** el estado es en memoria. Si el servidor se reinicia, se pierden todas las conversaciones en curso. Para producción con alta concurrencia, migrar a Redis.

---

### `src/conversation/flowHandler.js` — Orquestador

Conecta todos los módulos:

```
handleMessage(userId, channel, text)
  → stateManager.getState()
  → aiService.processMessage()  ← puede llamar a tokkoService internamente
  → si hay propiedades con foto: enviar imágenes antes del texto (mejor UX)
  → enviar texto de Claude al canal (whatsapp o instagram)
  → stateManager.updateState()
```

---

### `src/controllers/messageController.js` — Webhooks

Recibe los eventos de Meta y los pasa al `flowHandler`.

**Comportamiento importante de la API de Meta:**
- Meta puede enviar el mismo mensaje **dos veces**. El controller tiene un `Set` de IDs procesados para descartarlos.
- WhatsApp e Instagram requieren respuesta **200 inmediata** — el procesamiento se hace de forma asíncrona después de responder.

---

### `src/config/prompts.js` — El prompt del bot

`SYSTEM_PROMPT`: instrucciones completas para Claude. Define personalidad, cuándo buscar propiedades, cómo presentarlas, el flujo de conversación y las reglas del negocio.

`formatToolResult(propiedades, total, filters)`: convierte el resultado de `searchProperties()` en texto estructurado que Claude puede leer y usar para redactar su respuesta.

---

## API de Tokko Broker

**Base URL:** `https://www.tokkobroker.com/api/v1`

La API key identifica la cuenta (no hay URL diferente por cliente).

### Endpoints que se usan

```
GET /property/?key=KEY&format=json&lang=es_ar&limit=500
→ Devuelve todas las propiedades activas de la cuenta

GET /location/quicksearch/?key=KEY&format=json&q=Palermo
→ Resuelve texto de zona a ID numérico de Tokko
```

### Endpoint que NO funciona

```
POST /property/search/  →  siempre devuelve 400 "Data de búsqueda inválida"
GET  /property/search/  →  igual
```

No importa cómo se envíen los parámetros (query string, body JSON, campo `data`), el endpoint de búsqueda oficial de Tokko devuelve error. Por eso se trae todo el catálogo y se filtra en el servidor.

### Nombres de campos reales (distintos a la documentación oficial)

| Documentación dice | Campo real en la API |
|-------------------|---------------------|
| `property_type` | `type.id` / `type.name` |
| `rooms` | `room_amount` |
| `bathrooms` | `bathroom_amount` |
| `parking` | `parking_lot_amount` |
| `surface` | `roofed_surface` (cubierta) / `total_surface` (total) |
| `images` | `photos[].image` |
| `url` | `public_url` |

---

## Integración con Anthropic (Claude)

**Modelo:** `claude-sonnet-4-6` (configurable por `CLAUDE_MODEL` en `.env`)

**Patrón:** tool use con bucle `while(true)`:

```
llamar a Claude
  ↓
¿stop_reason === "tool_use"?
  → ejecutar herramienta → agregar resultado → volver a llamar

¿stop_reason === "end_turn"?
  → retornar respuesta final
```

**Límite de historial:** 30 mensajes (MAX_HISTORY). Evita que el context window crezca indefinidamente.

**Costo estimado por conversación:** ~$0.002–0.005 USD dependiendo de la longitud (incluye el catálogo de propiedades cuando se busca).

---

## Webhooks de Meta (WhatsApp e Instagram)

### Verificación (GET)

Meta llama al webhook con tres query params para verificar que el servidor es el correcto:

```
GET /webhook/whatsapp?hub.mode=subscribe&hub.verify_token=TOKEN&hub.challenge=NUMERO
```

El servidor verifica que `hub.verify_token` coincida con `WHATSAPP_VERIFY_TOKEN` del `.env` y responde con `hub.challenge`.

### Mensajes (POST)

El servidor debe responder **200 inmediatamente** o Meta reintentará. El procesamiento se hace después de responder.

### Configurar en Meta for Developers

1. Crear app en `developers.facebook.com`
2. Agregar producto WhatsApp / Messenger (Instagram)
3. Registrar la URL del webhook: `https://tu-url.com/webhook/whatsapp`
4. Pegar el verify token que tenés en `.env`
5. Suscribir al evento `messages`

> Para que Meta acepte el webhook, la URL debe ser pública con HTTPS. Usar ngrok o Railway para esto.

---

## Frontend web

Aplicación React compilada que Express sirve como archivos estáticos.

**Diseño:** modal centrado flotando sobre un fondo con gradiente sutil. Full-screen en mobile, `480×700px` en desktop.

**Colores de marca:**
- Azul: `#003BD3`
- Naranja: `#FF6700`

**Componentes:**
- `Chat.tsx` — lógica principal del chat, typing indicator, render de mensajes
- `PropertyCard.tsx` — tarjeta de propiedad con foto, precio, detalles y link
- `ui/button.tsx`, `ui/input.tsx`, `ui/badge.tsx` — componentes de shadcn/ui

**Build:**
```bash
cd client && npm run build
# → genera src/public/index.html + src/public/assets/
```

---

## Endpoints disponibles

### Siempre activos

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/` | Frontend de demo (sirve `src/public/index.html`) |
| POST | `/chat` | Endpoint del chat — body: `{ userId, message }` |
| GET | `/health` | Health check — responde `{ status: "ok", timestamp }` |
| GET | `/webhook/whatsapp` | Verificación del webhook de WhatsApp |
| POST | `/webhook/whatsapp` | Eventos de mensajes de WhatsApp |
| GET | `/webhook/instagram` | Verificación del webhook de Instagram |
| POST | `/webhook/instagram` | Eventos de mensajes de Instagram DM |

### Solo en desarrollo (NODE_ENV ≠ production)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/dev/tokko/search` | Probar búsqueda directo contra Tokko |
| GET | `/dev/tokko/location?q=Palermo` | Probar resolución de zona a ID |
| POST | `/dev/tokko/cache/clear` | Forzar re-fetch desde Tokko |
| POST | `/dev/chat` | Chat de prueba con historialLen en la respuesta |

**Ejemplo de uso del endpoint de búsqueda:**
```
GET /dev/tokko/search?operation_type=1&location=Palermo&rooms=3
GET /dev/tokko/search?operation_type=2&property_type=2&price_to=500000&currency=ARS
```

---

## Deployment

### Opción 1: ngrok (demo local rápida)

```bash
# 1. Correr el servidor
node src/index.js

# 2. Exponer con ngrok (otra terminal)
ngrok http 3000
```

La URL cambia en cada reinicio de ngrok (plan gratis). Ideal para mostrarle el bot al cliente.

### Opción 2: Railway (staging con URL fija)

1. Subir el código a GitHub
2. Crear proyecto en `railway.app` y conectar el repo
3. Agregar las variables de entorno en el panel de Railway
4. Railway detecta automáticamente Node.js y corre `npm start`

Ventaja: URL fija y HTTPS automático. El free tier incluye $5/mes de crédito.

### Opción 3: Hostinger VPS (producción)

```bash
# En el servidor Ubuntu
git clone tu-repo
cd tokkoBot
npm install
cp .env.example .env  # completar con las claves reales

# Instalar PM2 para que el proceso sobreviva cierres de terminal
npm install -g pm2
pm2 start src/index.js --name tokkoBot
pm2 save
pm2 startup  # para que arranque automáticamente al reiniciar el servidor
```

Configurar nginx como reverse proxy y certbot para SSL.

---

## Estado del proyecto

- [x] **Etapa 1-2:** Estructura base + webhook WhatsApp con eco funcional
- [x] **Etapa 3:** Integración Tokko Broker (fetch, cache, filtrado, normalización)
- [x] **Etapa 4:** Integración Anthropic AI con tool use + flowHandler completo
- [x] **Frontend:** Chat web con React + shadcn/ui, modal con márgenes, cards de propiedades
- [x] **Demo:** Probado end-to-end via `chat.js` y frontend web con ngrok
- [ ] **Etapa 5:** Configurar webhooks reales de WhatsApp (requiere número Meta)
- [ ] **Etapa 6:** Canal Instagram completo (requiere página de Facebook + app aprobada)
- [ ] **Etapa 7:** Escalado a humano (captura nombre/teléfono + notificación por email)
- [ ] **Producción:** Deploy en Hostinger VPS con PM2 + nginx + SSL

---

## Problemas conocidos y soluciones

### Tokko `/property/search/` siempre devuelve 400

**Causa:** El endpoint de búsqueda de Tokko no acepta ningún formato de parámetros.
**Solución:** Traer todas las propiedades con `/property/?limit=500` y filtrar en memoria con `applyFilters()`.

### Los campos de la API de Tokko no coinciden con la documentación

**Causa:** La documentación oficial de Tokko está desactualizada.
**Solución:** Los campos reales están documentados arriba. `normalizeProperty()` maneja el mapeo.

### `TOKKO_BRANCH_ID` no funciona como filtro

**Causa:** Tokko devuelve 400 con `"The 'branch' field does not allow filtering."`.
**Solución:** El filtrado por cuenta ya lo hace la API key (devuelve solo las propiedades de esa cuenta). El `BRANCH_ID` se guarda en `.env` solo como referencia.

### Meta envía el mismo mensaje dos veces

**Causa:** Comportamiento normal de la API de Meta (reintentos automáticos).
**Solución:** `processedMessageIds` (Set en `messageController.js`) descarta IDs ya procesados.

### Terminal Git Bash muestra mensajes repetidos en `chat.js`

**Causa:** `console.log` de los servicios internos se mezcla con el output de `readline`.
**Solución:** `chat.js` redirige los logs internos (`[AI]`, `[Tokko]`, etc.) a `stderr` para que no interfieran con el display del chat.
