# ECOREDEC Ecuador — operación y publicación con coste obligatorio de USD 0

**Estado auditado: 29 de octubre de 2026.** No se creó una cuenta ni un proyecto remoto, no se ejecutó ningún comando `--remote`, no se registró tarjeta, no se activó prueba de pago y no se desplegó el sitio. Las cuotas y condiciones de los proveedores pueden cambiar; revísalas de nuevo antes del alta. Si un paso solicita método de pago o upgrade, detente.

## 1. Estado real del proyecto

- La web conserva su estructura, estilos, herramientas ambientales y sección de marca **EDER RUGEL**. La vista previa estática entrega la página y `/admin.html`; al pedir `/api/health` a ese servidor estático, responde 404 porque no sirve Pages Functions.
- No hay publicación permanente ni URL `pages.dev` asociada.
- `wrangler.toml` conserva literalmente `database_id = "REPLACE_WITH_D1_DATABASE_ID"`. No existe D1 remota, usuario administrativo de producción ni secreto Cloudflare.
- En la vista previa actual, los reportes y propuestas son **borradores de `localStorage`**. No se envían al equipo ni a autoridades.
- Las funciones de Cloudflare se probaron con D1 local efímera; esos registros y credenciales de prueba se destruyeron al terminar.
- El mapa público permanece desactivado: `MAP_TILES_APPROVED=false` y la CSP no permite teselas externas. No hay marcadores ni indicadores ficticios.

## 2. Runtime, dependencias y construcción

- **Node.js 22 o superior** y Wrangler **4.155.0 exacto**, fijado en `package.json` y `package-lock.json`. Wrangler/Miniflare de esa versión requieren Node 22; no se debe usar el sistema Node 20 para instalar o ejecutar Wrangler. La máquina de auditoría tenía Node 20.20.2; se ejecutó Wrangler con una copia temporal de Node 22 para probar sin cambiar el Node del sistema.
- No hay dependencias de ejecución del sitio. Wrangler es dependencia de desarrollo. `npm audit` sobre el lock actual: **0 vulnerabilidades** al momento de esta revisión.
- Para instalar de forma reproducible, comprobar la versión y construir:
  ```bash
  node --version                 # debe ser v22.x o superior
  npm ci
  npm test
  npm run build
  npm run test:e2e-local
  ```
- `npm run build` regenera `public/` con solo HTML, CSS, JavaScript, imágenes y Leaflet. No copia `functions/`, migraciones ni scripts a la salida pública. Pages Functions se descubren desde `functions/` en la raíz del proyecto al desplegar `public/`.
- `wrangler.toml` usa `compatibility_date = "2026-10-29"`, coincide con la versión fijada de Wrangler y se comprobó al ejecutar Pages dev local.

## 3. Arquitectura y datos

- Cloudflare Pages sirve los archivos estáticos; Cloudflare Pages Functions ofrece las rutas `/api/*`; Cloudflare D1 guarda datos en servidor. No hay binding activo hasta ingresar el ID real de D1.
- `migrations/0001_init.sql` define `reports`, `proposals`, `organizations`, `projects`, `publications`, `sources`, `admin_users`, `admin_audit`, `submission_limits` y la vista restringida `public_map_points`; agrega restricciones `CHECK`, claves/índices y estados de moderación.
- Las escrituras de reportes/propuestas son privadas y empiezan como `received`/`pending_review`. La API valida origen, campos y límites; el cuerpo JSON tiene tope de bytes también durante su lectura. La clave de limitación es un secreto del entorno y se guarda un hash seudónimo rotatorio, no la IP original.
- La API pública selecciona campos permitidos y solo expone contenido editorial publicado. La cola de reportes que contiene ubicación y correo exige una sesión de admin/reviewer.
- Reporte en mapa: requiere consentimiento, resumen anónimo, estado verificado, coordenadas dentro de Ecuador, revisión expresa de coordenadas y `location_public`. Organizaciones/proyectos necesitan fuente enlazada, fecha y verificación antes de publicación.
- No hay registro público de administradores. El administrador inicial se crea con un token aleatorio de 256 bits; el sistema almacena su hash. La cookie de sesión es `HttpOnly`, `SameSite=Strict`, `Secure` bajo HTTPS, ocho horas y firma HMAC. El cierre de sesión revoca la cookie. El rol `reviewer` no puede editar fuentes. Para emitir otra credencial, genera un token por persona con `node scripts/create-admin-seed.mjs correo@dominio.ec editor` o `... reviewer`, ejecuta la sentencia SQL que el script entrega y almacena cada token en un gestor de contraseñas; no reutilices ni compartas tokens.
- El borrado automático por antigüedad, MFA, carga de imágenes, email saliente y recuperación de cuentas no están implementados. Admin debe aplicar retención/borrado manual y respaldos protegidos.

## 4. Pruebas ejecutadas

`npm test` pasa: 4 pruebas JavaScript y 2 pruebas SQLite (fórmulas, rangos, validadores/orígenes, límites de cuerpos JSON, esquema y privacidad de la vista de mapa). `npm run build`, validación de sintaxis y `npm audit` pasan. `npm ci` a partir del lockfile también se ejecutó bajo Node 22.

