// Historia clínica facial y corporal

import { guardarHistoriaClinica, getHistoriaClinicaPorCita } from "./panel-data.js";

const $ = (sel, root = document) => root.querySelector(sel);
const $all = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// ESTADO DE LA SESIÓN ACTUAL DE HISTORIA CLÍNICA
let citaActual = null;
let tipoActual = null; // 'facial' | 'corporal'
const previewsConstruidas = new Set();

function initBotonAgenda() {
  // Delegado sobre el tbody
  $("#agenda-tbody")?.addEventListener("click", (e) => {
    const btn = e.target.closest('button[data-accion="historia-clinica"]');
    if (!btn) return;
    citaActual = { id: btn.dataset.id, cliente: btn.dataset.cliente };
    abrirModalTipo();
  });
}

function abrirModalTipo() {
  $("#modal-tipo-historia").classList.add("is-open");
}
function cerrarModalTipo() {
  $("#modal-tipo-historia").classList.remove("is-open");
}

function initModalTipo() {
  $("#modal-tipo-historia-close").addEventListener("click", cerrarModalTipo);
  $("#modal-tipo-historia").addEventListener("click", (e) => {
    if (e.target.id === "modal-tipo-historia") cerrarModalTipo();
  });

  $all(".hc-tipo-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      tipoActual = btn.dataset.tipo; // 'facial' | 'corporal'
      cerrarModalTipo();
      await abrirAreaDeTrabajo(tipoActual);
    });
  });
}

// ÁREA DE TRABAJO A PANTALLA COMPLETA (Lado A + Lado B)

async function abrirAreaDeTrabajo(tipo) {
  $("#panel-view").classList.add("is-historia-activa");
  $all(".tab-panel").forEach((p) => p.classList.remove("is-active"));
  $("#tab-historia-clinica").classList.add("is-active");

  $("#hc-cliente-label").textContent = `${tipo === "facial" ? "Facial" : "Corporal"} — ${citaActual?.cliente ?? ""}`;

  const formFacial = $("#form-historia-facial");
  const formCorporal = $("#form-historia-corporal");
  formFacial.hidden = tipo !== "facial";
  formCorporal.hidden = tipo !== "corporal";
  formFacial.reset();
  formCorporal.reset();

  asegurarPreviewConstruida(tipo);
  $("#hc-preview-facial").hidden = tipo !== "facial";
  $("#hc-preview-corporal").hidden = tipo !== "corporal";

  const previa = await getHistoriaClinicaPorCita(citaActual.id);
  if (previa && previa.tipo === tipo) {
    poblarFormulario(tipo === "facial" ? formFacial : formCorporal, previa.datos);
  }

  sincronizarVistaPrevia(tipo);
}

function volverAAgenda() {
  $("#panel-view").classList.remove("is-historia-activa");
  $all(".tab-panel").forEach((p) => p.classList.remove("is-active"));
  $("#tab-agenda").classList.add("is-active");
  $all(".nav-item").forEach((btn) => btn.classList.toggle("is-active", btn.dataset.tab === "agenda"));
  $("#panel-page-title").textContent = "Agenda";
  citaActual = null;
  tipoActual = null;
}

function initTopbar() {
  $("#hc-volver").addEventListener("click", volverAAgenda);
}

function initSincronizacionEnVivo() {
  const contenedor = $("#tab-historia-clinica");
  ["input", "change"].forEach((evento) => {
    contenedor.addEventListener(evento, (e) => {
      if (!tipoActual) return;
      if (!e.target.closest(".hc-form")) return;
      sincronizarVistaPrevia(tipoActual);
    });
  });
}

// LECTURA / PRE-CARGA DE FORMULARIO

function leerFormulario(form) {
  const datos = {};

  $all("input[name], textarea[name]", form).forEach((el) => {
    if (el.type === "radio") {
      if (el.checked) datos[el.name] = el.value;
    } else if (el.type === "checkbox") {
      datos[el.name] = el.checked;
    } else {
      datos[el.name] = el.value.trim();
    }
  });

  // Grupos de checkboxes múltiples (data-group="tipoPiel", etc.)
  $all("[data-group]", form).forEach((grupo) => {
    const seleccionados = $all('input[type="checkbox"]:checked', grupo).map((c) => c.value);
    datos[grupo.dataset.group] = seleccionados;
  });

  $all("table[data-tabla]", form).forEach((tabla) => {
    const filas = $all("tbody tr", tabla).map((tr) => {
      const fila = {};
      $all("[data-col]", tr).forEach((input) => {
        fila[input.dataset.col] = input.value.trim();
      });
      return fila;
    });
    datos[tabla.dataset.tabla] = filas;
  });

  $all("[data-antecedente]", form).forEach((fila) => {
    const nombre = fila.dataset.antecedente;
    const radioMarcado = fila.querySelector('input[type="radio"]:checked');
    const detalle = fila.querySelector('input[type="text"]');
    datos[`${nombre}Detalle`] = {
      respuesta: radioMarcado ? radioMarcado.value : null, // 'si' | 'no' | null
      detalle: detalle ? detalle.value.trim() : "",
    };
  });

  return datos;
}

