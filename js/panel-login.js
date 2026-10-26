/**
 * panel-login.js
 * -----------------------------------------------------------------------
 * Lógica exclusiva de panel-privado.html. Al iniciar sesión con éxito,
 * navega a panel-admin.html — panel-app.js se encarga de proteger esa
 * página revisando la sesión real de Supabase con
 * `supabase.auth.getSession()` (ver el guard al inicio de panel-app.js).
 *
 * login() (en panel-data.js) ya llama internamente a
 * `supabase.auth.signInWithPassword()`, que deja una sesión real (JWT
 * gestionado por el propio SDK) — no hace falta ninguna marca casera de
 * sessionStorage.
 * -----------------------------------------------------------------------
 */
import { login } from "./panel-data.js";

const $ = (sel) => document.querySelector(sel);

document.addEventListener("DOMContentLoaded", () => {
  const form = $("#login-form");
  const errorEl = $("#login-error");
  const submitBtn = $("#login-submit");
  const btnLabel = $(".btn-label", submitBtn);
  const btnSpinner = $(".btn-spinner", submitBtn);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.hidden = true;
    submitBtn.disabled = true;
    btnLabel.textContent = "Ingresando…";
    btnSpinner.hidden = false;

    const email = $("#login-email").value.trim();
    const password = $("#login-password").value;

    try {
      const resultado = await login(email, password);
      if (resultado.ok) {
        window.location.href = "panel-admin.html";
        return; // no reactivar el botón: la página está navegando
      }
      errorEl.textContent = resultado.mensaje || "No se pudo iniciar sesión.";
      errorEl.hidden = false;
    } catch (err) {
      errorEl.textContent = "Ocurrió un error inesperado. Intenta de nuevo.";
      errorEl.hidden = false;
      console.error(err);
    } finally {
      submitBtn.disabled = false;
      btnLabel.textContent = "Ingresar";
      btnSpinner.hidden = true;
    }
  });
});