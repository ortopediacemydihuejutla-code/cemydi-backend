import { Test, TestingModule } from '@nestjs/testing';
import { AdminActivityController } from './admin-activity.controller';
import { AdminActivityService } from './admin-activity.service';

describe('AdminActivityController', () => {
  let controller: AdminActivityController;

  const mockAdminActivityService = {
    listRecent: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminActivityController],
      providers: [
        { provide: AdminActivityService, useValue: mockAdminActivityService },
      ],
    }).compile();

    controller = module.get<AdminActivityController>(AdminActivityController);
    jest.clearAllMocks();
  });

  it('debe estar definido', () => {
    expect(controller).toBeDefined();
  });

  it('debe llamar a listRecent con el límite proporcionado', async () => {
    mockAdminActivityService.listRecent.mockResolvedValue({ items: [] });
    const result = await controller.listRecent({ limit: 15 });
    expect(mockAdminActivityService.listRecent).toHaveBeenCalledWith(15);
    expect(result).toEqual({ items: [] });
  });
});
