const axios = require('axios');

const BASE_URL = 'https://www.tokkobroker.com/api/v1';

// ─── Mapeo de tipos de operación ─────────────────────────────────────────────
// Confirmados contra la API real (campo operations[].operation_id)
const OPERATION_IDS = {
  venta:      1,
  alquiler:   2,
  temporario: 3,
};

// ─── Mapeo de tipos de propiedad ─────────────────────────────────────────────
// Confirmados contra la API real (campo type.id)
const PROPERTY_TYPE_IDS = {
  terreno:             1,
  departamento:        2,
  casa:                3,
  'fin de semana':     4,
  oficina:             5,
  local:               7,
  'edificio comercial':8,
  campo:               9,
  garage:              10,
  hotel:               11,
  'nave industrial':   12,
  ph:                  13,
  deposito:            14,
  galpon:              24,
};

// ─── Cache en memoria ────────────────────────────────────────────────────────
// Evita llamadas repetidas a Tokko en cada mensaje.
// TTL: 5 minutos — suficiente para propiedades que cambian poco.
const cache = {
  data:        null,
  fetchedAt:   null,
  TTL_MS:      5 * 60 * 1000,

  isValid() {
    return this.data !== null && (Date.now() - this.fetchedAt) < this.TTL_MS;
  },

  set(data) {
    this.data      = data;
    this.fetchedAt = Date.now();
  },

  invalidate() {
    this.data = null;
  },
};

// ─── Fetch de todas las propiedades ──────────────────────────────────────────

/**
 * Trae todas las propiedades activas de la cuenta.
 * Usa cache de 5 minutos para evitar llamadas innecesarias.
 *
 * @returns {Promise<object[]>} Array de propiedades en formato crudo de Tokko
 */
async function fetchAllProperties() {
  if (cache.isValid()) {
    console.log('[Tokko] Usando cache de propiedades');
    return cache.data;
  }

  const params = new URLSearchParams({
    key:    process.env.TOKKO_API_KEY,
    format: 'json',
    lang:   'es_ar',
    limit:  500,   // suficiente para cualquier inmobiliaria chica/mediana
    offset: 0,
  }).toString();

  const url = `${BASE_URL}/property/?${params}`;
  console.log('[Tokko] Fetching propiedades desde API...');

  try {
    const { data } = await axios.get(url, { timeout: 20000 });
    const propiedades = data.objects || [];
    cache.set(propiedades);
    console.log(`[Tokko] ${propiedades.length} propiedades cargadas en cache`);
    return propiedades;
  } catch (error) {
    console.error('[Tokko] Error al traer propiedades:', error.response?.data ?? error.message);
    throw new Error('No pude conectarme con el sistema de propiedades. Intentá en un momento.');
  }
}

// ─── Quicksearch de ubicaciones ──────────────────────────────────────────────

/**
 * Resuelve un texto de zona/barrio al ID de Tokko.
 * Ej: "Palermo" → { id: 24728, nombre: "Argentina | Capital Federal | Palermo" }
 *
 * @param {string} query
 * @returns {Promise<{id: number, nombre: string}|null>}
 */
async function findLocationId(query) {
  if (!query) return null;

  const params = new URLSearchParams({
    key:    process.env.TOKKO_API_KEY,
    format: 'json',
    q:      query,
  }).toString();

  try {
    const { data } = await axios.get(`${BASE_URL}/location/quicksearch/?${params}`, { timeout: 8000 });
    const locations = Array.isArray(data) ? data : (data.objects || []);

    if (locations.length === 0) {
      console.log(`[Tokko] Sin resultados de ubicación para: "${query}"`);
      return null;
    }

    const loc = locations[0];
    console.log(`[Tokko] Ubicación resuelta: "${query}" → id=${loc.id} (${loc.full_location || loc.name})`);
    return { id: loc.id, nombre: loc.full_location || loc.name };

  } catch (error) {
    console.error('[Tokko] Error en quicksearch:', error.response?.data ?? error.message);
    return null; // No interrumpir el flujo si falla
  }
}

// ─── Filtrado en memoria ──────────────────────────────────────────────────────

/**
 * Filtra el array de propiedades según los criterios del usuario.
 *
 * @param {object[]} propiedades - Array crudo de la API
 * @param {object}   filters
 * @returns {object[]}
 */
function applyFilters(propiedades, filters) {
  return propiedades.filter(p => {
    // Operación (venta / alquiler / temporario)
    if (filters.operation_type !== undefined) {
      const tieneOp = (p.operations || []).some(op => op.operation_id === filters.operation_type);
      if (!tieneOp) return false;
    }

    // Tipo de propiedad (departamento, casa, ph, etc.)
    if (filters.property_type !== undefined) {
      if (p.type?.id !== filters.property_type) return false;
    }

    // Ambientes (mínimo)
    if (filters.rooms !== undefined) {
      if ((p.room_amount ?? 0) < filters.rooms) return false;
    }

    // Ambientes (exacto — activar si el usuario pide "3 ambientes exactos")
    if (filters.rooms_exact !== undefined) {
      if (p.room_amount !== filters.rooms_exact) return false;
    }

    // Precio máximo
    if (filters.price_to !== undefined) {
      const moneda = filters.currency || 'USD';
      const tieneRango = (p.operations || []).some(op =>
        (op.prices || []).some(pr =>
          pr.currency === moneda && pr.price <= filters.price_to
        )
      );
      if (!tieneRango) return false;
    }

    // Precio mínimo
    if (filters.price_from !== undefined) {
      const moneda = filters.currency || 'USD';
      const tieneRango = (p.operations || []).some(op =>
        (op.prices || []).some(pr =>
          pr.currency === moneda && pr.price >= filters.price_from
        )
      );
      if (!tieneRango) return false;
    }

    // Zona / barrio por ID
    if (filters.location_id !== undefined) {
      const locMatch =
        p.location?.id === filters.location_id ||
        (p.location?.divisions || []).some(d => d.id === filters.location_id);
      if (!locMatch) return false;
    }

    return true;
  });
}

