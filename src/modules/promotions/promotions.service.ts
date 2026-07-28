import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PromotionImageStrategy } from '@prisma/client';
import { assertAdmin } from '../../common/auth/assert-admin.util';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../auth/types/auth-user.interface';
import type { UploadedProductFile } from '../products/products-cloudinary.types';
import { ProductsCloudinaryService } from '../products/products-cloudinary.service';
import {
  CreatePromotionDto,
  PromotionImageStrategyInput,
} from './dto/create-promotion.dto';
import { UpdatePromotionDto } from './dto/update-promotion.dto';
import { calculateDiscountedPrice } from './promotion-pricing.util';

type FindPromotionsParams = {
  includeExpired: boolean;
  user?: AuthUser;
};

const promotionProductSelect = {
  id: true,
  slug: true,
  nombre: true,
  marca: true,
  modelo: true,
  clasificacion: true,
  precio: true,
  stock: true,
  activo: true,
  tipoAdquisicion: true,
  requiereReceta: true,
  images: {
    orderBy: { sortOrder: 'asc' as const },
    take: 1,
    select: { imageUrl: true },
  },
} satisfies Prisma.ProductSelect;

const promotionInclude = {
  products: {
    include: {
      product: {
        select: promotionProductSelect,
      },
    },
  },
} satisfies Prisma.PromotionInclude;

type PromotionCampaign = Prisma.PromotionGetPayload<{
  include: typeof promotionInclude;
}>;

