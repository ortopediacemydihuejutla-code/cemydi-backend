import { Test, TestingModule } from '@nestjs/testing';
import { MaintenanceUseCasesService } from './application/use-cases/maintenance-use-cases.service';
import { MaintenanceSchedulerService } from './infrastructure/scheduler/maintenance-scheduler.service';
import { MaintenanceService } from './maintenance.service';

describe('MaintenanceService', () => {
  let service: MaintenanceService;

  const mockUseCasesService = {
    run: jest.fn(),
    getSchedule: jest.fn(),
    updateSchedule: jest.fn(),
    deleteSchedule: jest.fn(),
  };

  const mockSchedulerService = {
    start: jest.fn(),
    stop: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaintenanceService,
        {
          provide: MaintenanceUseCasesService,
          useValue: mockUseCasesService,
        },
        {
          provide: MaintenanceSchedulerService,
          useValue: mockSchedulerService,
        },
      ],
    }).compile();

    service = module.get<MaintenanceService>(MaintenanceService);
    jest.clearAllMocks();
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  it('debe iniciar y detener el scheduler en los hooks de ciclo de vida', () => {
    service.onModuleInit();
    expect(mockSchedulerService.start).toHaveBeenCalled();

    service.onModuleDestroy();
    expect(mockSchedulerService.stop).toHaveBeenCalled();
  });

  it('debe delegar run y operaciones de schedule a use-cases', async () => {
    mockUseCasesService.run.mockResolvedValue({ success: true });
    const runResult = await service.run({ dryRun: true });
    expect(runResult).toEqual({ success: true });
    expect(mockUseCasesService.run).toHaveBeenCalledWith({ dryRun: true });

    mockUseCasesService.getSchedule.mockResolvedValue({ enabled: true });
    const schedule = await service.getSchedule();
    expect(schedule).toEqual({ enabled: true });
  });
});
