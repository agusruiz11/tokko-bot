# Manual de conexión tokkoBot ↔ Meta (WhatsApp + Instagram)

**Proyecto:** tokkoBot — Miguel D'Odorico Propiedades
**Stack:** Node.js + Express en Railway
**Fecha:** Marzo 2026

Este documento explica paso a paso cómo conectar el bot a WhatsApp e Instagram
a través de la API de Meta. Incluye todos los errores que ocurrieron durante la
primera conexión y cómo se resolvieron, para poder replicar el proceso en otras
cuentas sin errores.

---

## ÍNDICE

1. [Arquitectura general](#1-arquitectura-general)
2. [Pre-requisitos](#2-pre-requisitos)
3. [Configuración del servidor en Railway](#3-configuración-del-servidor-en-railway)
4. [Crear la app en Meta for Developers](#4-crear-la-app-en-meta-for-developers)
5. [Conexión WhatsApp](#5-conexión-whatsapp)
6. [Conexión Instagram](#6-conexión-instagram)
7. [Modo desarrollo vs. modo producción](#7-modo-desarrollo-vs-modo-producción)
8. [Errores frecuentes y soluciones](#8-errores-frecuentes-y-soluciones)
9. [Checklist para replicar en otra cuenta](#9-checklist-para-replicar-en-otra-cuenta)
10. [Variables de entorno completas](#10-variables-de-entorno-completas)
11. [Seguridad](#11-seguridad)

---

## 1. ARQUITECTURA GENERAL

```
Usuario de WhatsApp / Instagram
        │
        │  DM / mensaje
        ▼
   Servidores de Meta
        │
        │  POST webhook (HTTPS)
        ▼
   Railway (servidor Node.js)
   https://tokko-bot-production.up.railway.app
        │
        ├── /webhook/whatsapp  → messageController.js
        └── /webhook/instagram → messageController.js
                │
                ├── flowHandler.js (lógica conversacional)
                ├── aiService.js   (Claude / Anthropic)
                └── tokkoService.js (Tokko Broker CRM)
        │
        │  Respuesta via API de Meta
        ▼
   Usuario recibe la respuesta del bot
```

**Regla fundamental de Meta:** cuando Meta llama al webhook, el servidor
tiene que responder HTTP 200 de manera INMEDIATA (antes de procesar nada).
Si tarda más de 5 segundos en responder, Meta reintenta y puede enviar el
mismo mensaje varias veces. Por eso el código llama a `res.sendStatus(200)`
como primera línea del handler y procesa después de forma asíncrona.

---

## 2. PRE-REQUISITOS

### Del lado del servidor
- El bot tiene que estar corriendo en un servidor con **URL pública HTTPS**.
  Railway provee esto automáticamente.
- La URL tiene que ser estable (no cambiar entre deploys, salvo que se cambie
  el dominio en Railway).

### Del lado de Meta
- Cuenta de Facebook personal para acceder a developers.facebook.com
- Para WhatsApp: no se necesita número propio para desarrollo (Meta provee un
  sandbox gratuito)
- Para Instagram: una cuenta de Instagram **Business o Creator** (no personal)
  con una **Página de Facebook vinculada**

### Alternativa local (ngrok)
Si el bot corre localmente en vez de Railway, se puede usar ngrok para exponer
el servidor:
```bash
ngrok config add-authtoken TU_AUTHTOKEN
ngrok http 3000
# Genera una URL pública tipo: https://abc123.ngrok-free.app
```
Esa URL se usa igual que la de Railway. **Desventaja:** cambia cada vez que
se reinicia ngrok y no funciona si la computadora está apagada.

---

## 3. CONFIGURACIÓN DEL SERVIDOR EN RAILWAY

### Variables de entorno
En Railway, las variables de entorno NO van en un archivo `.env` local —
se configuran en el dashboard:

**Railway → proyecto → servicio → pestaña Variables**

Agregar cada variable con su valor. Railway redespliega automáticamente
al guardar.

### URL pública
**Railway → proyecto → servicio → pestaña Settings → Networking**

Ahí aparece el dominio público del servicio, por ejemplo:
```
https://tokko-bot-production.up.railway.app
```

### Verificar que el servidor está vivo
Siempre verificar antes de configurar webhooks:
```
GET https://tokko-bot-production.up.railway.app/health
```
Tiene que responder `{"status":"ok","timestamp":"..."}`.

---

## 4. CREAR LA APP EN META FOR DEVELOPERS

1. Ir a **https://developers.facebook.com**
2. Iniciar sesión con cuenta de Facebook
3. Menú superior → **Mis apps** → **Crear app**
4. Tipo de app: **Business**
5. Nombre: `tokkoBot` (o el nombre del proyecto)
6. Correo de contacto y cartera de negocios: opcionales por ahora
7. Click en **Crear app**

Una sola app puede manejar tanto WhatsApp como Instagram. No hace falta
crear apps separadas.

---

## 5. CONEXIÓN WHATSAPP

### 5.1 Agregar el producto WhatsApp

En el dashboard de la app → **Agregar producto** → **WhatsApp** → **Configurar**

### 5.2 Obtener credenciales del sandbox

En WhatsApp → **Primeros pasos** (Getting Started):

- **Token de acceso temporal** (empieza con `EAAB...`) → copiar a `WHATSAPP_TOKEN`
- **Phone Number ID** (número largo) → copiar a `WHATSAPP_PHONE_ID`

> El token temporal dura ~24 horas. Ver sección 5.6 para token permanente.

### 5.3 Agregar número de prueba

En la misma página, sección "Enviar y recibir mensajes":
1. Click en "Administrar lista de números de teléfono"
2. Agregar el número personal con código de país (ej: `+54 9 11 XXXX XXXX`)
3. Verificar con el código que llega por WhatsApp

### 5.4 Configurar el webhook

En WhatsApp → **Configuración** → **Webhooks** → **Editar**:

- **URL de devolución de llamada:**
  `https://TU-DOMINIO.up.railway.app/webhook/whatsapp`
- **Token de verificación:** un string inventado (ej: `miTokenSecreto123`)
  → guardar también en Railway como `WHATSAPP_VERIFY_TOKEN`

Click en **Verificar y guardar**.

Luego suscribirse al campo **`messages`**.

### 5.5 Cómo funciona la verificación

Cuando se hace click en "Verificar y guardar", Meta hace un GET al webhook:
```
GET /webhook/whatsapp?hub.mode=subscribe&hub.verify_token=TOKEN&hub.challenge=RANDOM
```

El código en `messageController.js` compara el `hub.verify_token` con
`process.env.WHATSAPP_VERIFY_TOKEN` y si coincide responde con `hub.challenge`.
Meta recibe el challenge y confirma la verificación.

**Simulación manual para diagnosticar:**
```
https://TU-DOMINIO.up.railway.app/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=TOKEN&hub.challenge=test123
```
Si el servidor responde `test123` → está funcionando bien.
Si responde `403` → el token no coincide con la variable de entorno.

### 5.6 Token permanente

El token temporal expira en ~24hs. Para uno de 60 días:

1. Meta for Developers → **Herramientas** → **Explorador de la API Graph**
2. Seleccionar la app
3. **Generar token de acceso de usuario** con permisos
   `whatsapp_business_messaging` y `whatsapp_business_management`
4. Intercambiar por token de larga duración:
```bash
curl "https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=APP_ID&client_secret=APP_SECRET&fb_exchange_token=TOKEN_CORTO"
```

Para token que no expire: usar **System User** en Meta Business Manager.

---

## 6. CONEXIÓN INSTAGRAM

La conexión de Instagram es más compleja que la de WhatsApp porque involucra
múltiples componentes y tiene restricciones de modo desarrollo.

### 6.1 Requisitos previos

- Cuenta de Instagram **Business o Creator** (no personal)
- **Página de Facebook vinculada** a esa cuenta de Instagram

### 6.2 Agregar el producto Instagram (Casos de uso)

En el dashboard de la app → **Casos de uso** → **Personalizar** →
**API de Instagram** → **Configurar**

En esa pantalla se ven 5 pasos. Completar en orden:

### 6.3 Paso 2 — Generar token de acceso

Antes de generar el token, asegurarse de que la cuenta de Instagram de la
agencia tenga rol en la app:

**Roles → Evaluadores de Instagram → Agregar** → ingresar el @usuario de
Instagram → la cuenta debe **aceptar la invitación** desde la app de
Instagram (Configuración → Seguridad → Apps y sitios web → Evaluador →
aceptar).

Una vez que la cuenta tiene rol, en el Paso 2 → **Agregar cuenta de Instagram**
→ seleccionar la cuenta → **Generar** → copiar el token → `INSTAGRAM_TOKEN`.

El ID de la cuenta de Instagram se puede verificar con:
```bash
curl "https://graph.instagram.com/v21.0/me?fields=id,username&access_token=TOKEN"
```
Ese `id` → `INSTAGRAM_PAGE_ID`.

### 6.4 Paso 3 — Configurar webhook (en Casos de uso)

En el Paso 3 de la pantalla de API de Instagram:
- **URL:** `https://TU-DOMINIO.up.railway.app/webhook/instagram`
- **Token de verificación:** un string inventado → `INSTAGRAM_VERIFY_TOKEN`

### 6.5 Agregar el producto Webhooks (CRÍTICO)

**Este paso es indispensable para que los DMs reales lleguen al webhook.**

La configuración de webhook en "Casos de uso > API de Instagram" solo
funciona para el botón de prueba del dashboard. Los mensajes reales requieren
el producto **Webhooks** configurado por separado.

**App → Agregar producto → Webhooks → Configurar**

Dentro del producto Webhooks:
1. Seleccionar **Instagram** en el dropdown
2. **Suscribirse a este objeto**
3. Completar URL y token (los mismos que en el Paso 3)
4. Verificar y guardar
5. Suscribirse al campo **`messages`**

### 6.6 Suscribir la cuenta de Instagram al webhook (API call)

Además de configurar el webhook en el dashboard, hay que decirle a Meta
explícitamente que envíe eventos de esa cuenta de Instagram al webhook:

```bash
curl -X POST "https://graph.instagram.com/v21.0/IG_USER_ID/subscribed_apps?subscribed_fields=messages&access_token=INSTAGRAM_TOKEN"
```

Tiene que responder `{"success": true}`.

Verificar que quedó bien:
```bash
curl "https://graph.instagram.com/v21.0/IG_USER_ID/subscribed_apps?access_token=INSTAGRAM_TOKEN"
```
Debe mostrar `{"data":[{"id":"APP_ID","subscribed_fields":["messages"]}]}`.

### 6.7 Configuración en Instagram (cuenta de la agencia)

Desde la **app de Instagram** con la cuenta de la agencia (Business/Creator):

Configuración → Privacidad → Mensajes → Solicitud de mensajes →
**Herramientas conectadas** → activar **"Permitir acceso a los mensajes"**

Si no aparece esta opción, buscarla en:
- Panel profesional → Herramientas
- Configuración → Business tools y controles del creador

### 6.8 Endpoint de envío de mensajes

La nueva API de Instagram usa `graph.instagram.com`, NO `graph.facebook.com`.

```
POST https://graph.instagram.com/v21.0/{ig-user-id}/messages
```

Con header `Authorization: Bearer INSTAGRAM_TOKEN` y body:
```json
{
  "recipient": {"id": "SENDER_ID"},
  "message": {"text": "Respuesta del bot"}
}
```

---

## 7. MODO DESARROLLO VS. MODO PRODUCCIÓN

### Modo desarrollo (por defecto al crear la app)

**Restricciones:**
- Los webhooks de DMs reales solo llegan si el **remitente** es admin,
  developer o evaluador de la app en Meta
- Para Instagram: el remitente también necesita haber **aceptado la
  invitación** desde la app de Instagram
- El botón "Probar" del dashboard siempre funciona (Meta lo envía
  directamente, sin pasar por las restricciones de modo)

**Cómo agregar un evaluador de Instagram:**
1. Meta for Developers → app → **Roles** → **Evaluadores de Instagram**
2. Agregar el @usuario de Instagram
3. Desde la app de Instagram: Configuración → Seguridad → Apps y sitios web
   → sección Evaluador → aceptar la invitación

### Modo producción (Live)

Para que cualquier usuario pueda interactuar con el bot (no solo evaluadores),
la app tiene que estar en modo **Live**.

**Requisitos para pasar a Live:**
1. Agregar una **URL de política de privacidad** válida
2. Completar información básica de la app (categoría, correo)
3. Cambiar el toggle "En desarrollo" → "Activo" en el dashboard

**Política de privacidad:** puede ser una página simple explicando qué datos
recopila el bot (mensajes, ID de usuario) y para qué se usan. Se puede
hostear en el mismo servidor:
- Crear `src/public/privacy.html`
- URL resultante: `https://TU-DOMINIO.up.railway.app/privacy.html`

**Importante:** en modo Live, los permisos avanzados (como
`instagram_business_manage_messages`) pueden requerir **App Review** de Meta
para usuarios externos. Para el propio negocio (la cuenta que generó el token)
sigue funcionando sin revisión.

---

## 8. ERRORES FRECUENTES Y SOLUCIONES

### ERROR: "No se pudo validar la URL de devolución de llamada o el token"

**Causa más común:** la URL ingresada en Meta no incluye el path del webhook.

**Solución:** verificar que la URL sea exactamente:
```
https://TU-DOMINIO.up.railway.app/webhook/whatsapp
https://TU-DOMINIO.up.railway.app/webhook/instagram
```
Sin barra final, con el path completo. La raíz del dominio (`/`) no funciona.

**Diagnóstico:** abrir en el navegador:
```
https://TU-DOMINIO.up.railway.app/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=TOKEN&hub.challenge=test123
```
- Si responde `test123` → servidor OK, el problema es el token o la URL en Meta
- Si responde `403` → el token en Railway no coincide con el que se puso en Meta
- Si no responde → el servidor no está corriendo o la URL es incorrecta

### ERROR: "Rol de desarrollador insuficiente" al conectar cuenta de Instagram

**Causa:** la cuenta de Instagram que se intenta conectar no tiene rol en la app.

**Solución:**
1. Meta for Developers → app → **Roles** → **Evaluadores de Instagram**
2. Agregar el @usuario
3. Aceptar desde la app de Instagram

### ERROR: Bot no responde DMs reales de Instagram (nada en los logs)

**Causa 1:** la app está en modo desarrollo y el remitente no es evaluador.
**Solución:** agregar al remitente como evaluador O pasar la app a modo Live.

**Causa 2:** falta el producto **Webhooks** separado.
**Solución:** agregar el producto Webhooks a la app y configurar la suscripción
a Instagram + campo `messages` (ver sección 6.5).

**Causa 3:** falta el API call de suscripción de la cuenta.
**Solución:** ejecutar el curl de `/subscribed_apps` (ver sección 6.6).

**Causa 4:** la cuenta de Instagram no tiene habilitado el acceso a mensajes.
**Solución:** activar en Instagram app → Mensajes → Herramientas conectadas
→ "Permitir acceso a los mensajes".

**Diagnóstico:** revisar Railway HTTP Logs (no Deploy Logs). Si llega un
POST a `/webhook/instagram` pero nada aparece en Deploy Logs → el payload
tiene una estructura inesperada. Si no llega ningún POST → Meta no está
enviando el evento (problema de configuración).

### ERROR: 401 "Invalid OAuth access token - Cannot parse access token"

**Causa:** el `INSTAGRAM_TOKEN` en Railway es incorrecto, expiró o se copió mal.

**Solución:**
1. Meta for Developers → Casos de uso → API de Instagram → Generar tokens
2. Regenerar el token para la cuenta
3. Actualizar `INSTAGRAM_TOKEN` en Railway → redeploy automático

**Causa alternativa:** el código estaba usando `graph.facebook.com` en lugar
de `graph.instagram.com`. La nueva API de Instagram requiere el endpoint nuevo.

### ERROR: 400 "De gevraagde gebruiker kan niet worden gevonden" / "No se puede encontrar al usuario"

**Causa:** se está intentando enviar un mensaje a un ID de usuario que no existe.

**En el botón de prueba del dashboard:** normal — Meta usa IDs ficticios
(`12334`, `23245`). No es un error real.

**En DMs reales:** el `INSTAGRAM_PAGE_ID` podría ser incorrecto.
Verificar con:
```bash
curl "https://graph.instagram.com/v21.0/me?fields=id,username&access_token=TOKEN"
```
El `id` que devuelve es el correcto para `INSTAGRAM_PAGE_ID`.

### ERROR: 529 "Overloaded" de Anthropic

**Causa:** los servidores de Claude tienen alta demanda en ese momento.
No es un bug del bot.

**Solución a corto plazo:** esperar unos minutos y reintentar.

**Solución definitiva:** el plan gratuito de Anthropic tiene límites de
rate muy bajos. Cargar créditos o activar un plan pago en
`console.anthropic.com` aumenta considerablemente el límite de requests
por minuto.

### ERROR: Deploy Logs muestran el evento pero el bot no responde

**Causa:** el código estaba procesando solo un formato de payload y Meta
cambió el formato según cómo se configuró el webhook.

**Contexto:** existen dos formatos de payload para Instagram:
- `entry[].messaging[]` → Webhooks product (DMs reales)
- `entry[].changes[].value` → Casos de uso / botón de prueba

El código final maneja ambos. Si esto vuelve a fallar, agregar este log
temporalmente al inicio del handler para ver qué llega:
```javascript
console.log('[Instagram] RAW payload:', JSON.stringify(req.body));
```

---

## 9. CHECKLIST PARA REPLICAR EN OTRA CUENTA

### WhatsApp (nueva cuenta o número)

- [ ] Crear app en Meta for Developers (tipo Business)
- [ ] Agregar producto WhatsApp
- [ ] Obtener token de acceso y Phone Number ID → `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`
- [ ] Definir `WHATSAPP_VERIFY_TOKEN` (string inventado)
- [ ] **Obtener App Secret** → Meta for Developers → Configuración → Básico → App Secret → `META_APP_SECRET`
- [ ] Configurar variables en Railway (incluir `META_APP_SECRET`)
- [ ] Configurar webhook en Meta: `https://DOMINIO/webhook/whatsapp` + verify token
- [ ] Suscribirse al campo `messages`
- [ ] Agregar número de prueba en el sandbox
- [ ] Verificar con GET manual al webhook
- [ ] Probar envío de mensaje desde teléfono

### Instagram (nueva cuenta Business)

- [ ] Verificar que la cuenta sea Business o Creator (no personal)
- [ ] Verificar que tenga Página de Facebook vinculada
- [ ] Crear app en Meta for Developers (puede ser la misma app de WhatsApp)
- [ ] Agregar producto Instagram via Casos de uso → API de Instagram
- [ ] Agregar cuenta de Instagram → generar token → `INSTAGRAM_TOKEN`
- [ ] Obtener IG User ID con el curl `/me` → `INSTAGRAM_PAGE_ID`
- [ ] Definir `INSTAGRAM_VERIFY_TOKEN` (string inventado)
- [ ] **Obtener App Secret** → Meta for Developers → Configuración → Básico → App Secret → `META_APP_SECRET` (es la misma app, mismo secret)
- [ ] Configurar variables en Railway (incluir `META_APP_SECRET`)
- [ ] Configurar webhook en Paso 3 de Casos de uso (para el botón de prueba)
- [ ] **Agregar producto Webhooks** separado → configurar Instagram → suscribir campo `messages`
- [ ] Ejecutar curl de `/subscribed_apps` con el IG User ID y el token
- [ ] Activar "Permitir acceso a mensajes" en Instagram app → Mensajes → Herramientas conectadas
- [ ] Para modo producción: agregar URL de política de privacidad y pasar app a Live
- [ ] Agregar cuenta de prueba como evaluador (modo desarrollo)
- [ ] Verificar con GET manual al webhook de Instagram
- [ ] Probar DM real y confirmar que llega a los logs de Railway

---

## 10. VARIABLES DE ENTORNO COMPLETAS

```env
PORT=3000

# Anthropic (Claude AI)
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxxxxxx

# Tokko Broker CRM
TOKKO_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxx
TOKKO_BRANCH_ID=10928

# WhatsApp Cloud API
WHATSAPP_TOKEN=EAABxxxxxxxxxxxx         # Token de acceso de Meta (se renueva)
WHATSAPP_VERIFY_TOKEN=miTokenSecreto    # Inventado, tiene que coincidir con Meta
WHATSAPP_PHONE_ID=123456789012345       # Phone Number ID del dashboard de Meta

# Instagram Graph API
INSTAGRAM_TOKEN=IGAABxxxxxxxxxxxx       # Token generado en Casos de uso > API de Instagram
INSTAGRAM_VERIFY_TOKEN=igTokenSecreto  # Inventado, tiene que coincidir con Meta
INSTAGRAM_PAGE_ID=25701990379503959     # IG User ID (verificar con /me endpoint)

# Seguridad — firma de webhooks (OBLIGATORIO en producción)
META_APP_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx  # Meta for Developers → Configuración → Básico → App Secret

# Notificaciones de escalado
NOTIFY_EMAIL=contacto@agencia.com
```

---

## 11. SEGURIDAD

### 11.1 Verificación de firma de webhooks (META_APP_SECRET)

Meta firma cada POST de webhook con HMAC-SHA256 usando el **App Secret** de la app.
El servidor verifica esa firma antes de procesar cualquier evento. Sin esta verificación,
cualquiera que descubra la URL del webhook podría enviar eventos falsos y hacer que
el bot responda a usuarios reales con mensajes inventados.

**Cómo funciona:**

1. Meta incluye en cada POST el header `X-Hub-Signature-256: sha256=<hash>`
2. El servidor recalcula el hash con `HMAC-SHA256(raw_body, META_APP_SECRET)`
3. Si no coinciden → `403`, el evento se descarta
4. La comparación usa `crypto.timingSafeEqual` para evitar ataques de timing

**Dónde obtener el App Secret:**

Meta for Developers → seleccionar la app → **Configuración** → **Básico** →
campo **App Secret** → click en "Mostrar" → copiar el valor.

Guardarlo en Railway como `META_APP_SECRET`.

**Comportamiento si la variable no está configurada:**

Si `META_APP_SECRET` no está definida en Railway, la verificación se omite
(el servidor acepta todos los webhooks). Esto permite el desarrollo local sin
tener que replicar las firmas, pero **en producción siempre debe estar configurada**.

**Cómo obtener el raw body para la verificación:**

El middleware `express.json()` en `src/index.js` está configurado con la opción
`verify` para capturar el body crudo antes de parsearlo como JSON:
```javascript
app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } }));
```
Sin esto, Express descartaría el buffer y la verificación HMAC sería imposible.

### 11.2 Aislamiento de sesiones del chat web

El endpoint `POST /chat` (usado por el frontend de demo) acepta un `userId`
del cliente. Para evitar que un usuario malicioso pase el número de teléfono
de un cliente real y acceda o sobreescriba su historial de conversación,
el servidor sanitiza y namespaca el ID:

- Se acepta solo `[a-zA-Z0-9_-]` (máximo 64 caracteres)
- Se antepone el prefijo `web-` automáticamente

Así `userId: "5491134567890"` se convierte en `web-5491134567890`, que nunca
colisiona con el ID de WhatsApp `"5491134567890"`.

### 11.3 Errores internos no expuestos al cliente

Los endpoints HTTP devuelven siempre `"Error interno del servidor"` en respuestas
500, nunca el `error.message` real. El mensaje de error completo se loggea en
los Deploy Logs de Railway para diagnóstico.

### 11.4 Límite de memoria en el state manager

El estado de conversaciones se guarda en memoria (Map). Para evitar que
creación masiva de sesiones agote la RAM del servidor:

- **Límite:** 10.000 conversaciones activas simultáneas
- **TTL:** las sesiones sin actividad por más de 24 horas se eliminan
- **Limpieza:** se ejecuta automáticamente cada 1 hora y también cuando
  se intenta agregar una sesión nueva con el Map al límite

---

## NOTAS FINALES

### Tokens y expiración
- Token de WhatsApp temporal: expira en ~24hs
- Token de Instagram: puede expirar — si el bot empieza a responder con
  errores 401, regenerar el token en Meta y actualizar Railway
- Para producción real: usar System User Token (no expira) via Meta Business Manager

### Logs de Railway
- **HTTP Logs:** muestra si los requests de Meta llegan al servidor (nivel de red)
- **Deploy Logs:** muestra los `console.log` del código (nivel de aplicación)
- Siempre revisar HTTP Logs primero para saber si Meta está enviando eventos,
  y luego Deploy Logs para ver qué hace el código con esos eventos

### Endpoint de diagnóstico
El servidor tiene endpoints de desarrollo (solo activos si `NODE_ENV !== 'production'`):
```
GET  /dev/tokko/search     → probar búsqueda de propiedades
GET  /dev/tokko/location   → resolver texto de zona a ID
POST /dev/tokko/cache/clear → limpiar cache de propiedades
POST /dev/chat             → simular conversación sin WhatsApp/Instagram
```

### Deduplicación de mensajes
Meta puede enviar el mismo mensaje dos veces (especialmente con Instagram).
El código en `messageController.js` mantiene un `Set` de IDs procesados y
descarta duplicados automáticamente.
```

