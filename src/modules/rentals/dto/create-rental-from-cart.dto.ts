import { RentalDeliveryMethod } from '@prisma/client';
import {
  Equals,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class CreateRentalFromCartDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  applicantName!: string;

  @IsEmail()
  @MaxLength(190)
  applicantEmail!: string;

  @IsString()
  @Matches(/^[0-9+()\-\s]{7,20}$/)
  applicantPhone!: string;

  @IsBoolean()
  isForAnotherPerson!: boolean;

  @ValidateIf((dto: CreateRentalFromCartDto) => dto.isForAnotherPerson)
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  patientName?: string;

  @ValidateIf((dto: CreateRentalFromCartDto) => dto.isForAnotherPerson)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  patientRelationship?: string;

  @ValidateIf(
    (dto: CreateRentalFromCartDto) =>
      dto.isForAnotherPerson && dto.patientRelationship === 'Otro',
  )
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  patientRelationshipOther?: string;

  @IsEnum(RentalDeliveryMethod)
  deliveryMethod!: RentalDeliveryMethod;

  @ValidateIf(
    (dto: CreateRentalFromCartDto) =>
      dto.deliveryMethod === RentalDeliveryMethod.HOME_DELIVERY,
  )
  @IsString()
  @MinLength(5)
  @MaxLength(240)
  deliveryAddress?: string;

  @ValidateIf(
    (dto: CreateRentalFromCartDto) =>
      dto.deliveryMethod === RentalDeliveryMethod.HOME_DELIVERY,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  deliveryNeighborhood?: string;

  @ValidateIf(
    (dto: CreateRentalFromCartDto) =>
      dto.deliveryMethod === RentalDeliveryMethod.HOME_DELIVERY,
  )
  @Matches(/^\d{5}$/)
  deliveryPostalCode?: string;

  @ValidateIf(
    (dto: CreateRentalFromCartDto) =>
      dto.deliveryMethod === RentalDeliveryMethod.HOME_DELIVERY,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  deliveryMunicipality?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  deliveryReferences?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  preferredSchedule?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  generalNotes?: string;

  @IsBoolean()
  @Equals(true)
  acceptRentalTerms!: boolean;

  @IsBoolean()
  @Equals(true)
  acceptPrivacy!: boolean;
}
