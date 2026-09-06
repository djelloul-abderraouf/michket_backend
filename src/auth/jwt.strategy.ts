import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { passportJwtSecret } from 'jwks-rsa';

import { AuthService } from './auth.service';

type SupabaseJwtPayload = {
  sub?: string;
  email?: string;
  role?: string;
  iss?: string;
  exp?: number;
  iat?: number;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly authService: AuthService,
    configService: ConfigService,
  ) {
    const supabaseUrl = configService
      .getOrThrow<string>('SUPABASE_URL')
      .replace(/\/$/, '');

    const jwksUrl = configService.getOrThrow<string>('SUPABASE_JWKS_URL');

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      issuer: `${supabaseUrl}/auth/v1`,
      algorithms: ['ES256', 'RS256'],
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 10,
        jwksUri: jwksUrl,
      }),
    });
  }

  async validate(payload: SupabaseJwtPayload) {
    if (!payload.sub || !payload.email) {
      throw new UnauthorizedException('Invalid Supabase token');
    }

    // Supabase's JWT "role" is a PostgreSQL role (usually "authenticated").
    // Michket business roles always come from our own users table.
    const user = await this.authService.validateUser({
      id: payload.sub,
      email: payload.email,
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return user;
  }
}
