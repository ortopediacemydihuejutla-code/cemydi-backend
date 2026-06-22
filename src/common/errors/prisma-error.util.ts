import {
  BadRequestException,
  HttpException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

export function mapPrismaError(error: unknown): HttpException | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return null;
  }

  switch (error.code) {
    case 'P2002':
      return new BadRequestException('Conflicto con un registro existente');
    case 'P2025':
      return new NotFoundException('Recurso no encontrado');
    case 'P2003':
      return new BadRequestException(
        'No se puede completar la operacion por una referencia invalida',
      );
    case 'P2021':
      return new InternalServerErrorException(
        'La operacion requiere tablas de base de datos que aun no existen',
      );
    default:
      return null;
  }
}
