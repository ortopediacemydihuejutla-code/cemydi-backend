import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsController', () => {
  let controller: AnalyticsController;

  const mockAnalyticsService = {
    getDashboard: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnalyticsController],
      providers: [
        { provide: AnalyticsService, useValue: mockAnalyticsService },
      ],
    }).compile();

    controller = module.get<AnalyticsController>(AnalyticsController);
    jest.clearAllMocks();
  });

  it('debe estar definido', () => {
    expect(controller).toBeDefined();
  });

  it('debe delegar getDashboard al servicio', async () => {
    const query = { range: 'month' as const };
    mockAnalyticsService.getDashboard.mockResolvedValue({ kpis: {} });
    const result = await controller.getDashboard(query);
    expect(mockAnalyticsService.getDashboard).toHaveBeenCalledWith(query);
    expect(result).toEqual({ kpis: {} });
  });
});
