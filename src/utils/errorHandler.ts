import { Prisma } from '@prisma/client';
import { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';

export interface ErrorResponse {
  success: false;
  message: string;
  error?: string;
  code?: string;
}

export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;
  public code?: string;

  constructor(message: string, statusCode: number, code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    this.code = code;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Handle Prisma-specific errors and convert them to user-friendly messages
 */
export const handlePrismaError = (error: any): AppError => {
  // If it's already an AppError, return as is
  if (error instanceof AppError) {
    return error;
  }

  // Handle mock Prisma errors (for testing) or actual Prisma errors
  if (error instanceof Prisma.PrismaClientKnownRequestError || (error.code && typeof error.code === 'string')) {
    switch (error.code) {
      case 'P2002':
        // Unique constraint violation
        const field = error.meta?.target as string[] | undefined;
        const fieldName = field ? field[0] : 'field';
        return new AppError(
          `A record with this ${fieldName} already exists`,
          409,
          'DUPLICATE_ENTRY'
        );

      case 'P2025':
        // Record not found
        return new AppError(
          'The requested record was not found',
          404,
          'RECORD_NOT_FOUND'
        );

      case 'P2003':
        return new AppError(
          'Cannot perform this operation due to related data constraints',
          400,
          'FOREIGN_KEY_CONSTRAINT'
        );

      case 'P2014':
        return new AppError(
          'The change you are trying to make would violate the required relation',
          400,
          'REQUIRED_RELATION_VIOLATION'
        );

      case 'P2021':
        return new AppError(
          'Database table does not exist',
          500,
          'TABLE_NOT_EXISTS'
        );

      case 'P2022':
        return new AppError(
          'Database column does not exist',
          500,
          'COLUMN_NOT_EXISTS'
        );

      case 'P2023':
        return new AppError(
          'Inconsistent column data',
          400,
          'INCONSISTENT_COLUMN_DATA'
        );

      case 'P2024':
        return new AppError(
          'Database connection timeout',
          500,
          'CONNECTION_TIMEOUT'
        );

      case 'P2034':
        return new AppError(
          'Transaction failed due to a write conflict or deadlock',
          409,
          'TRANSACTION_CONFLICT'
        );

      default:
        return new AppError(
          'Database operation failed',
          500,
          'DATABASE_ERROR'
        );
    }
  }

  if (error instanceof Prisma.PrismaClientUnknownRequestError) {
    return new AppError(
      'An unknown database error occurred',
      500,
      'UNKNOWN_DATABASE_ERROR'
    );
  }

  if (error instanceof Prisma.PrismaClientRustPanicError) {
    return new AppError(
      'Database engine error',
      500,
      'DATABASE_ENGINE_ERROR'
    );
  }

  if (error instanceof Prisma.PrismaClientInitializationError) {
    return new AppError(
      'Database connection failed',
      500,
      'DATABASE_CONNECTION_ERROR'
    );
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    return new AppError(
      'Invalid data provided to database',
      400,
      'VALIDATION_ERROR'
    );
  }

  // For any other error, return a generic server error
  return new AppError(
    'An unexpected error occurred',
    500,
    'INTERNAL_SERVER_ERROR'
  );
};

/**
 * Helper to return error response JSON
 */
export const createErrorResponse = (error: AppError, env?: string): ErrorResponse => {
  const errorResponse: ErrorResponse = {
    success: false,
    message: error.message,
    code: error.code
  };

  // Include error details in development mode
  if (env === 'development') {
    errorResponse.error = error.stack;
  }
  return errorResponse;
};

/**
 * Centralized error handler for controllers
 */
export const handleControllerError = (error: any, c: Context): Response => {
  const appError = handlePrismaError(error);
  const response = createErrorResponse(appError, c.env?.NODE_ENV);
  // @ts-ignore
  return c.json(response, appError.statusCode);
};

/**
 * Validation error handler
 */
export const handleValidationError = (message: string): AppError => {
  return new AppError(message, 400, 'VALIDATION_ERROR');
};

/**
 * Authorization error handler
 */
export const handleAuthorizationError = (message: string = 'Unauthorized'): AppError => {
  return new AppError(message, 401, 'UNAUTHORIZED');
};

/**
 * Forbidden error handler
 */
export const handleForbiddenError = (message: string = 'Forbidden'): AppError => {
  return new AppError(message, 403, 'FORBIDDEN');
};

/**
 * Not found error handler
 */
export const handleNotFoundError = (resource: string = 'Resource'): AppError => {
  return new AppError(`${resource} not found`, 404, 'NOT_FOUND');
};
