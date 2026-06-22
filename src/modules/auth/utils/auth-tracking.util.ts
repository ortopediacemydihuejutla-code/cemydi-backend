import { Prisma } from '@prisma/client';
import type { JwtPayloadWithExp } from '../types/auth.types';

export function resolveAuditName(correo: string) {
  const [localPart] = correo.split('@');
  if (!localPart) return 'Usuario desconocido';

  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

export function isMissingTrackingTableError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2021'
  );
}

export function hasTokenExpiration(value: unknown): value is JwtPayloadWithExp {
  return (
    typeof value === 'object' &&
    value !== null &&
    (!('exp' in value) || typeof (value as { exp?: unknown }).exp === 'number')
  );
}
