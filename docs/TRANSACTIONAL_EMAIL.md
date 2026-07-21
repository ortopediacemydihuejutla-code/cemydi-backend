# Correo transaccional con Brevo

El backend envía correos de verificación y recuperación mediante `POST https://api.brevo.com/v3/smtp/email`. No utiliza SMTP ni Nodemailer.

## Variables del backend

Configura estas variables privadas en el servicio **backend** de Railway:

```env
BREVO_API_KEY=xkeysib-...
EMAIL_FROM=remitente-verificado@gmail.com
EMAIL_FROM_NAME=CEMYDI
FRONTEND_URL=https://tu-frontend.up.railway.app
EMAIL_VERIFICATION_TOKEN_EXPIRATION_MINUTES=60
PASSWORD_RESET_TOKEN_EXPIRATION_MINUTES=30
PASSWORD_RESET_MAX_ATTEMPTS=5
```

`CORS_ORIGIN` debe contener únicamente los orígenes web autorizados y normalmente incluirá el mismo origen configurado en `FRONTEND_URL`.

No copies `BREVO_API_KEY` al frontend, no la nombres `NEXT_PUBLIC_*` y no la incluyas en capturas, logs o archivos versionados. Las variables SMTP antiguas ya no se utilizan.

## Crear la API key

1. En Brevo abre **Settings > SMTP & API > API Keys & MCP**.
2. Selecciona **Generate a new API key**.
3. Usa un nombre reconocible, por ejemplo `CEMYDI Railway backend`.
4. Elige una vigencia y genera la clave.
5. Copia la clave en ese momento y guárdala directamente como `BREVO_API_KEY` en Railway.

Brevo sólo muestra la clave completa una vez. Conviene usar una clave exclusiva para este proyecto y rotarla si llega a exponerse.

Documentación oficial: <https://help.brevo.com/hc/es/articles/209467485-Crear-o-eliminar-una-clave-API>

## Verificar temporalmente un remitente Gmail

1. En Brevo abre **Settings > Senders, Domains, IPs > Senders**.
2. Selecciona **Add a sender**.
3. Escribe `CEMYDI` como nombre y la cuenta Gmail como dirección.
4. Guarda el remitente.
5. Copia en Brevo el código de seis dígitos que llegará a Gmail y confirma con **Verify sender**.
6. Usa exactamente esa dirección en `EMAIL_FROM`.

Una dirección Gmail sirve como solución temporal, pero su dominio no puede autenticarse como dominio propio. Brevo puede sustituir el remitente por una dirección compatible y la entregabilidad será inferior. Al contar con dominio propio, crea una dirección profesional y autentica DKIM/DMARC.

Documentación oficial: <https://help.brevo.com/hc/en-us/articles/208836149-Create-a-new-sender-From-name-and-From-email>

## Despliegue

1. Configura las variables anteriores en Railway.
2. Ejecuta las migraciones del backend con `npm run db:migrate:deploy` como parte del despliegue.
3. Despliega el backend y después el frontend.
4. Revisa en Brevo los logs de correo transaccional para confirmar que el proveedor aceptó cada mensaje.

La migración `20260720235500_email_verification_backfill_and_token_index`:

- marca como verificadas únicamente las cuentas creadas antes de que existiera el flujo de verificación;
- agrega un índice único al hash del token de verificación;
- no elimina usuarios ni modifica cuentas nuevas pendientes de confirmación.

## Pruebas manuales

### Registro y verificación

1. Registra una cuenta con un correo real que puedas consultar.
2. Comprueba que la aplicación muestra `/verify-email?correo=...` y no expone el token.
3. Abre el correo de CEMYDI y pulsa **Verificar mi correo**.
4. Confirma que `/verify-email?token=...` muestra el estado exitoso.
5. Intenta usar el mismo enlace otra vez: debe mostrarse como inválido o utilizado.
6. Inicia sesión con la cuenta verificada.

### Reenvío

1. Desde `/verify-email`, escribe el correo de la cuenta pendiente.
2. Pulsa **Reenviar enlace**.
3. Confirma que aparece la respuesta genérica y una cuenta regresiva.
4. Verifica que el enlace anterior deja de funcionar y el nuevo sí funciona.

### Recuperación

1. Abre `/forgot-password` y solicita el código.
2. Usa un correo existente y después uno inexistente; ambos deben mostrar la misma respuesta pública.
3. En `/reset-password`, pega o escribe el código de ocho dígitos.
4. Define una contraseña que cumpla las reglas y guarda el cambio.
5. Confirma que la contraseña anterior deja de funcionar, la nueva permite iniciar sesión y las sesiones previas fueron revocadas.

Las pruebas automatizadas simulan Brevo y nunca envían correos reales.
