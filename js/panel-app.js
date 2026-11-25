// Panel administrativo

import * as api from "./panel-data.js";

// UTILIDADES

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

async function protegerPanel() {
  const { data, error } = await window.supabaseClient.auth.getSession();
  if (error) console.error("[panel-app.js] Error revisando la sesión:", error);
  if (!data?.session) {
    window.location.href = "panel-privado.html";
    return false;
  }
  return true;
}

// PANEL: inicialización y navegación entre pestañas

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

  // Carga perezosa
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
    await api.logout();
    window.location.href = "panel-privado.html";
  });
}

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

// PESTAÑA 1: AGENDA

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

// MODAL: editar cita

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

// PESTAÑA 2: CALENDARIO

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
    const especial = opts.especiales?.includes(fechaISO);
    const conteo = opts.counts?.[fechaISO];

    html += `
      <div class="cal-day ${esHoy ? "is-today" : ""} ${esSeleccionado ? "is-selected" : ""} ${bloqueada ? "is-blocked" : ""} ${especial ? "is-special" : ""}"
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

// PESTAÑA 3: SERVICIOS

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

// PESTAÑA 4: HORARIOS

function initHorariosTab() {
  $("#horarios-semana").addEventListener("change", onCambioHorarioSemana);
  $("#horarios-semana").addEventListener("click", onClickHorarioSemana);

  initEspecialesTab();

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
  cargarEspeciales();
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

let colaGuardadoHorario = Promise.resolve();

// "HH:MM" en 24h: se puede comparar como texto.
function franjasValidas(franjas) {
  return franjas.every((f) => f.inicio && f.fin && f.fin >= f.inicio); // inicio = fin vale: un solo turno
}

async function guardarFilaHorario(row) {
  const dia = row.dataset.dia;
  const data = leerFilaHorario(row);
  if (!data.cerrado && !franjasValidas(data.franjas)) {
    showToast("Revisa las horas: el fin no puede ser menor que el inicio. No se guardó.");
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

// Días bloqueados (mini calendario dentro de Horarios)

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

// Horarios especiales por fecha

const DIA_KEY_POR_INDICE = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];

let espMes = new Date();
espMes.setDate(1);
let espSeleccion = null; // fechaISO del día que se está editando
let espCache = [];

function hoyLocalISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fechaDesdeISO(fechaISO) {
  const [y, m, d] = fechaISO.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function horaBonita(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const ampm = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function resumenFranjas(esp) {
  if (esp.cerrado) return "Cerrado";
  if (!esp.franjas.length) return "Sin horas";
  if ((esp.horasExcluidas && esp.horasExcluidas.length) || (esp.horasEditadas && Object.keys(esp.horasEditadas).length)) {
    const finales = horasFinales(esp.franjas, esp.horasExcluidas, esp.horasEditadas);
    return finales.length ? `Horas: ${finales.map(horaBonita).join(", ")}` : "Sin horas";
  }
  return esp.franjas
    .map((f) => (f.inicio === f.fin ? horaBonita(f.inicio) : `${horaBonita(f.inicio)} a ${horaBonita(f.fin)}`))
    .join(" · ");
}

let espExcluidas = new Set();
let espEditadas = {};
let espEditando = null;

function aMinutos(hhmm) {
  const [h, m] = String(hhmm).split(":").map(Number);
  return h * 60 + m;
}

function minutosAHHMM(min) {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

function horasDeFranjas(franjas) {
  const set = new Set();
  franjas.forEach(({ inicio, fin }) => {
    if (!/^\d{2}:\d{2}/.test(inicio || "") || !/^\d{2}:\d{2}/.test(fin || "")) return;
    const ini = aMinutos(inicio);
    const end = aMinutos(fin);
    if (end < ini) return;
    if (end === ini) {
      set.add(ini);
      return;
    }
    for (let m = ini; m + 60 <= end; m += 60) set.add(m);
  });
  return [...set].sort((a, b) => a - b).map(minutosAHHMM);
}

// Lista final de horas de un día
function horasFinales(franjas, excluidas = [], editadas = {}) {
  const set = new Set();
  horasDeFranjas(franjas).forEach((h) => {
    if (excluidas.includes(h)) return;
    set.add(aMinutos(editadas[h] || h));
  });
  return [...set].sort((a, b) => a - b).map(minutosAHHMM);
}

function renderHorasEspecial() {
  const cont = $("#esp-horas");
  const row = $("#esp-editor .schedule-day-row");
  if (!cont || !row) return;

  const { cerrado, franjas } = leerFilaHorario(row);
  const horas = cerrado ? [] : horasDeFranjas(franjas);
  if (espEditando && !horas.includes(espEditando)) espEditando = null;

  cont.innerHTML = horas
    .map((h) => {
      const final = espEditadas[h] || h;
      if (espEditando === h) {
        return `
          <span class="esp-hora-editor">
            <input type="time" data-esp-nueva value="${final}" aria-label="Nueva hora para ${horaBonita(h)}" />
            <button type="button" class="esp-mini-btn esp-mini-ok" data-esp-ok="${h}" title="Aceptar">✓</button>
            <button type="button" class="esp-mini-btn" data-esp-cancel title="Cancelar">✕</button>
            ${espEditadas[h] ? `<button type="button" class="esp-mini-btn" data-esp-reset="${h}" title="Volver a ${horaBonita(h)}">↺</button>` : ""}
          </span>`;
      }
      const off = espExcluidas.has(h);
      const editada = Boolean(espEditadas[h]);
      return `
        <span class="esp-hora ${off ? "is-off" : ""} ${editada ? "is-edited" : ""}">
          <button type="button" class="esp-hora-chip" data-esp-hora="${h}" aria-pressed="${!off}"
                  title="${editada ? `Original: ${horaBonita(h)}` : "Quitar o poner esta hora"}">${horaBonita(final)}</button>
          <button type="button" class="esp-hora-edit" data-esp-editar="${h}" title="Cambiar la hora (ej. 2:00 → 2:45)" aria-label="Cambiar la hora de ${horaBonita(final)}">
            <svg viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
          </button>
        </span>`;
    })
    .join("");

  const activas = horas.filter((h) => !espExcluidas.has(h)).length;
  $("#esp-horas-hint").textContent = cerrado
    ? "Día cerrado: no saldrá ninguna hora."
    : horas.length
    ? `Saldrán ${activas} de ${horas.length} horas. Toca una hora para quitarla (queda tachada) o ponerla. Toca el lápiz para cambiarla (ej. 2:00 → 2:45).`
    : "Define una franja con hora de inicio y fin para ver las horas.";

  const campo = $("[data-esp-nueva]", cont);
  if (campo) campo.focus();
}

// Acepta el cambio de hora que se está editando.
function aceptarHoraEditada(original) {
  const campo = $("[data-esp-nueva]");
  const valor = campo ? campo.value : "";
  if (!/^\d{2}:\d{2}$/.test(valor)) {
    showToast("Escribe una hora válida.");
    return;
  }
  const { franjas } = leerFilaHorario($("#esp-editor .schedule-day-row"));
  const choca = horasDeFranjas(franjas).some(
    (h) => h !== original && !espExcluidas.has(h) && (espEditadas[h] || h) === valor
  );
  if (choca) {
    showToast(`Ya hay una hora a las ${horaBonita(valor)}. Elige otra.`);
    return;
  }
  if (valor === original) delete espEditadas[original];
  else espEditadas[original] = valor;
  espEditando = null;
  renderHorasEspecial();
}

function initEspecialesTab() {
  $("#esp-prev").addEventListener("click", () => {
    espMes.setMonth(espMes.getMonth() - 1);
    cargarEspeciales();
  });
  $("#esp-next").addEventListener("click", () => {
    espMes.setMonth(espMes.getMonth() + 1);
    cargarEspeciales();
  });

  const editor = $("#esp-editor");
  editor.addEventListener("change", (e) => {
    if (e.target.matches("[data-cerrado]")) {
      e.target.closest(".schedule-day-row").classList.toggle("is-closed", e.target.checked);
    }
    if (!e.target.matches("[data-esp-nueva]")) renderHorasEspecial();
  });
  editor.addEventListener("input", (e) => {
    if (e.target.matches('.schedule-slot-row input[type="time"]')) renderHorasEspecial();
  });
  editor.addEventListener("keydown", (e) => {
    if (!e.target.matches("[data-esp-nueva]")) return;
    if (e.key === "Enter") {
      e.preventDefault();
      aceptarHoraEditada(espEditando);
    } else if (e.key === "Escape") {
      espEditando = null;
      renderHorasEspecial();
    }
  });
  editor.addEventListener("click", async (e) => {
    const row = $(".schedule-day-row", editor);
    if (e.target.closest("[data-add-slot]")) {
      const addBtn = $("[data-add-slot]", editor);
      const index = $all(".schedule-slot-row", row).length;
      addBtn.insertAdjacentHTML("beforebegin", renderFranjaRow({ inicio: "09:00", fin: "12:00" }, index));
      renderHorasEspecial();
    } else if (e.target.closest("[data-remove-slot]")) {
      e.target.closest(".schedule-slot-row").remove();
      renderHorasEspecial();
    } else if (e.target.closest("[data-esp-hora]")) {
      const h = e.target.closest("[data-esp-hora]").dataset.espHora;
      if (espExcluidas.has(h)) espExcluidas.delete(h);
      else espExcluidas.add(h);
      renderHorasEspecial();
    } else if (e.target.closest("[data-esp-editar]")) {
      espEditando = e.target.closest("[data-esp-editar]").dataset.espEditar;
      renderHorasEspecial();
    } else if (e.target.closest("[data-esp-ok]")) {
      aceptarHoraEditada(e.target.closest("[data-esp-ok]").dataset.espOk);
    } else if (e.target.closest("[data-esp-cancel]")) {
      espEditando = null;
      renderHorasEspecial();
    } else if (e.target.closest("[data-esp-reset]")) {
      delete espEditadas[e.target.closest("[data-esp-reset]").dataset.espReset];
      espEditando = null;
      renderHorasEspecial();
    } else if (e.target.closest("[data-esp-todas]")) {
      espExcluidas.clear();
      renderHorasEspecial();
    } else if (e.target.closest("[data-esp-ninguna]")) {
      const { franjas } = leerFilaHorario(row);
      horasDeFranjas(franjas).forEach((h) => espExcluidas.add(h));
      renderHorasEspecial();
    } else if (e.target.closest("[data-esp-guardar]")) {
      await guardarEspecial();
    } else if (e.target.closest("[data-esp-quitar]")) {
      await quitarEspecial(espSeleccion);
    }
  });

  $("#esp-lista").addEventListener("click", async (e) => {
    const quitar = e.target.closest("[data-esp-del]");
    if (quitar) {
      e.stopPropagation();
      await quitarEspecial(quitar.dataset.espDel);
      return;
    }
    const item = e.target.closest("[data-esp-fecha]");
    if (item) seleccionarFechaEspecial(item.dataset.espFecha);
  });
}

async function cargarEspeciales() {
  espCache = await api.getSpecialSchedules();
  const year = espMes.getFullYear();
  const month = espMes.getMonth();
  $("#esp-month-label").textContent = `${MESES_ES[month]} ${year}`;
  pintarGrillaMes($("#esp-grid"), year, month, {
    especiales: espCache.map((e) => e.fechaISO),
    seleccionado: espSeleccion,
    onDayClick: seleccionarFechaEspecial,
  });
  renderListaEspeciales();
}

function renderListaEspeciales() {
  const lista = $("#esp-lista");
  const empty = $("#esp-empty");
  const proximos = espCache.filter((e) => e.fechaISO >= hoyLocalISO());
  if (proximos.length === 0) {
    lista.innerHTML = "";
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  lista.innerHTML = proximos
    .map(
      (e) => `
      <li class="esp-item" data-esp-fecha="${e.fechaISO}">
        <span>
          ${formatFechaLarga(fechaDesdeISO(e.fechaISO))}
          <small>${resumenFranjas(e)}${e.nota ? ` · ${e.nota}` : ""}</small>
        </span>
        <button type="button" class="icon-btn icon-btn-danger" data-esp-del="${e.fechaISO}" title="Quitar horario especial">
          <svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </li>`
    )
    .join("");
}

async function seleccionarFechaEspecial(fechaISO) {
  if (fechaISO < hoyLocalISO()) {
    showToast("No puedes definir horarios en fechas pasadas.");
    return;
  }
  espSeleccion = fechaISO;

  const existente = espCache.find((e) => e.fechaISO === fechaISO);
  let base = existente;
  if (!base) {
    // Punto de partida
    const semanal = await api.getSchedule();
    const delDia = semanal[DIA_KEY_POR_INDICE[fechaDesdeISO(fechaISO).getDay()]];
    base = {
      cerrado: delDia ? delDia.cerrado : false,
      franjas: delDia?.franjas?.length ? delDia.franjas.map((f) => ({ ...f })) : [{ inicio: "09:00", fin: "12:00" }],
      nota: "",
    };
  }

  espExcluidas = new Set(existente?.horasExcluidas || []);
  espEditadas = { ...(existente?.horasEditadas || {}) };
  espEditando = null;

  const editor = $("#esp-editor");
  editor.hidden = false;
  editor.dataset.fecha = fechaISO;
  editor.innerHTML = `
    <p class="field-label">${existente ? "Editar" : "Nuevo"} horario especial · ${formatFechaLarga(fechaDesdeISO(fechaISO))}</p>
    <div class="schedule-day-row ${base.cerrado ? "is-closed" : ""}">
      <label class="schedule-day-closed">
        <input type="checkbox" data-cerrado ${base.cerrado ? "checked" : ""} />
        Cerrado
      </label>
      <div class="schedule-slots" data-slots>
        ${base.franjas.map((f, i) => renderFranjaRow(f, i)).join("")}
        <button type="button" class="schedule-add-slot" data-add-slot>+ Agregar franja</button>
      </div>
    </div>
    <p class="field-hint">Para un único turno (ej. solo 3:30 pm) pon la misma hora en inicio y fin.</p>
    <div class="esp-horas-box">
      <div class="esp-horas-head">
        <p class="field-label">Horas que saldrán a las clientas</p>
        <div class="esp-horas-tools">
          <button type="button" class="schedule-add-slot" data-esp-todas>Todas</button>
          <button type="button" class="schedule-add-slot" data-esp-ninguna>Ninguna</button>
        </div>
      </div>
      <div id="esp-horas" class="esp-horas"></div>
      <p id="esp-horas-hint" class="field-hint"></p>
    </div>
    <input type="text" id="esp-nota" maxlength="120" placeholder="Nota (opcional)" value="${(base.nota || "").replace(/"/g, "&quot;")}" />
    <div class="esp-actions">
      <button type="button" class="btn btn-primary" data-esp-guardar>Guardar horario especial</button>
      ${existente ? '<button type="button" class="btn btn-ghost" data-esp-quitar>Quitar (volver al horario normal)</button>' : ""}
    </div>`;

  renderHorasEspecial();
  cargarEspeciales();
}

async function guardarEspecial() {
  const fechaISO = espSeleccion;
  if (!fechaISO) return;
  const data = leerFilaHorario($("#esp-editor .schedule-day-row"));
  if (!data.cerrado && (data.franjas.length === 0 || !franjasValidas(data.franjas))) {
    showToast("Revisa las horas: agrega al menos una franja y el fin no puede ser menor que el inicio.");
    return;
  }
  const horasGeneradas = data.cerrado ? [] : horasDeFranjas(data.franjas);
  const horasExcluidas = horasGeneradas.filter((h) => espExcluidas.has(h));
  const horasEditadas = {};
  horasGeneradas.forEach((h) => {
    if (espEditadas[h] && espEditadas[h] !== h && !espExcluidas.has(h)) horasEditadas[h] = espEditadas[h];
  });
  if (!data.cerrado && horasGeneradas.length > 0 && horasExcluidas.length === horasGeneradas.length) {
    showToast("Quitaste todas las horas. Si ese día no atiendes, mejor marca \"Cerrado\".");
    return;
  }
  try {
    await api.saveSpecialSchedule({
      fechaISO,
      cerrado: data.cerrado,
      franjas: data.cerrado ? [] : data.franjas,
      horasExcluidas,
      horasEditadas,
      nota: $("#esp-nota").value.trim(),
    });
    showToast("Horario especial guardado.");
    await cargarEspeciales();
    seleccionarFechaEspecial(fechaISO);
  } catch (err) {
    showToast("No se pudo guardar. ¿Ya creaste la tabla horarios_especiales en Supabase?");
  }
}

async function quitarEspecial(fechaISO) {
  if (!fechaISO) return;
  try {
    await api.deleteSpecialSchedule(fechaISO);
    showToast("Horario especial quitado: esa fecha vuelve al horario normal.");
    if (espSeleccion === fechaISO) {
      espSeleccion = null;
      $("#esp-editor").hidden = true;
    }
    cargarEspeciales();
  } catch (err) {
    showToast("No se pudo quitar el horario especial.");
  }
}

// PESTAÑA 5: TARJETAS VIP

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

// ARRANQUE

document.addEventListener("DOMContentLoaded", async () => {
  const sesionValida = await protegerPanel();
  if (!sesionValida) return;
  initPanel();
});