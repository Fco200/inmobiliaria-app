# CRM Inmobiliario
opencode -s ses_ee7e80098ffeRCbqwZU2IXRT4P

Sistema de gestión de relaciones con clientes para el ciclo completo de operaciones inmobiliarias:
prospección, clientes, propiedades, inventario, negocios, citas, tareas, metas, gastos, tickets,
documentación, reportes, notificaciones, historial y auditoría.

## Arquitectura

- **Frontend:** HTML5 + CSS3 + JavaScript (carpeta `frontend/`)
- **Backend:** Node.js + Express.js (carpeta `backend/`)
- **Base de datos:** MongoDB (backend es el único cliente de la base de datos)
- **Despliegue:** Render (preparado)

```
HTML/CSS/JS → API REST → Node.js/Express → MongoDB
```

## Estructura

```
/backend
  src/
    config/       Configuración (entorno, conexión MongoDB)
    controllers/  Lógica de cada endpoint
    models/       Modelos Mongoose
    routes/       Definición de rutas API
    services/     Lógica de negocio reutilizable
    middlewares/  Autenticación, errores, etc.
    validators/   Validaciones de entrada
    utils/        Utilidades
    jobs/         Tareas programadas (notificaciones, recordatorios)
  tests/
  server.js
  package.json

/frontend
  index.html      Shell de la aplicación (navegación lateral)
  css/            Hoja de estilos base
  js/             Router, cliente API, utilidades
  pages/          Módulos de cada sección
```

## Puesta en marcha

1. Crear un clúster gratuito en MongoDB Atlas y obtener la cadena de conexión.
2. Revisar `backend/.env` (un único archivo de configuración) y completar:
   - `MONGODB_URI` (cadena de Atlas)
   - `JWT_SECRET` (secreto largo y aleatorio)
   - `VAPID_PUBLIC_KEY` y `VAPID_PRIVATE_KEY` (notificaciones push nativas).
     Son opcionales pero recomendadas: sin ellas los avisos internos del CRM
     siguen funcionando, solo no llegan como notificación del sistema en
     Android/iOS/escritorio. Se generan con:

     ```bash
     node -e "console.log(require('./backend/src/services/webpush.engine').generateVapidKeys())"
     ```

     (desde la raíz del proyecto; copia `publicKey` y `privateKey` en esas dos
     variables. `VAPID_SUBJECT` ya tiene un valor por defecto: el correo de
     soporte).
3. Instalar dependencias y arrancar:

```bash
cd backend
npm install
npm run dev
```

4. Abrir `http://localhost:5000` (el backend sirve el frontend).

Al primer arranque se crean automáticamente los permisos, los roles del sistema
(Administrador, Gerencia, Asesor) y el administrador inicial:

- **Usuario:** `admin`
- **Correo:** `admin@inmobiliaria.com` (configurable con `ADMIN_EMAIL`)
- **Contraseña:** el valor de `ADMIN_PASSWORD` en `.env`

**Cambia la contraseña del administrador la primera vez que entres**
(Mi perfil → Seguridad). La política exige 8+ caracteres con mayúscula,
minúscula y número. Tras 5 intentos fallidos la cuenta se bloquea 15 minutos.

En desarrollo, el servidor arranca aunque MongoDB no esté disponible (solo muestra la advertencia).
En producción, el arranque falla si no hay base de datos.

## Módulos implementados

