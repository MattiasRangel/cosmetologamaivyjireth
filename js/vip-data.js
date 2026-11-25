// Datos de las tarjetas VIP

const TABLA = "tarjetas_vip";
const TOTAL_VISITAS_CICLO = 10;
const VISITA_DESCUENTO = 5; // en esta visita se desbloquea el 50%
const VISITA_OBSEQUIO = 10;

function supabase() {
  const cliente = window.supabaseClient;
  if (!cliente) {
    throw new Error("window.supabaseClient no existe todavía — revisa el orden de tus <script>.");
  }
  return cliente;
}

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
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const parte = Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `MJVIP-${parte}`;
}

const toISODate = (date) => date.toISOString().slice(0, 10);
const addDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

function avisarCambio() {
  window.dispatchEvent(new CustomEvent("mj:vip-tarjetas-cambiaron"));
}


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

export async function getVipCardById(id) {
  const { data, error } = await supabase().from(TABLA).select("*").eq("id", id).maybeSingle();
  if (error) {
    console.error("[vip-data.js] Error obteniendo tarjeta VIP por id:", error);
    return null;
  }
  return mapearFila(data);
}

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

export async function deleteVipCard(id) {
  const { error } = await supabase().from(TABLA).delete().eq("id", id);
  if (error) {
    console.error("[vip-data.js] Error eliminando tarjeta VIP:", error);
    throw error;
  }
  avisarCambio();
}

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

export const VIP_CONFIG = {
  TOTAL_VISITAS_CICLO,
  VISITA_DESCUENTO,
  VISITA_OBSEQUIO,
};