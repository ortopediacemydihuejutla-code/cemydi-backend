import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Rol } from '@prisma/client';
import { PRODUCT_IMAGE_UPLOAD_LIMITS } from '../../common/files/upload-limits.constants';
import type { AuthUser } from '../auth/types/auth-user.interface';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { UploadedProductFile } from '../products/products-cloudinary.types';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { UpdatePromotionDto } from './dto/update-promotion.dto';
import { PromotionsService } from './promotions.service';

@Controller('promotions')
export class PromotionsController {
  constructor(private readonly promotionsService: PromotionsService) {}

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  findAll(
    @Query('includeExpired') includeExpiredRaw: string | undefined,
    @CurrentUser() user: AuthUser | undefined,
  ) {
    return this.promotionsService.findAll({
      includeExpired: includeExpiredRaw === 'true',
      user,
    });
  }

  @Post()
  @Roles(Rol.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @UseInterceptors(
    FileInterceptor('image', {
      limits: PRODUCT_IMAGE_UPLOAD_LIMITS,
    }),
  )
  create(
    @Body() dto: CreatePromotionDto,
    @UploadedFile() image?: UploadedProductFile,
  ) {
    return this.promotionsService.create(dto, image);
  }

  @Patch(':id')
  @Roles(Rol.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @UseInterceptors(
    FileInterceptor('image', {
      limits: PRODUCT_IMAGE_UPLOAD_LIMITS,
    }),
  )
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePromotionDto,
    @UploadedFile() image?: UploadedProductFile,
  ) {
    return this.promotionsService.update(id, dto, image);
  }

  @Delete(':id')
  @Roles(Rol.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.promotionsService.remove(id);
  }
}