`npm run test:e2e-local` crea una copia temporal fuera del proyecto, usa un UUID de prueba solo en esa copia, aplica migración **local**, usa tokens aleatorios, levanta Pages Functions, prueba y destruye los datos de la carpeta temporal. La prueba aprobada verificó:

- salud D1 y esquema listos en entorno local;
- reportes/propuestas persistidos en D1, cola administrativa privada, login/cookie y privacidad de correo/ubicación;
- moderación consentida y vista pública con resumen anónimo;
- creación/edición de fuente, creación/publicación verificada de organización y proyecto, publicación editorial y aprobación de propuesta;
- denegación por rol, petición cross-origin, límite de cinco reportes por ventana de diez minutos, cierre de sesión y rechazo posterior;
- no hubo conexión a Cloudflare ni escritura remota.

No se realizó prueba en navegador/teléfono ni en cuenta productiva. La prueba estática confirma que el mapa no se habilita y que su host de teselas no está permitido por CSP; no simula navegación visual. No se ha aprobado un proveedor cartográfico para tráfico público.

## 5. Servicios, coste y límites a vigilar

| Servicio previsto | Estado | Coste/condición |
|---|---|---|
| Cloudflare Pages Free | No creado | USD 0 previsto; se usa el subdominio `pages.dev`, sin comprar dominio. Límites de builds y archivos. |
| Workers Free / Pages Functions | Código local probado; no desplegado | USD 0 previsto; cuota diaria compartida de invocaciones y límite de CPU. Al agotarse, las partes API pueden fallar hasta el reinicio. |
| D1 Free | Solo emulador local efímero en pruebas | USD 0 previsto; cuotas de lecturas, escrituras y almacenamiento. No es una copia de seguridad externa. |
| Leaflet | Vendorizado en el proyecto | Sin cuenta ni llamada a CDN. |
| Teselas cartográficas | Desactivadas | Sin cuenta/clave actualmente; no habilitar hasta elegir fuente compatible y actualizar atribución/CSP. |

Cuotas de los planes gratuitos que se deben volver a revisar:

