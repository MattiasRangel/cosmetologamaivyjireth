/**
 * panel-data.js
 * -----------------------------------------------------------------------
 * Capa de datos del panel privado. Habla directamente con Supabase
 * (tablas `citas`, `servicios`, `horarios`, `dias_bloqueados`,
 * `historias_clinicas` y Supabase Auth). panel-app.js y panel-historia.js
 * SOLO conocen estas funciones — nunca la forma real de las filas de la
 * base de datos — así que cada función mapea de snake_case (columnas) a
 * camelCase (lo que ya esperaba el resto del frontend) antes de devolver
 * cualquier cosa.
 * -----------------------------------------------------------------------
 */

function supabase() {
  const cliente = window.supabaseClient;
  if (!cliente) {
    throw new Error("window.supabaseClient no existe todavía — revisa el orden de tus <script>.");
  }
  return cliente;
}

const toISODate = (date) => date.toISOString().slice(0, 10);

const addDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

/* ========================================================================
   AUTENTICACIÓN
   ======================================================================== */

/**
 * Intenta iniciar sesión con Supabase Auth.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{ok: boolean, mensaje?: string}>}
 */
export async function login(email, password) {
  if (!email || !password) {
    return { ok: false, mensaje: "Ingresa tu correo y tu contraseña." };
  }
  const { error } = await supabase().auth.signInWithPassword({ email, password });
  if (error) return { ok: false, mensaje: error.message };
  return { ok: true };
}

/**
 * Cierra la sesión actual.
 * @returns {Promise<void>}
 */
export async function logout() {
  const { error } = await supabase().auth.signOut();
  if (error) console.error("[panel-data.js] Error cerrando sesión:", error);
}

/* ========================================================================
   KPIs
   ======================================================================== */

/**
 * @returns {Promise<{turnosHoy:number, pendientes:number, proximos7:number, servicioTop:string}>}
 */
export async function getKpis() {
  const hoyISO = toISODate(new Date());
  const en7ISO = toISODate(addDays(new Date(), 7));

  const [turnosHoyRes, pendientesRes, proximos7Res, serviciosRes] = await Promise.all([
    supabase()
      .from("citas")
      .select("id", { count: "exact", head: true })
      .eq("fecha_iso", hoyISO)
      .neq("estado", "cancelado"),
    supabase().from("citas").select("id", { count: "exact", head: true }).eq("estado", "pendiente"),
    supabase()
      .from("citas")
      .select("id", { count: "exact", head: true })
      .gte("fecha_iso", hoyISO)
      .lte("fecha_iso", en7ISO)
      .neq("estado", "cancelado"),
    supabase().from("citas").select("servicio_nombre").neq("estado", "cancelado"),
  ]);

  [turnosHoyRes, pendientesRes, proximos7Res, serviciosRes].forEach((res) => {
    if (res.error) console.error("[panel-data.js] Error calculando KPIs:", res.error);
  });

  const conteoServicios = {};
  (serviciosRes.data || []).forEach((fila) => {
    if (!fila.servicio_nombre) return;
    conteoServicios[fila.servicio_nombre] = (conteoServicios[fila.servicio_nombre] || 0) + 1;
  });
  const servicioTop = Object.entries(conteoServicios).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

  return {
    turnosHoy: turnosHoyRes.count ?? 0,
    pendientes: pendientesRes.count ?? 0,
    proximos7: proximos7Res.count ?? 0,
    servicioTop,
  };
}

/* ========================================================================
   AGENDA / CITAS
   ======================================================================== */

/** Convierte una fila de `citas` (snake_case) al objeto camelCase que ya usaba el panel. */
function mapearCita(fila) {
  return {
    id: fila.id,
    fechaISO: fila.fecha_iso,
    hora: fila.hora,
    cliente: fila.cliente,
    contacto: fila.contacto,
    servicioId: fila.servicio_id,
    servicio: fila.servicio_nombre,
    estado: fila.estado,
  };
}

