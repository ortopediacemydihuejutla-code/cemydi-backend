# Recuperar los fallos conocidos de migraciones en Render

El error P3018 con código PostgreSQL 42P16 en
`20260801190000_customer_clustering_consistency` ocurre porque `CREATE OR REPLACE
VIEW` conserva el contrato de columnas por posición. La consulta anterior movía
`last_activity` después de las métricas derivadas. PostgreSQL rechazó ese único
statement; no se completó la migración ni se modificaron las filas de las tablas.

La versión corregida conserva el orden real de las columnas existentes. Si la
vista todavía no existe, la crea; si falta una columna conocida, la agrega al
final. No elimina la vista, sus permisos, dependencias ni datos. Una columna
desconocida hace que se detenga para revisión. La corrección también admite el
orden de los entornos donde la versión anterior ya se aplicó correctamente.

La siguiente migración, `20260801210000_monthly_demand_stock_semantics`, puede
fallar con P3018/42703 si la vista ya tiene `stock_at_month_start` y se intenta
renombrar otra vez `stock_available`. Su versión corregida verifica el contrato:
renombra únicamente si existe solo el nombre antiguo, conserva el nuevo si ya
está presente y agrega el comentario de la columna en la misma transacción. Si
faltan ambos nombres, existen ambos o falta la vista, falla sin borrarla.

## Eliminación de cuentas: P3018/42704

`20261103193000_account_deletion` podía fallar al eliminar la restricción
`"rental_requests_userId_fkey"`. El SQL histórico de rentas declaró el nombre sin
comillas, por lo que PostgreSQL lo almacenó como `rental_requests_userid_fkey`.
Una base creada desde el schema de Prisma conserva las mayúsculas; probar solo
ese caso no reproducía el contrato de producción.

El SQL corregido localiza las claves foráneas por tabla de origen, columna
`userId`, tabla de destino y columna `id`, sin depender de su nombre. Reemplaza
únicamente esa relación por `ON DELETE SET NULL` y permite `userId` nulo. Conserva
las otras relaciones, las filas de rentas y sus importes. La creación de la tabla
de solicitudes y sus índices admite reintentos si una ejecución fallida ya los
creó; todos los cambios nuevos se ejecutan dentro de una transacción.

El recuperador existente también reconoce exclusivamente el fallo 42704 de esa
restricción con origen `ATExecDropConstraint`. Comprueba que el archivo SQL
corregido esté publicado y registra el intento como `--rolled-back`; después
`migrate deploy` debe ejecutar realmente el SQL. No borra tablas ni marca una
migración como aplicada. Un error distinto permanece bloqueado para revisión.

El Start Command mostrado abajo ya cubre este caso: no hace falta agregar otro
comando ni ejecutar `npm audit fix --force`, cuyo aviso no causó este fallo.

## Procedimiento sin Shell ni Pre-Deploy de pago

1. Conservar un respaldo de Neon antes de modificar su esquema.
2. Subir los cambios corregidos a la rama que despliega Render. El log del fallo
   muestra `main`: modificar solo `develop` no actualiza ese despliegue.
3. Verificar en Render que `DATABASE_URL` y `DATABASE_DIRECT_URL` señalen a la
   misma base Neon. La segunda debe ser una conexión directa con permisos DDL.
4. Configurar este **Start Command**, que usa únicamente scripts del repositorio:

   ```bash
   npm run db:recover:clustering && npm run db:migrate:deploy && npm run start:prod
   ```

5. Ejecutar **Manual Deploy → Deploy latest commit** después de que la rama
   incluya la corrección.

El primer comando comprueba el historial y solo recupera los intentos pendientes
de las tres migraciones cuyo error coincida con el 42P16 conocido de clustering,
el 42703 de `stock_available` o el 42704 de la restricción de rentas. Para la vista
mensual también comprueba que exista exactamente uno de los dos nombres de stock
antes de cambiar el estado.
Conserva el nombre `db:recover:clustering` para que el Start Command ya configurado
en Render siga funcionando. Usa
`prisma migrate resolve --rolled-back`, que permite reintentar el SQL corregido;
no marca la migración como aplicada ni borra datos. Si encuentra otra causa,
falla y no cambia el estado. El segundo comando aplica las migraciones pendientes
en orden; `&&` impide iniciar el backend si falla cualquier paso.

Después de un despliegue correcto puede volver a usarse el Start Command habitual:

```bash
npm run db:migrate:deploy && npm run start:prod
```

El recuperador también permite reinicios: cuando no queda ese fallo pendiente,
no modifica nada y termina correctamente. No usar `migrate reset`, eliminar
tablas/vistas, editar manualmente `_prisma_migrations` ni marcar la migración como
aplicada para ocultar el error.

## Validación de la corrección

`test/clustering-migration.postgres.cjs` reproduce P3018/42P16 con PostgreSQL real
aislado. Verifica recuperación mediante Prisma, consumo del estado fallido,
conservación de filas, identidad de la vista, orden de columnas, permisos y vistas
dependientes. Comprueba ambos órdenes históricos, creación desde ausencia,
reaplicación y rechazo de fallos de otra causa. También reproduce P3018/42703,
recupera la migración mensual mediante Prisma y verifica ambos nombres de stock,
reaplicación y rechazo de contratos ambiguos o desconocidos. Solo acepta una conexión explícita
a 127.0.0.1, usuario `test_security` y una base vacía con prefijo
`migration_recovery_test`; nunca toma la URL de la aplicación ni borra una base.

La misma prueba reproduce P3018/42704 con la restricción histórica sin comillas,
simula una ejecución parcial con una solicitud existente y verifica la
recuperación mediante Prisma. Comprueba los nombres histórico, generado por
Prisma y personalizado, la ausencia de la clave foránea, la reaplicación, el
rechazo de errores diferentes y la conservación de la relación de aprobación y
de las filas de rentas y solicitudes al eliminar la cuenta.

En entornos donde estas migraciones ya estén aplicadas, las versiones corregidas
cambian los checksums de los archivos históricos. Antes de crear nuevas migraciones con
`migrate dev`, revisar su historial; no aceptar un reinicio de base para resolver
ese aviso. El despliegue de recuperación probado usa `migrate deploy`.

Referencias: [contrato de CREATE OR REPLACE VIEW](https://www.postgresql.org/docs/current/sql-createview.html),
[recuperar una migración fallida con Prisma](https://www.prisma.io/docs/orm/v6/prisma-migrate/workflows/patching-and-hotfixing#failed-migration).
