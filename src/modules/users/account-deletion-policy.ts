import { ConflictException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

export function hasDeletionObligations(rental: {
  status: string;
  depositTotal: number;
  depositStatus: string;
  deliveredAt: Date | null;
}) {
  return (
    ['PENDING', 'APPROVED', 'DELIVERED'].includes(rental.status) ||
    (rental.depositTotal > 0 &&
      rental.depositStatus === 'PENDING' &&
      (rental.status === 'RETURNED' || rental.deliveredAt !== null))
  );
}

export async function assertNoAccountDeletion(
  tx: Prisma.TransactionClient,
  userId: number,
) {
  const request = await tx.accountDeletionRequest.findUnique({
    where: { subjectId: userId },
    select: { confirmedAt: true },
  });
  if (request?.confirmedAt)
    throw new ConflictException(
      'Tienes una solicitud de eliminación de cuenta. Resuelve tus rentas pendientes antes de continuar.',
    );
}

export async function lockDeletionSubject(
  tx: Prisma.TransactionClient,
  userId: number,
) {
  // Same lock order as rental creation/upload: no new rental can race deletion.
  await tx.$queryRaw`SELECT 1::integer AS acquired FROM pg_advisory_xact_lock(73391, CAST(${userId} AS integer))`;
  await tx.$queryRaw`SELECT "id" FROM "accounts"."users" WHERE "id" = ${userId} FOR UPDATE`;
}
