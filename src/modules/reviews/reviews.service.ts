import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, ReviewStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../auth/types/auth-user.interface';
import { CreateReviewDto } from './dto/create-review.dto';

@Injectable()
export class ReviewsService {
  private static readonly HOME_TESTIMONIALS_MIN = 3;
  private static readonly HOME_TESTIMONIALS_MAX = 8;

  constructor(private readonly prisma: PrismaService) {}

  async listApprovedByProduct(productId: number) {
    const reviews = await this.prisma.asReader().review.findMany({
      where: {
        productId,
        status: ReviewStatus.APPROVED,
      },
      include: {
        user: {
          select: {
            id: true,
            nombre: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const count = reviews.length;
    const sum = reviews.reduce((acc, item) => acc + item.rating, 0);
    const averageRating = count > 0 ? Number((sum / count).toFixed(2)) : 0;

    return {
      reviews: reviews.map((item) => ({
        id: item.id,
        rating: item.rating,
        comment: item.comment,
        createdAt: item.createdAt,
        user: item.user,
      })),
      summary: {
        count,
        averageRating,
      },
    };
  }

  async listHomeTestimonials() {
    const reviews = await this.prisma.asReader().review.findMany({
      where: {
        status: ReviewStatus.APPROVED,
        showOnHome: true,
      },
      include: {
        product: {
          select: {
            id: true,
            nombre: true,
            clasificacion: true,
          },
        },
        user: {
          select: {
            id: true,
            nombre: true,
          },
        },
      },
      orderBy: [{ approvedAt: 'desc' }, { createdAt: 'desc' }],
      take: ReviewsService.HOME_TESTIMONIALS_MAX,
    });

    const hasMinimum = reviews.length >= ReviewsService.HOME_TESTIMONIALS_MIN;

    return {
      testimonials: hasMinimum
        ? reviews.map((item) => ({
            id: item.id,
            rating: item.rating,
            comment: item.comment,
            createdAt: item.createdAt,
            product: item.product,
            user: item.user,
          }))
        : [],
      meta: {
        min: ReviewsService.HOME_TESTIMONIALS_MIN,
        max: ReviewsService.HOME_TESTIMONIALS_MAX,
        selectedCount: reviews.length,
      },
    };
  }

  async submit(currentUser: AuthUser, dto: CreateReviewDto) {
    const db = this.prisma.forUser(currentUser);

    const user = await db.user.findUnique({
      where: { id: currentUser.sub },
      select: { id: true, activo: true },
    });

    if (!user || !user.activo) {
      throw new UnauthorizedException('No autenticado');
    }

    const product = await db.product.findUnique({
      where: { id: dto.productId },
      select: { id: true, activo: true },
    });

    if (!product || !product.activo) {
      throw new NotFoundException('Producto no encontrado');
    }

    const status = ReviewStatus.PENDING;

    const review = await db.review.upsert({
      where: {
        userId_productId: {
          userId: currentUser.sub,
          productId: dto.productId,
        },
      },
      create: {
        productId: dto.productId,
        userId: currentUser.sub,
        rating: dto.rating,
        comment: dto.comment.trim(),
        status,
        showOnHome: false,
        approvedAt: null,
        approvedById: null,
      },
      update: {
        rating: dto.rating,
        comment: dto.comment.trim(),
        status,
        showOnHome: false,
        approvedAt: null,
        approvedById: null,
      },
    });

    return {
      message: 'Reseña enviada y pendiente de moderación',
      review: this.toClientReview(review),
    };
  }

  async getMyByProduct(currentUser: AuthUser, productId: number) {
    const review = await this.prisma.forUser(currentUser).review.findUnique({
      where: {
        userId_productId: {
          userId: currentUser.sub,
          productId,
        },
      },
    });

    return {
      review: review ? this.toClientReview(review) : null,
    };
  }

  async listMine(currentUser: AuthUser) {
    const reviews = await this.prisma.forUser(currentUser).review.findMany({
      where: {
        userId: currentUser.sub,
      },
      include: {
        product: {
          select: {
            id: true,
            slug: true,
            nombre: true,
            marca: true,
            modelo: true,
            images: {
              select: { imageUrl: true },
              orderBy: { sortOrder: 'asc' },
              take: 1,
            },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return {
      reviews: reviews.map((review) => ({
        ...this.toClientReview(review),
        product: {
          id: review.product.id,
          slug: review.product.slug,
          nombre: review.product.nombre,
          marca: review.product.marca,
          modelo: review.product.modelo,
          imageUrl: review.product.images[0]?.imageUrl ?? null,
        },
      })),
    };
  }

  async listForAdmin(params: { status?: string; userId?: number }) {
    const where: Prisma.ReviewWhereInput = {};

    if (params.status && params.status !== 'ALL') {
      if (
        params.status !== ReviewStatus.PENDING &&
        params.status !== ReviewStatus.APPROVED &&
        params.status !== ReviewStatus.REJECTED
      ) {
        throw new BadRequestException('Estado de reseña inválido');
      }

      where.status = params.status as ReviewStatus;
    }

    if (params.userId !== undefined) {
      where.userId = params.userId;
    }

    const reviews = await this.prisma.review.findMany({
      where,
      include: {
        product: {
          select: {
            id: true,
            nombre: true,
          },
        },
        user: {
          select: {
            id: true,
            nombre: true,
            correo: true,
          },
        },
        approvedBy: {
          select: {
            id: true,
            nombre: true,
            correo: true,
          },
        },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });

    return { reviews };
  }

  async setShowOnHome(id: number, showOnHome: boolean) {
    try {
      if (showOnHome) {
        const existing = await this.prisma.review.findUnique({
          where: { id },
          select: { status: true, showOnHome: true },
        });

        if (!existing) {
          throw new NotFoundException('Reseña no encontrada');
        }

        if (existing.status !== ReviewStatus.APPROVED) {
          throw new BadRequestException(
            'Solo las reseñas aprobadas pueden mostrarse en inicio',
          );
        }

        if (!existing.showOnHome) {
          const currentCount = await this.prisma.review.count({
            where: {
              status: ReviewStatus.APPROVED,
              showOnHome: true,
            },
          });

          if (currentCount >= ReviewsService.HOME_TESTIMONIALS_MAX) {
            throw new BadRequestException(
              `Solo puedes mostrar hasta ${ReviewsService.HOME_TESTIMONIALS_MAX} reseñas en inicio`,
            );
          }
        }
      }

      const review = await this.prisma.review.update({
        where: { id },
        data: { showOnHome },
        include: {
          product: {
            select: {
              id: true,
              nombre: true,
            },
          },
          user: {
            select: {
              id: true,
              nombre: true,
              correo: true,
            },
          },
          approvedBy: {
            select: {
              id: true,
              nombre: true,
              correo: true,
            },
          },
        },
      });

      return {
        message: showOnHome
          ? 'Reseña marcada para mostrarse en inicio'
          : 'Reseña ocultada de inicio',
        review,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('Reseña no encontrada');
      }

      throw error;
    }
  }

  async approve(currentUser: AuthUser, id: number) {
    try {
      const review = await this.prisma.review.update({
        where: { id },
        data: {
          status: ReviewStatus.APPROVED,
          approvedAt: new Date(),
          approvedById: currentUser.sub,
        },
        include: {
          product: {
            select: {
              id: true,
              nombre: true,
            },
          },
          user: {
            select: {
              id: true,
              nombre: true,
              correo: true,
            },
          },
          approvedBy: {
            select: {
              id: true,
              nombre: true,
              correo: true,
            },
          },
        },
      });

      return {
        message: 'Reseña aprobada y publicada',
        review,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('Reseña no encontrada');
      }

      throw error;
    }
  }

  async remove(id: number) {
    try {
      await this.prisma.review.delete({
        where: { id },
      });

      return { message: 'Reseña eliminada correctamente' };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('Reseña no encontrada');
      }

      throw error;
    }
  }

  private toClientReview(review: {
    id: number;
    rating: number;
    comment: string;
    status: ReviewStatus;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: review.id,
      rating: review.rating,
      comment: review.comment,
      status: review.status,
      createdAt: review.createdAt,
      updatedAt: review.updatedAt,
    };
  }
}
