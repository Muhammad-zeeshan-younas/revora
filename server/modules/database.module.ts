import { Module } from '@nestjs/common';
import { DatabaseService } from '../services/database.service';
import { AuthRepository } from '../repositories/auth.repository';
import { WorkspaceRepository } from '../repositories/workspace.repository';
import { WhatsAppDeliveryRepository } from '../repositories/whatsapp-delivery.repository';
import { MonitoringService } from '../services/monitoring.service';

@Module({
  providers: [
    DatabaseService,
    AuthRepository,
    WorkspaceRepository,
    WhatsAppDeliveryRepository,
    MonitoringService,
  ],
  exports: [
    DatabaseService,
    AuthRepository,
    WorkspaceRepository,
    WhatsAppDeliveryRepository,
    MonitoringService,
  ],
})
export class DatabaseModule {}
