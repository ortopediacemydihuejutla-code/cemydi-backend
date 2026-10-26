// Provision local VAPID keys without printing private credentials.
const fs = require('node:fs');
const dotenv = require('dotenv');
const webPush = require('web-push');
const text = fs.readFileSync('.env', 'utf8');
const env = { ...dotenv.parse(text), ...process.env };
if (
  !['localhost', '127.0.0.1', '[::1]'].includes(
    new URL(env.DATABASE_URL).hostname,
  )
) {
  throw new Error(
    'This setup script only provisions the local development environment.',
  );
}
if (env.VAPID_PUBLIC_KEY?.trim() || env.VAPID_PRIVATE_KEY?.trim()) {
  if (
    !env.VAPID_PUBLIC_KEY?.trim() ||
    !env.VAPID_PRIVATE_KEY?.trim() ||
    !env.VAPID_SUBJECT?.trim()
  ) {
    throw new Error(
      'Complete the existing VAPID configuration without replacing its keys.',
    );
  }
  console.log('Web Push is already configured. Existing keys were preserved.');
} else {
  const sender = env.EMAIL_FROM?.trim();
  const subject =
    env.VAPID_SUBJECT?.trim() ||
    (sender && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sender)
      ? `mailto:${sender}`
      : null);
  if (!subject)
    throw new Error('Set EMAIL_FROM or VAPID_SUBJECT before generating keys.');
  const keys = webPush.generateVAPIDKeys();
  const retained = text.replace(
    /^\s*VAPID_(PUBLIC_KEY|PRIVATE_KEY|SUBJECT)\s*=.*(?:\r?\n|$)/gm,
    '',
  );
  fs.writeFileSync(
    '.env',
    `${retained.trimEnd()}\n\n# Local Web Push credentials: never commit this file.\nVAPID_PUBLIC_KEY="${keys.publicKey}"\nVAPID_PRIVATE_KEY="${keys.privateKey}"\nVAPID_SUBJECT="${subject}"\n`,
  );
  console.log(
    'Local Web Push configured. Private credentials were saved only to the ignored .env file.',
  );
}
