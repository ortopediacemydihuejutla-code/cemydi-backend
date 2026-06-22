export type UploadedProductImage = {
  imageUrl: string;
  cloudinaryPublicId: string | null;
};

export type UploadedProductFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};
