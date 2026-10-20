/**
 * panel-app.js
 * -----------------------------------------------------------------------
 * Toda la interacción del panel. Este archivo NUNCA toca datos en crudo:
 * solo llama a las funciones de panel-data.js y pinta el resultado. El
 * día que panel-data.js hable con Supabase de verdad, este archivo no
 * necesita cambios.
 * -----------------------------------------------------------------------
 */
import * as api from "./panel-data.js";

/* ========================================================================
   UTILIDADES
   ======================================================================== */

const $ = (sel, root = document) => root.querySelector(sel);
const $all = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const MESES_ES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DIAS_ES = ["Do","Lu","Ma","Mi","Ju","Vi","Sa"];
const DIAS_SEMANA = [
  { key: "lunes", label: "Lunes" },
  { key: "martes", label: "Martes" },
  { key: "miercoles", label: "Miércoles" },
  { key: "jueves", label: "Jueves" },
  { key: "viernes", label: "Viernes" },
  { key: "sabado", label: "Sábado" },
  { key: "domingo", label: "Domingo" },
];

const formatCOP = (valor) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(valor);

function formatFechaLarga(date) {
  return date.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function formatFechaCorta(fechaISO) {
  const [y, m, d] = fechaISO.split("-").map(Number);
  return `${d} ${MESES_ES[m - 1].slice(0, 3)}`;
}

let toastTimer = null;
function showToast(mensaje) {
  const toast = $("#toast");
  toast.textContent = mensaje;
  toast.hidden = false;
  requestAnimationFrame(() => toast.classList.add("is-visible"));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("is-visible");
    setTimeout(() => (toast.hidden = true), 250);
  }, 2600);
}

/* ========================================================================
   GUARDIA DE SESIÓN
   Esta página (panel-admin.html) es un archivo independiente del login,
   así que se protege sola: revisa la sesión REAL de Supabase Auth antes
   de pintar nada y, si no hay sesión, vuelve al login. Devuelve `true`
   si hay sesión válida (para que el arranque, más abajo, sepa si debe
   seguir inicializando el panel o no).
   ======================================================================== */
async function protegerPanel() {
  const { data, error } = await window.supabaseClient.auth.getSession();
  if (error) console.error("[panel-app.js] Error revisando la sesión:", error);
  if (!data?.session) {
    window.location.href = "panel-privado.html";
    return false;
  }
  return true;
}

/* ========================================================================
   PANEL: inicialización y navegación entre pestañas
   ======================================================================== */

const pestanasCargadas = new Set();

function initPanel() {
  $("#panel-page-date").textContent = formatFechaLarga(new Date());

  initSidebarNav();
  initLogout();
  initAgendaTab();
  initCalendarioTab();
  initServiciosTab();
  initHorariosTab();
  initVipTab();
  initModalEditar();

  cargarKpis();
  cambiarPestana("agenda"); // pestaña inicial
}

function initSidebarNav() {
  $all(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => cambiarPestana(btn.dataset.tab));
  });
}

const TITULOS_PESTANA = {
  agenda: "Agenda",
  calendario: "Calendario",
  servicios: "Servicios",
  horarios: "Horarios",
  vip: "Tarjetas VIP",
};

function cambiarPestana(tab) {
  $all(".nav-item").forEach((btn) => btn.classList.toggle("is-active", btn.dataset.tab === tab));
  $all(".tab-panel").forEach((panel) => panel.classList.toggle("is-active", panel.id === `tab-${tab}`));
  $("#panel-page-title").textContent = TITULOS_PESTANA[tab] || "";

  // Carga perezosa: cada pestaña trae sus datos la primera vez que se visita.
  if (!pestanasCargadas.has(tab)) {
    pestanasCargadas.add(tab);
    if (tab === "agenda") cargarAgenda();
    if (tab === "calendario") cargarCalendario();
    if (tab === "servicios") cargarServicios();
    if (tab === "horarios") cargarHorarios();
    if (tab === "vip") cargarVip();
  }
}

function initLogout() {
  $("#logout-btn").addEventListener("click", async () => {
    await api.logout(); // ya cierra la sesión real de Supabase (supabase.auth.signOut())
    window.location.href = "panel-privado.html";
  });
}

/* ========================================================================
   KPIs
   ======================================================================== */

