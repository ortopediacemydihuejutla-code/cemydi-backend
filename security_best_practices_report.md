# Correcciones de seguridad del backend

Fecha: 25 de octubre de 2026. Verificación local; publicación pendiente.

## Resultado

Se corrigieron los hallazgos reproducidos y se agregaron pruebas de regresión. La migración de favoritos está preparada y se verificó en PostgreSQL temporal; **no se aplicó a la base de datos de la aplicación**. No se borró, reinició ni modificó esa base.

## Cambios

- **Identidad de Google:** un registro no verificado pierde su contraseña anterior, sus retos pendientes y sus sesiones cuando el propietario entra con Google. La verificación y la creación de la nueva sesión comparten una transacción. Las cuentas ya verificadas conservan su contraseña.
- **Sesiones y concurrencia:** el login con contraseña bloquea y relee el usuario antes de insertar la sesión. Rechaza contraseñas, correos, roles o estados que cambiaron desde su validación. Un restablecimiento ya confirmado no puede quedar seguido de una sesión creada con la contraseña anterior.
- **Cambios de credenciales:** los cambios de correo/contraseña y los cambios administrativos sensibles revocan todos los retos pendientes y las sesiones. El restablecimiento y la verificación de correo bloquean al usuario, comparan el correo actual y consumen el reto de forma condicional, comprobando vigencia e intentos. Esto impide reutilización y consumo concurrente doble.
- **Login web:** `TrustedOriginGuard` exige un origen exacto configurado antes de autenticar o establecer cookies. Rechaza orígenes ausentes, opacos y externos. El frontend actual envía Origin mediante fetch; clientes nativos mantienen `/auth/mobile/login`, que devuelve tokens sin cookies.
- **Dependencias:** se actualizaron versiones compatibles y el lockfile sin ejecutar scripts de instalación ni usar actualizaciones forzadas. Quedaron `body-parser@2.4.0`, `multer@2.5.0`, `proxy-addr@2.0.8`, `qs@6.16.0` y el override de Swagger para `js-yaml@5.4.1`.
- **Favoritos:** migración aditiva `prisma/migrations/20261025120000_customer_favorites/migration.sql` con tabla, claves foráneas, unicidad e índices. Se tipó el acceso al delegado Prisma.
- **Calidad:** se corrigieron los errores de lint detectados con tipos y fixtures adecuados, sin desactivar reglas adicionales. La compilación incluye explícitamente solo los archivos de `src`.

## Validación

Las comprobaciones finales se ejecutaron con Node 22.23.4, descargado de nodejs.org y verificado contra su SHA-256 oficial.

- Compilación de NestJS correcta.
- **76 suites y 379 pruebas unitarias aprobadas.**
- **Lint: 0 errores y 0 advertencias**, sin autofix ni desactivaciones adicionales de reglas.
- Auditoría completa: **0 vulnerabilidades**.
- Instalación limpia con `npm ci --ignore-scripts` en una carpeta temporal: correcta, 754 paquetes instalados.
- `npm audit signatures`: 754 paquetes con firmas de registro verificadas y 79 con attestations verificadas.
- Pruebas HTTP aisladas: **5 aprobadas**. Incluyen rechazo de login CSRF, continuidad de login móvil y una petición gzip malformada que se rechaza sin terminar el servidor.
- PostgreSQL 18 temporal: pasaron conservación de datos previos a la migración, unicidad de favoritos, invalidación de contraseña plantada, rollback transaccional de Google, revocación de enlaces antiguos, intercalado real de login/restablecimiento y consumo único concurrente de retos.
- Después de aplicar la migración en esa instancia, `prisma migrate diff --exit-code` reportó **sin diferencias** frente al esquema actual.
- `git diff --check` correcto, con las advertencias habituales de conversión LF/CRLF.

## Aplicación y límites

Antes de desplegar, aplicar las migraciones pendientes mediante el procedimiento habitual de respaldo y `prisma migrate deploy`, revisando primero su estado. No usar `migrate reset`, `db push --force-reset` ni `--accept-data-loss`. Si la tabla de favoritos ya se creó manualmente en un entorno, reconciliarla con el historial de migraciones en lugar de borrarla. No se ejecutó ningún comando de migración sobre la base de datos de la aplicación.

El login web requiere ahora Origin; integraciones sin ese encabezado deben usar el endpoint móvil si necesitan tokens sin cookies, o implementar un cliente web que preserve el origen autorizado.

El script `test/security-hardening.postgres.cjs` solo acepta una URL explícita `SECURITY_TEST_DATABASE_URL` hacia 127.0.0.1, usuario `test_security`, base `security_hardening_test` y puerto explícito. Nunca toma DATABASE_URL ni lee .env. Requiere un esquema temporal preparado y un registro testigo previo a la migración. El arranque de la aplicación real y la infraestructura del proveedor no se probaron contra producción.

Los cambios evitan los escenarios futuros comprobados. Esta revisión no certifica la ausencia de toda vulnerabilidad ni audita íntegramente el historial de Git o la infraestructura externa.

Referencias: [aviso de body-parser](https://github.com/advisories/GHSA-27r3-jxmh-p828), [aviso de Multer](https://github.com/advisories/GHSA-q7qp-rjg7-q26m).
