/**
 * main.js — comportamiento general de la landing:
 * navbar, menú móvil, scroll reveal, "Hilo del Ritual", render de
 * servicios y testimonios, formulario de reseñas.
 */

document.addEventListener("DOMContentLoaded", async () => {
  initNavbar();
  initMobileMenu();
  initScrollReveal();
  initAbout();
  initImageLightbox();
  initYear();
  initAutoOpenBooking();

  // El Ritual y los videos de TikTok usan datos estáticos (RITUAL_STEPS y
  // TIKTOK_VIDEOS, en data.js) que NO dependen de Supabase, así que se
  // pintan de inmediato — antes, esperaban innecesariamente la respuesta
  // de Supabase junto con los servicios, lo que retrasaba a simple vista
  // secciones que no tenían por qué esperar nada (por eso el TikTok se
  // sentía lento: ni siquiera empezaba a montarse hasta que llegaba el
  // catálogo).
  renderRitual();
  initRitualThread();
  renderTikTokVideos();

  // SERVICE_CATEGORIES y SERVICES sí los llena data.js con una consulta
  // real a Supabase; solo lo que depende de ellos espera esa promesa.
  await window.datosListos;
  renderServiceTabs();
  renderServices();
});

/* ---------------------------------------------------------------------- */
/* Navbar: cambia de fondo al hacer scroll                                */
/* ---------------------------------------------------------------------- */
function initNavbar() {
  const nav = document.getElementById("navbar");
  if (!nav) return;
  const toggle = () => {
    if (window.scrollY > 24) nav.classList.add("scrolled");
    else nav.classList.remove("scrolled");
  };
  toggle();
  window.addEventListener("scroll", toggle, { passive: true });
}

/* ---------------------------------------------------------------------- */
/* Menú móvil                                                              */
/* ---------------------------------------------------------------------- */
function initMobileMenu() {
  const btn = document.getElementById("mobile-menu-btn");
  const menu = document.getElementById("mobile-menu");
  if (!btn || !menu) return;

  // Los íconos NO se guardan en una variable al inicio: Lucide reemplaza
  // cada <i data-lucide="..."> por un <svg> nuevo cuando corre
  // lucide.createIcons() (en la carga de la página). Si aquí guardáramos
  // la referencia al <i> original de una vez, se quedaría "vieja" (ya
  // desconectada del DOM) y el ícono dejaría de cambiar visualmente al
  // abrir/cerrar el menú. Por eso se buscan en el momento, cada vez.
  const getIcons = () => ({
    iconOpen: document.getElementById("icon-menu-open"),
    iconClose: document.getElementById("icon-menu-close"),
  });

  const closeMenu = () => {
    const { iconOpen, iconClose } = getIcons();
    menu.classList.remove("is-open");
    iconOpen?.classList.remove("hidden");
    iconClose?.classList.add("hidden");
    btn.setAttribute("aria-expanded", "false");
  };

  btn.addEventListener("click", () => {
    const { iconOpen, iconClose } = getIcons();
    const isOpen = menu.classList.toggle("is-open");
    iconOpen?.classList.toggle("hidden", isOpen);
    iconClose?.classList.toggle("hidden", !isOpen);
    btn.setAttribute("aria-expanded", String(isOpen));
  });

  menu.querySelectorAll("a, button").forEach((el) =>
    el.addEventListener("click", closeMenu)
  );
}

/* ---------------------------------------------------------------------- */
/* Scroll reveal genérico (IntersectionObserver)                          */
/* ---------------------------------------------------------------------- */
let scrollRevealObserver = null;

function initScrollReveal() {
  // Se excluyen los que ya están marcados como visibles para no volver a
  // observarlos cada vez que esta función se llama de nuevo (se llama una
  // vez al cargar y otra vez después de cada render dinámico).
  const targets = document.querySelectorAll(
    ".reveal:not(.is-visible), .reveal-stagger:not(.is-visible)"
  );

  if (!("IntersectionObserver" in window)) {
    targets.forEach((t) => t.classList.add("is-visible"));
    return;
  }
  if (targets.length === 0) return;

  if (!scrollRevealObserver) {
    scrollRevealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            scrollRevealObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -60px 0px" }
    );
  }
  targets.forEach((t) => scrollRevealObserver.observe(t));
}

/* ---------------------------------------------------------------------- */
/* Render de la grilla de servicios (a futuro: datos vía API)             */
/* ---------------------------------------------------------------------- */
let categoriaActiva = "masajes";

