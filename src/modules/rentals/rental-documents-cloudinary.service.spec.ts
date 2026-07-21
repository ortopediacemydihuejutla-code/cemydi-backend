import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryDeliveryType, CloudinaryResourceType } from '@prisma/client';
import { RentalDocumentsCloudinaryService } from './rental-documents-cloudinary.service';

describe('RentalDocumentsCloudinaryService', () => {
  it('destroys raw authenticated assets using their stored delivery metadata', async () => {
    const destroy = jest
      .spyOn(cloudinary.uploader, 'destroy')
      .mockResolvedValue({ result: 'ok' } as never);
    const service = new RentalDocumentsCloudinaryService({
      get: jest.fn().mockReturnValue(undefined),
    } as never);

    await service.deleteAsset({
      assetId: 'asset-1',
      publicId: 'cemydi/recetas/temp/10/receta.pdf',
      resourceType: CloudinaryResourceType.RAW,
      deliveryType: CloudinaryDeliveryType.AUTHENTICATED,
      format: 'pdf',
      bytes: 100,
    });

    expect(destroy).toHaveBeenCalledWith('cemydi/recetas/temp/10/receta.pdf', {
      resource_type: 'raw',
      type: 'authenticated',
      invalidate: true,
    });
    destroy.mockRestore();
  });
});
