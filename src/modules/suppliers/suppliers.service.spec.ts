import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SuppliersService } from './suppliers.service';

describe('SuppliersService', () => {
  let service: SuppliersService;

  const mockPrismaService = {
    supplier: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SuppliersService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<SuppliersService>(SuppliersService);
    jest.clearAllMocks();
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('debe listar proveedores ordenados por nombre', async () => {
      mockPrismaService.supplier.findMany.mockResolvedValue([]);
      const result = await service.findAll();
      expect(result).toEqual({ suppliers: [] });
    });
  });

  describe('create', () => {
    const validDto = {
      nombre: 'Distribuidora Medica',
      encargado: 'Carlos Perez',
      repartidor: 'Jorge Ruiz',
      direccion: 'Av Central 123',
    };

    it('debe crear un proveedor correctamente', async () => {
      mockPrismaService.supplier.create.mockResolvedValue({
        id: 1,
        ...validDto,
      });

      const result = await service.create(validDto);
      expect(result.message).toContain('correctamente');
      expect(result.supplier.nombre).toBe('Distribuidora Medica');
    });

    it('debe lanzar BadRequestException si el proveedor está duplicado (P2002)', async () => {
      const error = new Prisma.PrismaClientKnownRequestError('Duplicate key', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });
      mockPrismaService.supplier.create.mockRejectedValue(error);
      await expect(service.create(validDto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('update & delete', () => {
    it('debe lanzar NotFoundException al actualizar proveedor inexistente', async () => {
      mockPrismaService.supplier.findUnique.mockResolvedValue(null);
      await expect(
        service.update(99, {
          nombre: 'A',
          encargado: 'B',
          repartidor: 'C',
          direccion: 'D',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('debe eliminar proveedor existente', async () => {
      mockPrismaService.supplier.findUnique.mockResolvedValue({ id: 1 });
      mockPrismaService.supplier.delete.mockResolvedValue({ id: 1 });

      const result = await service.delete(1);
      expect(result.message).toContain('correctamente');
    });
  });
});
