/**
 * Input Validation Schemas
 * Zod schemas for API request validation
 */

import { z } from 'zod';

// ============================================================================
// Document Schemas
// ============================================================================

export const createDocumentSchema = z.object({
  title: z.string().min(1).max(500),
  content: z.string().optional().default(''),
  contentType: z.enum(['text', 'html', 'markdown', 'pdf']).optional().default('html'),
  encrypted: z.boolean().optional().default(false),
  metadata: z.record(z.unknown()).optional().default({}),
  tags: z.array(z.string()).optional().default([]),
  status: z.enum(['draft', 'published', 'archived']).optional().default('draft'),
});

export const updateDocumentSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  content: z.string().optional(),
  encrypted: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
  tags: z.array(z.string()).optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
});

export const documentSearchSchema = z.object({
  query: z.string().optional(),
  tags: z.string().optional(), // Comma-separated
  status: z.enum(['draft', 'published', 'archived']).optional(),
  encrypted: z.string().optional(), // 'true' or 'false'
  ownerId: z.string().uuid().optional(),
  sortBy: z.enum(['createdAt', 'updatedAt', 'title']).optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  page: z.string().optional().transform(Number).pipe(z.number().int().positive()).optional(),
  pageSize: z.string().optional().transform(Number).pipe(z.number().int().positive().max(100)).optional(),
});

// ============================================================================
// Signature Schemas
// ============================================================================

export const createSignatureSchema = z.object({
  documentId: z.string().uuid(),
  signatureData: z.string().min(1),
  signatureType: z.enum(['draw', 'type', 'upload', 'certificate']),
  publicKey: z.string().min(1),
  algorithm: z.enum(['ed25519', 'rsa', 'ecdsa']).optional().default('ed25519'),
  metadata: z.record(z.unknown()).optional().default({}),
  signerName: z.string().optional(),
  signerEmail: z.string().email().optional(),
});

export const verifySignatureSchema = z.object({
  documentId: z.string().uuid(),
  signatureId: z.string().uuid(),
  documentHash: z.string().min(1),
});

// ============================================================================
// Storage Schemas
// ============================================================================

export const uploadOptionsSchema = z.object({
  bucket: z.string().optional(),
  filename: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  encrypted: z.boolean().optional(),
  publicRead: z.boolean().optional(),
  contentType: z.string().optional(),
});

// ============================================================================
// Search Schemas
// ============================================================================

export const searchQuerySchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().positive().max(100).optional().default(20),
  offset: z.number().int().nonnegative().optional().default(0),
  filter: z.union([z.string(), z.array(z.string())]).optional(),
  sort: z.array(z.string()).optional(),
  facets: z.array(z.string()).optional(),
  attributesToRetrieve: z.array(z.string()).optional(),
  attributesToHighlight: z.array(z.string()).optional(),
  attributesToCrop: z.array(z.string()).optional(),
});

// ============================================================================
// Validation Helper
// ============================================================================

export function validateRequest<T>(schema: z.Schema<T>, data: unknown): {
  success: boolean;
  data?: T;
  errors?: z.ZodError;
} {
  try {
    const validated = schema.parse(data);
    return { success: true, data: validated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, errors: error };
    }
    throw error;
  }
}

export function getValidationErrors(errors: z.ZodError): string[] {
  return errors.errors.map((err) => {
    const path = err.path.join('.');
    return `${path}: ${err.message}`;
  });
}

// ============================================================================
// Type Exports
// ============================================================================

export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;
export type UpdateDocumentInput = z.infer<typeof updateDocumentSchema>;
export type DocumentSearchInput = z.infer<typeof documentSearchSchema>;
export type CreateSignatureInput = z.infer<typeof createSignatureSchema>;
export type VerifySignatureInput = z.infer<typeof verifySignatureSchema>;
export type UploadOptions = z.infer<typeof uploadOptionsSchema>;
export type SearchQuery = z.infer<typeof searchQuerySchema>;
