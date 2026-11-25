// Reserva de citas en 4 pasos

const bookingState = {
  step: 1,
  serviceId: null,
  varianteId: null,
  date: null,
  time: null,
  cliente: { nombre: "", telefono: "", email: "" },
};

let calendarViewDate = new Date();
let diasBloqueados = [];
let horariosSemana = [];
let horariosEspeciales = {};
let configCalendarioPromise = null;
let configCalendarioError = false;
let renderSlotsRequestId = 0;
let icsUrlActual = null;

const ANTICIPACION_MIN = 60;

const DIAS_CLAVE = [
  "domingo",
  "lunes",
  "martes",
  "miercoles",
  "jueves",
  "viernes",
  "sabado",
];

function normalizarDia(texto) {
  return String(texto || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function obtenerConfigsDia(dayIndex) {
  const clave = DIAS_CLAVE[dayIndex];
  if (!Array.isArray(horariosSemana) || horariosSemana.length === 0) return [];
  return horariosSemana.filter((h) => normalizarDia(h.dia) === clave);
}

function esVerdadero(v) {
  if (v === true || v === 1) return true;
  return ["true", "t", "1", "si", "sí", "yes"].includes(String(v ?? "").trim().toLowerCase());
}

function parsearHora(valor) {
  if (valor === null || valor === undefined) return null;
  const limpio = String(valor).trim().toLowerCase().replace(/\./g, "").replace(/\s+/g, "");
  const m = limpio.match(/^(\d{1,2})(?::(\d{2}))?(?::\d{2})?(am|pm)?$/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const mer = m[3] || "";
  if (mer === "pm" && h < 12) h += 12;
  if (mer === "am" && h === 12) h = 0;
  if (h > 24 || min > 59) return null;
  return { hora: h + min / 60, conMeridiano: Boolean(mer) };
}

// Formatea una hora decimal
function formatearHora12(horaDecimal) {
  const h24 = Math.floor(horaDecimal + 1e-9);
  const min = Math.round((horaDecimal - h24) * 60);
  const ampm = h24 >= 12 ? "pm" : "am";
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;
  return `${String(h12).padStart(2, "0")}:${String(min).padStart(2, "0")} ${ampm}`;
}

function normalizarHoraCita(valor) {
  const p = parsearHora(valor);
  if (!p) return String(valor || "").trim().toLowerCase();
  return formatearHora12(p.hora);
}

function leerFranjas(fila) {
  let franjas = fila.franjas;
  if (typeof franjas === "string") {
    try {
      franjas = JSON.parse(franjas);
    } catch {
      franjas = [];
    }
  }
  // Algunos paneles guardan un objeto único en vez de arreglo.
  if (franjas && !Array.isArray(franjas) && typeof franjas === "object") franjas = [franjas];
  return Array.isArray(franjas) ? franjas : [];
}

function normalizarFranja(franja) {
  if (!franja) return null;
  const pIni = parsearHora(franja.inicio ?? franja.desde ?? franja.apertura ?? franja.start);
  const pFin = parsearHora(franja.fin ?? franja.hasta ?? franja.cierre ?? franja.end);
  if (!pIni || !pFin) return null;

  let ini = pIni.hora;
  let fin = pFin.hora;
  if (!pIni.conMeridiano && ini >= 1 && ini < 6) ini += 12;
  if (!pFin.conMeridiano && fin < ini) {
    // "12:00 am" (00:00) como cierre
    if (fin === 0) fin = ini < 12 ? 12 : 24;
    else if (fin + 12 > ini && fin < 12) fin += 12;
  }
  return { ini, fin };
}

function generarSlotsParaDia(dayIndex, fechaISO = null) {
  // Si esa fecha tiene horario especial
  const especial = fechaISO ? horariosEspeciales[fechaISO] : null;
  const filas = especial ? [especial] : obtenerConfigsDia(dayIndex);

  // Sin configuración para ese día
  if (filas.length === 0) {
    if (dayIndex === 0) return [];
    return typeof TIME_SLOTS !== "undefined" ? [...TIME_SLOTS] : [];
  }

  const filasAbiertas = filas.filter((f) => !esVerdadero(f.cerrado));
  if (filasAbiertas.length === 0) return [];

  const horas = new Set();

  filasAbiertas.forEach((fila) => {
    leerFranjas(fila).forEach((franja) => {
      if (!franja) return;
      const rango = normalizarFranja(franja);
      if (!rango) {
        console.warn("[booking.js] Franja ilegible en horarios:", fila.dia, franja);
        return;
      }
      const { ini, fin } = rango;

      if (ini === fin) {
        // Franja de inicio = fin (ej. 03:30 pm a 03:30 pm)
        horas.add(ini);
        return;
      }

      for (let h = ini; h + 1 <= fin + 1e-9 && h < 24; h += 1) horas.add(h);
    });
  });

  let excluidasMin = new Set();
  let editadasMin = new Map();
  if (especial) {
    const leerJSON = (v) => {
      if (typeof v !== "string") return v;
      try {
        return JSON.parse(v);
      } catch {
        return null;
      }
    };
    const excl = leerJSON(especial.horas_excluidas);
    if (Array.isArray(excl)) {
      excluidasMin = new Set(
        excl
          .map(parsearHora)
          .filter(Boolean)
          .map((p) => Math.round(p.hora * 60))
      );
    }
    const edit = leerJSON(especial.horas_editadas);
    if (edit && typeof edit === "object" && !Array.isArray(edit)) {
      Object.entries(edit).forEach(([orig, nueva]) => {
        const po = parsearHora(orig);
        const pn = parsearHora(nueva);
        if (po && pn) editadasMin.set(Math.round(po.hora * 60), Math.round(pn.hora * 60));
      });
    }
  }

  const finalesMin = new Set();
  horas.forEach((h) => {
    const m = Math.round(h * 60);
    if (excluidasMin.has(m)) return;
    finalesMin.add(editadasMin.has(m) ? editadasMin.get(m) : m);
  });

  const slots = Array.from(finalesMin)
    .sort((a, b) => a - b)
    .map((m) => formatearHora12(m / 60));

  const teniaFranjas = filasAbiertas.some((f) => leerFranjas(f).length > 0);
  if (slots.length === 0 && teniaFranjas) {
    console.warn(
      `[booking.js] Día "${DIAS_CLAVE[dayIndex]}" abierto pero sin horas generadas. Revisa franjas en tabla horarios:`,
      filasAbiertas
    );
  }
  return slots;
}

// "2026-11-02" para una fecha local (sin pasar por UTC).
function fechaISOLocal(fecha) {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, "0");
  const d = String(fecha.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function turnoYaPaso(fecha, horaTexto, ahora = new Date()) {
  const p = parsearHora(horaTexto);
  if (!p) return false;
  const inicio = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  inicio.setMinutes(Math.round(p.hora * 60));
  return inicio.getTime() < ahora.getTime() + ANTICIPACION_MIN * 60 * 1000;
}

// Turnos que de verdad se pueden pedir ese día
function slotsReservables(fecha) {
  if (configCalendarioError) return [];
  const ahora = new Date();
  return generarSlotsParaDia(fecha.getDay(), fechaISOLocal(fecha)).filter(
    (t) => !turnoYaPaso(fecha, t, ahora)
  );
}

// Carga días bloqueados y horarios semanales desde Supabase.
async function cargarConfiguracionCalendario() {
  configCalendarioError = false;
  if (!window.supabaseClient) {
    configCalendarioError = true;
    return;
  }
  try {
    const [bloqueadosRes, horariosRes, especialesRes] = await Promise.all([
      window.supabaseClient.from("dias_bloqueados").select("fecha_iso"),
      window.supabaseClient.from("horarios").select("*"),
      window.supabaseClient.from("horarios_especiales").select("*"),
    ]);

    if (bloqueadosRes.error) {
      console.error("[booking.js] Error leyendo dias_bloqueados:", bloqueadosRes.error);
      configCalendarioError = true;
    }
    if (horariosRes.error) {
      console.error("[booking.js] Error leyendo horarios:", horariosRes.error);
      configCalendarioError = true;
    }
    if (especialesRes.error) console.warn("[booking.js] horarios_especiales no disponible:", especialesRes.error.message);

    if (bloqueadosRes.data) {
      diasBloqueados = bloqueadosRes.data.map((d) => String(d.fecha_iso).trim());
    }
    if (horariosRes.data) {
      horariosSemana = horariosRes.data;
    }
    if (especialesRes.data) {
      horariosEspeciales = {};
      especialesRes.data.forEach((f) => {
        horariosEspeciales[String(f.fecha_iso).trim().slice(0, 10)] = { ...f, dia: `especial ${f.fecha_iso}` };
      });
    }
  } catch (err) {
    console.error("Error consultando configuración del calendario:", err);
    configCalendarioError = true;
  }
  renderHorarioAtencion();
}

// Horario de atención (sección Ubicación)
const NOMBRES_DIA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

function horaLegible(horaDecimal) {
  // Espacio duro: "2:30 pm" nunca se parte en dos líneas.
  return formatearHora12(horaDecimal).replace(/^0/, "").replace(" ", " ");
}

// "Lunes, martes y jueves"
function unirDias(nombres) {
  if (nombres.length === 1) return nombres[0];
  const resto = nombres.slice(1).map((n) => n.toLowerCase());
  return `${nombres[0]}${resto.length > 1 ? ", " + resto.slice(0, -1).join(", ") : ""} y ${resto[resto.length - 1]}`;
}

function renderHorarioAtencion() {
  const lista = document.getElementById("horario-atencion");
  if (!lista || configCalendarioError || !horariosSemana.length) return;

  const grupos = new Map();
  [1, 2, 3, 4, 5, 6, 0].forEach((i) => {
    const filas = obtenerConfigsDia(i).filter((f) => !esVerdadero(f.cerrado));
    const rangos = filas
      .flatMap((f) => leerFranjas(f).map(normalizarFranja))
      .filter(Boolean)
      .sort((a, b) => a.ini - b.ini);
    if (!rangos.length) return; // cerrado: no se lista
    const clave = rangos.map((r) => `${r.ini}-${r.fin}`).join("|");
    const texto = rangos
      .map((r) => (r.ini === r.fin ? horaLegible(r.ini) : `${horaLegible(r.ini)} – ${horaLegible(r.fin)}`))
      .join(" y ");
    if (!grupos.has(clave)) grupos.set(clave, { dias: [], texto });
    grupos.get(clave).dias.push(NOMBRES_DIA[i]);
  });

  if (!grupos.size) return;
  lista.innerHTML = Array.from(grupos.values())
    .map((g) => `<li><span class="text-[#2B2B2B]">${unirDias(g.dias)}</span> · ${g.texto}</li>`)
    .join("");
}

document.addEventListener("DOMContentLoaded", async () => {
  bindOpenTriggers();
  bindModalControls();
  buildStepIndicator();
  configCalendarioPromise = cargarConfiguracionCalendario();
  await Promise.all([window.datosListos, configCalendarioPromise]);
  renderStepOneServices();
  renderCalendar();
  renderTimeSlots();
  bindClientForm();
});

// Apertura / cierre del modal
function bindOpenTriggers() {
  document.querySelectorAll(".js-open-booking").forEach((btn) => {
    btn.addEventListener("click", () => openBookingModal());
  });
}

const VALORACION = {
  id: "valoracion",
  nombre: "Valoración de piel",
  detalle: "Si no sabes cuál elegir, empezamos por aquí",
  duracion: 30,
  precio: null,
};

// Precio para mostrar; null = "a confirmar" (la valoración).
function precioLegible(precio) {
  return precio == null ? "Precio a confirmar" : formatCOP(precio);
}

function resolverSeleccion() {
  if (bookingState.serviceId === VALORACION.id) {
    return { id: null, imagen: null, nombre: VALORACION.nombre, duracion: VALORACION.duracion, precio: null, esValoracion: true };
  }
  const s = SERVICES.find((x) => x.id === bookingState.serviceId);
  if (!s) return null;
  const v = s.variantes?.find((x) => x.id === bookingState.varianteId);
  if (s.variantes?.length && !v) return null;
  return {
    id: s.id,
    imagen: s.imagen,
    nombre: v ? `${s.nombre} · ${v.nombre}` : s.nombre,
    duracion: v ? v.duracion : s.duracion,
    precio: v ? v.precio : s.precio,
  };
}

function opcionesReserva() {
  return SERVICES.flatMap((s) =>
    s.variantes?.length
      ? s.variantes.map((v) => ({
          key: `${s.id}::${v.id}`,
          categoria: s.categoria,
          servicioId: s.id,
          varianteId: v.id,
          imagen: s.imagen,
          nombre: `${s.nombre} · ${v.nombre}`,
          duracion: v.duracion,
          precio: v.precio,
        }))
      : [
          {
            key: s.id,
            categoria: s.categoria,
            servicioId: s.id,
            varianteId: null,
            imagen: s.imagen,
            nombre: s.nombre,
            duracion: s.duracion,
            precio: s.precio,
          },
        ]
  );
}

function preseleccionarServicio(serviceId, varianteId) {
  if (serviceId === VALORACION.id) {
    bookingState.serviceId = VALORACION.id;
    bookingState.varianteId = null;
    return;
  }
  const svc = SERVICES.find((x) => x.id === serviceId);
  if (!svc) return;
  bookingState.serviceId = svc.id;
  if (svc.variantes?.length) {
    const v = svc.variantes.find((x) => x.id === varianteId) ?? svc.variantes[0];
    bookingState.varianteId = v.id;
  } else {
    bookingState.varianteId = null;
  }
}

// Diálogo accesible
let focoAntesDelModal = null;

const SELECTOR_ENFOCABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Elementos con los que se puede interactuar dentro del panel
function enfocablesDelModal() {
  const panel = document.querySelector("#booking-modal .booking-panel");
  if (!panel) return [];
  return [...panel.querySelectorAll(SELECTOR_ENFOCABLE)].filter(
    (el) => el.offsetParent !== null || el === document.activeElement
  );
}

// Todo lo que no es el modal queda inerte
function fondoInerte(activo) {
  const modal = document.getElementById("booking-modal");
  [...document.body.children].forEach((el) => {
    if (el === modal || el.tagName === "SCRIPT") return;
    el.inert = activo;
  });
}

function atraparFoco(e) {
  const modal = document.getElementById("booking-modal");
  if (e.key !== "Tab" || !modal || modal.hidden) return;
  const items = enfocablesDelModal();
  if (!items.length) return;
  const primero = items[0];
  const ultimo = items[items.length - 1];
  const panel = modal.querySelector(".booking-panel");
  if (e.shiftKey && (document.activeElement === primero || document.activeElement === panel)) {
    e.preventDefault();
    ultimo.focus();
  } else if (!e.shiftKey && document.activeElement === ultimo) {
    e.preventDefault();
    primero.focus();
  }
}

window.openBookingModal = async function (serviceId = null, varianteId = null) {
  resetBookingState();

  const modal = document.getElementById("booking-modal");
  if (modal.hidden) focoAntesDelModal = document.activeElement;
  modal.hidden = false;
  document.body.style.overflow = "hidden";
  fondoInerte(true);
  const panel = modal.querySelector(".booking-panel");
  requestAnimationFrame(() => {
    panel.classList.add("scale-100", "opacity-100");
  });
  // El foco entra al diálogo
  panel.focus({ preventScroll: true });

  goToStep(1, { enfocar: false });

  if (!SERVICES.length && !window.catalogoError) {
    const panel = document.getElementById("step-panel-1");
    if (panel) panel.innerHTML = `<p class="text-sm text-[#6b6464] italic animate-pulse">Cargando tratamientos…</p>`;
    await window.datosListos;
  }
  if (serviceId) preseleccionarServicio(serviceId, varianteId);
  renderStepOneServices();

  configCalendarioPromise = cargarConfiguracionCalendario();
  await configCalendarioPromise;

  renderCalendar();
  renderTimeSlots();
};

function closeBookingModal() {
  const modal = document.getElementById("booking-modal");
  if (modal.hidden) return;
  modal.querySelector(".booking-panel").classList.remove("scale-100", "opacity-100");
  document.body.style.overflow = "";
  fondoInerte(false);
  // El foco vuelve al botón que abrió la reserva.
  if (focoAntesDelModal && document.contains(focoAntesDelModal)) {
    focoAntesDelModal.focus({ preventScroll: true });
  }
  focoAntesDelModal = null;
  setTimeout(() => (modal.hidden = true), 200);
}

function bindModalControls() {
  document.getElementById("booking-close")?.addEventListener("click", closeBookingModal);
  document.getElementById("booking-overlay")?.addEventListener("click", closeBookingModal);
  document.addEventListener("keydown", (e) => {
    const modal = document.getElementById("booking-modal");
    if (!modal || modal.hidden) return;
    if (e.key === "Escape") closeBookingModal();
    else atraparFoco(e);
  });

  document.getElementById("booking-next")?.addEventListener("click", handleNext);
  document.getElementById("booking-back")?.addEventListener("click", handleBack);
  document.getElementById("booking-confirm")?.addEventListener("click", confirmBooking);
  document.getElementById("booking-finish")?.addEventListener("click", () => {
    closeBookingModal();
  });
}

function resetBookingState() {
  bookingState.step = 1;
  bookingState.serviceId = null;
  bookingState.varianteId = null;
  bookingState.date = null;
  bookingState.time = null;
  bookingState.cliente = { nombre: "", telefono: "", email: "" };
  calendarViewDate = new Date();
  if (icsUrlActual) {
    URL.revokeObjectURL(icsUrlActual);
    icsUrlActual = null;
  }

  document.getElementById("client-form")?.reset();
  ["client-name", "client-phone", "client-email"].forEach((id) => marcarCampo(id, null));
  mostrarAviso(null);
  document.getElementById("booking-success")?.classList.add("hidden");
  document.getElementById("booking-summary-wrap")?.classList.remove("hidden");
  document.getElementById("booking-footer")?.classList.remove("hidden");
}

// Indicador de pasos
const STEP_LABELS = ["Servicio", "Fecha y hora", "Tus datos", "Confirmación"];

function buildStepIndicator() {
  const wrap = document.getElementById("step-indicator");
  if (!wrap) return;
  wrap.setAttribute("aria-hidden", "true");
  wrap.innerHTML = STEP_LABELS.map(
    (label, i) => `
    <div class="flex items-center ${i < STEP_LABELS.length - 1 ? "flex-1" : ""}">
      <div class="flex flex-col items-center gap-1">
        <div class="step-dot" data-step="${i + 1}">${i + 1}</div>
        <span class="hidden sm:block text-[11px] text-[#6b6464]">${label}</span>
      </div>
      ${i < STEP_LABELS.length - 1 ? '<div class="step-line" data-line="' + (i + 1) + '"></div>' : ""}
    </div>`
  ).join("");
}

function updateStepIndicator() {
  document.querySelectorAll(".step-dot").forEach((dot) => {
    const step = Number(dot.dataset.step);
    dot.classList.toggle("is-active", step === bookingState.step);
    dot.classList.toggle("is-complete", step < bookingState.step);
    dot.textContent = step < bookingState.step ? "✓" : String(step);
  });
  document.querySelectorAll(".step-line").forEach((line) => {
    const step = Number(line.dataset.line);
    line.classList.toggle("is-complete", step < bookingState.step);
  });
  const estado = document.getElementById("step-status");
  if (estado) {
    estado.textContent =
      bookingState.step > STEP_LABELS.length
        ? "Tu horario quedó apartado"
        : `Paso ${bookingState.step} de ${STEP_LABELS.length}: ${STEP_LABELS[bookingState.step - 1]}`;
  }
}

function mostrarAviso(html) {
  const el = document.getElementById("booking-alert");
  if (!el) return;
  if (!html) {
    el.classList.add("hidden");
    el.innerHTML = "";
    return;
  }
  el.innerHTML = `<i data-lucide="circle-alert" class="estado-error-icono"></i><p class="estado-error-texto">${html}</p>`;
  el.classList.remove("hidden");
  if (window.lucide) lucide.createIcons();
  el.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

async function goToStep(step, { aviso = null, enfocar = true } = {}) {
  mostrarAviso(aviso);
  bookingState.step = step;
  document.querySelectorAll(".booking-step").forEach((el) => {
    el.classList.toggle("is-active", Number(el.dataset.step) === step);
  });
  updateStepIndicator();
  // Sin scroll anidado, el paso 1 es largo
  const panel = document.querySelector("#booking-modal .booking-panel");
  if (panel) panel.scrollTop = 0;
  if (enfocar) {
    document.querySelector(`.booking-step[data-step="${step}"] h4`)?.focus({ preventScroll: true });
  }

  document.getElementById("booking-back").classList.toggle("invisible", step === 1);
  document.getElementById("booking-next").classList.toggle("hidden", step === 4);
  document.getElementById("booking-confirm").classList.toggle("hidden", step !== 4);

  if (step === 2) {
    if (configCalendarioPromise) await configCalendarioPromise;
    renderCalendar();
    renderTimeSlots();
  }
  if (step === 4) renderSummary();
}

function handleNext() {
  if (bookingState.step === 1 && !resolverSeleccion()) {
    shake("#step-panel-1");
    mostrarAviso("Elige un tratamiento para continuar.");
    return;
  }
  if (bookingState.step === 2 && (!bookingState.date || !bookingState.time)) {
    shake("#step-panel-2");
    mostrarAviso(bookingState.date ? "Elige una hora para continuar." : "Elige una fecha y una hora para continuar.");
    return;
  }
  if (bookingState.step === 2 && turnoYaPaso(bookingState.date, bookingState.time)) {
    bookingState.time = null;
    renderCalendar();
    renderTimeSlots();
    mostrarAviso("Esa hora ya pasó mientras elegías. Escoge otra.");
    return;
  }
  if (bookingState.step === 3 && !validateClientForm()) {
    return;
  }
  goToStep(Math.min(4, bookingState.step + 1));
}

function handleBack() {
  goToStep(Math.max(1, bookingState.step - 1));
}

function shake(selector) {
  const el = document.querySelector(selector);
  if (!el) return;
  el.animate(
    [
      { transform: "translateX(0)" },
      { transform: "translateX(-6px)" },
      { transform: "translateX(6px)" },
      { transform: "translateX(0)" },
    ],
    { duration: 300 }
  );
}

// Paso 1: Selección de servicio
function renderStepOneServices() {
  const wrap = document.getElementById("step-panel-1");
  if (!wrap || typeof SERVICES === "undefined") return;

  if (window.catalogoError || !SERVICES.length) {
    wrap.innerHTML = htmlEstadoError({
      titulo: "No se pudieron cargar los tratamientos",
      texto: "Vuelve a intentarlo o escríbeme y agendamos por WhatsApp.",
      reintentar: "paso1-reintentar",
      compacto: true,
    });
    if (window.lucide) lucide.createIcons();
    const btn = document.getElementById("paso1-reintentar");
    btn?.addEventListener("click", async () => {
      btn.disabled = true;
      btn.textContent = "Cargando…";
      await window.recargarCatalogo();
      renderStepOneServices();
      window.renderCatalogo?.();
    });
    return;
  }

  const keyActual = bookingState.varianteId
    ? `${bookingState.serviceId}::${bookingState.varianteId}`
    : bookingState.serviceId;

  const opcion = (o, visual) => `
    <label class="service-choice flex items-center gap-3 min-[360px]:gap-4 border-2 border-[#eadde2] rounded-xl p-3 sm:p-4 ${
      keyActual === o.key ? "is-selected" : ""
    }" data-service-choice="${o.key}">
      <input type="radio" name="booking-servicio" value="${o.key}" class="sr-only"
        ${keyActual === o.key ? "checked" : ""} />
      ${visual}
      <span class="flex-1 min-w-0">
        <span class="block font-display font-semibold leading-snug">${o.nombre}</span>
        ${o.detalle ? `<span class="block text-xs text-[#6b6464] mt-0.5">${o.detalle}</span>` : ""}
        <span class="flex items-baseline flex-wrap gap-x-2 mt-1 text-xs text-[#6b6464]">
          <span>${o.duracion} min</span>
          <span class="sm:hidden font-display text-sm font-semibold text-[#AE2967]">${precioLegible(o.precio)}</span>
        </span>
      </span>
      <span class="hidden sm:block font-display font-semibold text-[#AE2967] whitespace-nowrap">${precioLegible(o.precio)}</span>
    </label>`;
  const foto = (src) =>
    `<img src="${src}" alt="" class="w-12 h-12 min-[360px]:w-16 min-[360px]:h-16 rounded-lg object-cover flex-shrink-0" />`;
  const iconoValoracion = `
    <span class="w-12 h-12 min-[360px]:w-16 min-[360px]:h-16 rounded-lg bg-[#FDE8EF] flex items-center justify-center flex-shrink-0">
      <i data-lucide="sparkles" class="w-6 h-6 text-[#AE2967]"></i>
    </span>`;

  // Agrupado por categoría, en el mismo orden que el catálogo
  const opciones = opcionesReserva();
  const categorias = categoriasEnOrden();
  const conocidas = new Set(categorias.map((c) => c.id));
  const grupos = [
    ...categorias.map((c) => ({ titulo: c.nombre, items: opciones.filter((o) => o.categoria === c.id) })),
    { titulo: "Otros", items: opciones.filter((o) => !conocidas.has(o.categoria)) },
  ].filter((g) => g.items.length);

  wrap.innerHTML =
    opcion({ key: VALORACION.id, ...VALORACION }, iconoValoracion) +
    grupos
      .map(
        (g) => `
    <p class="booking-grupo">${g.titulo}</p>
    ${g.items.map((o) => opcion(o, foto(o.imagen))).join("")}`
      )
      .join("");
  if (window.lucide) lucide.createIcons();

  wrap.querySelectorAll('input[name="booking-servicio"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      const [sid, vid] = radio.value.split("::");
      bookingState.serviceId = sid;
      bookingState.varianteId = vid || null;
      mostrarAviso(null);
      wrap.querySelectorAll(".service-choice").forEach((c) =>
        c.classList.toggle("is-selected", c.contains(radio))
      );
    });
  });

  const elegida = wrap.querySelector(".service-choice.is-selected");
  const panel = wrap.closest(".booking-panel");
  if (elegida && panel) {
    const r = elegida.getBoundingClientRect();
    const p = panel.getBoundingClientRect();
    panel.scrollTop += r.top - p.top - (p.height - r.height) / 2;
  }
}

// Paso 2: Calendario + horarios
const MONTHS_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const DAYS_ES = ["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sa"];

function renderCalendar() {
  const grid = document.getElementById("calendar-grid");
  const label = document.getElementById("calendar-month-label");
  if (!grid || !label) return;

  const year = calendarViewDate.getFullYear();
  const month = calendarViewDate.getMonth();
  label.textContent = `${MONTHS_ES[month]} ${year}`;

  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let cells = "";
  DAYS_ES.forEach((d) => {
    cells += `<div class="text-center text-[11px] font-semibold text-[#6b6464] py-1">${d}</div>`;
  });
  for (let i = 0; i < startOffset; i++) cells += `<div></div>`;

  for (let day = 1; day <= daysInMonth; day++) {
    const dateObj = new Date(year, month, day);
    const mesIso = String(month + 1).padStart(2, "0");
    const diaIso = String(day).padStart(2, "0");
    const fechaActualISO = `${year}-${mesIso}-${diaIso}`;

    const isPast = dateObj < today;
    const isClosedDay = isPast || slotsReservables(dateObj).length === 0;
    const isBlocked = diasBloqueados.includes(fechaActualISO);

    const isDisabled = isPast || isClosedDay || isBlocked;
    const isToday = dateObj.getTime() === today.getTime();
    const isSelected =
      bookingState.date && dateObj.toDateString() === bookingState.date.toDateString();

    const etiqueta = `${fechaLegible(dateObj)}${isToday ? ", hoy" : ""}${isDisabled ? ", sin horarios" : ""}`;
    cells += `<div class="calendar-day ${isDisabled ? "is-disabled" : ""} ${
      isToday ? "is-today" : ""
    } ${isSelected ? "is-selected" : ""}"
      data-day="${day}" aria-label="${etiqueta}"
      ${isDisabled ? 'aria-disabled="true"' : `role="button" tabindex="0" aria-pressed="${Boolean(isSelected)}"`}>
      ${day}
    </div>`;
  }

  grid.innerHTML = cells;

  grid.querySelectorAll(".calendar-day:not(.is-disabled)").forEach((cell) => {
    const selectDay = () => {
      bookingState.date = new Date(year, month, Number(cell.dataset.day));
      bookingState.time = null; // Reinicia la hora al cambiar de día
      mostrarAviso(null);
      renderCalendar();
      // El repintado destruye la celda enfocada
      grid.querySelector(".calendar-day.is-selected")?.focus({ preventScroll: true });
      renderTimeSlots();
    };
    cell.addEventListener("click", selectDay);
    cell.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        selectDay();
      }
    });
  });
}

