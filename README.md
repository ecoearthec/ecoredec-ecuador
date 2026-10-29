# ECOREDEC Ecuador

Sitio web estático, responsivo y en español. Se conserva el diseño, las secciones y la identidad de EDER RUGEL; no se reconstruyó la web. Guías ambientales y calculadoras funcionan en el navegador y no dependen de APIs externas.

## Estado verificado (29 de octubre de 2026)

- La web se puede servir localmente y compilar a `public/`.
- **No está publicada permanentemente** y no hay URL `pages.dev` creada por este proyecto.
- `wrangler.toml` contiene `database_id = "REPLACE_WITH_D1_DATABASE_ID"`. No existe binding D1 remoto ni credencial de administrador de producción.
- Los reportes y propuestas de la vista previa actual se guardan en el `localStorage` del navegador; no llegan al equipo ECOREDEC. Las Pages Functions y la persistencia D1 fueron probadas únicamente en una D1 local temporal.
- El mapa público está desactivado de forma deliberada (`MAP_TILES_APPROVED=false`) y la CSP bloquea teselas externas mientras se valida una fuente adecuada. No hay ubicaciones ficticias.
- No se activó servicio de pago, suscripción, tarjeta ni período de prueba.

## Requisitos de desarrollo

- Node.js **22 o superior**: Wrangler 4.155.0 y Miniflare lo requieren. Se fija Wrangler a esa versión en `package.json` y `package-lock.json`; no se actualiza automáticamente.
- Python 3 para las pruebas del esquema SQLite.
- Dependencias de ejecución del sitio: ninguna. Wrangler es dependencia de desarrollo para Pages/D1.

```bash
npm ci
npm test
npm run build
npm run test:e2e-local
```

`test:e2e-local` crea una copia temporal aislada del proyecto, inicializa una D1 local con datos aleatorios de prueba, levanta Pages Functions y borra todo al terminar. **No conecta a Cloudflare remoto ni altera una base real.**

Para una vista estática sin API:

```bash
python3 -m http.server 8000
```

## Estructura

- `index.html`, `styles.css`, `app.js`, `calculations.js`: interfaz pública, navegación, guías, calculadoras y formularios.
- `admin.html`, `admin.js`: entrada al panel de moderación/editorial. Las rutas API verifican sesión y rol; abrir el HTML no concede acceso a datos.
- `functions/`: Cloudflare Pages Functions para salud, reportes, propuestas, datos públicos, sesión y administración.
- `migrations/0001_init.sql`: esquema D1 privado por defecto para reportes, propuestas, contenido, fuentes, límites, usuarios y auditoría.
- `scripts/build-pages.mjs`: genera `public/` solo con recursos estáticos públicos; excluye funciones, migraciones y scripts.
- `scripts/test-e2e-local.mjs`: integración local, segura y efímera; no usa credenciales productivas.
- `scripts/create-admin-seed.mjs`: genera un token aleatorio para la inicialización que se realice por el propietario; nunca se debe guardar el token en el repositorio.
- `vendor/leaflet/`: Leaflet 1.9.4 y licencia locales, sin CDN.
- `wrangler.toml`: configuración Pages/D1; el ID real debe aportarlo el propietario después de crear su D1.
- `OPERACION_SIN_COSTE.md`: auditoría, límites gratuitos, publicación, administrador, pruebas, respaldo y recuperación.

## Persistencia y privacidad

Con la vista previa actual, el envío es un **borrador local** en este navegador. El texto de éxito avisa que no se ha enviado al servidor. Las Functions solo aceptan envíos cuando D1 y `RATE_LIMIT_SECRET` estén configurados; si el guardado falla, la página informa el error y no lo presenta como enviado.

Con D1 activa, los reportes quedan privados para administración/revisión. Una ubicación de reporte solo puede salir en la vista cartográfica restringida si hay consentimiento, un resumen anónimo, estado verificado, coordenadas revisadas y aprobación explícita de publicación de ubicación. Organizaciones/proyectos necesitan revisión, fecha, fuente enlazada y aprobación. No existe alta pública de cuentas administrativas.

El mapa está detenido hasta confirmar los términos y la idoneidad de la fuente de teselas. Cuando se apruebe un proveedor, actualiza conjuntamente la configuración de la capa, la atribución y la CSP; no habilites `MAP_TILES_APPROVED` solo para hacerlo aparecer.

## Publicación

Para publicar de forma permanente se necesita una cuenta propia de Cloudflare en nivel gratuito, crear Pages y D1, fijar su ID no secreto en `wrangler.toml`, aplicar la migración remota, cargar `RATE_LIMIT_SECRET` como secreto y crear el primer administrador en D1. **No** se ha realizado ninguna de esas acciones. Sigue únicamente los pasos de `OPERACION_SIN_COSTE.md`; detente si Cloudflare pide configurar facturación o tarjeta. Nunca compartas secretos en el chat ni los publiques en Git.
