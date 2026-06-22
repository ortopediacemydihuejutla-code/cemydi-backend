import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type LockQueryResult = Array<{ locked: boolean }>;
type UnlockQueryResult = Array<{ unlocked: boolean }>;

@Injectable()
export class PostgresAdvisoryLockService {
  private readonly logger = new Logger(PostgresAdvisoryLockService.name);
  private readonly maxLockHoldMs = 60 * 60 * 1000;
  private readonly maxLockWaitMs = 10_000;

  constructor(private readonly prisma: PrismaService) {}

  async tryLock(lockKey: number): Promise<boolean> {
    this.logger.debug(`Intentando obtener advisory lock ${lockKey}`);
    const rows = await this.prisma.$queryRaw<LockQueryResult>`
      SELECT pg_try_advisory_lock(${lockKey}) AS "locked"
    `;
    const locked = rows[0]?.locked === true;

    if (locked) {
      this.logger.debug(`Advisory lock ${lockKey} obtenido`);
    } else {
      this.logger.debug(`Advisory lock ${lockKey} no disponible`);
    }

    return locked;
  }

  async unlock(lockKey: number): Promise<void> {
    const rows = await this.prisma.$queryRaw<UnlockQueryResult>`
      SELECT pg_advisory_unlock(${lockKey}) AS "unlocked"
    `;
    const unlocked = rows[0]?.unlocked === true;

    if (unlocked) {
      this.logger.debug(`Advisory lock ${lockKey} liberado`);
      return;
    }

    this.logger.warn(
      `No se pudo liberar el advisory lock ${lockKey} con la conexion actual`,
    );
  }

  async runWithLock<T>(
    lockKey: number,
    callback: () => Promise<T>,
  ): Promise<T | null> {
    // Esta implementacion usa una transaccion interactiva de Prisma para fijar una
    // sesion de PostgreSQL mientras el callback se ejecuta. El advisory lock es de
    // sesion, asi que necesitamos que pg_try_advisory_lock(...) y el callback corran
    // sobre la misma conexion hasta ejecutar pg_advisory_unlock(...).
    //
    // Limitacion actual:
    // - Si el job tarda mucho, una conexion del pool queda ocupada durante toda la
    //   ejecucion.
    // - El timeout de la transaccion interactiva tambien aplica al tiempo total del
    //   callback protegido.
    //
    // Por ahora mantenemos esta estrategia porque el proyecto no declara el driver
    // `pg` como dependencia directa y no queremos introducir una dependencia nueva
    // ni cambiar el comportamiento operativo en este PR.
    //
    // Alternativas futuras:
    // - Usar una conexion dedicada con el driver `pg` solo para el advisory lock.
    // - Migrar a un claim transaccional por job cuando exista un mecanismo persistente
    //   compatible en base de datos.
    return this.prisma.$transaction(
      async (tx) => {
        const locked = await this.tryLockWithClient(tx, lockKey);
        if (!locked) {
          this.logger.debug(
            `Otra instancia ya posee el advisory lock ${lockKey}; se omite la ejecucion protegida`,
          );
          return null;
        }

        try {
          return await callback();
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Error desconocido';
          this.logger.error(
            `Fallo la ejecucion protegida por advisory lock ${lockKey}: ${message}`,
          );
          throw error;
        } finally {
          await this.unlockWithClient(tx, lockKey);
        }
      },
      {
        maxWait: this.maxLockWaitMs,
        timeout: this.maxLockHoldMs,
      },
    );
  }

  private async tryLockWithClient(
    client: Prisma.TransactionClient | PrismaClient,
    lockKey: number,
  ) {
    try {
      this.logger.debug(`Intentando obtener advisory lock ${lockKey}`);
      const rows = await client.$queryRaw<LockQueryResult>`
        SELECT pg_try_advisory_lock(${lockKey}) AS "locked"
      `;
      const locked = rows[0]?.locked === true;

      if (locked) {
        this.logger.debug(`Advisory lock ${lockKey} obtenido`);
      } else {
        this.logger.debug(`Advisory lock ${lockKey} no disponible`);
      }

      return locked;
    } catch (error) {
      throw this.wrapLockError(
        error,
        `No se pudo solicitar el advisory lock ${lockKey}`,
      );
    }
  }

  private async unlockWithClient(
    client: Prisma.TransactionClient | PrismaClient,
    lockKey: number,
  ) {
    try {
      const rows = await client.$queryRaw<UnlockQueryResult>`
        SELECT pg_advisory_unlock(${lockKey}) AS "unlocked"
      `;
      const unlocked = rows[0]?.unlocked === true;

      if (unlocked) {
        this.logger.debug(`Advisory lock ${lockKey} liberado`);
        return;
      }

      this.logger.warn(
        `La sesion no reporto liberacion del advisory lock ${lockKey}`,
      );
    } catch (error) {
      throw this.wrapLockError(
        error,
        `No se pudo liberar el advisory lock ${lockKey}`,
      );
    }
  }

  private wrapLockError(error: unknown, fallbackMessage: string) {
    if (error instanceof InternalServerErrorException) {
      return error;
    }

    if (error instanceof Error && error.message.trim()) {
      return new InternalServerErrorException(
        `${fallbackMessage}: ${error.message.trim()}`,
      );
    }

    return new InternalServerErrorException(fallbackMessage);
  }
}