function changeCalendarMonth(offset) {
  const now = new Date();
  const candidate = new Date(
    calendarViewDate.getFullYear(),
    calendarViewDate.getMonth() + offset,
    1
  );
  if (
    candidate.getFullYear() < now.getFullYear() ||
    (candidate.getFullYear() === now.getFullYear() && candidate.getMonth() < now.getMonth())
  ) {
    return;
  }
  calendarViewDate = candidate;
  renderCalendar();
}

async function renderTimeSlots() {
  const wrap = document.getElementById("time-slots");
  if (!wrap) return;

  const pintarError = (texto) => {
    wrap.innerHTML = `<div class="col-span-full">${htmlEstadoError({
      titulo: "No se pudo verificar la disponibilidad",
      texto,
      reintentar: "horarios-reintentar",
      compacto: true,
    })}</div>`;
    if (window.lucide) lucide.createIcons();
    const btn = document.getElementById("horarios-reintentar");
    btn?.addEventListener("click", async () => {
      btn.disabled = true;
      btn.textContent = "Consultando…";
      configCalendarioPromise = cargarConfiguracionCalendario();
      await configCalendarioPromise;
      renderCalendar();
      renderTimeSlots();
    });
  };

  if (configCalendarioError) {
    pintarError("Para no ofrecerte una hora que no existe, prefiero no mostrarte horarios. Reintenta o escríbeme por WhatsApp.");
    return;
  }

  if (!bookingState.date) {
    wrap.innerHTML = `<p class="text-sm text-[#6b6464] italic col-span-full">Elige primero una fecha disponible.</p>`;
    return;
  }

  const currentRequestId = ++renderSlotsRequestId;

  if (configCalendarioPromise) {
    await configCalendarioPromise;
  }
  if (currentRequestId !== renderSlotsRequestId) return;

  const fechaISO = fechaISOLocal(bookingState.date);

  wrap.innerHTML = `<p class="text-sm text-[#6b6464] italic col-span-full animate-pulse">Consultando disponibilidad…</p>`;

  const slotsDinamicos = slotsReservables(bookingState.date);

  if (slotsDinamicos.length === 0) {
    wrap.innerHTML = `<p class="text-sm text-[#6b6464] col-span-full">Ya no quedan horarios para este día. Elige otra fecha.</p>`;
    return;
  }

  let horasOcupadas = null;
  try {
    const { data, error } = await window.supabaseClient
      .from("citas")
      .select("hora")
      .eq("fecha_iso", fechaISO)
      .neq("estado", "cancelado");

    if (error) {
      console.error("[booking.js] Error al consultar horas ocupadas:", error);
    } else {
      horasOcupadas = (data ?? []).map((c) => normalizarHoraCita(c.hora));
    }
  } catch (err) {
    console.error("[booking.js] Error al consultar horas ocupadas:", err);
  }

  if (currentRequestId !== renderSlotsRequestId) return;

  if (horasOcupadas === null) {
    pintarError("No pude confirmar qué horas siguen libres ese día. Reintenta o escríbeme por WhatsApp.");
    return;
  }

  wrap.innerHTML = slotsDinamicos
    .map((t) => {
      const estaOcupado = horasOcupadas.includes(normalizarHoraCita(t));
      return `
      <button type="button" data-time="${t}" ${estaOcupado ? "disabled" : ""}
        aria-pressed="${bookingState.time === t}"
        class="time-slot border-2 border-[#eadde2] rounded-lg py-2 text-sm font-medium transition-all ${
          estaOcupado
            ? "opacity-35 bg-gray-100 cursor-not-allowed line-through text-gray-400 border-gray-200"
            : ""
        } ${bookingState.time === t ? "is-selected" : ""}">
        ${t}${estaOcupado ? " (Ocupado)" : ""}
      </button>`;
    })
    .join("");

  wrap.querySelectorAll(".time-slot:not([disabled])").forEach((btn) => {
    btn.addEventListener("click", () => {
      bookingState.time = btn.dataset.time;
      mostrarAviso(null);
      wrap.querySelectorAll(".time-slot").forEach((b) => {
        b.classList.toggle("is-selected", b === btn);
        b.setAttribute("aria-pressed", String(b === btn));
      });
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("calendar-prev")?.addEventListener("click", () => changeCalendarMonth(-1));
  document.getElementById("calendar-next")?.addEventListener("click", () => changeCalendarMonth(1));
});

// Paso 3: Datos del cliente
function bindClientForm() {
  const form = document.getElementById("client-form");
  if (!form) return;
  form.addEventListener("input", (e) => {
    if (e.target?.classList.contains("is-invalid")) marcarCampo(e.target.id, null);
    bookingState.cliente.nombre = document.getElementById("client-name").value.trim();
    bookingState.cliente.telefono = document.getElementById("client-phone").value.trim();
    bookingState.cliente.email = document.getElementById("client-email").value.trim();
  });
}

function marcarCampo(id, mensaje) {
  const el = document.getElementById(id);
  const err = document.getElementById(`${id}-error`);
  if (!el) return;
  el.classList.toggle("is-invalid", Boolean(mensaje));
  el.setAttribute("aria-invalid", mensaje ? "true" : "false");
  if (err) {
    err.textContent = mensaje ?? "";
    err.classList.toggle("hidden", !mensaje);
  }
}

function telefonoValido(valor) {
  const limpio = valor.trim();
  if (!/^\+?[\d\s().-]+$/.test(limpio)) return false;
  const digitos = limpio.replace(/\D/g, "").length;
  return digitos >= 7 && digitos <= 15;
}

function validateClientForm() {
  const nameEl = document.getElementById("client-name");
  const phoneEl = document.getElementById("client-phone");
  const emailEl = document.getElementById("client-email");

  const errores = {
    "client-name": nameEl.value.trim() ? null : "Escribe tu nombre para saber a quién esperar.",
    "client-phone": telefonoValido(phoneEl.value)
      ? null
      : "Escribe un teléfono de 7 a 15 dígitos, por ejemplo 300 123 4567.",
    "client-email": !emailEl.value.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailEl.value.trim())
      ? null
      : "Revisa el correo; debe verse como maria@correo.com. Si prefieres, déjalo vacío.",
  };
  Object.entries(errores).forEach(([id, msg]) => marcarCampo(id, msg));

  const valid = Object.values(errores).every((m) => !m);
  if (!valid) {
    const primero = Object.keys(errores).find((id) => errores[id]);
    document.getElementById(primero)?.focus();
  }

  if (valid) {
    bookingState.cliente = {
      nombre: nameEl.value.trim(),
      telefono: phoneEl.value.trim(),
      email: emailEl.value.trim(),
    };
  }
  return valid;
}

function fechaLegible(fecha) {
  if (!fecha) return "—";
  const texto = fecha.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function renderSummary() {
  const wrap = document.getElementById("booking-summary");
  if (!wrap) return;
  const service = resolverSeleccion();
  const fecha = fechaLegible(bookingState.date);

  wrap.innerHTML = `
    <div class="flex justify-between py-2 border-b border-[#f1dbe3]">
      <span class="text-[#6b6464]">Tratamiento</span>
      <span class="font-semibold text-right">${service?.nombre ?? "—"}</span>
    </div>
    <div class="flex justify-between py-2 border-b border-[#f1dbe3]">
      <span class="text-[#6b6464]">Fecha</span>
      <span class="font-semibold text-right">${fecha}</span>
    </div>
    <div class="flex justify-between py-2 border-b border-[#f1dbe3]">
      <span class="text-[#6b6464]">Hora</span>
      <span class="font-semibold text-right">${bookingState.time ?? "—"}</span>
    </div>
    <div class="flex justify-between py-2 border-b border-[#f1dbe3]">
      <span class="text-[#6b6464]">Cliente</span>
      <span class="font-semibold text-right">${escaparHTML(bookingState.cliente.nombre)}</span>
    </div>
    <div class="flex justify-between py-2${bookingState.cliente.email ? " border-b border-[#f1dbe3]" : ""}">
      <span class="text-[#6b6464]">Teléfono</span>
      <span class="font-semibold text-right">${escaparHTML(bookingState.cliente.telefono)}</span>
    </div>${bookingState.cliente.email ? `
    <div class="flex justify-between gap-4 py-2">
      <span class="text-[#6b6464]">Correo</span>
      <span class="font-semibold text-right break-all">${escaparHTML(bookingState.cliente.email)}</span>
    </div>` : ""}
    <div class="flex justify-between pt-4 mt-2 border-t-2 border-[#AE2967]">
      <span class="font-display font-semibold">Total</span>
      <span class="font-display font-semibold text-[#AE2967] text-right">${
        service?.esValoracion ? "Te confirmo el valor por WhatsApp" : formatCOP(service?.precio ?? 0)
      }</span>
    </div>
  `;
}

function escaparHTML(texto) {
  return String(texto ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function escaparICS(texto) {
  return String(texto ?? "").replace(/\\/g, "\\\\").replace(/([,;])/g, "\\$1").replace(/\r?\n/g, "\\n");
}

const DIRECCION_ESTUDIO = "Conjunto cerrado La Rayuela, casa B15, Villa del Rosario, Norte de Santander";

function mensajeSolicitud(servicio) {
  return [
    "¡Hola Maivy! Acabo de solicitar una cita desde la página ✨",
    "",
    `👤 *Cliente:* ${bookingState.cliente.nombre}`,
    `📱 *Teléfono:* ${bookingState.cliente.telefono}`,
    ...(bookingState.cliente.email ? [`✉️ *Correo:* ${bookingState.cliente.email}`] : []),
    `💆‍♀️ *Servicio:* ${servicio.nombre}`,
    `📅 *Fecha:* ${fechaLegible(bookingState.date)}`,
    `⏰ *Hora:* ${bookingState.time}`,
    "",
    "¿Me la confirmas?",
  ].join("\n");
}

function crearArchivoCalendario(servicio, duracionMin) {
  const p = parsearHora(bookingState.time);
  const inicio = new Date(bookingState.date);
  inicio.setHours(0, 0, 0, 0);
  inicio.setMinutes(Math.round((p?.hora ?? 9) * 60));
  const fin = new Date(inicio.getTime() + duracionMin * 60 * 1000);

  const local = (d) =>
    `${fechaISOLocal(d).replace(/-/g, "")}T${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}00`;
  const sello = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Maivy Jireth Cosmetologa//Reservas//ES",
    "BEGIN:VEVENT",
    `UID:${Date.now()}-${Math.random().toString(36).slice(2)}@maivyjireth`,
    `DTSTAMP:${sello}`,
    `SUMMARY:${escaparICS(`Cita: ${servicio.nombre} - Maivy Jireth`)}`,
    `DESCRIPTION:${escaparICS(`Solicitud de cita con Maivy Jireth Cosmetóloga.\nServicio: ${servicio.nombre}\nMaivy te confirma por WhatsApp.`)}`,
    `LOCATION:${escaparICS(DIRECCION_ESTUDIO)}`,
    `DTSTART:${local(inicio)}`,
    `DTEND:${local(fin)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  if (icsUrlActual) URL.revokeObjectURL(icsUrlActual);
  icsUrlActual = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
  return icsUrlActual;
}

// Pantalla final
function mostrarSolicitudEnviada(servicio, duracionMin) {
  const resumen = document.getElementById("booking-success-resumen");
  if (resumen) {
    resumen.innerHTML = [
      ["Tratamiento", servicio.nombre],
      ["Fecha", fechaLegible(bookingState.date)],
      ["Hora", bookingState.time],
      ["Duración", `${servicio.duracion} min`],
      ...(servicio.esValoracion ? [["Valor", "Te lo confirmo por WhatsApp"]] : []),
    ]
      .map(
        ([k, v]) => `
        <div class="flex justify-between gap-4 py-2 border-b border-[#f1dbe3] last:border-0">
          <dt class="text-[#6b6464]">${k}</dt>
          <dd class="font-semibold text-right">${escaparHTML(v)}</dd>
        </div>`
      )
      .join("");
  }

  const texto = document.getElementById("booking-success-texto");
  if (texto) {
    texto.textContent = `Ya está en mi agenda. Si me escribes por WhatsApp te confirmo más rápido; si no, yo te escribo al ${bookingState.cliente.telefono.replace(/ /g, " ")}.`;
  }

  const wa = document.getElementById("booking-whatsapp");
  if (wa) wa.href = enlaceWhatsApp(mensajeSolicitud(servicio));
  const ics = document.getElementById("booking-ics");
  if (ics) ics.href = crearArchivoCalendario(servicio, duracionMin);

  document.getElementById("booking-summary-wrap").classList.add("hidden");
  document.getElementById("booking-footer").classList.add("hidden");
  document.getElementById("booking-success").classList.remove("hidden");
  // Los cuatro pasos quedan con su ✓.
  bookingState.step = STEP_LABELS.length + 1;
  updateStepIndicator();
  if (window.lucide) lucide.createIcons();
  document.querySelector("#booking-modal .booking-panel")?.scrollTo({ top: 0 });
  wa?.focus({ preventScroll: true });
}

async function confirmBooking() {
  if (!validateClientForm()) {
    await goToStep(3, { enfocar: false });
    validateClientForm();
    return;
  }

  const servicio = resolverSeleccion();
  if (!servicio) {
    goToStep(1, { aviso: "Falta elegir el tratamiento." });
    return;
  }
  if (!bookingState.date || !bookingState.time) {
    goToStep(2, { aviso: "Falta elegir la fecha y la hora." });
    return;
  }
  if (turnoYaPaso(bookingState.date, bookingState.time)) {
    bookingState.time = null;
    goToStep(2, { aviso: "Esa hora ya no se puede reservar porque está muy cerca o ya pasó. Elige otra." });
    return;
  }

  const confirmBtn = document.getElementById("booking-confirm");
  const textoBoton = confirmBtn.textContent;
  confirmBtn.disabled = true;
  confirmBtn.textContent = "Enviando…";

  const duracionMin = parseInt(String(servicio.duracion).split(" ")[0], 10) || 60;

  try {
    const supabase = window.supabaseClient;
    if (!supabase) throw new Error("Supabase no está disponible");

    const { error } = await supabase.from("citas").insert({
      fecha_iso: fechaISOLocal(bookingState.date),
      hora: bookingState.time,
      cliente: bookingState.cliente.nombre,
      contacto: bookingState.cliente.telefono,
      email: bookingState.cliente.email,
      servicio_id: servicio.id,
      servicio_nombre: servicio.nombre,
      estado: "pendiente",
      duracion_min: duracionMin,
      precio: servicio.precio,
    });

    if (error) {
      if (error.code === "23505") {
        bookingState.time = null;
        goToStep(2, { aviso: "Alguien acaba de tomar ese horario. Elige otra hora; tus datos siguen guardados." });
        return;
      }
      throw error;
    }

    mostrarSolicitudEnviada(servicio, duracionMin);
  } catch (err) {
    console.error("[booking.js] Error al guardar la cita en Supabase:", err);
    mostrarAviso(
      `No se pudo enviar tu solicitud. Revisa tu conexión e inténtalo de nuevo, o
       <a href="${enlaceWhatsApp(mensajeSolicitud(servicio))}" target="_blank" rel="noopener" class="estado-error-link">envíamela por WhatsApp</a>.`
    );
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.textContent = textoBoton;
  }
}

window.depurarHorarios = async function () {
  await cargarConfiguracionCalendario();
  const filas = DIAS_CLAVE.map((clave, i) => {
    const rows = obtenerConfigsDia(i);
    return {
      dia: clave,
      filas: rows.length,
      cerrado: rows.map((r) => String(r.cerrado)).join(" | "),
      franjas_crudas: rows.map((r) => JSON.stringify(r.franjas)).join(" | "),
      horas_generadas: generarSlotsParaDia(i).join(", "),
    };
  });
  console.table(filas);
  return filas;
};