- Pages Free publica hasta **500 builds/mes**, un build concurrente y hasta **20.000 archivos**; los requests de assets estáticos son gratuitos e ilimitados. Pages Functions consume la cuota de Workers Free, no la cuota ilimitada estática. [Límites Pages](https://developers.cloudflare.com/pages/platform/limits/) · [Precios Pages Functions](https://developers.cloudflare.com/pages/functions/pricing/)
- Workers Free tiene **100.000 invocaciones/día** compartidas por la cuenta y **10 ms CPU por invocación**. Si la cuenta supera el límite, las funciones se pueden interrumpir; no debe hacerse upgrade automático. [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- D1 Free incluye **5 GB totales**, **5 millones de filas leídas/día** y **100.000 filas escritas/día**. Superar el límite provoca fallos de consultas/escrituras hasta reinicio; D1 no cobra por cómputo, pero Workers consume su propia cuota. [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)
- D1 Time Travel está habilitado; en Workers Free la ventana de recuperación es de hasta 7 días. Una restauración remota reemplaza datos posteriores; exporta primero y confirma el instante exacto. [Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)
- No se usa R2, Supabase, CAPTCHA de terceros, correo, Google Maps ni proveedor de geocodificación. Ninguna tarjeta o facturación está configurada por este trabajo. No puedo comprobar si la cuenta externa del propietario tiene otros servicios o un plan pagado.

### Mapa: requisito antes de activar

El código conserva Leaflet local y la atribución OSM de la capa preparada, pero **el mapa no realiza solicitudes de teselas**: está bloqueado por `MAP_TILES_APPROVED=false` y por la política de `img-src` en `_headers`. La política OSM exige, entre otras cosas, atribución, referer válido, respeto de caché, uso interactivo moderado y condiciones de identificación; los servidores comunitarios no dan SLA y pueden bloquear abuso. Antes de habilitarlo, el propietario debe escoger y revisar la fuente, sus términos, capacidad y atribución; entonces se modifica conjuntamente el control y CSP, con prueba real. [Política OSM](https://operations.osmfoundation.org/policies/tiles/). OpenFreeMap es una alternativa anunciada sin API key y sin cuota publicada, pero sin SLA; no está integrada ni probada. [Sitio oficial OpenFreeMap](https://openfreemap.org/).

## 6. Prueba local segura, sin tocar la configuración real

La prueba repetible ya está automatizada. En Node 22+, con dependencias instaladas:

```bash
npm run test:e2e-local
```

El script crea todo dentro de `os.tmpdir()`, copia `wrangler.toml` con ID ficticio local, corre solamente `--local`, no usa `--remote` y borra la carpeta incluso si falla. No se debe ejecutar migración `--remote` hasta que haya una cuenta/proyecto D1 real y una copia de seguridad verificada.

## 7. Pasos exactos para publicar cuando el propietario esté listo

**Intervención requerida:** el dueño crea su propia cuenta Cloudflare gratuita desde su dispositivo. No compartas contraseña, token de administrador, secreto, sesión ni archivos con PII. No ingreses tarjeta; si la interfaz lo exige, detente. Estas acciones no se han ejecutado.

1. Verifica Node 22+, instala desde el lock y autentica Wrangler con una cuenta que esté en **Free**:
   ```bash
   node --version
   npm ci
   npm exec -- wrangler --version  # debe decir 4.155.0
   npm exec -- wrangler login
   ```
2. Crea el proyecto Pages gratuito con nombre y rama principal. Si Wrangler dice que el proyecto ya existe, detente y revisa su propietario/estado; no borres ni reemplaces nada:
   ```bash
   npm exec -- wrangler pages project create ecoredec-ecuador --production-branch main
   ```
3. Crea D1 gratuita y copia el ID real que devuelva. Si el nombre ya existe, no uses reset ni crees un reemplazo: revisa primero si hay datos y confirma con el propietario antes de continuar:
   ```bash
   npm exec -- wrangler d1 create ecoredec-db
   ```
   Edita **solo** `database_id` de `wrangler.toml`, sustituyendo el marcador por el ID real. No inventes el ID. Comprueba que `binding = "DB"`, el nombre `ecoredec-db` y `migrations_dir = "migrations"` permanezcan iguales.
4. Aplica únicamente la migración inicial a la D1 remota nueva:
   ```bash
   npm exec -- wrangler d1 migrations apply ecoredec-db --remote
   ```
   Revisa el plan/confirmación que presenta Wrangler. No uses `d1 reset`, `DROP`, ni reemplaces un ID que ya tenga datos. Esta migración se diseñó para la base inicial; confirma que la D1 sea la correcta antes de aceptar.
5. Crea el primer administrador localmente. El token aleatorio aparece una sola vez; guárdalo en un gestor de contraseñas y cierra el terminal de forma segura. La sentencia SQL generada contiene únicamente el hash:
   ```bash
   node scripts/create-admin-seed.mjs correo-del-administrador@dominio.ec
   ```
   Ejecuta solo la sentencia generada contra D1 remota:
   ```bash
   npm exec -- wrangler d1 execute ecoredec-db --remote --command "PEGA_AQUI_LA_SENTENCIA_SQL_GENERADA"
   ```
   No guardes el token en archivos del proyecto, `.dev.vars`, Git ni chat. Si se pierde, desactiva el usuario en D1 y genera otro.
6. Genera un secreto aleatorio distinto y guárdalo en el almacén de secretos del proyecto, no en `wrangler.toml` ni en el código:
   ```bash
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   npm exec -- wrangler pages secret put RATE_LIMIT_SECRET --project-name ecoredec-ecuador
   ```
   Introduce el valor de forma interactiva. Revisa que el secret esté en el entorno de producción requerido.
7. Prepara y despliega únicamente estáticos `public/`; Pages Functions se cargan desde `functions/` en raíz:
   ```bash
   npm test
   npm run build
   npm exec -- wrangler pages deploy public --project-name ecoredec-ecuador
   ```
   Usa el subdominio `pages.dev` asignado, sin comprar dominio. Confirma en panel que plan sigue siendo Free.
8. Prueba la URL de producción: `/api/health` debe indicar API lista y recepción activa; visita `/admin.html`, autentica el token, envía un reporte **no sensible** y comprueba la bandeja privada. Verifica acceso anónimo (debe ser rechazado), el borrado de prueba, y que no aparezca correo/dirección en `/api/public-data`. Si falla, no afirmes que el reporte fue entregado; corrige o desactiva recepción.
9. No habilites el mapa. Primero valida proveedor y términos, luego actualiza CSP/configuración y repite prueba visual/mapa. No subas ubicaciones reales sin revisión y autorización.

**No necesito ninguna clave.** Si más adelante pides ayuda con el binding, el dato opcional no secreto sería el ID de D1; nunca compartas `RATE_LIMIT_SECRET`, el token ni acceso a tu cuenta.

## 8. Copias de seguridad y recuperación

D1 Time Travel no sustituye exportaciones independientes. Una vez que haya datos reales, guarda backups SQL cifrados fuera del repositorio y de la web; contienen reportes y datos personales.

Exportación manual:
```bash
mkdir -p "$HOME/ecoredec-backups"
chmod 700 "$HOME/ecoredec-backups"
npm exec -- wrangler d1 export ecoredec-db --remote --output="$HOME/ecoredec-backups/ecoredec-$(date -u +%F).sql"
```
No subas `backups/` a Git ni lo envíes por correo abierto. Comprueba periódicamente una restauración en **otra D1 de pruebas gratuita** antes de depender del respaldo.

Para Time Travel, confirma timestamp y base antes de cualquier acción destructiva:
```bash
npm exec -- wrangler d1 time-travel info ecoredec-db --timestamp="2026-10-29T12:00:00Z"
npm exec -- wrangler d1 time-travel restore ecoredec-db --timestamp="2026-10-29T12:00:00Z"
```
La restauración sobrescribe el estado actual; exporta antes y valida el plan presentado por Wrangler. No se ejecutó restore ni operación remota alguna durante este trabajo.
