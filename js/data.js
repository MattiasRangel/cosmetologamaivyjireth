// Catálogo de servicios

// Categorías del catálogo
const SERVICE_CATEGORIES = [];

// Catálogo completo de servicios
const SERVICES = [];

const RITUAL_STEPS = [
  {
    titulo: "Valoración de tu piel",
    texto:
      "Conversamos sobre tu piel, tu rutina y tus objetivos. Analizo su textura, tono y necesidades reales antes de sugerir cualquier tratamiento.",
  },
  {
    titulo: "Ritual de preparación",
    texto:
      "Limpieza y calibración: preparo tu piel con productos profesionales para que reciba el tratamiento en las mejores condiciones.",
  },
  {
    titulo: "Tratamiento personalizado",
    texto:
      "Aplico el protocolo diseñado para ti, con técnica y tiempos exactos —nunca una receta genérica igual para todas.",
  },
  {
    titulo: "Cuidado post-tratamiento",
    texto:
      "Te acompaño después de la cita: rutina en casa, recomendaciones y seguimiento para sostener el resultado en el tiempo.",
  },
];

const TIKTOK_VIDEOS = [
  { id: "7634365501019344149", url: "https://www.tiktok.com/@cosmetoloca_maivyjireth/video/7634365501019344149" },
  { id: "7669125317981768981", url: "https://www.tiktok.com/@cosmetoloca_maivyjireth/video/7669125317981768981" },
  { id: "7639449218062535957", url: "https://www.tiktok.com/@cosmetoloca_maivyjireth/video/7639449218062535957" },
  { id: "7686928671273143572", url: "https://www.tiktok.com/@cosmetoloca_maivyjireth/video/7686928671273143572" },

];

const TIME_SLOTS = [
  "09:00 am",
  "10:00 am",
  "11:00 am",
  "01:00 pm",
  "02:00 pm",
  "03:00 pm",
  "04:00 pm",
  "05:00 pm",
];

// Formato de pesos colombianos
const formatCOP = (valor) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(valor);

const CATEGORIA_INICIAL = "faciales";
function categoriasEnOrden() {
  const primera = SERVICE_CATEGORIES.filter((c) => c.id === CATEGORIA_INICIAL);
  return [...primera, ...SERVICE_CATEGORIES.filter((c) => c.id !== CATEGORIA_INICIAL)];
}

// WhatsApp de Maivy
const WHATSAPP_MAIVY = "573122855055";

function enlaceWhatsApp(texto) {
  return `https://wa.me/${WHATSAPP_MAIVY}?text=${encodeURIComponent(texto)}`;
}

function htmlEstadoError({ titulo, texto, reintentar = null, compacto = false }) {
  return `
    <div class="estado-error ${compacto ? "is-compacto" : ""}" role="alert">
      <i data-lucide="circle-alert" class="estado-error-icono"></i>
      <div class="min-w-0">
        <p class="estado-error-titulo">${titulo}</p>
        <p class="estado-error-texto">${texto}</p>
        <div class="estado-error-acciones">
          ${reintentar ? `<button type="button" id="${reintentar}" class="estado-error-btn">Reintentar</button>` : ""}
          <a href="${enlaceWhatsApp("Hola Maivy, quiero agendar una cita.")}" target="_blank" rel="noopener" class="estado-error-link">
            Escríbeme por WhatsApp
          </a>
        </div>
      </div>
    </div>`;
}

// Carga real desde Supabase (categorias_servicio + servicios)

function construirPrecioTexto(servicioRow) {
  if (servicioRow.precio_nota) {
    return `${formatCOP(servicioRow.precio)} ${servicioRow.precio_nota.startsWith("·") ? "" : "· "}${servicioRow.precio_nota}`.trim();
  }
  if (servicioRow.precio_hasta) {
    return `${formatCOP(servicioRow.precio)} – ${formatCOP(servicioRow.precio_hasta)}`;
  }
  return formatCOP(servicioRow.precio);
}

// Igual que arriba, pero para el texto de duración
function construirDuracionTexto(servicioRow) {
  if (servicioRow.duracion_max && servicioRow.duracion_max !== servicioRow.duracion) {
    return `${servicioRow.duracion} a ${servicioRow.duracion_max} min`;
  }
  return `${servicioRow.duracion} min aprox.`;
}

function construirDuracionCorta(servicioRow) {
  if (servicioRow.duracion_max && servicioRow.duracion_max !== servicioRow.duracion) {
    return `${servicioRow.duracion} a ${servicioRow.duracion_max}`;
  }
  return String(servicioRow.duracion);
}

async function cargarCatalogo() {
  window.catalogoError = false;
  SERVICE_CATEGORIES.length = 0;
  SERVICES.length = 0;

  const supabase = window.supabaseClient;
  if (!supabase) {
    console.error("[data.js] window.supabaseClient no existe todavía — revisa el orden de tus <script>.");
    window.catalogoError = true;
    return false;
  }

  try {
    const { data: categorias, error: errorCategorias } = await supabase
      .from("categorias_servicio")
      .select("id, nombre, imagen, orden")
      .order("orden", { ascending: true });
    if (errorCategorias) throw errorCategorias;

    categorias.forEach((c) => {
      SERVICE_CATEGORIES.push({ id: c.id, nombre: c.nombre, imagen: c.imagen });
    });

    const { data: servicios, error: errorServicios } = await supabase
      .from("servicios")
      .select("*")
      .eq("activo", true)
      .order("orden", { ascending: true });
    if (errorServicios) throw errorServicios;

    servicios.forEach((s) => {
      const servicio = {
        id: s.id,
        categoria: s.categoria_id,
        nombre: s.nombre,
        descripcion: s.descripcion,
        zona: s.zona,
        duracion: construirDuracionCorta(s),
        duracionTexto: construirDuracionTexto(s),
        precio: s.precio,
        precioTexto: construirPrecioTexto(s),
        imagen: s.imagen,
      };
      if (Array.isArray(s.imagenes) && s.imagenes.length > 0) {
        servicio.imagenes = s.imagenes;
      }
      // Opciones a elegir (ej. "Una zona" / "Cuerpo completo")
      if (Array.isArray(s.variantes) && s.variantes.length > 0) {
        servicio.variantes = s.variantes;
      }
      SERVICES.push(servicio);
    });
    return true;
  } catch (err) {
    console.error("[data.js] Error cargando el catálogo desde Supabase:", err);
    SERVICE_CATEGORIES.length = 0;
    SERVICES.length = 0;
    window.catalogoError = true;
    return false;
  }
}

// Reintento desde los estados de error
window.recargarCatalogo = function () {
  window.datosListos = cargarCatalogo();
  return window.datosListos;
};

window.datosListos = cargarCatalogo();