// Precarga un formulario con datos guardados previamente
function poblarFormulario(form, datos) {
  Object.entries(datos).forEach(([clave, valor]) => {
    if (clave.endsWith("Detalle") && valor && typeof valor === "object" && "respuesta" in valor) return; // derivado, se ignora al precargar
    if (Array.isArray(valor) && valor.length && typeof valor[0] === "object") {
      // Fila de tabla editable (control de sesiones / precios).
      const tabla = form.querySelector(`table[data-tabla="${clave}"]`);
      if (!tabla) return;
      const filas = $all("tbody tr", tabla);
      valor.forEach((fila, i) => {
        if (!filas[i]) return;
        Object.entries(fila).forEach(([col, val]) => {
          const input = filas[i].querySelector(`[data-col="${col}"]`);
          if (input) input.value = val ?? "";
        });
      });
    } else if (Array.isArray(valor)) {
      // grupo de checkboxes
      $all(`[data-group="${clave}"] input[type="checkbox"]`, form).forEach((c) => {
        c.checked = valor.includes(c.value);
      });
    } else {
      const el = form.querySelector(`[name="${clave}"]`);
      if (!el) return;
      if (el.type === "checkbox") el.checked = !!valor;
      else if (el.type === "radio") {
        const opt = form.querySelector(`[name="${clave}"][value="${valor}"]`);
        if (opt) opt.checked = true;
      } else el.value = valor ?? "";
    }
  });
}

// LADO B

function asegurarPreviewConstruida(tipo) {
  if (previewsConstruidas.has(tipo)) return;
  const destino = tipo === "facial" ? $("#hc-preview-facial") : $("#hc-preview-corporal");
  destino.innerHTML = tipo === "facial" ? crearPreviewFacial() : crearPreviewCorporal();
  previewsConstruidas.add(tipo);
}

function sincronizarVistaPrevia(tipo) {
  const form = tipo === "facial" ? $("#form-historia-facial") : $("#form-historia-corporal");
  const preview = tipo === "facial" ? $("#hc-preview-facial") : $("#hc-preview-corporal");
  if (!form || !preview) return;
  const datos = leerFormulario(form);

  $all("[data-bind]", preview).forEach((el) => {
    el.textContent = datos[el.dataset.bind] || "";
  });

  $all("[data-bind-date]", preview).forEach((el) => {
    el.textContent = formatearFecha(datos[el.dataset.bindDate]);
  });

  $all("[data-field][data-value]", preview).forEach((el) => {
    const valorGuardado = datos[el.dataset.field];
    const marcado = Array.isArray(valorGuardado)
      ? valorGuardado.includes(el.dataset.value)
      : valorGuardado === el.dataset.value;
    el.classList.toggle("is-on", !!marcado);
  });

  $all("[data-fecha-hoy]", preview).forEach((el) => {
    el.textContent = fechaHoyCorta();
  });

  $all("table[data-tabla-preview]", preview).forEach((tabla) => {
    const campo = tabla.dataset.tablaPreview;
    pintarTablaEditable(tabla, campo, datos[campo]);
  });
}

function formatearFecha(iso) {
  if (!iso) return "";
  const [a, m, d] = iso.split("-");
  if (!a || !m || !d) return iso;
  return `${d}/${m}/${a}`;
}

function fechaHoyCorta() {
  return new Date().toLocaleDateString("es-CO");
}

const TABLAS = {
  sesionesFacial: { filas: 4, cols: ["fecha", "sesion", "procedimiento", "observaciones"] },
  preciosFacial: { filas: 3, cols: ["fecha", "sesiones", "precio", "tratamiento"] },
  preciosCorporal: { filas: 3, cols: ["fecha", "sesiones", "precio", "tratamiento"] },
};