function renderServiceTabs() {
  const tabs = document.getElementById("services-category-tabs");
  if (!tabs || typeof SERVICE_CATEGORIES === "undefined") return;

  tabs.innerHTML = SERVICE_CATEGORIES.map(
    (cat) => `
    <button type="button" data-categoria="${cat.id}"
      class="service-tab px-5 py-2.5 rounded-full text-sm font-semibold border-2 transition-colors
        ${cat.id === categoriaActiva ? "bg-[#AE2967] border-[#AE2967] text-white" : "border-[#eadde2] text-[#2B2B2B] hover:border-[#E882A6]"}">
      ${cat.nombre}
    </button>`
  ).join("");

  tabs.querySelectorAll(".service-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      categoriaActiva = btn.dataset.categoria;
      renderServiceTabs();
      renderServices();
      document.getElementById("servicios")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

function renderServices() {
  const grid = document.getElementById("services-grid");
  if (!grid || typeof SERVICES === "undefined") return;

  const serviciosFiltrados = SERVICES.filter((s) => s.categoria === categoriaActiva);

  grid.innerHTML = serviciosFiltrados.map((s, i) => {
    // La mayoría de servicios tienen una sola foto; "Especiales" (y
    // cualquier otro que en el futuro tenga varias) trae un arreglo
    // `imagenes` y se pinta como una mini-galería de 2x2 en vez de una
    // sola imagen — así se ven las 4 fotos, no solo la primera.
    const fotoHtml = Array.isArray(s.imagenes)
      ? `
        <div class="grid grid-cols-2 grid-rows-2 h-64 gap-0.5">
          ${s.imagenes
            .map(
              (src) => `
            <button type="button" class="js-ver-foto relative overflow-hidden group/foto" data-src="${src}" data-alt="${s.nombre}" aria-label="Ver foto completa">
              <img src="${src}" alt="${s.nombre}" loading="lazy" class="w-full h-full object-cover" />
              <span class="absolute inset-0 bg-black/0 group-hover/foto:bg-black/20 transition-colors flex items-center justify-center">
                <i data-lucide="expand" class="w-4 h-4 text-white opacity-0 group-hover/foto:opacity-100 transition-opacity"></i>
              </span>
            </button>`
            )
            .join("")}
        </div>`
      : `
        <button type="button" class="js-ver-foto relative block w-full h-64 overflow-hidden group/foto" data-src="${s.imagen}" data-alt="${s.nombre}" aria-label="Ver foto completa">
          <img src="${s.imagen}" alt="${s.nombre}" loading="lazy" class="w-full h-full object-cover" />
          <span class="absolute inset-0 bg-black/0 group-hover/foto:bg-black/20 transition-colors flex items-center justify-center">
            <i data-lucide="expand" class="w-6 h-6 text-white opacity-0 group-hover/foto:opacity-100 transition-opacity"></i>
          </span>
        </button>`;

    return `
    <article class="service-card reveal rounded-2xl overflow-hidden flex flex-col" style="transition-delay:${i * 60}ms">
      <div class="relative overflow-hidden">
        ${fotoHtml}
        <span class="absolute top-3 right-3 bg-white/90 text-[#2B2B2B] text-xs font-semibold px-3 py-1 rounded-full shadow pointer-events-none">
          <span data-duracion-de="${s.id}">${s.variantes ? s.variantes[0].duracion + " min" : s.duracionTexto}</span>
        </span>
      </div>
      <div class="p-6 flex flex-col flex-1">
        <h3 class="font-display text-xl font-semibold mb-2">${s.nombre}</h3>
        <p class="text-sm text-[#6b6464] leading-relaxed flex-1">${s.descripcion}</p>
        <p class="text-xs text-[#a99] mt-3 flex items-center gap-1.5">
          <i data-lucide="map-pin" class="w-3.5 h-3.5 flex-shrink-0"></i>
          ${s.zona}
        </p>
        ${s.variantes ? `
        <div class="variant-picker mt-4" role="radiogroup" aria-label="Elige una opción" data-picker="${s.id}">
          ${s.variantes.map((v, k) => `
          <button type="button" role="radio" aria-checked="${k === 0}" data-variante="${v.id}"
            class="variant-chip ${k === 0 ? "is-active" : ""}">
            <span class="variant-chip-name">${v.nombre}</span>
            <span class="variant-chip-info">${v.duracion} min · ${formatCOP(v.precio)}</span>
          </button>`).join("")}
        </div>` : ""}
        <div class="flex items-center justify-between mt-5 pt-5 border-t border-[#f1dbe3] gap-3">
          <span data-precio-de="${s.id}" class="font-display text-base font-semibold text-[#C85F82] leading-tight">${s.variantes ? formatCOP(s.variantes[0].precio) : s.precioTexto}</span>
          <button type="button" data-service="${s.id}" data-variante="${s.variantes ? s.variantes[0].id : ""}"
            class="js-agendar-servicio btn-primary text-sm font-medium px-4 py-2 rounded-full flex-shrink-0">
            Agendar
          </button>
        </div>
      </div>
    </article>`;
  }).join("");

  if (window.lucide) lucide.createIcons();

  // Re-observe newly injected cards for scroll reveal
  initScrollReveal();

  grid.querySelectorAll(".js-agendar-servicio").forEach((btn) => {
    btn.addEventListener("click", () => {
      window.openBookingModal?.(btn.dataset.service, btn.dataset.variante || null);
    });
  });

  // Selector de opciones (una zona / cuerpo completo): actualiza precio, duración y el botón Agendar
  grid.querySelectorAll(".variant-picker").forEach((picker) => {
    const servicio = SERVICES.find((x) => x.id === picker.dataset.picker);
    picker.querySelectorAll(".variant-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        const v = servicio.variantes.find((x) => x.id === chip.dataset.variante);
        picker.querySelectorAll(".variant-chip").forEach((c) => {
          c.classList.toggle("is-active", c === chip);
          c.setAttribute("aria-checked", c === chip);
        });
        const card = picker.closest("article");
        card.querySelector("[data-precio-de]").textContent = formatCOP(v.precio);
        card.querySelector("[data-duracion-de]").textContent = `${v.duracion} min`;
        card.querySelector(".js-agendar-servicio").dataset.variante = v.id;
      });
    });
  });

  grid.querySelectorAll(".js-ver-foto").forEach((btn) => {
    btn.addEventListener("click", () => openImageLightbox(btn.dataset.src, btn.dataset.alt));
  });
}

