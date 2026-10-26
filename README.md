> Correo transaccional: consulta [docs/TRANSACTIONAL_EMAIL.md](docs/TRANSACTIONAL_EMAIL.md) para configurar Brevo y Railway.

<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

## Database environments (Local and Neon)

1. Copy `.env.example` to `.env` and fill real credentials.
2. Keep a single active pair in `.env`:
   - `DATABASE_URL`
   - `DATABASE_DIRECT_URL`
3. Switch manually between local and Neon by replacing those two values when needed.
4. Configure auth and server vars in `.env`:
   - `JWT_SECRET`
   - `JWT_EXPIRES_IN`
   - `PORT`
   - `CORS_ORIGIN` (single URL or comma-separated list)
5. Configure backup storage in Google Drive:
   - `GOOGLE_DRIVE_PROVIDER` (`oauth2` or `service-account`)
   - `GOOGLE_DRIVE_FOLDER_ID`
   - If `GOOGLE_DRIVE_PROVIDER=oauth2`:
     `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`,
     `GOOGLE_OAUTH_REDIRECT_URI`, `GOOGLE_OAUTH_REFRESH_TOKEN`
   - If `GOOGLE_DRIVE_PROVIDER=service-account`:
     `GOOGLE_DRIVE_CLIENT_EMAIL`, `GOOGLE_DRIVE_PRIVATE_KEY`

Use `npm run drive:oauth:url` to generate the consent URL and `npm run drive:oauth:token -- YOUR_AUTHORIZATION_CODE` to exchange the authorization code for tokens. Store the returned `refresh_token` in `.env` and share the destination folder with the same Google account that completed the consent flow.

If you use `service-account`, store backups in a Shared Drive or in a folder explicitly shared with the service account. Avoid configuring both providers for the same destination unless you intentionally want fallback behavior between different identities.

6. Configure product images in Cloudinary:
   - `CLOUDINARY_URL`
   - `CLOUDINARY_PRODUCTS_FOLDER` (optional)

Products accept multiple images. Admin can upload files from the computer or provide remote image URLs, and CSV import supports an `ImageUrls` column with URLs separated by `|`.

Prisma reads both values directly from `.env`:

```bash
# Check status
$ npm run db:status

# Create/apply migrations
$ npm run db:migrate:dev

# Apply migrations in deploy environment
$ npm run db:migrate:deploy
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Despliegue en Render

El build genera el cliente Prisma y compila el código; las migraciones se aplican
por separado antes de iniciar el backend. Si falta `SecurityNotice`, el proceso
se detiene antes de abrir el puerto: el aviso de puertos es consecuencia de esa
salida, no un problema con `PORT`.

Antes de actualizar una base existente, conservar un respaldo y ejecutar
`npm run db:status` desde el entorno de Render. Verificar que `DATABASE_URL` y
`DATABASE_DIRECT_URL` apunten a la misma base; la segunda debe permitir conexión
directa con permisos de migración. Para esta actualización, las migraciones
nuevas son:

- `20261017120000_account_security_challenges`
- `20261018120000_customer_notifications`
- `20261025120000_customer_favorites`

Revisar cualquier migración adicional pendiente, fallida o divergente antes de
aplicarla. No usar `migrate reset`, `migrate dev`, `db push --force-reset` ni
`--accept-data-loss` en producción. Si una tabla ya existe porque se creó
manualmente, reconciliar su esquema e historial en lugar de borrarla o marcar
migraciones como aplicadas sin comprobarlas.

Configuración del servicio:

| Campo de Render | Comando |
| --- | --- |
| Build Command | `npm ci --include=dev && npm run build` |
| Pre-Deploy Command, si está disponible | `npm run db:migrate:deploy` |
| Start Command, con Pre-Deploy | `npm run start:prod` |
| Start Command, sin Pre-Deploy | `npm run start:render` |

En una versión ya desplegada que todavía no tenga `start:render`, el comando
equivalente es `npm run db:migrate:deploy && npm run start:prod`. El operador `&&`
impide iniciar el backend si falla una migración. Los scripts `start` y
`start:prod` siguen sin modificar el esquema por sí mismos.

Render ofrece Pre-Deploy en servicios compatibles de pago. Referencia:
[comandos de despliegue de Render](https://render.com/docs/deploys#pre-deploy-command).

Si el despliegue se bloquea con P3018/42P16 en la vista de clustering, seguir el
[procedimiento de recuperación para Render gratuito](docs/RENDER_MIGRATION_RECOVERY.md).

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
# Seguridad de cuenta

`PATCH /users/me` modifica únicamente `nombre`, `telefono` y `direccion`; el `ValidationPipe` rechaza `correo` y `password` en ese contrato. Para cambiar credenciales con sesión autenticada se usan:

| Método | Ruta | Cuerpo |
| --- | --- | --- |
| POST | `/users/me/email-change/request` | `newEmail`, `currentPassword` |
| POST | `/users/me/email-change/resend` | `{}` |
| POST | `/users/me/email-change/confirm` | `newEmail`, `codigo` |
| POST | `/users/me/password-change/request` | `currentPassword` |
| POST | `/users/me/password-change/resend` | `{}` |
| POST | `/users/me/password-change/confirm` | `codigo`, `newPassword` |

Las solicitudes devuelven `{ message, resendAt, expiresAt }`; las confirmaciones devuelven `{ message }`. Los códigos tienen ocho dígitos, propósito separado, hash, expiración, límite de intentos y espera de 60 segundos entre envíos. La confirmación consume el código, actualiza la cuenta y revoca todas las sesiones, incluida la actual, en una transacción. El correo antiguo continúa vigente hasta confirmar el nuevo. Los avisos de seguridad se guardan en `accounts.security_notices` dentro de la transacción y se entregan con reintento por `SecurityNoticeDeliveryService`; los logs no contienen códigos ni contraseñas. La edición sensible de otra cuenta por un administrador conserva el endpoint administrativo, registra `actorId`, avisa al correo previo y revoca las sesiones.

La migración `20261017120000_account_security_challenges` agrega los propósitos OTP y la cola de avisos; debe aplicarse primero en una base de pruebas y luego mediante el procedimiento de despliegue correspondiente. Las recuperaciones de contraseña web y móvil existentes siguen disponibles y consumen el código de forma condicional para impedir confirmaciones simultáneas.
