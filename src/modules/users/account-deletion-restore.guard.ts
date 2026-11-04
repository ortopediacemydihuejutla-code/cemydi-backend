import { CanActivate, ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AccountDeletionRestoreGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}
  async canActivate() {
    const deletion = await this.prisma
      .asAdmin()
      .accountDeletionRequest.findFirst({
        where: { confirmedAt: { not: null } },
        select: { id: true },
      });
    if (deletion)
      throw new ConflictException(
        'Este respaldo no puede restaurarse directamente: existen solicitudes de eliminación. Se requiere una restauración aislada que reaplique las eliminaciones antes de habilitar el servicio.',
      );
    return true;
  }
}