| Módulo | API | Página |
| ------ | --- | ------ |
| Autenticación (login JWT) | `/api/auth` | Login |
| Usuarios y roles | `/api/users`, `/api/users/roles` | Configuración |
| Dashboard con embudo | `/api/dashboard/summary` | Dashboard |
| Clientes con contacto WhatsApp/llamada | `/api/clients` | Clientes |
| Propiedades | `/api/properties` | Propiedades |
| Inventario | `/api/inventory` | Inventario |
| Negocios con etapas e historial | `/api/businesses` | Negocios |
| Negociaciones (kanban por etapa) | `/api/businesses` | Negociaciones |
| Citas | `/api/appointments` | Citas |
| Tareas | `/api/tasks` | Tareas |
| Prospección (inversión por actividad) | `/api/prospecting` | Prospección |
| Documentación (carga de archivos) | `/api/documents` | Documentación |
| Avisos y notificaciones | `/api/notifications` | Avisos |
| Notificaciones push nativas (Web Push) | `/api/push` | Configuración → Alertas |
| Centro de actividad | `/api/activity` | Historial por registro |
| Metas | `/api/goals` | Metas |
| Gastos e inversiones | `/api/expenses` | Gastos |
| Reportes de usuario | `/api/dashboard/user/:userId` | Mis reportes |
| Reportes de gerencia | `/api/reports/management` | Reportes gerencia |
| Perfil | `/api/auth/me` | Mi perfil |

## Notificaciones push nativas (Web Push)

El CRM puede mandar **notificaciones del sistema** (no solo dentro de la app)
cuando llega un aviso: notas de citas, tareas vencidas, mensajes o alertas. Se
muestran aunque la app esté cerrada en Android, escritorio y en iPhone/iPad
(instalando la app con "Añadir a pantalla de inicio").

- **Flujo:** el navegador se suscribe (`pushManager.subscribe`) → el backend
  guarda la suscripción en `PushSubscription` → cada aviso interno dispara
  `push.service.notifyUser()` → el Service Worker (`sw.js`) muestra la
  notificación con `showNotification`.
- **Activación:** en *Configuración → Alertas* (botón "Activar push"). El
  permiso solo se pide ahí; al iniciar sesión la suscripción se re-sincroniza en
  silencio si ya fue concedido.
- **Cifrado:** los mensajes viajan cifrados con el algoritmo *aes128gcm*
  (RFC 8291) y se autentican con VAPID (JWT ES256). El backend usa el paquete
  `web-push` si está instalado; si no, usa un motor integrado sin dependencias
  (`services/webpush.engine.js`) verificado contra el vector de prueba oficial
  del RFC (`tests/webpush.test.js`).
- **Limpieza:** si el servicio de push responde 404/410 (suscripción caducada),
  la suscripción se elimina sola para no acumular ruido. Si el navegador rota la
  suscripción, el Service Worker avisa a la app y se re-registra.

## Mantenimiento de archivos (fotos y documentos)

Las fotos y documentos se guardan según `STORAGE_DRIVER` (GridFS en MongoDB,
Cloudflare R2 o disco local). Los archivos que viven en GridFS o R2 sobreviven a
cualquier redespliegue; los del disco local (`local`) se pierden al reiniciar el
servidor.

Si alguna imagen no aparece (marcador "Sin foto"), normalmente es porque la
referencia existe en la base de datos pero el archivo físico ya no está en el
almacenamiento (por ejemplo, después de migrar a otro clúster de MongoDB sin
copiar los archivos de GridFS). Para detectarlas:

```bash
cd backend
node scripts/verificar-media.js
```

Muestra cada archivo referenciado que no existe en el almacenamiento y en qué
propiedad/usuario se usa (solo lectura, no modifica nada). La solución es
re-subir la foto desde el módulo correspondiente (Propiedades → Fotos o Mi
perfil); el proceso de carga actual sí persiste en GridFS/R2.

## Despliegue (Render)

La aplicación está preparada para Render: `backend/server.js` sirve también el
frontend. En el panel de Render, además de `MONGODB_URI`, `JWT_SECRET` y las
variables documentadas, define:

```
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
```

para habilitar las notificaciones push en producción. El paquete no depende de
Web Push externos (motor integrado), por lo que no hace falta `npm install`
adicional.

### Escalabilidad (1000+ peticiones)

Los valores por defecto ya están preparados para picos de más de 1000
peticiones concurrentes. Se pueden ajustar por variables de entorno sin tocar el
código:

