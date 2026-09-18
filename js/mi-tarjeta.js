/**
 * mi-tarjeta.js
 * -----------------------------------------------------------------------
 * Página mi-tarjeta-vip.html — puramente visual, de solo lectura para la
 * clienta. Busca la tarjeta por el código que viene en la URL
 * (?codigo=MJVIP-XXXXX), pinta la delantera y la trasera (con los
 * stickers de las visitas que la administradora ya marcó desde el panel)
 * y maneja el volteo 3D de la tarjeta.
 * -----------------------------------------------------------------------
 */
import { getVipCardByCodigo, VIP_CONFIG } from "./vip-data.js";

const $ = (sel) => document.querySelector(sel);
const $all = (sel) => Array.from(document.querySelectorAll(sel));

const { TOTAL_VISITAS_CICLO: TOTAL_VISITAS, VISITA_DESCUENTO, VISITA_OBSEQUIO } = VIP_CONFIG;

function formatearFechaSlash(iso) {
  if (!iso) return "**/**/**";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function mostrarEstado(nombre) {
  ["cargando", "error", "tarjeta"].forEach((s) => {
    $(`#estado-${s}`).classList.toggle("hidden", s !== nombre);
  });
}

function pintarPunchGrid(visitas) {
  const grid = $("#mv-punch-grid");
  grid.innerHTML = Array.from({ length: TOTAL_VISITAS }, (_, i) => {
    const numero = i + 1;
    const completada = numero <= visitas;
    const esHito = numero === VISITA_DESCUENTO || numero === VISITA_OBSEQUIO;
    let valorHtml = String(numero);
    if (numero === VISITA_DESCUENTO) valorHtml = "¡50%!";
    if (numero === VISITA_OBSEQUIO) {
      valorHtml = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="8" width="18" height="13" rx="1"/><path d="M3 8h18M12 8v13M12 8c-2-3-7-3-7 0s5 3 7 0zm0 0c2-3 7-3 7 0s-5 3-7 0z"/></svg>';
    }
    const stickerHtml = `
      <span class="mv-punch-sticker-wrap">
        <img class="mv-punch-sticker-img" src="imagenes/stikerdevisita.png" alt=""
          onerror="this.hidden=true; this.nextElementSibling.hidden=false;" />
        <svg class="mv-punch-sticker" hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
      </span>`;
    return `
      <div class="mv-punch ${esHito ? "is-hito" : ""} ${completada ? "is-completado" : ""}" title="Visita ${numero}">
        ${completada ? stickerHtml : `<span class="mv-punch-label">Cita</span><span class="mv-punch-value">${valorHtml}</span>`}
      </div>`;
  }).join("");
}

function pintarTarjeta(tarjeta) {
  const visitas = tarjeta.visitas || 0;

  // Encabezado + delantera
  const primerNombre = (tarjeta.cliente || "").trim().split(/\s+/)[0] || "";
  $("#tarjeta-nombre").textContent = primerNombre || tarjeta.cliente || "";
  $("#front-nombre").textContent = tarjeta.cliente || "";
  const grupos = (tarjeta.numeroTarjeta || "").split(" ");
  $all("#front-numero span").forEach((span, i) => (span.textContent = grupos[i] || "****"));
  $("#front-valido").textContent = formatearFechaSlash(tarjeta.validaHasta);

  // Trasera
  pintarPunchGrid(visitas);

  // Progreso
  $("#progreso-texto").textContent = `${visitas} de ${TOTAL_VISITAS} visitas`;
  $("#progreso-fill").style.width = `${(visitas / TOTAL_VISITAS) * 100}%`;
  $("#progreso-ciclos").textContent = tarjeta.ciclosCompletados
    ? `${tarjeta.ciclosCompletados} ciclo(s) completados antes`
    : "";

  let hint = "";
  if (visitas >= VISITA_OBSEQUIO) hint = "🎁 ¡Completaste el ciclo! Pregunta por tu obsequio y tratamiento gratis en tu próxima cita.";
  else if (visitas >= VISITA_DESCUENTO) hint = `Ya tienes tu 50% de descuento activo. Te faltan ${TOTAL_VISITAS - visitas} visitas para el obsequio.`;
  else hint = `Te faltan ${VISITA_DESCUENTO - visitas} visitas para desbloquear el 50% de descuento.`;
  $("#progreso-hint").textContent = hint;

  mostrarEstado("tarjeta");
  if (window.lucide) lucide.createIcons();
}

function initVoltear() {
  const wrap = $("#mv-flip-wrap");
  const boton = $("#btn-voltear");
  const textoBoton = $("#btn-voltear-texto");

  const voltear = () => {
    const yaVolteada = wrap.classList.toggle("is-flipped");
    textoBoton.textContent = yaVolteada ? "Toca la tarjeta para ver el frente" : "Toca la tarjeta para ver el reverso";
  };

  wrap.addEventListener("click", voltear);
  boton.addEventListener("click", (e) => {
    e.stopPropagation();
    voltear();
  });
}

async function init() {
  window.addEventListener("load", () => {
    if (window.lucide) lucide.createIcons();
  });

  const el = document.getElementById("current-year");
  if (el) el.textContent = new Date().getFullYear();

  const codigo = new URLSearchParams(window.location.search).get("codigo");
  if (!codigo) {
    mostrarEstado("error");
    return;
  }

  const tarjeta = await getVipCardByCodigo(codigo);
  if (!tarjeta || tarjeta.estado !== "activa") {
    mostrarEstado("error");
    return;
  }

  pintarTarjeta(tarjeta);
  initVoltear();

  // Si la administradora marca una visita mientras la clienta tiene esta
  // misma página abierta en otra pestaña de ESTE MISMO navegador, se
  // refresca sola (ver el CustomEvent que dispara vip-data.js al guardar).
  window.addEventListener("mj:vip-tarjetas-cambiaron", async () => {
    const actualizada = await getVipCardByCodigo(codigo);
    if (actualizada) pintarTarjeta(actualizada);
  });

  // Con Supabase el cambio puede venir de OTRO dispositivo por completo
  // (la administradora marcando visitas desde el panel en su propio
  // celular o computador) — para eso, en vez del evento "storage" de
  // localStorage, se escucha en tiempo real la fila de esta tarjeta.
  if (window.supabaseClient) {
    window.supabaseClient
      .channel(`tarjeta-vip-${codigo}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "tarjetas_vip", filter: `codigo=eq.${codigo}` },
        async () => {
          const actualizada = await getVipCardByCodigo(codigo);
          if (actualizada) pintarTarjeta(actualizada);
        }
      )
      .subscribe();
  }
}

document.addEventListener("DOMContentLoaded", init);