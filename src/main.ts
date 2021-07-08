import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  Logger.verbose(process.env.PORT || 3000);
  await app.listen(process.env.PORT || 3000);
}
bootstrap();
