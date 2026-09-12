import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';

import type { Response } from 'express';

import { ZodError } from 'zod';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: Error, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    if (exception instanceof ZodError) {
      response.status(400).json({
        message: exception.issues
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('; '),
      });

      return;
    }
    if (exception instanceof HttpException) {
      response.status(exception.getStatus()).json(exception.getResponse());

      return;
    }
    Logger.error(exception.stack ?? exception.message, 'API');
    response.status(500).json({
      message: 'Something went wrong. Please retry. No partial financial changes were saved.',
    });
  }
}
