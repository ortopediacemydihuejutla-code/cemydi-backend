import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';
import { resetPasswordTemplate } from './templates/reset-password.template';
import { verifyEmailTemplate } from './templates/verify-email.template';

describe('MailService', () => {
  const values: Record<string, string> = {
    BREVO_API_KEY: 'xkeysib-test-api-key',
    EMAIL_FROM: 'sender@example.com',
    EMAIL_FROM_NAME: 'CEMYDI',
    EMAIL_VERIFICATION_TOKEN_EXPIRATION_MINUTES: '60',
    PASSWORD_RESET_TOKEN_EXPIRATION_MINUTES: '30',
  };
  let service: MailService;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    const configService = {
      get: jest.fn((key: string) => values[key]),
    } as unknown as ConfigService;
    service = new MailService(configService);
    fetchMock = jest.fn();
    global.fetch = fetchMock;
    jest
      .spyOn(
        service as unknown as {
          waitBeforeRetry: (attempt: number) => Promise<void>;
        },
        'waitBeforeRetry',
      )
      .mockResolvedValue();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sends the Brevo HTTPS payload without exposing SMTP configuration', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 201 }));

    await service.sendEmail({
      to: 'recipient@example.com',
      recipientName: 'Persona',
      subject: 'Asunto',
      html: '<p>Contenido</p>',
      tag: 'security-test',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    const requestHeaders = request.headers as Record<string, string>;
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(request.method).toBe('POST');
    expect(requestHeaders).toMatchObject({
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'api-key': 'xkeysib-test-api-key',
    });
    expect(requestHeaders).not.toHaveProperty('idempotencyKey');
    expect(typeof request.body).toBe('string');
    const body =
      typeof request.body === 'string'
        ? (JSON.parse(request.body) as unknown)
        : null;
    expect(body).toMatchObject({
      sender: { name: 'CEMYDI', email: 'sender@example.com' },
      to: [{ email: 'recipient@example.com', name: 'Persona' }],
      subject: 'Asunto',
      htmlContent: '<p>Contenido</p>',
      tags: ['security-test'],
    });
    const parsedBody = body as { headers: { idempotencyKey: unknown } };
    expect(parsedBody.headers.idempotencyKey).toEqual(expect.any(String));
  });

  it('retries temporary errors with the same idempotency key', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 201 }));

    await service.sendEmail({
      to: 'recipient@example.com',
      subject: 'Asunto',
      html: '<p>Contenido</p>',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const fetchCalls = fetchMock.mock.calls as unknown as Array<
      [string, RequestInit]
    >;
    const firstBody = JSON.parse(fetchCalls[0][1].body as string) as {
      headers: { idempotencyKey: string };
    };
    const secondBody = JSON.parse(fetchCalls[1][1].body as string) as {
      headers: { idempotencyKey: string };
    };
    expect(secondBody.headers.idempotencyKey).toBe(
      firstBody.headers.idempotencyKey,
    );
  });

  it('does not retry permanent 4xx errors', async () => {
    fetchMock.mockResolvedValue(
      Response.json(
        { code: 'invalid_parameter', message: 'Invalid request' },
        { status: 400 },
      ),
    );

    await expect(
      service.sendEmail({
        to: 'invalid@example.com',
        subject: 'Asunto',
        html: '<p>Contenido</p>',
      }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects an SMTP key before making a Brevo API request', async () => {
    const configService = {
      get: jest.fn(
        (key: string) =>
          ({
            ...values,
            BREVO_API_KEY: 'xsmtpsib-this-is-an-smtp-key',
          })[key],
      ),
    } as unknown as ConfigService;
    const serviceWithSmtpKey = new MailService(configService);

    await expect(
      serviceWithSmtpKey.sendEmail({
        to: 'recipient@example.com',
        subject: 'Asunto',
        html: '<p>Contenido</p>',
      }),
    ).rejects.toThrow('BREVO_API_KEY contiene una clave SMTP');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('escapes user-controlled values in both templates', () => {
    const verificationHtml = verifyEmailTemplate({
      recipientName: '<script>alert(1)</script>',
      verificationUrl: 'https://example.com/?token=<unsafe>',
      code: '<87654321>',
      expirationMinutes: 60,
    });
    const resetHtml = resetPasswordTemplate({
      recipientName: '<b>Nombre</b>',
      code: '<123456>',
      resetUrl: 'https://example.com/reset?token=<unsafe>',
      expirationMinutes: 30,
    });

    expect(verificationHtml).not.toContain('<script>');
    expect(verificationHtml).toContain('&lt;script&gt;');
    expect(verificationHtml).toContain('token=&lt;unsafe&gt;');
    expect(verificationHtml).toContain('&lt;87654321&gt;');
    expect(resetHtml).not.toContain('<b>Nombre</b>');
    expect(resetHtml).toContain('&lt;b&gt;Nombre&lt;/b&gt;');
    expect(resetHtml).toContain('&lt;123456&gt;');
    expect(resetHtml).toContain('token=&lt;unsafe&gt;');
  });
});
