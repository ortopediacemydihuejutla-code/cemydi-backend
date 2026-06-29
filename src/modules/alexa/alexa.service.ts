import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { FindAlexaProductsQueryDto } from './dto/find-alexa-products-query.dto';

const productWithImagesInclude = {
  images: {
    orderBy: {
      sortOrder: 'asc',
    },
  },
} satisfies Prisma.ProductInclude;

type ProductWithImages = Prisma.ProductGetPayload<{
  include: typeof productWithImagesInclude;
}>;

const categoryDescriptions: Record<string, string> = {
  Movilidad: 'Productos de apoyo para desplazamiento y autonomia diaria.',
  Soporte: 'Opciones de soporte y asistencia para el cuidado en casa.',
  Rehabilitacion:
    'Articulos enfocados en recuperacion fisica y ejercicios terapeuticos.',
  Terapia: 'Equipo complementario para sesiones de terapia y seguimiento.',
  Diagnostico: 'Dispositivos orientados a monitoreo y evaluacion basica.',
};

@Injectable()
export class AlexaService {
  constructor(private readonly prisma: PrismaService) {}

  getWelcome() {
    return {
      screen: 'welcome',
      title: 'Bienvenido a Ortopedia CEMYDI',
      speechText:
        'Bienvenido a Ortopedia CEMYDI. Puedes explorar productos, buscar por nombre, conocer promociones y consultar informacion de contacto.',
      repromptText:
        'Di por ejemplo, buscar muletas, mostrar promociones o ver categorias.',
      quickActions: [
        'Explorar productos',
        'Buscar por voz',
        'Ver promociones',
        'Informacion de contacto',
      ],
    };
  }

  async getProducts(query: FindAlexaProductsQueryDto) {
    const where: Prisma.ProductWhereInput = {
      activo: true,
    };

    if (query.availableOnly) {
      where.stock = { gt: 0 };
    }

    if (query.category) {
      where.clasificacion = {
        equals: query.category,
        mode: 'insensitive',
      };
    }

    if (query.search) {
      where.AND = this.buildSearchClauses(query.search);
    }

    const products = await this.prisma.product.findMany({
      where,
      include: productWithImagesInclude,
      orderBy: [{ stock: 'desc' }, { nombre: 'asc' }],
      take: 100,
    });

    const rentalProducts = this.filterRentalCatalogProducts(products).slice(
      0,
      24,
    );

    return {
      screen: 'catalog',
      title: 'Catalogo de productos ortopedicos',
      total: rentalProducts.length,
      filters: {
        search: query.search ?? null,
        category: query.category ?? null,
        availableOnly: query.availableOnly,
      },
      items: rentalProducts.map((product) => this.mapProductCard(product)),
    };
  }

  async searchProducts(name: string) {
    const query = name.trim();
    const products = await this.prisma.product.findMany({
      where: {
        activo: true,
        AND: this.buildSearchClauses(query),
      },
      include: productWithImagesInclude,
      orderBy: [{ stock: 'desc' }, { nombre: 'asc' }],
      take: 50,
    });

    const rentalProducts = this.filterRentalCatalogProducts(products).slice(
      0,
      12,
    );

    return {
      screen: 'voice-search',
      query,
      total: rentalProducts.length,
      speechText:
        rentalProducts.length > 0
          ? `Encontre ${rentalProducts.length} resultados para ${query}.`
          : `No encontre productos de renta para ${query}.`,
      items: rentalProducts.map((product) => this.mapProductCard(product)),
    };
  }

  async getProductDetail(id: number) {
    const product = await this.prisma.product.findFirst({
      where: {
        id,
        activo: true,
      },
      include: productWithImagesInclude,
    });

    if (!product || !this.isRentalCatalogProduct(product)) {
      throw new NotFoundException('Producto no encontrado');
    }

    return {
      screen: 'product-detail',
      title: product.nombre,
      speechText: this.buildProductSpeech(product),
      product: this.mapProductDetail(product),
    };
  }

  async getCategories() {
    const [categories, productCounts] = await Promise.all([
      this.prisma.classification.findMany({
        orderBy: {
          nombre: 'asc',
        },
      }),
      this.prisma.product.groupBy({
        by: ['clasificacion'],
        where: {
          activo: true,
        },
        _count: {
          _all: true,
        },
      }),
    ]);

    const countsByName = new Map(
      productCounts.map((item) => [item.clasificacion, item._count._all]),
    );

    return {
      screen: 'categories',
      title: 'Categorias disponibles',
      total: categories.length,
      items: categories.map((category) => ({
        id: category.id,
        nombre: category.nombre,
        descripcion:
          categoryDescriptions[category.nombre] ??
          `Catalogo disponible en la categoria ${category.nombre}.`,
        totalProductos: countsByName.get(category.nombre) ?? 0,
      })),
    };
  }

  async getPromotions() {
    const now = new Date();
    const promotions = await this.prisma.promotion.findMany({
      where: {
        startAt: { lte: now },
        endAt: { gte: now },
        product: {
          activo: true,
          stock: { gt: 0 },
        },
      },
      include: {
        product: {
          include: productWithImagesInclude,
        },
      },
      orderBy: [{ startAt: 'asc' }, { createdAt: 'desc' }],
      take: 12,
    });

    const rentalPromotions = promotions.filter((promotion) =>
      this.isRentalCatalogProduct(promotion.product),
    );

    return {
      screen: 'promotions',
      title: 'Promociones activas',
      total: rentalPromotions.length,
      items: rentalPromotions.map((promotion) => ({
        id: promotion.id,
        descripcion: promotion.descripcion,
        fechaInicio: promotion.startAt.toISOString(),
        fechaFin: promotion.endAt.toISOString(),
        imagen:
          promotion.imageUrl || promotion.product.images[0]?.imageUrl || null,
        product: this.mapProductCard(promotion.product),
      })),
    };
  }