async function cargarKpis() {
  const grid = $("#kpi-grid");
  const kpis = await api.getKpis();
  grid.innerHTML = `
    <div class="kpi-card">
      <p class="kpi-label">Turnos de hoy</p>
      <p class="kpi-value">${kpis.turnosHoy}</p>
    </div>
    <div class="kpi-card">
      <p class="kpi-label">Pendientes de confirmar</p>
      <p class="kpi-value">${kpis.pendientes}</p>
    </div>
    <div class="kpi-card">
      <p class="kpi-label">Próximos 7 días</p>
      <p class="kpi-value">${kpis.proximos7}</p>
    </div>
    <div class="kpi-card kpi-accent">
      <p class="kpi-label">Servicio más pedido</p>
      <p class="kpi-value kpi-value-text">${kpis.servicioTop}</p>
    </div>
  `;
}

/* ========================================================================
   PESTAÑA 1 — AGENDA
   ======================================================================== */

const agendaState = { rango: "hoy", estado: "", busqueda: "" };
let ultimaAgendaCargada = [];

function initAgendaTab() {
  $all("#rango-filtros .chip-filter").forEach((btn) => {
    btn.addEventListener("click", () => {
      $all("#rango-filtros .chip-filter").forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      agendaState.rango = btn.dataset.rango;
      cargarAgenda();
    });
  });

  $("#filtro-estado").addEventListener("change", (e) => {
    agendaState.estado = e.target.value;
    cargarAgenda();
  });

  let debounce;
  $("#buscar-agenda").addEventListener("input", (e) => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      agendaState.busqueda = e.target.value;
      cargarAgenda();
    }, 250);
  });

  $("#agenda-tbody").addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-accion]");
    if (!btn) return;
    const { accion, id } = btn.dataset;

    if (accion === "confirmar") {
      btn.disabled = true;
      await api.updateAppointmentStatus(id, "confirmado");
      showToast("Cita confirmada.");
      cargarAgenda();
      cargarKpis();
    } else if (accion === "cancelar") {
      if (!confirm("¿Cancelar esta cita?")) return;
      btn.disabled = true;
      await api.updateAppointmentStatus(id, "cancelado");
      showToast("Cita cancelada.");
      cargarAgenda();
      cargarKpis();
    } else if (accion === "editar") {
      // Se usa la lista ya cargada en pantalla en vez de volver a pedir
      // todas las citas — la fila ya tiene todo lo que este modal necesita.
      const cita = ultimaAgendaCargada.find((c) => c.id === id);
      if (cita) abrirModalEditar(cita);
    }
  });
}

const ESTADO_LABEL = { pendiente: "Pendiente", confirmado: "Confirmado", completado: "Completado", cancelado: "Cancelado" };

function renderFilaAgenda(cita) {
  const puedeConfirmar = cita.estado === "pendiente";
  const puedeCancelar = cita.estado !== "cancelado" && cita.estado !== "completado";
  return `
    <tr>
      <td class="cell-fecha">${formatFechaCorta(cita.fechaISO)}<small>${cita.hora}</small></td>
      <td>${cita.cliente}</td>
      <td>${cita.contacto}</td>
      <td>${cita.servicio}</td>
      <td><span class="badge badge-${cita.estado}">${ESTADO_LABEL[cita.estado]}</span></td>
      <td class="col-acciones">
        <div class="row-actions">
          <button type="button" class="icon-btn icon-btn-confirm" data-accion="confirmar" data-id="${cita.id}" title="Confirmar" ${puedeConfirmar ? "" : "disabled"}>
            <svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>
          </button>
          <button type="button" class="icon-btn" data-accion="editar" data-id="${cita.id}" title="Editar">
            <svg viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
          </button>
          <button type="button" class="icon-btn" data-accion="historia-clinica" data-id="${cita.id}" data-cliente="${cita.cliente}" title="Crear historia clínica">
            <svg viewBox="0 0 24 24"><path d="M9 2h6a1 1 0 0 1 1 1v1h1a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1V3a1 1 0 0 1 1-1z"/><path d="M9 12h6M9 16h4"/></svg>
          </button>
          <button type="button" class="icon-btn icon-btn-danger" data-accion="cancelar" data-id="${cita.id}" title="Cancelar" ${puedeCancelar ? "" : "disabled"}>
            <svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
      </td>
    </tr>`;
}

