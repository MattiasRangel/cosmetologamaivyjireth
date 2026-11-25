# Maivy Jireth · Cosmetóloga: sitio web con reservas y panel administrativo

Sitio web para una cosmetóloga independiente de Villa del Rosario (Norte de Santander): las clientas consultan los tratamientos, reservan su cita en línea y revisan su tarjeta de fidelización, y la profesional administra toda su agenda desde un panel privado.

## Funcionalidades

### Sitio público
- **Catálogo de tratamientos** faciales, corporales y de masajes, cargado desde la base de datos.
- **Reserva de citas en varios pasos** (tratamiento → fecha y hora → datos → confirmación): solo muestra horarios libres, guarda la cita en la base de datos y abre WhatsApp con el resumen.
- **Tarjeta Cliente VIP:** programa de fidelización de 10 visitas que la clienta consulta con un código.
- **Comparador antes/después** y videos de TikTok integrados.
- Diseño responsive pensado para quien llega desde redes sociales en el celular.

### Panel administrativo (con inicio de sesión)
- **Indicadores** del negocio y **agenda** de hoy, mañana, 7 y 30 días, con edición y cambio de estado de cada cita.
- **Gestión del catálogo** de servicios (crear, activar o desactivar).
- **Disponibilidad:** horario semanal, horarios especiales y días bloqueados.
- **Tarjetas VIP:** creación, conteo de visitas y estado.
- **Historia clínica** facial y corporal, con vista previa en vivo y exportación a PDF.

## Tecnologías

- **Frontend:** HTML5, CSS3, JavaScript (módulos ES)
- **Backend y base de datos:** Supabase (PostgreSQL, API REST, Supabase Auth)
- **PDF:** html2pdf.js
- **Control de versiones:** Git y GitHub

## Modelo de datos

| Tabla | Uso |
|---|---|
| `servicios`, `categorias_servicio` | Catálogo de tratamientos |
| `citas` | Reservas de las clientas |
| `horarios`, `horarios_especiales`, `dias_bloqueados` | Disponibilidad de la agenda |
| `tarjetas_vip` | Programa de fidelización |
| `historias_clinicas` | Fichas clínicas faciales y corporales |

## Estructura

```
index.html             Sitio público y reservas
tarjeta-vip.html       Consulta de la tarjeta VIP
mi-tarjeta-vip.html    Vista de la tarjeta de la clienta
panel-privado.html     Inicio de sesión del panel
panel-admin.html       Panel administrativo
css/                   Estilos del sitio y del panel
js/                    Lógica por módulo (reservas, panel, VIP, historia clínica, cliente Supabase)
imagenes/              Imágenes de servicios y marca
```

## Autor

Eduard Mattias Rangel Ramírez · [LinkedIn](https://www.linkedin.com/in/mattias-rangel-8abab0310) · [GitHub](https://github.com/MattiasRangel)
