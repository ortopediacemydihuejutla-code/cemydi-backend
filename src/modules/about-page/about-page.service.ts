import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ProductsCloudinaryService } from '../products/products-cloudinary.service';
import type { UploadedProductFile } from '../products/products-cloudinary.types';
import { UpdateAboutPageDto } from './dto/update-about-page.dto';

const DEFAULT_VALUES = [
  'Empatía',
  'Confianza',
  'Responsabilidad',
  'Servicio',
  'Calidad',
];

@Injectable()
export class AboutPageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly productsCloudinaryService: ProductsCloudinaryService,
  ) {}

  async getPublicContent() {
    const aboutPage = await this.prisma.asReader().aboutPage.findUnique({
      where: { id: 1 },
    });

    return { aboutPage: this.serialize(aboutPage) };
  }

  async update(
    dto: UpdateAboutPageDto,
    files: {
      heroImage?: UploadedProductFile;
      secondaryImage?: UploadedProductFile;
    } = {},
  ) {
    const data: Prisma.AboutPageUpdateInput = {};
    const createData: Prisma.AboutPageCreateInput = { id: 1 };

    const requiredStringFields = [
      'heroTitle',
      'heroSubtitle',
      'missionTitle',
      'missionText',
      'visionTitle',
      'visionText',
      'valuesTitle',
      'storyTitle',
      'storyText',
    ] as const;

    for (const field of requiredStringFields) {
      if (dto[field] !== undefined) {
        const value = dto[field].trim();
        data[field] = value;
        createData[field] = value;
      }
    }

    if (dto.heroImageUrl !== undefined) {
      const value = dto.heroImageUrl.trim() || null;
      data.heroImageUrl = value;
      createData.heroImageUrl = value;
    }

    if (dto.secondaryImageUrl !== undefined) {
      const value = dto.secondaryImageUrl.trim() || null;
      data.secondaryImageUrl = value;
      createData.secondaryImageUrl = value;
    }

    if (files.heroImage) {
      this.productsCloudinaryService.validateImageOperation(
        [],
        [files.heroImage],
      );
      const [uploadedHero] =
        await this.productsCloudinaryService.uploadProductImages(
          [],
          [files.heroImage],
        );
      data.heroImageUrl = uploadedHero.imageUrl;
      createData.heroImageUrl = uploadedHero.imageUrl;
    }

    if (files.secondaryImage) {
      this.productsCloudinaryService.validateImageOperation(
        [],
        [files.secondaryImage],
      );
      const [uploadedSecondary] =
        await this.productsCloudinaryService.uploadProductImages(
          [],
          [files.secondaryImage],
        );
      data.secondaryImageUrl = uploadedSecondary.imageUrl;
      createData.secondaryImageUrl = uploadedSecondary.imageUrl;
    }

    if (dto.values !== undefined) {
      const values = dto.values.map((value) => value.trim()).filter(Boolean);

      if (values.length === 0) {
        throw new BadRequestException('Agrega al menos un valor');
      }

      data.values = values;
      createData.values = values;
    }

    const aboutPage = await this.prisma.aboutPage.upsert({
      where: { id: 1 },
      create: createData,
      update: data,
    });

    return {
      message: 'Página Quiénes somos actualizada correctamente',
      aboutPage: this.serialize(aboutPage),
    };
  }

  private serialize(
    aboutPage: {
      id: number;
      heroTitle: string;
      heroSubtitle: string;
      missionTitle: string;
      missionText: string;
      visionTitle: string;
      visionText: string;
      valuesTitle: string;
      values: Prisma.JsonValue;
      storyTitle: string;
      storyText: string;
      heroImageUrl: string | null;
      secondaryImageUrl: string | null;
      updatedAt: Date;
      createdAt: Date;
    } | null,
  ) {
    if (!aboutPage) {
      return null;
    }

    return {
      ...aboutPage,
      values: Array.isArray(aboutPage.values)
        ? aboutPage.values.filter(
            (value): value is string => typeof value === 'string',
          )
        : DEFAULT_VALUES,
    };
  }
}
