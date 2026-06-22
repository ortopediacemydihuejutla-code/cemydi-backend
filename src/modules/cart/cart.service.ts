import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, TipoAdquisicion } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../auth/types/auth-user.interface';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';

const MAX_CART_ITEM_QUANTITY = 25;

const cartInclude = {
  items: {
    orderBy: { updatedAt: 'desc' },
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
      await this.assertActiveUser(tx, currentUser.sub);
      const product = await this.ensurePurchasableProduct(tx, dto.productId);
      const cartRecord = await this.getOrCreateCart(tx, currentUser.sub);
      const existingItem = await tx.shoppingCartItem.findUnique({
        where: {
          cartId_productId: {
            cartId: cartRecord.id,
            productId: dto.productId,
          },
        },
        select: {
          id: true,
          quantity: true,
        },
      });

      const nextQuantity = (existingItem?.quantity ?? 0) + dto.quantity;
      this.assertValidQuantity(nextQuantity, product.stock);

      await tx.shoppingCartItem.upsert({
        where: {
          cartId_productId: {
            cartId: cartRecord.id,
            productId: dto.productId,
          },
        },
        create: {
          cartId: cartRecord.id,
          productId: dto.productId,
          quantity: dto.quantity,
        },
        update: {
          quantity: nextQuantity,
        },
      });

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
        },
      });

      if (!item) {
        throw new NotFoundException('Elemento del carrito no encontrado');
      }

      const product = await this.ensurePurchasableProduct(tx, item.productId);
      this.assertValidQuantity(dto.quantity, product.stock);

      await tx.shoppingCartItem.update({
        where: { id: itemId },
        data: {
          quantity: dto.quantity,
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
      await this.assertActiveUser(tx, currentUser.sub);
      const existingCart = await tx.shoppingCart.findUnique({
        where: { userId: currentUser.sub },
        select: { id: true },
      });

      if (!existingCart) {
        return this.findCartByUserId(tx, currentUser.sub);
      }

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

  private async assertActiveUser(db: CartDbClient, userId: number) {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, activo: true },
    });

    if (!user || !user.activo) {
      throw new UnauthorizedException('No autenticado');
    }
  }

  private async ensurePurchasableProduct(db: CartDbClient, productId: number) {
    const product = await db.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        activo: true,
        stock: true,
        tipoAdquisicion: true,
      },
    });

    if (!product || !product.activo) {
      throw new NotFoundException('Producto no encontrado');
    }

    if (product.tipoAdquisicion === TipoAdquisicion.RENTA) {
      throw new BadRequestException(
        'Este producto solo esta disponible para renta y no puede agregarse al carrito de compra',
      );
    }

    if (product.stock <= 0) {
      throw new BadRequestException('El producto no tiene stock disponible');
    }

    return product;
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
          hasUnavailableItems: false,
        },
      };
    }

    const items = cart.items.map((item) => {
      const isAvailable =
        item.product.activo &&
        item.product.stock > 0 &&
        item.quantity <= item.product.stock &&
        item.product.tipoAdquisicion !== TipoAdquisicion.RENTA;
      const maxQuantity = Math.max(
        0,
        Math.min(item.product.stock, MAX_CART_ITEM_QUANTITY),
      );
      const lineTotal = Number(
        (item.quantity * item.product.precio).toFixed(2),
      );

      return {
        id: item.id,
        quantity: item.quantity,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
        lineTotal,
        availability: {
          isAvailable,
          maxQuantity,
          reason: this.getAvailabilityReason(item.product, item.quantity),
        },
        product: {
          id: item.product.id,
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
          activo: item.product.activo,
          imageUrl: item.product.images[0]?.imageUrl ?? null,
        },
      };
    });

    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
    const subtotal = Number(
      items.reduce((sum, item) => sum + item.lineTotal, 0).toFixed(2),
    );

    return {
      id: cart.id,
      createdAt: cart.createdAt.toISOString(),
      updatedAt: cart.updatedAt.toISOString(),
      items,
      summary: {
        distinctItems: items.length,
        totalQuantity,
        subtotal,
        hasUnavailableItems: items.some(
          (item) => !item.availability.isAvailable,
        ),
      },
    };
  }

  private getAvailabilityReason(
    product: {
      activo: boolean;
      stock: number;
      tipoAdquisicion: TipoAdquisicion;
    },
    quantity: number,
  ) {
    if (!product.activo) {
      return 'Producto no disponible';
    }

    if (product.tipoAdquisicion === TipoAdquisicion.RENTA) {
      return 'Producto disponible solo para renta';
    }

    if (product.stock <= 0) {
      return 'Producto sin stock';
    }

    if (quantity > product.stock) {
      return 'La cantidad guardada supera el stock actual';
    }

    return null;
  }
}
