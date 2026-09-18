/**
 * booking.js — flujo de reserva de citas en 4 pasos.
 * Maivy es la única cosmetóloga, así que no existe paso de "profesional".
 *
 * Estado guardado en `bookingState` y renderizado en `#booking-modal`.
 * El paso 4 simula el envío; el comentario junto a `confirmBooking()`
 * marca dónde iría el POST real a Spring Boot (`/api/citas`).
 */

const bookingState = {
  step: 1,
  serviceId: null,
  date: null, // objeto Date
  time: null,
  cliente: { nombre: "", telefono: "", email: "" },
};

let calendarViewDate = new Date();

document.addEventListener("DOMContentLoaded", async () => {
  bindOpenTriggers();
  bindModalControls();
  buildStepIndicator();
  // SERVICES lo llena data.js con una consulta real a Supabase; se espera
  // esa promesa antes de pintar el paso 1 para no mostrar la lista vacía.
  await window.datosListos;
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

window.openBookingModal = function (serviceId = null) {
  resetBookingState();
  if (serviceId) bookingState.serviceId = serviceId;

  const modal = document.getElementById("booking-modal");
  modal.hidden = false;
  document.body.style.overflow = "hidden";
  requestAnimationFrame(() => {
    modal.querySelector(".booking-panel").classList.add("scale-100", "opacity-100");
  });

  renderStepOneServices();
  // El calendario y los horarios también deben "olvidar" la selección de
  // una reserva anterior: sin estas dos líneas, bookingState.date/time se
  // reiniciaban por dentro pero la grilla seguía mostrando en pantalla el
  // día/hora elegidos la última vez que se abrió el modal.
  renderCalendar();
  renderTimeSlots();
  goToStep(1);
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

function goToStep(step) {
  bookingState.step = step;
  document.querySelectorAll(".booking-step").forEach((el) => {
    el.classList.toggle("is-active", Number(el.dataset.step) === step);
  });
  updateStepIndicator();

  document.getElementById("booking-back").classList.toggle("invisible", step === 1);
  document.getElementById("booking-next").classList.toggle("hidden", step === 4);
  document.getElementById("booking-confirm").classList.toggle("hidden", step !== 4);

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

  wrap.innerHTML = SERVICES.map(
    (s) => `
    <label class="service-choice flex items-center gap-4 border-2 border-[#eadde2] rounded-xl p-3 sm:p-4 ${
      bookingState.serviceId === s.id ? "is-selected" : ""
    }" data-service-choice="${s.id}">
      <img src="${s.imagen}" alt="" class="w-16 h-16 rounded-lg object-cover flex-shrink-0" />
      <div class="flex-1 min-w-0">
        <p class="font-display font-semibold truncate">${s.nombre}</p>
        <p class="text-xs text-[#6b6464]">${s.duracion} min</p>
      </div>
      <span class="font-display font-semibold text-[#C85F82] whitespace-nowrap">${formatCOP(
        s.precio
      )}</span>
    </label>`
  ).join("");

  wrap.querySelectorAll("[data-service-choice]").forEach((card) => {
    card.addEventListener("click", () => {
      bookingState.serviceId = card.dataset.serviceChoice;
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
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
];
const DAYS_ES = ["Do","Lu","Ma","Mi","Ju","Vi","Sa"];

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
    const isPast = dateObj < today;
    const isSunday = dateObj.getDay() === 0; // cerrado los domingos
    const isDisabled = isPast || isSunday;
    const isToday = dateObj.getTime() === today.getTime();
    const isSelected =
      bookingState.date &&
      dateObj.toDateString() === bookingState.date.toDateString();

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
  // No permitir retroceder antes del mes actual
  if (candidate.getFullYear() < now.getFullYear() ||
     (candidate.getFullYear() === now.getFullYear() && candidate.getMonth() < now.getMonth())) {
    return;
  }
  calendarViewDate = candidate;
  renderCalendar();
}

async function renderTimeSlots() {
  const wrap = document.getElementById("time-slots");
  if (!wrap || typeof TIME_SLOTS === "undefined") return;

  if (!bookingState.date) {
    wrap.innerHTML = `<p class="text-sm text-[#6b6464] italic col-span-full">Elige primero una fecha disponible.</p>`;
    return;
  }

  // 1. Obtener la fecha seleccionada en formato ISO (YYYY-MM-DD)
  const year = bookingState.date.getFullYear();
  const month = String(bookingState.date.getMonth() + 1).padStart(2, "0");
  const day = String(bookingState.date.getDate()).padStart(2, "0");
  const fechaISO = `${year}-${month}-${day}`;

  // 2. Muestra un mensaje de carga mientras consulta a Supabase
  wrap.innerHTML = `<p class="text-sm text-[#6b6464] italic col-span-full animate-pulse">Consultando disponibilidad...</p>`;

  let horasOcupadas = [];
  try {
    const { data, error } = await window.supabaseClient
      .from("citas")
      .select("hora")
      .eq("fecha_iso", fechaISO)
      .neq("estado", "cancelado"); // Ignora las citas canceladas para liberar el cupo

    if (!error && data) {
      horasOcupadas = data.map((c) => c.hora);
    }
  } catch (err) {
    console.error("[booking.js] Error al consultar horas ocupadas:", err);
  }

  // 3. Pintar los botones desactivando las horas ocupadas
  wrap.innerHTML = TIME_SLOTS.map((t) => {
    const estaOcupado = horasOcupadas.includes(t);
    return `
    <button type="button" data-time="${t}" ${estaOcupado ? "disabled" : ""}
      class="time-slot border-2 border-[#eadde2] rounded-lg py-2 text-sm font-medium transition-all ${
        estaOcupado 
          ? "opacity-35 bg-gray-100 cursor-not-allowed line-through text-gray-400 border-gray-200" 
          : ""
      } ${bookingState.time === t ? "is-selected" : ""}">
      ${t} ${estaOcupado ? " (Ocupado)" : ""}
    </button>`;
  }).join("");

  // 4. Asignar el evento clic solo a los botones disponibles
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
  const service = SERVICES.find((s) => s.id === bookingState.serviceId);
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

  const servicio = SERVICES.find((s) => s.id === bookingState.serviceId);
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

    // 1. CREAR EL ARCHIVO DEL CALENDARIO
    let [timeStr, modifier] = bookingState.time.split(" ");
    let [hours, minutes] = timeStr.split(":").map(Number);
    if (modifier && modifier.toLowerCase() === "pm" && hours < 12) hours += 12;
    if (modifier && modifier.toLowerCase() === "am" && hours === 12) hours = 0;
    
    const horaInicioFmt = `${String(hours).padStart(2, "0")}${String(minutes).padStart(2, "0")}00`;
    const totalMinutos = (hours * 60) + minutes + (duracionMin || 60);
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
      "END:VCALENDAR"
    ].join("\r\n");

    const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
    const icsUrl = URL.createObjectURL(blob);

    // 2. FORZAR LA DESCARGA AUTOMÁTICA (TRUCO JS)
    const link = document.createElement("a");
    link.href = icsUrl;
    link.download = "cita-maivy-jireth.ics";
    document.body.appendChild(link);
    link.click(); // Clic automático
    document.body.removeChild(link); // Borramos el rastro

    // 3. ABRIR WHATSAPP (Con un micro-retraso para no asustar al iPhone)
    const fechaWA = bookingState.date.toLocaleDateString("es-CO");
    const numeroAdmin = "573122855055";
    const mensaje = `¡Hola Maivy! Acabo de agendar una cita. ✨%0A%0A` +
      `👤 *Cliente:* ${bookingState.cliente.nombre}%0A` +
      `📱 *Teléfono:* ${bookingState.cliente.telefono}%0A` +
      `✉️ *Correo:* ${bookingState.cliente.email}%0A` +
      `💆‍♀️ *Servicio:* ${servicio.nombre}%0A` +
      `📅 *Fecha:* ${fechaWA}%0A` +
      `⏰ *Hora:* ${bookingState.time}`;
      
    setTimeout(() => {
        window.open(`https://wa.me/${numeroAdmin}?text=${mensaje}`, "_blank");
    }, 600); // Espera 0.6 segundos antes de abrir WhatsApp

  } catch (err) {
    console.error("[booking.js] Error al guardar la cita en Supabase:", err);
    alert("No se pudo confirmar tu cita. Intenta de nuevo o contáctanos directamente.");
  } finally {
    confirmBtn.disabled = false;
  }
}