@Injectable()
export class PromotionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: ProductsCloudinaryService,
  ) {}

  async findAll(params: FindPromotionsParams) {
    const db = this.prisma.forUser(params.user);
    const where: Prisma.PromotionWhereInput = {};

    if (params.includeExpired) {
      assertAdmin(params.user);
    } else {
      const now = new Date();
      where.startAt = { lte: now };
      where.endAt = { gte: now };
      where.products = {
        some: {
          product: {
            activo: true,
            stock: { gt: 0 },
          },
        },
      };
    }

    const campaigns = await db.promotion.findMany({
      where,
      include: promotionInclude,
      orderBy: [{ startAt: 'asc' }, { createdAt: 'desc' }],
    });

    if (params.includeExpired) {
      return {
        promotions: campaigns.map((campaign) =>
          this.serializeCampaign(campaign),
        ),
      };
    }

    return {
      promotions: campaigns.flatMap((campaign) =>
        this.serializePublicOffers(campaign),
      ),
    };
  }

  async create(dto: CreatePromotionDto, imageFile?: UploadedProductFile) {
    const { startAt, endAt } = this.parseDates(dto.startAt, dto.endAt);
    const productIds = this.parseProductIds(dto.productIds);
    await this.assertProductsExist(productIds);

    const imageStrategy = dto.imageStrategy as PromotionImageStrategy;
    const uploadedImage = await this.resolveNewCustomImage(
      imageStrategy,
      imageFile,
    );

    try {
      const campaign = await this.prisma.promotion.create({
        data: {
          discountPercent: dto.discountPercent,
          descripcion: dto.descripcion.trim(),
          startAt,
          endAt,
          imageStrategy,
          imageUrl: uploadedImage?.imageUrl ?? null,
          imageCloudinaryPublicId:
            uploadedImage?.cloudinaryPublicId ?? null,
          products: {
            create: productIds.map((productId) => ({ productId })),
          },
        },
        include: promotionInclude,
      });

      return {
        message: `Promoción creada para ${productIds.length} producto${productIds.length === 1 ? '' : 's'}`,
        promotion: this.serializeCampaign(campaign),
      };
    } catch (error) {
      if (uploadedImage) {
        await this.cloudinary.deleteUploadedImagesQuietly([uploadedImage]);
      }
      throw error;
    }
  }

  async update(
    id: number,
    dto: UpdatePromotionDto,
    imageFile?: UploadedProductFile,
  ) {
    const current = await this.prisma.promotion.findUnique({
      where: { id },
      include: promotionInclude,
    });

    if (!current) {
      throw new NotFoundException('Promoción no encontrada');
    }

    const nextStartAt = dto.startAt
      ? new Date(dto.startAt)
      : current.startAt;
    const nextEndAt = dto.endAt ? new Date(dto.endAt) : current.endAt;
    this.assertValidDates(nextStartAt, nextEndAt);

    const productIds =
      dto.productIds !== undefined
        ? this.parseProductIds(dto.productIds)
        : null;
    if (productIds) {
      await this.assertProductsExist(productIds);
    }

    const nextStrategy =
      (dto.imageStrategy as PromotionImageStrategy | undefined) ??
      current.imageStrategy;
    let uploadedImage: Awaited<
      ReturnType<ProductsCloudinaryService['uploadPromotionImage']>
    > | null = null;

    if (nextStrategy === PromotionImageStrategy.CUSTOM && imageFile) {
      uploadedImage = await this.cloudinary.uploadPromotionImage(imageFile);
    } else if (
      nextStrategy === PromotionImageStrategy.CUSTOM &&
      !current.imageUrl
    ) {
      throw new BadRequestException(
        'Agrega una imagen personalizada para esta promoción',
      );
    } else if (
      nextStrategy === PromotionImageStrategy.AUTO &&
      imageFile
    ) {
      throw new BadRequestException(
        'No adjuntes una imagen cuando el modo automático está activo',
      );
    }

    const data: Prisma.PromotionUpdateInput = {
      ...(dto.discountPercent !== undefined
        ? { discountPercent: dto.discountPercent }
        : {}),
      ...(dto.descripcion !== undefined
        ? { descripcion: dto.descripcion.trim() }
        : {}),
      ...(dto.startAt !== undefined ? { startAt: nextStartAt } : {}),
      ...(dto.endAt !== undefined ? { endAt: nextEndAt } : {}),
      imageStrategy: nextStrategy,
      imageUrl:
        nextStrategy === PromotionImageStrategy.AUTO
          ? null
          : uploadedImage?.imageUrl ?? current.imageUrl,
      imageCloudinaryPublicId:
        nextStrategy === PromotionImageStrategy.AUTO
          ? null
          : uploadedImage?.cloudinaryPublicId ??
            current.imageCloudinaryPublicId,
      ...(productIds
        ? {
            products: {
              deleteMany: {},
              create: productIds.map((productId) => ({ productId })),
            },
          }
        : {}),
    };

    try {
      const campaign = await this.prisma.promotion.update({
        where: { id },
        data,
        include: promotionInclude,
      });

      const shouldDeletePreviousImage =
        Boolean(current.imageCloudinaryPublicId) &&
        (nextStrategy === PromotionImageStrategy.AUTO ||
          Boolean(uploadedImage));
      if (shouldDeletePreviousImage) {
        await this.cloudinary.deleteUploadedImagesQuietly([
          {
            imageUrl: current.imageUrl ?? '',
            cloudinaryPublicId: current.imageCloudinaryPublicId,
          },
        ]);
      }

      return {
        message: 'Promoción actualizada correctamente',
        promotion: this.serializeCampaign(campaign),
      };
    } catch (error) {
      if (uploadedImage) {
        await this.cloudinary.deleteUploadedImagesQuietly([uploadedImage]);
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('Promoción no encontrada');
      }
      throw error;
    }
  }

  async remove(id: number) {
    const current = await this.prisma.promotion.findUnique({
      where: { id },
      select: {
        id: true,
        imageUrl: true,
        imageCloudinaryPublicId: true,
      },
    });

    if (!current) {
      throw new NotFoundException('Promoción no encontrada');
    }

    await this.prisma.promotion.delete({ where: { id } });

    if (current.imageCloudinaryPublicId) {
      await this.cloudinary.deleteUploadedImagesQuietly([
        {
          imageUrl: current.imageUrl ?? '',
          cloudinaryPublicId: current.imageCloudinaryPublicId,
        },
      ]);
    }

    return { message: 'Promoción eliminada correctamente' };
  }

  private serializeCampaign(campaign: PromotionCampaign) {
    const products = campaign.products
      .map(({ product }) => this.serializeProduct(product))
      .sort((a, b) =>
        a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }),
      );

    return {
      ...campaign,
      products,
      productCount: products.length,
      displayImageUrl:
        campaign.imageStrategy === PromotionImageStrategy.CUSTOM
          ? campaign.imageUrl
          : products[0]?.imageUrl ?? null,
    };
  }

  private serializePublicOffers(campaign: PromotionCampaign) {
    return campaign.products
      .map(({ product }) => this.serializeProduct(product))
      .filter((product) => product.activo && product.stock > 0)
      .map((product) => ({
        id: campaign.id,
        productId: product.id,
        discountPercent: campaign.discountPercent,
        discountedPrice: calculateDiscountedPrice(
          product.precio,
          campaign.discountPercent,
        ),
        descripcion: campaign.descripcion,
        startAt: campaign.startAt,
        endAt: campaign.endAt,
        imageStrategy: campaign.imageStrategy,
        imageUrl:
          campaign.imageStrategy === PromotionImageStrategy.CUSTOM
            ? campaign.imageUrl
            : product.imageUrl,
        createdAt: campaign.createdAt,
        product,
      }));
  }

  private serializeProduct(
    product: PromotionCampaign['products'][number]['product'],
  ) {
    const { images, ...data } = product;
    return {
      ...data,
      imageUrl: images[0]?.imageUrl ?? null,
    };
  }

  private parseDates(startValue: string, endValue: string) {
    const startAt = new Date(startValue);
    const endAt = new Date(endValue);
    this.assertValidDates(startAt, endAt);
    return { startAt, endAt };
  }

  private assertValidDates(startAt: Date, endAt: Date) {
    if (
      Number.isNaN(startAt.getTime()) ||
      Number.isNaN(endAt.getTime())
    ) {
      throw new BadRequestException('Fechas de promoción inválidas');
    }
    if (startAt >= endAt) {
      throw new BadRequestException(
        'La fecha final debe ser posterior a la fecha de inicio',
      );
    }
  }

  private parseProductIds(raw: string) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new BadRequestException('La selección de productos es inválida');
    }

    if (!Array.isArray(parsed)) {
      throw new BadRequestException('Selecciona al menos un producto');
    }

    const productIds = Array.from(
      new Set(
        parsed.map((value) =>
          typeof value === 'number' ? value : Number(value),
        ),
      ),
    );

    if (
      productIds.length === 0 ||
      productIds.length > 100 ||
      productIds.some(
        (productId) =>
          !Number.isInteger(productId) || productId <= 0,
      )
    ) {
      throw new BadRequestException(
        'Selecciona entre 1 y 100 productos válidos',
      );
    }

    return productIds;
  }

  private async assertProductsExist(productIds: number[]) {
    const count = await this.prisma.product.count({
      where: { id: { in: productIds } },
    });
    if (count !== productIds.length) {
      throw new BadRequestException(
        'Uno o más productos seleccionados ya no existen',
      );
    }
  }

  private async resolveNewCustomImage(
    imageStrategy: PromotionImageStrategy,
    imageFile?: UploadedProductFile,
  ) {
    if (imageStrategy === PromotionImageStrategy.AUTO) {
      if (imageFile) {
        throw new BadRequestException(
          'No adjuntes una imagen cuando el modo automático está activo',
        );
      }
      return null;
    }

    if (
      imageStrategy !==
      (PromotionImageStrategyInput.CUSTOM as PromotionImageStrategy)
    ) {
      throw new BadRequestException('Modo de imagen inválido');
    }
    if (!imageFile) {
      throw new BadRequestException(
        'Agrega una imagen personalizada para esta promoción',
      );
    }
    return this.cloudinary.uploadPromotionImage(imageFile);
  }
}