function formatCeldaTabla(col, valor) {
  if (!valor) return "";
  return col === "fecha" ? formatearFecha(valor) : valor;
}

function pintarTablaEditable(elTabla, campo, filasDatos) {
  const config = TABLAS[campo];
  if (!config) return;
  const tbody = elTabla.querySelector("tbody");
  const filas = [];
  for (let i = 0; i < config.filas; i++) {
    const fila = (filasDatos && filasDatos[i]) || {};
    const celdas = config.cols.map((c) => `<td>${esc(formatCeldaTabla(c, fila[c])) || "&nbsp;"}</td>`).join("");
    filas.push(`<tr>${celdas}<td>&nbsp;</td></tr>`);
  }
  tbody.innerHTML = filas.join("");
}

// Piezas reutilizables para armar las plantillas

function esc(str) {
  return String(str).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

// Casilla individual
function chip(campo, valor, etiqueta = valor) {
  return `<span class="hc-p-check" data-field="${esc(campo)}" data-value="${esc(valor)}"><span class="hc-p-box"></span>${esc(etiqueta)}</span>`;
}
function chips(campo, valores) {
  return valores.map((v) => chip(campo, v)).join("");
}
// Fila "¿Pregunta? Sí ⬜ No ⬜  [detalle]".
function filaSiNo(campo, pregunta, campoDetalle) {
  return `<div class="hc-p-sino"><span>${esc(pregunta)}</span>
    ${chip(campo, "si", "Sí")}${chip(campo, "no", "No")}
    ${campoDetalle ? `<span class="hc-p-value" style="flex:1;min-width:130px" data-bind="${campoDetalle}"></span>` : ""}
  </div>`;
}
function campo(etiqueta, bind, full = false) {
  return `<div class="hc-p-field${full ? " hc-p-field-full" : ""}"><span class="hc-p-label">${esc(etiqueta)}:</span><span class="hc-p-value" data-bind="${bind}"></span></div>`;
}
function campoFecha(etiqueta, bind) {
  return `<div class="hc-p-field"><span class="hc-p-label">${esc(etiqueta)}:</span><span class="hc-p-value" data-bind-date="${bind}"></span></div>`;
}
// Fila "Etiqueta   Baja ⬜  Media ⬜  Alta ⬜".
function escalaBMA(campoNombre, etiqueta) {
  return `<div class="hc-p-check-row"><span class="hc-p-inline-label">${esc(etiqueta)}</span>${chips(campoNombre, ["Baja", "Media", "Alta"])}</div>`;
}
// Bloque "Etiqueta" + área de observaciones con líneas
function bloqueTexto(etiqueta, bind, grande = false) {
  return `<p class="hc-p-label" style="margin:7px 0 3px">${esc(etiqueta)}</p><div class="hc-p-value hc-p-multiline${grande ? " hc-p-multiline-lg" : ""}" data-bind="${bind}"></div>`;
}

const ICONS = {
  user: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#ae2967" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>`,
  search: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#ae2967" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>`,
  clipboard: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#ae2967" stroke-width="1.8"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1M9 11h6M9 15h6"/></svg>`,
  drop: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#ae2967" stroke-width="1.8"><path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/></svg>`,
  face: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#ae2967" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M9 10h.01M15 10h.01M8 15c1 1.5 2.5 2 4 2s3-.5 4-2"/></svg>`,
  pencil: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#ae2967" stroke-width="1.8"><path d="M4 20h4L18 10l-4-4L4 16v4z"/><path d="M13 7l4 4"/></svg>`,
  heart: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#ae2967" stroke-width="1.8"><path d="M12 21s-7-4.3-9.5-8.5C.5 8.5 3 4 7 4c2 0 3.5 1 5 3 1.5-2 3-3 5-3 4 0 6.5 4.5 4.5 8.5C19 16.7 12 21 12 21z"/></svg>`,
  body: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#ae2967" stroke-width="1.8"><circle cx="12" cy="5" r="2.5"/><path d="M12 8v6M8 22l2.5-8M16 22l-2.5-8M7 12l5-2 5 2"/></svg>`,
  bottle: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#ae2967" stroke-width="1.8"><path d="M10 2h4v3.2l2 2.3V20a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V7.5l2-2.3V2z"/></svg>`,
  leaf: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#ae2967" stroke-width="1.8"><path d="M12 21c-5-1-8-5-8-10 5 0 9 3 10 8 1-5 5-8 10-8 0 5-3 9-8 10"/></svg>`,
};

// Adorno de esquina
const HOJA_ADORNO = `<svg viewBox="0 0 100 100" width="100" height="100" fill="none" stroke="#e882a6" stroke-width="1.4">
  <path d="M4 4c20 4 34 10 46 24 8 9 12 20 14 32" stroke-linecap="round"/>
  <ellipse cx="18" cy="14" rx="8" ry="4" transform="rotate(35 18 14)"/>
  <ellipse cx="30" cy="22" rx="9" ry="4.5" transform="rotate(45 30 22)"/>
  <ellipse cx="42" cy="34" rx="9" ry="4.5" transform="rotate(55 42 34)"/>
  <ellipse cx="52" cy="48" rx="8" ry="4" transform="rotate(60 52 48)"/>
</svg>`;

function icono(nombre) {
  return `<span class="hc-p-icon">${ICONS[nombre]}</span>`;
}
function tituloSeccion(icon, numero, texto) {
  return `<div class="hc-p-section-head">${icono(icon)}<span class="hc-p-section-title">${numero}. ${esc(texto)}</span></div>`;
}
function encabezadoHoja(titulo, conFecha) {
  return `<div class="hc-p-leaf hc-p-leaf--tl">${HOJA_ADORNO}</div>
  <div class="hc-p-leaf hc-p-leaf--br">${HOJA_ADORNO}</div>
  <div class="hc-p-header">
    ${conFecha ? `<div class="hc-p-fecha">Fecha: <b data-fecha-hoy></b></div>` : ""}
    <div class="hc-p-logo"><img src="/imagenes/logocosmec.jpeg" alt="" /></div>
    <p class="hc-p-brand-sub">Maivy Jireth · Cosmetóloga</p>
    <h1 class="hc-p-title">${esc(titulo)}</h1>
  </div>
  <div class="hc-p-divider">♥</div>`;
}
// Tabla de sesiones/precios en blanco
function tablaVacia(columnas, filas = 6) {
  const encabezado = columnas.map((c) => `<th>${esc(c)}</th>`).join("");
  const filaVacia = `<tr>${columnas.map(() => "<td>&nbsp;</td>").join("")}</tr>`;
  return `<table class="hc-p-table"><thead><tr>${encabezado}</tr></thead><tbody>${filaVacia.repeat(filas)}</tbody></table>`;
}
function tablaEditablePreview(campo, columnas) {
  const encabezado = columnas.map((c) => `<th>${esc(c)}</th>`).join("") + "<th>Firma</th>";
  return `<table class="hc-p-table" data-tabla-preview="${campo}"><thead><tr>${encabezado}</tr></thead><tbody></tbody></table>`;
}
function bloqueFirmas() {
  return `<div class="hc-p-sign-grid">
    <div class="hc-p-sign">
      <p class="hc-p-sign-title">Firma de la cosmetóloga</p>
      <div class="hc-p-sign-line"></div>
      <p class="hc-p-sign-date">Fecha: ____ / ____ / ______</p>
    </div>
    <div class="hc-p-sign">
      <p class="hc-p-sign-title">Firma del paciente</p>
      <div class="hc-p-sign-line"></div>
      <p class="hc-p-sign-date">Fecha: ____ / ____ / ______</p>
    </div>
  </div>`;
}
function textoConsentimiento(tratamiento) {
  return `<p class="hc-p-consent-text">
    Yo, <span class="hc-p-value" style="display:inline;border-bottom:1px solid #ecd6de" data-bind="nombreCompleto"></span>,
    identificado(a) con documento de identidad N°
    <span class="hc-p-value" style="display:inline;border-bottom:1px solid #ecd6de" data-bind="documento"></span>,
    certifico que he sido informado(a) de manera clara y comprensible sobre el tratamiento estético
    ${tratamiento} que se me propone, sus beneficios, posibles riesgos, contraindicaciones y cuidados posteriores.<br><br>
    Entiendo que los resultados pueden variar de una persona a otra y me comprometo a seguir las
    recomendaciones indicadas por la profesional.<br><br>
    Autorizo a la profesional a realizar el tratamiento propuesto de acuerdo con su criterio profesional.
  </p>`;
}

// PLANTILLA FACIAL: 3 hojas A4
function crearPreviewFacial() {
  const pagina1 = `<div class="hc-page">
    ${encabezadoHoja("Historia Clínica Facial", true)}

    <section class="hc-p-section">
      ${tituloSeccion("user", 1, "Datos personales")}
      <div class="hc-p-row">${campo("Nombre completo", "nombreCompleto", true)}</div>
      <div class="hc-p-row">${campoFecha("Fecha de nacimiento", "fechaNacimiento")}${campo("Edad", "edad")}</div>
      <div class="hc-p-row">${campo("Documento de identidad", "documento", true)}</div>
      <div class="hc-p-row">${campo("Dirección", "direccion", true)}</div>
      <div class="hc-p-row">${campo("Teléfono", "telefono")}${campo("WhatsApp", "whatsapp")}</div>
      <div class="hc-p-row">${campo("Correo electrónico", "correo", true)}</div>
      <div class="hc-p-row">${campo("Ocupación", "ocupacion", true)}</div>
    </section>

    <section class="hc-p-section">
      ${tituloSeccion("search", 2, "Motivo de consulta")}
      <p class="hc-p-label" style="margin:0 0 4px">¿Qué deseas tratar o mejorar en tu rostro?</p>
      <div class="hc-p-value hc-p-multiline" data-bind="motivoConsulta"></div>
    </section>

    <section class="hc-p-section">
      ${tituloSeccion("clipboard", 3, "Antecedentes personales")}
      ${filaSiNo("condicionMedica", "¿Presentas alguna condición médica?", "condicionMedicaCual")}
      ${filaSiNo("cirugias", "¿Has tenido cirugías?", "cirugiasCual")}
      ${filaSiNo("alergias", "¿Alergias conocidas?", "alergiasCual")}
      ${filaSiNo("medicacion", "¿Usas alguna medicación actualmente?", "medicacionCual")}
      ${filaSiNo("dermatologico", "¿Estás en tratamiento dermatológico?", "dermatologicoCual")}
    </section>

    <section class="hc-p-section">
      ${tituloSeccion("drop", 4, "Evaluación facial")}
      <div class="hc-p-cols">
        <div>
          <p class="hc-p-label" style="margin:0 0 3px">Tipo de piel (según observación)</p>
          <div class="hc-p-check-row">${chips("tipoPiel", ["Normal", "Seca", "Mixta", "Grasa", "Sensible", "Deshidratada"])}</div>
          <p class="hc-p-label" style="margin:6px 0 3px">Fototipo (Fitzpatrick)</p>
          <div class="hc-p-check-row">${chips("fototipo", ["I", "II", "III", "IV", "V", "VI"])}</div>
        </div>
        <div>
          <p class="hc-p-label" style="margin:0 0 3px">Condiciones presentes</p>
          <div class="hc-p-check-row">${chips("condiciones", ["Acné", "Manchas", "Líneas de expresión", "Arrugas", "Poros dilatados", "Rosácea", "Deshidratación", "Flacidez", "Ojeras", "Sensibilidad"])}</div>
          <p class="hc-p-label" style="margin:6px 0 3px">Grado de envejecimiento</p>
          <div class="hc-p-check-row">${chips("envejecimiento", ["Leve", "Moderado", "Severo"])}</div>
        </div>
      </div>
      <div class="hc-p-row" style="margin-top:2px">${campo("Observaciones", "observacionesEvaluacion", true)}</div>
    </section>

    <div class="hc-p-page-number">1 / 3</div>
  </div>`;

  const pagina2 = `<div class="hc-page">
    ${encabezadoHoja("Historia Clínica Facial", false)}

    <section class="hc-p-section">
      ${tituloSeccion("face", 5, "Análisis facial")}
      <div class="hc-p-cols">
        <div>
          ${escalaBMA("hidratacion", "Hidratación")}
          ${escalaBMA("seborregulacion", "Seborregulación")}
          ${escalaBMA("sensibilidadPiel", "Sensibilidad")}
          ${escalaBMA("pigmentacion", "Pigmentación")}
          ${escalaBMA("elasticidad", "Elasticidad")}
          <div class="hc-p-check-row" style="margin-top:4px"><span class="hc-p-inline-label">Tipo de poros</span>${chips("tipoPoros", ["Finos", "Dilatados", "Mixtos"])}</div>
          <div class="hc-p-check-row"><span class="hc-p-inline-label">Textura</span>${chips("texturaPiel", ["Lisa", "Irregular"])}</div>
          <div class="hc-p-check-row"><span class="hc-p-inline-label">Tono</span>${chips("tonoPiel", ["Claro", "Medio", "Oscuro"])}</div>
        </div>
        <div>
          <p class="hc-p-label" style="margin:0 0 3px">Características específicas</p>
          <div class="hc-p-check-row hc-p-check-col">${chips("caracteristicas", ["Deshidratación", "Acné activo", "Manchas", "Líneas de expresión", "Arrugas", "Piel grasa", "Piel seca", "Piel sensible"])}</div>
          <div class="hc-p-row" style="margin-top:2px">${campo("Otra", "otraCaracteristica", true)}</div>
        </div>
      </div>
      <p class="hc-p-label" style="margin:6px 0 3px">Zonas a tratar</p>
      <div class="hc-p-check-row">${chips("zonas", ["Frente", "Entrecejo", "Ojos", "Pómulos", "Mejillas", "Labios", "Mentón", "Cuello", "Escote"])}</div>
      <div class="hc-p-row">${campo("Otra zona", "otraZona", true)}</div>
      ${bloqueTexto("Observaciones", "observacionesAnalisis")}
    </section>

    <section class="hc-p-section">
      ${tituloSeccion("clipboard", 6, "Plan de tratamiento")}
      <div class="hc-p-row">${campo("Diagnóstico", "diagnostico", true)}</div>
      ${bloqueTexto("Plan de tratamiento recomendado", "planTratamiento")}
      ${bloqueTexto("Recomendaciones en casa", "recomendacionesCasa")}
      ${tablaEditablePreview("preciosFacial", ["Fecha", "Sesiones", "Precio", "Tratamiento / Procedimiento"])}
    </section>

    <section class="hc-p-section">
      ${tituloSeccion("pencil", 7, "Evolución y seguimiento")}
      <div class="hc-p-row">${campo("Resultados esperados", "resultadosEsperados", true)}</div>
      ${bloqueTexto("Observaciones", "observacionesSeguimiento")}
    </section>

    <div class="hc-p-page-number">2 / 3</div>
  </div>`;

  const pagina3 = `<div class="hc-page">
    ${encabezadoHoja("Historia Clínica Facial", false)}

    <section class="hc-p-section">
      ${tituloSeccion("heart", 8, "Consentimiento informado")}
      ${textoConsentimiento("facial")}
      ${bloqueFirmas()}
    </section>

    <section class="hc-p-section">
      ${tituloSeccion("clipboard", 9, "Control de sesiones")}
      ${tablaEditablePreview("sesionesFacial", ["Fecha", "Sesión N°", "Procedimiento realizado", "Observaciones"])}
    </section>

    <section class="hc-p-section">
      ${tituloSeccion("pencil", 10, "Notas adicionales")}
      ${bloqueTexto("Notas", "notasAdicionales", true)}
    </section>

    <div class="hc-p-page-number">3 / 3</div>
  </div>`;

  return pagina1 + pagina2 + pagina3;
}

// PLANTILLA CORPORAL: 3 hojas A4
function crearPreviewCorporal() {
  const pagina1 = `<div class="hc-page">
    ${encabezadoHoja("Historia Clínica Corporal", true)}

    <section class="hc-p-section">
      ${tituloSeccion("user", 1, "Datos personales")}
      <div class="hc-p-row">${campo("Nombre completo", "nombreCompleto", true)}</div>
      <div class="hc-p-row">${campoFecha("Fecha de nacimiento", "fechaNacimiento")}${campo("Edad", "edad")}</div>
      <div class="hc-p-row">${campo("Documento de identidad", "documento", true)}</div>
      <div class="hc-p-row">${campo("Dirección", "direccion", true)}</div>
      <div class="hc-p-row">${campo("Teléfono", "telefono")}${campo("WhatsApp", "whatsapp")}</div>
      <div class="hc-p-row">${campo("Correo electrónico", "correo", true)}</div>
      <div class="hc-p-row">${campo("Ocupación", "ocupacion", true)}</div>
    </section>

    <section class="hc-p-section">
      ${tituloSeccion("heart", 2, "Motivo de consulta")}
      <p class="hc-p-label" style="margin:0 0 4px">¿Qué deseas tratar o mejorar?</p>
      <div class="hc-p-value hc-p-multiline" data-bind="motivoConsulta"></div>
    </section>

    <section class="hc-p-section">
      ${tituloSeccion("heart", 3, "Antecedentes personales")}
      ${filaSiNo("condicionMedica", "¿Presentas alguna condición médica?", "condicionMedicaCual")}
      ${filaSiNo("cirugias", "¿Has tenido cirugías?", "cirugiasCual")}
      ${filaSiNo("alergias", "¿Alergias conocidas?", "alergiasCual")}
    </section>

    <div class="hc-p-page-number">1 / 3</div>
  </div>`;

  const pagina2 = `<div class="hc-page">
    ${encabezadoHoja("Historia Clínica Corporal", true)}

    <section class="hc-p-section">
      ${tituloSeccion("body", 4, "Evaluación corporal")}
      <div class="hc-p-check-row"><span class="hc-p-inline-label">Tipo de biotipo corporal</span>${chips("biotipo", ["Ectomorfo", "Mesomorfo", "Endomorfo"])}</div>
      <p class="hc-p-label" style="margin:8px 0 4px">Silueta</p>
      <div class="hc-p-check-row">${chips("silueta", ["Reloj de arena", "Triángulo invertido", "Triángulo (pera)", "Rectángulo", "Óvalo (manzana)"])}</div>
      <div class="hc-p-row" style="margin-top:8px">${campo("Peso (kg)", "peso")}${campo("Talla (cm)", "talla")}${campo("IMC", "imc")}</div>
      <div class="hc-p-row">${campo("% grasa estimado", "porcentajeGrasa")}${campo("% masa muscular", "masaMuscular")}</div>
      <div class="hc-p-check-row" style="margin-top:6px"><span class="hc-p-inline-label">Estado de hidratación</span>${chips("hidratacionCorporal", ["Bajo", "Medio", "Adecuado", "Alto"])}</div>
      <div class="hc-p-check-row"><span class="hc-p-inline-label">Flacidez</span>${chips("flacidez", ["Leve", "Moderada", "Severa"])}</div>
      <div class="hc-p-check-row"><span class="hc-p-inline-label">Celulitis</span>${chips("celulitis", ["Grado I", "Grado II", "Grado III", "No presenta"])}</div>
      ${filaSiNo("retencionLiquidos", "Retención de líquidos", "retencionLiquidosZona")}
      ${filaSiNo("estrias", "Estrías", "estriasZona")}
      ${bloqueTexto("Observaciones", "observacionesEvaluacion")}
    </section>

    <section class="hc-p-section">
      ${tituloSeccion("bottle", 5, "Hábitos y estilo de vida")}
      <div class="hc-p-check-row"><span class="hc-p-inline-label">Alimentación</span>${chips("alimentacion", ["Saludable", "Regular", "Poco saludable"])}</div>
      <div class="hc-p-check-row"><span class="hc-p-inline-label">Actividad física</span>${chips("actividadFisica", ["Nunca", "Ocasional", "Regular"])}</div>
      <div class="hc-p-check-row"><span class="hc-p-inline-label">Consumo de agua</span>${chips("consumoAgua", ["Bajo", "Medio", "Alto"])}</div>
      <div class="hc-p-check-row"><span class="hc-p-inline-label">Horas de sueño</span>${chips("horasSueno", ["< 6 hrs", "6-8 hrs", "> 8 hrs"])}</div>
      <div class="hc-p-check-row"><span class="hc-p-inline-label">Estrés</span>${chips("estres", ["Bajo", "Medio", "Alto"])}</div>
      ${filaSiNo("fuma", "Fuma", null)}
      <div class="hc-p-check-row"><span class="hc-p-inline-label">Bebe alcohol</span>${chips("bebeAlcohol", ["Sí", "No", "Ocasional"])}</div>
      ${bloqueTexto("Observaciones", "observacionesHabitos")}
    </section>

    <section class="hc-p-section">
      ${tituloSeccion("leaf", 6, "Objetivos del tratamiento")}
      <div class="hc-p-row">${campo("Objetivo principal", "objetivoPrincipal", true)}</div>
      ${bloqueTexto("Objetivos secundarios", "objetivosSecundarios")}
    </section>

    <div class="hc-p-page-number">2 / 3</div>
  </div>`;

  const pagina3 = `<div class="hc-page">
    ${encabezadoHoja("Historia Clínica Corporal", false)}

    <section class="hc-p-section">
      ${tituloSeccion("clipboard", 7, "Plan de tratamiento")}
      ${bloqueTexto("Plan de tratamiento recomendado", "planTratamiento")}
      ${bloqueTexto("Recomendaciones", "recomendaciones")}
      ${tablaEditablePreview("preciosCorporal", ["Fecha", "Sesiones", "Precio", "Tratamiento"])}
    </section>

    <section class="hc-p-section">
      ${tituloSeccion("heart", 8, "Consentimiento informado")}
      ${textoConsentimiento("corporal")}
      ${bloqueFirmas()}
    </section>

    <div class="hc-p-page-number">3 / 3</div>
  </div>`;

  return pagina1 + pagina2 + pagina3;
}

// EXPORTACIÓN A PDF

function slug(texto) {
  return (
    (texto || "paciente")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "paciente"
  );
}

async function esperarRecursosListos(contenedor) {
  if (document.fonts && document.fonts.ready) {
    await document.fonts.ready;
  }
  const imgs = $all("img", contenedor);
  await Promise.all(
    imgs.map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise((resolve) => {
            img.addEventListener("load", resolve, { once: true });
            img.addEventListener("error", resolve, { once: true });
          })
    )
  );
}

