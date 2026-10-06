import { Module } from '@nestjs/common';
import { AuthModule } from './auth.module';
import { DatabaseModule } from './database.module';
import { WorkspaceController } from '../controllers/workspace.controller';
import { WorkspaceService } from '../services/workspace.service';
import { AttachmentsController } from '../controllers/attachments.controller';
import { AttachmentsService } from '../services/attachments.service';
import { ManagementReportsController } from '../controllers/management-reports.controller';
import { ManagementReportsService } from '../services/management-reports.service';
import { OrderInventoryController } from '../controllers/order-inventory.controller';
import { OrderInventoryService } from '../services/order-inventory.service';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [
    WorkspaceController,
    AttachmentsController,
    ManagementReportsController,
    OrderInventoryController,
  ],
  providers: [
    WorkspaceService,
    AttachmentsService,
    ManagementReportsService,
    OrderInventoryService,
  ],
})
export class WorkspaceModule {}
