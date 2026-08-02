import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Rol } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AnalyticsService } from './analytics.service';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';

@Controller('analytics')
@Roles(Rol.ADMIN)
@UseGuards(JwtAuthGuard, RolesGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  /**
   * Resumen para el panel de analíticas: KPIs, series diarias y distribuciones
   * basadas en datos operacionales registrados (sin modelo de ventas aún).
   */
  @Get()
  getDashboard(@Query() query: AnalyticsQueryDto) {
    return this.analyticsService.getDashboard(query);
  }

  @Get('customer-segmentation')
  getCustomerSegmentation() {
    return this.analyticsService.getCustomerSegmentation();
  }

  @Get('demand-forecast')
  getDemandForecast() {
    return this.analyticsService.getDemandForecast();
  }
}
