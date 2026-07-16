import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class LegalDocumentSectionDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  id?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  title!: string;

  @IsString()
  @MaxLength(50000)
  body!: string;

  @IsOptional()
  @IsIn(['medical-alert'])
  variant?: 'medical-alert';
}

export class LegalDocumentFieldsDto {
  @IsOptional()
  @IsString()
  @Matches(/^$|^\d{4}-\d{2}-\d{2}$/)
  effectiveDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  companyName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  taxId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsString()
  @Matches(/^$|^[^\s@]+@[^\s@]+\.[^\s@]+$/)
  @MaxLength(180)
  privacyEmail?: string;

  @IsOptional()
  @IsBoolean()
  cookiesEnabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  sectionOrder?: string;

  @IsOptional() @IsString() @MaxLength(50000) personalDataCollected?: string;
  @IsOptional() @IsString() @MaxLength(50000) medicalData?: string;
  @IsOptional() @IsString() @MaxLength(50000) informationUse?: string;
  @IsOptional() @IsString() @MaxLength(50000) consentAndLegalBasis?: string;
  @IsOptional() @IsString() @MaxLength(50000) thirdPartyTransfer?: string;
  @IsOptional() @IsString() @MaxLength(50000) cookiesContent?: string;
  @IsOptional() @IsString() @MaxLength(50000) arcoRights?: string;
  @IsOptional() @IsString() @MaxLength(50000) retentionAndSecurity?: string;
  @IsOptional() @IsString() @MaxLength(50000) privacyChanges?: string;
  @IsOptional() @IsString() @MaxLength(50000) acceptanceAndScope?: string;
  @IsOptional() @IsString() @MaxLength(50000) accountEligibility?: string;
  @IsOptional()
  @IsString()
  @MaxLength(50000)
  productsPricingAvailability?: string;
  @IsOptional() @IsString() @MaxLength(50000) medicalDisclaimer?: string;
  @IsOptional() @IsString() @MaxLength(50000) salesShipping?: string;
  @IsOptional() @IsString() @MaxLength(50000) salesWarranties?: string;
  @IsOptional() @IsString() @MaxLength(50000) returnsAndCancellations?: string;
  @IsOptional() @IsString() @MaxLength(50000) rentalRequirements?: string;
  @IsOptional() @IsString() @MaxLength(50000) rentalDeposits?: string;
  @IsOptional() @IsString() @MaxLength(50000) rentalHygiene?: string;
  @IsOptional() @IsString() @MaxLength(50000) rentalPenalties?: string;
  @IsOptional() @IsString() @MaxLength(50000) homeInstallation?: string;
  @IsOptional() @IsString() @MaxLength(50000) paymentAndBilling?: string;
  @IsOptional() @IsString() @MaxLength(50000) liabilityAndSafeUse?: string;
  @IsOptional() @IsString() @MaxLength(50000) intellectualProperty?: string;
  @IsOptional() @IsString() @MaxLength(50000) changesAndClaims?: string;
}

export class UpdateLegalDocumentDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => LegalDocumentFieldsDto)
  fields?: LegalDocumentFieldsDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LegalDocumentSectionDto)
  customSections?: LegalDocumentSectionDto[];
}
