/**
 * Input Validation Middleware
 * 
 * Provides middleware wrappers for validating API request data using Zod schemas.
 * Ensures type safety and consistent error responses.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ZodSchema, ZodError } from 'zod';

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: ValidationError[];
}

/**
 * Format Zod errors into user-friendly format
 */
function formatZodErrors(error: ZodError): ValidationError[] {
  return error.errors.map(err => ({
    field: err.path.join('.'),
    message: err.message,
  }));
}

/**
 * Validate request body against Zod schema
 */
export async function validateRequestBody<T>(
  request: NextRequest,
  schema: ZodSchema<T>
): Promise<ValidationResult<T>> {
  try {
    const body = await request.json();
    const result = schema.safeParse(body);
    
    if (!result.success) {
      return {
        success: false,
        errors: formatZodErrors(result.error),
      };
    }
    
    return {
      success: true,
      data: result.data,
    };
  } catch (error) {
    return {
      success: false,
      errors: [{
        field: 'body',
        message: 'Invalid JSON in request body',
      }],
    };
  }
}

/**
 * Validate query parameters against Zod schema
 */
export function validateQueryParams<T>(
  request: NextRequest,
  schema: ZodSchema<T>
): ValidationResult<T> {
  try {
    const { searchParams } = new URL(request.url);
    const params = Object.fromEntries(searchParams.entries());
    
    const result = schema.safeParse(params);
    
    if (!result.success) {
      return {
        success: false,
        errors: formatZodErrors(result.error),
      };
    }
    
    return {
      success: true,
      data: result.data,
    };
  } catch (error) {
    return {
      success: false,
      errors: [{
        field: 'query',
        message: 'Invalid query parameters',
      }],
    };
  }
}

/**
 * Middleware wrapper for body validation
 * Usage: withBodyValidation(handler, schema)
 */
export function withBodyValidation<T>(
  handler: (request: NextRequest, data: T) => Promise<NextResponse>,
  schema: ZodSchema<T>
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const validation = await validateRequestBody(request, schema);
    
    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          message: 'Request body validation failed',
          errors: validation.errors,
        },
        { status: 400 }
      );
    }
    
    return handler(request, validation.data!);
  };
}

/**
 * Middleware wrapper for query parameter validation
 * Usage: withQueryValidation(handler, schema)
 */
export function withQueryValidation<T>(
  handler: (request: NextRequest, params: T) => Promise<NextResponse>,
  schema: ZodSchema<T>
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const validation = validateQueryParams(request, schema);
    
    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          message: 'Query parameter validation failed',
          errors: validation.errors,
        },
        { status: 400 }
      );
    }
    
    return handler(request, validation.data!);
  };
}

/**
 * Combined middleware: Validation + CSRF + Rate Limiting
 */
export function withValidation<T>(
  handler: (request: NextRequest, data: T) => Promise<NextResponse>,
  schema: ZodSchema<T>,
  options?: {
    csrf?: boolean;
    rateLimit?: { maxRequests: number; windowMs: number };
  }
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    // 1. Check rate limit
    if (options?.rateLimit) {
      const { checkRateLimit } = await import('../security/rate-limit');
      const rateLimitResponse = await checkRateLimit(request, options.rateLimit);
      if (rateLimitResponse) {
        return rateLimitResponse;
      }
    }
    
    // 2. Check CSRF for state-changing methods
    if (options?.csrf !== false) {
      const method = request.method;
      const requiresCsrf = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
      
      if (requiresCsrf) {
        const { validateCsrfToken } = await import('../security/csrf');
        const isValid = validateCsrfToken(request);
        
        if (!isValid) {
          return NextResponse.json(
            {
              error: 'CSRF validation failed',
              message: 'Invalid or missing CSRF token',
            },
            { status: 403 }
          );
        }
      }
    }
    
    // 3. Validate request body
    const validation = await validateRequestBody(request, schema);
    
    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          message: 'Request validation failed',
          errors: validation.errors,
        },
        { status: 400 }
      );
    }
    
    // 4. Call handler with validated data
    return handler(request, validation.data!);
  };
}

/**
 * Sanitize string input (remove dangerous characters)
 */
export function sanitizeString(input: string): string {
  return input
    .replace(/[<>]/g, '') // Remove HTML tags
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, '') // Remove event handlers
    .trim();
}

/**
 * Sanitize object recursively
 */
export function sanitizeObject<T extends Record<string, any>>(obj: T): T {
  const sanitized = { ...obj };
  
  for (const key in sanitized) {
    if (typeof sanitized[key] === 'string') {
      sanitized[key] = sanitizeString(sanitized[key]) as any;
    } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
      sanitized[key] = sanitizeObject(sanitized[key]);
    }
  }
  
  return sanitized;
}

/**
 * Common validation schemas (re-export from schemas.ts)
 */
export { z } from 'zod';

/**
 * Helper to create validation error response
 */
export function validationErrorResponse(errors: ValidationError[]): NextResponse {
  return NextResponse.json(
    {
      error: 'Validation failed',
      message: 'Request validation failed',
      errors,
    },
    { status: 400 }
  );
}

/**
 * Helper to create success response
 */
export function successResponse<T>(data: T, status: number = 200): NextResponse {
  return NextResponse.json(data, { status });
}
