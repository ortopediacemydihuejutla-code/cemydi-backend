import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TipoAdquisicion } from '@prisma/client';
import { assertAdmin } from '../../common/auth/assert-admin.util';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../auth/types/auth-user.interface';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import {
  areEquivalentClassifications,
  canonicalizeClassification,
} from './products-classification.util';
import { ProductsCloudinaryService } from './products-cloudinary.service';
import type { UploadedProductFile } from './products-cloudinary.types';

type FindProductsQuery = {
  search?: string;
  clasificaciones: string[];
  marcas: string[];
  tipos: string[];
  requiereRecetaRaw?: string;
  includeInactive: boolean;
  soloDisponibles?: boolean;
  sort?: string;
  pageRaw?: string;
  pageSizeRaw?: string;
};

function buildProductSearchFilter(term: string): Prisma.ProductWhereInput {
  const tokens = term
    .trim()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    return {};
  }

  return {
    AND: tokens.map((token) => ({
      OR: [
        { nombre: { contains: token, mode: 'insensitive' } },
        { marca: { contains: token, mode: 'insensitive' } },
        { modelo: { contains: token, mode: 'insensitive' } },
        { clasificacion: { contains: token, mode: 'insensitive' } },
        { proveedor: { contains: token, mode: 'insensitive' } },
        { descripcion: { contains: token, mode: 'insensitive' } },
      ],
    })),
  };
}

function resolveProductOrderBy(
  sort?: string,
): Prisma.Enumerable<Prisma.ProductOrderByWithRelationInput> {
  switch (sort) {
    case 'precio-asc':
      return { precio: 'asc' };
    case 'precio-desc':
      return { precio: 'desc' };
    case 'disponibles':
      return [{ stock: 'desc' }, { createdAt: 'desc' }];
    case 'popular':
      return [
        { reviews: { _count: 'desc' } },
        { stock: 'desc' },
        { createdAt: 'desc' },
      ];
    case 'nombre-asc':
      return { nombre: 'asc' };
    case 'nombre-desc':
      return { nombre: 'desc' };
    default:
      return { createdAt: 'desc' };
  }
}

const productInclude = {
  images: {
    orderBy: {
      sortOrder: 'asc',
    },
  },
} satisfies Prisma.ProductInclude;

