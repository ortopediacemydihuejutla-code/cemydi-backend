import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { buildValidationException } from './common/errors/validation-error.util';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService);
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  app.use(cookieParser());
  const configuredOrigins = (
    configService.get<string>('CORS_ORIGIN') ?? 'http://localhost:3000'
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  app.enableCors({
    origin:
      configuredOrigins.length === 1 ? configuredOrigins[0] : configuredOrigins,
    credentials: true,
  });

  // Validación de datos de entrada
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      exceptionFactory: buildValidationException,
    }),
  );

  const isProduction = configService.get<string>('NODE_ENV') === 'production';
  const swaggerEnabled =
    !isProduction ||
    ['true', '1', 'yes', 'si'].includes(
      (configService.get<string>('SWAGGER_ENABLED') ?? '').trim().toLowerCase(),
    );

  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Cemydi API')
      .setDescription('API del backend de Ortopedia Cemydi')
      .setVersion('1.0')
      .addCookieAuth('cemydi_access')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
  }

  await app.listen(Number(configService.get<string>('PORT') ?? '4000'));
}

void bootstrap();