/* ---------------------------------------------------------------------- */
/* Lightbox: ver la foto completa (sin recortar) al tocarla               */
/* ---------------------------------------------------------------------- */
function openImageLightbox(src, alt) {
  const lightbox = document.getElementById("image-lightbox");
  const img = document.getElementById("image-lightbox-img");
  if (!lightbox || !img) return;
  img.src = src;
  img.alt = alt || "";
  lightbox.classList.remove("hidden");
  lightbox.classList.add("flex");
  document.body.style.overflow = "hidden";
}

function closeImageLightbox() {
  const lightbox = document.getElementById("image-lightbox");
  if (!lightbox) return;
  lightbox.classList.add("hidden");
  lightbox.classList.remove("flex");
  document.body.style.overflow = "";
}

function initImageLightbox() {
  const lightbox = document.getElementById("image-lightbox");
  if (!lightbox) return;
  document.getElementById("image-lightbox-close")?.addEventListener("click", closeImageLightbox);
  document.getElementById("image-lightbox-overlay")?.addEventListener("click", closeImageLightbox);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !lightbox.classList.contains("hidden")) closeImageLightbox();
  });
}

/* ---------------------------------------------------------------------- */
/* Render de los pasos de "El Ritual" (línea de tiempo alternada)         */
/* ---------------------------------------------------------------------- */
function renderRitual() {
  const wrap = document.getElementById("ritual-steps");
  if (!wrap || typeof RITUAL_STEPS === "undefined") return;

  wrap.innerHTML = RITUAL_STEPS.map((step, i) => {
    const isEven = i % 2 === 0;
    const card = `
      <div class="bg-white rounded-2xl p-6 md:p-7 shadow-sm border border-[#f1dbe3] ${
        isEven ? "md:text-right" : ""
      }">
        <span class="font-display text-3xl text-[#AE2967]">${step.numero}</span>
        <h3 class="font-display text-xl font-semibold mt-1 mb-2">${step.titulo}</h3>
        <p class="text-sm text-[#6b6464] leading-relaxed">${step.texto}</p>
      </div>`;

    return `
    <div class="ritual-step reveal relative grid md:grid-cols-[1fr_64px_1fr] gap-3 md:gap-8 items-center">
      ${isEven ? card : '<div class="hidden md:block"></div>'}
      <div class="relative z-10 flex justify-center order-first md:order-none">
        <div class="ritual-node w-14 h-14 rounded-full bg-white border-2 border-[#AE2967] flex items-center justify-center font-display font-semibold relative">
          ${i + 1}
        </div>
      </div>
      ${!isEven ? card : '<div class="hidden md:block"></div>'}
    </div>`;
  }).join("");

  initScrollReveal();
}

