import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../auth/types/auth-user.interface';
import {
  NotificationAutomationDto,
  NotificationPreferencesDto,
  NotificationQueryDto,
  RegisterPushDto,
  SendNotificationDto,
  DestinationSearchDto,
} from './notification.dto';
import {
  DEFAULT_AUTOMATION,
  DEFAULT_PREFERENCES,
  persistNotification,
} from './notification-events';
import { validatePushSubscription } from './push-validation';

const PAGE_SIZE = 20;
const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async inbox(userId: number, query: NotificationQueryDto) {
    const page = query.page ?? 1;
    const where: Prisma.NotificationRecipientWhereInput = {
      userId,
      ...(query.category ? { campaign: { category: query.category } } : {}),
    };
    const [rows, total, unreadCount] = await this.prisma.$transaction([
      this.prisma.notificationRecipient.findMany({
        where,
        include: { campaign: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      this.prisma.notificationRecipient.count({ where }),
      this.prisma.notificationRecipient.count({
        where: { userId, readAt: null },
      }),
    ]);
    const idsFor = (type: string) => [
      ...new Set(
        rows
          .filter(
            ({ campaign }) =>
              campaign.category === 'OFFER' &&
              campaign.destinationType === type,
          )
          .map(({ campaign }) => Number(campaign.destinationId))
          .filter((id) => Number.isSafeInteger(id) && id > 0),
      ),
    ];
    const productIds = idsFor('PRODUCT');
    const promotionIds = idsFor('PROMOTION');
    const now = new Date();
    const [products, promotions]: [
      { id: number; images: { imageUrl: string }[] }[],
      { id: number; discountPercent: number }[],
    ] = await Promise.all([
      productIds.length
        ? this.prisma.product.findMany({
            where: { id: { in: productIds }, activo: true },
            select: {
              id: true,
              images: {
                orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
                take: 1,
                select: { imageUrl: true },
              },
            },
          })
        : [],
      promotionIds.length
        ? this.prisma.promotion.findMany({
            where: {
              id: { in: promotionIds },
              startAt: { lte: now },
              endAt: { gte: now },
            },
            select: { id: true, discountPercent: true },
          })
        : [],
    ]);
    const images = new Map(
      products.map(
        (product) => [product.id, product.images[0]?.imageUrl ?? null] as const,
      ),
    );
    const discounts = new Map(
      promotions.map(
        (promotion) => [promotion.id, promotion.discountPercent] as const,
      ),
    );
    return {
      items: rows.map(({ campaign, ...row }) => ({
        id: row.id,
        category: campaign.category,
        title: campaign.title,
        body: campaign.body,
        destinationType: campaign.destinationType,
        destinationId: campaign.destinationId,
        createdAt: row.createdAt,
        readAt: row.readAt,
        preview:
          campaign.category === 'OFFER'
            ? {
                imageUrl:
                  campaign.destinationType === 'PRODUCT'
                    ? (images.get(Number(campaign.destinationId)) ?? null)
                    : null,
                discountPercent:
                  campaign.destinationType === 'PROMOTION'
                    ? (discounts.get(Number(campaign.destinationId)) ?? null)
                    : null,
              }
            : null,
      })),
      total,
      unreadCount,
      page,
      pageSize: PAGE_SIZE,
    };
  }

  async markRead(userId: number, ids: string[]) {
    const readAt = new Date();
    await this.prisma.notificationRecipient.updateMany({
      where: { id: { in: ids }, userId, readAt: null },
      data: { readAt },
    });
    return { message: 'Notificaciones marcadas como leídas' };
  }

  async markAllRead(userId: number) {
    const readAt = new Date();
    await this.prisma.notificationRecipient.updateMany({
      where: { userId, readAt: null, createdAt: { lte: readAt } },
      data: { readAt },
    });
    return { message: 'Todas las notificaciones marcadas como leídas' };
  }

  async detail(userId: number, id: string) {
    const row = await this.prisma.notificationRecipient.findFirst({
      where: { id, userId },
      include: { campaign: true },
    });
    if (!row) throw new NotFoundException('Notificación no encontrada');
    return {
      item: {
        id: row.id,
        category: row.campaign.category,
        title: row.campaign.title,
        body: row.campaign.body,
        destinationType: row.campaign.destinationType,
        destinationId: row.campaign.destinationId,
        createdAt: row.createdAt,
        readAt: row.readAt,
      },
    };
  }

  async promotion(id: number) {
    const now = new Date();
    const row = await this.prisma.promotion.findFirst({
      where: { id, startAt: { lte: now }, endAt: { gte: now } },
      select: {
        id: true,
        descripcion: true,
        discountPercent: true,
        endAt: true,
        products: {
          where: { product: { activo: true } },
          select: { product: { select: { id: true, nombre: true } } },
        },
      },
    });
    if (!row)
      throw new NotFoundException('Esta promoción ya no está disponible');
    return {
      promotion: {
        id: row.id,
        description: row.descripcion,
        discountPercent: row.discountPercent,
        endAt: row.endAt,
        products: row.products.map((item) => item.product),
      },
    };
  }

  async preferences(userId: number) {
    const preferences = await this.prisma.notificationPreference.findUnique({
      where: { userId },
    });
    return {
      preferences: preferences
        ? {
            pushEnabled: preferences.pushEnabled,
            system: preferences.system,
            offers: preferences.offers,
            rentals: preferences.rentals,
          }
        : DEFAULT_PREFERENCES,
    };
  }

  async savePreferences(userId: number, dto: NotificationPreferencesDto) {
    await this.prisma.notificationPreference.upsert({
      where: { userId },
      create: { userId, ...dto },
      update: dto,
    });
    return this.preferences(userId);
  }

  async registerPush(user: AuthUser, dto: RegisterPushDto) {
    validatePushSubscription(dto);
    const data = {
      userId: user.id,
      sessionTokenId: user.sid,
      channel: dto.channel,
      endpoint: dto.endpoint,
      p256dh: dto.channel === 'WEB' ? dto.p256dh : null,
      auth: dto.channel === 'WEB' ? dto.auth : null,
      active: true,
    };
    const subscription = await this.prisma.pushSubscription.upsert({
      where: { identity: hash(dto.endpoint) },
      create: { identity: hash(dto.endpoint), ...data },
      update: data,
    });
    return { id: subscription.id };
  }

  async unregisterPush(userId: number, endpoint: string) {
    await this.prisma.pushSubscription.updateMany({
      where: { identity: hash(endpoint), userId },
      data: { active: false },
    });
    return { message: 'Notificaciones desactivadas en este dispositivo' };
  }

  async recipients(search = '') {
    const users = await this.prisma.user.findMany({
      where: {
        rol: 'CLIENT',
        activo: true,
        ...(search.trim()
          ? {
              OR: [
                { nombre: { contains: search.trim(), mode: 'insensitive' } },
                { correo: { contains: search.trim(), mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: { id: true, nombre: true, correo: true },
      orderBy: { nombre: 'asc' },
      take: 50,
    });
    return { users };
  }

  async destinations(query: DestinationSearchDto) {
    const search = query.search?.trim() ?? '';
    if (query.type === 'PRODUCT') {
      const rows = await this.prisma.product.findMany({
        where: {
          activo: true,
          ...(search
            ? { nombre: { contains: search, mode: 'insensitive' } }
            : {}),
        },
        select: { id: true, nombre: true },
        orderBy: { nombre: 'asc' },
        take: 30,
      });
      return {
        items: rows.map((row) => ({ id: String(row.id), label: row.nombre })),
      };
    }
    if (query.type === 'PROMOTION') {
      const rows = await this.prisma.promotion.findMany({
        where: {
          endAt: { gt: new Date() },
          ...(search
            ? { descripcion: { contains: search, mode: 'insensitive' } }
            : {}),
        },
        select: { id: true, descripcion: true, discountPercent: true },
        orderBy: { startAt: 'desc' },
        take: 30,
      });
      return {
        items: rows.map((row) => ({
          id: String(row.id),
          label: row.descripcion || `Promoción ${row.discountPercent}%`,
        })),
      };
    }
    if (!query.userId) return { items: [] };
    const rows = await this.prisma.rentalRequest.findMany({
      where: {
        userId: query.userId,
        ...(search ? { folio: { contains: search, mode: 'insensitive' } } : {}),
      },
      select: { id: true, folio: true },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    return {
      items: rows.map((row) => ({ id: row.id, label: row.folio ?? row.id })),
    };
  }

  async send(adminId: number, dto: SendNotificationDto) {
    const title = dto.title.trim();
    const body = dto.body.trim();
    if (title.length < 3 || body.length < 3)
      throw new BadRequestException('Escribe un título y mensaje válidos');
    if (dto.audience === 'SELECTED' && !dto.userIds?.length)
      throw new BadRequestException('Selecciona al menos un cliente');
    if (dto.audience === 'ALL' && dto.userIds?.length)
      throw new BadRequestException(
        'No combines todos los clientes con una selección',
      );
    const requestKey = `manual:${adminId}:${dto.requestId}`;
    const payloadHash = hash(
      JSON.stringify({
        ...dto,
        title,
        body,
        userIds: [...(dto.userIds ?? [])].sort((a, b) => a - b),
      }),
    );
    const existing = await this.prisma.notificationCampaign.findUnique({
      where: { requestKey },
    });
    if (existing) {
      if (existing.payloadHash !== payloadHash)
        throw new ConflictException(
          'Este envío ya fue utilizado con otro contenido',
        );
      return { id: existing.id, message: 'El envío ya fue registrado' };
    }
    try {
      const campaign = await this.prisma.$transaction(
        async (tx) => {
          const users = await tx.user.findMany({
            where: {
              rol: 'CLIENT',
              activo: true,
              ...(dto.audience === 'SELECTED'
                ? { id: { in: dto.userIds } }
                : {}),
            },
            select: { id: true },
          });
          if (
            !users.length ||
            (dto.audience === 'SELECTED' &&
              users.length !== dto.userIds!.length)
          ) {
            throw new BadRequestException(
              'Selecciona clientes registrados y activos',
            );
          }
          await this.validateDestination(
            tx,
            dto,
            users.map((user) => user.id),
          );
          return persistNotification(
            tx,
            {
              requestKey,
              payloadHash,
              createdById: adminId,
              source: 'MANUAL',
              category: dto.category,
              title,
              body,
              destinationType: dto.destinationType,
              destinationId: dto.destinationId,
            },
            users.map((user) => user.id),
          );
        },
        { timeout: 60000 },
      );
      return {
        id: campaign.id,
        message:
          'Envío registrado. Las notificaciones ya están en la bandeja y los push se están procesando.',
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const duplicate = await this.prisma.notificationCampaign.findUnique({
          where: { requestKey },
        });
        if (duplicate?.payloadHash === payloadHash)
          return { id: duplicate.id, message: 'El envío ya fue registrado' };
      }
      throw error;
    }
  }

  private async validateDestination(
    tx: Prisma.TransactionClient,
    dto: SendNotificationDto,
    userIds: number[],
  ) {
    const id = dto.destinationId;
    if (dto.destinationType === 'NONE' || dto.destinationType === 'ACCOUNT') {
      if (id)
        throw new BadRequestException('Este destino no requiere identificador');
      return;
    }
    if (!id)
      throw new BadRequestException('Indica el identificador del destino');
    if (dto.destinationType === 'RENTAL') {
      const rental = await tx.rentalRequest.findFirst({
        where: { id, userId: { in: userIds } },
        select: { userId: true },
      });
      if (!rental || userIds.length !== 1 || dto.audience !== 'SELECTED') {
        throw new BadRequestException(
          'Una renta solo puede enviarse a su propietario',
        );
      }
      return;
    }
    if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)))
      throw new BadRequestException('Identificador de destino inválido');
    const found =
      dto.destinationType === 'PRODUCT'
        ? await tx.product.findFirst({
            where: { id: Number(id), activo: true },
            select: { id: true },
          })
        : await tx.promotion.findUnique({
            where: { id: Number(id) },
            select: { id: true },
          });
    if (!found) throw new NotFoundException('Destino no encontrado');
  }

  async history(query: NotificationQueryDto) {
    const page = query.page ?? 1;
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.notificationCampaign.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: { _count: { select: { recipients: true } } },
      }),
      this.prisma.notificationCampaign.count(),
    ]);
    const counts = await this.prisma.pushDelivery.groupBy({
      by: ['status', 'recipientId'],
      where: { recipient: { campaignId: { in: rows.map((row) => row.id) } } },
      _count: true,
    });
    const recipients = await this.prisma.notificationRecipient.findMany({
      where: { campaignId: { in: rows.map((row) => row.id) } },
      select: { id: true, campaignId: true },
    });
    const campaignByRecipient = new Map(
      recipients.map((row) => [row.id, row.campaignId]),
    );
    return {
      items: rows.map((row) => {
        const pushes: Record<string, number> = {
          PENDING: 0,
          ACCEPTED: 0,
          DELIVERED: 0,
          FAILED: 0,
          SKIPPED: 0,
        };
        for (const count of counts)
          if (campaignByRecipient.get(count.recipientId) === row.id)
            pushes[count.status] = (pushes[count.status] ?? 0) + count._count;
        return {
          id: row.id,
          category: row.category,
          source: row.source,
          title: row.title,
          body: row.body,
          createdAt: row.createdAt,
          recipientCount: row._count.recipients,
          pushes,
        };
      }),
      total,
      page,
      pageSize: PAGE_SIZE,
    };
  }

  async automation() {
    const settings = await this.prisma.notificationAutomation.findUnique({
      where: { id: 1 },
    });
    return {
      settings: settings
        ? {
            rentalStatus: settings.rentalStatus,
            prescriptions: settings.prescriptions,
            security: settings.security,
          }
        : DEFAULT_AUTOMATION,
    };
  }

  async saveAutomation(dto: NotificationAutomationDto) {
    await this.prisma.notificationAutomation.upsert({
      where: { id: 1 },
      create: { id: 1, ...dto },
      update: dto,
    });
    return this.automation();
  }
}
