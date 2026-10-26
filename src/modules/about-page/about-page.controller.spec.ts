import { Test, TestingModule } from '@nestjs/testing';
import { AboutPageController } from './about-page.controller';
import { AboutPageService } from './about-page.service';
import type { UploadedProductFile } from '../products/products-cloudinary.types';

describe('AboutPageController', () => {
  let controller: AboutPageController;

  const mockAboutPageService = {
    getPublicContent: jest.fn(),
    update: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AboutPageController],
      providers: [
        {
          provide: AboutPageService,
          useValue: mockAboutPageService,
        },
      ],
    }).compile();

    controller = module.get<AboutPageController>(AboutPageController);
    jest.clearAllMocks();
  });

  it('debe estar definido', () => {
    expect(controller).toBeDefined();
  });

  it('debe delegar getPublicContent al servicio', async () => {
    mockAboutPageService.getPublicContent.mockResolvedValue({
      aboutPage: { id: 1 },
    });
    const result = await controller.getPublicContent();
    expect(result).toEqual({ aboutPage: { id: 1 } });
    expect(mockAboutPageService.getPublicContent).toHaveBeenCalled();
  });

  it('debe delegar update con dto y archivos al servicio', async () => {
    const dto = { heroTitle: 'Nuevo' };
    const files = {
      heroImage: [{ originalname: 'h.jpg' } as UploadedProductFile],
      secondaryImage: [{ originalname: 's.jpg' } as UploadedProductFile],
    };
    mockAboutPageService.update.mockResolvedValue({
      message: 'Actualizado',
    });

    const result = await controller.update(dto, files);
    expect(mockAboutPageService.update).toHaveBeenCalledWith(dto, {
      heroImage: files.heroImage[0],
      secondaryImage: files.secondaryImage[0],
    });
    expect(result).toEqual({ message: 'Actualizado' });
  });
});