async function cargarAgenda() {
  const tbody = $("#agenda-tbody");
  const emptyMsg = $("#agenda-empty");
  const citas = await api.getAppointments(agendaState);
  ultimaAgendaCargada = citas;

  if (citas.length === 0) {
    tbody.innerHTML = "";
    emptyMsg.hidden = false;
  } else {
    emptyMsg.hidden = true;
    tbody.innerHTML = citas.map(renderFilaAgenda).join("");
  }
}

/* ========================================================================
   MODAL — editar cita
   ======================================================================== */

function initModalEditar() {
  $("#modal-editar-close").addEventListener("click", cerrarModalEditar);
  $("#modal-editar-cancel").addEventListener("click", cerrarModalEditar);
  $("#modal-editar").addEventListener("click", (e) => {
    if (e.target.id === "modal-editar") cerrarModalEditar();
  });

  $("#form-editar-cita").addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = $("#editar-id").value;
    await api.updateAppointment(id, {
      fechaISO: $("#editar-fecha").value,
      hora: $("#editar-hora").value,
      cliente: $("#editar-cliente").value.trim(),
      contacto: $("#editar-contacto").value.trim(),
      servicioId: $("#editar-servicio").value,
      estado: $("#editar-estado").value,
    });
    cerrarModalEditar();
    showToast("Cita actualizada.");
    cargarAgenda();
    cargarKpis();
    // Si el calendario ya se cargó, refresca su vista también.
    if (pestanasCargadasIncluye("calendario")) cargarCalendario();
  });
}

function pestanasCargadasIncluye(tab) {
  return $(`#tab-${tab}`)?.dataset.cargado === "1";
}

async function abrirModalEditar(cita) {
  const servicios = await api.getServices();
  const select = $("#editar-servicio");
  select.innerHTML = servicios.map((s) => `<option value="${s.id}">${s.nombre}</option>`).join("");

  $("#editar-id").value = cita.id;
  $("#editar-fecha").value = cita.fechaISO;
  $("#editar-hora").value = cita.hora;
  $("#editar-cliente").value = cita.cliente;
  $("#editar-contacto").value = cita.contacto;
  select.value = cita.servicioId;
  $("#editar-estado").value = cita.estado;

  $("#modal-editar").classList.add("is-open");
}

function cerrarModalEditar() {
  $("#modal-editar").classList.remove("is-open");
}

/* ========================================================================
   PESTAÑA 2 — CALENDARIO
   ======================================================================== */

let calFecha = new Date();
calFecha.setDate(1);
let calDiaSeleccionado = null;

function initCalendarioTab() {
  $("#cal-prev").addEventListener("click", () => {
    calFecha.setMonth(calFecha.getMonth() - 1);
    cargarCalendario();
  });
  $("#cal-next").addEventListener("click", () => {
    calFecha.setMonth(calFecha.getMonth() + 1);
    cargarCalendario();
  });
}

async function cargarCalendario() {
  $("#tab-calendario").dataset.cargado = "1";
  const year = calFecha.getFullYear();
  const month = calFecha.getMonth();
  $("#cal-month-label").textContent = `${MESES_ES[month]} ${year}`;

  const counts = await api.getMonthAppointmentCounts(year, month);
  pintarGrillaMes($("#cal-grid"), year, month, {
    counts,
    seleccionado: calDiaSeleccionado,
    onDayClick: (fechaISO) => {
      calDiaSeleccionado = fechaISO;
      cargarCalendario();
      cargarDetalleDia(fechaISO);
    },
  });
}

async function cargarDetalleDia(fechaISO) {
  const [y, m, d] = fechaISO.split("-").map(Number);
  const fecha = new Date(y, m - 1, d);
  $("#cal-detail-title").textContent = formatFechaLarga(fecha);

  const citas = await api.getAppointmentsByDate(fechaISO);
  const cont = $("#cal-detail-list");
  if (citas.length === 0) {
    cont.innerHTML = `<p class="table-empty">No hay citas agendadas este día.</p>`;
    return;
  }
  cont.innerHTML = citas
    .map(
      (c) => `
      <div class="day-detail-item">
        <time>${c.hora}</time>
        <span>${c.cliente} — ${c.servicio}</span>
        <span class="badge badge-${c.estado}">${ESTADO_LABEL[c.estado]}</span>
      </div>`
    )
    .join("");
}

