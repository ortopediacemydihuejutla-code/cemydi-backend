import { Injectable } from '@nestjs/common';
import { ReviewStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type AdminActivityItem = {
  id: string;
  category: 'product' | 'user' | 'review' | 'promotion' | 'supplier';
  title: string;
  occurredAt: string;
  href: string;
};

const DEFAULT_LIMIT = 20;
const LOOKBACK_DAYS = 30;

@Injectable()
export class AdminActivityService {
  constructor(private readonly prisma: PrismaService) {}

  async listRecent(
    limit = DEFAULT_LIMIT,
  ): Promise<{ items: AdminActivityItem[] }> {
    const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000);
    const take = Math.min(Math.max(limit, 1), 50);

    const [products, users, reviews, promotions, suppliers] = await Promise.all(
      [
        this.prisma.product.findMany({
          where: { createdAt: { gte: since } },
          orderBy: { createdAt: 'desc' },
          take,
          select: { id: true, nombre: true, createdAt: true },
        }),
        this.prisma.user.findMany({
          where: { createdAt: { gte: since } },
          orderBy: { createdAt: 'desc' },
          take,
          select: { id: true, nombre: true, correo: true, createdAt: true },
        }),
        this.prisma.review.findMany({
          where: { createdAt: { gte: since } },
          orderBy: { createdAt: 'desc' },
          take,
          select: {
            id: true,
            status: true,
            createdAt: true,
            product: { select: { nombre: true } },
            user: { select: { correo: true } },
          },
        }),
        this.prisma.promotion.findMany({
          where: { createdAt: { gte: since } },
          orderBy: { createdAt: 'desc' },
          take,
          select: {
            id: true,
            descripcion: true,
            createdAt: true,
            products: {
              take: 1,
              select: { product: { select: { nombre: true } } },
            },
            _count: { select: { products: true } },
          },
        }),
        this.prisma.supplier.findMany({
          where: { createdAt: { gte: since } },
          orderBy: { createdAt: 'desc' },
          take,
          select: { id: true, nombre: true, createdAt: true },
        }),
      ],
    );

    const items: AdminActivityItem[] = [
      ...products.map((row) => ({
        id: `product:${row.id}:${row.createdAt.toISOString()}`,
        category: 'product' as const,
        title: `Producto añadido: ${row.nombre}`,
        occurredAt: row.createdAt.toISOString(),
        href: `/admin/products/${row.id}/edit`,
      })),
      ...users.map((row) => ({
        id: `user:${row.id}:${row.createdAt.toISOString()}`,
        category: 'user' as const,
        title: `Nuevo usuario: ${row.correo}`,
        occurredAt: row.createdAt.toISOString(),
        href: '/admin/users',
      })),
      ...reviews.map((row) => ({
        id: `review:${row.id}:${row.createdAt.toISOString()}`,
        category: 'review' as const,
        title:
          row.status === ReviewStatus.PENDING
            ? `Reseña pendiente en ${row.product.nombre} (${row.user.correo})`
            : row.status === ReviewStatus.APPROVED
              ? `Reseña aprobada en ${row.product.nombre}`
              : `Reseña rechazada en ${row.product.nombre}`,
        occurredAt: row.createdAt.toISOString(),
        href: '/admin/reviews',
      })),
      ...promotions.map((row) => ({
        id: `promotion:${row.id}:${row.createdAt.toISOString()}`,
        category: 'promotion' as const,
        title: `Promoción creada: ${
          row.descripcion ||
          row.products[0]?.product.nombre ||
          `${row._count.products} productos`
        }`,
        occurredAt: row.createdAt.toISOString(),
        href: '/admin/promotions',
      })),
      ...suppliers.map((row) => ({
        id: `supplier:${row.id}:${row.createdAt.toISOString()}`,
        category: 'supplier' as const,
        title: `Proveedor registrado: ${row.nombre}`,
        occurredAt: row.createdAt.toISOString(),
        href: '/admin/suppliers',
      })),
    ];

    items.sort(
      (a, b) =>
        new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
    );

    return { items: items.slice(0, take) };
  }
}
