import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  CartItemMode,
  Prisma,
  RentalDepositStatus,
  RentalDeliveryMethod,
  RentalDocumentStatus,
  RentalRequestStatus,
  TipoAdquisicion,
} from '@prisma/client';
import {
  getDateOnlyToday,
  normalizeDateOnlyUtc,
} from '../../common/dates/date-only.util';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../auth/types/auth-user.interface';
import {
  calculateDiscountedPrice,
  getBestActivePromotion,
} from '../promotions/promotion-pricing.util';
import { CreateRentalFromCartDto } from './dto/create-rental-from-cart.dto';
import { UpdateRentalDepositDto } from './dto/update-rental-deposit.dto';
import {
  ListMyRentalsQueryDto,
  MyRentalFilter,
} from './dto/list-my-rentals-query.dto';
import { RentalDocumentsService } from './rental-documents.service';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const rentalInclude = {
  user: {
    select: {
      id: true,
      nombre: true,
      correo: true,
      telefono: true,
      direccion: true,
    },
  },
  approvedBy: {
    select: {
      id: true,
      nombre: true,
      correo: true,
    },
  },
  statusUpdatedBy: {
    select: {
      id: true,
      nombre: true,
      correo: true,
    },
  },
  depositResolvedBy: {
    select: {
      id: true,
      nombre: true,
      correo: true,
    },
  },
  statusHistory: {
    include: {
      actor: {
        select: {
          id: true,
          nombre: true,
          correo: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  },
  items: {
    include: {
      rentalDocument: {
        select: {
          id: true,
          originalFilename: true,
          mimeType: true,
          bytes: true,
          status: true,
          uploadedAt: true,
          associatedAt: true,
          reviewedAt: true,
          rejectionReason: true,
          reviewedBy: {
            select: {
              id: true,
              nombre: true,
              correo: true,
            },
          },
        },
      },
      product: {
        include: {
          images: {
            orderBy: { sortOrder: 'asc' },
          },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.RentalRequestInclude;

type RentalWithDetails = Prisma.RentalRequestGetPayload<{
  include: typeof rentalInclude;
}>;

type RentalDbClient = PrismaService | Prisma.TransactionClient;

@Injectable()
export class RentalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rentalDocuments: RentalDocumentsService,
  ) {}

  async listMine(currentUser: AuthUser, query: ListMyRentalsQueryDto = {}) {
    const db = this.prisma.forUser(currentUser);
    await this.assertActiveUser(db, currentUser.sub);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 8;
    const today = getDateOnlyToday();
    const dueSoonLimit = new Date(today.getTime() + 3 * MS_PER_DAY);
    const baseWhere: Prisma.RentalRequestWhereInput = {
      userId: currentUser.sub,
    };
    const documentationPending = this.documentationPendingWhere();
    const dueSoon = this.dueSoonWhere(today, dueSoonLimit);
    const where: Prisma.RentalRequestWhereInput = {
      ...baseWhere,
      ...this.myRentalFilterWhere(query.status, documentationPending, dueSoon),
      ...(query.search
        ? {
            OR: [
              { folio: { contains: query.search, mode: 'insensitive' } },
              {
                items: {
                  some: {
                    OR: [
                      {
                        productNameSnapshot: {
                          contains: query.search,
                          mode: 'insensitive',
                        },
                      },
                      {
                        productModelSnapshot: {
                          contains: query.search,
                          mode: 'insensitive',
                        },
                      },
                      {
                        productSkuSnapshot: {
                          contains: query.search,
                          mode: 'insensitive',
                        },
                      },
                      {
                        product: {
                          nombre: {
                            contains: query.search,
                            mode: 'insensitive',
                          },
                        },
                      },
                    ],
                  },
                },
              },
            ],
          }
        : {}),
    };

    const [
      rentals,
      total,
      pending,
      missingDocs,
      approved,
      active,
      nearDue,
      returned,
      rejected,
      cancelled,
    ] = await db.$transaction([
      db.rentalRequest.findMany({
        where,
        include: rentalInclude,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.rentalRequest.count({ where }),
      db.rentalRequest.count({
        where: { ...baseWhere, status: RentalRequestStatus.PENDING },
      }),
      db.rentalRequest.count({
        where: { ...baseWhere, ...documentationPending },
      }),
      db.rentalRequest.count({
        where: { ...baseWhere, status: RentalRequestStatus.APPROVED },
      }),
      db.rentalRequest.count({
        where: { ...baseWhere, status: RentalRequestStatus.DELIVERED },
      }),
      db.rentalRequest.count({ where: { ...baseWhere, ...dueSoon } }),
      db.rentalRequest.count({
        where: { ...baseWhere, status: RentalRequestStatus.RETURNED },
      }),
      db.rentalRequest.count({
        where: { ...baseWhere, status: RentalRequestStatus.REJECTED },
      }),
      db.rentalRequest.count({
        where: { ...baseWhere, status: RentalRequestStatus.CANCELLED },
      }),
    ]);

    return {
      rentals: rentals.map((rental) => this.mapRental(rental)),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
      counts: {
        all: pending + approved + active + returned + rejected + cancelled,
        pending,
        documentationPending: missingDocs,
        scheduled: approved,
        active,
        dueSoon: nearDue,
        finalized: returned,
        rejected,
        cancelled,
      },
    };
  }

  async getMine(currentUser: AuthUser, id: string) {
    const db = this.prisma.forUser(currentUser);
    await this.assertActiveUser(db, currentUser.sub);
    const rental = await db.rentalRequest.findFirst({
      where: { id, userId: currentUser.sub },
      include: rentalInclude,
    });

    if (!rental) {
      throw new NotFoundException('Solicitud de renta no encontrada');
    }

    return { rental: this.mapRental(rental) };
  }

  async createFromCart(currentUser: AuthUser, dto: CreateRentalFromCartDto) {
    const db = this.prisma.forUser(currentUser);
    const rental = await db.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ acquired: number }>>`
        SELECT 1::integer AS acquired
        FROM pg_advisory_xact_lock(
          CAST(73391 AS integer),
          CAST(${currentUser.sub} AS integer)
        )
      `;
      await this.assertActiveUser(tx, currentUser.sub);
      const cart = await tx.shoppingCart.findUnique({
        where: { userId: currentUser.sub },
        include: {
          items: {
            where: { mode: CartItemMode.RENTA },
            include: {
              rentalDocument: true,
              product: {
                include: {
                  images: {
                    orderBy: { sortOrder: 'asc' },
                  },
                  promotionLinks: {
                    include: {
                      promotion: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      const rentalItems = cart?.items ?? [];
      if (rentalItems.length === 0) {
        throw new BadRequestException(
          'Agrega productos de renta al carrito antes de enviar la solicitud',
        );
      }

      const calculatedItems = rentalItems.map((item) => {
        const dates = this.assertRentalDates(
          item.rentalStartDate,
          item.rentalEndDate,
          item.product.rentalMinDays,
        );
        this.assertRentableProduct(item.product, item.quantity);
        if (item.product.requiereReceta && !item.rentalDocument) {
          throw new BadRequestException(
            `Adjunta receta en PDF o imagen para ${item.product.nombre}`,
          );
        }

        const activePromotion = getBestActivePromotion(
          item.product.promotionLinks.map((link) => link.promotion),
        );
        const rentalDailyPrice = item.product.rentalDailyPrice ?? 0;
        const effectiveDailyPrice = activePromotion
          ? calculateDiscountedPrice(
              rentalDailyPrice,
              activePromotion.discountPercent,
            )
          : rentalDailyPrice;

        return {
          item,
          ...this.calculateLine({
            quantity: item.quantity,
            startDate: dates.startDate,
            endDate: dates.endDate,
            dailyPrice: effectiveDailyPrice,
            deposit: item.product.rentalDeposit,
          }),
        };
      });

      const subtotal = this.roundMoney(
        calculatedItems.reduce((sum, item) => sum + item.lineSubtotal, 0),
      );
      const depositTotal = this.roundMoney(
        calculatedItems.reduce((sum, item) => sum + item.lineDeposit, 0),
      );
      const total = this.roundMoney(subtotal + depositTotal);
      const folio = await this.generateRentalFolio(tx);
      const acceptedAt = new Date();
      const isHomeDelivery =
        dto.deliveryMethod === RentalDeliveryMethod.HOME_DELIVERY;

      const request = await tx.rentalRequest.create({
        data: {
          folio,
          userId: currentUser.sub,
          subtotal,
          depositTotal,
          total,
          notes: this.optionalTrim(dto.generalNotes),
          applicantName: dto.applicantName.trim(),
          applicantEmail: dto.applicantEmail.trim().toLowerCase(),
          applicantPhone: dto.applicantPhone.trim(),
          isForAnotherPerson: dto.isForAnotherPerson,
          patientName: dto.isForAnotherPerson
            ? this.optionalTrim(dto.patientName)
            : null,
          patientRelationship: dto.isForAnotherPerson
            ? this.optionalTrim(
                dto.patientRelationship === 'Otro'
                  ? dto.patientRelationshipOther
                  : dto.patientRelationship,
              )
            : null,
          deliveryMethod: dto.deliveryMethod,
          deliveryAddress: isHomeDelivery
            ? this.optionalTrim(dto.deliveryAddress)
            : null,
          deliveryNeighborhood: isHomeDelivery
            ? this.optionalTrim(dto.deliveryNeighborhood)
            : null,
          deliveryPostalCode: isHomeDelivery
            ? this.optionalTrim(dto.deliveryPostalCode)
            : null,
          deliveryMunicipality: isHomeDelivery
            ? this.optionalTrim(dto.deliveryMunicipality)
            : null,
          deliveryReferences: isHomeDelivery
            ? this.optionalTrim(dto.deliveryReferences)
            : null,
          preferredSchedule: this.optionalTrim(dto.preferredSchedule),
          rentalTermsAcceptedAt: acceptedAt,
          privacyAcceptedAt: acceptedAt,
          statusUpdatedById: currentUser.sub,
          statusUpdatedAt: new Date(),
        },
        select: { id: true },
      });

      await this.recordStatusHistory(
        tx,
        request.id,
        null,
        RentalRequestStatus.PENDING,
        currentUser.sub,
        'Solicitud enviada desde el carrito',
      );

      for (const calculated of calculatedItems) {
        const requestItem = await tx.rentalRequestItem.create({
          data: {
            rentalRequestId: request.id,
            productId: calculated.item.productId,
            quantity: calculated.item.quantity,
            startDate: calculated.startDate,
            endDate: calculated.endDate,
            days: calculated.days,
            dailyPrice: calculated.dailyPrice,
            deposit: calculated.deposit,
            lineSubtotal: calculated.lineSubtotal,
            lineDeposit: calculated.lineDeposit,
            lineTotal: calculated.lineTotal,
            notes: calculated.item.rentalNotes?.trim() || null,
            productNameSnapshot: calculated.item.product.nombre,
            productBrandSnapshot: calculated.item.product.marca,
            productModelSnapshot:
              calculated.item.product.modelo?.trim() || null,
            productSkuSnapshot: `CEMYDI-${calculated.item.product.id}`,
            productImageSnapshot:
              calculated.item.product.images[0]?.imageUrl ?? null,
            productClassSnapshot: calculated.item.product.clasificacion,
            prescriptionRequiredSnapshot:
              calculated.item.product.requiereReceta,
          },
          select: { id: true },
        });
        if (calculated.item.rentalDocument) {
          await this.rentalDocuments.associateWithRentalItem(
            tx,
            currentUser.sub,
            calculated.item.id,
            requestItem.id,
            calculated.item.rentalDocument.id,
          );
        }
      }

      if (cart?.id) {
        await tx.shoppingCartItem.deleteMany({
          where: {
            cartId: cart.id,
            mode: CartItemMode.RENTA,
          },
        });

        await tx.shoppingCart.update({
          where: { id: cart.id },
          data: { updatedAt: new Date() },
        });
      }

      return tx.rentalRequest.findUniqueOrThrow({
        where: { id: request.id },
        include: rentalInclude,
      });
    });

    return {
      message:
        'Recibimos tu solicitud de renta. CEMYDI revisará la disponibilidad, los documentos y las condiciones de entrega antes de confirmarla.',
      rental: this.mapRental(rental),
    };
  }

  async cancelMine(currentUser: AuthUser, id: string) {
    const db = this.prisma.forUser(currentUser);
    const rental = await db.$transaction(async (tx) => {
      await this.assertActiveUser(tx, currentUser.sub);
      await this.lockRentalRequest(tx, id);
      const existing = await tx.rentalRequest.findFirst({
        where: { id, userId: currentUser.sub },
        include: rentalInclude,
      });

      if (!existing) {
        throw new NotFoundException('Solicitud de renta no encontrada');
      }

      if (existing.status !== RentalRequestStatus.PENDING) {
        throw new BadRequestException(
          'Solo puedes cancelar solicitudes pendientes',
        );
      }

      await this.recordStatusHistory(
        tx,
        id,
        existing.status,
        RentalRequestStatus.CANCELLED,
        currentUser.sub,
        'Cancelada por el cliente antes de aprobación',
      );

      return tx.rentalRequest.update({
        where: { id },
        data: {
          status: RentalRequestStatus.CANCELLED,
          cancelledAt: new Date(),
          statusUpdatedById: currentUser.sub,
          statusUpdatedAt: new Date(),
        },
        include: rentalInclude,
      });
    });

    return {
      message: 'Solicitud de renta cancelada',
      rental: this.mapRental(rental),
    };
  }

  async getPrescriptionDocument(currentUser: AuthUser, itemId: number) {
    const db = this.prisma.forUser(currentUser);
    if (!Number.isInteger(itemId) || itemId <= 0) {
      throw new NotFoundException('Receta no encontrada');
    }

    const item = await db.rentalRequestItem.findFirst({
      where:
        currentUser.rol === 'ADMIN'
          ? { id: itemId }
          : {
              id: itemId,
              rentalRequest: {
                userId: currentUser.sub,
              },
            },
      select: {
        rentalDocument: { select: { id: true } },
      },
    });

    if (!item) {
      throw new NotFoundException('Receta no encontrada');
    }

    if (!item.rentalDocument) {
      throw new NotFoundException('Esta renta no tiene receta adjunta');
    }

    return this.rentalDocuments.getAuthorizedContent(
      currentUser,
      item.rentalDocument.id,
      false,
    );
  }

  async listForAdmin(params: {
    status?: RentalRequestStatus;
    search?: string;
    page?: number;
    pageSize?: number;
  }) {
    const where: Prisma.RentalRequestWhereInput = {};
    const search = params.search?.trim();
    const pageSize =
      Number.isInteger(params.pageSize) && params.pageSize! > 0
        ? Math.min(params.pageSize!, 60)
        : 20;
    const requestedPage =
      Number.isInteger(params.page) && params.page! > 0 ? params.page! : 1;

    if (params.status) {
      where.status = params.status;
    }

    if (search) {
      where.OR = [
        { id: { contains: search, mode: 'insensitive' } },
        { folio: { contains: search, mode: 'insensitive' } },
        { user: { nombre: { contains: search, mode: 'insensitive' } } },
        { user: { correo: { contains: search, mode: 'insensitive' } } },
        {
          items: {
            some: {
              product: { nombre: { contains: search, mode: 'insensitive' } },
            },
          },
        },
      ];
    }

    const countWhere: Prisma.RentalRequestWhereInput = {};
    if (where.OR) {
      countWhere.OR = where.OR;
    }
    const [total, statusCounts] = await Promise.all([
      this.prisma.rentalRequest.count({ where }),
      this.prisma.rentalRequest.groupBy({
        by: ['status'],
        where: countWhere,
        _count: { _all: true },
      }),
    ]);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(requestedPage, totalPages);
    const rentals = await this.prisma.rentalRequest.findMany({
      where,
      include: rentalInclude,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    const counts = {
      total: statusCounts.reduce((sum, item) => sum + item._count._all, 0),
      PENDING: 0,
      APPROVED: 0,
      REJECTED: 0,
      CANCELLED: 0,
      DELIVERED: 0,
      RETURNED: 0,
    } satisfies Record<RentalRequestStatus, number> & { total: number };

    for (const item of statusCounts) {
      counts[item.status] = item._count._all;
    }

    return {
      rentals: rentals.map((rental) => this.mapRental(rental)),
      counts,
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
        hasPrevious: page > 1,
        hasNext: page < totalPages,
      },
    };
  }

  async approve(currentUser: AuthUser, id: string) {
    const rental = await this.prisma.$transaction(async (tx) => {
      await this.lockRentalRequest(tx, id);
      const existing = await tx.rentalRequest.findUnique({
        where: { id },
        include: rentalInclude,
      });

      if (!existing) {
        throw new NotFoundException('Solicitud de renta no encontrada');
      }

      this.assertStatus(existing.status, [RentalRequestStatus.PENDING]);

      for (const item of existing.items) {
        this.assertRentableProduct(item.product, item.quantity);
        this.assertRentalStillFuture(item.startDate);
        if (
          item.product.requiereReceta &&
          item.rentalDocument?.status !== RentalDocumentStatus.APROBADO
        ) {
          throw new BadRequestException(
            `La receta de ${item.product.nombre} debe estar aprobada`,
          );
        }
      }

      await this.recordStatusHistory(
        tx,
        id,
        existing.status,
        RentalRequestStatus.APPROVED,
        currentUser.sub,
        'Solicitud aprobada y existencias reservadas',
      );

      for (const item of this.orderInventoryItems(existing.items)) {
        const stockUpdate = await tx.product.updateMany({
          where: {
            id: item.productId,
            activo: true,
            stock: { gte: item.quantity },
            tipoAdquisicion: {
              in: [TipoAdquisicion.RENTA, TipoAdquisicion.MIXTO],
            },
            rentalDailyPrice: { gt: 0 },
          },
          data: {
            stock: { decrement: item.quantity },
          },
        });

        if (stockUpdate.count !== 1) {
          throw new BadRequestException(
            `Stock insuficiente para ${item.product.nombre}`,
          );
        }
      }

      return tx.rentalRequest.update({
        where: { id },
        data: {
          status: RentalRequestStatus.APPROVED,
          approvedById: currentUser.sub,
          approvedAt: new Date(),
          rejectedReason: null,
          rejectedAt: null,
          statusUpdatedById: currentUser.sub,
          statusUpdatedAt: new Date(),
        },
        include: rentalInclude,
      });
    });

    return {
      message: 'Solicitud de renta aprobada',
      rental: this.mapRental(rental),
    };
  }

  async reject(currentUser: AuthUser, id: string, reason?: string) {
    const rental = await this.prisma.$transaction(async (tx) => {
      await this.lockRentalRequest(tx, id);
      const existing = await tx.rentalRequest.findUnique({
        where: { id },
        select: { id: true, status: true },
      });

      if (!existing) {
        throw new NotFoundException('Solicitud de renta no encontrada');
      }

      this.assertStatus(existing.status, [RentalRequestStatus.PENDING]);

      await this.recordStatusHistory(
        tx,
        id,
        existing.status,
        RentalRequestStatus.REJECTED,
        currentUser.sub,
        reason?.trim() || 'Solicitud rechazada por administración',
      );

      return tx.rentalRequest.update({
        where: { id },
        data: {
          status: RentalRequestStatus.REJECTED,
          rejectedReason: reason?.trim() || null,
          rejectedAt: new Date(),
          statusUpdatedById: currentUser.sub,
          statusUpdatedAt: new Date(),
        },
        include: rentalInclude,
      });
    });

    return {
      message: 'Solicitud de renta rechazada',
      rental: this.mapRental(rental),
    };
  }

  async deliver(currentUser: AuthUser, id: string) {
    return this.transition(
      id,
      RentalRequestStatus.DELIVERED,
      [RentalRequestStatus.APPROVED],
      'Solicitud marcada como entregada',
      currentUser.sub,
      { deliveredAt: new Date() },
    );
  }

  async returnRental(currentUser: AuthUser, id: string) {
    const rental = await this.prisma.$transaction(async (tx) => {
      await this.lockRentalRequest(tx, id);
      const existing = await tx.rentalRequest.findUnique({
        where: { id },
        include: rentalInclude,
      });

      if (!existing) {
        throw new NotFoundException('Solicitud de renta no encontrada');
      }

      this.assertStatus(existing.status, [RentalRequestStatus.DELIVERED]);

      for (const item of this.orderInventoryItems(existing.items)) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } },
        });
      }

      await this.recordStatusHistory(
        tx,
        id,
        existing.status,
        RentalRequestStatus.RETURNED,
        currentUser.sub,
        'Producto devuelto y existencias reintegradas',
      );

      return tx.rentalRequest.update({
        where: { id },
        data: {
          status: RentalRequestStatus.RETURNED,
          returnedAt: new Date(),
          statusUpdatedById: currentUser.sub,
          statusUpdatedAt: new Date(),
        },
        include: rentalInclude,
      });
    });

    return {
      message: 'Solicitud marcada como devuelta',
      rental: this.mapRental(rental),
    };
  }

  async cancelApproved(currentUser: AuthUser, id: string) {
    const rental = await this.prisma.$transaction(async (tx) => {
      await this.lockRentalRequest(tx, id);
      const existing = await tx.rentalRequest.findUnique({
        where: { id },
        include: rentalInclude,
      });

      if (!existing) {
        throw new NotFoundException('Solicitud de renta no encontrada');
      }

      this.assertStatus(existing.status, [RentalRequestStatus.APPROVED]);

      for (const item of this.orderInventoryItems(existing.items)) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } },
        });
      }

      await this.recordStatusHistory(
        tx,
        id,
        existing.status,
        RentalRequestStatus.CANCELLED,
        currentUser.sub,
        'Cancelada antes de la entrega; existencias restauradas',
      );

      return tx.rentalRequest.update({
        where: { id },
        data: {
          status: RentalRequestStatus.CANCELLED,
          cancelledAt: new Date(),
          statusUpdatedById: currentUser.sub,
          statusUpdatedAt: new Date(),
        },
        include: rentalInclude,
      });
    });

    return {
      message: 'Solicitud aprobada cancelada y existencias restauradas',
      rental: this.mapRental(rental),
    };
  }

  async updateDeposit(
    currentUser: AuthUser,
    id: string,
    dto: UpdateRentalDepositDto,
  ) {
    const rental = await this.prisma.$transaction(async (tx) => {
      await this.lockRentalRequest(tx, id);
      const existing = await tx.rentalRequest.findUnique({
        where: { id },
        select: { id: true, status: true, depositTotal: true },
      });

      if (!existing) {
        throw new NotFoundException('Solicitud de renta no encontrada');
      }
      this.assertStatus(existing.status, [RentalRequestStatus.RETURNED]);

      const returnedAmount = this.roundMoney(dto.returnedAmount);
      const retainedAmount = this.roundMoney(dto.retainedAmount);
      const depositTotal = this.roundMoney(existing.depositTotal);
      if (
        Math.abs(
          this.roundMoney(returnedAmount + retainedAmount) - depositTotal,
        ) > 0.009
      ) {
        throw new BadRequestException(
          'La suma devuelta y retenida debe coincidir con el deposito total',
        );
      }
      if (
        dto.status === RentalDepositStatus.RETURNED &&
        (returnedAmount !== depositTotal || retainedAmount !== 0)
      ) {
        throw new BadRequestException(
          'Un deposito devuelto no puede tener monto retenido',
        );
      }
      if (
        dto.status === RentalDepositStatus.RETAINED &&
        (returnedAmount !== 0 || retainedAmount !== depositTotal)
      ) {
        throw new BadRequestException(
          'Un deposito retenido no puede tener monto devuelto',
        );
      }
      if (
        dto.status === RentalDepositStatus.PARTIALLY_RETAINED &&
        (returnedAmount <= 0 || retainedAmount <= 0)
      ) {
        throw new BadRequestException(
          'Una retencion parcial requiere montos devuelto y retenido mayores a cero',
        );
      }

      return tx.rentalRequest.update({
        where: { id },
        data: {
          depositStatus: dto.status,
          depositReturnedAmount: returnedAmount,
          depositRetainedAmount: retainedAmount,
          depositNotes: this.optionalTrim(dto.notes),
          depositResolvedAt: new Date(),
          depositResolvedById: currentUser.sub,
        },
        include: rentalInclude,
      });
    });

    return {
      message: 'Deposito actualizado',
      rental: this.mapRental(rental),
    };
  }

  private async transition(
    id: string,
    status: RentalRequestStatus,
    allowedFrom: RentalRequestStatus[],
    message: string,
    statusUpdatedById: number,
    extraData: Prisma.RentalRequestUncheckedUpdateInput = {},
  ) {
    const rental = await this.prisma.$transaction(async (tx) => {
      await this.lockRentalRequest(tx, id);
      const existing = await tx.rentalRequest.findUnique({
        where: { id },
        select: { id: true, status: true },
      });

      if (!existing) {
        throw new NotFoundException('Solicitud de renta no encontrada');
      }

      this.assertStatus(existing.status, allowedFrom);

      await this.recordStatusHistory(
        tx,
        id,
        existing.status,
        status,
        statusUpdatedById,
        message,
      );

      return tx.rentalRequest.update({
        where: { id },
        data: {
          ...extraData,
          status,
          statusUpdatedById,
          statusUpdatedAt: new Date(),
        },
        include: rentalInclude,
      });
    });

    return { message, rental: this.mapRental(rental) };
  }

  private async lockRentalRequest(tx: Prisma.TransactionClient, id: string) {
    await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM management.rental_requests
      WHERE id = ${id}
      FOR UPDATE
    `;
  }

  private async recordStatusHistory(
    tx: Prisma.TransactionClient,
    rentalRequestId: string,
    fromStatus: RentalRequestStatus | null,
    toStatus: RentalRequestStatus,
    actorId: number,
    note: string,
  ) {
    await tx.rentalStatusHistory.create({
      data: {
        rentalRequestId,
        fromStatus,
        toStatus,
        actorId,
        note,
      },
    });
  }

  private orderInventoryItems<T extends { productId: number }>(items: T[]) {
    return [...items].sort((left, right) => left.productId - right.productId);
  }

  private assertStatus(
    current: RentalRequestStatus,
    allowed: RentalRequestStatus[],
  ) {
    if (!allowed.includes(current)) {
      throw new BadRequestException('Transicion de estado no permitida');
    }
  }

  private async assertActiveUser(db: RentalDbClient, userId: number) {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, activo: true },
    });

    if (!user || !user.activo) {
      throw new UnauthorizedException('No autenticado');
    }
  }

  private assertRentableProduct(
    product: {
      activo: boolean;
      stock: number;
      tipoAdquisicion: TipoAdquisicion;
      rentalDailyPrice: number | null;
    },
    quantity: number,
  ) {
    if (!product.activo) {
      throw new BadRequestException('Producto no disponible');
    }

    if (product.tipoAdquisicion === TipoAdquisicion.VENTA) {
      throw new BadRequestException('Producto disponible solo para venta');
    }

    if (!product.rentalDailyPrice || product.rentalDailyPrice <= 0) {
      throw new BadRequestException('Producto sin tarifa de renta configurada');
    }

    if (product.stock < quantity) {
      throw new BadRequestException(
        'La cantidad solicitada supera el stock disponible',
      );
    }
  }

  private assertRentalDates(
    startDate: Date | null,
    endDate: Date | null,
    minDays: number,
  ) {
    if (!startDate || !endDate) {
      throw new BadRequestException(
        'Todas las rentas requieren fecha de inicio y fin',
      );
    }

    const today = getDateOnlyToday();
    const normalizedStart = normalizeDateOnlyUtc(startDate);
    const normalizedEnd = normalizeDateOnlyUtc(endDate);

    if (normalizedStart < today) {
      throw new BadRequestException(
        'La fecha de inicio de renta no puede estar en el pasado',
      );
    }

    if (normalizedEnd < normalizedStart) {
      throw new BadRequestException(
        'La fecha de fin de renta debe ser posterior o igual al inicio',
      );
    }

    const days = this.countRentalDays(normalizedStart, normalizedEnd);
    if (days < minDays) {
      throw new BadRequestException(
        `La renta minima para este producto es de ${minDays} dia(s)`,
      );
    }

    return { startDate: normalizedStart, endDate: normalizedEnd, days };
  }

  private assertRentalStillFuture(startDate: Date) {
    const today = getDateOnlyToday();
    const normalizedStart = normalizeDateOnlyUtc(startDate);

    if (normalizedStart < today) {
      throw new BadRequestException(
        'No se puede aprobar una renta cuya fecha de inicio ya vencio',
      );
    }
  }

  private calculateLine(input: {
    quantity: number;
    startDate: Date;
    endDate: Date;
    dailyPrice: number;
    deposit: number;
  }) {
    const days = this.countRentalDays(input.startDate, input.endDate);
    const lineSubtotal = this.roundMoney(
      input.quantity * input.dailyPrice * days,
    );
    const lineDeposit = this.roundMoney(input.quantity * input.deposit);
    const lineTotal = this.roundMoney(lineSubtotal + lineDeposit);

    return {
      startDate: input.startDate,
      endDate: input.endDate,
      days,
      dailyPrice: input.dailyPrice,
      deposit: input.deposit,
      lineSubtotal,
      lineDeposit,
      lineTotal,
    };
  }

  private countRentalDays(startDate: Date, endDate: Date) {
    return (
      Math.floor((endDate.getTime() - startDate.getTime()) / MS_PER_DAY) + 1
    );
  }

  private roundMoney(value: number) {
    return Number(value.toFixed(2));
  }

  private async generateRentalFolio(tx: Prisma.TransactionClient) {
    const rows = await tx.$queryRaw<Array<{ value: bigint }>>`
      SELECT nextval('management.rental_folio_seq') AS value
    `;
    const sequenceValue = rows[0]?.value;
    if (sequenceValue === undefined) {
      throw new InternalServerErrorException(
        'No se pudo generar el folio de renta',
      );
    }

    const year = new Intl.DateTimeFormat('en', {
      year: 'numeric',
      timeZone: 'America/Mexico_City',
    }).format(new Date());
    return `REN-${year}-${String(sequenceValue).padStart(6, '0')}`;
  }

  private optionalTrim(value: string | undefined) {
    return value?.trim() || null;
  }

  private documentationPendingWhere(): Prisma.RentalRequestWhereInput {
    return {
      status: RentalRequestStatus.PENDING,
      items: {
        some: {
          AND: [
            {
              OR: [
                { prescriptionRequiredSnapshot: true },
                {
                  prescriptionRequiredSnapshot: null,
                  product: { requiereReceta: true },
                },
              ],
            },
            {
              OR: [
                { rentalDocument: { is: null } },
                {
                  rentalDocument: {
                    is: { status: RentalDocumentStatus.RECHAZADO },
                  },
                },
              ],
            },
          ],
        },
      },
    };
  }

  private dueSoonWhere(
    today: Date,
    limit: Date,
  ): Prisma.RentalRequestWhereInput {
    return {
      status: RentalRequestStatus.DELIVERED,
      items: {
        some: { endDate: { gte: today } },
        every: { endDate: { lte: limit } },
      },
    };
  }

  private myRentalFilterWhere(
    filter: MyRentalFilter | undefined,
    documentationPending: Prisma.RentalRequestWhereInput,
    dueSoon: Prisma.RentalRequestWhereInput,
  ): Prisma.RentalRequestWhereInput {
    if (!filter || filter === MyRentalFilter.ALL) return {};
    if (filter === MyRentalFilter.DOCUMENTATION_PENDING) {
      return documentationPending;
    }
    if (filter === MyRentalFilter.DUE_SOON) return dueSoon;
    return { status: filter as RentalRequestStatus };
  }

  private mapRental(rental: RentalWithDetails) {
    return {
      id: rental.id,
      folio: rental.folio,
      status: rental.status,
      subtotal: rental.subtotal,
      depositTotal: rental.depositTotal,
      depositStatus: rental.depositStatus,
      depositReturnedAmount: rental.depositReturnedAmount,
      depositRetainedAmount: rental.depositRetainedAmount,
      depositNotes: rental.depositNotes,
      depositResolvedAt: rental.depositResolvedAt?.toISOString() ?? null,
      total: rental.total,
      notes: rental.notes,
      applicantName: rental.applicantName,
      applicantEmail: rental.applicantEmail,
      applicantPhone: rental.applicantPhone,
      isForAnotherPerson: rental.isForAnotherPerson,
      patientName: rental.patientName,
      patientRelationship: rental.patientRelationship,
      deliveryMethod: rental.deliveryMethod,
      deliveryAddress: rental.deliveryAddress,
      deliveryNeighborhood: rental.deliveryNeighborhood,
      deliveryPostalCode: rental.deliveryPostalCode,
      deliveryMunicipality: rental.deliveryMunicipality,
      deliveryReferences: rental.deliveryReferences,
      preferredSchedule: rental.preferredSchedule,
      rentalTermsAcceptedAt:
        rental.rentalTermsAcceptedAt?.toISOString() ?? null,
      privacyAcceptedAt: rental.privacyAcceptedAt?.toISOString() ?? null,
      rejectedReason: rental.rejectedReason,
      approvedAt: rental.approvedAt?.toISOString() ?? null,
      rejectedAt: rental.rejectedAt?.toISOString() ?? null,
      cancelledAt: rental.cancelledAt?.toISOString() ?? null,
      deliveredAt: rental.deliveredAt?.toISOString() ?? null,
      returnedAt: rental.returnedAt?.toISOString() ?? null,
      statusUpdatedAt: rental.statusUpdatedAt.toISOString(),
      createdAt: rental.createdAt.toISOString(),
      updatedAt: rental.updatedAt.toISOString(),
      user: rental.user,
      approvedBy: rental.approvedBy,
      statusUpdatedBy: rental.statusUpdatedBy,
      depositResolvedBy: rental.depositResolvedBy,
      statusHistory: rental.statusHistory.map((entry) => ({
        id: entry.id,
        fromStatus: entry.fromStatus,
        toStatus: entry.toStatus,
        note: entry.note,
        createdAt: entry.createdAt.toISOString(),
        actor: entry.actor,
      })),
      items: rental.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        quantity: item.quantity,
        startDate: item.startDate.toISOString(),
        endDate: item.endDate.toISOString(),
        days: item.days,
        dailyPrice: item.dailyPrice,
        deposit: item.deposit,
        lineSubtotal: item.lineSubtotal,
        lineDeposit: item.lineDeposit,
        lineTotal: item.lineTotal,
        notes: item.notes,
        productNameSnapshot: item.productNameSnapshot,
        productBrandSnapshot: item.productBrandSnapshot,
        productModelSnapshot: item.productModelSnapshot,
        productSkuSnapshot: item.productSkuSnapshot,
        productImageSnapshot: item.productImageSnapshot,
        productClassSnapshot: item.productClassSnapshot,
        prescriptionRequiredSnapshot: item.prescriptionRequiredSnapshot,
        prescription: item.rentalDocument
          ? {
              id: item.rentalDocument.id,
              fileName: item.rentalDocument.originalFilename,
              mimeType: item.rentalDocument.mimeType,
              sizeBytes: item.rentalDocument.bytes,
              status: item.rentalDocument.status,
              uploadedAt: item.rentalDocument.uploadedAt.toISOString(),
              associatedAt:
                item.rentalDocument.associatedAt?.toISOString() ?? null,
              reviewedAt: item.rentalDocument.reviewedAt?.toISOString() ?? null,
              rejectionReason: item.rentalDocument.rejectionReason,
              reviewedBy: item.rentalDocument.reviewedBy,
            }
          : null,
        product: {
          id: item.product.id,
          nombre: item.productNameSnapshot ?? item.product.nombre,
          marca: item.productBrandSnapshot ?? item.product.marca,
          modelo: item.productModelSnapshot ?? item.product.modelo,
          sku: item.productSkuSnapshot ?? `CEMYDI-${item.product.id}`,
          clasificacion:
            item.productClassSnapshot ?? item.product.clasificacion,
          stock: item.product.stock,
          tipoAdquisicion: item.product.tipoAdquisicion,
          requiereReceta:
            item.prescriptionRequiredSnapshot ?? item.product.requiereReceta,
          imageUrl:
            item.productImageSnapshot ??
            item.product.images[0]?.imageUrl ??
            null,
        },
      })),
    };
  }
}
