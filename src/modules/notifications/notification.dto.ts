import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';

export const CATEGORIES = ['SYSTEM', 'OFFER', 'RENTAL'] as const;
export type NotificationCategory = (typeof CATEGORIES)[number];
export const DESTINATIONS = [
  'NONE',
  'PRODUCT',
  'PROMOTION',
  'RENTAL',
  'ACCOUNT',
] as const;

export class NotificationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  page?: number;

  @IsOptional()
  @IsIn(CATEGORIES)
  category?: NotificationCategory;
}

export class RecipientSearchDto {
  @IsOptional()
  @IsString()
  @Length(0, 100)
  search?: string;
}

export class DestinationSearchDto extends RecipientSearchDto {
  @IsIn(['PRODUCT', 'PROMOTION', 'RENTAL'])
  type!: 'PRODUCT' | 'PROMOTION' | 'RENTAL';
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  userId?: number;
}

export class SendNotificationDto {
  @IsUUID('4')
  requestId!: string;

  @IsIn(CATEGORIES)
  category!: NotificationCategory;

  @IsString()
  @Length(3, 100)
  title!: string;

  @IsString()
  @Length(3, 500)
  body!: string;

  @IsIn(['ALL', 'SELECTED'])
  audience!: 'ALL' | 'SELECTED';

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  userIds?: number[];

  @IsIn(DESTINATIONS)
  destinationType!: (typeof DESTINATIONS)[number];

  @IsOptional()
  @IsString()
  @Length(1, 100)
  destinationId?: string;
}

export class NotificationPreferencesDto {
  @IsBoolean() pushEnabled!: boolean;
  @IsBoolean() system!: boolean;
  @IsBoolean() offers!: boolean;
  @IsBoolean() rentals!: boolean;
}

export class NotificationAutomationDto {
  @IsBoolean() rentalStatus!: boolean;
  @IsBoolean() prescriptions!: boolean;
  @IsBoolean() security!: boolean;
}

export class ReadNotificationDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsString({ each: true })
  @Length(1, 100, { each: true })
  ids!: string[];
}

export class RegisterPushDto {
  @IsIn(['WEB', 'EXPO']) channel!: 'WEB' | 'EXPO';
  @IsString() @Length(10, 2048) endpoint!: string;
  @IsOptional() @IsString() @Length(1, 200) p256dh?: string;
  @IsOptional() @IsString() @Length(1, 100) auth?: string;
}

export class UnregisterPushDto {
  @IsString() @Length(10, 2048) endpoint!: string;
}
