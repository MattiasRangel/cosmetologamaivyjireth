/**
 * data.js
 * -----------------------------------------------------------------------
 * Fuente única de datos del sitio. Antes eran arreglos estáticos; ahora
 * `SERVICE_CATEGORIES` y `SERVICES` se llenan con una consulta real a
 * Supabase (tablas `categorias_servicio` y `servicios`) apenas carga la
 * página, conservando EXACTAMENTE la misma forma de objeto que ya
 * consumían main.js y booking.js — por eso ningún otro archivo necesita
 * cambios para leer estos dos arreglos.
 *
 * Como la consulta es asíncrona, `SERVICE_CATEGORIES`/`SERVICES` empiezan
 * vacíos y se llenan con `.push(...)` (nunca se reasignan) cuando la
 * respuesta llega — así, cualquier script que ya tenga una referencia a
 * estos arreglos (main.js, booking.js) ve los datos en cuanto existen,
 * sin tener que volver a pedir la referencia.
 *
 * `window.datosListos` es la promesa que main.js y booking.js deben
 * esperar (`await window.datosListos`) antes de pintar cualquier cosa que
 * dependa de estos dos arreglos.
 *
 * Se exponen en `window` (script clásico, sin módulos) para que main.js y
 * booking.js los consuman tal como antes.
 * -----------------------------------------------------------------------
 */

/** Categorías del catálogo — se llena desde Supabase, ver cargarCatalogo(). */
const SERVICE_CATEGORIES = [];

/** Catálogo completo de servicios — se llena desde Supabase, ver cargarCatalogo(). */
const SERVICES = [];

const RITUAL_STEPS = [
  {
    numero: "01",
    titulo: "Valoración de tu piel",
    texto:
      "Conversamos sobre tu piel, tu rutina y tus objetivos. Analizo su textura, tono y necesidades reales antes de sugerir cualquier tratamiento.",
  },
  {
    numero: "02",
    titulo: "Ritual de preparación",
    texto:
      "Limpieza y calibración: preparo tu piel con productos profesionales para que reciba el tratamiento en las mejores condiciones.",
  },
  {
    numero: "03",
    titulo: "Tratamiento personalizado",
    texto:
      "Aplico el protocolo diseñado para ti, con técnica y tiempos exactos —nunca una receta genérica igual para todas.",
  },
  {
    numero: "04",
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

/* <blockquote class="tiktok-embed" cite="https://www.tiktok.com/@cosmetoloca_maivyjireth/video/7686928671273143572" data-video-id="7686928671273143572" style="max-width: 605px;min-width: 325px;" > <section> <a target="_blank" title="@cosmetoloca_maivyjireth" href="https://www.tiktok.com/@cosmetoloca_maivyjireth?refer=embed">@cosmetoloca_maivyjireth</a> Una de mis experiencias más hermosas🥹😭.  Hay momentos que se sienten más allá de la piel… 🤍  La calma de mamá, la espera de un nuevo amor y esa conexión tan hermosa que comienza desde el primer latido. 🤰🏻👶🏻✨ <a title="limpiezafacialembarazada" target="_blank" href="https://www.tiktok.com/tag/limpiezafacialembarazada?refer=embed">#limpiezafacialembarazada</a> <a title="limpiezafacial" target="_blank" href="https://www.tiktok.com/tag/limpiezafacial?refer=embed">#limpiezafacial</a> <a title="embarazada" target="_blank" href="https://www.tiktok.com/tag/embarazada?refer=embed">#embarazada</a> <a target="_blank" title="♬ Le Carrousel - James Quinn" href="https://www.tiktok.com/music/Le-Carrousel-7224198515874138114?refer=embed">♬ Le Carrousel - James Quinn</a> </section> </blockquote> <script async src="https://www.tiktok.com/embed.js"></script>   **/

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

// Colombian peso formatter reused across the site.
const formatCOP = (valor) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(valor);

/* ------------------------------------------------------------------------
   Carga real desde Supabase (categorias_servicio + servicios)
   ------------------------------------------------------------------------ */

/**
 * Arma el texto de precio a mostrar en la tarjeta del catálogo a partir de
 * las columnas de la tabla `servicios` (precio / precio_hasta / precio_nota),
 * reproduciendo los mismos formatos que antes estaban escritos a mano
 * (rangos, paquetes, etc.).
 */
function construirPrecioTexto(servicioRow) {
  if (servicioRow.precio_nota) {
    return `${formatCOP(servicioRow.precio)} ${servicioRow.precio_nota.startsWith("·") ? "" : "· "}${servicioRow.precio_nota}`.trim();
  }
  if (servicioRow.precio_hasta) {
    return `${formatCOP(servicioRow.precio)} – ${formatCOP(servicioRow.precio_hasta)}`;
  }
  return formatCOP(servicioRow.precio);
}

/** Igual que arriba, pero para el texto de duración ("30 a 60 min", "60 min aprox."). */
function construirDuracionTexto(servicioRow) {
  if (servicioRow.duracion_max && servicioRow.duracion_max !== servicioRow.duracion) {
    return `${servicioRow.duracion} a ${servicioRow.duracion_max} min`;
  }
  return `${servicioRow.duracion} min aprox.`;
}

/** Igual que `duracion` en el arreglo original: texto corto sin la palabra "min". */
function construirDuracionCorta(servicioRow) {
  if (servicioRow.duracion_max && servicioRow.duracion_max !== servicioRow.duracion) {
    return `${servicioRow.duracion} a ${servicioRow.duracion_max}`;
  }
  return String(servicioRow.duracion);
}

async function cargarCatalogo() {
  const supabase = window.supabaseClient;
  if (!supabase) {
    console.error("[data.js] window.supabaseClient no existe todavía — revisa el orden de tus <script>.");
    return;
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
      // Solo se agrega `imagenes` si el servicio realmente trae galería
      // (ej. "Especiales"), igual que en el arreglo estático original.
      if (Array.isArray(s.imagenes) && s.imagenes.length > 0) {
        servicio.imagenes = s.imagenes;
      }
      SERVICES.push(servicio);
    });
  } catch (err) {
    console.error("[data.js] Error cargando el catálogo desde Supabase:", err);
    alert("No se pudo cargar el catálogo de servicios. Por favor recarga la página en unos segundos.");
  }
}

// main.js y booking.js deben hacer `await window.datosListos;` antes de
// pintar cualquier cosa que dependa de SERVICE_CATEGORIES o SERVICES.
window.datosListos = cargarCatalogo();