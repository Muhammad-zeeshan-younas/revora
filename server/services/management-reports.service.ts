import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import type { OnApplicationBootstrap } from '@nestjs/common';
import { Role } from '../../shared/enums';
import { today } from '../../shared/finance';
import { managementReport } from '../../shared/management-report';
import type { ManagementReport } from '../../shared/management-report';
import type { Session } from '../../shared/schema';
import { ManagementReportEntity } from '../models/management-report.model';
import { OrganizationEntity } from '../models/organization.model';
import { WorkspaceRepository } from '../repositories/workspace.repository';
import { DatabaseService } from './database.service';

const REPORT_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const REPORT_REFRESH_MS = 60 * 60 * 1000;

@Injectable()
export class ManagementReportsService implements OnApplicationBootstrap, OnModuleDestroy {
  private timer: ReturnType<typeof setInterval> | null = null;

  private running = false;

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(WorkspaceRepository) private readonly workspaces: WorkspaceRepository,
  ) {}

  onApplicationBootstrap(): void {
    void this.generateLastClosedMonth().catch((error) => Logger.error(error, 'ManagementReports'));
    this.timer = setInterval(() => {
      void this.generateLastClosedMonth().catch((error) =>
        Logger.error(error, 'ManagementReports'),
      );
    }, REPORT_REFRESH_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) {clearInterval(this.timer);}
  }

  private requireManager(session: Session): void {
    if (![Role.Owner, Role.Admin, Role.Accountant].includes(session.user.role)) {
      throw new ForbiddenException('Your role cannot view management reports.');
    }
  }

  private validateMonth(month: string): void {
    if (!REPORT_MONTH_PATTERN.test(month) || month > today().slice(0, 7)) {
      throw new BadRequestException('Choose a current or previous report month.');
    }
  }

  async get(session: Session, month: string): Promise<ManagementReport> {
    this.requireManager(session);
    this.validateMonth(month);
    const currentMonth = today().slice(0, 7);
    if (month < currentMonth) {
      const saved = await this.database.transaction(
        (manager) =>
          manager
            .getRepository(ManagementReportEntity)
            .findOneBy({ organizationId: session.organizationId, month }),
        true,
      );
      if (saved) {return JSON.parse(saved.reportJson) as ManagementReport;}
    }
    const workspace = await this.workspaces.findById(session.organizationId);
    const report = managementReport(workspace.data, month);
    if (month < currentMonth) {await this.save(session.organizationId, month, report);}

    return report;
  }

  async history(session: Session): Promise<{ month: string; generatedAt: string }[]> {
    this.requireManager(session);

    return this.database.transaction(
      async (manager) =>
        manager.getRepository(ManagementReportEntity).find({
          where: { organizationId: session.organizationId },
          select: ['month', 'generatedAt'],
          order: { month: 'DESC' },
          take: 24,
        }),
      true,
    );
  }

  private async save(
    organizationId: string,
    month: string,
    report: ManagementReport,
  ): Promise<void> {
    await this.database.transaction(async (manager) => {
      await manager
        .getRepository(ManagementReportEntity)
        .createQueryBuilder()
        .insert()
        .values({
          organizationId,
          month,
          generatedAt: report.generatedAt,
          reportJson: JSON.stringify(report),
        })
        .orIgnore()
        .execute();
    });
  }

  async generateLastClosedMonth(): Promise<void> {
    if (this.running) {return;}
    this.running = true;
    try {
      const previousMonth = new Date(`${today().slice(0, 7)}-01T00:00:00Z`);
      previousMonth.setUTCDate(1);
      previousMonth.setUTCMonth(previousMonth.getUTCMonth() - 1);
      const month = previousMonth.toISOString().slice(0, 7);
      const ids = await this.database.transaction(async (manager) => {
        const organizations = await manager
          .getRepository(OrganizationEntity)
          .find({ select: ['id'] });
        const saved = await manager
          .getRepository(ManagementReportEntity)
          .find({ where: { month }, select: ['organizationId'] });
        const completed = new Set(saved.map((row) => row.organizationId));

        return organizations.map((row) => row.id).filter((id) => !completed.has(id));
      }, true);
      for (const organizationId of ids) {
        const workspace = await this.workspaces.findById(organizationId);
        await this.save(organizationId, month, managementReport(workspace.data, month));
      }
    } finally {
      this.running = false;
    }
  }
}
