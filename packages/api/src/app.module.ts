import { Module } from '@nestjs/common';
import { AdminModule } from './admin.module';

@Module({
  imports: [AdminModule],
})
export class AppModule {}