/* ---------------------------------------------------------------------- */
/* "Hilo del Ritual" — la línea dorada se dibuja al hacer scroll          */
/* ---------------------------------------------------------------------- */
function initRitualThread() {
  const line = document.getElementById("ritual-thread-line");
  const steps = document.querySelectorAll(".ritual-step");
  if (!steps.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          line?.classList.add("is-drawn");
        }
      });
    },
    { threshold: 0.4 }
  );
  steps.forEach((s) => observer.observe(s));
}

/* ---------------------------------------------------------------------- */
/* "Nuestro contenido" — videos de TikTok                                 */
/* ---------------------------------------------------------------------- */
/**
 * Usa el "Embed Player" oficial de TikTok para desarrolladores
 * (tiktok.com/player/v1/{id}) en vez del widget de blockquote + embed.js
 * de antes.
 *
 * OJO: `loading="lazy"` en un <iframe> ayuda, pero solo retrasa la CARGA;
 * si los 4 <iframe> ya están en el DOM con su `src` puesto, el navegador
 * igual arranca los 4 reproductores (con su JS/video propio) casi al
 * mismo tiempo apenas se acercan al viewport, y eso es lo que se sentía
 * como lag. Por eso ahora los <iframe> NO se crean junto con la tarjeta:
 * cada tarjeta empieza como un contenedor vacío (`.tiktok-frame-inner`,
 * ver `renderTikTokVideos`) y un IntersectionObserver (`initTikTokLazyMount`)
 * recién crea y monta el <iframe> de un video cuando ESE video en
 * particular está a punto de entrar en pantalla — así nunca hay más de
 * uno o dos reproduciendo autoplay a la vez.
 */
const PARAMETROS_REPRODUCTOR_TIKTOK = [
  "autoplay=1",
  "muted=1",
  "loop=1",
  "controls=0",
  "progress_bar=0",
  "play_button=0",
  "volume_control=0",
  "fullscreen_button=0",
  "timestamp=0",
  "music_info=0",
  "description=0",
  "closed_caption=0",
  "native_context_menu=0",
  "rel=0",
].join("&");

function renderTikTokVideos() {
  const grid = document.getElementById("tiktok-grid");
  if (!grid || typeof TIKTOK_VIDEOS === "undefined") return;

  grid.innerHTML = TIKTOK_VIDEOS.map((video, i) => `
      <div class="tiktok-frame reveal relative aspect-[9/16] rounded-2xl overflow-hidden shadow-sm"
        style="transition-delay:${i * 80}ms; padding:3px; background:linear-gradient(135deg,#25F4EE 0%,#FE2C55 100%);">
        <div class="tiktok-frame-inner relative w-full h-full rounded-[13px] overflow-hidden bg-black"
          data-video-id="${video.id}">
          <button type="button" class="tiktok-mute-btn absolute bottom-3 right-3 w-8 h-8 rounded-full
            bg-black/60 hover:bg-black/80 ring-1 ring-white/40 backdrop-blur-sm flex items-center justify-center transition-colors z-10"
            data-muted="true" aria-label="Activar sonido">
            <i data-lucide="volume-x" class="w-4 h-4 text-white pointer-events-none"></i>
          </button>
        </div>
      </div>`
  ).join("");

  if (window.lucide) lucide.createIcons();
  initScrollReveal();
  initTikTokMuteButtons();
  initTikTokLazyMount();
}

/**
 * Observa cada `.tiktok-frame-inner` y solo crea su <iframe> (con el
 * `src` del Embed Player, o sea, solo ahí arranca la descarga y el
 * autoplay) cuando el video está a ~200px de entrar en pantalla. Si el
 * navegador no soporta IntersectionObserver, se hace un fallback simple:
 * montar todos de una vez, como antes.
 */
