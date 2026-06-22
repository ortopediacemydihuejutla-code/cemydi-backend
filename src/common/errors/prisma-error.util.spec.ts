import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { mapPrismaError } from './prisma-error.util';

describe('mapPrismaError', () => {
  it('maps P2002 to BadRequestException', () => {
    const error = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      { code: 'P2002', clientVersion: 'test' },
    );

    const mapped = mapPrismaError(error);

    expect(mapped).toBeInstanceOf(BadRequestException);
    expect(mapped?.getResponse()).toMatchObject({
      message: 'Conflicto con un registro existente',
    });
  });

  it('maps P2025 to NotFoundException', () => {
    const error = new Prisma.PrismaClientKnownRequestError('Record not found', {
      code: 'P2025',
      clientVersion: 'test',
    });

    const mapped = mapPrismaError(error);

    expect(mapped).toBeInstanceOf(NotFoundException);
  });

  it('returns null for unknown errors', () => {
    expect(mapPrismaError(new Error('other'))).toBeNull();
  });
});
