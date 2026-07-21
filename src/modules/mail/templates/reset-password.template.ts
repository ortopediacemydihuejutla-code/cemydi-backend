import { buildEmailShell, escapeHtml } from './template-helpers';

export function resetPasswordTemplate(input: {
  recipientName: string;
  code: string;
  expirationMinutes: number;
}) {
  const name = escapeHtml(input.recipientName);
  const code = escapeHtml(input.code);

  return buildEmailShell({
    preheader: 'Tu código temporal para restablecer la contraseña de CEMYDI.',
    eyebrow: 'Solicitud de seguridad',
    title: 'Restablece tu contraseña',
    content: `
      <p style="margin:0 0 13px;color:#202938;font-size:16px;font-weight:700;line-height:1.6;">Hola ${name},</p>
      <p style="margin:0 0 25px;color:#505968;font-size:15px;line-height:1.75;">Recibimos una solicitud para cambiar la contraseña de tu cuenta. Ingresa el siguiente código en CEMYDI para continuar:</p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px;border-top:1px solid #dfe2e5;border-bottom:1px solid #dfe2e5;background:#f6f7f7;">
        <tr>
          <td align="center" style="padding:23px 16px 8px;color:#777f8b;font-size:10px;font-weight:700;letter-spacing:1.7px;text-transform:uppercase;">Código de recuperación</td>
        </tr>
        <tr>
          <td align="center" style="padding:0 16px 23px;color:#172033;font-family:Consolas,'Courier New',monospace;font-size:32px;font-weight:700;line-height:1.3;letter-spacing:8px;">${code}</td>
        </tr>
      </table>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 25px;">
        <tr>
          <td style="color:#697180;font-size:12px;line-height:1.5;">Vigencia del código</td>
          <td align="right" style="color:#202938;font-size:12px;font-weight:700;line-height:1.5;">${input.expirationMinutes} minutos · Un solo uso</td>
        </tr>
      </table>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
        <tr>
          <td style="width:3px;background:#dfbd7d;font-size:0;line-height:0;">&nbsp;</td>
          <td style="padding:2px 0 2px 13px;color:#697180;font-size:12px;line-height:1.65;">Si no solicitaste este cambio, ignora el mensaje. Tu contraseña actual seguirá funcionando y no se modificará.</td>
        </tr>
      </table>
    `,
  });
}
