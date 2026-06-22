import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { AuthUser } from '../../modules/auth/types/auth-user.interface';

export function assertAdmin(user?: AuthUser) {
  if (!user) {
    throw new UnauthorizedException('No autenticado');
  }

  if (user.rol !== 'ADMIN') {
    throw new ForbiddenException('No tienes permisos de administrador');
  }
}
