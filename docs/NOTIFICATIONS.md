# Notificaciones de clientes

Primera versión: envíos inmediatos del administrador, bandeja de clientes registrados, preferencias compartidas y push web/móvil. La programación de campañas queda fuera de esta versión. Las alertas administrativas existentes en `/admin/notifications` siguen siendo un flujo independiente.

## Contrato

Todas las rutas requieren la sesión existente (cookies/CSRF web o Bearer móvil). Las respuestas del módulo llevan `Cache-Control: private, no-store`.

La bandeja incluye `preview` opcional para ofertas: `{ imageUrl: string | null, discountPercent: number | null }`. La imagen proviene del primer recurso de un producto activo y el porcentaje de una promoción vigente al consultar; no son snapshots históricos ni cupones extraídos del mensaje. Se consultan IDs deduplicados de la página en hasta dos consultas adicionales, sin una consulta por aviso. Sistema/Rentas devuelven `preview: null`. Las respuestas sin este campo siguen siendo válidas para los clientes.

| Rol    | Método y ruta                                                            | Comportamiento                                                                                                                                                               |
| ------ | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CLIENT | `GET /notifications?page=1&category=OFFER`                               | Bandeja paginada de 20 elementos; categoría opcional `SYSTEM`, `OFFER`, `RENTAL`; contador global de no leídas.                                                              |
| CLIENT | `GET /notifications/:id`                                                 | Detalle exclusivamente del propietario.                                                                                                                                      |
| CLIENT | `PATCH /notifications/read`                                              | `{ ids: string[] }`, entre 1 y 100; ignora IDs ajenos y conserva la primera lectura.                                                                                         |
| CLIENT | `PATCH /notifications/read-all`                                          | Sin body. Marca los avisos pendientes de la cuenta autenticada, en todas las páginas y categorías. Conserva lecturas previas y avisos posteriores al inicio de la operación. |
| CLIENT | `GET/PATCH /notifications/preferences`                                   | `{ pushEnabled, system, offers, rentals }`, todos booleanos obligatorios al guardar.                                                                                         |
| CLIENT | `GET /notifications/push-config`                                         | Clave VAPID pública o `null`. Nunca devuelve la privada.                                                                                                                     |
| CLIENT | `POST /notifications/subscriptions/register`                             | `channel: WEB`, `endpoint`, `p256dh`, `auth`; o `channel: EXPO`, `endpoint` con el token Expo. Vincula dispositivo a cuenta y sesión actuales.                               |
| CLIENT | `POST /notifications/subscriptions/unregister`                           | `{ endpoint }`; solo desactiva suscripciones de la cuenta actual.                                                                                                            |
| CLIENT | `GET /notifications/promotion/:id`                                       | Promoción vigente y productos activos para destinos desde la bandeja.                                                                                                        |
| ADMIN  | `GET /admin/notification-campaigns?page=1`                               | Historial paginado, cantidad de destinatarios y resultados push por dispositivo.                                                                                             |
| ADMIN  | `POST /admin/notification-campaigns`                                     | Envío inmediato e idempotente.                                                                                                                                               |
| ADMIN  | `GET /admin/notification-campaigns/recipients?search=...`                | Hasta 50 clientes activos por nombre/correo.                                                                                                                                 |
| ADMIN  | `GET /admin/notification-campaigns/destinations?type=PRODUCT&search=...` | Hasta 30 productos/promociones/rentas; las rentas requieren `userId`.                                                                                                        |
| ADMIN  | `GET/PATCH /admin/notification-campaigns/automation`                     | `{ rentalStatus, prescriptions, security }`.                                                                                                                                 |

El envío contiene `requestId` UUID v4, `category`, `title` (3–100), `body` (3–500), `audience` (`ALL` o `SELECTED`), `userIds` (solo SELECTED, hasta 500), `destinationType` (`NONE`, `PRODUCT`, `PROMOTION`, `RENTAL`, `ACCOUNT`) y `destinationId` cuando corresponde. Se validan los destinos en el backend; una renta solo puede enviarse a su propietario como único destinatario. No se aceptan URLs arbitrarias. Repetir el mismo `requestId` y contenido no crea otro envío; cambiar su contenido devuelve conflicto.

