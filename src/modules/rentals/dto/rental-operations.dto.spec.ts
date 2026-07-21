import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RentalDepositStatus, RentalDocumentStatus } from '@prisma/client';
import { ReviewRentalDocumentDto } from './review-rental-document.dto';
import { UpdateRentalDepositDto } from './update-rental-deposit.dto';

describe('rental operation DTOs', () => {
  it('accepts only operational document review states', async () => {
    await expect(
      validate(
        plainToInstance(ReviewRentalDocumentDto, {
          status: RentalDocumentStatus.APROBADO,
        }),
      ),
    ).resolves.toHaveLength(0);

    const errors = await validate(
      plainToInstance(ReviewRentalDocumentDto, {
        status: RentalDocumentStatus.PENDIENTE,
      }),
    );
    expect(errors).not.toHaveLength(0);
  });

  it('validates deposit amounts with at most two decimals', async () => {
    await expect(
      validate(
        plainToInstance(UpdateRentalDepositDto, {
          status: RentalDepositStatus.PARTIALLY_RETAINED,
          returnedAmount: 200,
          retainedAmount: 100,
        }),
      ),
    ).resolves.toHaveLength(0);

    const errors = await validate(
      plainToInstance(UpdateRentalDepositDto, {
        status: RentalDepositStatus.RETURNED,
        returnedAmount: 299.999,
        retainedAmount: 0,
      }),
    );
    expect(errors).not.toHaveLength(0);
  });
});
