import { Test, TestingModule } from '@nestjs/testing';
import { MaintenanceController } from './maintenance.controller';
import { MaintenanceService } from './maintenance.service';

describe('MaintenanceController', () => {
  let controller: MaintenanceController;

  const mockMaintenanceService = {
    getSchedule: jest.fn(),
    updateSchedule: jest.fn(),
    deleteSchedule: jest.fn(),
    run: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MaintenanceController],
      providers: [
        { provide: MaintenanceService, useValue: mockMaintenanceService },
      ],
    }).compile();

    controller = module.get<MaintenanceController>(MaintenanceController);
    jest.clearAllMocks();
  });

  it('debe estar definido', () => {
    expect(controller).toBeDefined();
  });

  it('debe delegar getSchedule, updateSchedule y deleteSchedule', async () => {
    mockMaintenanceService.getSchedule.mockResolvedValue({ enabled: true });
    mockMaintenanceService.updateSchedule.mockResolvedValue({ enabled: false });
    mockMaintenanceService.deleteSchedule.mockResolvedValue(null);

    const getRes = await controller.getSchedule();
    expect(getRes).toEqual({ schedule: { enabled: true } });

    const updateRes = await controller.updateSchedule({
      enabled: false,
    });
    expect(updateRes.message).toContain('correctamente');

    const deleteRes = await controller.deleteSchedule();
    expect(deleteRes.message).toContain('correctamente');
  });

  it('debe ejecutar mantenimiento con runMaintenance', async () => {
    const dto = { operation: 'ANALYZE' };
    mockMaintenanceService.run.mockResolvedValue({ success: true });

    const result = await controller.runMaintenance(dto);
    expect(mockMaintenanceService.run).toHaveBeenCalledWith(dto);
    expect(result).toEqual({ success: true });
  });
});
