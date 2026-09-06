import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  FastifyRequest,
  FastifyReply,
} from 'fastify';
import { randomUUID } from 'node:crypto';

type FastifyHttpError = Error & {
  statusCode: number;
  code?: string;
};

@Catch()
export class GlobalExceptionFilter
  implements ExceptionFilter
{
  private readonly logger = new Logger(
    'ExceptionFilter',
  );

  catch(
    exception: unknown,
    host: ArgumentsHost,
  ) {
    const ctx = host.switchToHttp();
    const response =
      ctx.getResponse<FastifyReply>();
    const request =
      ctx.getRequest<FastifyRequest>();

    const requestId =
      (request as FastifyRequest & {
        requestId?: string;
      }).requestId ?? randomUUID();

    let status =
      HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] =
      'Internal server error';
    let code = 'INTERNAL_ERROR';

    if (exception instanceof HttpException) {
      status = exception.getStatus();

      const exResponse =
        exception.getResponse();

      if (typeof exResponse === 'string') {
        message = exResponse;
      } else if (
        typeof exResponse === 'object' &&
        exResponse !== null
      ) {
        const body = exResponse as {
          message?: string | string[];
          error?: string;
        };

        message = body.message ?? message;
        code = body.error ?? code;
      }
    } else if (
      this.isFastifyHttpError(exception)
    ) {
      status = exception.statusCode;
      message = exception.message;
      code =
        exception.code ??
        this.defaultCodeForStatus(status);

      // Expected client-side errors such as 429 should not
      // flood production logs as "Unhandled error".
      if (status >= 500) {
        this.logger.error(
          `Fastify error: ${exception.message}`,
          exception.stack,
        );
      }
    } else if (exception instanceof Error) {
      message = exception.message;

      this.logger.error(
        `Unhandled error: ${exception.message}`,
        exception.stack,
      );
    }

    response.status(status).send({
      statusCode: status,
      error: code,
      message: Array.isArray(message)
        ? message
        : [message],
      requestId,
      timestamp: new Date().toISOString(),
    });
  }

  private isFastifyHttpError(
    exception: unknown,
  ): exception is FastifyHttpError {
    return (
      exception instanceof Error &&
      typeof (
        exception as Partial<FastifyHttpError>
      ).statusCode === 'number'
    );
  }

  private defaultCodeForStatus(
    status: number,
  ): string {
    if (
      status === HttpStatus.TOO_MANY_REQUESTS
    ) {
      return 'TOO_MANY_REQUESTS';
    }

    return `HTTP_${status}`;
  }
}
