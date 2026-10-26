/**
 * vip-data.js
 * -----------------------------------------------------------------------
 * Fuente de datos de las Tarjetas VIP. La comparten dos mundos distintos:
 *
 *   - El panel privado (panel-admin.html vía panel-data.js), donde la
 *     administradora crea tarjetas y va marcando las visitas.
 *   - Las páginas públicas (tarjeta-vip.html y mi-tarjeta-vip.html), donde
 *     la clienta consulta su código y ve su tarjeta.
 *
 * Ahora habla directamente con la tabla `tarjetas_vip` de Supabase. Cada
 * función conserva su firma y devuelve el MISMO objeto en camelCase
 * (numeroTarjeta, fechaCreacion, validaHasta, ciclosCompletados...) que
 * antes vivía en localStorage, para que panel-vip.js, mi-tarjeta.js y
 * tarjeta-consulta.js no necesiten ningún cambio.
 * -----------------------------------------------------------------------
 */

const TABLA = "tarjetas_vip";
const TOTAL_VISITAS_CICLO = 10;
const VISITA_DESCUENTO = 5; // en esta visita se desbloquea el 50%
const VISITA_OBSEQUIO = 10; // en esta visita se desbloquea el obsequio + tratamiento gratis

function supabase() {
  const cliente = window.supabaseClient;
  if (!cliente) {
    throw new Error("window.supabaseClient no existe todavía — revisa el orden de tus <script>.");
  }
  return cliente;
}

/** Convierte una fila de la tabla (snake_case) al objeto camelCase que usa el resto del frontend. */
function mapearFila(fila) {
  if (!fila) return null;
  return {
    id: fila.id,
    codigo: fila.codigo,
    cliente: fila.cliente,
    numeroTarjeta: fila.numero_tarjeta,
    fechaCreacion: fila.fecha_creacion,
    validaHasta: fila.valida_hasta,
    estado: fila.estado,
    visitas: fila.visitas,
    ciclosCompletados: fila.ciclos_completados,
  };
}

function generarNumeroTarjeta() {
  const grupo = () => String(Math.floor(1000 + Math.random() * 9000));
  return `${grupo()} ${grupo()} ${grupo()} ${grupo()}`;
}

function generarCodigo() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin O/0/I/1 para evitar confusiones al dictarlo
  const parte = Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `MJVIP-${parte}`;
}

const toISODate = (date) => date.toISOString().slice(0, 10);
const addDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

/** Avisa a otras partes de la MISMA pestaña que las tarjetas cambiaron (igual que antes). */
function avisarCambio() {
  window.dispatchEvent(new CustomEvent("mj:vip-tarjetas-cambiaron"));
}

/* ========================================================================
   API pública — mismas firmas de siempre
   ======================================================================== */

/** @returns {Promise<Array>} todas las tarjetas, más recientes primero */
export async function getVipCards() {
  const { data, error } = await supabase()
    .from(TABLA)
    .select("*")
    .order("fecha_creacion", { ascending: false });
  if (error) {
    console.error("[vip-data.js] Error obteniendo tarjetas VIP:", error);
    return [];
  }
  return data.map(mapearFila);
}

/**
 * @param {string} id
 * @returns {Promise<object|null>}
 */
export async function getVipCardById(id) {
  const { data, error } = await supabase().from(TABLA).select("*").eq("id", id).maybeSingle();
  if (error) {
    console.error("[vip-data.js] Error obteniendo tarjeta VIP por id:", error);
    return null;
  }
  return mapearFila(data);
}

/**
 * Búsqueda pública por código (la usa la clienta en "Consultar mi tarjeta").
 * Ni el código ni la búsqueda distinguen mayúsculas/espacios extra.
 * @param {string} codigo
 * @returns {Promise<object|null>}
 */
export async function getVipCardByCodigo(codigo) {
  const normalizado = String(codigo || "").trim().toUpperCase();
  if (!normalizado) return null;

  const { data, error } = await supabase()
    .from(TABLA)
    .select("*")
    .ilike("codigo", normalizado)
    .maybeSingle();
  if (error) {
    console.error("[vip-data.js] Error buscando tarjeta VIP por código:", error);
    return null;
  }
  return mapearFila(data);
}

