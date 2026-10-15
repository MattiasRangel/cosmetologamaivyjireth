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

  if (!wrap) return;

  const esMovil = window.matchMedia("(pointer: coarse)").matches;
  const MAX_TILT = 16; // Inclinación vertical/mouse en grados
  let baseFlipY = 0;   // Múltiplos de 180° (0 = frente, ±180 = reverso)
  let dragAngleY = 0;  // Ángulo adicional mientras arrastras el dedo
  let startX = 0;
  let startY = 0;
  let isDragging = false;
  let lastTouchTime = 0;
  let rafId = null;

  const estaVolteada = () => Math.abs(Math.round(baseFlipY / 180)) % 2 === 1;

  const actualizarTextoBoton = () => {
    if (!textoBoton) return;
    if (esMovil) {
      textoBoton.textContent = estaVolteada()
        ? "Desliza la tarjeta con tu dedo para ver el frente"
        : "Desliza la tarjeta con tu dedo para ver el reverso";
    } else {
      textoBoton.textContent = estaVolteada()
        ? "Haz clic en la tarjeta para ver el frente"
        : "Haz clic en la tarjeta para ver el reverso";
    }
  };

  const aplicarVolteoBase = (nuevoAngulo) => {
    baseFlipY = nuevoAngulo;
    wrap.classList.toggle("is-flipped", estaVolteada());
    wrap.style.setProperty("--flip-y", `${baseFlipY}deg`);
    actualizarTextoBoton();
  };

  const resetearInclinacion = () => {
    if (rafId) cancelAnimationFrame(rafId);
    wrap.classList.remove("is-dragging");
    wrap.style.setProperty("--rx", "0deg");
    wrap.style.setProperty("--ry", "0deg");
    wrap.style.setProperty("--px", "0");
    wrap.style.setProperty("--py", "0");
    wrap.style.setProperty("--gx", "35%");
    wrap.style.setProperty("--gy", "25%");
    wrap.style.setProperty("--scale", "1");
    wrap.style.setProperty("--glare-op", "0.35");
  };

  actualizarTextoBoton();

  // =====================================================================
  // MÓVIL: Arrastrar con el dedo en 3D para inclinar y girar 180°
  // =====================================================================
  wrap.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      dragAngleY = 0;
      isDragging = true;
      wrap.classList.add("is-dragging");
    },
    { passive: true }
  );

  wrap.addEventListener(
    "touchmove",
    (e) => {
      if (!isDragging || e.touches.length !== 1) return;
      if (e.cancelable) e.preventDefault();

      const touch = e.touches[0];
      const rect = wrap.getBoundingClientRect();

      const deltaX = touch.clientX - startX;
      const deltaY = touch.clientY - startY;

      // Deslizar el 75% del ancho de la tarjeta equivale a un giro completo de 180°
      const rawAngleY = (deltaX / (rect.width * 0.75)) * 180;
      dragAngleY = Math.max(-180, Math.min(180, rawAngleY));

      // Inclinación vertical 3D según el movimiento vertical del dedo
      const py = Math.max(-1, Math.min(1, deltaY / (rect.height * 0.6)));
      const rx = (-py * MAX_TILT).toFixed(2);

      // Sombra y grosor 3D dinámicos según el ángulo de giro
      const px = Math.sin((dragAngleY * Math.PI) / 180);

      // Posición del reflejo de luz (glare) siguiendo al dedo
      const xRel = Math.min(Math.max(touch.clientX - rect.left, 0), rect.width);
      const yRel = Math.min(Math.max(touch.clientY - rect.top, 0), rect.height);
      const gx = ((xRel / rect.width) * 100).toFixed(1);
      const gy = ((yRel / rect.height) * 100).toFixed(1);

      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        wrap.style.setProperty("--rx", `${rx}deg`);
        wrap.style.setProperty("--ry", `${dragAngleY.toFixed(2)}deg`);
        wrap.style.setProperty("--px", px.toFixed(3));
        wrap.style.setProperty("--py", py.toFixed(3));
        wrap.style.setProperty("--gx", `${gx}%`);
        wrap.style.setProperty("--gy", `${gy}%`);
        wrap.style.setProperty("--scale", "1.03");
        wrap.style.setProperty("--glare-op", "0.8");
      });
    },
    { passive: false }
  );

  const finalizarToque = () => {
    if (!isDragging) return;
    isDragging = false;
    lastTouchTime = Date.now();

    // Si deslizó más de 45° hacia la derecha o izquierda, completa el giro 3D
    if (dragAngleY > 45) {
      aplicarVolteoBase(baseFlipY + 180);
    } else if (dragAngleY < -45) {
      aplicarVolteoBase(baseFlipY - 180);
    }

    dragAngleY = 0;
    resetearInclinacion();
  };

  wrap.addEventListener("touchend", finalizarToque);
  wrap.addEventListener("touchcancel", () => {
    isDragging = false;
    dragAngleY = 0;
    resetearInclinacion();
  });

  // =====================================================================
  // ESCRITORIO: Inclinación 3D con el mouse y clic para voltear
  // =====================================================================
  wrap.addEventListener("mousemove", (e) => {
    if (Date.now() - lastTouchTime < 600) return;
    const rect = wrap.getBoundingClientRect();
    const x = Math.min(Math.max(e.clientX - rect.left, 0), rect.width);
    const y = Math.min(Math.max(e.clientY - rect.top, 0), rect.height);

    const px = (x / rect.width - 0.5) * 2;
    const py = (y / rect.height - 0.5) * 2;
    const rx = (-py * MAX_TILT).toFixed(2);
    const ry = (px * MAX_TILT).toFixed(2);
    const gx = ((x / rect.width) * 100).toFixed(1);
    const gy = ((y / rect.height) * 100).toFixed(1);

    wrap.classList.add("is-dragging");
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      wrap.style.setProperty("--rx", `${rx}deg`);
      wrap.style.setProperty("--ry", `${ry}deg`);
      wrap.style.setProperty("--px", px.toFixed(3));
      wrap.style.setProperty("--py", py.toFixed(3));
      wrap.style.setProperty("--gx", `${gx}%`);
      wrap.style.setProperty("--gy", `${gy}%`);
      wrap.style.setProperty("--scale", "1.03");
      wrap.style.setProperty("--glare-op", "0.75");
    });
  });

  wrap.addEventListener("mouseleave", resetearInclinacion);

  // En escritorio el clic voltea; en celular se ignora el toque simple en la tarjeta
  wrap.addEventListener("click", () => {
    if (Date.now() - lastTouchTime < 600) return;
    aplicarVolteoBase(baseFlipY + 180);
  });

  if (boton) {
    boton.addEventListener("click", (e) => {
      e.stopPropagation();
      aplicarVolteoBase(baseFlipY + 180);
    });
  }
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