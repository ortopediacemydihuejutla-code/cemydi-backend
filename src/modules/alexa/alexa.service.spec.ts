/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { AlexaService } from './alexa.service';

const rentalProduct = {
  id: 1,
  nombre: 'Silla de ruedas',
  descripcion: 'Silla plegable para renta',
  clasificacion: 'Movilidad',
  precio: 350,
  stock: 2,
  activo: true,
  marca: 'CEMYDI',
  modelo: 'STD',
  proveedor: 'Proveedor',
  tipoAdquisicion: 'Renta',
  requiereReceta: false,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  images: [{ imageUrl: 'https://example.com/silla.png', sortOrder: 0 }],
};

describe('AlexaService', () => {
  let service: AlexaService;
  let prisma: {
    product: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      groupBy: jest.Mock;
    };
    classification: {
      findMany: jest.Mock;
    };
    promotion: {
      findMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      product: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        groupBy: jest.fn(),
      },
      classification: {
        findMany: jest.fn(),
      },
      promotion: {
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlexaService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<AlexaService>(AlexaService);
  });

  it('returns only rental catalog products for Alexa', async () => {
    prisma.product.findMany.mockResolvedValue([
      rentalProduct,
      {
        ...rentalProduct,
        id: 2,
        nombre: 'Producto venta',
        tipoAdquisicion: 'Venta',
      },
    ]);

    const response = await service.getProducts({ availableOnly: false });

    expect(response.total).toBe(1);
    expect(response.items).toEqual([
      expect.objectContaining({
        id: 1,
        nombre: 'Silla de ruedas',
        imagen: 'https://example.com/silla.png',
        tipoAdquisicion: 'Renta',
      }),
    ]);
  });

  it('applies availability and search filters for product queries', async () => {
    prisma.product.findMany.mockResolvedValue([rentalProduct]);

    await service.getProducts({
      availableOnly: true,
      search: 'silla ruedas',
      category: 'Movilidad',
    });

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          activo: true,
          stock: { gt: 0 },
          clasificacion: { equals: 'Movilidad', mode: 'insensitive' },
          AND: expect.arrayContaining([
            expect.objectContaining({ OR: expect.any(Array) }),
          ]),
        }),
      }),
    );
  });

  it('returns product detail for rental products', async () => {
    prisma.product.findFirst.mockResolvedValue(rentalProduct);

    const response = await service.getProductDetail(1);

    expect(response.screen).toBe('product-detail');
    expect(response.product).toEqual(
      expect.objectContaining({
        id: 1,
        stock: 2,
        imagenes: ['https://example.com/silla.png'],
      }),
    );
  });

  it('rejects non-rental products from product detail', async () => {
    prisma.product.findFirst.mockResolvedValue({
      ...rentalProduct,
      tipoAdquisicion: 'Venta',
    });

    await expect(service.getProductDetail(1)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('returns contact data consumable by the Alexa lambda', () => {
    expect(service.getContact()).toEqual(
      expect.objectContaining({
        screen: 'contact',
        contact: expect.objectContaining({
          email: 'contacto@cemydi.com',
          horario: expect.any(Array),
        }),
      }),
    );
  });

  it('returns exit payload correctly', () => {
    expect(service.getExit()).toEqual({
      screen: 'exit',
      title: 'Hasta luego',
      speechText:
        'Gracias por visitar Ortopedia CEMYDI. Estaremos listos para ayudarte cuando regreses.',
    });
  });
});
