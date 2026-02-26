// Almacenamiento en memoria — suficiente para desarrollo.
// Para producción: migrar a Redis con el mismo contrato de funciones.
const conversaciones = new Map();

/**
 * Estado inicial para un usuario que escribe por primera vez.
 */
function createInitialState() {
  return {
    fase: 'bienvenida',       // bienvenida | buscando | mostrando_resultados | escalando
    filtros: {},              // parámetros de búsqueda acumulados (tipo, zona, precio, etc.)
    ultimasPropiedades: [],   // últimas propiedades mostradas (para poder referenciarlas)
    contacto: {},             // nombre y teléfono si el usuario ya los dio
    historial: [],            // mensajes en formato Anthropic [{role, content}] para la IA
    creadoEn: new Date().toISOString(),
    ultimaActividad: new Date().toISOString(),
  };
}

/**
 * Retorna el estado actual de un usuario.
 * Si no existe, devuelve un estado inicial (sin guardarlo).
 */
function getState(userId) {
  return conversaciones.get(userId) ?? createInitialState();
}

/**
 * Guarda (o reemplaza) el estado completo de un usuario.
 */
function setState(userId, state) {
  state.ultimaActividad = new Date().toISOString();
  conversaciones.set(userId, state);
}

/**
 * Actualiza parcialmente el estado (merge superficial de un nivel).
 * Retorna el estado actualizado.
 */
function updateState(userId, updates) {
  const current = getState(userId);
  const updated = { ...current, ...updates, ultimaActividad: new Date().toISOString() };
  conversaciones.set(userId, updated);
  return updated;
}

/**
 * Elimina el estado de una conversación (reinicio).
 */
function clearState(userId) {
  conversaciones.delete(userId);
}

module.exports = { getState, setState, updateState, clearState };
