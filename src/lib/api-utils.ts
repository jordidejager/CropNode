/**
 * API Utilities - Shared error handling and validation for all API routes
 *
 * Fase 2.6.1: Defensive Validation
 * Goal: API routes should NEVER crash with 500 errors
 */

import { NextResponse } from 'next/server';
import { z, ZodError, ZodSchema } from 'zod';

// ============================================
// Types
// ============================================

export interface ApiErrorResponse {
  success: false;
  error: string;
  code: string;
  details?: Record<string, unknown>;
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

// Error codes for consistent error handling
export const ErrorCodes = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  BAD_REQUEST: 'BAD_REQUEST',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  RATE_LIMITED: 'RATE_LIMITED',
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];

// ============================================
// Error Response Helpers
// ============================================

/**
 * Create a standardized error response
 */
export function apiError(
  message: string,
  code: ErrorCode = ErrorCodes.INTERNAL_ERROR,
  status: number = 500,
  details?: Record<string, unknown>
): NextResponse<ApiErrorResponse> {
  console.error(`[API Error] ${code}: ${message}`, details);

  return NextResponse.json(
    {
      success: false,
      error: message,
      code,
      details,
    },
    { status }
  );
}

/**
 * Create a standardized success response
 */
export function apiSuccess<T>(data: T, status: number = 200): NextResponse<ApiSuccessResponse<T>> {
  return NextResponse.json(
    {
      success: true,
      data,
    },
    { status }
  );
}

/**
 * Handle validation errors from Zod
 */
export function handleZodError(error: ZodError): NextResponse<ApiErrorResponse> {
  const issues = error.issues.map(i => `${i.path.join('.')}: ${i.message}`);

  return apiError(
    `Validation failed: ${issues.join(', ')}`,
    ErrorCodes.VALIDATION_ERROR,
    400,
    { issues: error.issues }
  );
}

/**
 * Handle unknown errors safely
 */
export function handleUnknownError(error: unknown, context?: string): NextResponse<ApiErrorResponse> {
  const prefix = context ? `[${context}] ` : '';

  if (error instanceof ZodError) {
    return handleZodError(error);
  }

  if (error instanceof Error) {
    // Check for specific error types
    if (error.message.includes('fetch failed') || error.message.includes('ECONNRESET')) {
      return apiError(
        `${prefix}Database connection error. Please try again.`,
        ErrorCodes.SERVICE_UNAVAILABLE,
        503,
        { originalError: error.message }
      );
    }

    if (error.message.includes('rate limit') || error.message.includes('quota')) {
      return apiError(
        `${prefix}Service temporarily unavailable. Please try again later.`,
        ErrorCodes.RATE_LIMITED,
        429,
        { originalError: error.message }
      );
    }

    return apiError(
      `${prefix}${error.message}`,
      ErrorCodes.INTERNAL_ERROR,
      500,
      { stack: process.env.NODE_ENV === 'development' ? error.stack : undefined }
    );
  }

  return apiError(
    `${prefix}An unexpected error occurred`,
    ErrorCodes.INTERNAL_ERROR,
    500,
    { rawError: String(error) }
  );
}

// ============================================
// Input Validation Helpers
// ============================================

/**
 * Validate request body against a Zod schema
 * Returns parsed data or throws ApiError
 */
export async function validateBody<T>(
  request: Request,
  schema: ZodSchema<T>
): Promise<T> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    throw new ValidationError('Invalid JSON in request body');
  }

  const result = schema.safeParse(body);

  if (!result.success) {
    throw new ValidationError(
      `Validation failed: ${result.error.issues.map(i => i.message).join(', ')}`,
      result.error.issues
    );
  }

  return result.data;
}

/**
 * Validate query parameters against a Zod schema
 */
export function validateQuery<T>(
  request: Request,
  schema: ZodSchema<T>
): T {
  const url = new URL(request.url);
  const params: Record<string, string> = {};

  url.searchParams.forEach((value, key) => {
    params[key] = value;
  });

  const result = schema.safeParse(params);

  if (!result.success) {
    throw new ValidationError(
      `Query validation failed: ${result.error.issues.map(i => i.message).join(', ')}`,
      result.error.issues
    );
  }

  return result.data;
}

/**
 * Custom validation error class
 */
export class ValidationError extends Error {
  public issues?: z.ZodIssue[];

  constructor(message: string, issues?: z.ZodIssue[]) {
    super(message);
    this.name = 'ValidationError';
    this.issues = issues;
  }
}

/**
 * Check if error is a ValidationError
 */
export function isValidationError(error: unknown): error is ValidationError {
  return error instanceof ValidationError;
}

// ============================================
// Safe Wrapper for API Handlers
// ============================================

type ApiHandler = (request: Request) => Promise<NextResponse>;

/**
 * Wrap an API handler with automatic error handling
 * Ensures the handler NEVER throws an unhandled exception
 */
export function withErrorHandling(
  handler: ApiHandler,
  context?: string
): ApiHandler {
  return async (request: Request) => {
    try {
      return await handler(request);
    } catch (error) {
      if (isValidationError(error)) {
        return apiError(
          error.message,
          ErrorCodes.VALIDATION_ERROR,
          400,
          { issues: error.issues }
        );
      }

      return handleUnknownError(error, context);
    }
  };
}

// ============================================
// Common Validation Schemas
// ============================================

/**
 * Common schemas that can be reused across API routes
 */
export const CommonSchemas = {
  // Non-empty string
  nonEmptyString: z.string().min(1, 'Field cannot be empty'),

  // UUID
  uuid: z.string().uuid('Invalid UUID format'),

  // Date string (YYYY-MM-DD)
  dateString: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),

  // Positive number
  positiveNumber: z.number().positive('Must be a positive number'),

  // Pagination
  pagination: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),

  // Search query
  searchQuery: z.object({
    query: z.string().min(2, 'Search query must be at least 2 characters'),
  }),
};

// ============================================
// Defensive Helpers
// ============================================

/**
 * Safely get a value with a default fallback
 */
export function safeGet<T>(value: T | undefined | null, defaultValue: T): T {
  return value ?? defaultValue;
}

/**
 * Safely parse a number with fallback
 */
export function safeParseInt(value: string | null | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Safely parse a float with fallback
 */
export function safeParseFloat(value: string | null | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Safely access nested object properties
 */
export function safeAccess<T>(
  obj: unknown,
  path: string[],
  defaultValue: T
): T {
  let current: unknown = obj;

  for (const key of path) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return defaultValue;
    }
    current = (current as Record<string, unknown>)[key];
  }

  return (current as T) ?? defaultValue;
}
