# Recuperar el fallo de la vista de clustering en Render gratuito

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
de esa migración cuyo error sea el 42P16 conocido de nombres de columna. Usa
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
reaplicación y rechazo de fallos de otra causa. Solo acepta una conexión explícita
a 127.0.0.1, usuario `test_security` y una base vacía con prefijo
`migration_recovery_test`; nunca toma la URL de la aplicación ni borra una base.

En entornos donde esta migración ya esté aplicada, la versión corregida cambia
el checksum del archivo histórico. Antes de crear nuevas migraciones con
`migrate dev`, revisar su historial; no aceptar un reinicio de base para resolver
ese aviso. El despliegue de recuperación probado usa `migrate deploy`.

Referencias: [contrato de CREATE OR REPLACE VIEW](https://www.postgresql.org/docs/current/sql-createview.html),
[recuperar una migración fallida con Prisma](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/patching-and-hotfixing#failed-migration).