  async getServices() {
    const categories = await this.prisma.classification.findMany({
      orderBy: {
        nombre: 'asc',
      },
    });

    return {
      screen: 'services',
      title: 'Informacion de servicios',
      intro:
        'CEMYDI ofrece soluciones para movilidad, rehabilitacion y equipo medico con apoyo de su catalogo actual.',
      items: categories.map((category) => ({
        id: category.id,
        nombre: category.nombre,
        descripcion:
          categoryDescriptions[category.nombre] ??
          `Consulta productos y recomendaciones dentro de ${category.nombre}.`,
      })),
    };
  }

  getBranches() {
    return {
      screen: 'branches',
      title: 'Sucursales',
      total: 0,
      items: [],
      note: 'Actualmente el repositorio no contiene sucursales publicadas en base de datos. Alexa puede redirigir al endpoint de contacto general.',
    };
  }

  getContact() {
    return {
      screen: 'contact',
      title: 'Contacto',
      speechText:
        'Puedes contactar a Ortopedia CEMYDI de lunes a sabado de nueve de la manana a siete de la tarde en el correo contacto arroba cemydi punto com.',
      business: {
        nombre: 'Ortopedia CEMYDI',
        descripcion:
          'Soluciones para movilidad, rehabilitacion y equipo medico.',
      },
      contact: {
        email: 'contacto@cemydi.com',
        telefono: null,
        whatsapp: null,
        horario: ['Lunes a Sabado', '9:00 am - 7:00 pm'],
      },
      branchesEndpoint: '/alexa/branches',
    };
  }

  getHelp() {
    return {
      screen: 'help',
      title: 'Ayuda',
      speechText:
        'Puedes decir, mostrar productos, buscar muletas, ver promociones, ver categorias o contacto.',
      examples: [
        'Buscar silla de ruedas',
        'Mostrar promociones',
        'Quiero ver productos de movilidad',
        'Dame la informacion de contacto',
      ],
    };
  }

  getExit() {
    return {
      screen: 'exit',
      title: 'Hasta luego',
      speechText:
        'Gracias por visitar Ortopedia CEMYDI. Estaremos listos para ayudarte cuando regreses.',
    };
  }

  private normalizeAcquisitionType(value: unknown): string {
    return String(value ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\//g, ' ')
      .replace(/_/g, ' ')
      .replace(/-/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private isRentalCatalogProduct(product: {
    tipoAdquisicion?: unknown;
  }): boolean {
    const tipo = this.normalizeAcquisitionType(product.tipoAdquisicion);

    if (tipo === 'renta') {
      return true;
    }

    if (tipo === 'mixto') {
      return true;
    }

    return tipo.includes('venta') && tipo.includes('renta');
  }

  private filterRentalCatalogProducts<T extends { tipoAdquisicion?: unknown }>(
    products: T[],
  ): T[] {
    return products.filter((product) => this.isRentalCatalogProduct(product));
  }

  private buildSearchClauses(search: string): Prisma.ProductWhereInput[] {
    return search
      .trim()
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean)
      .map((token) => ({
        OR: [
          { nombre: { contains: token, mode: 'insensitive' } },
          { descripcion: { contains: token, mode: 'insensitive' } },
          { marca: { contains: token, mode: 'insensitive' } },
          { modelo: { contains: token, mode: 'insensitive' } },
          { clasificacion: { contains: token, mode: 'insensitive' } },
        ],
      }));
  }

  private mapProductCard(product: ProductWithImages) {
    return {
      id: product.id,
      nombre: product.nombre,
      descripcion: product.descripcion,
      categoria: product.clasificacion,
      precio: product.precio,
      imagen: product.images[0]?.imageUrl ?? null,
      disponible: product.activo && product.stock > 0,
      marca: product.marca,
      modelo: product.modelo,
      tipoAdquisicion: product.tipoAdquisicion,
      requiereReceta: product.requiereReceta,
    };
  }

  private mapProductDetail(product: ProductWithImages) {
    return {
      id: product.id,
      nombre: product.nombre,
      descripcion: product.descripcion,
      categoria: product.clasificacion,
      precio: product.precio,
      imagen: product.images[0]?.imageUrl ?? null,
      imagenes: product.images.map((image) => image.imageUrl),
      disponible: product.activo && product.stock > 0,
      stock: product.stock,
      marca: product.marca,
      modelo: product.modelo,
      proveedor: product.proveedor,
      tipoAdquisicion: product.tipoAdquisicion,
      requiereReceta: product.requiereReceta,
      creadoEn: product.createdAt.toISOString(),
    };
  }

  private buildProductSpeech(product: ProductWithImages) {
    const availability = product.stock > 0 ? 'disponible' : 'sin existencia';
    const price =
      Number.isInteger(product.precio) ||
      Number(product.precio).toFixed(2).endsWith('.00')
        ? product.precio.toString()
        : product.precio.toFixed(2);

    return `${product.nombre}, marca ${product.marca}, categoria ${product.clasificacion}, precio ${price} pesos, ${availability}.`;
  }
}