/**
 * @param {{rango?: 'hoy'|'mañana'|'7dias'|'30dias', estado?: string, busqueda?: string}} filtros
 * @returns {Promise<Array>}
 */
export async function getAppointments(filtros = {}) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const hoyISO = toISODate(hoy);

  let query = supabase().from("citas").select("*");

  if (filtros.rango === "hoy") {
    query = query.eq("fecha_iso", hoyISO);
  } else if (filtros.rango === "mañana") {
    query = query.eq("fecha_iso", toISODate(addDays(hoy, 1)));
  } else if (filtros.rango === "7dias") {
    query = query.gte("fecha_iso", hoyISO).lte("fecha_iso", toISODate(addDays(hoy, 7)));
  } else if (filtros.rango === "30dias") {
    query = query.gte("fecha_iso", hoyISO).lte("fecha_iso", toISODate(addDays(hoy, 30)));
  }

  if (filtros.estado) {
    query = query.eq("estado", filtros.estado);
  }

  if (filtros.busqueda) {
    const q = filtros.busqueda.trim();
    if (q) query = query.or(`cliente.ilike.%${q}%,servicio_nombre.ilike.%${q}%`);
  }

  query = query.order("fecha_iso", { ascending: true }).order("hora", { ascending: true });

  const { data, error } = await query;
  if (error) {
    console.error("[panel-data.js] Error obteniendo citas:", error);
    return [];
  }
  return data.map(mapearCita);
}

/**
 * @param {string} id
 * @param {'pendiente'|'confirmado'|'completado'|'cancelado'} nuevoEstado
 * @returns {Promise<void>}
 */
export async function updateAppointmentStatus(id, nuevoEstado) {
  const { error } = await supabase().from("citas").update({ estado: nuevoEstado }).eq("id", id);
  if (error) {
    console.error("[panel-data.js] Error actualizando el estado de la cita:", error);
    throw error;
  }
}

/**
 * @param {string} id
 * @param {{fechaISO:string, hora:string, cliente:string, contacto:string, servicioId:string, estado:string}} cambios
 * @returns {Promise<void>}
 */
export async function updateAppointment(id, cambios) {
  const payload = {
    fecha_iso: cambios.fechaISO,
    hora: cambios.hora,
    cliente: cambios.cliente,
    contacto: cambios.contacto,
    servicio_id: cambios.servicioId,
    estado: cambios.estado,
  };

  // servicio_nombre es una "foto" histórica del nombre del servicio (ver
  // NOTA DE DISEÑO en schema.sql) — si cambia el servicio, se actualiza
  // también su nombre guardado en la cita.
  if (cambios.servicioId) {
    const { data: servicioRow, error: errorServicio } = await supabase()
      .from("servicios")
      .select("nombre")
      .eq("id", cambios.servicioId)
      .maybeSingle();
    if (errorServicio) console.error("[panel-data.js] Error buscando el nombre del servicio:", errorServicio);
    if (servicioRow) payload.servicio_nombre = servicioRow.nombre;
  }

  const { error } = await supabase().from("citas").update(payload).eq("id", id);
  if (error) {
    console.error("[panel-data.js] Error actualizando la cita:", error);
    throw error;
  }
}

/**
 * @param {string} fechaISO
 * @returns {Promise<Array>}
 */
export async function getAppointmentsByDate(fechaISO) {
  const { data, error } = await supabase()
    .from("citas")
    .select("*")
    .eq("fecha_iso", fechaISO)
    .order("hora", { ascending: true });
  if (error) {
    console.error("[panel-data.js] Error obteniendo citas del día:", error);
    return [];
  }
  return data.map(mapearCita);
}

/**
 * Conteo de citas (no canceladas) por día, para las etiquetas del
 * calendario mensual.
 * @param {number} year
 * @param {number} month 0-indexado (0 = enero)
 * @returns {Promise<Record<string, number>>}
 */
