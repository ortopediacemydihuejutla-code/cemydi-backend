import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppThrottlerGuard } from './common/guards/app-throttler.guard';
import { UsersModule } from './modules/users/users.module';
import { ProductsModule } from './modules/products/products.module';
import { AuthModule } from './modules/auth/auth.module';
import { CartModule } from './modules/cart/cart.module';
import { PrismaModule } from './prisma/prisma.module';
import { CatalogsModule } from './modules/catalogs/catalogs.module';
import { SuppliersModule } from './modules/suppliers/suppliers.module';
import { PromotionsModule } from './modules/promotions/promotions.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { RentalsModule } from './modules/rentals/rentals.module';
import { BackupsModule } from './modules/backups/backups.module';
import { MaintenanceModule } from './modules/maintenance/maintenance.module';
import { AdminActivityModule } from './modules/admin-activity/admin-activity.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AlexaModule } from './modules/alexa/alexa.module';
import { AboutPageModule } from './modules/about-page/about-page.module';
import { LegalDocumentsModule } from './modules/legal-documents/legal-documents.module';
import { DatabaseToolsModule } from './infrastructure/database-tools/database-tools.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { CsrfGuard } from './modules/auth/guards/csrf.guard';
import { validateEnv } from './env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: process.env.NODE_ENV === 'production' ? 40 : 200,
      },
    ]),
    UsersModule,
    ProductsModule,
    AuthModule,
    CartModule,
    PrismaModule,
    CatalogsModule,
    SuppliersModule,
    PromotionsModule,
    ReviewsModule,
    RentalsModule,
    AlexaModule,
    DatabaseToolsModule,
    BackupsModule,
    MaintenanceModule,
    AnalyticsModule,
    AdminActivityModule,
    AboutPageModule,
    LegalDocumentsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    {
      provide: APP_GUARD,
      useClass: AppThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: CsrfGuard,
    },
  ],
})
export class AppModule {}
