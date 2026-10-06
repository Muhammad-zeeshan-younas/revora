import {
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { Response } from 'express';
import { DatabaseService } from '../services/database.service';
import { MonitoringService } from '../services/monitoring.service';

@Controller('health')
export class HealthController {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(MonitoringService) private readonly monitoring: MonitoringService,
  ) {}

  @Get()
  health(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready(): Promise<{ status: 'ready' }> {
    try {
      await this.database.transaction((manager) => manager.query('SELECT 1'));

      return { status: 'ready' };
    } catch {
      throw new ServiceUnavailableException('Database is unavailable.');
    }
  }

  @Get('operations')
  async operations(
    @Headers('authorization') authorization: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const token = process.env['OPERATIONS_TOKEN'];
    if (!token || token.length < 32)
      {throw new ServiceUnavailableException('Operations monitoring is not configured.');}
    const supplied = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
    const expectedBytes = Buffer.from(token);
    const suppliedBytes = Buffer.from(supplied);
    if (
      suppliedBytes.length !== expectedBytes.length ||
      !timingSafeEqual(suppliedBytes, expectedBytes)
    ) {
      throw new ForbiddenException('Operations token is invalid.');
    }
    const result = await this.monitoring.operations();
    if (result.status === 'degraded') {response.status(503);}

    return result;
  }
}
