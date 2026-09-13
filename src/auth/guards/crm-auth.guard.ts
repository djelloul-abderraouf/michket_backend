import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

import { AuthService } from '../auth.service';

@Injectable()
export class CrmAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('CRM authentication required');
    }

    try {
      const payload = this.jwtService.verify(token);
      const crmUser = await this.authService.validateCrmUser({
        id: payload.sub,
        email: payload.email,
      });

      if (!crmUser) {
        throw new UnauthorizedException('CRM user not found or inactive');
      }

      // Attach CRM user to request
      request['crmUser'] = crmUser;
      return true;
    } catch (error) {
      throw new UnauthorizedException('Invalid CRM authentication');
    }
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
