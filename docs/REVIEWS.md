# Reseñas: escritura y contenido

`POST /reviews` conserva JWT y el contrato `{ productId, rating, comment }`.
Crea o actualiza la opinión de ese usuario/producto y la deja `PENDING`; no publica
reseñas directamente. El DTO recorta extremos antes de validar longitud 5–500.
El envío no cambia roles, esquema de base de datos ni transporte de sesión.

`src/modules/reviews/review-content.ts` valida antes del upsert y antes de aprobar
una opinión histórica. Rechaza groserías de una lista explícita y patrones de HTML,
scripts, SQL y controles de texto peligrosos. Normaliza para inspección mayúsculas,
acentos, formas de ancho completo, caracteres invisibles y variantes comunes de
leetspeak/separadores. Inspecciona hasta tres capas de codificación URL/entidades;
no ejecuta ni sustituye silenciosamente el contenido. Los errores no repiten la
entrada ofensiva ni detalles internos.

El filtro es heurístico: requiere mantener la lista, puede tener falsos positivos
y no detecta todas las evasiones ni todos los idiomas. Se mantiene moderación
humana. Los clientes deben renderizar el comentario como texto con escape nativo;
Prisma sigue usando consultas parametrizadas. El filtro no reemplaza estas defensas.
Véanse [validación OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html)
y [salida segura OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html).

Validación local: suites de review-content, reviews.service y reviews.controller,
ESLint de los archivos del módulo, Prettier y `npm run build`. El `tsc --noEmit`
global incluye tests antiguos de otros módulos que ya tienen incompatibilidades;
la compilación de producción los excluye. No se hicieron escrituras reales, push
ni despliegue. Estos controles requieren desplegar este backend para proteger los
envíos de la app en producción.

## Moderación y avisos — 1 de noviembre de 2026

- `PATCH /reviews/:id/approve` y `PATCH /reviews/:id/reject` requieren JWT y rol
  `ADMIN`. No reciben body; responden `{ message, review }` con las relaciones
  `product`, `user` y `approvedBy` que usa el panel.
- Aprobar valida el contenido histórico y establece `APPROVED`, `approvedAt` y
  `approvedById`. Rechazar establece `REJECTED`, quita `showOnHome` y limpia los
  datos de aprobación. No elimina la opinión; el cliente puede editarla mediante
  el `POST /reviews` existente, que vuelve a dejarla `PENDING`.
- Se admite aprobar una reseña rechazada y rechazar una aprobada. Repetir el mismo
  estado devuelve la reseña sin otra escritura ni otro aviso. Una escritura
  concurrente invalida la operación con HTTP 409, sin sobrescribir el comentario.
- Estado, destinatario y trabajos de push se persisten en la misma transacción.
  Un fallo revierte la operación; el envío externo lo procesa el worker existente
  después del commit. `notifyReviewModeration` solo notifica a clientes activos.
- El evento usa `source: REVIEW_STATUS`, categoría `SYSTEM`, destino `PRODUCT` y
  el id del producto. No contiene el comentario, correo ni identidad del moderador
  en el texto enviado al dispositivo. No requiere migración ni un destino nuevo.
- La bandeja se conserva aunque push esté desactivado. El envío externo respeta
  `pushEnabled`, `system` y las comprobaciones de suscripción/sesión del worker.
  No se usa el interruptor de automatización de seguridad para reseñas.

Pruebas: HTTP 401/403/400 y delegación ADMIN; aprobación/rechazo, idempotencia,
conflicto, fallo transaccional, destinatario, preferencias, bandeja y outbox push.
Las pruebas usan dobles de Prisma; no acreditan entrega real de FCM/APNs/Web Push
ni sustituyen una comprobación de transacciones con PostgreSQL.

La activación de testimonios también condiciona la escritura a que la reseña siga
`APPROVED`, evitando que una acción anterior reactive Inicio después del rechazo.
Validaciones de esta ampliación: build NestJS, ESLint/Prettier de archivos
modificados y suites de reseñas/notificaciones (88 casos, incluidos dos de
visibilidad concurrente). No se ejecutaron migraciones ni escrituras en producción.
