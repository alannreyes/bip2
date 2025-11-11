import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // Global prefix
  app.setGlobalPrefix('api');

  // Validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // CORS - Allow multiple origins for local development and remote access
  const corsOriginsEnv = configService.get('CORS_ORIGIN');
  const corsOrigins = [
    'http://localhost:3000',
    'http://localhost:3002',
    'http://localhost:3003',
    'http://localhost:3004',
    'http://localhost:3011',
    'http://127.0.0.1:3011',
    'http://192.168.40.197:3011',  // Production frontend server
    'http://192.168.40.197:3000',  // Alternative frontend port
    'http://frontend:3000',        // Docker internal frontend service
    'http://bip2-frontend:3000',   // Docker container name
    ...(corsOriginsEnv ? corsOriginsEnv.split(',').map(origin => origin.trim()) : []),
  ].filter(Boolean);

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  // Swagger API Documentation
  const config = new DocumentBuilder()
    .setTitle('Qdrant Catalog Sync API')
    .setDescription(
      'API para sincronización de catálogos con Qdrant usando búsqueda semántica con Gemini AI',
    )
    .setVersion('1.0')
    .addTag('datasources', 'Gestión de fuentes de datos')
    .addTag('sync', 'Sincronización y jobs')
    .addTag('collections', 'Colecciones de Qdrant')
    .addTag('search', 'Búsqueda semántica')
    .addTag('webhooks', 'Webhooks para sincronización')
    .addTag('health', 'Estado del sistema')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = configService.get('PORT') || 3001;
  await app.listen(port);

  console.log(`🚀 Application is running on: http://localhost:${port}/api`);
  console.log(`📚 API Documentation: http://localhost:${port}/api/docs`);
}

bootstrap();