## Persistencia y entrega

La migración `20261018120000_customer_notifications` crea campañas, destinatarios, preferencias, automatizaciones, suscripciones y cola durable. Aplicarla antes de desplegar el código. El rol principal de la API requiere acceso a estas tablas; si se configuran conexiones DB CLIENT para rentas, deben permitir también las escrituras transaccionales del outbox.

Rentas, revisión de recetas y cambios de correo/contraseña escriben los avisos en la misma transacción que el cambio funcional. Un rollback elimina también el aviso. Ofertas y comunicados manuales solo se generan al confirmar un envío administrativo. Las preferencias controlan push: la bandeja se conserva incluso al desactivar todas las categorías.

El worker consulta cada cinco segundos, reclama cada trabajo con un lease de dos minutos y reintenta errores transitorios hasta cinco intentos con espera exponencial. Revalida cuenta, propietario del dispositivo, sesión y preferencias antes de enviar. Los avisos genéricos de seguridad permiten la sesión que acaba de revocarse en la transacción de cambio de credenciales; las sesiones cerradas antes de ese evento quedan excluidas. Un dispositivo reasignado a otra cuenta nunca recibe trabajos anteriores. Los endpoints web se restringen a proveedores admitidos para evitar solicitudes internas arbitrarias.

`PENDING`: en cola. `ACCEPTED`: aceptado por el proveedor. `DELIVERED`: recibo Expo confirmado por FCM/APNs; no demuestra visualización ni lectura. `FAILED`: error definitivo o reintentos agotados. `SKIPPED`: preferencias, sesión o cuenta ya no permiten entrega. Web Push no ofrece recibos de dispositivo y permanece como ACCEPTED. Los recibos Expo se consultan desde los 15 minutos; un recibo ausente tras 24 horas queda como fallo, sin reenviar un ticket aceptado. La entrega externa tiene semántica de al menos una vez ante caídas entre envío y persistencia; no se promete entrega exactamente una vez.

## Configuración

1. Web: instalar dependencias, generar Prisma y aplicar la migración. Definir conjuntamente `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:` válido o URL HTTPS). Con base local y `EMAIL_FROM` configurado, `npm run notifications:configure:webpush` genera claves una sola vez en `.env`, sin imprimirlas. Conservar esas claves entre reinicios y despliegues.
2. Móvil: registrar el token Expo obtenido por la app. `EXPO_ACCESS_TOKEN` es opcional y se usa si se activó la seguridad adicional de Expo. Project ID y credenciales FCM/APNs se configuran en el proyecto móvil/EAS; no se inventan desde el backend.
3. Sin VAPID, la bandeja funciona y `/push-config` devuelve `null`; los trabajos web sin configuración se registran como fallo. No se simula entrega exitosa.

Referencias: [Web Push](https://github.com/web-push-libs/web-push), [envío y recibos Expo](https://docs.expo.dev/push-notifications/sending-notifications/).

## Verificación

- `npm run build`.
- `npm test -- --runInBand src/modules/notifications src/modules/rentals/rentals.service.spec.ts src/modules/rentals/rental-documents.service.spec.ts src/modules/users/account-security.service.spec.ts src/modules/users/users.service.spec.ts src/env.validation.spec.ts`.
- `npx eslint src/modules/notifications src/env.validation.ts`.
- `npm run test:notifications:postgres`: solo base local migrada. Crea destinatarios temporales, comprueba aislamiento, lecturas, idempotencia, preferencias y rollback; elimina sus fixtures y bloquea todas las llamadas push externas.
- Falta validar la recepción real en navegadores/dispositivos con credenciales configuradas. Las pruebas automatizadas no afirman entrega a sistemas operativos.