function initTikTokLazyMount() {
  const contenedores = document.querySelectorAll(".tiktok-frame-inner");
  if (!contenedores.length) return;

  if (!("IntersectionObserver" in window)) {
    contenedores.forEach(montarIframeTikTok);
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          montarIframeTikTok(entry.target);
          observer.unobserve(entry.target);
        }
      });
    },
    { rootMargin: "200px 0px", threshold: 0.01 }
  );

  contenedores.forEach((el) => observer.observe(el));
}

/** Crea el <iframe> del Embed Player dentro de un `.tiktok-frame-inner`. */
function montarIframeTikTok(contenedor) {
  if (contenedor.querySelector("iframe")) return; // ya montado, no duplicar
  const src = `https://www.tiktok.com/player/v1/${contenedor.dataset.videoId}?${PARAMETROS_REPRODUCTOR_TIKTOK}`;
  const iframe = document.createElement("iframe");
  iframe.src = src;
  iframe.dataset.videoId = contenedor.dataset.videoId;
  iframe.className = "absolute inset-0 w-full h-full border-0";
  iframe.loading = "lazy";
  iframe.setAttribute("allow", "autoplay; encrypted-media; fullscreen");
  iframe.title = "Video de TikTok de Maivy Jireth Cosmetóloga";
  contenedor.prepend(iframe);
}

/**
 * Botón de silencio/sonido por video: usa el postMessage documentado por
 * TikTok (mute / unMute) para hablarle al iframe sin necesidad de
 * recargarlo. https://developers.tiktok.com/docs/en/embed-player#message_the_html_host
 */
function initTikTokMuteButtons() {
  document.querySelectorAll(".tiktok-mute-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const iframe = btn.previousElementSibling;
      if (!iframe?.contentWindow) return;
      const estaSilenciado = btn.dataset.muted === "true";
      iframe.contentWindow.postMessage(
        { "x-tiktok-player": true, type: estaSilenciado ? "unMute" : "mute", value: undefined },
        "*"
      );
      btn.dataset.muted = String(!estaSilenciado);
      btn.setAttribute("aria-label", estaSilenciado ? "Silenciar" : "Activar sonido");
      btn.innerHTML = `<i data-lucide="${estaSilenciado ? "volume-2" : "volume-x"}" class="w-4 h-4 text-white pointer-events-none"></i>`;
      if (window.lucide) lucide.createIcons();
    });
  });
}

/* ---------------------------------------------------------------------- */
/* Utilidades                                                              */
/* ---------------------------------------------------------------------- */
function initYear() {
  const el = document.getElementById("current-year");
  if (el) el.textContent = new Date().getFullYear();
}

/* ---------------------------------------------------------------------- */
/* Abrir el modal de reserva automáticamente si se llega desde otra       */
/* página (ej. tarjeta-vip.html) con ?agendar=1                           */
/* ---------------------------------------------------------------------- */
function initAutoOpenBooking() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("agendar") === "1") {
    setTimeout(() => window.openBookingModal?.(), 400);
  }
}

/* ---------------------------------------------------------------------- */
/* Sobre mí: contadores animados + parallax suave con el mouse            */
/* ---------------------------------------------------------------------- */
function initAbout() {
  const section = document.getElementById("sobre-mi");
  if (!section) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const counters = section.querySelectorAll("[data-count]");
  const run = (el) => {
    const target = Number(el.dataset.count);
    if (reduce) { el.textContent = target; return; }
    const t0 = performance.now();
    const dur = 1600;
    const tick = (now) => {
      const p = Math.min((now - t0) / dur, 1);
      el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  const stats = section.querySelector(".about-stats");
  if ("IntersectionObserver" in window && stats) {
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        counters.forEach(run);
        io.disconnect();
      }
    }, { threshold: 0.4 });
    io.observe(stats);
  } else {
    counters.forEach(run);
  }

  const stage = section.querySelector(".about-stage");
  if (!stage || reduce || !window.matchMedia("(hover: hover)").matches) return;
  stage.addEventListener("mousemove", (e) => {
    const r = stage.getBoundingClientRect();
    stage.style.setProperty("--px", ((e.clientX - r.left) / r.width - 0.5).toFixed(3));
    stage.style.setProperty("--py", ((e.clientY - r.top) / r.height - 0.5).toFixed(3));
  });
  stage.addEventListener("mouseleave", () => {
    stage.style.setProperty("--px", 0);
    stage.style.setProperty("--py", 0);
  });
}