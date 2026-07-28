import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CouponDiscountType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { UpdateCouponDto } from './dto/update-coupon.dto';

@Injectable()
export class CouponsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const coupons = await this.prisma.coupon.findMany({
      orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
    });
    return { coupons };
  }

  async create(dto: CreateCouponDto) {
    const { startAt, endAt } = this.parseDates(dto.startAt, dto.endAt);
    this.assertDiscountValue(
      dto.discountType as CouponDiscountType,
      dto.discountValue,
    );

    try {
      const coupon = await this.prisma.coupon.create({
        data: {
          code: this.normalizeCode(dto.code),
          description: dto.description.trim(),
          discountType: dto.discountType as CouponDiscountType,
          discountValue: dto.discountValue,
          minimumPurchase: dto.minimumPurchase,
          maximumDiscount: dto.maximumDiscount ?? null,
          usageLimit: dto.usageLimit ?? null,
          startAt,
          endAt,
          active: dto.active,
        },
      });
      return { coupon, message: 'Cupón creado correctamente' };
    } catch (error) {
      this.rethrowKnownError(error);
    }
  }

  async update(id: number, dto: UpdateCouponDto) {
    const current = await this.prisma.coupon.findUnique({ where: { id } });
    if (!current) {
      throw new NotFoundException('Cupón no encontrado');
    }

    const startAt = dto.startAt ? new Date(dto.startAt) : current.startAt;
    const endAt = dto.endAt ? new Date(dto.endAt) : current.endAt;
    this.assertValidDates(startAt, endAt);
    const discountType =
      (dto.discountType as CouponDiscountType | undefined) ??
      current.discountType;
    const discountValue = dto.discountValue ?? current.discountValue;
    this.assertDiscountValue(discountType, discountValue);

    try {
      const coupon = await this.prisma.coupon.update({
        where: { id },
        data: {
          ...(dto.code !== undefined
            ? { code: this.normalizeCode(dto.code) }
            : {}),
          ...(dto.description !== undefined
            ? { description: dto.description.trim() }
            : {}),
          ...(dto.discountType !== undefined ? { discountType } : {}),
          ...(dto.discountValue !== undefined ? { discountValue } : {}),
          ...(dto.minimumPurchase !== undefined
            ? { minimumPurchase: dto.minimumPurchase }
            : {}),
          ...(dto.maximumDiscount !== undefined
            ? { maximumDiscount: dto.maximumDiscount }
            : {}),
          ...(dto.usageLimit !== undefined
            ? { usageLimit: dto.usageLimit }
            : {}),
          ...(dto.startAt !== undefined ? { startAt } : {}),
          ...(dto.endAt !== undefined ? { endAt } : {}),
          ...(dto.active !== undefined ? { active: dto.active } : {}),
        },
      });
      return { coupon, message: 'Cupón actualizado correctamente' };
    } catch (error) {
      this.rethrowKnownError(error);
    }
  }

  async remove(id: number) {
    try {
      await this.prisma.coupon.delete({ where: { id } });
      return { message: 'Cupón eliminado correctamente' };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('Cupón no encontrado');
      }
      throw error;
    }
  }

  private normalizeCode(code: string) {
    return code.trim().toUpperCase();
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
      throw new BadRequestException('Fechas del cupón inválidas');
    }
    if (startAt >= endAt) {
      throw new BadRequestException(
        'La fecha final debe ser posterior a la fecha de inicio',
      );
    }
  }

  private assertDiscountValue(
    discountType: CouponDiscountType,
    discountValue: number,
  ) {
    if (
      discountType === CouponDiscountType.PERCENT &&
      discountValue > 100
    ) {
      throw new BadRequestException(
        'El descuento porcentual no puede superar 100%',
      );
    }
  }

  private rethrowKnownError(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('Ya existe un cupón con ese código');
    }
    throw error;
  }
}
