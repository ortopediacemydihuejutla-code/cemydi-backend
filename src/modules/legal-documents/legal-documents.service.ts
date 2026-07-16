import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateLegalDocumentDto } from './dto/update-legal-document.dto';
import {
  buildLegalSections,
  DEFAULT_LEGAL_DOCUMENTS,
  isLegalDocumentSlug,
  LEGAL_FIELD_KEYS,
  type LegalDocumentContent,
  type LegalDocumentFields,
  type LegalDocumentSlug,
} from './legal-documents.constants';

@Injectable()
export class LegalDocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  async getPublicContent(slugValue: string) {
    const slug = this.assertSlug(slugValue);
    const document = await this.prisma.asReader().legalDocument.findUnique({
      where: { slug },
    });

    return {
      document: document
        ? this.serialize(document)
        : this.serializeDefault(slug),
    };
  }

  async update(slugValue: string, dto: UpdateLegalDocumentDto) {
    const slug = this.assertSlug(slugValue);
    const defaults = DEFAULT_LEGAL_DOCUMENTS[slug];
    const existing = await this.prisma.legalDocument.findUnique({
      where: { slug },
    });
    const currentContent = existing
      ? this.parseContent(slug, existing.sections)
      : { fields: defaults.fields, customSections: defaults.customSections };
    const fields = this.mergeFields(slug, currentContent.fields, dto.fields);
    const customSections = (
      dto.customSections ?? currentContent.customSections
    ).map((section, index) => ({
      id: section.id?.trim() || `custom-${Date.now()}-${index}`,
      title: section.title.trim(),
      body: section.body.trim(),
      ...(section.variant === 'medical-alert'
        ? { variant: 'medical-alert' as const }
        : {}),
    }));
    const content: LegalDocumentContent = { fields, customSections };
    const title = dto.title?.trim();
    const description = dto.description?.trim();

    const document = await this.prisma.legalDocument.upsert({
      where: { slug },
      create: {
        slug,
        title: title ?? defaults.title,
        description: description ?? defaults.description,
        sections: content as Prisma.InputJsonValue,
      },
      update: {
        ...(title !== undefined ? { title } : {}),
        ...(description !== undefined ? { description } : {}),
        sections: content as Prisma.InputJsonValue,
      },
    });

    return {
      message: `${document.title} actualizados correctamente`,
      document: this.serialize(document),
    };
  }

  private mergeFields(
    slug: LegalDocumentSlug,
    current: LegalDocumentFields,
    incoming?: object,
  ) {
    const allowedKeys = new Set(LEGAL_FIELD_KEYS[slug]);
    const fields: LegalDocumentFields = { ...current };

    for (const [key, value] of Object.entries(incoming ?? {})) {
      if (
        allowedKeys.has(key) &&
        (typeof value === 'string' || typeof value === 'boolean')
      ) {
        fields[key] = typeof value === 'string' ? value.trim() : value;
      }
    }

    return fields;
  }

  private parseContent(
    slug: LegalDocumentSlug,
    value: Prisma.JsonValue,
  ): LegalDocumentContent {
    const defaults = DEFAULT_LEGAL_DOCUMENTS[slug];

    if (Array.isArray(value)) {
      const legacySections = value
        .filter(
          (item): item is Prisma.JsonObject =>
            typeof item === 'object' && item !== null && !Array.isArray(item),
        )
        .map((section, index) => ({
          id: `legacy-${index + 1}`,
          title: this.readJsonString(section.title, `Apartado ${index + 1}`),
          body: this.readJsonString(section.body),
          ...(section.variant === 'medical-alert'
            ? { variant: 'medical-alert' as const }
            : {}),
        }))
        .filter((section) => section.body.trim());

      return { fields: defaults.fields, customSections: legacySections };
    }

    if (typeof value !== 'object' || value === null) {
      return {
        fields: defaults.fields,
        customSections: defaults.customSections,
      };
    }

    const raw = value;
    const rawFields =
      typeof raw.fields === 'object' &&
      raw.fields !== null &&
      !Array.isArray(raw.fields)
        ? raw.fields
        : {};
    const fields = this.mergeFields(slug, defaults.fields, rawFields);
    const customSections = Array.isArray(raw.customSections)
      ? raw.customSections
          .filter(
            (item): item is Prisma.JsonObject =>
              typeof item === 'object' && item !== null && !Array.isArray(item),
          )
          .map((section, index) => ({
            id: this.readJsonString(section.id, `custom-${index + 1}`),
            title: this.readJsonString(section.title),
            body: this.readJsonString(section.body),
            ...(section.variant === 'medical-alert'
              ? { variant: 'medical-alert' as const }
              : {}),
          }))
      : [];

    return { fields, customSections };
  }

  private serializeDefault(slug: LegalDocumentSlug) {
    const defaults = DEFAULT_LEGAL_DOCUMENTS[slug];
    return {
      ...defaults,
      sections: buildLegalSections(
        slug,
        defaults.fields,
        defaults.customSections,
      ),
    };
  }

  private readJsonString(value: Prisma.JsonValue | undefined, fallback = '') {
    return typeof value === 'string' ? value : fallback;
  }

  private serialize(document: {
    id: number;
    slug: string;
    title: string;
    description: string;
    sections: Prisma.JsonValue;
    updatedAt: Date;
    createdAt: Date;
  }) {
    const slug = this.assertSlug(document.slug);
    const content = this.parseContent(slug, document.sections);

    return {
      ...document,
      ...content,
      sections: buildLegalSections(
        slug,
        content.fields,
        content.customSections,
      ),
    };
  }

  private assertSlug(value: string): LegalDocumentSlug {
    if (!isLegalDocumentSlug(value)) {
      throw new BadRequestException('Documento legal no válido');
    }

    return value;
  }
}
