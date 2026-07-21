export function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function buildEmailShell(input: {
  preheader: string;
  eyebrow: string;
  title: string;
  content: string;
}) {
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="x-apple-disable-message-reformatting">
    <meta name="color-scheme" content="light only">
    <meta name="supported-color-schemes" content="light only">
    <title>${escapeHtml(input.title)}</title>
    <style>
      @media only screen and (max-width: 620px) {
        .email-frame { padding: 18px 10px !important; }
        .email-header { padding: 22px 22px !important; }
        .email-body { padding: 30px 22px 32px !important; }
        .email-footer { padding: 20px 22px !important; }
        .email-title { font-size: 27px !important; line-height: 1.2 !important; }
        .email-button { display: block !important; text-align: center !important; }
        .brand-context { display: none !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background:#f3f1ec;color:#202938;font-family:Arial,Helvetica,sans-serif;-webkit-font-smoothing:antialiased;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${escapeHtml(input.preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f3f1ec;">
      <tr>
        <td class="email-frame" align="center" style="padding:34px 12px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:620px;background:#ffffff;border:1px solid #dedbd4;border-radius:18px;overflow:hidden;border-collapse:separate;box-shadow:0 8px 24px rgba(23,32,51,0.06);">
            <tr>
              <td class="email-header" style="padding:24px 32px;background:#172033;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td valign="middle">
                      <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                        <tr>
                          <td style="width:34px;height:34px;border:1px solid #dfbd7d;border-radius:9px;text-align:center;color:#dfbd7d;font-size:17px;font-weight:700;line-height:34px;">C</td>
                          <td style="padding-left:11px;color:#ffffff;font-size:16px;font-weight:700;letter-spacing:1.7px;">CEMYDI</td>
                        </tr>
                      </table>
                    </td>
                    <td class="brand-context" align="right" valign="middle" style="color:#b8c0ce;font-size:11px;letter-spacing:1px;text-transform:uppercase;">Cuenta y seguridad</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td class="email-body" style="padding:38px 38px 40px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 17px;">
                  <tr>
                    <td style="width:7px;height:7px;border-radius:50%;background:#2d747b;font-size:0;line-height:0;">&nbsp;</td>
                    <td style="padding-left:9px;color:#2d747b;font-size:11px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;">${escapeHtml(input.eyebrow)}</td>
                  </tr>
                </table>
                <h1 class="email-title" style="margin:0 0 26px;color:#172033;font-size:31px;line-height:1.2;font-weight:700;letter-spacing:-0.5px;">${escapeHtml(input.title)}</h1>
                ${input.content}
              </td>
            </tr>
            <tr>
              <td class="email-footer" style="border-top:1px solid #ebe8e1;padding:22px 38px;background:#faf9f6;">
                <p style="margin:0 0 5px;color:#40495a;font-size:12px;font-weight:700;line-height:1.5;">Protegemos el acceso a tu cuenta</p>
                <p style="margin:0;color:#78808d;font-size:11px;line-height:1.6;">CEMYDI nunca te pedirá tu contraseña por correo. Este es un mensaje automático; por favor, no respondas.</p>
              </td>
            </tr>
          </table>
          <p style="margin:17px 0 0;color:#8a8f98;font-size:10px;line-height:1.5;">CEMYDI · Atención ortopédica y movilidad</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