```
API_RATE_MAX=20000            # peticiones por usuario cada 15 min
API_RATE_MAX_ANON=2000        # peticiones por IP sin sesión cada 15 min
API_RATE_WINDOW_MS=900000     # ventana del límite (15 min)

MONGO_MAX_POOL=100            # conexiones simultáneas a MongoDB
MONGO_MIN_POOL=10
MONGO_MAX_CONNECTING=10
MONGO_WAIT_QUEUE_MS=30000

SERVER_MAX_CONNECTIONS=2048
SERVER_KEEPALIVE_TIMEOUT=65000
SERVER_HEADERS_TIMEOUT=66000
SERVER_REQUEST_TIMEOUT=600000
```

Si el plan de MongoDB Atlas tiene un límite de conexiones menor, baja
`MONGO_MAX_POOL` (por ejemplo a 50).

Los avisos internos de tipo "nueva propiedad que le puede interesar a un
cliente" están desactivados por defecto. Para volver a generarlos define
`NOTIFY_INTERESTED_CLIENTS=true`; al arrancar con la opción desactivada se
eliminan los avisos antiguos de ese tipo.

## Contacto directo con clientes

Desde el módulo de Clientes, cada fila muestra botones para:
- **WhatsApp:** abre `https://wa.me/<código de país><teléfono>` en una pestaña nueva.
- **Llamar:** abre el marcador `tel:<teléfono>` del dispositivo.

El código de país se configura por defecto en `52` (México).

## Integración con página web de inventario

El CRM expone un endpoint público (sin credenciales) para que una página web de
propiedades existente o futura pueda consumir el inventario publicado:

```
GET /api/inventory/public
```

Solo devuelve propiedades **publicadas** e incluye tipo, operación, precio, zona,
ciudad, descripción, fotografías y características. Soporta filtros opcionales:

```
GET /api/inventory/public?type=casa&operationType=venta&city=La Paz&minPrice=1000000&maxPrice=3000000
```

El valor de la propiedad se mantiene en el CRM; la página web solo lee el inventario.

## Endpoints principales de la API

```
GET  /api/health                Estado de la API y base de datos
POST /api/auth/login            Iniciar sesión (devuelve token JWT)
GET  /api/auth/me               Usuario actual
POST /api/auth/register         Registrar admin inicial (solo si no hay usuarios)

GET/POST/PUT/DELETE /api/users        Usuarios (solo administrador)
GET/POST/PUT/DELETE /api/users/roles  Roles (solo administrador)
GET /api/users/permissions            Permisos (solo administrador)

GET/POST/PUT/DELETE /api/clients      Clientes
GET/POST/PUT/DELETE /api/properties   Propiedades
PATCH /api/properties/:id/publish     Publicar/despublicar (alimenta inventario)
GET/POST/PUT/DELETE /api/inventory    Inventario
GET /api/inventory/public             Inventario público (sin auth)
PATCH /api/inventory/:id/publish      Publicar/despublicar inventario

GET/POST/PUT/DELETE /api/businesses   Negocios
PATCH /api/businesses/:id/stage       Cambiar etapa del negocio
GET /api/businesses/:id/history       Historial de etapas

GET/POST/PUT/DELETE /api/appointments Citas
GET/POST/PUT/DELETE /api/tasks        Tareas
PATCH /api/tasks/:id/status           Cambiar estado de tarea

GET/POST/PUT/DELETE /api/goals        Metas
GET/POST/PUT/DELETE /api/expenses     Gastos e inversiones

GET/POST/PUT/DELETE /api/prospecting  Actividades de prospección
GET /api/prospecting/summary          Inversión y prospectos por tipo

GET/POST/PUT/DELETE /api/documents    Documentación
POST /api/documents/upload            Subir archivo y crear registro en un paso
                                      (valida magic bytes; PDF/Office/imágenes, 15 MB)

GET /api/interactions                 Interacciones CRM (llamadas/WhatsApp/notas)
POST /api/interactions                Registrar llamada o WhatsApp con notas
DELETE /api/interactions/:id          Eliminar interacción

GET /api/notifications                Avisos del usuario
GET /api/notifications/unread-count   Cantidad de avisos sin leer
POST /api/notifications/generate      Generar avisos automáticos
POST /api/notifications/mark-all-read Marcar todos como leídos
PATCH /api/notifications/:id/read     Marcar uno como leído

GET  /api/push/vapid-public-key       Llave pública VAPID y estado (autenticado)
POST /api/push/subscribe              Registrar la suscripción push de este dispositivo
POST /api/push/unsubscribe            Dar de baja la suscripción de este dispositivo
POST /api/push/test                   Enviar notificación de prueba (Configuración → Alertas)

GET /api/activity                     Centro de actividad (filtro entityType/entityId)
GET /api/reports/management           Reportes de gerencia (filtros y comparativa)

GET /api/dashboard/summary            Indicadores del dashboard (incluye embudo)
GET /api/dashboard/user/:userId       Reporte por usuario (solo él mismo o jefatura)
```

