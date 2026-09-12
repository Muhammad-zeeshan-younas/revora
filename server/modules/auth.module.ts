import { Module } from '@nestjs/common';
import { DatabaseModule } from './database.module';
import { AuthController } from '../controllers/auth.controller';
import { AuthService } from '../services/auth.service';
import { SessionGuard } from '../guards/session.guard';
import { InvitationsController } from '../controllers/invitations.controller';
import { AccountsService } from '../services/accounts.service';
import { InvitationsService } from '../services/invitations.service';

@Module({
  imports: [DatabaseModule],
  controllers: [AuthController, InvitationsController],
  providers: [AccountsService, AuthService, InvitationsService, SessionGuard],
  exports: [AuthService, SessionGuard],
})
export class AuthModule {}
