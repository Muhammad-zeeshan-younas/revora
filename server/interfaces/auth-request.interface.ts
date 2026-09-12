import type { Request } from 'express';

import type { Session } from '../../shared/schema';

export interface AuthRequest extends Request {
  auth: Session;
}
