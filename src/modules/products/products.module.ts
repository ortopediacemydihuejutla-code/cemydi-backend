import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ProductsController } from './products.controller';
import { ProductsCloudinaryService } from './products-cloudinary.service';
import { ProductsService } from './products.service';

@Module({
  imports: [PrismaModule],
  controllers: [ProductsController],
  providers: [ProductsService, ProductsCloudinaryService],
  exports: [ProductsCloudinaryService],
})
export class ProductsModule {}
