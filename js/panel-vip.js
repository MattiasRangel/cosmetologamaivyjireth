/**
 * panel-vip.js
 * -----------------------------------------------------------------------
 * Pantalla de gestión de UNA Tarjeta VIP (abierta desde el botón
 * "Gestionar" en la fila de la tabla de Tarjetas VIP). Muestra la
 * delantera y la trasera de la tarjeta, y deja "pegar" o "quitar" los
 * stickers de las 10 visitas — que es justo lo que la clienta ve reflejado
 * en mi-tarjeta-vip.html a través del mismo código de acceso.
 * -----------------------------------------------------------------------
 */
import * as api from "./panel-data.js";

const $ = (sel, root = document) => root.querySelector(sel);
const $all = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const TOTAL_VISITAS = 10;
const VISITA_DESCUENTO = 5;
const VISITA_OBSEQUIO = 10;

let tarjetaActual = null; // la tarjeta VIP abierta actualmente en esta pantalla

/* ========================================================================
   ABRIR / CERRAR LA PANTALLA
   ======================================================================== */

function initBotonGestionar() {
  $("#vip-tbody")?.addEventListener("click", async (e) => {
    const btn = e.target.closest('button[data-accion="gestionar-vip"]');
    if (!btn) return;
    await abrirGestion(btn.dataset.id);
  });
}

async function abrirGestion(id) {
  const tarjeta = await api.getVipCardById(id);
  if (!tarjeta) return;
  tarjetaActual = tarjeta;

  $all(".tab-panel").forEach((p) => p.classList.remove("is-active"));
  $("#tab-vip-gestion").classList.add("is-active");

  pintarTarjeta();
}

function volverAListaVip() {
  tarjetaActual = null;
  $all(".tab-panel").forEach((p) => p.classList.remove("is-active"));
  $("#tab-vip").classList.add("is-active");
  $all(".nav-item").forEach((btn) => btn.classList.toggle("is-active", btn.dataset.tab === "vip"));
  $("#panel-page-title").textContent = "Tarjetas VIP";
  // La tabla puede haber cambiado (visitas actualizadas) — se refresca al volver.
  window.dispatchEvent(new CustomEvent("mj:vip-refrescar-lista"));
}

function initTopbar() {
  $("#vipg-volver").addEventListener("click", volverAListaVip);

  $("#vipg-copiar-codigo").addEventListener("click", async () => {
    if (!tarjetaActual) return;
    try {
      await navigator.clipboard.writeText(tarjetaActual.codigo);
      avisar("Código copiado.");
    } catch {
      avisar("No se pudo copiar — copia el código a mano.");
    }
  });

  $("#vipg-toggle-estado").addEventListener("click", async () => {
    if (!tarjetaActual) return;
    const nuevoEstado = await api.toggleVipCardStatus(tarjetaActual.id);
    tarjetaActual.estado = nuevoEstado;
    pintarTarjeta();
    avisar(nuevoEstado === "activa" ? "Tarjeta reactivada." : "Tarjeta dada de baja.");
  });
}

/** Aviso pequeño reutilizando el mismo #toast del resto del panel (panel-app.js lo controla, pero el elemento es compartido). */
function avisar(mensaje) {
  const toast = $("#toast");
  if (!toast) return;
  toast.textContent = mensaje;
  toast.hidden = false;
  requestAnimationFrame(() => toast.classList.add("is-visible"));
  clearTimeout(avisar._t);
  avisar._t = setTimeout(() => {
    toast.classList.remove("is-visible");
    setTimeout(() => (toast.hidden = true), 250);
  }, 2400);
}

/* ========================================================================
   PINTAR LA TARJETA (delantera + trasera + panel de control)
   ======================================================================== */