/**
 * @param {{cliente:string}} data
 * @returns {Promise<object>}
 */
export async function createVipCard(data) {
  const hoy = new Date();
  const nueva = {
    codigo: generarCodigo(),
    cliente: data.cliente,
    numero_tarjeta: generarNumeroTarjeta(),
    fecha_creacion: toISODate(hoy),
    valida_hasta: toISODate(addDays(hoy, 365)),
    estado: "activa",
    visitas: 0,
    ciclos_completados: 0,
  };

  // El código se genera en el cliente y podría chocar por mala suerte con
  // uno ya existente (codigo es UNIQUE en la tabla); si eso pasa, se
  // reintenta una vez con un código nuevo antes de rendirse.
  let { data: fila, error } = await supabase().from(TABLA).insert(nueva).select().single();
  if (error && error.code === "23505") {
    nueva.codigo = generarCodigo();
    ({ data: fila, error } = await supabase().from(TABLA).insert(nueva).select().single());
  }
  if (error) {
    console.error("[vip-data.js] Error creando tarjeta VIP:", error);
    throw error;
  }

  avisarCambio();
  return mapearFila(fila);
}

/**
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function deleteVipCard(id) {
  const { error } = await supabase().from(TABLA).delete().eq("id", id);
  if (error) {
    console.error("[vip-data.js] Error eliminando tarjeta VIP:", error);
    throw error;
  }
  avisarCambio();
}

/**
 * @param {string} id
 * @returns {Promise<string>} nuevo estado
 */
export async function toggleVipCardStatus(id) {
  const actual = await getVipCardById(id);
  if (!actual) return null;

  const nuevoEstado = actual.estado === "activa" ? "inactiva" : "activa";
  const { error } = await supabase().from(TABLA).update({ estado: nuevoEstado }).eq("id", id);
  if (error) {
    console.error("[vip-data.js] Error cambiando el estado de la tarjeta VIP:", error);
    throw error;
  }

  avisarCambio();
  return nuevoEstado;
}

/**
 * Fija el número de visitas (0 a 10) de una tarjeta — así es como el panel
 * "pega" o "despega" los stickers de la parte trasera.
 * @param {string} id
 * @param {number} visitas
 * @returns {Promise<object|null>} la tarjeta actualizada
 */
export async function setVipCardVisitas(id, visitas) {
  const valor = Math.max(0, Math.min(TOTAL_VISITAS_CICLO, Math.round(visitas)));
  const { data, error } = await supabase()
    .from(TABLA)
    .update({ visitas: valor })
    .eq("id", id)
    .select()
    .single();
  if (error) {
    console.error("[vip-data.js] Error actualizando visitas de la tarjeta VIP:", error);
    throw error;
  }

  avisarCambio();
  return mapearFila(data);
}

/**
 * Canjea el ciclo de 10 visitas: reinicia el conteo a 0 y suma 1 al total
 * de ciclos completados. Solo tiene efecto si ya llegó a 10 visitas.
 * @param {string} id
 * @returns {Promise<object|null>} la tarjeta actualizada
 */
export async function canjearCicloVip(id) {
  const actual = await getVipCardById(id);
  if (!actual || actual.visitas < TOTAL_VISITAS_CICLO) return actual;

  const { data, error } = await supabase()
    .from(TABLA)
    .update({ visitas: 0, ciclos_completados: (actual.ciclosCompletados || 0) + 1 })
    .eq("id", id)
    .select()
    .single();
  if (error) {
    console.error("[vip-data.js] Error canjeando el ciclo de la tarjeta VIP:", error);
    throw error;
  }

  avisarCambio();
  return mapearFila(data);
}

// Constantes exportadas para que panel-vip.js y las páginas públicas nunca
// tengan que repetir estos números "a mano".
export const VIP_CONFIG = {
  TOTAL_VISITAS_CICLO,
  VISITA_DESCUENTO,
  VISITA_OBSEQUIO,
};