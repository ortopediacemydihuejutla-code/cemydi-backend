import { Injectable } from '@nestjs/common';
import { RentalRequestStatus, ReviewStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type AdminNotificationCategory = 'rental' | 'review' | 'inventory';

export type AdminNotificationItem = {
  id: string;
  category: AdminNotificationCategory;
  title: string;
  description: string;
  occurredAt: string;
  href: string;
};

const DEFAULT_LIMIT = 40;

@Injectable()
export class AdminNotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async listCurrent(limit = DEFAULT_LIMIT): Promise<{
    items: AdminNotificationItem[];
    checkedAt: string;
  }> {
    const take = Math.min(Math.max(limit, 1), 50);
    const checkedAt = new Date();

    const [rentals, reviews, lowStockProducts] = await Promise.all([
      this.prisma.rentalRequest.findMany({
        where: { status: RentalRequestStatus.PENDING },
        orderBy: { createdAt: 'desc' },
        take,
        select: {
          id: true,
          folio: true,
          createdAt: true,
          user: { select: { nombre: true, correo: true } },
        },
      }),
      this.prisma.review.findMany({
        where: { status: ReviewStatus.PENDING },
        orderBy: { createdAt: 'desc' },
        take,
        select: {
          id: true,
          rating: true,
          createdAt: true,
          product: { select: { nombre: true } },
          user: { select: { nombre: true, correo: true } },
        },
      }),
      this.prisma.product.findMany({
        where: { activo: true, stock: { lt: 5 } },
        orderBy: [{ stock: 'asc' }, { createdAt: 'desc' }],
        take,
        select: {
          id: true,
          nombre: true,
          stock: true,
        },
      }),
    ]);

    const items: AdminNotificationItem[] = [
      ...rentals.map((rental) => ({
        id: `rental:${rental.id}`,
        category: 'rental' as const,
        title: 'Nueva solicitud de renta',
        description: `${rental.folio ?? `Solicitud ${rental.id.slice(0, 8)}`} · ${rental.user.nombre || rental.user.correo}`,
        occurredAt: rental.createdAt.toISOString(),
        href: '/admin/rentals',
      })),
      ...reviews.map((review) => ({
        id: `review:${review.id}`,
        category: 'review' as const,
        title: 'Nueva reseña por moderar',
        description: `${review.product.nombre} · ${review.user.nombre || review.user.correo} · ${review.rating}/5 estrellas`,
        occurredAt: review.createdAt.toISOString(),
        href: '/admin/reviews',
      })),
      ...lowStockProducts.map((product) => ({
        id: `inventory:${product.id}`,
        category: 'inventory' as const,
        title: product.stock === 0 ? 'Producto agotado' : 'Inventario bajo',
        description:
          product.stock === 0
            ? `${product.nombre} no tiene existencias.`
            : `${product.nombre} · ${product.stock === 1 ? 'queda' : 'quedan'} ${product.stock} ${product.stock === 1 ? 'unidad' : 'unidades'}.`,
        occurredAt: checkedAt.toISOString(),
        href: '/admin/products',
      })),
    ];

    items.sort(
      (a, b) =>
        new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
    );

    return {
      items: items.slice(0, take),
      checkedAt: checkedAt.toISOString(),
    };
  }
}