export async function getMonthAppointmentCounts(year, month) {
  const inicio = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const fin = toISODate(new Date(year, month + 1, 0));

  const { data, error } = await supabase()
    .from("citas")
    .select("fecha_iso")
    .neq("estado", "cancelado")
    .gte("fecha_iso", inicio)
    .lte("fecha_iso", fin);
  if (error) {
    console.error("[panel-data.js] Error obteniendo el conteo mensual de citas:", error);
    return {};
  }

  const counts = {};
  data.forEach((fila) => {
    counts[fila.fecha_iso] = (counts[fila.fecha_iso] || 0) + 1;
  });
  return counts;
}

/* ========================================================================
   SERVICIOS
   ======================================================================== */

/** @returns {Promise<Array>} */
export async function getServices() {
  const { data, error } = await supabase()
    .from("servicios")
    .select("id, nombre, descripcion, duracion, precio, activo")
    .order("nombre", { ascending: true });
  if (error) {
    console.error("[panel-data.js] Error obteniendo servicios:", error);
    return [];
  }
  return data;
}

/**
 * @param {{nombre:string, descripcion:string, duracion:number, precio:number}} data
 * @returns {Promise<object>}
 */
export async function createService(data) {
  const nuevo = {
    id: `serv-${Date.now()}`, // servicios.id es TEXT PRIMARY KEY sin valor por defecto
    nombre: data.nombre,
    descripcion: data.descripcion,
    duracion: data.duracion,
    precio: data.precio,
    activo: true,
  };
  const { data: fila, error } = await supabase().from("servicios").insert(nuevo).select().single();
  if (error) {
    console.error("[panel-data.js] Error creando el servicio:", error);
    throw error;
  }
  return fila;
}

/**
 * @param {string} id
 * @returns {Promise<boolean>} nuevo valor de "activo"
 */
export async function toggleServiceActive(id) {
  const { data: actual, error: errorLectura } = await supabase()
    .from("servicios")
    .select("activo")
    .eq("id", id)
    .maybeSingle();
  if (errorLectura || !actual) {
    console.error("[panel-data.js] Error leyendo el servicio a activar/desactivar:", errorLectura);
    return false;
  }

  const nuevoValor = !actual.activo;
  const { error } = await supabase().from("servicios").update({ activo: nuevoValor }).eq("id", id);
  if (error) {
    console.error("[panel-data.js] Error actualizando el servicio:", error);
    throw error;
  }
  return nuevoValor;
}

/* ========================================================================
   HORARIOS DE ATENCIÓN
   ======================================================================== */

/** @returns {Promise<object>} objeto {lunes:{cerrado,franjas}, martes:{...}, ...} */
export async function getSchedule() {
  const { data, error } = await supabase().from("horarios").select("dia, cerrado, franjas");
  if (error) {
    console.error("[panel-data.js] Error obteniendo el horario:", error);
    return {};
  }
  const horarios = {};
  data.forEach((fila) => {
    horarios[fila.dia] = { cerrado: fila.cerrado, franjas: fila.franjas || [] };
  });
  return horarios;
}

/**
 * @param {string} dia clave en minúsculas: lunes..domingo
 * @param {{cerrado:boolean, franjas:Array<{inicio:string,fin:string}>}} data
 * @returns {Promise<void>}
 */
export async function updateScheduleDay(dia, data) {
  const { error } = await supabase()
    .from("horarios")
    .update({ cerrado: data.cerrado, franjas: data.franjas })
    .eq("dia", dia);
  if (error) {
    console.error("[panel-data.js] Error actualizando el horario:", error);
    throw error;
  }
}

/** @returns {Promise<string[]>} fechas ISO */
export async function getBlockedDates() {
  const { data, error } = await supabase().from("dias_bloqueados").select("fecha_iso");
  if (error) {
    console.error("[panel-data.js] Error obteniendo días bloqueados:", error);
    return [];
  }
  return data.map((fila) => fila.fecha_iso);
}

