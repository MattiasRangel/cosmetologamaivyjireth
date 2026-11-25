// Tarjeta VIP de la clienta

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
  const nombreFrente = $("#front-nombre");
  nombreFrente.textContent = tarjeta.cliente || "";
  const largoNombre = (tarjeta.cliente || "").length;
  if (largoNombre > 16) nombreFrente.dataset.largo = "muy";
  else if (largoNombre > 11) nombreFrente.dataset.largo = "si";
  else delete nombreFrente.dataset.largo;
  nombreFrente.title = tarjeta.cliente || "";
  const grupos = (tarjeta.numeroTarjeta || "").split(" ");
  $all("#front-numero span").forEach((span, i) => (span.textContent = grupos[i] || "****"));
  $("#front-valido").textContent = formatearFechaSlash(tarjeta.validaHasta);

  pintarPunchGrid(visitas);

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
  const inner = $("#mv-flip-inner");
  const boton = $("#btn-voltear");
  const textoBoton = $("#btn-voltear-texto");

  if (!wrap || !inner) return;

  const esMovil = window.matchMedia("(pointer: coarse)").matches;
  const sinMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const MAX_TILT = 14;        // inclinación con el mouse, en grados
  const GRADOS_POR_ANCHO = 240;
  const IMPULSO_MS = 260;
  const MAX_EXTRA = 540;

  const brillos = [".vip-card", ".mv-card-back"].map((sel) => {
    const cara = inner.querySelector(sel);
    if (!cara) return null;
    const brillo = document.createElement("span");
    brillo.className = "mv-brillo";
    brillo.setAttribute("aria-hidden", "true");
    cara.appendChild(brillo);
    return brillo;
  }).filter(Boolean);

  // Ángulos absolutos
  let baseY = 0;
  const objetivo = { rx: 0, ry: 0, s: 1, gx: 0.3, gy: 0.25 };
  const actual = { ...objetivo };
  let suavizado = 0.12;
  let rafId = null;
  let ultimoT = 0;
  let rect = null;
  let lastTouchTime = 0;

  // Estado del arrastre táctil
  let arrastrando = false;
  let inicio = { x: 0, y: 0, rx: 0, ry: 0 };
  let previo = { x: 0, y: 0, t: 0 };
  let vel = { x: 0, y: 0 }; // grados por milisegundo, suavizada
  let sentidoY = 1;

  const muestraReverso = () => Math.abs(Math.round(baseY / 180)) % 2 === 1;

  const actualizarTextoBoton = () => {
    if (!textoBoton) return;
    const lado = muestraReverso() ? "el frente" : "el reverso";
    textoBoton.textContent = esMovil
      ? `Gira la tarjeta con tu dedo para ver ${lado}`
      : `Haz clic en la tarjeta para ver ${lado}`;
  };

  const caraFrente = inner.querySelector(".mv-face--front");
  const caraReverso = inner.querySelector(".mv-face--back");
  let frenteVisible = null;
  const mostrarCaraCorrecta = () => {
    const rad = Math.PI / 180;
    const visible = Math.cos(actual.rx * rad) * Math.cos(actual.ry * rad) >= 0;
    if (visible === frenteVisible) return;
    frenteVisible = visible;
    if (caraFrente) caraFrente.style.visibility = visible ? "visible" : "hidden";
    if (caraReverso) caraReverso.style.visibility = visible ? "hidden" : "visible";
  };

  const pintar = () => {
    mostrarCaraCorrecta();
    inner.style.transform =
      `rotateX(${actual.rx.toFixed(2)}deg) rotateY(${actual.ry.toFixed(2)}deg) scale(${actual.s.toFixed(4)})`;
    const tx = ((actual.gx - 0.5) * 100).toFixed(1);
    const ty = ((actual.gy - 0.5) * 100).toFixed(1);
    brillos.forEach((b) => (b.style.transform = `translate3d(${tx}%, ${ty}%, 0)`));
  };

  const normalizar = () => {
    const vueltasX = Math.round(actual.rx / 360) * 360;
    actual.rx -= vueltasX; objetivo.rx -= vueltasX;
    const vueltasY = Math.floor(baseY / 360) * 360;
    baseY -= vueltasY; actual.ry -= vueltasY; objetivo.ry -= vueltasY;
  };

  const paso = (t) => {
    const dt = ultimoT ? Math.min(64, t - ultimoT) : 16.7;
    ultimoT = t;
    const f = sinMovimiento ? 1 : 1 - Math.pow(1 - suavizado, dt / 16.7);
    let quieto = true;
    for (const k of ["rx", "ry", "s", "gx", "gy"]) {
      const d = objetivo[k] - actual[k];
      if (Math.abs(d) > 0.02) { actual[k] += d * f; quieto = false; } else actual[k] = objetivo[k];
    }
    pintar();
    if (quieto && !arrastrando) {
      normalizar();
      pintar();
      rafId = null; ultimoT = 0;
      return;
    }
    rafId = requestAnimationFrame(paso);
  };

  const animar = () => { if (!rafId) rafId = requestAnimationFrame(paso); };

  const elegirCara = (nuevaBaseY) => {
    baseY = nuevaBaseY;
    wrap.classList.toggle("is-flipped", muestraReverso());
    actualizarTextoBoton();
  };

  const reposoEscritorio = () => {
    Object.assign(objetivo, { rx: Math.round(objetivo.rx / 360) * 360, ry: baseY, s: 1, gx: 0.3, gy: 0.25 });
    wrap.classList.remove("is-activa");
    suavizado = 0.12;
    animar();
  };

  const voltear = (delta) => {
    elegirCara(baseY + delta);
    objetivo.ry = baseY;
    suavizado = 0.12;
    animar();
  };

  actualizarTextoBoton();
  pintar();

  // CELULAR: giro libre con impulso
  wrap.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    rect = wrap.getBoundingClientRect(); // se mide una vez por toque
    arrastrando = true;
    // Atrapa la tarjeta donde está, aunque todavía vaya girando.
    objetivo.rx = actual.rx; objetivo.ry = actual.ry;
    inicio = { x: t.clientX, y: t.clientY, rx: actual.rx, ry: actual.ry };
    sentidoY = Math.cos((actual.rx * Math.PI) / 180) < 0 ? -1 : 1;
    previo = { x: t.clientX, y: t.clientY, t: e.timeStamp };
    vel = { x: 0, y: 0 };
    objetivo.s = 1.04;
    suavizado = 0.55; // pegado al dedo
    wrap.classList.add("is-activa");
    animar();
  }, { passive: true });

  wrap.addEventListener("touchmove", (e) => {
    if (!arrastrando || e.touches.length !== 1 || !rect) return;
    if (e.cancelable) e.preventDefault();
    const t = e.touches[0];
    const k = GRADOS_POR_ANCHO / rect.width;
    objetivo.ry = inicio.ry + (t.clientX - inicio.x) * k * sentidoY;
    objetivo.rx = inicio.rx - (t.clientY - inicio.y) * k;
    objetivo.gx = Math.min(Math.max((t.clientX - rect.left) / rect.width, 0), 1);
    objetivo.gy = Math.min(Math.max((t.clientY - rect.top) / rect.height, 0), 1);

    // Velocidad (grados/ms) suavizada, para el impulso al soltar.
    const dt = Math.max(1, e.timeStamp - previo.t);
    const vx = ((t.clientX - previo.x) * k * sentidoY) / dt;
    const vy = (-(t.clientY - previo.y) * k) / dt;
    vel.x = vel.x * 0.6 + vx * 0.4;
    vel.y = vel.y * 0.6 + vy * 0.4;
    previo = { x: t.clientX, y: t.clientY, t: e.timeStamp };
    animar();
  }, { passive: false });

  const soltar = (e) => {
    if (!arrastrando) return;
    arrastrando = false;
    lastTouchTime = Date.now();
    // Si el dedo se quedó quieto antes de soltar, no hay impulso.
    const quietoAntes = e && e.timeStamp - previo.t > 90;
    const vx = quietoAntes ? 0 : vel.x;
    const vy = quietoAntes ? 0 : vel.y;
    const tope = (v) => Math.max(-MAX_EXTRA, Math.min(MAX_EXTRA, v * IMPULSO_MS));
    // A dónde llegaría con ese impulso; ahí se elige la cara
    const destinoY = actual.ry + tope(vx);
    const destinoX = actual.rx + tope(vy);
    elegirCara(Math.round(destinoY / 180) * 180);
    objetivo.ry = baseY;
    objetivo.rx = Math.round(destinoX / 360) * 360;
    objetivo.s = 1;
    objetivo.gx = 0.3; objetivo.gy = 0.25;
    suavizado = 0.085;
    wrap.classList.remove("is-activa");
    animar();
  };
  wrap.addEventListener("touchend", soltar);
  wrap.addEventListener("touchcancel", soltar);

  // ESCRITORIO: inclinación con el mouse y clic para voltear
  wrap.addEventListener("mouseenter", () => { rect = wrap.getBoundingClientRect(); });
  wrap.addEventListener("mousemove", (e) => {
    if (Date.now() - lastTouchTime < 600) return;
    if (!rect) rect = wrap.getBoundingClientRect();
    const x = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    const y = Math.min(Math.max((e.clientY - rect.top) / rect.height, 0), 1);
    objetivo.rx = -(y - 0.5) * 2 * MAX_TILT;
    objetivo.ry = baseY + (x - 0.5) * 2 * MAX_TILT;
    objetivo.s = 1.03;
    objetivo.gx = x;
    objetivo.gy = y;
    suavizado = 0.18;
    wrap.classList.add("is-activa");
    animar();
  });
  wrap.addEventListener("mouseleave", () => { rect = null; reposoEscritorio(); });
  window.addEventListener("resize", () => { rect = null; }, { passive: true });
  window.addEventListener("scroll", () => { rect = null; }, { passive: true });

  wrap.addEventListener("click", () => {
    if (Date.now() - lastTouchTime < 600) return;
    voltear(180);
  });

  if (boton) {
    boton.addEventListener("click", (e) => {
      e.stopPropagation();
      voltear(180);
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

  window.addEventListener("mj:vip-tarjetas-cambiaron", async () => {
    const actualizada = await getVipCardByCodigo(codigo);
    if (actualizada) pintarTarjeta(actualizada);
  });

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