type ProductWithImages = Prisma.ProductGetPayload<{
  include: typeof productInclude;
}>;

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly productsCloudinaryService: ProductsCloudinaryService,
  ) {}

  async findAll(query: FindProductsQuery, user?: AuthUser) {
    const db = this.prisma.forUser(user);
    const andFilters: Prisma.ProductWhereInput[] = [];
    const validTipos = query.tipos.filter(
      (value): value is TipoAdquisicion =>
        value === 'VENTA' || value === 'RENTA' || value === 'MIXTO',
    );

    if (query.includeInactive) {
      assertAdmin(user);
    } else {
      andFilters.push({ activo: true });
    }

    if (query.clasificaciones.length > 0) {
      const productClassificationRows = await db.product.findMany({
        where: query.includeInactive ? {} : { activo: true },
        select: { clasificacion: true },
        distinct: ['clasificacion'],
      });

      const matchedClassifications = productClassificationRows
        .map((item) => item.clasificacion.trim())
        .filter((value) =>
          query.clasificaciones.some((selected) =>
            areEquivalentClassifications(value, selected),
          ),
        );

      andFilters.push({
        clasificacion: {
          in:
            matchedClassifications.length > 0
              ? matchedClassifications
              : query.clasificaciones,
        },
      });
    }

    if (validTipos.length > 0) {
      andFilters.push({ tipoAdquisicion: { in: validTipos } });
    }

    if (query.marcas.length > 0) {
      andFilters.push({
        OR: query.marcas.map((marca) => ({
          marca: { equals: marca.trim(), mode: 'insensitive' },
        })),
      });
    }

    if (query.requiereRecetaRaw === 'true') {
      andFilters.push({ requiereReceta: true });
    } else if (query.requiereRecetaRaw === 'false') {
      andFilters.push({ requiereReceta: false });
    }

    if (query.soloDisponibles) {
      andFilters.push({ stock: { gt: 0 } });
    }

    if (query.search?.trim()) {
      andFilters.push(buildProductSearchFilter(query.search));
    }

    const where: Prisma.ProductWhereInput =
      andFilters.length > 0 ? { AND: andFilters } : {};

    const parsedPage = Number(query.pageRaw ?? '');
    const parsedPageSize = Number(query.pageSizeRaw ?? '');
    const paginationRequested =
      query.pageRaw !== undefined || query.pageSizeRaw !== undefined;
    const pageSize =
      Number.isInteger(parsedPageSize) && parsedPageSize > 0
        ? Math.min(parsedPageSize, 60)
        : 9;
    const requestedPage =
      Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;

    let products: ProductWithImages[] = [];
    let total = 0;
    let page = 1;
    let totalPages = 1;

    if (paginationRequested) {
      total = await db.product.count({ where });
      totalPages = Math.max(1, Math.ceil(total / pageSize));
      page = Math.min(requestedPage, totalPages);
      const skip = (page - 1) * pageSize;

      products = await db.product.findMany({
        where,
        include: productInclude,
        orderBy: resolveProductOrderBy(query.sort),
        skip,
        take: pageSize,
      });
    } else {
      products = await db.product.findMany({
        where,
        include: productInclude,
        orderBy: resolveProductOrderBy(query.sort),
      });
      total = products.length;
      totalPages = 1;
      page = 1;
    }

    const activeProductsWhere: Prisma.ProductWhereInput = query.includeInactive
      ? {}
      : { activo: true };

    const [
      productClassifications,
      catalogClassifications,
      productMarcas,
      catalogBrands,
    ] = await Promise.all([
      db.product.findMany({
        where: activeProductsWhere,
        select: { clasificacion: true },
        distinct: ['clasificacion'],
        orderBy: { clasificacion: 'asc' },
      }),
      db.classification.findMany({
        select: { nombre: true },
        orderBy: { nombre: 'asc' },
      }),
      db.product.findMany({
        where: activeProductsWhere,
        select: { marca: true },
        distinct: ['marca'],
        orderBy: { marca: 'asc' },
      }),
      db.brand.findMany({
        select: { nombre: true },
        orderBy: { nombre: 'asc' },
      }),
    ]);

    const clasificaciones: string[] = [];

    for (const value of [
      ...catalogClassifications.map((item) => item.nombre.trim()),
      ...productClassifications.map((item) => item.clasificacion.trim()),
    ].filter(Boolean)) {
      const existingIndex = clasificaciones.findIndex((item) =>
        areEquivalentClassifications(item, value),
      );

      if (existingIndex === -1) {
        clasificaciones.push(value);
        continue;
      }

      if (
        !clasificaciones[existingIndex].includes('\uFFFD') &&
        value.includes('\uFFFD')
      ) {
        continue;
      }

      if (
        clasificaciones[existingIndex].includes('\uFFFD') &&
        !value.includes('\uFFFD')
      ) {
        clasificaciones[existingIndex] = value;
      }
    }

    clasificaciones.sort((a, b) =>
      a.localeCompare(b, 'es', { sensitivity: 'base' }),
    );

    const marcas = [
      ...new Set(
        [
          ...catalogBrands.map((item) => item.nombre.trim()),
          ...productMarcas.map((item) => item.marca.trim()),
        ].filter(Boolean),
      ),
    ].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));

    return {
      products: products.map((product) => this.mapProduct(product)),
      filters: {
        clasificaciones,
        marcas,
      },
      pagination: {
        page,
        pageSize: paginationRequested ? pageSize : products.length || 1,
        total,
        totalPages,
        hasPrevious: page > 1,
        hasNext: page < totalPages,
      },
    };
  }

  async findOne(id: number, includeInactive: boolean, user?: AuthUser) {
    const db = this.prisma.forUser(user);
    const where: Prisma.ProductWhereInput = { id };

    if (includeInactive) {
      assertAdmin(user);
    } else {
      where.activo = true;
    }

    const product = await db.product.findFirst({
      where,
      include: productInclude,
    });

    if (!product) {
      throw new NotFoundException('Producto no encontrado');
    }

    return { product: this.mapProduct(product) };
  }

  async create(dto: CreateProductDto, files: UploadedProductFile[] = []) {
    this.productsCloudinaryService.validateImageOperation(
      dto.imageUrls ?? [],
      files,
    );
    const uploadedImages =
      await this.productsCloudinaryService.uploadProductImages(
        dto.imageUrls ?? [],
        files,
      );

    try {
      const product = await this.prisma.product.create({
        data: {
          nombre: dto.nombre.trim(),
          marca: dto.marca.trim(),
          modelo: dto.modelo.trim(),
          descripcion: dto.descripcion.trim(),
          precio: dto.precio,
          clasificacion: canonicalizeClassification(dto.clasificacion),
          stock: dto.stock,
          proveedor: dto.proveedor.trim(),
          tipoAdquisicion: dto.tipoAdquisicion,
          requiereReceta: dto.requiereReceta ?? false,
          activo: dto.activo ?? true,
          images: uploadedImages.length
            ? {
                create: uploadedImages.map((image, index) => ({
                  imageUrl: image.imageUrl,
                  cloudinaryPublicId: image.cloudinaryPublicId,
                  sortOrder: index,
                })),
              }
            : undefined,
        },
        include: productInclude,
      });

      return {
        message: 'Producto creado correctamente',
        product: this.mapProduct(product),
      };
    } catch (error) {
      await this.productsCloudinaryService.deleteUploadedImagesQuietly(
        uploadedImages,
      );
      throw error;
    }
  }

  async update(
    id: number,
    dto: UpdateProductDto,
    files: UploadedProductFile[] = [],
  ) {
    const existing = await this.prisma.product.findUnique({
      where: { id },
      include: productInclude,
    });

    if (!existing) {
      throw new NotFoundException('Producto no encontrado');
    }

    this.productsCloudinaryService.validateImageOperation(
      dto.imageUrls ?? [],
      files,
    );

    const data: Prisma.ProductUpdateInput = {};

    if (dto.nombre !== undefined) data.nombre = dto.nombre.trim();
    if (dto.marca !== undefined) data.marca = dto.marca.trim();
    if (dto.modelo !== undefined) data.modelo = dto.modelo.trim();
    if (dto.descripcion !== undefined) {
      data.descripcion = dto.descripcion.trim();
    }
    if (dto.precio !== undefined) data.precio = dto.precio;
    if (dto.clasificacion !== undefined) {
      data.clasificacion = canonicalizeClassification(dto.clasificacion);
    }
    if (dto.stock !== undefined) data.stock = dto.stock;
    if (dto.proveedor !== undefined) data.proveedor = dto.proveedor.trim();
    if (dto.tipoAdquisicion !== undefined) {
      data.tipoAdquisicion = dto.tipoAdquisicion;
    }
    if (dto.requiereReceta !== undefined) {
      data.requiereReceta = dto.requiereReceta;
    }
    if (dto.activo !== undefined) {
      data.activo = dto.activo;
    }

    const wantsImageSync =
      dto.keepImageIds !== undefined ||
      (dto.imageUrls?.length ?? 0) > 0 ||
      files.length > 0;

    if (Object.keys(data).length === 0 && !wantsImageSync) {
      throw new BadRequestException('No hay campos para actualizar');
    }

    const keepImageIdsSet = new Set(
      dto.keepImageIds ?? existing.images.map((image) => image.id),
    );

    const invalidKeepIds = [...keepImageIdsSet].filter(
      (imageId) => !existing.images.some((image) => image.id === imageId),
    );
    if (invalidKeepIds.length > 0) {
      throw new BadRequestException(
        'La galeria contiene imagenes no asociadas a este producto',
      );
    }

    const keptImages = wantsImageSync
      ? existing.images.filter((image) => keepImageIdsSet.has(image.id))
      : existing.images;
    const totalImagesAfterUpdate =
      keptImages.length + (dto.imageUrls?.length ?? 0) + files.length;
    if (totalImagesAfterUpdate > 10) {
      throw new BadRequestException(
        'Solo se permiten hasta 10 imagenes por producto',
      );
    }

    const uploadedImages = wantsImageSync
      ? await this.productsCloudinaryService.uploadProductImages(
          dto.imageUrls ?? [],
          files,
        )
      : [];
    const removedImages = wantsImageSync
      ? existing.images.filter((image) => !keepImageIdsSet.has(image.id))
      : [];

    try {
      const product = await this.prisma.$transaction(async (tx) => {
        await tx.product.update({
          where: { id },
          data,
        });

        if (wantsImageSync) {
          if (keptImages.length > 0) {
            await Promise.all(
              keptImages.map((image, index) =>
                tx.productImage.update({
                  where: { id: image.id },
                  data: { sortOrder: index },
                }),
              ),
            );
          }

          if (removedImages.length > 0) {
            await tx.productImage.deleteMany({
              where: {
                id: { in: removedImages.map((image) => image.id) },
              },
            });
          }

          if (uploadedImages.length > 0) {
            await tx.productImage.createMany({
              data: uploadedImages.map((image, index) => ({
                productId: id,
                imageUrl: image.imageUrl,
                cloudinaryPublicId: image.cloudinaryPublicId,
                sortOrder: keptImages.length + index,
              })),
            });
          }
        }

        return tx.product.findUniqueOrThrow({
          where: { id },
          include: productInclude,
        });
      });

      await this.productsCloudinaryService.deleteCloudinaryImagesQuietly(
        removedImages,
      );

      return {
        message: 'Producto actualizado correctamente',
        product: this.mapProduct(product),
      };
    } catch (error) {
      await this.productsCloudinaryService.deleteUploadedImagesQuietly(
        uploadedImages,
      );

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('Producto no encontrado');
      }

      throw error;
    }
  }

  async remove(id: number) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: productInclude,
    });

    if (!product) {
      throw new NotFoundException('Producto no encontrado');
    }

    await this.prisma.product.delete({ where: { id } });
    await this.productsCloudinaryService.deleteCloudinaryImagesQuietly(
      product.images,
    );

    return { message: 'Producto eliminado correctamente' };
  }

  private mapProduct(product: ProductWithImages) {
    const images = product.images.map((image) => ({
      id: image.id,
      imageUrl: image.imageUrl,
      sortOrder: image.sortOrder,
      createdAt: image.createdAt.toISOString(),
    }));

    return {
      ...product,
      clasificacion: canonicalizeClassification(product.clasificacion),
      createdAt: product.createdAt.toISOString(),
      imageUrl: images[0]?.imageUrl ?? null,
      images,
    };
  }
}
