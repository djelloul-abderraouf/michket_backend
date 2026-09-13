import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { CrmRoles, CRM_ROLES_KEY } from '../../common/decorators/roles.decorator';

@Injectable()
export class CrmRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      CRM_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const crmUser = request['crmUser'];

    if (!crmUser || !crmUser.roles) {
      throw new ForbiddenException('CRM user roles not found');
    }

    const hasRole = requiredRoles.some((role: string) =>
      crmUser.roles.includes(role),
    );

    if (!hasRole) {
      throw new ForbiddenException(
        `Requires one of the following roles: ${requiredRoles.join(', ')}`,
      );
    }

    return true;
  }
}
