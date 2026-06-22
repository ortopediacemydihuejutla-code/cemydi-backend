import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ProductsModule } from '../products/products.module';
import { AboutPageController } from './about-page.controller';
import { AboutPageService } from './about-page.service';

@Module({
  imports: [PrismaModule, ProductsModule],
  controllers: [AboutPageController],
  providers: [AboutPageService],
})
export class AboutPageModule {}
