import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  CartItemMode,
  Prisma,
  RentalRequestStatus,
  TipoAdquisicion,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { assertPrescriptionDocumentMagicBytes } from '../../common/files/image-magic-bytes.util';
import type { AuthUser } from '../auth/types/auth-user.interface';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_PRESCRIPTION_BYTES = 8 * 1024 * 1024;

type UploadedPrescriptionFile = {
  fieldname?: string;
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

type PrescriptionDocument = {
  fileName: string;
  mimeType: string;
  size: number;
  buffer: Buffer;
};

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
  items: {
    include: {
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
  constructor(private readonly prisma: PrismaService) {}

  async listMine(currentUser: AuthUser) {
    const db = this.prisma.forUser(currentUser);
    await this.assertActiveUser(db, currentUser.sub);
    const rentals = await db.rentalRequest.findMany({
      where: { userId: currentUser.sub },
      include: rentalInclude,
      orderBy: { createdAt: 'desc' },
    });

    return { rentals: rentals.map((rental) => this.mapRental(rental)) };
  }

  async createFromCart(
    currentUser: AuthUser,
    prescriptions: UploadedPrescriptionFile[] = [],
  ) {
    const db = this.prisma.forUser(currentUser);
    const rental = await db.$transaction(async (tx) => {
      await this.assertActiveUser(tx, currentUser.sub);
      const cart = await tx.shoppingCart.findUnique({
        where: { userId: currentUser.sub },
        include: {
          items: {
            where: { mode: CartItemMode.RENTA },
            include: {
              product: {
                include: {
                  images: {
                    orderBy: { sortOrder: 'asc' },
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

      const prescriptionDocuments = this.mapPrescriptionDocuments(
        prescriptions,
        rentalItems.map((item) => item.id),
      );

      const calculatedItems = rentalItems.map((item) => {
        const dates = this.assertRentalDates(
          item.rentalStartDate,
          item.rentalEndDate,
          item.product.rentalMinDays,
        );
        this.assertRentableProduct(item.product, item.quantity);
        const prescriptionDocument = prescriptionDocuments.get(item.id) ?? null;
        if (item.product.requiereReceta && !prescriptionDocument) {
          throw new BadRequestException(
            `Adjunta receta en PDF o imagen para ${item.product.nombre}`,
          );
        }

        return {
          item,
          prescriptionDocument,
          ...this.calculateLine({
            quantity: item.quantity,
            startDate: dates.startDate,
            endDate: dates.endDate,
            dailyPrice: item.product.rentalDailyPrice ?? 0,
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

      const created = await tx.rentalRequest.create({
        data: {
          userId: currentUser.sub,
          subtotal,
          depositTotal,
          total,
          statusUpdatedById: currentUser.sub,
          statusUpdatedAt: new Date(),
          items: {
            create: calculatedItems.map((calculated) => ({
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
              prescriptionFileName:
                calculated.prescriptionDocument?.fileName ?? null,
              prescriptionMimeType:
                calculated.prescriptionDocument?.mimeType ?? null,
              prescriptionSizeBytes:
                calculated.prescriptionDocument?.size ?? null,
              prescriptionData: calculated.prescriptionDocument?.buffer ?? null,
            })),
          },
        },
        include: rentalInclude,
      });

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

      return created;
    });

    return {
      message: 'Solicitud de renta enviada para aprobación',
      rental: this.mapRental(rental),
    };
  }

  async cancelMine(currentUser: AuthUser, id: string) {
    const db = this.prisma.forUser(currentUser);
    const rental = await db.$transaction(async (tx) => {
      await this.assertActiveUser(tx, currentUser.sub);
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
        prescriptionFileName: true,
        prescriptionMimeType: true,
        prescriptionData: true,
      },
    });

    if (!item) {
      throw new NotFoundException('Receta no encontrada');
    }

    if (
      !item.prescriptionFileName ||
      !item.prescriptionMimeType ||
      !item.prescriptionData
    ) {
      throw new NotFoundException('Esta renta no tiene receta adjunta');
    }

    return {
      fileName: item.prescriptionFileName,
      mimeType: item.prescriptionMimeType,
      data: Buffer.from(item.prescriptionData),
    };
  }

  async listForAdmin(params: {
    status?: RentalRequestStatus;
    search?: string;
  }) {
    const where: Prisma.RentalRequestWhereInput = {};
    const search = params.search?.trim();

    if (params.status) {
      where.status = params.status;
    }

    if (search) {
      where.OR = [
        { id: { contains: search, mode: 'insensitive' } },
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

    const rentals = await this.prisma.rentalRequest.findMany({
      where,
      include: rentalInclude,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });

    return { rentals: rentals.map((rental) => this.mapRental(rental)) };
  }

  async approve(currentUser: AuthUser, id: string) {
    const rental = await this.prisma.$transaction(async (tx) => {
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
      }

      for (const item of existing.items) {
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
      const existing = await tx.rentalRequest.findUnique({
        where: { id },
        select: { id: true, status: true },
      });

      if (!existing) {
        throw new NotFoundException('Solicitud de renta no encontrada');
      }

      this.assertStatus(existing.status, [RentalRequestStatus.PENDING]);

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
      const existing = await tx.rentalRequest.findUnique({
        where: { id },
        include: rentalInclude,
      });

      if (!existing) {
        throw new NotFoundException('Solicitud de renta no encontrada');
      }

      this.assertStatus(existing.status, [RentalRequestStatus.DELIVERED]);

      for (const item of existing.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } },
        });
      }

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

  private async transition(
    id: string,
    status: RentalRequestStatus,
    allowedFrom: RentalRequestStatus[],
    message: string,
    statusUpdatedById: number,
    extraData: Prisma.RentalRequestUncheckedUpdateInput = {},
  ) {
    const rental = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.rentalRequest.findUnique({
        where: { id },
        select: { id: true, status: true },
      });

      if (!existing) {
        throw new NotFoundException('Solicitud de renta no encontrada');
      }

      this.assertStatus(existing.status, allowedFrom);

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

    const today = this.startOfUtcDay(new Date());
    const normalizedStart = this.startOfUtcDay(startDate);
    const normalizedEnd = this.startOfUtcDay(endDate);

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
    const today = this.startOfUtcDay(new Date());
    const normalizedStart = this.startOfUtcDay(startDate);

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

  private mapPrescriptionDocuments(
    files: UploadedPrescriptionFile[],
    cartItemIds: number[],
  ) {
    const allowedCartItemIds = new Set(cartItemIds);
    const documents = new Map<number, PrescriptionDocument>();

    for (const file of files) {
      const match = file.fieldname?.match(/^prescription:(\d+)$/);
      if (!match?.[1]) {
        throw new BadRequestException('Campo de receta invalido');
      }

      const cartItemId = Number(match[1]);
      if (!allowedCartItemIds.has(cartItemId)) {
        throw new BadRequestException('Receta asociada a una renta invalida');
      }

      if (documents.has(cartItemId)) {
        throw new BadRequestException(
          'Solo se permite una receta por producto de renta',
        );
      }

      documents.set(cartItemId, this.validatePrescriptionDocument(file));
    }

    return documents;
  }

  private validatePrescriptionDocument(file: UploadedPrescriptionFile) {
    if (file.size > MAX_PRESCRIPTION_BYTES) {
      throw new BadRequestException('La receta no debe superar 8 MB');
    }

    const mimeType = assertPrescriptionDocumentMagicBytes(
      file.buffer,
      file.originalname,
    );

    return {
      fileName: file.originalname.trim() || 'receta',
      mimeType,
      size: file.size,
      buffer: file.buffer,
    };
  }

  private startOfUtcDay(date: Date) {
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
  }

  private countRentalDays(startDate: Date, endDate: Date) {
    return (
      Math.floor((endDate.getTime() - startDate.getTime()) / MS_PER_DAY) + 1
    );
  }

  private roundMoney(value: number) {
    return Number(value.toFixed(2));
  }

  private mapRental(rental: RentalWithDetails) {
    return {
      id: rental.id,
      status: rental.status,
      subtotal: rental.subtotal,
      depositTotal: rental.depositTotal,
      total: rental.total,
      notes: rental.notes,
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
        prescription: item.prescriptionFileName
          ? {
              fileName: item.prescriptionFileName,
              mimeType: item.prescriptionMimeType,
              sizeBytes: item.prescriptionSizeBytes,
            }
          : null,
        product: {
          id: item.product.id,
          nombre: item.product.nombre,
          marca: item.product.marca,
          modelo: item.product.modelo,
          clasificacion: item.product.clasificacion,
          stock: item.product.stock,
          tipoAdquisicion: item.product.tipoAdquisicion,
          requiereReceta: item.product.requiereReceta,
          imageUrl: item.product.images[0]?.imageUrl ?? null,
        },
      })),
    };
  }
}
