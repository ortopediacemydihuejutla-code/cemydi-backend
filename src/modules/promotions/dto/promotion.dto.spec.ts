import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreatePromotionDto,
  PromotionImageStrategyInput,
} from './create-promotion.dto';

describe('CreatePromotionDto', () => {
  it('transforma el porcentaje enviado por multipart a número', async () => {
    const dto = plainToInstance(CreatePromotionDto, {
      productIds: '[1,3,7]',
      discountPercent: '20',
      imageStrategy: PromotionImageStrategyInput.AUTO,
      startAt: '2026-07-27T06:00:00.000Z',
      endAt: '2026-08-03T05:59:59.999Z',
      descripcion: 'Campaña de productos seleccionados',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.discountPercent).toBe(20);
  });
});
