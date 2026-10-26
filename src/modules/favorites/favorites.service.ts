import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../auth/types/auth-user.interface';

@Injectable()
export class FavoritesService {
  constructor(private readonly prisma: PrismaService) {}

  private get favoriteDelegate() {
    return this.prisma.favorite;
  }

  async listMine(user: AuthUser) {
    let productIds: number[] = [];

    if (this.favoriteDelegate?.findMany) {
      const favorites = await this.favoriteDelegate.findMany({
        where: { userId: user.id },
        select: { productId: true },
        orderBy: { createdAt: 'desc' },
      });
      productIds = favorites.map((f) => f.productId);
    } else {
      const rows = await this.prisma.$queryRawUnsafe<{ productId: number }[]>(
        'SELECT "productId" FROM accounts.favorites WHERE "userId" = $1 ORDER BY "createdAt" DESC',
        user.id,
      );
      productIds = (rows || []).map((r) => r.productId);
    }

    if (productIds.length === 0) {
      return {
        products: [],
        favoriteIds: [],
        total: 0,
      };
    }

    const rawProducts = await this.prisma.product.findMany({
      where: {
        id: { in: productIds },
        activo: true,
      },
      include: {
        images: {
          orderBy: {
            sortOrder: 'asc',
          },
        },
      },
    });

    const productMap = new Map(rawProducts.map((p) => [p.id, p]));
    const orderedProducts = productIds
      .map((id) => productMap.get(id))
      .filter((p): p is (typeof rawProducts)[number] => Boolean(p));

    const products = orderedProducts.map((prod) => {
      const images = (prod.images || []).map((img) => ({
        id: img.id,
        imageUrl: img.imageUrl,
        sortOrder: img.sortOrder,
        createdAt: img.createdAt.toISOString
          ? img.createdAt.toISOString()
          : String(img.createdAt),
      }));

      return {
        ...prod,
        createdAt: prod.createdAt.toISOString
          ? prod.createdAt.toISOString()
          : String(prod.createdAt),
        imageUrl: images[0]?.imageUrl ?? null,
        images,
      };
    });

    return {
      products,
      favoriteIds: products.map((p) => p.id),
      total: products.length,
    };
  }

  async listMyIds(user: AuthUser) {
    if (this.favoriteDelegate?.findMany) {
      const items = await this.favoriteDelegate.findMany({
        where: { userId: user.id },
        select: { productId: true },
      });
      return {
        favoriteIds: items.map((i) => i.productId),
      };
    }

    const rows = await this.prisma.$queryRawUnsafe<{ productId: number }[]>(
      'SELECT "productId" FROM accounts.favorites WHERE "userId" = $1',
      user.id,
    );

    return {
      favoriteIds: (rows || []).map((r) => r.productId),
    };
  }

  async add(user: AuthUser, productId: number) {
    if (!Number.isInteger(productId) || productId <= 0) {
      throw new BadRequestException('ID de producto invalido');
    }

    const product = await this.prisma.product.findFirst({
      where: { id: productId, activo: true },
      select: { id: true },
    });

    if (!product) {
      throw new NotFoundException('Producto no encontrado o no disponible');
    }

    if (this.favoriteDelegate?.upsert) {
      await this.favoriteDelegate.upsert({
        where: {
          userId_productId: {
            userId: user.id,
            productId,
          },
        },
        create: {
          userId: user.id,
          productId,
        },
        update: {},
      });
    } else {
      await this.prisma.$executeRawUnsafe(
        'INSERT INTO accounts.favorites ("userId", "productId") VALUES ($1, $2) ON CONFLICT ("userId", "productId") DO NOTHING',
        user.id,
        productId,
      );
    }

    return {
      message: 'Producto guardado en favoritos',
      favorited: true,
      productId,
    };
  }

  async remove(user: AuthUser, productId: number) {
    if (!Number.isInteger(productId) || productId <= 0) {
      throw new BadRequestException('ID de producto invalido');
    }

    if (this.favoriteDelegate?.deleteMany) {
      await this.favoriteDelegate.deleteMany({
        where: {
          userId: user.id,
          productId,
        },
      });
    } else {
      await this.prisma.$executeRawUnsafe(
        'DELETE FROM accounts.favorites WHERE "userId" = $1 AND "productId" = $2',
        user.id,
        productId,
      );
    }

    return {
      message: 'Producto eliminado de favoritos',
      favorited: false,
      productId,
    };
  }

  async toggle(user: AuthUser, productId: number) {
    if (!Number.isInteger(productId) || productId <= 0) {
      throw new BadRequestException('ID de producto invalido');
    }

    let isFavorited = false;

    if (this.favoriteDelegate?.findUnique) {
      const existing = await this.favoriteDelegate.findUnique({
        where: {
          userId_productId: {
            userId: user.id,
            productId,
          },
        },
      });
      isFavorited = Boolean(existing);
    } else {
      const rows = await this.prisma.$queryRawUnsafe<{ id: number }[]>(
        'SELECT id FROM accounts.favorites WHERE "userId" = $1 AND "productId" = $2 LIMIT 1',
        user.id,
        productId,
      );
      isFavorited = (rows || []).length > 0;
    }

    if (isFavorited) {
      return this.remove(user, productId);
    }

    return this.add(user, productId);
  }
}