async function descargarPdf(tipo, datos) {
  const contenedor = tipo === "facial" ? $("#hc-preview-facial") : $("#hc-preview-corporal");
  const paginas = $all(".hc-page", contenedor);
  if (!paginas.length) throw new Error("No hay páginas para exportar.");

  await esperarRecursosListos(contenedor);

  window.scrollTo(0, 0);

  const opciones = {
    margin: 0,
    image: { type: "png" },
    html2canvas: { scale: 3, useCORS: true, backgroundColor: "#ffffff" },
    jsPDF: { unit: "px", format: [794, 1123], orientation: "portrait", hotfixes: ["px_scaling"] },
  };

  let pdf = await window.html2pdf().set(opciones).from(paginas[0]).toPdf().get("pdf");

  for (let i = 1; i < paginas.length; i++) {
    window.scrollTo(0, 0);
    const canvas = await window.html2pdf().set(opciones).from(paginas[i]).toCanvas().get("canvas");
    const imgData = canvas.toDataURL("image/png");
    pdf.addPage([794, 1123], "portrait");
    pdf.addImage(imgData, "PNG", 0, 0, 794, 1123);
  }

  pdf.save(`historia-clinica-${tipo}-${slug(datos.nombreCompleto)}.pdf`);
}

// PAYLOAD PARA SUPABASE

