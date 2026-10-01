import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });

  const allowedOrigins = [
    // Local development
    'http://localhost:3001',
    'http://127.0.0.1:3001',

    // Local network development
    'http://192.168.8.101:3001',
    'http://192.168.8.102:3001',

    // Render production/testing
    'https://deluxhr-web.onrender.com',

    // Permanent DeluxHR application
    'https://app.deluxhr.co.za',
  ];

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests that do not originate from a browser,
      // such as server-to-server requests and API tools.
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`Origin ${origin} is not allowed by CORS`), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
  });

  await app.listen(process.env.PORT ?? 3000);
}

bootstrap();