// ─── Función principal pública ────────────────────────────────────────────────

/**
 * Busca propiedades según los filtros del usuario.
 * Trae el catálogo completo (con cache) y filtra en memoria.
 *
 * @param {object}  filters
 * @param {number}  [filters.operation_type]   - 1=Venta, 2=Alquiler, 3=Temporario
 * @param {number}  [filters.property_type]    - ID de tipo (ver PROPERTY_TYPE_IDS)
 * @param {number}  [filters.rooms]            - Ambientes mínimos
 * @param {number}  [filters.price_from]
 * @param {number}  [filters.price_to]
 * @param {string}  [filters.currency]         - 'USD' | 'ARS'
 * @param {string}  [filters.location]         - Texto libre de zona (se resuelve a ID)
 * @param {number}  [filters.location_id]      - ID directo (si ya fue resuelto)
 * @param {number}  [filters.limit]            - Resultados a devolver (default 3)
 * @param {number}  [filters.offset]           - Para paginación (default 0)
 *
 * @returns {Promise<{propiedades: object[], total: number}>}
 */
async function searchProperties(filters = {}) {
  // Resolver zona por texto si no tenemos ID
  let locationId = filters.location_id;
  if (!locationId && filters.location) {
    const loc = await findLocationId(filters.location);
    if (loc) locationId = loc.id;
  }

  const filtersConLoc = locationId
    ? { ...filters, location_id: locationId }
    : filters;

  const todas     = await fetchAllProperties();
  const filtradas = applyFilters(todas, filtersConLoc);
  const total     = filtradas.length;
  const limit     = filters.limit  ?? 3;
  const offset    = filters.offset ?? 0;

  const pagina = filtradas
    .slice(offset, offset + limit)
    .map(normalizeProperty);

  console.log(`[Tokko] Filtrado: ${total} coincidencias, devolviendo ${pagina.length}`);
  return { propiedades: pagina, total };
}

// ─── Normalización ────────────────────────────────────────────────────────────

/**
 * Convierte el objeto crudo de Tokko al formato limpio que usa el bot.
 * Nombres de campo confirmados contra la API real.
 *
 * @param {object} p - Propiedad cruda
 * @returns {object}
 */
function normalizeProperty(p) {
  // Tomar la primera operación (puede haber venta + alquiler en la misma ficha)
  const operacion = p.operations?.[0] ?? {};
  const precio    = operacion.prices?.[0] ?? {};

  return {
    id:                 p.id,
    titulo:             p.publication_title || 'Propiedad disponible',
    tipo:               p.type?.name        || '',
    tipoId:             p.type?.id          ?? null,
    operacion:          operacion.operation_type || '',
    operacionId:        operacion.operation_id   ?? null,
    precio:             precio.price    ?? null,
    moneda:             precio.currency ?? '',
    ambientes:          p.room_amount        ?? null,
    banos:              p.bathroom_amount    ?? null,
    cocheras:           p.parking_lot_amount ?? null,
    superficieCubierta: p.roofed_surface     ?? null,
    superficieTotal:    p.total_surface      ?? null,
    direccion:          p.address            || '',
    zona:               p.location?.name     || '',
    zonaCompleta:       p.location?.full_location || '',
    descripcion:        (p.description || '').slice(0, 400),
    fotoPrincipal:      p.photos?.[0]?.image  || null,
    urlFicha:           p.public_url          || '',
  };
}

// ─── Utilidades exportadas ────────────────────────────────────────────────────

/**
 * Mapea un texto de tipo de propiedad al ID numérico de Tokko.
 * Ej: "departamento" → 2
 */
function resolvePropertyTypeId(texto) {
  if (!texto) return null;
  return PROPERTY_TYPE_IDS[texto.toLowerCase().trim()] ?? null;
}

/**
 * Mapea un texto de operación al ID numérico de Tokko.
 * Ej: "alquiler" → 2
 */
function resolveOperationId(texto) {
  if (!texto) return null;
  return OPERATION_IDS[texto.toLowerCase().trim()] ?? null;
}

/** Limpia el cache (útil si el cliente sube propiedades nuevas) */
function invalidateCache() {
  cache.invalidate();
  console.log('[Tokko] Cache invalidado');
}

module.exports = {
  searchProperties,
  findLocationId,
  normalizeProperty,
  resolvePropertyTypeId,
  resolveOperationId,
  invalidateCache,
  OPERATION_IDS,
  PROPERTY_TYPE_IDS,
};
