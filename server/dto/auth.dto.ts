import type { z } from 'zod';
import type {
  acceptInviteSchema,
  inviteResultSchema,
  inviteSchema,
  loginSchema,
  registerSchema,
} from '../../shared/schema';

export type LoginDto = z.infer<typeof loginSchema>;
export type RegisterDto = z.infer<typeof registerSchema>;
export type CreateInvitationDto = z.infer<typeof inviteSchema>;
export type AcceptInvitationDto = z.infer<typeof acceptInviteSchema>;
export type InvitationResultDto = z.infer<typeof inviteResultSchema>;

export interface AuthConfigDto {
  demoEnabled: boolean;
}

export interface AuthResultDto {
  ok: boolean;
}
