// Consultas a Supabase del panel

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

// AUTENTICACIÓN

export async function login(email, password) {
  if (!email || !password) {
    return { ok: false, mensaje: "Ingresa tu correo y tu contraseña." };
  }
  const { error } = await supabase().auth.signInWithPassword({ email, password });
  if (error) return { ok: false, mensaje: error.message };
  return { ok: true };
}

export async function logout() {
  const { error } = await supabase().auth.signOut();
  if (error) console.error("[panel-data.js] Error cerrando sesión:", error);
}

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

// AGENDA / CITAS

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

export async function updateAppointmentStatus(id, nuevoEstado) {
  const { error } = await supabase().from("citas").update({ estado: nuevoEstado }).eq("id", id);
  if (error) {
    console.error("[panel-data.js] Error actualizando el estado de la cita:", error);
    throw error;
  }
}

export async function updateAppointment(id, cambios) {
  const payload = {
    fecha_iso: cambios.fechaISO,
    hora: cambios.hora,
    cliente: cambios.cliente,
    contacto: cambios.contacto,
    servicio_id: cambios.servicioId,
    estado: cambios.estado,
  };

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

// SERVICIOS

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

export async function createService(data) {
  const nuevo = {
    id: `serv-${Date.now()}`,
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

// HORARIOS DE ATENCIÓN

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

export async function getBlockedDates() {
  const { data, error } = await supabase().from("dias_bloqueados").select("fecha_iso");
  if (error) {
    console.error("[panel-data.js] Error obteniendo días bloqueados:", error);
    return [];
  }
  return data.map((fila) => fila.fecha_iso);
}

export async function addBlockedDate(fechaISO) {
  const { error } = await supabase().from("dias_bloqueados").insert({ fecha_iso: fechaISO });
  // 23505 = ya estaba bloqueada (fecha_iso es PRIMARY KEY)
  if (error && error.code !== "23505") {
    console.error("[panel-data.js] Error bloqueando la fecha:", error);
    throw error;
  }
}

export async function removeBlockedDate(fechaISO) {
  const { error } = await supabase().from("dias_bloqueados").delete().eq("fecha_iso", fechaISO);
  if (error) {
    console.error("[panel-data.js] Error desbloqueando la fecha:", error);
    throw error;
  }
}

export async function getSpecialSchedules() {
  const { data, error } = await supabase().from("horarios_especiales").select("*").order("fecha_iso", { ascending: true });
  if (error) {
    console.error("[panel-data.js] Error obteniendo horarios especiales:", error);
    return [];
  }
  return data.map((f) => ({
    fechaISO: String(f.fecha_iso).slice(0, 10),
    cerrado: Boolean(f.cerrado),
    franjas: Array.isArray(f.franjas) ? f.franjas : [],
    horasExcluidas: Array.isArray(f.horas_excluidas) ? f.horas_excluidas : [],
    horasEditadas: f.horas_editadas && typeof f.horas_editadas === "object" && !Array.isArray(f.horas_editadas) ? f.horas_editadas : {},
    nota: f.nota || "",
  }));
}

// Crea o reemplaza el horario especial de una fecha.
export async function saveSpecialSchedule({ fechaISO, cerrado, franjas, horasExcluidas = [], horasEditadas = {}, nota }) {
  const { error } = await supabase()
    .from("horarios_especiales")
    .upsert(
      { fecha_iso: fechaISO, cerrado, franjas, horas_excluidas: horasExcluidas, horas_editadas: horasEditadas, nota: nota || null },
      { onConflict: "fecha_iso" }
    );
  if (error) {
    console.error("[panel-data.js] Error guardando horario especial:", error);
    throw error;
  }
}

// Quita el horario especial
export async function deleteSpecialSchedule(fechaISO) {
  const { error } = await supabase().from("horarios_especiales").delete().eq("fecha_iso", fechaISO);
  if (error) {
    console.error("[panel-data.js] Error quitando horario especial:", error);
    throw error;
  }
}

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