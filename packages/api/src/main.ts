import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AdminModule } from "./admin.module";

async function bootstrap() {
  const app = await NestFactory.create(AdminModule);

  const config = new DocumentBuilder()
    .setTitle("All-in-one MCP API")
    .setDescription("The API for the all-in-one MCP runtime.")
    .setVersion("1.0")
    .addTag("MCP")
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("api", app, document);
  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
