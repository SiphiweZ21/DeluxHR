import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

app.enableCors({
  origin: [
    'http://localhost:3001',
    'http://127.0.0.1:3001',
    'http://192.168.8.101:3001',
    'http://192.168.8.102:3001',
  ],
  credentials: true,
});

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  await app.listen(process.env.PORT ?? 3000);
}

bootstrap();