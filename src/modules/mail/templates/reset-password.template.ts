import { buildEmailShell, escapeHtml } from './template-helpers';

export function resetPasswordTemplate(input: {
  recipientName: string;
  code: string;
  resetUrl: string;
  expirationMinutes: number;
}) {
  const name = escapeHtml(input.recipientName);
  const code = escapeHtml(input.code);
  const resetUrl = escapeHtml(input.resetUrl);

  return buildEmailShell({
    preheader: 'Tu código temporal para restablecer la contraseña de CEMYDI.',
    eyebrow: 'Solicitud de seguridad',
    title: 'Restablece tu contraseña',
    content: `
      <p style="margin:0 0 13px;color:#202938;font-size:16px;font-weight:700;line-height:1.6;">Hola ${name},</p>
      <p style="margin:0 0 24px;color:#505968;font-size:15px;line-height:1.75;">Recibimos una solicitud para cambiar la contraseña de tu cuenta. Usa el código o abre el enlace directo.</p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 22px;border:1px solid #d9e8e6;border-radius:12px;background:#eff7f6;">
        <tr>
          <td align="center" style="padding:23px 16px 8px;color:#777f8b;font-size:10px;font-weight:700;letter-spacing:1.7px;text-transform:uppercase;">Código de recuperación</td>
        </tr>
        <tr>
          <td align="center" style="padding:0 16px 23px;color:#1e6260;font-family:Consolas,'Courier New',monospace;font-size:32px;font-weight:700;line-height:1.3;letter-spacing:8px;white-space:nowrap;mso-line-height-rule:exactly;">${code}</td>
        </tr>
      </table>
      <p style="margin:0 0 12px;color:#697180;font-size:12px;line-height:1.6;">¿Prefieres continuar directamente?</p>
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 26px;">
        <tr>
          <td align="center" bgcolor="#1e6260" style="border-radius:10px;background:#1e6260;box-shadow:0 4px 10px rgba(30,98,96,0.18);mso-padding-alt:14px 24px;">
            <a class="email-button" href="${resetUrl}" style="display:inline-block;padding:14px 24px;color:#ffffff;font-size:14px;font-weight:700;line-height:1.4;text-decoration:none;letter-spacing:0.1px;mso-line-height-rule:exactly;">Crear nueva contraseña&nbsp;&nbsp;→</a>
          </td>
        </tr>
      </table>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 25px;">
        <tr>
          <td style="color:#697180;font-size:12px;line-height:1.5;">Vigencia de ambas opciones</td>
          <td align="right" style="color:#202938;font-size:12px;font-weight:700;line-height:1.5;">${input.expirationMinutes} minutos · Un solo uso</td>
        </tr>
      </table>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
        <tr>
          <td style="width:3px;background:#c7a76b;font-size:0;line-height:0;">&nbsp;</td>
          <td style="padding:2px 0 2px 13px;color:#697180;font-size:12px;line-height:1.65;">Si no solicitaste este cambio, ignora el mensaje. Tu contraseña actual seguirá funcionando y no se modificará.</td>
        </tr>
      </table>
      <p style="margin:22px 0 6px;color:#697180;font-size:12px;line-height:1.6;">Si el botón no funciona, copia y pega este enlace:</p>
      <p style="margin:0;word-break:break-all;color:#1e6260;font-size:11px;line-height:1.65;"><a href="${resetUrl}" style="color:#1e6260;text-decoration:underline;">${resetUrl}</a></p>
    `,
  });
}
