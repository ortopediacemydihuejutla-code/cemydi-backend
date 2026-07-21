export const AUTH_ACCESS_COOKIE = 'cemydi_access';
export const AUTH_REFRESH_COOKIE = 'cemydi_refresh';
export const AUTH_CSRF_COOKIE = 'cemydi_csrf';
export const AUTH_CSRF_HEADER = 'x-csrf-token';

export const LOGIN_LOCKOUT_REASONS = [
  'INVALID_PASSWORD',
  'USER_NOT_FOUND',
] as const;

export const REGISTER_PUBLIC_RESPONSE = {
  message: 'Si la solicitud es válida, recibirás instrucciones por correo.',
} as const;

export const RESEND_VERIFICATION_RESPONSE = {
  message:
    'Si la cuenta existe y requiere verificación, enviaremos un correo con instrucciones.',
} as const;

export const PASSWORD_RESET_PUBLIC_RESPONSE = {
  message:
    'Si el correo está registrado, recibirás instrucciones para restablecer tu contraseña.',
} as const;

function authThrottleLimit(productionLimit: number, developmentLimit: number) {
  return process.env.NODE_ENV === 'production'
    ? productionLimit
    : developmentLimit;
}

export const AUTH_REGISTER_THROTTLE = {
  default: { limit: authThrottleLimit(5, 30), ttl: 60_000 },
} as const;

export const AUTH_LOGIN_THROTTLE = {
  default: { limit: authThrottleLimit(5, 30), ttl: 60_000 },
} as const;

export const AUTH_EMAIL_VERIFICATION_SEND_THROTTLE = {
  default: { limit: authThrottleLimit(3, 20), ttl: 15 * 60_000 },
} as const;

export const AUTH_EMAIL_VERIFICATION_CONFIRM_THROTTLE = {
  default: { limit: authThrottleLimit(10, 40), ttl: 60_000 },
} as const;

export const AUTH_PASSWORD_RESET_REQUEST_THROTTLE = {
  default: { limit: authThrottleLimit(3, 20), ttl: 15 * 60_000 },
} as const;

export const AUTH_PASSWORD_RESET_VERIFY_CODE_THROTTLE = {
  default: { limit: authThrottleLimit(5, 30), ttl: 60_000 },
} as const;

export const AUTH_PASSWORD_RESET_CONFIRM_THROTTLE = {
  default: { limit: authThrottleLimit(5, 30), ttl: 60_000 },
} as const;

export const AUTH_REFRESH_THROTTLE = {
  default: { limit: authThrottleLimit(10, 60), ttl: 60_000 },
} as const;
