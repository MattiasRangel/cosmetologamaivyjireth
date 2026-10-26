/**
 * booking.js — flujo de reserva de citas en 4 pasos.
 * Maivy es la única cosmetóloga, así que no existe paso de "profesional".
 */

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
let horariosEspeciales = {}; // { "2026-10-21": fila } — horario puntual que reemplaza al semanal ese día
let configCalendarioPromise = null;
let renderSlotsRequestId = 0;

const DIAS_CLAVE = [
  "domingo",
  "lunes",
  "martes",
  "miercoles",
  "jueves",
  "viernes",
  "sabado",
];

/** Normaliza texto quitando tildes, espacios extra y pasando a minúsculas ("Miércoles " -> "miercoles"). */
function normalizarDia(texto) {
  return String(texto || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Todas las filas de `horarios` que corresponden a un día (0 = domingo .. 6 = sábado). */
function obtenerConfigsDia(dayIndex) {
  const clave = DIAS_CLAVE[dayIndex];
  if (!Array.isArray(horariosSemana) || horariosSemana.length === 0) return [];
  return horariosSemana.filter((h) => normalizarDia(h.dia) === clave);
}

/** Interpreta `cerrado` aunque llegue como true/"true"/"t"/1/"si". */
function esVerdadero(v) {
  if (v === true || v === 1) return true;
  return ["true", "t", "1", "si", "sí", "yes"].includes(String(v ?? "").trim().toLowerCase());
}

/**
 * "HH:MM", "HH:MM:SS", "9 am", "09:30 p. m." -> { hora: decimal 0..24, conMeridiano }.
 * Devuelve null si no se puede leer.
 */
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

/** Formatea una hora decimal (9 -> "09:00 am", 14.5 -> "02:30 pm"), formato que usa la tabla citas. */
function formatearHora12(horaDecimal) {
  const h24 = Math.floor(horaDecimal + 1e-9);
  const min = Math.round((horaDecimal - h24) * 60);
  const ampm = h24 >= 12 ? "pm" : "am";
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;
  return `${String(h12).padStart(2, "0")}:${String(min).padStart(2, "0")} ${ampm}`;
}

/** Normaliza una hora guardada en `citas` ("9:00 AM", "09:00 am", "09:00") a "09:00 am". */
function normalizarHoraCita(valor) {
  const p = parsearHora(valor);
  if (!p) return String(valor || "").trim().toLowerCase();
  return formatearHora12(p.hora);
}

/** Lee las franjas de una fila de `horarios` (array, JSON string o nombres de clave alternos). */
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

/**
 * Extrae la lista de horarios ("09:00 am", etc.) para un día de la semana (0..6).
 * Tolera filas duplicadas, `cerrado` como texto, claves alternas y errores
 * típicos de captura (ej. "06:00" queriendo decir 6:00 pm).
 */
function generarSlotsParaDia(dayIndex, fechaISO = null) {
  // Si esa fecha tiene horario especial (tabla horarios_especiales), reemplaza al semanal.
  const especial = fechaISO ? horariosEspeciales[fechaISO] : null;
  const filas = especial ? [especial] : obtenerConfigsDia(dayIndex);

  // Sin configuración para ese día: domingo cerrado, lunes a sábado usa TIME_SLOTS de respaldo.
  if (filas.length === 0) {
    if (dayIndex === 0) return [];
    return typeof TIME_SLOTS !== "undefined" ? [...TIME_SLOTS] : [];
  }

  // Si hay filas duplicadas para el mismo día, se usan todas las que NO estén cerradas.
  const filasAbiertas = filas.filter((f) => !esVerdadero(f.cerrado));
  if (filasAbiertas.length === 0) return [];

  const horas = new Set();

  filasAbiertas.forEach((fila) => {
    leerFranjas(fila).forEach((franja) => {
      if (!franja) return;
      const rawIni = franja.inicio ?? franja.desde ?? franja.apertura ?? franja.start;
      const rawFin = franja.fin ?? franja.hasta ?? franja.cierre ?? franja.end;
      const pIni = parsearHora(rawIni);
      const pFin = parsearHora(rawFin);
      if (!pIni || !pFin) {
        console.warn("[booking.js] Franja ilegible en horarios:", fila.dia, franja);
        return;
      }

      let ini = pIni.hora;
      let fin = pFin.hora;

      // Turno de tarde capturado sin am/pm (ej. "02:00" a "06:00"): se pasa a 24h.
      if (!pIni.conMeridiano && ini >= 1 && ini < 6) ini += 12;
      if (!pFin.conMeridiano && fin < ini) {
        // "12:00 am" (00:00) como cierre: si abre en la mañana casi seguro quiso decir mediodía.
        if (fin === 0) fin = ini < 12 ? 12 : 24;
        else if (fin + 12 > ini && fin < 12) fin += 12;
      }

      if (ini === fin) {
        // Franja de inicio = fin (ej. 03:30 pm a 03:30 pm): un único turno a esa hora.
        horas.add(ini);
        return;
      }

      // Turnos de 1 hora contados desde el inicio de la franja (14:30 -> 14:30, 15:30, ...).
      // El turno debe terminar a más tardar a la hora fin.
      for (let h = ini; h + 1 <= fin + 1e-9 && h < 24; h += 1) horas.add(h);
    });
  });

  // Ajustes hechos a mano en un horario especial (panel > Horarios especiales):
  //  - horas_excluidas: horas que NO se ofrecen.
  //  - horas_editadas:  { "14:00": "14:45" } la hora 14:00 se ofrece a las 14:45.
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

  if (slots.length === 0) {
    console.warn(
      `[booking.js] Día "${DIAS_CLAVE[dayIndex]}" abierto pero sin horas generadas. Revisa franjas en tabla horarios:`,
      filasAbiertas
    );
  }
  return slots;
}

/** Carga días bloqueados y horarios semanales desde Supabase. */
async function cargarConfiguracionCalendario() {
  if (!window.supabaseClient) return;
  try {
    const [bloqueadosRes, horariosRes, especialesRes] = await Promise.all([
      window.supabaseClient.from("dias_bloqueados").select("fecha_iso"),
      window.supabaseClient.from("horarios").select("*"),
      window.supabaseClient.from("horarios_especiales").select("*"),
    ]);

    if (bloqueadosRes.error) console.error("[booking.js] Error leyendo dias_bloqueados:", bloqueadosRes.error);
    if (horariosRes.error) console.error("[booking.js] Error leyendo horarios:", horariosRes.error);
    // Si la tabla horarios_especiales aún no existe, el sitio sigue con el horario semanal normal.
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
  }
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

/* ---------------------------------------------------------------------- */
/* Apertura / cierre del modal                                            */
/* ---------------------------------------------------------------------- */
function bindOpenTriggers() {
  document.querySelectorAll(".js-open-booking").forEach((btn) => {
    btn.addEventListener("click", () => openBookingModal());
  });
}

function resolverSeleccion() {
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

window.openBookingModal = async function (serviceId = null, varianteId = null) {
  resetBookingState();
  if (serviceId) {
    const svc = typeof SERVICES !== "undefined" ? SERVICES.find((x) => x.id === serviceId) : null;
    if (!(svc?.variantes?.length && !varianteId)) {
      bookingState.serviceId = serviceId;
      bookingState.varianteId = varianteId;
    }
  }

  const modal = document.getElementById("booking-modal");
  modal.hidden = false;
  document.body.style.overflow = "hidden";
  requestAnimationFrame(() => {
    modal.querySelector(".booking-panel").classList.add("scale-100", "opacity-100");
  });

  goToStep(1);
  renderStepOneServices();

  configCalendarioPromise = cargarConfiguracionCalendario();
  await configCalendarioPromise;

  renderCalendar();
  renderTimeSlots();
};

function closeBookingModal() {
  const modal = document.getElementById("booking-modal");
  modal.querySelector(".booking-panel").classList.remove("scale-100", "opacity-100");
  document.body.style.overflow = "";
  setTimeout(() => (modal.hidden = true), 200);
}

function bindModalControls() {
  document.getElementById("booking-close")?.addEventListener("click", closeBookingModal);
  document.getElementById("booking-overlay")?.addEventListener("click", closeBookingModal);
  document.addEventListener("keydown", (e) => {
    const modal = document.getElementById("booking-modal");
    if (e.key === "Escape" && modal && !modal.hidden) closeBookingModal();
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

  document.getElementById("client-form")?.reset();
  document.getElementById("booking-success")?.classList.add("hidden");
  document.getElementById("booking-summary-wrap")?.classList.remove("hidden");
  document.getElementById("booking-footer")?.classList.remove("hidden");
}

/* ---------------------------------------------------------------------- */
/* Indicador de pasos                                                      */
/* ---------------------------------------------------------------------- */
const STEP_LABELS = ["Servicio", "Fecha y hora", "Tus datos", "Confirmación"];

function buildStepIndicator() {
  const wrap = document.getElementById("step-indicator");
  if (!wrap) return;
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
}

async function goToStep(step) {
  bookingState.step = step;
  document.querySelectorAll(".booking-step").forEach((el) => {
    el.classList.toggle("is-active", Number(el.dataset.step) === step);
  });
  updateStepIndicator();

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
  if (bookingState.step === 1 && !bookingState.serviceId) {
    shake("#step-panel-1");
    return;
  }
  if (bookingState.step === 2 && (!bookingState.date || !bookingState.time)) {
    shake("#step-panel-2");
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

/* ---------------------------------------------------------------------- */
/* Paso 1 — Selección de servicio                                         */
/* ---------------------------------------------------------------------- */
function renderStepOneServices() {
  const wrap = document.getElementById("step-panel-1");
  if (!wrap || typeof SERVICES === "undefined") return;

  const keyActual = bookingState.varianteId
    ? `${bookingState.serviceId}::${bookingState.varianteId}`
    : bookingState.serviceId;

  wrap.innerHTML = opcionesReserva()
    .map(
      (o) => `
    <label class="service-choice flex items-center gap-4 border-2 border-[#eadde2] rounded-xl p-3 sm:p-4 ${
      keyActual === o.key ? "is-selected" : ""
    }" data-service-choice="${o.key}">
      <img src="${o.imagen}" alt="" class="w-16 h-16 rounded-lg object-cover flex-shrink-0" />
      <div class="flex-1 min-w-0">
        <p class="font-display font-semibold truncate">${o.nombre}</p>
        <p class="text-xs text-[#6b6464]">${o.duracion} min</p>
      </div>
      <span class="font-display font-semibold text-[#C85F82] whitespace-nowrap">${formatCOP(o.precio)}</span>
    </label>`
    )
    .join("");

  wrap.querySelectorAll("[data-service-choice]").forEach((card) => {
    card.addEventListener("click", () => {
      const [sid, vid] = card.dataset.serviceChoice.split("::");
      bookingState.serviceId = sid;
      bookingState.varianteId = vid || null;
      wrap.querySelectorAll(".service-choice").forEach((c) =>
        c.classList.toggle("is-selected", c === card)
      );
    });
  });
}

/* ---------------------------------------------------------------------- */
/* Paso 2 — Calendario + horarios                                         */
/* ---------------------------------------------------------------------- */
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
    const slotsDelDia = generarSlotsParaDia(dateObj.getDay(), fechaActualISO);
    const isClosedDay = slotsDelDia.length === 0;
    const isBlocked = diasBloqueados.includes(fechaActualISO);

    const isDisabled = isPast || isClosedDay || isBlocked;
    const isToday = dateObj.getTime() === today.getTime();
    const isSelected =
      bookingState.date && dateObj.toDateString() === bookingState.date.toDateString();

    cells += `<div class="calendar-day ${isDisabled ? "is-disabled" : ""} ${
      isToday ? "is-today" : ""
    } ${isSelected ? "is-selected" : ""}"
      data-day="${day}" ${isDisabled ? "" : 'role="button" tabindex="0"'}>
      ${day}
    </div>`;
  }

  grid.innerHTML = cells;

  grid.querySelectorAll(".calendar-day:not(.is-disabled)").forEach((cell) => {
    const selectDay = () => {
      bookingState.date = new Date(year, month, Number(cell.dataset.day));
      bookingState.time = null; // Reinicia la hora al cambiar de día
      renderCalendar();
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

  if (!bookingState.date) {
    wrap.innerHTML = `<p class="text-sm text-[#6b6464] italic col-span-full">Elige primero una fecha disponible.</p>`;
    return;
  }

  const currentRequestId = ++renderSlotsRequestId;

  if (configCalendarioPromise) {
    await configCalendarioPromise;
  }
  if (currentRequestId !== renderSlotsRequestId) return;

  const year = bookingState.date.getFullYear();
  const month = String(bookingState.date.getMonth() + 1).padStart(2, "0");
  const day = String(bookingState.date.getDate()).padStart(2, "0");
  const fechaISO = `${year}-${month}-${day}`;

  wrap.innerHTML = `<p class="text-sm text-[#6b6464] italic col-span-full animate-pulse">Consultando disponibilidad...</p>`;

  const slotsDinamicos = generarSlotsParaDia(bookingState.date.getDay(), fechaISO);

  if (slotsDinamicos.length === 0) {
    wrap.innerHTML = `<p class="text-sm text-[#C85F82] font-medium col-span-full">No hay horarios de atención disponibles para este día.</p>`;
    return;
  }

  let horasOcupadas = [];
  try {
    const { data, error } = await window.supabaseClient
      .from("citas")
      .select("hora")
      .eq("fecha_iso", fechaISO)
      .neq("estado", "cancelado");

    if (error) {
      console.error("[booking.js] Error al consultar horas ocupadas:", error);
    } else if (data) {
      horasOcupadas = data.map((c) => normalizarHoraCita(c.hora));
    }
  } catch (err) {
    console.error("[booking.js] Error al consultar horas ocupadas:", err);
  }

  // Si el usuario cambió de día mientras respondía Supabase, ignoramos esta respuesta vieja
  if (currentRequestId !== renderSlotsRequestId) return;

  wrap.innerHTML = slotsDinamicos
    .map((t) => {
      const estaOcupado = horasOcupadas.includes(normalizarHoraCita(t));
      return `
      <button type="button" data-time="${t}" ${estaOcupado ? "disabled" : ""}
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
      wrap.querySelectorAll(".time-slot").forEach((b) =>
        b.classList.toggle("is-selected", b === btn)
      );
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("calendar-prev")?.addEventListener("click", () => changeCalendarMonth(-1));
  document.getElementById("calendar-next")?.addEventListener("click", () => changeCalendarMonth(1));
});

/* ---------------------------------------------------------------------- */
/* Paso 3 — Datos del cliente                                             */
/* ---------------------------------------------------------------------- */
function bindClientForm() {
  const form = document.getElementById("client-form");
  if (!form) return;
  form.addEventListener("input", () => {
    bookingState.cliente.nombre = document.getElementById("client-name").value.trim();
    bookingState.cliente.telefono = document.getElementById("client-phone").value.trim();
    bookingState.cliente.email = document.getElementById("client-email").value.trim();
  });
}

function validateClientForm() {
  const nameEl = document.getElementById("client-name");
  const phoneEl = document.getElementById("client-phone");
  const emailEl = document.getElementById("client-email");
  let valid = true;

  [nameEl, phoneEl, emailEl].forEach((el) => el.classList.remove("is-invalid"));

  if (!nameEl.value.trim()) {
    nameEl.classList.add("is-invalid");
    valid = false;
  }
  const phoneOk = /^[0-9+\s]{7,15}$/.test(phoneEl.value.trim());
  if (!phoneOk) {
    phoneEl.classList.add("is-invalid");
    valid = false;
  }
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailEl.value.trim());
  if (!emailOk) {
    emailEl.classList.add("is-invalid");
    valid = false;
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

/* ---------------------------------------------------------------------- */
/* Paso 4 — Resumen y confirmación                                        */
/* ---------------------------------------------------------------------- */
function renderSummary() {
  const wrap = document.getElementById("booking-summary");
  if (!wrap) return;
  const service = resolverSeleccion();
  const fecha = bookingState.date
    ? bookingState.date.toLocaleDateString("es-CO", {
        weekday: "long",
        day: "numeric",
        month: "long",
      })
    : "—";

  wrap.innerHTML = `
    <div class="flex justify-between py-2 border-b border-[#f1dbe3]">
      <span class="text-[#6b6464]">Servicio</span>
      <span class="font-semibold text-right">${service?.nombre ?? "—"}</span>
    </div>
    <div class="flex justify-between py-2 border-b border-[#f1dbe3]">
      <span class="text-[#6b6464]">Fecha</span>
      <span class="font-semibold capitalize text-right">${fecha}</span>
    </div>
    <div class="flex justify-between py-2 border-b border-[#f1dbe3]">
      <span class="text-[#6b6464]">Hora</span>
      <span class="font-semibold text-right">${bookingState.time ?? "—"}</span>
    </div>
    <div class="flex justify-between py-2 border-b border-[#f1dbe3]">
      <span class="text-[#6b6464]">Cliente</span>
      <span class="font-semibold text-right">${bookingState.cliente.nombre}</span>
    </div>
    <div class="flex justify-between py-2 border-b border-[#f1dbe3]">
      <span class="text-[#6b6464]">Teléfono</span>
      <span class="font-semibold text-right">${bookingState.cliente.telefono}</span>
    </div>
    <div class="flex justify-between py-2">
      <span class="text-[#6b6464]">Email</span>
      <span class="font-semibold text-right break-all">${bookingState.cliente.email}</span>
    </div>
    <div class="flex justify-between pt-4 mt-2 border-t-2 border-[#AE2967]">
      <span class="font-display font-semibold">Total</span>
      <span class="font-display font-semibold text-[#C85F82]">${formatCOP(
        service?.precio ?? 0
      )}</span>
    </div>
  `;
}

async function confirmBooking() {
  if (!validateClientForm()) {
    goToStep(3);
    return;
  }

  const servicio = resolverSeleccion();
  if (!servicio || !bookingState.date || !bookingState.time) {
    alert("Falta información de la reserva. Por favor revisa los pasos anteriores.");
    return;
  }

  const confirmBtn = document.getElementById("booking-confirm");
  confirmBtn.disabled = true;

  try {
    const supabase = window.supabaseClient;
    const year = bookingState.date.getFullYear();
    const month = String(bookingState.date.getMonth() + 1).padStart(2, "0");
    const day = String(bookingState.date.getDate()).padStart(2, "0");
    const fechaISO = `${year}-${month}-${day}`;

    const duracionMin = parseInt(String(servicio.duracion).split(" ")[0], 10) || 60;

    const { error } = await supabase.from("citas").insert({
      fecha_iso: fechaISO,
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
        alert("Ese horario ya fue reservado. Por favor elige otra fecha u hora.");
        goToStep(2);
        return;
      }
      throw error;
    }

    document.getElementById("booking-summary-wrap").classList.add("hidden");
    document.getElementById("booking-footer").classList.add("hidden");
    document.getElementById("booking-success").classList.remove("hidden");

    let [timeStr, modifier] = bookingState.time.split(" ");
    let [hours, minutes] = timeStr.split(":").map(Number);
    if (modifier && modifier.toLowerCase() === "pm" && hours < 12) hours += 12;
    if (modifier && modifier.toLowerCase() === "am" && hours === 12) hours = 0;

    const horaInicioFmt = `${String(hours).padStart(2, "0")}${String(minutes).padStart(2, "0")}00`;
    const totalMinutos = hours * 60 + minutes + (duracionMin || 60);
    const finHours = Math.floor(totalMinutos / 60) % 24;
    const finMinutes = totalMinutos % 60;
    const horaFinFmt = `${String(finHours).padStart(2, "0")}${String(finMinutes).padStart(2, "0")}00`;

    const icsFechaStr = `${year}${month}${day}`;
    const icsContent = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      `SUMMARY:Cita: ${servicio.nombre} - Maivy Jireth`,
      `DESCRIPTION:Cita agendada con Maivy Jireth Cosmetóloga.\\nServicio: ${servicio.nombre}`,
      `LOCATION:Villa del Rosario, Norte de Santander`,
      `DTSTART:${icsFechaStr}T${horaInicioFmt}`,
      `DTEND:${icsFechaStr}T${horaFinFmt}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
    const icsUrl = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = icsUrl;
    link.download = "cita-maivy-jireth.ics";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    const fechaWA = bookingState.date.toLocaleDateString("es-CO");
    const numeroAdmin = "573122855055";
    const mensaje =
      `¡Hola Maivy! Acabo de agendar una cita. ✨%0A%0A` +
      `👤 *Cliente:* ${bookingState.cliente.nombre}%0A` +
      `📱 *Teléfono:* ${bookingState.cliente.telefono}%0A` +
      `✉️ *Correo:* ${bookingState.cliente.email}%0A` +
      `💆‍♀️ *Servicio:* ${servicio.nombre}%0A` +
      `📅 *Fecha:* ${fechaWA}%0A` +
      `⏰ *Hora:* ${bookingState.time}`;

    setTimeout(() => {
      window.open(`https://wa.me/${numeroAdmin}?text=${mensaje}`, "_blank");
    }, 600);
  } catch (err) {
    console.error("[booking.js] Error al guardar la cita en Supabase:", err);
    alert("No se pudo confirmar tu cita. Intenta de nuevo o contáctanos directamente.");
  } finally {
    confirmBtn.disabled = false;
  }
}

/**
 * Diagnóstico: en la consola del sitio escribe  depurarHorarios()
 * Muestra, por día, lo que hay guardado en la tabla `horarios` y las horas que genera el sitio.
 */
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