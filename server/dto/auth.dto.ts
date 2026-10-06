import type { z } from 'zod';
import type {
  acceptInviteSchema,
  inviteResultSchema,
  inviteSchema,
  loginSchema,
  createCompanySchema,
} from '../../shared/schema';

export type LoginDto = z.infer<typeof loginSchema>;
export type CreateCompanyDto = z.infer<typeof createCompanySchema>;
export type CreateInvitationDto = z.infer<typeof inviteSchema>;
export type AcceptInvitationDto = z.infer<typeof acceptInviteSchema>;
export type InvitationResultDto = z.infer<typeof inviteResultSchema>;

export interface AuthConfigDto {
  demoEnabled: boolean;
  passwordResetEnabled: boolean;
}

export interface AuthResultDto {
  ok: boolean;
  mfaRequired?: boolean;
}
