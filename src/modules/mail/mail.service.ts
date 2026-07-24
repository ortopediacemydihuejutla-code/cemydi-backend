import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { SendEmailOptions } from './interfaces/send-email.interface';
import { resetPasswordTemplate } from './templates/reset-password.template';
import { verifyEmailTemplate } from './templates/verify-email.template';

const BREVO_SEND_EMAIL_URL = 'https://api.brevo.com/v3/smtp/email';
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 3;
const BASE_RETRY_DELAY_MS = 200;

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly configService: ConfigService) {}

  async sendEmailVerificationLink(input: {
    correo: string;
    nombre: string;
    verificationUrl: string;
    code: string;
    expirationMinutes: number;
  }) {
    await this.sendEmail({
      to: input.correo,
      recipientName: input.nombre,
      subject: 'Verifica tu correo en CEMYDI',
      html: verifyEmailTemplate({
        recipientName: input.nombre,
        verificationUrl: input.verificationUrl,
        code: input.code,
        expirationMinutes: input.expirationMinutes,
      }),
      text: [
        `Hola ${input.nombre},`,
        'Gracias por crear tu cuenta en CEMYDI.',
        `Tu código de verificación es: ${input.code}`,
        `También puedes confirmar tu correo desde este enlace: ${input.verificationUrl}`,
        `El código y el enlace vencen en ${input.expirationMinutes} minutos. Puedes utilizar cualquiera de las dos opciones una sola vez.`,
        'Si no creaste esta cuenta, puedes ignorar el mensaje.',
      ].join('\n\n'),
      tag: 'email-verification',
    });
  }

  async sendPasswordResetCode(input: {
    correo: string;
    nombre: string;
    code: string;
    resetUrl: string;
    expirationMinutes: number;
  }) {
    await this.sendEmail({
      to: input.correo,
      recipientName: input.nombre,
      subject: 'Código para restablecer tu contraseña en CEMYDI',
      html: resetPasswordTemplate({
        recipientName: input.nombre,
        code: input.code,
        resetUrl: input.resetUrl,
        expirationMinutes: input.expirationMinutes,
      }),
      text: [
        `Hola ${input.nombre},`,
        'Recibimos una solicitud para cambiar la contraseña de tu cuenta CEMYDI.',
        `Tu código de recuperación es: ${input.code}`,
        `También puedes continuar desde este enlace: ${input.resetUrl}`,
        `El código y el enlace vencen en ${input.expirationMinutes} minutos. Puedes utilizar cualquiera de las dos opciones una sola vez.`,
        'Si no solicitaste este cambio, ignora el mensaje. Tu contraseña actual no se modificará.',
      ].join('\n\n'),
      tag: 'password-reset',
    });
  }

  async sendEmail(options: SendEmailOptions) {
    const config = this.getBrevoConfig();
    const idempotencyKey = randomUUID();
    const payload = {
      sender: {
        name: config.senderName,
        email: config.senderEmail,
      },
      to: [
        {
          email: options.to,
          ...(options.recipientName?.trim()
            ? { name: options.recipientName.trim() }
            : {}),
        },
      ],
      subject: options.subject,
      htmlContent: options.html,
      ...(options.text ? { textContent: options.text } : {}),
      headers: {
        idempotencyKey,
      },
      ...(options.tag ? { tags: [options.tag] } : {}),
    };

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        const response = await this.postToBrevo(
          config.apiKey,
          idempotencyKey,
          payload,
        );

        if (response.ok) {
          this.logger.log(
            `Correo transaccional aceptado por Brevo. intento=${attempt}`,
          );
          return;
        }

        const retryable = response.status === 429 || response.status >= 500;
        if (retryable && attempt < MAX_ATTEMPTS) {
          this.logger.warn(
            `Brevo respondió con un error temporal. status=${response.status} intento=${attempt}`,
          );
          await this.waitBeforeRetry(
            attempt,
            response.headers.get('retry-after'),
          );
          continue;
        }

        const providerCode = await this.readBrevoErrorCode(response);
        this.logger.error(
          `Brevo rechazó el correo transaccional. status=${response.status} code=${providerCode ?? 'unknown'} intento=${attempt}`,
        );
        break;
      } catch (error) {
        const errorName = error instanceof Error ? error.name : 'Error';
        if (attempt < MAX_ATTEMPTS) {
          this.logger.warn(
            `Fallo temporal al conectar con Brevo. tipo=${errorName} intento=${attempt}`,
          );
          await this.waitBeforeRetry(attempt);
          continue;
        }

        this.logger.error(
          `No fue posible conectar con Brevo. tipo=${errorName} intento=${attempt}`,
        );
      }
    }

    throw new InternalServerErrorException(
      'No se pudo enviar el correo en este momento. Intenta nuevamente más tarde.',
    );
  }

  private async postToBrevo(
    apiKey: string,
    idempotencyKey: string,
    payload: object,
  ) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      return await fetch(BREVO_SEND_EMAIL_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'api-key': apiKey,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private getBrevoConfig() {
    const apiKey = this.configService.get<string>('BREVO_API_KEY')?.trim();
    const senderEmail = this.configService.get<string>('EMAIL_FROM')?.trim();
    const senderName =
      this.configService.get<string>('EMAIL_FROM_NAME')?.trim() || 'CEMYDI';

    if (!apiKey || !senderEmail) {
      throw new InternalServerErrorException(
        'El servicio de correo no está configurado correctamente.',
      );
    }

    if (apiKey.startsWith('xsmtpsib-')) {
      throw new InternalServerErrorException(
        'BREVO_API_KEY contiene una clave SMTP. Configura una API key v3 que inicie con xkeysib-.',
      );
    }

    if (!apiKey.startsWith('xkeysib-')) {
      throw new InternalServerErrorException(
        'BREVO_API_KEY no tiene el formato de una API key v3 de Brevo.',
      );
    }

    return { apiKey, senderEmail, senderName };
  }

  private async readBrevoErrorCode(response: Response) {
    try {
      const payload = (await response.json()) as unknown;
      if (
        payload &&
        typeof payload === 'object' &&
        'code' in payload &&
        typeof payload.code === 'string'
      ) {
        return payload.code;
      }
    } catch {
      // Algunas respuestas del proveedor no incluyen cuerpo JSON.
    }

    return null;
  }

  private async waitBeforeRetry(attempt: number, retryAfter?: string | null) {
    const retryAfterSeconds = Number(retryAfter);
    const requestedDelay =
      Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
        ? retryAfterSeconds * 1_000
        : BASE_RETRY_DELAY_MS * attempt;
    const boundedDelay = Math.min(requestedDelay, 2_000);
    await new Promise((resolve) => setTimeout(resolve, boundedDelay));
  }
}
