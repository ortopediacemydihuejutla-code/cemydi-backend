import { Injectable } from '@nestjs/common';
import {
  InjectThrottlerStorage,
  ThrottlerException,
  type ThrottlerStorage,
} from '@nestjs/throttler';

const UPLOAD_LIMIT = 10;
const UPLOAD_WINDOW_MS = 60_000;

@Injectable()
export class RentalDocumentUploadRateLimitService {
  constructor(
    @InjectThrottlerStorage()
    private readonly storage: ThrottlerStorage,
  ) {}

  async consume(userId: number) {
    const result = await this.storage.increment(
      `rental-prescription:user:${userId}`,
      UPLOAD_WINDOW_MS,
      UPLOAD_LIMIT,
      UPLOAD_WINDOW_MS,
      'rental-prescription-user',
    );

    if (result.isBlocked) {
      throw new ThrottlerException(
        'Alcanzaste el limite de 10 recetas por minuto. Intenta de nuevo en un momento.',
      );
    }
  }
}
