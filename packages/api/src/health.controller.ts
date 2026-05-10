import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiResponse } from '@nestjs/swagger';
import { AdminHealthDto, AdminReadinessDto } from './admin.dto';
import { AdminService } from './admin.service';

@Controller()
export class HealthController {
  constructor(private readonly adminService: AdminService) {}

  @Get('livez')
  @ApiOkResponse({ type: AdminHealthDto })
  livez(): AdminHealthDto {
    return { status: 'ok' };
  }

  @Get('readyz')
  @ApiOkResponse({ type: AdminReadinessDto })
  @ApiResponse({ status: 503, type: AdminReadinessDto })
  readyz(): AdminReadinessDto {
    return this.adminService.readiness();
  }
}