Las contraseñas nunca se devuelven en las respuestas de la API.

## Funciones móviles (PWA + CRM móvil)

- **Instalable en Android/iOS/desktop**: botón "Instalar aplicación" funcional
  (`beforeinstallprompt`); en iOS muestra instrucciones de
  "Añadir a pantalla de inicio". Atajos en el icono: Clientes, Catálogo, Contacto.
- **Guardar contacto**: desde Clientes se descarga una tarjeta `.vcf` lista para
  agregar el cliente a los contactos del teléfono.
- **Llamadas registradas**: el botón "Llamar" abre el teléfono y permite guardar
  resultado + notas en el CRM (`/api/interactions`).
- **WhatsApp con seguimiento**: el botón WhatsApp abre el chat y guarda la nota
  del seguimiento en el historial del cliente.
- **Notificaciones push**: los avisos del CRM llegan como notificación nativa
  aunque la app esté cerrada (se activa en Configuración → Alertas).
- **Expediente por cliente**: sube INE/escrituras/comprobantes directamente desde
  la tarjeta del cliente; admin/gerencia validan o rechazan cada documento.

## Plan de fases

| Fase | Contenido | Estado |
| ---- | --------- | ------ |
| 0    | Análisis | Completado (inicio desde cero) |
| 1-2  | Arquitectura y base del proyecto | Completado |
| 3    | Autenticación | Completado |
| 4    | Usuarios y permisos | Completado |
| 5    | Clientes | Completado |
| 6    | Propiedades e inventario | Completado |
| 7    | Negocios | Completado |
| 8    | Citas y tareas | Completado |
| 9    | Documentación | Completado (carga de archivos) |
| 10   | Metas | Completado |
| 11   | Gastos y tickets | Parcial (gastos completos; tickets pendiente) |
| 12   | Reportes | Completado (usuario y gerencia) |
| 13   | Notificaciones | Completado |
| 14   | Auditoría y centro de actividad | Completado |
| 15   | Pruebas | Completado (verificación integral) |
| 16   | Despliegue | Pendiente |

## Seguridad

- Contraseñas cifradas con bcrypt. Política: 8+ caracteres con mayúscula,
  minúscula y número.
- Autenticación por token JWT + sesiones revocables en base de datos.
- Bloqueo temporal de cuenta tras `LOGIN_MAX_ATTEMPTS` intentos fallidos
  (15 minutos por defecto) y rate-limit dedicado para login/registro.
- **Archivos privados**: `/uploads` exige sesión (o token en la URL); solo las
  fotos de propiedades publicadas son públicas. Se valida el contenido real
  (magic bytes) y están bloqueados SVG/HTML.
- **Aislamiento por asesor**: clientes, propiedades, negocios, metas, gastos,
  documentos, tareas, citas e interacciones se filtran por usuario;
  admin/gerencia ven todo. El reporte `/dashboard/user/:userId` es privado.
- **Suscripciones push por usuario**: cada suscripción Web Push pertenece a un
  solo usuario y el backend es el único que puede enviarle notificaciones; un
  aviso fallido nunca rompe la creación del aviso interno.
- Página pública de contacto sin base de datos (`contacto.html`, vía WhatsApp/mailto).
- Variables sensibles únicamente en `.env` (nunca en Git).
- Validaciones en backend, no solo en el frontend.
- Límites de peticiones, CORS restringido por origen y cabeceras seguras.
