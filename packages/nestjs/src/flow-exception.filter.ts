/* eslint-disable @typescript-eslint/no-explicit-any */
import { ArgumentsHost, Catch, type ExceptionFilter } from '@nestjs/common';
import { FlowHttpError } from '@pathline/core';

/**
 * NestJS exception filter that maps a thrown {@link FlowHttpError} to an HTTP
 * JSON response `{ code, message, details }` with the error's `statusCode`.
 *
 * **When to use:** apply with `@UseFilters(FlowHttpExceptionFilter)` on
 * controllers/handlers that run flows (or register it globally).
 *
 * **Why:** lets domain failures thrown as `FlowHttpError` become correct HTTP
 * responses automatically, keeping controllers thin. Supports both Express
 * (`res.status().json()`) and Fastify (`res.code().send()`).
 */
@Catch(FlowHttpError)
export class FlowHttpExceptionFilter implements ExceptionFilter {
  catch(error: FlowHttpError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<any>();
    const body = {
      code: error.code,
      message: error.message,
      details: error.details,
    };
    if (typeof response.status === 'function') {
      response.status(error.statusCode).json(body);
    } else if (typeof response.code === 'function') {
      response.code(error.statusCode).send(body);
    }
  }
}
