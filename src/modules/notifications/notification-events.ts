import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { NotificationCategory } from './notification.dto';

export const DEFAULT_PREFERENCES = {
  pushEnabled: true,
  system: true,
  offers: true,
  rentals: true,
};
export const DEFAULT_AUTOMATION = {
  rentalStatus: true,
  prescriptions: true,
  security: true,
};

export function allowsPush(
  preferences: typeof DEFAULT_PREFERENCES | null,
  category: string,
) {
  const current = preferences ?? DEFAULT_PREFERENCES;
  return (
    current.pushEnabled &&
    (category === 'OFFER'
      ? current.offers
      : category === 'RENTAL'
        ? current.rentals
        : current.system)
  );
}

export type NotificationEvent = {
  requestKey: string;
  source: string;
  category: NotificationCategory;
  title: string;
  body: string;
  destinationType: string;
  destinationId?: string;
  createdById?: number;
  payloadHash?: string;
};

// Called inside the business transaction: a rolled-back change cannot notify.
export async function persistNotification(
  tx: Prisma.TransactionClient,
  event: NotificationEvent,
  userIds: number[],
) {
  const campaign = await tx.notificationCampaign.create({ data: event });
  for (let offset = 0; offset < userIds.length; offset += 200) {
    const chunk = userIds.slice(offset, offset + 200);
    await tx.notificationRecipient.createMany({
      data: chunk.map((userId) => ({ campaignId: campaign.id, userId })),
    });
    const [recipients, subscriptions] = await Promise.all([
      tx.notificationRecipient.findMany({
        where: { campaignId: campaign.id, userId: { in: chunk } },
      }),
      tx.pushSubscription.findMany({
        where: { active: true, userId: { in: chunk } },
        include: { user: { select: { notificationPreference: true } } },
      }),
    ]);
    const recipientByUser = new Map(
      recipients.map((item) => [item.userId, item.id]),
    );
    const jobs = subscriptions
      .filter((item) =>
        allowsPush(item.user.notificationPreference, event.category),
      )
      .map((item) => ({
        recipientId: recipientByUser.get(item.userId)!,
        subscriptionId: item.id,
      }));
    if (jobs.length)
      await tx.pushDelivery.createMany({ data: jobs, skipDuplicates: true });
  }
  return campaign;
}

export async function persistAutomaticNotification(
  tx: Prisma.TransactionClient,
  automation: keyof typeof DEFAULT_AUTOMATION,
  userId: number,
  event: NotificationEvent,
) {
  const settings = await tx.notificationAutomation.findUnique({
    where: { id: 1 },
  });
  if (settings && !settings[automation]) return;
  const user = await tx.user.findFirst({
    where: { id: userId, rol: 'CLIENT', activo: true },
    select: { id: true },
  });
  if (!user) return;
  return persistNotification(tx, event, [user.id]);
}

export async function notifyRentalStatus(
  tx: Prisma.TransactionClient,
  rentalId: string,
  status: string,
) {
  const settings = await tx.notificationAutomation.findUnique({
    where: { id: 1 },
  });
  if (settings && !settings.rentalStatus) return;
  const rental = await tx.rentalRequest.findUniqueOrThrow({
    where: { id: rentalId },
    select: { userId: true, folio: true },
  });
  const labels: Record<string, string> = {
    PENDING: 'recibida',
    APPROVED: 'aprobada',
    REJECTED: 'rechazada',
    CANCELLED: 'cancelada',
    DELIVERED: 'entregada',
    RETURNED: 'devuelta',
  };
  return persistAutomaticNotification(tx, 'rentalStatus', rental.userId, {
    requestKey: `rental:${randomUUID()}`,
    source: 'RENTAL_STATUS',
    category: 'RENTAL',
    title: `Renta ${labels[status] ?? 'actualizada'}`,
    body: `Tu solicitud ${rental.folio ?? rentalId} fue ${labels[status] ?? 'actualizada'}. Consulta el detalle en tu cuenta.`,
    destinationType: 'RENTAL',
    destinationId: rentalId,
  });
}

export function notifySecurityChange(
  tx: Prisma.TransactionClient,
  userId: number,
  emailChanged: boolean,
) {
  return persistAutomaticNotification(tx, 'security', userId, {
    requestKey: `security:${randomUUID()}`,
    source: 'SECURITY',
    category: 'SYSTEM',
    title: emailChanged ? 'Cambio de correo' : 'Cambio de contraseña',
    body: 'Se actualizaron los datos de seguridad de tu cuenta CEMYDI. Si no lo solicitaste, contacta a soporte.',
    destinationType: 'ACCOUNT',
  });
}
