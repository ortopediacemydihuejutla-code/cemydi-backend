import { ThrottlerException } from '@nestjs/throttler';
import { RentalDocumentUploadRateLimitService } from './rental-document-upload-rate-limit.service';

describe('RentalDocumentUploadRateLimitService', () => {
  it('uses an independent authenticated-user key', async () => {
    const storage = {
      increment: jest.fn().mockResolvedValue({ isBlocked: false }),
    };
    const service = new RentalDocumentUploadRateLimitService(storage as never);

    await service.consume(10);
    await service.consume(20);

    expect(storage.increment).toHaveBeenNthCalledWith(
      1,
      'rental-prescription:user:10',
      60_000,
      10,
      60_000,
      'rental-prescription-user',
    );
    expect(storage.increment).toHaveBeenNthCalledWith(
      2,
      'rental-prescription:user:20',
      60_000,
      10,
      60_000,
      'rental-prescription-user',
    );
  });

  it('rejects the eleventh upload within the window', async () => {
    const storage = {
      increment: jest.fn().mockResolvedValue({ isBlocked: true }),
    };
    const service = new RentalDocumentUploadRateLimitService(storage as never);

    await expect(service.consume(10)).rejects.toBeInstanceOf(
      ThrottlerException,
    );
  });
});
