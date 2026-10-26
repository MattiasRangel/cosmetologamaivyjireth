/**
 * tarjeta-consulta.js
 * -----------------------------------------------------------------------
 * Maneja el modal "Consultar mi tarjeta" de tarjeta-vip.html: pide el
 * código, lo valida contra vip-data.js (misma fuente que usa el panel) y,
 * si es válido, lleva a la clienta a mi-tarjeta-vip.html con su código.
 * -----------------------------------------------------------------------
 */
import { getVipCardByCodigo } from "./vip-data.js";

const $ = (sel) => document.querySelector(sel);

document.addEventListener("DOMContentLoaded", () => {
  const modal = $("#modal-consultar-tarjeta");
  const abrirBtn = $("#btn-consultar-tarjeta");
  const cerrarBtn = $("#modal-consultar-cerrar");
  const overlay = $("#modal-consultar-overlay");
  const form = $("#form-consultar-tarjeta");
  const input = $("#input-codigo-tarjeta");
  const error = $("#error-codigo-tarjeta");
  const submitBtn = $("#btn-ver-tarjeta");
  if (!modal || !form) return;

  const abrirModal = () => {
    modal.classList.remove("hidden");
    modal.classList.add("flex");
    error.classList.add("hidden");
    input.value = "";
    setTimeout(() => input.focus(), 50);
  };
  const cerrarModal = () => {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  };

  abrirBtn?.addEventListener("click", abrirModal);
  cerrarBtn?.addEventListener("click", cerrarModal);
  overlay?.addEventListener("click", cerrarModal);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.classList.contains("hidden")) cerrarModal();
  });
  input?.addEventListener("input", () => error.classList.add("hidden"));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const codigo = input.value.trim();
    if (!codigo) return;

    submitBtn.disabled = true;
    submitBtn.textContent = "Verificando…";

    const tarjeta = await getVipCardByCodigo(codigo);

    submitBtn.disabled = false;
    submitBtn.textContent = "Ver mi tarjeta";

    if (!tarjeta) {
      error.textContent = "Código no válido. Revísalo e intenta de nuevo.";
      error.classList.remove("hidden");
      return;
    }
    if (tarjeta.estado !== "activa") {
      error.textContent = "Esta tarjeta no está activa. Contáctanos para más información.";
      error.classList.remove("hidden");
      return;
    }

    window.location.href = `mi-tarjeta-vip.html?codigo=${encodeURIComponent(tarjeta.codigo)}`;
  });

  // Si se llega con ?tarjeta=1 desde otra página, abre el modal directo.
  if (new URLSearchParams(window.location.search).get("tarjeta") === "1") {
    setTimeout(abrirModal, 400);
  }
});
