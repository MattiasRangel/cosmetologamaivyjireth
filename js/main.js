// Funciones generales del sitio

document.addEventListener("DOMContentLoaded", async () => {
  initNavbar();
  initMobileMenu();
  initScrollReveal();
  initAbout();
  initImageLightbox();
  initYear();
  initAutoOpenBooking();
  initBarraMovil();

  renderRitual();
  initRitualThread();
  renderTikTokVideos();

  await window.datosListos;
  renderCatalogo();
});

function renderCatalogo() {
  const grid = document.getElementById("services-grid");
  if (window.catalogoError && grid) {
    document.getElementById("services-category-tabs")?.replaceChildren();
    grid.innerHTML = `<div class="col-span-full max-w-xl mx-auto w-full">${htmlEstadoError({
      titulo: "No se pudieron cargar los tratamientos",
      texto: "Puede ser la conexión. Vuelve a intentarlo o escríbeme y te cuento cuál te conviene.",
      reintentar: "catalogo-reintentar",
    })}</div>`;
    if (window.lucide) lucide.createIcons();
    const btn = document.getElementById("catalogo-reintentar");
    btn?.addEventListener("click", async () => {
      btn.disabled = true;
      btn.textContent = "Cargando…";
      await window.recargarCatalogo();
      renderCatalogo();
      // El paso 1 de la reserva depende del mismo catálogo.
      window.renderStepOneServices?.();
    });
    return;
  }
  renderServiceTabs();
  renderServices();
}

// Navbar: cambia de fondo al hacer scroll
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

// Menú móvil
function initMobileMenu() {
  const btn = document.getElementById("mobile-menu-btn");
  const menu = document.getElementById("mobile-menu");
  if (!btn || !menu) return;

  const getIcons = () => ({
    iconOpen: document.getElementById("icon-menu-open"),
    iconClose: document.getElementById("icon-menu-close"),
  });

  menu.inert = true;

  const closeMenu = () => {
    const { iconOpen, iconClose } = getIcons();
    menu.classList.remove("is-open");
    menu.inert = true;
    iconOpen?.classList.remove("hidden");
    iconClose?.classList.add("hidden");
    btn.setAttribute("aria-expanded", "false");
  };

  btn.addEventListener("click", () => {
    const { iconOpen, iconClose } = getIcons();
    const isOpen = menu.classList.toggle("is-open");
    menu.inert = !isOpen;
    iconOpen?.classList.toggle("hidden", isOpen);
    iconClose?.classList.toggle("hidden", !isOpen);
    btn.setAttribute("aria-expanded", String(isOpen));
  });

  menu.querySelectorAll("a, button").forEach((el) =>
    el.addEventListener("click", closeMenu)
  );
}

// Scroll reveal genérico (IntersectionObserver)
let scrollRevealObserver = null;

function initScrollReveal() {
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

let categoriaActiva = null;

function renderServiceTabs() {
  const tabs = document.getElementById("services-category-tabs");
  if (!tabs || typeof SERVICE_CATEGORIES === "undefined") return;

  const categorias = categoriasEnOrden();
  if (!categoriaActiva || !categorias.some((c) => c.id === categoriaActiva)) {
    categoriaActiva = categorias[0]?.id ?? null;
  }

  tabs.innerHTML = categorias.map(
    (cat) => `
    <button type="button" data-categoria="${cat.id}" aria-pressed="${cat.id === categoriaActiva}"
      class="service-tab">
      ${cat.nombre}
    </button>`
  ).join("");

  tabs.querySelectorAll(".service-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      categoriaActiva = btn.dataset.categoria;
      renderServiceTabs();
      renderServices();
      const top = tabs.getBoundingClientRect().top;
      if (top < 0) tabs.scrollIntoView({ behavior: "smooth", block: "start" });
      tabs.querySelector(`[data-categoria="${categoriaActiva}"]`)?.focus({ preventScroll: true });
    });
  });
}