/**
 * Dibuja una grilla mensual reutilizable (la usan tanto "Calendario"
 * como "Días bloqueados" en Horarios).
 * @param {HTMLElement} grid
 * @param {number} year
 * @param {number} month 0-indexado
 * @param {{counts?:Record<string,number>, bloqueadas?:string[], seleccionado?:string, onDayClick?:(fechaISO:string)=>void}} opts
 */
function pintarGrillaMes(grid, year, month, opts = {}) {
  const hoyISO = new Date().toISOString().slice(0, 10);
  const primerDia = new Date(year, month, 1);
  const inicioOffset = primerDia.getDay();
  const diasEnMes = new Date(year, month + 1, 0).getDate();

  let html = DIAS_ES.map((d) => `<div class="cal-day-name">${d}</div>`).join("");
  for (let i = 0; i < inicioOffset; i++) html += `<div class="cal-day is-empty"></div>`;

  for (let dia = 1; dia <= diasEnMes; dia++) {
    const fechaISO = `${year}-${String(month + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
    const esHoy = fechaISO === hoyISO;
    const esSeleccionado = fechaISO === opts.seleccionado;
    const bloqueada = opts.bloqueadas?.includes(fechaISO);
    const conteo = opts.counts?.[fechaISO];

    html += `
      <div class="cal-day ${esHoy ? "is-today" : ""} ${esSeleccionado ? "is-selected" : ""} ${bloqueada ? "is-blocked" : ""}"
           data-fecha="${fechaISO}">
        <span>${dia}</span>
        ${conteo ? `<span class="cal-day-count">${conteo}</span>` : ""}
      </div>`;
  }

  grid.innerHTML = html;
  grid.querySelectorAll(".cal-day:not(.is-empty)").forEach((el) => {
    el.addEventListener("click", () => opts.onDayClick?.(el.dataset.fecha));
  });
}

/* ========================================================================
   PESTAÑA 3 — SERVICIOS
   ======================================================================== */

function initServiciosTab() {
  $("#form-servicio").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("button[type=submit]");
    btn.disabled = true;
    try {
      await api.createService({
        nombre: $("#serv-nombre").value.trim(),
        descripcion: $("#serv-descripcion").value.trim(),
        duracion: Number($("#serv-duracion").value),
        precio: Number($("#serv-precio").value),
      });
      e.target.reset();
      showToast("Servicio guardado.");
      cargarServicios();
    } finally {
      btn.disabled = false;
    }
  });

  $("#servicios-tbody").addEventListener("change", async (e) => {
    if (e.target.matches("input[data-toggle-servicio]")) {
      const id = e.target.dataset.toggleServicio;
      const activo = await api.toggleServiceActive(id);
      showToast(activo ? "Servicio activado." : "Servicio desactivado.");
    }
  });
}

async function cargarServicios() {
  $("#tab-servicios").dataset.cargado = "1";
  const servicios = await api.getServices();
  $("#servicios-tbody").innerHTML = servicios
    .map(
      (s) => `
      <tr>
        <td>
          <strong>${s.nombre}</strong>
          <div style="color:var(--gris-suave);font-size:.8rem;margin-top:2px">${s.descripcion}</div>
        </td>
        <td>${s.duracion} min</td>
        <td>${formatCOP(s.precio)}</td>
        <td>
          <label class="switch">
            <input type="checkbox" data-toggle-servicio="${s.id}" ${s.activo ? "checked" : ""} />
            <span class="switch-track"></span>
          </label>
        </td>
      </tr>`
    )
    .join("");
}

/* ========================================================================
   PESTAÑA 4 — HORARIOS
   ======================================================================== */

function initHorariosTab() {
  $("#horarios-semana").addEventListener("change", onCambioHorarioSemana);
  $("#horarios-semana").addEventListener("click", onClickHorarioSemana);

  $("#bloq-prev").addEventListener("click", () => {
    bloqFecha.setMonth(bloqFecha.getMonth() - 1);
    cargarCalendarioBloqueo();
  });
  $("#bloq-next").addEventListener("click", () => {
    bloqFecha.setMonth(bloqFecha.getMonth() + 1);
    cargarCalendarioBloqueo();
  });
}

async function cargarHorarios() {
  $("#tab-horarios").dataset.cargado = "1";
  const horarios = await api.getSchedule();
  renderHorariosSemana(horarios);
  cargarCalendarioBloqueo();
}

function renderHorariosSemana(horarios) {
  $("#horarios-semana").innerHTML = DIAS_SEMANA.map(({ key, label }) => {
    const dia = horarios[key];
    return `
      <div class="schedule-day-row ${dia.cerrado ? "is-closed" : ""}" data-dia="${key}">
        <p class="schedule-day-name">${label}</p>
        <label class="schedule-day-closed">
          <input type="checkbox" data-cerrado ${dia.cerrado ? "checked" : ""} />
          Cerrado
        </label>
        <div class="schedule-slots" data-slots>
          ${dia.franjas.map((f, i) => renderFranjaRow(f, i)).join("")}
          <button type="button" class="schedule-add-slot" data-add-slot>+ Agregar franja</button>
        </div>
      </div>`;
  }).join("");
}

function renderFranjaRow(franja, index) {
  return `
    <div class="schedule-slot-row" data-slot-index="${index}">
      <input type="time" data-slot-inicio value="${franja.inicio}" />
      <span class="schedule-slot-sep">a</span>
      <input type="time" data-slot-fin value="${franja.fin}" />
      <button type="button" class="icon-btn icon-btn-danger" data-remove-slot title="Quitar franja">
        <svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>`;
}

function leerFilaHorario(row) {
  const cerrado = row.querySelector("[data-cerrado]").checked;
  const franjas = $all(".schedule-slot-row", row).map((slotRow) => ({
    inicio: slotRow.querySelector("[data-slot-inicio]").value,
    fin: slotRow.querySelector("[data-slot-fin]").value,
  }));
  return { cerrado, franjas };
}

// Los guardados se encadenan (uno tras otro) para que un guardado viejo
// no llegue tarde y pise al nuevo.
let colaGuardadoHorario = Promise.resolve();

/** "HH:MM" en 24h: se puede comparar como texto. */
function franjasValidas(franjas) {
  return franjas.every((f) => f.inicio && f.fin && f.fin > f.inicio);
}

/** @returns {Promise<boolean>} true si se guardó, false si se rechazó por horas inválidas */
async function guardarFilaHorario(row) {
  const dia = row.dataset.dia;
  const data = leerFilaHorario(row);
  if (!data.cerrado && !franjasValidas(data.franjas)) {
    showToast("Revisa las horas: el fin debe ser mayor que el inicio. No se guardó.");
    return false;
  }
  colaGuardadoHorario = colaGuardadoHorario.catch(() => {}).then(() => api.updateScheduleDay(dia, data));
  await colaGuardadoHorario;
  return true;
}

function onCambioHorarioSemana(e) {
  const row = e.target.closest(".schedule-day-row");
  if (!row) return;

  if (e.target.matches("[data-cerrado]")) {
    row.classList.toggle("is-closed", e.target.checked);
    guardarFilaHorario(row).then((ok) => ok && showToast("Horario actualizado."));
  } else if (e.target.matches("[data-slot-inicio], [data-slot-fin]")) {
    guardarFilaHorario(row).then((ok) => ok && showToast("Horario actualizado."));
  }
}

function onClickHorarioSemana(e) {
  const row = e.target.closest(".schedule-day-row");
  if (!row) return;

  if (e.target.closest("[data-add-slot]")) {
    const slotsWrap = $("[data-slots]", row);
    const addBtn = $("[data-add-slot]", slotsWrap);
    const index = $all(".schedule-slot-row", row).length;
    addBtn.insertAdjacentHTML("beforebegin", renderFranjaRow({ inicio: "09:00", fin: "12:00" }, index));
    guardarFilaHorario(row).then((ok) => ok && showToast("Franja agregada."));
  } else if (e.target.closest("[data-remove-slot]")) {
    e.target.closest(".schedule-slot-row").remove();
    guardarFilaHorario(row).then((ok) => ok && showToast("Franja eliminada."));
  }
}

/* ---- Días bloqueados (mini calendario dentro de Horarios) ---- */

let bloqFecha = new Date();
bloqFecha.setDate(1);

async function cargarCalendarioBloqueo() {
  const year = bloqFecha.getFullYear();
  const month = bloqFecha.getMonth();
  $("#bloq-month-label").textContent = `${MESES_ES[month]} ${year}`;

  const bloqueadas = await api.getBlockedDates();
  pintarGrillaMes($("#bloq-grid"), year, month, {
    bloqueadas,
    onDayClick: async (fechaISO) => {
      if (bloqueadas.includes(fechaISO)) {
        await api.removeBlockedDate(fechaISO);
        showToast("Fecha desbloqueada.");
      } else {
        await api.addBlockedDate(fechaISO);
        showToast("Fecha bloqueada.");
      }
      cargarCalendarioBloqueo();
      renderListaBloqueadas();
    },
  });
  renderListaBloqueadas();
}

async function renderListaBloqueadas() {
  const bloqueadas = (await api.getBlockedDates()).sort();
  const lista = $("#bloqueadas-lista");
  const empty = $("#bloqueadas-empty");

  if (bloqueadas.length === 0) {
    lista.innerHTML = "";
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  lista.innerHTML = bloqueadas
    .map(
      (fechaISO) => `
      <li>
        <span>${formatFechaCorta(fechaISO)} · ${fechaISO}</span>
        <button type="button" class="icon-btn icon-btn-danger" data-unblock="${fechaISO}" title="Desbloquear">
          <svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </li>`
    )
    .join("");

  $all("[data-unblock]", lista).forEach((btn) => {
    btn.addEventListener("click", async () => {
      await api.removeBlockedDate(btn.dataset.unblock);
      showToast("Fecha desbloqueada.");
      cargarCalendarioBloqueo();
    });
  });
}

/* ========================================================================
   PESTAÑA 5 — TARJETAS VIP
   ======================================================================== */

function initVipTab() {
  $("#form-vip").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("button[type=submit]");
    btn.disabled = true;
    try {
      const nueva = await api.createVipCard({ cliente: $("#vip-cliente").value.trim() });
      e.target.reset();
      const msg = $("#vip-created-msg");
      msg.textContent = `Tarjeta creada para ${nueva.cliente} — código ${nueva.codigo}`;
      msg.hidden = false;
      showToast("Tarjeta VIP generada.");
      cargarVip();
    } finally {
      btn.disabled = false;
    }
  });

  $("#vip-tbody").addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-accion]");
    if (!btn) return;
    const { accion, id } = btn.dataset;

    if (accion === "toggle-vip") {
      await api.toggleVipCardStatus(id);
      cargarVip();
    } else if (accion === "eliminar-vip") {
      if (!confirm("¿Eliminar esta tarjeta VIP? Esta acción no se puede deshacer.")) return;
      await api.deleteVipCard(id);
      showToast("Tarjeta eliminada.");
      cargarVip();
    }
  });
}

async function cargarVip() {
  $("#tab-vip").dataset.cargado = "1";
  const tarjetas = await api.getVipCards();
  $("#vip-tbody").innerHTML = tarjetas
    .map(
      (t) => `
      <tr>
        <td><code>${t.codigo}</code></td>
        <td>${t.cliente}</td>
        <td>${formatFechaCorta(t.fechaCreacion)}</td>
        <td>
          <span class="vip-mini-progress" title="${t.visitas}/10 visitas${t.ciclosCompletados ? ` · ${t.ciclosCompletados} ciclo(s) cumplido(s)` : ""}">
            <span class="vip-mini-progress-bar"><span style="width:${(t.visitas / 10) * 100}%"></span></span>
            ${t.visitas}/10
          </span>
        </td>
        <td><span class="badge badge-${t.estado}">${t.estado === "activa" ? "Activa" : "Inactiva"}</span></td>
        <td class="col-acciones">
          <div class="row-actions">
            <button type="button" class="icon-btn" data-accion="gestionar-vip" data-id="${t.id}" title="Gestionar visitas y tarjeta">
              <svg viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="13" rx="2"/><path d="M2 10h20M6 15h4"/></svg>
            </button>
            <button type="button" class="icon-btn" data-accion="toggle-vip" data-id="${t.id}" title="${t.estado === "activa" ? "Dar de baja" : "Reactivar"}">
              <svg viewBox="0 0 24 24">${t.estado === "activa" ? '<path d="M18 6L6 18M6 6l12 12"/>' : '<path d="M20 6L9 17l-5-5"/>'}</svg>
            </button>
            <button type="button" class="icon-btn icon-btn-danger" data-accion="eliminar-vip" data-id="${t.id}" title="Eliminar">
              <svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6h12z"/></svg>
            </button>
          </div>
        </td>
      </tr>`
    )
    .join("");
}

/* ========================================================================
   ARRANQUE
   ======================================================================== */

document.addEventListener("DOMContentLoaded", async () => {
  const sesionValida = await protegerPanel();
  if (!sesionValida) return; // protegerPanel ya redirigió a panel-privado.html
  initPanel();
});