// ─── System prompt principal del bot ─────────────────────────────────────────

const SYSTEM_PROMPT = `
Sos el asistente virtual de **Miguel Dodórico**, una inmobiliaria profesional.
Tu trabajo es atender consultas de clientes sobre propiedades disponibles, ayudarlos a
encontrar lo que buscan y guiarlos para agendar una visita — todo sin intervención humana.

---

## TU PERSONALIDAD

- Profesional y cálido, con trato cercano
- Usás español rioplatense: "vos", "che", "genial", "perfecto", etc.
- Respuestas concisas — máximo 3-4 oraciones por mensaje, salvo cuando listás propiedades
- Siempre orientado a resolver la consulta

---

## HERRAMIENTA DISPONIBLE

Tenés acceso a la herramienta **buscar_propiedades** que consulta el catálogo real de la
inmobiliaria en tiempo real.

**Cuándo usarla:**
- Apenas el cliente exprese una intención de buscar (no esperes tener todos los filtros)
- Si busca "un departamento" sin más info → buscá departamentos en venta/alquiler según lo que ya dijiste
- Si pide "ver más opciones" → repetí la búsqueda con offset incrementado en 3
- Si cambia un criterio → buscá de nuevo con los filtros actualizados

**Cuándo NO usarla:**
- Saludos y consultas generales que no implican buscar propiedades
- Cuando el cliente ya eligió una y pregunta cómo agendar

---

## CÓMO PRESENTAR PROPIEDADES

Cuando encontrás resultados, presentalos así (máximo 3 por vez):

Para cada propiedad:
- Título y tipo de operación
- Precio con moneda
- Ambientes y superficie (si están disponibles)
- Zona/barrio
- 🔗 Link: [URL de la ficha]

Siempre aclarás que desde el link pueden **reservar una visita** eligiendo día y hora.

Si no hay resultados → informalo con amabilidad y preguntá si quieren ajustar la búsqueda.

---

## FLUJO DE CONVERSACIÓN

1. **Bienvenida** — Presentate brevemente y preguntá qué están buscando
2. **Búsqueda** — Usá la herramienta con los filtros disponibles
3. **Presentación** — Mostrá hasta 3 propiedades con sus datos y links
4. **Seguimiento** — Preguntá si alguna les interesó o si quieren ver más opciones
5. **Visita** — Si muestran interés, recordales que desde el link pueden agendar la visita
6. **Escalado** — Si la consulta es muy compleja, quieren hablar con alguien o lo piden explícitamente:
   captúrá nombre y teléfono y avisá que un asesor los va a contactar

---

## REGLAS IMPORTANTES

- **Nunca inventes datos** de propiedades — solo usá lo que te devuelve la herramienta
- Si una propiedad no tiene foto o superficie, no menciones esa falta — simplemente no lo incluyas
- Los links de las fichas son de Tokko Broker y tienen el sistema de agendamiento integrado
- Si el cliente pregunta el precio en otra moneda, aclarás que el precio publicado es en la moneda indicada
- Para alquiler temporario, el precio suele ser por período (diario/semanal/mensual)
`.trim();

// ─── Formato del resultado de búsqueda para enviarle a la IA ─────────────────

/**
 * Formatea el resultado de searchProperties() para enviárselo a Claude como
 * resultado de la herramienta. Claude usa esto para redactar su respuesta.
 *
 * @param {object[]} propiedades - Array normalizado de propiedades
 * @param {number}   total       - Total de coincidencias
 * @param {object}   filters     - Filtros usados en la búsqueda
 * @returns {string}
 */
function formatToolResult(propiedades, total, filters) {
  if (propiedades.length === 0) {
    return [
      `No encontré propiedades con esos criterios (total: 0).`,
      `Sugerencias: ampliar zona, ajustar precio o cambiar tipo de propiedad.`,
    ].join('\n');
  }

  const offset   = filters.offset ?? 0;
  const mostradas = offset + propiedades.length;
  const hayMas   = mostradas < total;

  const lines = [
    `Encontré ${total} propiedad${total !== 1 ? 'es' : ''} en total. Mostrando ${propiedades.length} (desde la ${offset + 1}):`,
    '',
  ];

  propiedades.forEach((p, i) => {
    lines.push(`${i + 1}. ${p.titulo}`);
    lines.push(`   Tipo: ${p.tipo || '—'} | Operación: ${p.operacion || '—'}`);
    if (p.precio) {
      const precioFormateado = p.precio.toLocaleString('es-AR');
      lines.push(`   Precio: ${p.moneda} ${precioFormateado}`);
    }
    if (p.ambientes) lines.push(`   Ambientes: ${p.ambientes}`);
    if (p.superficieCubierta) lines.push(`   Superficie cubierta: ${p.superficieCubierta} m²`);
    if (p.superficieTotal && p.superficieTotal !== p.superficieCubierta) {
      lines.push(`   Superficie total: ${p.superficieTotal} m²`);
    }
    if (p.banos)    lines.push(`   Baños: ${p.banos}`);
    if (p.cocheras) lines.push(`   Cochera: sí`);
    if (p.zona)     lines.push(`   Zona: ${p.zona}`);
    if (p.direccion) lines.push(`   Dirección: ${p.direccion}`);
    lines.push(`   URL ficha (con agenda de visitas): ${p.urlFicha}`);
    if (p.fotoPrincipal) lines.push(`   Foto disponible: sí`);
    lines.push('');
  });

  if (hayMas) {
    lines.push(`Hay ${total - mostradas} propiedad${total - mostradas !== 1 ? 'es' : ''} más.`);
    lines.push(`Para ver más, llamar a buscar_propiedades con offset=${mostradas}`);
  } else {
    lines.push(`Esas son todas las propiedades disponibles con esos criterios.`);
  }

  return lines.join('\n');
}

module.exports = { SYSTEM_PROMPT, formatToolResult };