async function recolectarYGuardar(tipo, form) {
  const valoresFormulario = leerFormulario(form);

  const datosParaSupabase = {
    cita_id: citaActual?.id ?? null,
    cliente: valoresFormulario.nombreCompleto || citaActual?.cliente || "",
    tipo,
    creado_en: new Date().toISOString(),
    ...valoresFormulario,
  };

  console.log(`Historia clínica (${tipo}) lista para Supabase:`, datosParaSupabase);

  await guardarHistoriaClinica({ citaId: citaActual?.id, tipo, datos: valoresFormulario });

  return valoresFormulario;
}

// BOTÓN "DESCARGAR PDF": sincroniza, guarda y exporta

function initGenerarPdf() {
  $("#hc-generar-pdf").addEventListener("click", async () => {
    const btn = $("#hc-generar-pdf");
    if (btn.disabled) return;
    if (!tipoActual) return;
    const form = tipoActual === "facial" ? $("#form-historia-facial") : $("#form-historia-corporal");

    if (!form.reportValidity()) return;

    btn.disabled = true;
    const textoOriginal = btn.innerHTML;
    btn.innerHTML = "Generando…";
    try {
      const datos = await recolectarYGuardar(tipoActual, form);
      sincronizarVistaPrevia(tipoActual); // último repintado, por si acaso
      await descargarPdf(tipoActual, datos);
    } catch (err) {
      console.error(err);
      alert("No se pudo generar el PDF. Revisa la consola para más detalle.");
    } finally {
      btn.disabled = false;
      btn.innerHTML = textoOriginal;
    }
  });
}

// CONTADORES DE CARACTERES

function initContadores() {
  $all("textarea[data-contador]").forEach((textarea) => {
    const max = Number(textarea.getAttribute("maxlength")) || 0;
    const contador = document.createElement("span");
    contador.className = "hc-char-count";
    textarea.insertAdjacentElement("afterend", contador);

    const actualizar = () => {
      const usados = textarea.value.length;
      contador.textContent = `${usados} / ${max} caracteres`;
      contador.classList.toggle("is-cerca", max > 0 && usados >= max * 0.9);
    };
    textarea.addEventListener("input", actualizar);
    actualizar();
  });
}

// ARRANQUE

document.addEventListener("DOMContentLoaded", () => {
  initBotonAgenda();
  initModalTipo();
  initTopbar();
  initSincronizacionEnVivo();
  initGenerarPdf();
  initContadores();
});