import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';

import { AuthService } from '../auth.service';

export type CrmRequestUser = {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role: string;
  roles: string[];
};

interface CrmRequest extends Request {
  user?: {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
    role: string;
  };
  crmUser?: CrmRequestUser;
}

@Injectable()
export class CrmAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly authService: AuthService) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const activated = await super.canActivate(context);
    if (!activated) {
      throw new UnauthorizedException('CRM authentication required');
    }

    const request = context.switchToHttp().getRequest<CrmRequest>();
    const user = request.user;

    if (!user?.id || !user?.email || !user.role) {
      throw new UnauthorizedException('CRM authentication required');
    }

    const crmUser = this.authService.toCrmUser({
      id: user.id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      isActive: true,
    });

    if (!crmUser) {
      throw new UnauthorizedException('CRM user not found or inactive');
    }

    request.crmUser = crmUser;
    return true;
  }
}