function formatearFechaCorta(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${Number(d)} ${MESES[Number(m) - 1]} ${y}`;
}
function formatearFechaSlash(iso) {
  if (!iso) return "**/**/**";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function pintarTarjeta() {
  if (!tarjetaActual) return;
  const t = tarjetaActual;

  // --- Topbar ---
  $("#vipg-cliente-label").textContent = t.cliente;
  $("#vipg-codigo-texto").textContent = t.codigo;
  $("#vipg-toggle-estado").textContent = t.estado === "activa" ? "Dar de baja" : "Reactivar";

  // --- Delantera ---
  $("#vipg-front-nombre").textContent = t.cliente;
  const numeroSpans = $all("#vipg-front-numero span");
  const grupos = (t.numeroTarjeta || "").split(" ");
  numeroSpans.forEach((span, i) => (span.textContent = grupos[i] || "****"));
  $("#vipg-front-valido").textContent = formatearFechaSlash(t.validaHasta);

  // --- Trasera: grilla de 10 círculos ---
  pintarPunchGrid(t.visitas || 0);

  // --- Panel de control: progreso ---
  const visitas = t.visitas || 0;
  $("#vipg-progress-texto").textContent = `${visitas} de ${TOTAL_VISITAS} visitas`;
  $("#vipg-progress-fill").style.width = `${(visitas / TOTAL_VISITAS) * 100}%`;

  let hint = "";
  if (visitas >= VISITA_OBSEQUIO) hint = "🎁 ¡Ciclo completo! Ya puede canjear su obsequio y tratamiento gratis.";
  else if (visitas >= VISITA_DESCUENTO) hint = `Ya desbloqueó el 50% de descuento. Faltan ${TOTAL_VISITAS - visitas} visitas para el obsequio.`;
  else hint = `Faltan ${VISITA_DESCUENTO - visitas} visitas para el 50% de descuento.`;
  $("#vipg-progress-hint").textContent = hint;

  $("#vipg-quitar-visita").disabled = visitas <= 0;
  $("#vipg-agregar-visita").disabled = visitas >= TOTAL_VISITAS;
  $("#vipg-canjear-ciclo").hidden = visitas < TOTAL_VISITAS;

  // --- Panel de control: datos ---
  $("#vipg-dato-codigo").textContent = t.codigo;
  $("#vipg-dato-numero").textContent = t.numeroTarjeta || "—";
  $("#vipg-dato-creada").textContent = formatearFechaCorta(t.fechaCreacion);
  $("#vipg-dato-valida").textContent = formatearFechaCorta(t.validaHasta);
  $("#vipg-dato-ciclos").textContent = String(t.ciclosCompletados || 0);
}

function pintarPunchGrid(visitas) {
  const grid = $("#vipg-punch-grid");
  if (!grid) return;
  grid.innerHTML = Array.from({ length: TOTAL_VISITAS }, (_, i) => {
    const numero = i + 1;
    const marcada = numero <= visitas;
    const esHito = numero === VISITA_DESCUENTO || numero === VISITA_OBSEQUIO;
    let valorHtml = String(numero);
    if (numero === VISITA_DESCUENTO) valorHtml = "¡50%!";
    if (numero === VISITA_OBSEQUIO) {
      valorHtml = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="8" width="18" height="13" rx="1"/><path d="M3 8h18M12 8v13M12 8c-2-3-7-3-7 0s5 3 7 0zm0 0c2-3 7-3 7 0s-5 3-7 0z"/></svg>';
    }
    const stickerHtml = `
      <span class="vipg-punch-sticker-wrap">
        <img class="vipg-punch-sticker-img" src="/imagenes/stikerdevisita.png" alt=""
          onerror="this.hidden=true; this.nextElementSibling.hidden=false;" />
        <svg class="vipg-punch-sticker" hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
      </span>`;
    return `
      <button type="button"
        class="vipg-punch ${esHito ? "is-hito" : ""} ${marcada ? "is-marcada" : ""}"
        data-numero="${numero}"
        title="Visita ${numero}${marcada ? " — pegada" : ""}">
        ${marcada ? stickerHtml : `<span class="vipg-punch-label">Cita</span><span class="vipg-punch-value">${valorHtml}</span>`}
      </button>`;
  }).join("");

  $all(".vipg-punch", grid).forEach((btn) => {
    btn.addEventListener("click", () => alClickCirculo(Number(btn.dataset.numero)));
  });
}

/* ========================================================================
   ACCIONES: tocar un círculo, +1/−1, canjear ciclo
   ======================================================================== */

/**
 * Tocar el círculo N: si N ya estaba pegado y es el último pegado, lo
 * despega (retrocede una visita). Si no estaba pegado, pega TODOS los
 * círculos hasta N (una tarjeta de sellos no tiene huecos: si se marca la
 * visita 4, las visitas 1-3 tenían que haber pasado antes).
 */
async function alClickCirculo(numero) {
  if (!tarjetaActual) return;
  const visitasActuales = tarjetaActual.visitas || 0;
  const nuevasVisitas = numero === visitasActuales ? numero - 1 : numero;
  await actualizarVisitas(nuevasVisitas);
}

function initBotonesVisita() {
  $("#vipg-agregar-visita").addEventListener("click", () => {
    if (!tarjetaActual) return;
    actualizarVisitas(Math.min(TOTAL_VISITAS, (tarjetaActual.visitas || 0) + 1));
  });
  $("#vipg-quitar-visita").addEventListener("click", () => {
    if (!tarjetaActual) return;
    actualizarVisitas(Math.max(0, (tarjetaActual.visitas || 0) - 1));
  });
  $("#vipg-canjear-ciclo").addEventListener("click", async () => {
    if (!tarjetaActual) return;
    if (!confirm("¿Confirmar la entrega del obsequio y el tratamiento gratis, y reiniciar el ciclo a 0 visitas?")) return;
    tarjetaActual = await api.canjearCicloVip(tarjetaActual.id);
    pintarTarjeta();
    avisar("¡Ciclo canjeado! La tarjeta vuelve a empezar en 0.");
  });
}

async function actualizarVisitas(nuevoValor) {
  tarjetaActual = await api.setVipCardVisitas(tarjetaActual.id, nuevoValor);
  pintarTarjeta();
}

/* ========================================================================
   ARRANQUE
   ======================================================================== */

document.addEventListener("DOMContentLoaded", () => {
  initBotonGestionar();
  initTopbar();
  initBotonesVisita();
});