// Miniatura que abre la foto completa en el lightbox.
function miniaturaServicio(src, alt, clases) {
  return `
    <button type="button" class="js-ver-foto relative block overflow-hidden group/foto ${clases}" data-src="${src}" data-alt="${alt}" aria-label="Ver foto completa de ${alt}">
      <img src="${src}" alt="" loading="lazy" class="w-full h-full object-cover" />
      <span class="absolute inset-0 bg-black/0 group-hover/foto:bg-black/20 transition-colors flex items-center justify-center">
        <i data-lucide="expand" class="w-4 h-4 text-white opacity-0 group-hover/foto:opacity-100 transition-opacity"></i>
      </span>
    </button>`;
}

function renderServices() {
  const grid = document.getElementById("services-grid");
  if (!grid || typeof SERVICES === "undefined") return;

  const serviciosFiltrados = SERVICES.filter((s) => s.categoria === categoriaActiva);

  grid.innerHTML = serviciosFiltrados.map((s, i) => {
    const galeria = Array.isArray(s.imagenes) ? s.imagenes : null;
    const fotoPrincipal = galeria ? galeria[0] : s.imagen;
    const tira = galeria && galeria.length > 1
      ? `<div class="flex gap-1.5 mt-3">${galeria.slice(1).map((src) => miniaturaServicio(src, s.nombre, "w-11 h-11 rounded-lg flex-shrink-0")).join("")}</div>`
      : "";

    const idDetalles = `detalles-${s.id}`;
    return `
    <article class="service-card sc reveal" style="transition-delay:${Math.min(i, 6) * 50}ms">
      ${miniaturaServicio(fotoPrincipal, s.nombre, "sc-foto rounded-xl flex-shrink-0")}
      <h3 class="sc-titulo font-display font-semibold leading-snug">${s.nombre}</h3>
      <p class="sc-precio leading-tight">
        <span data-precio-de="${s.id}" class="font-display font-semibold text-[#AE2967]">${s.variantes ? formatCOP(s.variantes[0].precio) : s.precioTexto}</span>
        <span class="sc-sep" aria-hidden="true">·</span>
        <span data-duracion-de="${s.id}" class="sc-duracion">${s.variantes ? s.variantes[0].duracion + " min" : s.duracionTexto}</span>
      </p>
      <button type="button" class="sc-toggle" aria-expanded="false" aria-controls="${idDetalles}">
        Ver detalles<i data-lucide="chevron-down" class="w-4 h-4"></i>
      </button>
      <div id="${idDetalles}" class="sc-detalles">
        <p class="text-xs text-[#6b6464] flex items-center gap-1.5">
          <i data-lucide="map-pin" class="w-3.5 h-3.5 flex-shrink-0"></i>
          ${s.zona}
        </p>
        <p class="text-sm text-[#5c5555] leading-relaxed mt-2">${s.descripcion}</p>
        ${tira}
      </div>
      ${s.variantes ? `
      <div class="sc-variantes variant-picker" role="radiogroup" aria-label="Elige una opción" data-picker="${s.id}">
        ${s.variantes.map((v, k) => `
        <button type="button" role="radio" aria-checked="${k === 0}" data-variante="${v.id}"
          class="variant-chip ${k === 0 ? "is-active" : ""}">
          <span class="variant-chip-name">${v.nombre}</span>
          <span class="variant-chip-info">${v.duracion} min · ${formatCOP(v.precio)}</span>
        </button>`).join("")}
      </div>` : ""}
      <button type="button" data-service="${s.id}" data-variante="${s.variantes ? s.variantes[0].id : ""}"
        class="sc-boton js-agendar-servicio btn-outline-gold text-sm font-semibold px-5 py-2.5 rounded-full">
        Agendar
      </button>
    </article>`;
  }).join("");

  if (window.lucide) lucide.createIcons();

  // Vuelve a observar las tarjetas nuevas
  initScrollReveal();

  grid.querySelectorAll(".js-agendar-servicio").forEach((btn) => {
    btn.addEventListener("click", () => {
      window.openBookingModal?.(btn.dataset.service, btn.dataset.variante || null);
    });
  });

  // Selector de opciones (una zona / cuerpo completo)
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

  // "Ver detalles" (solo se ve en celular/tablet)
  grid.querySelectorAll(".sc-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const abierto = btn.getAttribute("aria-expanded") !== "true";
      btn.setAttribute("aria-expanded", String(abierto));
      btn.closest("article").classList.toggle("is-abierto", abierto);
      btn.firstChild.textContent = abierto ? "Ocultar detalles" : "Ver detalles";
    });
  });

  grid.querySelectorAll(".js-ver-foto").forEach((btn) => {
    btn.addEventListener("click", () => openImageLightbox(btn.dataset.src, btn.dataset.alt));
  });
}

