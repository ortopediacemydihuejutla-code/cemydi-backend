import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { AuthConfigService } from '../auth/services/auth-config.service';
import {
  generateNumericAuthCode,
  hashAuthCode,
  verifyAuthCode,
} from '../auth/utils/auth-crypto.util';
import { RentalDocumentsService } from '../rentals/rental-documents.service';
import {
  hasDeletionObligations,
  lockDeletionSubject,
} from './account-deletion-policy';

const INVALID_CODE = 'El código es inválido o expiró.';
const WAIT_MS = 60_000;

@Injectable()
export class AccountDeletionService {
  private readonly logger = new Logger(AccountDeletionService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: AuthConfigService,
    private readonly documents: RentalDocumentsService,
  ) {}

  async request(correo: string) {
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + this.config.passwordResetExpiresMinutes * 60_000,
    );
    const resendAt = new Date(now.getTime() + WAIT_MS);
    const response = {
      message:
        'Si existe una cuenta de cliente verificada, enviaremos un código a su correo.',
      resendAt: resendAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };
    const code = generateNumericAuthCode();
    const codeHash = await hashAuthCode(code);
    const account = await this.prisma.asAdmin().user.findFirst({
      where: {
        correo: { equals: correo.trim().toLowerCase(), mode: 'insensitive' },
        activo: true,
        rol: 'CLIENT',
        emailVerifiedAt: { not: null },
      },
    });
    if (!account) return response;
    const id = await this.prisma.asAdmin().$transaction(async (tx) => {
      await lockDeletionSubject(tx, account.id);
      const current = await tx.user.findUnique({ where: { id: account.id } });
      if (!current?.activo || current.correo !== account.correo) return null;
      const previous = await tx.accountDeletionRequest.findUnique({
        where: { subjectId: account.id },
      });
      if (
        previous &&
        (previous.completedAt ||
          previous.subjectCreatedAt.getTime() !== current.createdAt.getTime())
      )
        return null;
      if (previous?.resendAt && previous.resendAt > now) return null;
      const result = await tx.accountDeletionRequest.upsert({
        where: { subjectId: account.id },
        create: {
          userId: account.id,
          subjectId: account.id,
          subjectCreatedAt: account.createdAt,
          codeHash,
          codeExpiresAt: expiresAt,
          resendAt,
        },
        update: {
          codeHash,
          codeExpiresAt: expiresAt,
          resendAt,
          attemptCount: 0,
        },
      });
      return result.id;
    });
    if (!id) return response;
    try {
      await this.mail.sendEmail({
        to: account.correo,
        subject: 'Confirma la eliminación de tu cuenta CEMYDI',
        html: `<p>Solicitaste eliminar tu cuenta y datos de CEMYDI.</p><p>Código: <strong>${code}</strong>.</p><p>Vence en ${this.config.passwordResetExpiresMinutes} minutos. Si no lo solicitaste, ignora este mensaje.</p>`,
        text: `Código para eliminar tu cuenta CEMYDI: ${code}. Vence en ${this.config.passwordResetExpiresMinutes} minutos. Si no lo solicitaste, ignora este mensaje.`,
        tag: 'account-deletion',
      });
    } catch {
      await this.prisma.asAdmin().accountDeletionRequest.updateMany({
        where: { id, codeHash },
        data: { codeHash: null, codeExpiresAt: null },
      });
      throw new HttpException(
        'No pudimos enviar el código. Intenta más tarde.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return response;
  }

  async confirm(correo: string, codigo: string) {
    const account = await this.prisma.asAdmin().user.findFirst({
      where: {
        correo: { equals: correo.trim().toLowerCase(), mode: 'insensitive' },
        activo: true,
        rol: 'CLIENT',
        emailVerifiedAt: { not: null },
      },
    });
    if (!account) throw new BadRequestException(INVALID_CODE);
    // Return validation failure outside the transaction so attempt increments persist.
    const result = await this.prisma.asAdmin().$transaction(async (tx) => {
      await lockDeletionSubject(tx, account.id);
      const current = await tx.user.findUnique({ where: { id: account.id } });
      const request = await tx.accountDeletionRequest.findUnique({
        where: { subjectId: account.id },
      });
      if (
        !current?.activo ||
        current.correo !== account.correo ||
        !request?.codeHash ||
        request.subjectCreatedAt.getTime() !== current.createdAt.getTime() ||
        !request.codeExpiresAt ||
        request.codeExpiresAt <= new Date() ||
        request.attemptCount >= this.config.passwordResetMaxAttempts
      )
        return null;
      if (!(await verifyAuthCode(codigo, request.codeHash))) {
        await tx.accountDeletionRequest.update({
          where: { id: request.id },
          data: { attemptCount: { increment: 1 } },
        });
        return null;
      }
      const rentals = await tx.rentalRequest.findMany({
        where: { userId: account.id },
      });
      const waiting = rentals.some(hasDeletionObligations);
      return tx.accountDeletionRequest.update({
        where: { id: request.id },
        data: {
          confirmedAt: request.confirmedAt ?? new Date(),
          codeHash: null,
          codeExpiresAt: null,
          status: waiting ? 'WAITING_OBLIGATIONS' : 'PROCESSING',
          nextAttemptAt: new Date(),
        },
      });
    });
    if (!result) throw new BadRequestException(INVALID_CODE);
    return this.receipt(result);
  }

  async status(userId: number) {
    const result = await this.prisma
      .asAdmin()
      .accountDeletionRequest.findUnique({ where: { subjectId: userId } });
    const rentals = await this.prisma
      .asAdmin()
      .rentalRequest.findMany({ where: { userId } });
    return {
      request: result?.confirmedAt ? this.receipt(result) : null,
      pendingObligations: rentals.filter(hasDeletionObligations).length,
    };
  }

  private receipt(request: { id: string; status: string }) {
    return {
      id: request.id,
      status: request.status,
      message:
        request.status === 'WAITING_OBLIGATIONS'
          ? 'Solicitud registrada. Completa tus rentas, devoluciones y depósitos pendientes; después eliminaremos tu cuenta automáticamente. No podrás solicitar nuevas rentas.'
          : 'Solicitud confirmada. Eliminaremos tu cuenta, reseñas y documentos. El proceso puede tardar mientras verificamos la limpieza del almacenamiento.',
    };
  }

  async process(id: string) {
    const db = this.prisma.asAdmin();
    const located = await db.accountDeletionRequest.findUnique({
      where: { id },
    });
    if (!located?.userId || !located.confirmedAt || located.completedAt) return;
    const userId = located.userId;
    const ready = await db.$transaction(async (tx) => {
      await lockDeletionSubject(tx, userId);
      const request = await tx.accountDeletionRequest.findUnique({
        where: { id },
      });
      if (
        !request?.userId ||
        request.completedAt ||
        (request.leaseUntil && request.leaseUntil > new Date())
      )
        return false;
      const subject = await tx.user.findUnique({ where: { id: userId } });
      if (
        !subject ||
        request.userId !== userId ||
        request.subjectCreatedAt.getTime() !== subject.createdAt.getTime()
      ) {
        await tx.accountDeletionRequest.update({
          where: { id },
          data: {
            errorCode: 'SUBJECT_MISMATCH',
            nextAttemptAt: new Date(Date.now() + 5 * WAIT_MS),
          },
        });
        return false;
      }
      const rentals = await tx.rentalRequest.findMany({ where: { userId } });
      if (rentals.some(hasDeletionObligations)) {
        await tx.accountDeletionRequest.update({
          where: { id },
          data: {
            status: 'WAITING_OBLIGATIONS',
            nextAttemptAt: new Date(Date.now() + WAIT_MS),
          },
        });
        return false;
      }
      await tx.accountDeletionRequest.update({
        where: { id },
        data: {
          status: 'PROCESSING',
          leaseUntil: new Date(Date.now() + 5 * WAIT_MS),
        },
      });
      await tx.user.update({ where: { id: userId }, data: { activo: false } });
      await tx.userSession.updateMany({
        where: { userId },
        data: { endedAt: new Date(), refreshTokenHash: null },
      });
      await tx.pushSubscription.deleteMany({ where: { userId } });
      return true;
    });
    if (!ready) return;
    try {
      // DB records remain until every external asset deletion has been acknowledged.
      await this.documents.deleteAllAccountAssets(userId);
      await db.$transaction(async (tx) => {
        await lockDeletionSubject(tx, userId);
        const account = await tx.user.findUnique({ where: { id: userId } });
        if (!account) return;
        if (account.createdAt.getTime() !== located.subjectCreatedAt.getTime())
          throw new BadRequestException('La identidad de la cuenta cambió.');
        const rentals = await tx.rentalRequest.findMany({
          where: { userId },
          select: { id: true },
        });
        const rentalIds = rentals.map((r) => r.id);
        await tx.rentalStatusHistory.updateMany({
          where: { rentalRequestId: { in: rentalIds } },
          data: { note: null },
        });
        await tx.rentalRequestItem.updateMany({
          where: { rentalRequestId: { in: rentalIds } },
          data: { notes: null },
        });
        await tx.rentalRequest.updateMany({
          where: { userId },
          data: {
            userId: null,
            applicantName: null,
            applicantEmail: null,
            applicantPhone: null,
            patientName: null,
            patientRelationship: null,
            deliveryAddress: null,
            deliveryNeighborhood: null,
            deliveryPostalCode: null,
            deliveryMunicipality: null,
            deliveryReferences: null,
            preferredSchedule: null,
            notes: null,
            depositNotes: null,
            rejectedReason: null,
          },
        });
        await tx.loginAttempt.deleteMany({
          where: {
            OR: [
              { userId },
              { correo: { equals: account.correo, mode: 'insensitive' } },
            ],
          },
        });
        await tx.securityNotice.deleteMany({ where: { userId } });
        await tx.rentalDocument.deleteMany({ where: { userId } });
        await tx.accountDeletionRequest.update({
          where: { id },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(),
            codeHash: null,
            codeExpiresAt: null,
            leaseUntil: null,
            errorCode: null,
          },
        });
        // Cascades now remove only account data; rental history has been detached and scrubbed.
        await tx.user.delete({ where: { id: userId } });
      });
    } catch {
      this.logger.warn(`Eliminación ${id} pendiente de reintento de limpieza.`);
      await db.accountDeletionRequest.updateMany({
        where: { id, completedAt: null },
        data: {
          leaseUntil: null,
          nextAttemptAt: new Date(Date.now() + 5 * WAIT_MS),
          errorCode: 'CLEANUP_RETRY',
        },
      });
    }
  }
}
