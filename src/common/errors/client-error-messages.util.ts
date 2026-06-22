import { HttpStatus } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';

export const RATE_LIMIT_CLIENT_MESSAGE =
  'Demasiados intentos. Espera un momento e inténtalo de nuevo.';

const FIELD_LABELS: Record<string, string> = {
  correo: 'El correo',
  password: 'La contraseña',
  newPassword: 'La nueva contraseña',
  nombre: 'El nombre',
  codigo: 'El código',
  token: 'El token',
  telefono: 'El teléfono',
  direccion: 'La dirección',
  comment: 'El comentario',
  descripcion: 'La descripción',
};

export function isRateLimitMessage(message: string | string[]) {
  const text = normalizeMessage(message);
  return /ThrottlerException/i.test(text) || /Too Many Requests/i.test(text);
}

export function localizeClientMessage(input: {
  statusCode: number;
  message: string | string[];
  errorName?: string;
  exception?: unknown;
}) {
  if (
    input.exception instanceof ThrottlerException ||
    input.statusCode === HttpStatus.TOO_MANY_REQUESTS ||
    isRateLimitMessage(input.message)
  ) {
    return RATE_LIMIT_CLIENT_MESSAGE;
  }

  if (Array.isArray(input.message)) {
    return input.message.map(localizeValidationMessage);
  }

  return localizeValidationMessage(String(input.message));
}

export function localizeErrorName(errorName?: string) {
  if (!errorName) return errorName;

  const map: Record<string, string> = {
    'Bad Request': 'Solicitud inválida',
    Unauthorized: 'No autorizado',
    Forbidden: 'Acceso denegado',
    'Not Found': 'No encontrado',
    'Too Many Requests': 'Demasiadas solicitudes',
    'Internal Server Error': 'Error interno del servidor',
    ThrottlerException: 'Demasiadas solicitudes',
  };

  return map[errorName] ?? errorName;
}

export function localizeValidationMessage(raw: string) {
  const trimmed = raw.trim();

  if (!trimmed) {
    return trimmed;
  }

  if (isRateLimitMessage(trimmed)) {
    return RATE_LIMIT_CLIENT_MESSAGE;
  }

  const propertyMatch = trimmed.match(/^property (.+) should not exist$/i);
  if (propertyMatch) {
    return `La propiedad "${propertyMatch[1]}" no está permitida`;
  }

  const fieldMatch = trimmed.match(/^(\w+)\s+(.+)$/);
  const fieldKey = fieldMatch?.[1] ?? '';
  const rule = fieldMatch?.[2] ?? trimmed;
  const fieldLabel = FIELD_LABELS[fieldKey] ?? `El campo "${fieldKey}"`;

  const ruleTranslations: Array<[RegExp, string]> = [
    [/^must be an email$/i, 'debe ser un correo electrónico válido'],
    [/^must not be empty$/i, 'no debe estar vacío'],
    [/^should not be empty$/i, 'no debe estar vacío'],
    [
      /^must be longer than or equal to (\d+) characters?$/i,
      'debe tener al menos $1 caracteres',
    ],
    [
      /^must be shorter than or equal to (\d+) characters?$/i,
      'debe tener como máximo $1 caracteres',
    ],
    [/^must be a string$/i, 'debe ser texto'],
    [/^must be an integer number$/i, 'debe ser un número entero'],
    [/^must be a positive number$/i, 'debe ser un número positivo'],
    [/^must be a boolean value$/i, 'debe ser verdadero o falso'],
  ];

  for (const [pattern, template] of ruleTranslations) {
    const match = rule.match(pattern);
    if (!match) continue;

    const translatedRule = template.replace(
      /\$(\d+)/g,
      (_, index: string) => match[Number(index)] ?? '',
    );

    return fieldMatch ? `${fieldLabel} ${translatedRule}` : translatedRule;
  }

  return trimmed;
}

function normalizeMessage(message: string | string[]) {
  return Array.isArray(message) ? message.join(' ') : message;
}
