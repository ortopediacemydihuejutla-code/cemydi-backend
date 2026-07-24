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
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Rol } from '@prisma/client';
import { PRODUCT_IMAGE_UPLOAD_LIMITS } from '../../common/files/upload-limits.constants';
import type { AuthUser } from '../auth/types/auth-user.interface';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateProductDto } from './dto/create-product.dto';
import { FindProductQueryDto } from './dto/find-product-query.dto';
import { FindProductsQueryDto } from './dto/find-products-query.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsService } from './products.service';

type UploadedProductFile = {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  findAll(
    @Query() query: FindProductsQueryDto,
    @CurrentUser() user: AuthUser | undefined,
  ) {
    return this.productsService.findAll(
      {
        search: query.search,
        clasificaciones: query.clasificaciones,
        marcas: query.marcas,
        tipos: query.tipos,
        requiereRecetaRaw: query.requiereReceta,
        pageRaw: query.page,
        pageSizeRaw: query.pageSize,
        includeInactive: query.includeInactive,
        soloDisponibles: query.soloDisponibles,
        sort: query.sort,
      },
      user,
    );
  }

  @Get('slug/:slug')
  @UseGuards(OptionalJwtAuthGuard)
  findOneBySlug(
    @Param('slug') slug: string,
    @Query() query: FindProductQueryDto,
    @CurrentUser() user: AuthUser | undefined,
  ) {
    return this.productsService.findOneBySlug(
      slug,
      query.includeInactive,
      user,
    );
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: FindProductQueryDto,
    @CurrentUser() user: AuthUser | undefined,
  ) {
    return this.productsService.findOne(id, query.includeInactive, user);
  }

  @Get(':id/recommendations')
  @UseGuards(OptionalJwtAuthGuard)
  getRecommendations(
    @Param('id', ParseIntPipe) id: number,
    @Query('limit') limit: string | undefined,
  ) {
    return this.productsService.getRecommendations(id, limit);
  }

  @Post()
  @Roles(Rol.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @UseInterceptors(
    FilesInterceptor('images', PRODUCT_IMAGE_UPLOAD_LIMITS.files, {
      limits: PRODUCT_IMAGE_UPLOAD_LIMITS,
    }),
  )
  create(
    @Body() dto: CreateProductDto,
    @UploadedFiles() files: UploadedProductFile[] = [],
  ) {
    return this.productsService.create(dto, files);
  }

  @Patch(':id')
  @Roles(Rol.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @UseInterceptors(
    FilesInterceptor('images', PRODUCT_IMAGE_UPLOAD_LIMITS.files, {
      limits: PRODUCT_IMAGE_UPLOAD_LIMITS,
    }),
  )
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProductDto,
    @UploadedFiles() files: UploadedProductFile[] = [],
  ) {
    return this.productsService.update(id, dto, files);
  }

  @Delete(':id')
  @Roles(Rol.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.productsService.remove(id);
  }
}
