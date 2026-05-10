import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { createLogger, shutdown } from '@all-in-one-mcp/shared';
import { AdminModule } from './admin.module';

async function bootstrap() {
  const logger = createLogger('api.bootstrap');
  const app = await NestFactory.create(AdminModule, {
    logger: false,
  });

  const config = new DocumentBuilder()
    .setTitle('All-in-one MCP API')
    .setDescription('The API for the all-in-one MCP runtime.')
    .setVersion('1.0')
    .addTag('MCP')
    .build();
  const document = cleanupOpenApiDoc(SwaggerModule.createDocument(app, config));
  SwaggerModule.setup('api', app, document);
  await app.listen(process.env.PORT ?? 3001);

  const closeApp = async () => {
    try {
      await shutdown(10_000, [async () => app.close()]);
    } catch (error) {
      logger.error({ err: error }, 'API shutdown failed');
      process.exitCode = 1;
    } finally {
      process.exit();
    }
  };

  process.once('SIGINT', () => {
    void closeApp();
  });
  process.once('SIGTERM', () => {
    void closeApp();
  });
}
void bootstrap();
