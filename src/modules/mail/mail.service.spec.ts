import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';
import { resetPasswordTemplate } from './templates/reset-password.template';
import { verifyEmailTemplate } from './templates/verify-email.template';

describe('MailService', () => {
  const values: Record<string, string> = {
    BREVO_API_KEY: 'test-api-key',
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
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    const requestHeaders = request.headers as Record<string, string>;
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(request.method).toBe('POST');
    expect(requestHeaders).toMatchObject({
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'api-key': 'test-api-key',
    });
    expect(requestHeaders.idempotencyKey).toEqual(expect.any(String));
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
    });
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
    const firstHeaders = fetchCalls[0][1].headers as Record<string, string>;
    const secondHeaders = fetchCalls[1][1].headers as Record<string, string>;
    expect(secondHeaders.idempotencyKey).toBe(firstHeaders.idempotencyKey);
  });

  it('does not retry permanent 4xx errors', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 400 }));

    await expect(
      service.sendEmail({
        to: 'invalid@example.com',
        subject: 'Asunto',
        html: '<p>Contenido</p>',
      }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('escapes user-controlled values in both templates', () => {
    const verificationHtml = verifyEmailTemplate({
      recipientName: '<script>alert(1)</script>',
      verificationUrl: 'https://example.com/?token=<unsafe>',
      expirationMinutes: 60,
    });
    const resetHtml = resetPasswordTemplate({
      recipientName: '<b>Nombre</b>',
      code: '<123456>',
      expirationMinutes: 30,
    });

    expect(verificationHtml).not.toContain('<script>');
    expect(verificationHtml).toContain('&lt;script&gt;');
    expect(verificationHtml).toContain('token=&lt;unsafe&gt;');
    expect(resetHtml).not.toContain('<b>Nombre</b>');
    expect(resetHtml).toContain('&lt;b&gt;Nombre&lt;/b&gt;');
    expect(resetHtml).toContain('&lt;123456&gt;');
  });
});
