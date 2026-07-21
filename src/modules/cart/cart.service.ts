import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { CartItemMode, Prisma, TipoAdquisicion } from '@prisma/client';
import {
  formatDateOnlyForDto,
  getDateOnlyToday,
  parseDateOnlyToUtc,
} from '../../common/dates/date-only.util';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../auth/types/auth-user.interface';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';

const MAX_CART_ITEM_QUANTITY = 25;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const cartInclude = {
  items: {
    orderBy: { updatedAt: 'desc' },
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
  },
} satisfies Prisma.ShoppingCartInclude;

type CartWithItems = Prisma.ShoppingCartGetPayload<{
  include: typeof cartInclude;
}>;

type CartDbClient = PrismaService | Prisma.TransactionClient;

@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  async getCart(currentUser: AuthUser) {
    const db = this.prisma.forUser(currentUser);
    await this.assertActiveUser(db, currentUser.sub);
    const cart = await this.findCartByUserId(db, currentUser.sub);
    return {
      cart: this.mapCart(cart),
    };
  }

  async addItem(currentUser: AuthUser, dto: AddCartItemDto) {
    const db = this.prisma.forUser(currentUser);
    const cart = await db.$transaction(async (tx) => {
      await this.lockUserRentalFlow(tx, currentUser.sub);
      await this.assertActiveUser(tx, currentUser.sub);
      const mode = dto.mode ?? CartItemMode.VENTA;
      const product = await this.ensureProductForCartMode(
        tx,
        dto.productId,
        mode,
      );
      const rentalWindow = this.resolveRentalWindow(mode, dto, product);
      const cartRecord = await this.getOrCreateCart(tx, currentUser.sub);
      const existingItem = await tx.shoppingCartItem.findFirst({
        where: {
          cartId: cartRecord.id,
          productId: dto.productId,
          mode,
          rentalStartDate: rentalWindow.startDate,
          rentalEndDate: rentalWindow.endDate,
        },
        select: {
          id: true,
          quantity: true,
        },
      });

      const nextQuantity = (existingItem?.quantity ?? 0) + dto.quantity;
      this.assertValidQuantity(nextQuantity, product.stock);

      if (existingItem) {
        await tx.shoppingCartItem.update({
          where: { id: existingItem.id },
          data: {
            quantity: nextQuantity,
            rentalNotes: rentalWindow.notes,
          },
        });
      } else {
        await tx.shoppingCartItem.create({
          data: {
            cartId: cartRecord.id,
            productId: dto.productId,
            quantity: dto.quantity,
            mode,
            rentalStartDate: rentalWindow.startDate,
            rentalEndDate: rentalWindow.endDate,
            rentalNotes: rentalWindow.notes,
          },
        });
      }

      await tx.shoppingCart.update({
        where: { id: cartRecord.id },
        data: { updatedAt: new Date() },
      });

      return this.findCartByUserId(tx, currentUser.sub);
    });

    return {
      message: 'Producto agregado al carrito',
      cart: this.mapCart(cart),
    };
  }

  async updateItem(
    currentUser: AuthUser,
    itemId: number,
    dto: UpdateCartItemDto,
  ) {
    const db = this.prisma.forUser(currentUser);
    const cart = await db.$transaction(async (tx) => {
      await this.lockUserRentalFlow(tx, currentUser.sub);
      await this.assertActiveUser(tx, currentUser.sub);

      const item = await tx.shoppingCartItem.findFirst({
        where: {
          id: itemId,
          cart: {
            userId: currentUser.sub,
          },
        },
        select: {
          id: true,
          cartId: true,
          productId: true,
          mode: true,
          rentalStartDate: true,
          rentalEndDate: true,
          rentalNotes: true,
        },
      });

      if (!item) {
        throw new NotFoundException('Elemento del carrito no encontrado');
      }

      const product = await this.ensureProductForCartMode(
        tx,
        item.productId,
        item.mode,
      );
      const rentalWindow = this.resolveRentalWindow(
        item.mode,
        {
          rentalStartDate:
            dto.rentalStartDate ??
            this.formatDateOnlyForDto(item.rentalStartDate),
          rentalEndDate:
            dto.rentalEndDate ?? this.formatDateOnlyForDto(item.rentalEndDate),
          rentalNotes:
            dto.rentalNotes !== undefined
              ? dto.rentalNotes
              : (item.rentalNotes ?? undefined),
        },
        product,
      );
      this.assertValidQuantity(dto.quantity, product.stock);

      await tx.shoppingCartItem.update({
        where: { id: itemId },
        data: {
          quantity: dto.quantity,
          rentalStartDate: rentalWindow.startDate,
          rentalEndDate: rentalWindow.endDate,
          rentalNotes: rentalWindow.notes,
        },
      });

      await tx.shoppingCart.update({
        where: { id: item.cartId },
        data: { updatedAt: new Date() },
      });

      return this.findCartByUserId(tx, currentUser.sub);
    });

    return {
      message: 'Cantidad actualizada correctamente',
      cart: this.mapCart(cart),
    };
  }

  async removeItem(currentUser: AuthUser, itemId: number) {
    const db = this.prisma.forUser(currentUser);
    const cart = await db.$transaction(async (tx) => {
      await this.lockUserRentalFlow(tx, currentUser.sub);
      await this.assertActiveUser(tx, currentUser.sub);

      const item = await tx.shoppingCartItem.findFirst({
        where: {
          id: itemId,
          cart: {
            userId: currentUser.sub,
          },
        },
        select: {
          id: true,
          cartId: true,
        },
      });

      if (!item) {
        throw new NotFoundException('Elemento del carrito no encontrado');
      }

      await tx.rentalDocument.updateMany({
        where: { shoppingCartItemId: itemId },
        data: { shoppingCartItemId: null, cleanupAfter: new Date() },
      });

      await tx.shoppingCartItem.delete({
        where: { id: itemId },
      });

      await tx.shoppingCart.update({
        where: { id: item.cartId },
        data: { updatedAt: new Date() },
      });

      return this.findCartByUserId(tx, currentUser.sub);
    });

    return {
      message: 'Producto eliminado del carrito',
      cart: this.mapCart(cart),
    };
  }

  async clearCart(currentUser: AuthUser) {
    const db = this.prisma.forUser(currentUser);
    const cart = await db.$transaction(async (tx) => {
      await this.lockUserRentalFlow(tx, currentUser.sub);
      await this.assertActiveUser(tx, currentUser.sub);
      const existingCart = await tx.shoppingCart.findUnique({
        where: { userId: currentUser.sub },
        select: { id: true },
      });

      if (!existingCart) {
        return this.findCartByUserId(tx, currentUser.sub);
      }

      await tx.rentalDocument.updateMany({
        where: { shoppingCartItem: { cartId: existingCart.id } },
        data: { shoppingCartItemId: null, cleanupAfter: new Date() },
      });

      await tx.shoppingCartItem.deleteMany({
        where: {
          cartId: existingCart.id,
        },
      });

      await tx.shoppingCart.update({
        where: { id: existingCart.id },
        data: { updatedAt: new Date() },
      });

      return this.findCartByUserId(tx, currentUser.sub);
    });

    return {
      message: 'Carrito vaciado correctamente',
      cart: this.mapCart(cart),
    };
  }

  async clearRentals(currentUser: AuthUser) {
    const db = this.prisma.forUser(currentUser);
    const cart = await db.$transaction(async (tx) => {
      await this.lockUserRentalFlow(tx, currentUser.sub);
      await this.assertActiveUser(tx, currentUser.sub);
      const existingCart = await tx.shoppingCart.findUnique({
        where: { userId: currentUser.sub },
        select: { id: true },
      });

      if (!existingCart) {
        return this.findCartByUserId(tx, currentUser.sub);
      }

      await tx.rentalDocument.updateMany({
        where: {
          shoppingCartItem: {
            cartId: existingCart.id,
            mode: CartItemMode.RENTA,
          },
        },
        data: { shoppingCartItemId: null, cleanupAfter: new Date() },
      });
      await tx.shoppingCartItem.deleteMany({
        where: { cartId: existingCart.id, mode: CartItemMode.RENTA },
      });
      await tx.shoppingCart.update({
        where: { id: existingCart.id },
        data: { updatedAt: new Date() },
      });

      return this.findCartByUserId(tx, currentUser.sub);
    });

    return {
      message: 'Productos de renta eliminados del carrito',
      cart: this.mapCart(cart),
    };
  }

  private async assertActiveUser(db: CartDbClient, userId: number) {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, activo: true },
    });

    if (!user || !user.activo) {
      throw new UnauthorizedException('No autenticado');
    }
  }

  private async lockUserRentalFlow(
    tx: Prisma.TransactionClient,
    userId: number,
  ) {
    await tx.$queryRaw<Array<{ acquired: number }>>`
      SELECT 1::integer AS acquired
      FROM pg_advisory_xact_lock(
        CAST(73391 AS integer),
        CAST(${userId} AS integer)
      )
    `;
  }

  private async ensureProductForCartMode(
    db: CartDbClient,
    productId: number,
    mode: CartItemMode,
  ) {
    const product = await db.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        activo: true,
        stock: true,
        tipoAdquisicion: true,
        rentalDailyPrice: true,
        rentalMinDays: true,
        rentalDeposit: true,
      },
    });

    if (!product || !product.activo) {
      throw new NotFoundException('Producto no encontrado');
    }

    if (
      mode === CartItemMode.VENTA &&
      product.tipoAdquisicion === TipoAdquisicion.RENTA
    ) {
      throw new BadRequestException(
        'Este producto solo esta disponible para renta y no puede agregarse al carrito de compra',
      );
    }

    if (
      mode === CartItemMode.RENTA &&
      product.tipoAdquisicion === TipoAdquisicion.VENTA
    ) {
      throw new BadRequestException(
        'Este producto solo esta disponible para venta y no puede rentarse',
      );
    }

    if (
      mode === CartItemMode.RENTA &&
      (!product.rentalDailyPrice || product.rentalDailyPrice <= 0)
    ) {
      throw new BadRequestException(
        'Este producto aun no tiene tarifa de renta configurada',
      );
    }

    if (product.stock <= 0) {
      throw new BadRequestException('El producto no tiene stock disponible');
    }

    return product;
  }

  private resolveRentalWindow(
    mode: CartItemMode,
    dto: {
      rentalStartDate?: string;
      rentalEndDate?: string;
      rentalNotes?: string;
    },
    product: {
      rentalMinDays: number;
    },
  ) {
    if (mode === CartItemMode.VENTA) {
      return {
        startDate: null,
        endDate: null,
        notes: null,
        days: 0,
      };
    }

    if (!dto.rentalStartDate && !dto.rentalEndDate) {
      return {
        startDate: null,
        endDate: null,
        notes: dto.rentalNotes?.trim() || null,
        days: 0,
      };
    }

    if (!dto.rentalStartDate || !dto.rentalEndDate) {
      throw new BadRequestException(
        'Captura juntas la fecha de inicio y la fecha de fin de la renta',
      );
    }

    let startDate: Date;
    let endDate: Date;
    try {
      startDate = parseDateOnlyToUtc(dto.rentalStartDate);
      endDate = parseDateOnlyToUtc(dto.rentalEndDate);
    } catch {
      throw new BadRequestException('Fecha de renta invalida');
    }
    const today = getDateOnlyToday();

    if (startDate < today) {
      throw new BadRequestException(
        'La fecha de inicio de renta no puede estar en el pasado',
      );
    }

    if (endDate < startDate) {
      throw new BadRequestException(
        'La fecha de fin de renta debe ser posterior o igual al inicio',
      );
    }

    const days = this.countRentalDays(startDate, endDate);
    if (days < product.rentalMinDays) {
      throw new BadRequestException(
        `La renta minima para este producto es de ${product.rentalMinDays} dia(s)`,
      );
    }

    return {
      startDate,
      endDate,
      notes: dto.rentalNotes?.trim() || null,
      days,
    };
  }

  private formatDateOnlyForDto(value: Date | null) {
    return formatDateOnlyForDto(value);
  }

  private countRentalDays(startDate: Date, endDate: Date) {
    return (
      Math.floor((endDate.getTime() - startDate.getTime()) / MS_PER_DAY) + 1
    );
  }

  private assertValidQuantity(quantity: number, stock: number) {
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new BadRequestException('La cantidad solicitada no es valida');
    }

    if (quantity > MAX_CART_ITEM_QUANTITY) {
      throw new BadRequestException(
        `Solo se permiten ${MAX_CART_ITEM_QUANTITY} unidades por producto en el carrito`,
      );
    }

    if (quantity > stock) {
      throw new BadRequestException(
        'La cantidad solicitada supera el stock disponible',
      );
    }
  }

  private getOrCreateCart(db: CartDbClient, userId: number) {
    return db.shoppingCart.upsert({
      where: { userId },
      create: { userId },
      update: {},
      select: { id: true },
    });
  }

  private findCartByUserId(db: CartDbClient, userId: number) {
    return db.shoppingCart.findUnique({
      where: { userId },
      include: cartInclude,
    });
  }

  private mapCart(cart: CartWithItems | null) {
    if (!cart) {
      return {
        id: null,
        createdAt: null,
        updatedAt: null,
        items: [],
        summary: {
          distinctItems: 0,
          totalQuantity: 0,
          subtotal: 0,
          saleSubtotal: 0,
          rentalSubtotal: 0,
          rentalDepositTotal: 0,
          total: 0,
          rentalItems: 0,
          saleItems: 0,
          hasUnavailableItems: false,
          hasUnconfiguredRentalItems: false,
        },
      };
    }

    const items = cart.items.map((item) => {
      const isAvailable =
        item.product.activo &&
        item.product.stock > 0 &&
        item.quantity <= item.product.stock &&
        this.isModeAllowed(item.product.tipoAdquisicion, item.mode) &&
        (item.mode === CartItemMode.VENTA ||
          Boolean(
            item.product.rentalDailyPrice && item.product.rentalDailyPrice > 0,
          ));
      const maxQuantity = Math.max(
        0,
        Math.min(item.product.stock, MAX_CART_ITEM_QUANTITY),
      );
      const isRentalConfigured = Boolean(
        item.mode === CartItemMode.RENTA &&
        item.rentalStartDate &&
        item.rentalEndDate,
      );
      const rentalDays = isRentalConfigured
        ? this.countRentalDays(item.rentalStartDate!, item.rentalEndDate!)
        : null;
      const rentalDailyPrice = item.product.rentalDailyPrice ?? 0;
      const rentalSubtotal = isRentalConfigured
        ? Number((item.quantity * rentalDailyPrice * rentalDays!).toFixed(2))
        : null;
      const rentalDeposit = Number(
        (item.quantity * item.product.rentalDeposit).toFixed(2),
      );
      const saleLineTotal = Number(
        (item.quantity * item.product.precio).toFixed(2),
      );
      const lineTotal =
        item.mode === CartItemMode.RENTA
          ? rentalSubtotal === null
            ? null
            : Number((rentalSubtotal + rentalDeposit).toFixed(2))
          : saleLineTotal;

      return {
        id: item.id,
        mode: item.mode,
        configurationStatus:
          item.mode === CartItemMode.RENTA && !isRentalConfigured
            ? 'PENDING'
            : 'COMPLETE',
        quantity: item.quantity,
        rentalStartDate: item.rentalStartDate?.toISOString() ?? null,
        rentalEndDate: item.rentalEndDate?.toISOString() ?? null,
        rentalDays,
        rentalNotes: item.rentalNotes,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
        lineTotal,
        rentalSummary:
          item.mode === CartItemMode.RENTA
            ? {
                dailyPrice: rentalDailyPrice,
                minDays: item.product.rentalMinDays,
                deposit: item.product.rentalDeposit,
                subtotal: rentalSubtotal,
                depositTotal: rentalDeposit,
                total: lineTotal,
              }
            : null,
        document: item.rentalDocument
          ? {
              id: item.rentalDocument.id,
              originalFilename: item.rentalDocument.originalFilename,
              mimeType: item.rentalDocument.mimeType,
              bytes: item.rentalDocument.bytes,
              status: item.rentalDocument.status,
              uploadedAt: item.rentalDocument.uploadedAt.toISOString(),
              associatedAt:
                item.rentalDocument.associatedAt?.toISOString() ?? null,
            }
          : null,
        availability: {
          isAvailable,
          maxQuantity,
          reason: this.getAvailabilityReason(
            item.product,
            item.quantity,
            item.mode,
          ),
        },
        product: {
          id: item.product.id,
          slug: item.product.slug,
          nombre: item.product.nombre,
          marca: item.product.marca,
          modelo: item.product.modelo,
          descripcion: item.product.descripcion,
          precio: item.product.precio,
          clasificacion: item.product.clasificacion,
          stock: item.product.stock,
          proveedor: item.product.proveedor,
          tipoAdquisicion: item.product.tipoAdquisicion,
          requiereReceta: item.product.requiereReceta,
          rentalDailyPrice: item.product.rentalDailyPrice,
          rentalMinDays: item.product.rentalMinDays,
          rentalDeposit: item.product.rentalDeposit,
          rentalTerms: item.product.rentalTerms,
          activo: item.product.activo,
          imageUrl: item.product.images[0]?.imageUrl ?? null,
        },
      };
    });

    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
    const saleSubtotal = Number(
      items
        .filter((item) => item.mode === CartItemMode.VENTA)
        .reduce((sum, item) => sum + (item.lineTotal ?? 0), 0)
        .toFixed(2),
    );
    const rentalSubtotal = Number(
      items
        .filter((item) => item.mode === CartItemMode.RENTA)
        .reduce((sum, item) => sum + (item.rentalSummary?.subtotal ?? 0), 0)
        .toFixed(2),
    );
    const rentalDepositTotal = Number(
      items
        .filter(
          (item) =>
            item.mode === CartItemMode.RENTA &&
            item.configurationStatus === 'COMPLETE',
        )
        .reduce((sum, item) => sum + (item.rentalSummary?.depositTotal ?? 0), 0)
        .toFixed(2),
    );
    const subtotal = Number((saleSubtotal + rentalSubtotal).toFixed(2));
    const total = Number((subtotal + rentalDepositTotal).toFixed(2));

    return {
      id: cart.id,
      createdAt: cart.createdAt.toISOString(),
      updatedAt: cart.updatedAt.toISOString(),
      items,
      summary: {
        distinctItems: items.length,
        totalQuantity,
        subtotal,
        saleSubtotal,
        rentalSubtotal,
        rentalDepositTotal,
        total,
        rentalItems: items.filter((item) => item.mode === CartItemMode.RENTA)
          .length,
        saleItems: items.filter((item) => item.mode === CartItemMode.VENTA)
          .length,
        hasUnavailableItems: items.some(
          (item) => !item.availability.isAvailable,
        ),
        hasUnconfiguredRentalItems: items.some(
          (item) =>
            item.mode === CartItemMode.RENTA &&
            item.configurationStatus === 'PENDING',
        ),
      },
    };
  }

  private getAvailabilityReason(
    product: {
      activo: boolean;
      stock: number;
      tipoAdquisicion: TipoAdquisicion;
      rentalDailyPrice?: number | null;
    },
    quantity: number,
    mode: CartItemMode,
  ) {
    if (!product.activo) {
      return 'Producto no disponible';
    }

    if (
      mode === CartItemMode.VENTA &&
      product.tipoAdquisicion === TipoAdquisicion.RENTA
    ) {
      return 'Producto disponible solo para renta';
    }

    if (
      mode === CartItemMode.RENTA &&
      product.tipoAdquisicion === TipoAdquisicion.VENTA
    ) {
      return 'Producto disponible solo para venta';
    }

    if (
      mode === CartItemMode.RENTA &&
      (!product.rentalDailyPrice || product.rentalDailyPrice <= 0)
    ) {
      return 'Producto sin tarifa de renta configurada';
    }

    if (product.stock <= 0) {
      return 'Producto sin stock';
    }

    if (quantity > product.stock) {
      return 'La cantidad guardada supera el stock actual';
    }

    return null;
  }

  private isModeAllowed(tipoAdquisicion: TipoAdquisicion, mode: CartItemMode) {
    if (mode === CartItemMode.VENTA) {
      return tipoAdquisicion !== TipoAdquisicion.RENTA;
    }

    return tipoAdquisicion !== TipoAdquisicion.VENTA;
  }
}