/**
 * @param {string} fechaISO
 * @returns {Promise<void>}
 */
export async function addBlockedDate(fechaISO) {
  const { error } = await supabase().from("dias_bloqueados").insert({ fecha_iso: fechaISO });
  // 23505 = ya estaba bloqueada (fecha_iso es PRIMARY KEY) — no es un error real.
  if (error && error.code !== "23505") {
    console.error("[panel-data.js] Error bloqueando la fecha:", error);
    throw error;
  }
}

/**
 * @param {string} fechaISO
 * @returns {Promise<void>}
 */
export async function removeBlockedDate(fechaISO) {
  const { error } = await supabase().from("dias_bloqueados").delete().eq("fecha_iso", fechaISO);
  if (error) {
    console.error("[panel-data.js] Error desbloqueando la fecha:", error);
    throw error;
  }
}

/* ========================================================================
   TARJETAS VIP
   Viven en vip-data.js (Supabase, tabla tarjetas_vip) en vez de un arreglo
   en memoria de este archivo, porque tanto el panel como las páginas
   públicas (tarjeta-vip.html, mi-tarjeta-vip.html) necesitan ver la MISMA
   tarjeta. panel-app.js sigue importando estas funciones solo desde
   "./panel-data.js" — de dónde vengan realmente no le importa.
   ======================================================================== */
export {
  getVipCards,
  getVipCardById,
  getVipCardByCodigo,
  createVipCard,
  deleteVipCard,
  toggleVipCardStatus,
  setVipCardVisitas,
  canjearCicloVip,
  VIP_CONFIG,
} from "./vip-data.js";

/* ========================================================================
   HISTORIAS CLÍNICAS (Facial y Corporal)
   Una historia queda asociada a la cita desde la que se creó (citaId),
   para poder abrirla de nuevo más adelante desde esa misma fila de la
   agenda. El "tipo" (facial | corporal) decide qué formulario y qué
   plantilla de PDF se usan.
   ======================================================================== */

/** Convierte una fila de `historias_clinicas` (snake_case) al objeto camelCase que espera panel-historia.js. */
function mapearHistoria(fila) {
  if (!fila) return null;
  return {
    id: fila.id,
    citaId: fila.cita_id,
    tipo: fila.tipo,
    datos: fila.datos,
    creadaEn: fila.creado_en,
  };
}

/**
 * @param {string} citaId
 * @returns {Promise<object|null>} la historia más reciente para esa cita, o null si no tiene
 */
export async function getHistoriaClinicaPorCita(citaId) {
  const { data, error } = await supabase()
    .from("historias_clinicas")
    .select("*")
    .eq("cita_id", citaId)
    .order("creado_en", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[panel-data.js] Error obteniendo la historia clínica de la cita:", error);
    return null;
  }
  return mapearHistoria(data);
}

/**
 * Guarda (crea o actualiza) una historia clínica ya completada en el
 * formulario. La tabla tiene UNIQUE(cita_id, tipo), así que si ya existe
 * una historia de este tipo para esta cita se actualiza en vez de
 * duplicarse — esto es justo lo que permite reabrir y editar la misma
 * historia desde panel-historia.js.
 * @param {{citaId:string, tipo:'facial'|'corporal', datos:object}} registro
 * @returns {Promise<object>}
 */
export async function guardarHistoriaClinica(registro) {
  const cliente = registro.datos?.nombreCompleto || registro.datos?.cliente || "";
  const fila = {
    cita_id: registro.citaId ?? null,
    cliente,
    tipo: registro.tipo,
    datos: registro.datos,
  };

  const { data, error } = await supabase()
    .from("historias_clinicas")
    .upsert(fila, { onConflict: "cita_id, tipo" })
    .select()
    .single();
  if (error) {
    console.error("[panel-data.js] Error guardando la historia clínica:", error);
    throw error;
  }
  return mapearHistoria(data);
}