import type {
  CloudinaryDeliveryType,
  CloudinaryResourceType,
  RentalDocumentStatus,
} from '@prisma/client';

export type UploadedPrescriptionFile = {
  fieldname?: string;
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

export type ValidatedPrescriptionFile = {
  buffer: Buffer;
  originalFilename: string;
  mimeType: string;
  format: string;
  resourceType: CloudinaryResourceType;
  bytes: number;
};

export type UploadedRentalAsset = {
  assetId: string;
  publicId: string;
  resourceType: CloudinaryResourceType;
  deliveryType: CloudinaryDeliveryType;
  format: string;
  bytes: number;
};

export type PendingAssetCleanup = UploadedRentalAsset;

export type RentalDocumentSummary = {
  id: string;
  originalFilename: string;
  mimeType: string;
  bytes: number;
  status: RentalDocumentStatus;
  uploadedAt: string;
  associatedAt: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
};
