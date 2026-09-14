import { createParamDecorator, ExecutionContext } from '@nestjs/common';

interface CrmRequest {
  crmUser?: {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
    role: 'customer' | 'admin' | 'super_admin';
    roles: string[];
  };
}

export const CurrentCrmUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<CrmRequest>();
    return request.crmUser;
  },
);