// Lightbox: ver la foto completa (sin recortar) al tocarla
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

function renderRitual() {
  const wrap = document.getElementById("ritual-steps");
  if (!wrap || typeof RITUAL_STEPS === "undefined") return;

  // El número sí informa: es el orden real de la cita.
  wrap.innerHTML = RITUAL_STEPS.map((step, i) => `
    <li class="ritual-step" style="--paso:${i}">
      <span class="ritual-node" aria-hidden="true">${i + 1}</span>
      <div class="ritual-cuerpo">
        <h3 class="font-display text-xl md:text-[1.35rem] font-semibold leading-snug mb-1.5">${step.titulo}</h3>
        <p class="text-sm md:text-[0.9375rem] text-[#5c5555] leading-relaxed">${step.texto}</p>
      </div>
    </li>`
  ).join("");
}

// "Hilo del Ritual": la línea dorada se dibuja al hacer scroll
function initRitualThread() {
  const lista = document.getElementById("ritual-steps");
  const line = document.getElementById("ritual-thread-line");
  if (!lista || !lista.children.length) return;

  const dibujar = () => {
    lista.classList.add("is-visible");
    line?.classList.add("is-drawn");
  };
  if (!("IntersectionObserver" in window)) return dibujar();

  // Un solo momento
  const observer = new IntersectionObserver(
    ([entry]) => {
      if (entry.isIntersecting) {
        dibujar();
        observer.disconnect();
      }
    },
    { threshold: 0.25 }
  );
  observer.observe(lista);
}

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
      <div class="tiktok-frame reveal" style="transition-delay:${i * 80}ms">
        <div class="tiktok-frame-inner" data-video-id="${video.id}">
          <span class="tiktok-espera" aria-hidden="true"><img src="imagenes/tiktok.svg" alt="" class="w-6 h-6" /></span>
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

function initTikTokMuteButtons() {
  document.querySelectorAll(".tiktok-mute-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const iframe = btn.parentElement.querySelector("iframe");
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

function initYear() {
  const el = document.getElementById("current-year");
  if (el) el.textContent = new Date().getFullYear();
}

function initAutoOpenBooking() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("agendar") === "1") {
    setTimeout(() => window.openBookingModal?.(), 400);
  }
}

function initBarraMovil() {
  const barra = document.getElementById("barra-movil");
  const zonas = ["hero-ctas", "cierre-ctas"].map((id) => document.getElementById(id)).filter(Boolean);
  if (!barra) return;
  if (!zonas.length || !("IntersectionObserver" in window)) {
    barra.classList.add("is-visible");
    return;
  }
  const enPantalla = new Set();
  const obs = new IntersectionObserver((entradas) => {
    entradas.forEach((e) => (e.isIntersecting ? enPantalla.add(e.target) : enPantalla.delete(e.target)));
    barra.classList.toggle("is-visible", enPantalla.size === 0);
  });
  zonas.forEach((z) => obs.observe(z));
}

// Sobre mí: parallax suave con el mouse
function initAbout() {
  const section = document.getElementById("sobre-mi");
  if (!section) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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