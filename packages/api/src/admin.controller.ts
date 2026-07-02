import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import {
  AdminHealthDto,
  AdminReadinessDto,
  ManagedMcpCollectionDto,
} from './admin.dto';

@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('health')
  @ApiOkResponse({ type: AdminHealthDto })
  health(): AdminHealthDto {
    return { status: 'ok' };
  }

  @Get()
  @ApiOkResponse({ type: ManagedMcpCollectionDto })
  getMcps(): ManagedMcpCollectionDto {
    return this.adminService.listMcps() as ManagedMcpCollectionDto;
  }

  @Get('/readyz')
  @ApiOkResponse({ type: AdminReadinessDto })
  async readiness(): Promise<AdminReadinessDto> {
    return (await this.adminService.readiness()) as AdminReadinessDto;
  }
}