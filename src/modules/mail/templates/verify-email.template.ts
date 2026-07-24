import { buildEmailShell, escapeHtml } from './template-helpers';

export function verifyEmailTemplate(input: {
  recipientName: string;
  verificationUrl: string;
  code: string;
  expirationMinutes: number;
}) {
  const name = escapeHtml(input.recipientName);
  const url = escapeHtml(input.verificationUrl);
  const code = escapeHtml(input.code);

  return buildEmailShell({
    preheader:
      'Un último paso: confirma tu correo y activa tu cuenta de CEMYDI.',
    eyebrow: 'Activación de cuenta',
    title: 'Verifica tu correo electrónico',
    content: `
      <p style="margin:0 0 13px;color:#202938;font-size:16px;font-weight:700;line-height:1.6;">Hola ${name},</p>
      <p style="margin:0 0 24px;color:#505968;font-size:15px;line-height:1.75;">Gracias por crear tu cuenta. Puedes confirmar tu correo con el código o abrir el enlace directo.</p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 22px;border:1px solid #d9e8e6;border-radius:12px;background:#eff7f6;">
        <tr>
          <td align="center" style="padding:20px 16px 7px;color:#5f7472;font-size:10px;font-weight:700;letter-spacing:1.7px;text-transform:uppercase;">Código de verificación</td>
        </tr>
        <tr>
          <td align="center" style="padding:0 16px 21px;color:#1e6260;font-family:Consolas,'Courier New',monospace;font-size:30px;font-weight:700;line-height:1.3;letter-spacing:7px;white-space:nowrap;mso-line-height-rule:exactly;">${code}</td>
        </tr>
      </table>
      <p style="margin:0 0 12px;color:#697180;font-size:12px;line-height:1.6;">¿Prefieres continuar directamente?</p>
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 28px;">
        <tr>
          <td align="center" bgcolor="#1e6260" style="border-radius:10px;background:#1e6260;box-shadow:0 4px 10px rgba(30,98,96,0.18);mso-padding-alt:14px 24px;">
            <a class="email-button" href="${url}" style="display:inline-block;padding:14px 24px;color:#ffffff;font-size:14px;font-weight:700;line-height:1.4;text-decoration:none;letter-spacing:0.1px;mso-line-height-rule:exactly;">Verificar mi correo&nbsp;&nbsp;→</a>
          </td>
        </tr>
      </table>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 25px;border-top:1px solid #e7e4dd;border-bottom:1px solid #e7e4dd;">
        <tr>
          <td style="padding:13px 0;color:#697180;font-size:12px;line-height:1.5;">Vigencia de ambas opciones</td>
          <td align="right" style="padding:13px 0;color:#202938;font-size:12px;font-weight:700;line-height:1.5;">${input.expirationMinutes} minutos · Un solo uso</td>
        </tr>
      </table>
      <p style="margin:0 0 7px;color:#697180;font-size:12px;line-height:1.6;">Si el botón no funciona, copia y pega este enlace en tu navegador:</p>
      <p style="margin:0 0 25px;word-break:break-all;color:#1e6260;font-size:11px;line-height:1.65;"><a href="${url}" style="color:#1e6260;text-decoration:underline;">${url}</a></p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
        <tr>
          <td style="width:3px;background:#c7a76b;font-size:0;line-height:0;">&nbsp;</td>
          <td style="padding:2px 0 2px 13px;color:#697180;font-size:12px;line-height:1.65;">Si no creaste una cuenta en CEMYDI, puedes ignorar este mensaje con tranquilidad.</td>
        </tr>
      </table>
    `,
  });
}
