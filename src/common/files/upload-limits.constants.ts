export const MAX_IMAGE_UPLOAD_BYTES = 8 * 1024 * 1024;
export const MAX_PRESCRIPTION_UPLOAD_BYTES = 8 * 1024 * 1024;
export const MAX_PRODUCT_IMAGE_FILES = 10;
export const MAX_ABOUT_PAGE_IMAGE_FILES = 2;
export const MAX_RENTAL_PRESCRIPTION_FILES = 20;

export const PRODUCT_IMAGE_UPLOAD_LIMITS = {
  fileSize: MAX_IMAGE_UPLOAD_BYTES,
  files: MAX_PRODUCT_IMAGE_FILES,
  fields: 80,
  fieldNameSize: 100,
  fieldSize: 32 * 1024,
  parts: 100,
} as const;

export const ABOUT_PAGE_IMAGE_UPLOAD_LIMITS = {
  fileSize: MAX_IMAGE_UPLOAD_BYTES,
  files: MAX_ABOUT_PAGE_IMAGE_FILES,
  fields: 20,
  fieldNameSize: 100,
  fieldSize: 16 * 1024,
  parts: 30,
} as const;

export const RENTAL_PRESCRIPTION_UPLOAD_LIMITS = {
  fileSize: MAX_PRESCRIPTION_UPLOAD_BYTES,
  files: MAX_RENTAL_PRESCRIPTION_FILES,
  fields: 0,
  fieldNameSize: 100,
  parts: MAX_RENTAL_PRESCRIPTION_FILES,
} as const;
