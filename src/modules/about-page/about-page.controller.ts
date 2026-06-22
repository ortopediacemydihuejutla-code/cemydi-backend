import {
  Body,
  Controller,
  Get,
  Patch,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { Rol } from '@prisma/client';
import type { UploadedProductFile } from '../products/products-cloudinary.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AboutPageService } from './about-page.service';
import { UpdateAboutPageDto } from './dto/update-about-page.dto';

@Controller('about-page')
export class AboutPageController {
  constructor(private readonly aboutPageService: AboutPageService) {}

  @Get()
  getPublicContent() {
    return this.aboutPageService.getPublicContent();
  }

  @Patch()
  @Roles(Rol.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'heroImage', maxCount: 1 },
      { name: 'secondaryImage', maxCount: 1 },
    ]),
  )
  update(
    @Body() dto: UpdateAboutPageDto,
    @UploadedFiles()
    files: {
      heroImage?: UploadedProductFile[];
      secondaryImage?: UploadedProductFile[];
    } = {},
  ) {
    return this.aboutPageService.update(dto, {
      heroImage: files.heroImage?.[0],
      secondaryImage: files.secondaryImage?.[0],
    });
  }
}
