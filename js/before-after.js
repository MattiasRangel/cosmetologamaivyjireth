/**
 * before-after.js — comparador de imágenes "Antes / Después" arrastrable,
 * compatible con mouse y pantallas táctiles.
 */
document.addEventListener("DOMContentLoaded", () => {
  const sliders = document.querySelectorAll(".ba-slider");

  sliders.forEach((slider) => {
    const afterImg = slider.querySelector(".ba-after");
    const handle = slider.querySelector(".ba-handle");
    let dragging = false;

    const setPosition = (percent) => {
      const clamped = Math.min(100, Math.max(0, percent));
      afterImg.style.clipPath = `inset(0 0 0 ${clamped}%)`;
      handle.style.left = `${clamped}%`;
    };

    const positionFromClientX = (clientX) => {
      const rect = slider.getBoundingClientRect();
      const percent = ((clientX - rect.left) / rect.width) * 100;
      setPosition(percent);
    };

    // --- Mouse ---
    handle.addEventListener("mousedown", (e) => {
      dragging = true;
      e.preventDefault();
      // Evita que este mismo clic también dispare el mousedown del
      // slider (más abajo) y "salte" la posición justo al empezar a
      // arrastrar desde el propio manubrio.
      e.stopPropagation();
    });
    slider.addEventListener("mousedown", (e) => {
      dragging = true;
      positionFromClientX(e.clientX);
    });
    window.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      positionFromClientX(e.clientX);
    });
    window.addEventListener("mouseup", () => (dragging = false));

    // --- Touch ---
    slider.addEventListener(
      "touchstart",
      (e) => {
        dragging = true;
        positionFromClientX(e.touches[0].clientX);
      },
      { passive: true }
    );
    slider.addEventListener(
      "touchmove",
      (e) => {
        if (!dragging) return;
        positionFromClientX(e.touches[0].clientX);
      },
      { passive: true }
    );
    window.addEventListener("touchend", () => (dragging = false));

    // --- Teclado (accesibilidad): flechas mueven el divisor ---
    handle.setAttribute("tabindex", "0");
    handle.setAttribute("role", "slider");
    handle.setAttribute("aria-label", "Deslizar para comparar antes y después");
    handle.setAttribute("aria-valuemin", "0");
    handle.setAttribute("aria-valuemax", "100");
    handle.setAttribute("aria-valuenow", "50");
    handle.addEventListener("keydown", (e) => {
      const rect = slider.getBoundingClientRect();
      const current = parseFloat(handle.style.left) || 50;
      if (e.key === "ArrowLeft") {
        setPosition(current - 5);
        handle.setAttribute("aria-valuenow", String(Math.round(current - 5)));
      }
      if (e.key === "ArrowRight") {
        setPosition(current + 5);
        handle.setAttribute("aria-valuenow", String(Math.round(current + 5)));
      }
    });

    setPosition(50);
  });
});