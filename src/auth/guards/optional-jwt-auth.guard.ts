import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{
      headers?: { authorization?: string };
    }>();

    const authorization = request.headers?.authorization;

    // No token: allow guest access.
    if (!authorization) {
      return true;
    }

    // A token was provided: Passport must validate it.
    return super.canActivate(context);
  }

  handleRequest<TUser = any>(
    err: any,
    user: TUser | false | null,
    _info: any,
    _context: ExecutionContext,
    _status?: any,
  ): TUser {
    if (err) {
      throw err;
    }

    if (!user) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    return user;
  }
}
