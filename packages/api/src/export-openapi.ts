import type { ManagedMcpCollection } from '@all-in-one-mcp/contracts';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { HealthController } from './health.controller';
import { MANAGED_MCP_RUNTIME } from './tokens';

const emptyCollection: ManagedMcpCollection = {
  items: [],
  generatedAt: new Date(0).toISOString(),
};

@Module({
  controllers: [AdminController, HealthController],
  providers: [
    AdminService,
    {
      provide: MANAGED_MCP_RUNTIME,
      useValue: {
        listMcps(): ManagedMcpCollection {
          return emptyCollection;
        },
      },
    },
  ],
})
class OpenApiModule {}

async function run() {
  const app = await NestFactory.create(OpenApiModule, { logger: false });

  const config = new DocumentBuilder()
    .setTitle('All-in-one MCP API')
    .setVersion('1.0.0')
    .build();

  const document = cleanupOpenApiDoc(SwaggerModule.createDocument(app, config));

  const outDir = join(process.cwd(), 'openapi');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'schema.json'), JSON.stringify(document, null, 2));

  await app.close();
}

void run();
