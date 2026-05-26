# Conexión Instagram — División de tareas Dev / CM

**Contexto:** el desarrollador (Agustín) no tiene acceso a la cuenta de Instagram
de la agencia. Esta guía divide exactamente qué hace cada uno y en qué orden.

---

## ORDEN GENERAL

```
1. Dev crea la app en Meta y agrega a la CM como evaluadora
2. CM acepta la invitación (desde su celular)
3. CM genera el token de acceso y se lo pasa al Dev
4. CM activa el permiso de mensajes (desde su celular)
5. Dev configura Railway y los webhooks
6. Dev hace la suscripción final y prueba
```

---

## PARTE 1 — LO QUE HACE LA CM (sin tecnicismos)

> Necesitás unos 10 minutos. Solo vas a necesitar tu celular con Instagram
> y una computadora para un par de pasos.

### PASO 1 — Aceptar la invitación de evaluadora (desde el celular)

El desarrollador te va a mandar una invitación a tu cuenta de Instagram.
Para aceptarla:

1. Abrí Instagram en el celular
2. Entrá a **Configuración** (el ícono de tuerca o las tres rayitas arriba a la derecha)
3. Buscá **Seguridad** → **Apps y sitios web**
4. Ahí vas a ver una sección que dice **"Evaluador"** o **"Tester"**
5. Aceptá la invitación que aparece ahí

> ⚠️ Si no ves la sección, esperá unos minutos desde que el dev te manda
> la invitación y volvé a entrar.

---

### PASO 2 — Generar el token de acceso (desde la computadora, una sola vez)

Este paso es el más importante. Vas a entrar a una página de Meta y vas a
autorizar que la app del bot pueda recibir tus mensajes de Instagram.

El desarrollador te va a mandar **un link directo** a la página correcta.
Al entrar vas a ver algo así:

1. Entrá al link que te manda el dev
2. Si te pide iniciar sesión → entrá con tu **cuenta de Facebook** (la que
   está vinculada al Instagram de la agencia)
3. Buscá el botón **"Agregar cuenta de Instagram"** o **"Generar token"**
4. Seleccioná la cuenta de Instagram de la agencia
5. Aparece un token (texto largo que empieza con `IGAAB...` o `EAA...`)
6. **Copiá ese token completo y mandáselo al dev** (por WhatsApp o donde
   acuerden, es privado — no lo publiques en ningún lado)

> 💡 El link que te manda el dev va a ser algo como:
> `https://developers.facebook.com/apps/[ID-DE-LA-APP]/instagram/`

---

### PASO 3 — Activar el permiso de mensajes (desde el celular)

Esto permite que la app del bot pueda leer y responder los DMs:

1. Abrí Instagram en el celular
2. Entrá a **Configuración**
3. Buscá **Privacidad** → **Mensajes**
4. Buscá la opción **"Solicitudes de mensajes"** o **"Herramientas conectadas"**
5. Activá la opción **"Permitir acceso a los mensajes"**

> Si no encontrás esa opción en ese lugar, también puede estar en:
> - **Panel profesional** → Herramientas
> - **Configuración** → **Herramientas para empresas** o **Controles del creador**

---

### PASO 4 — Avisarle al dev

Una vez que hiciste los 3 pasos anteriores, avisale al dev con:
- ✅ El token copiado del Paso 2
- ✅ Confirmación de que activaste el permiso de mensajes

¡Listo, de tu lado está todo! El dev hace el resto.

---

---

## PARTE 2 — LO QUE HACE EL DEV (Agustín)

### PASO A — Crear la app en Meta for Developers

1. Ir a https://developers.facebook.com
2. **Mis apps → Crear app → tipo: Business**
3. Nombre: `tokkoBot` (o el del proyecto)
4. Guardar el **APP_ID** y el **APP_SECRET**:
   - APP_SECRET: Configuración → Básico → App Secret → "Mostrar"

---

### PASO B — Agregar el producto Instagram

1. En el dashboard de la app → **Casos de uso → Personalizar**
2. **API de Instagram → Configurar**

---

### PASO C — Agregar a la CM como evaluadora de Instagram

1. En el dashboard → **Roles → Evaluadores de Instagram**
2. Click en **Agregar** → ingresar el `@usuario` de Instagram de la CM
3. Mandarle aviso a la CM para que **acepte la invitación** (Paso 1 de la CM)

---

### PASO D — Mandarle el link a la CM para generar el token

Una vez que la CM aceptó la invitación:

1. Ir a: **Casos de uso → API de Instagram → Paso 2 (Generar tokens)**
2. Copiar la URL de esa página y mandársela a la CM
3. Esperar que la CM genere el token y te lo mande

Cuando llegue el token:
```bash
# Verificar que el token es válido y obtener el IG User ID
curl "https://graph.instagram.com/v21.0/me?fields=id,username&access_token=TOKEN_QUE_MANDO_LA_CM"
```
El `id` que devuelve → `INSTAGRAM_PAGE_ID`

---

### PASO E — Configurar variables en Railway

En Railway → proyecto → servicio → pestaña **Variables**, agregar:

```
INSTAGRAM_TOKEN=       # El token que mandó la CM
INSTAGRAM_PAGE_ID=     # El id obtenido con el curl de arriba
INSTAGRAM_VERIFY_TOKEN=igTokenSecreto123  # Inventalo vos, cualquier string
META_APP_SECRET=       # El App Secret de la app (Configuración → Básico)
```

Railway redespliega automáticamente al guardar.

---

### PASO F — Configurar los webhooks en Meta (dos lugares)

#### F1 — Webhook en Casos de uso (para el botón de prueba del dashboard)

En **Casos de uso → API de Instagram → Paso 3**:
- URL: `https://tokko-bot-production.up.railway.app/webhook/instagram`
- Token de verificación: el mismo string que pusiste en `INSTAGRAM_VERIFY_TOKEN`
- Click en **Verificar y guardar**

#### F2 — Producto Webhooks separado (para DMs reales — CRÍTICO)

1. App → **Agregar producto → Webhooks → Configurar**
2. En el dropdown, seleccionar **Instagram**
3. Click en **Suscribirse a este objeto**
4. Misma URL y mismo token que arriba
5. Verificar y guardar
6. Suscribirse al campo **`messages`**

> ⚠️ Sin este paso F2, los DMs reales NO llegan al webhook.
> El botón de prueba del dashboard sí funciona igual, lo que confunde.

---

### PASO G — Suscribir la cuenta de Instagram al webhook (API call)

```bash
curl -X POST "https://graph.instagram.com/v21.0/INSTAGRAM_PAGE_ID/subscribed_apps?subscribed_fields=messages&access_token=INSTAGRAM_TOKEN"
```

Tiene que responder `{"success": true}`.

Verificar que quedó bien:
```bash
curl "https://graph.instagram.com/v21.0/INSTAGRAM_PAGE_ID/subscribed_apps?access_token=INSTAGRAM_TOKEN"
```
Debe mostrar `{"data":[{"id":"APP_ID","subscribed_fields":["messages"]}]}`.

---

### PASO H — Verificar que el webhook funciona

Desde el navegador:
```
https://tokko-bot-production.up.railway.app/webhook/instagram?hub.mode=subscribe&hub.verify_token=igTokenSecreto123&hub.challenge=test123
```
- Si responde `test123` → ✅ servidor OK
- Si responde `403` → el `INSTAGRAM_VERIFY_TOKEN` en Railway no coincide con el que pusiste en Meta

---

### PASO I — Probar con DM real (modo desarrollo)

En modo desarrollo (antes de pasar a Live), los DMs solo llegan si el remitente
es evaluador de la app. Para probar:

1. Agregar tu cuenta de Instagram personal como evaluador
   (Roles → Evaluadores de Instagram → agregar tu @usuario)
2. Aceptar la invitación desde tu Instagram
3. Mandarle un DM a la cuenta de la agencia desde tu Instagram personal
4. Verificar en Railway → **Deploy Logs** que aparezca el evento y la respuesta

---

### Para pasar a producción (cualquier usuario puede escribir)

1. Agregar una URL de política de privacidad:
   - Crear `src/public/privacy.html` con texto básico sobre qué datos usa el bot
   - URL: `https://tokko-bot-production.up.railway.app/privacy.html`
2. En Meta for Developers: Configuración → Básico → agregar la URL de privacidad
3. Cambiar el toggle **"En desarrollo" → "Activo (Live)"**

---

## RESUMEN DE LO QUE NECESITÁS DE LA CM

| # | Qué necesitás | Cómo te lo da |
|---|---------------|---------------|
| 1 | Que acepte la invitación de evaluadora | Ella lo hace desde su Instagram |
| 2 | **El token de acceso** | Ella lo copia del dashboard y te lo manda |
| 3 | Que active "Permitir acceso a mensajes" | Ella lo hace desde su Instagram |

Todo lo demás (Railway, webhooks, API calls) lo hacés vos.
