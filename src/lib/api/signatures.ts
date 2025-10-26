/**
 * Signature API - Digital signature management endpoints
 */

import { apiClient, unwrap, type ApiResponse, type PaginatedResponse } from './client';

// ============================================================================
// Types
// ============================================================================

export interface Signature {
  id: string;
  documentId: string;
  signerId: string;
  signerName?: string;
  signerEmail?: string;
  signatureData: string; // Base64 encoded signature
  signatureType: 'draw' | 'type' | 'upload' | 'certificate';
  publicKey: string;
  algorithm: 'ed25519' | 'rsa' | 'ecdsa';
  timestamp: string;
  ipAddress?: string;
  location?: {
    latitude: number;
    longitude: number;
  };
  metadata: Record<string, unknown>;
  verified: boolean;
  verifiedAt?: string;
  blockchainTxHash?: string;
  createdAt: string;
}

export interface CreateSignatureInput {
  documentId: string;
  signatureData: string;
  signatureType: Signature['signatureType'];
  publicKey: string;
  algorithm?: Signature['algorithm'];
  metadata?: Record<string, unknown>;
  signerName?: string;
  signerEmail?: string;
}

export interface VerifySignatureInput {
  documentId: string;
  signatureId: string;
  documentHash: string;
}

export interface SignatureVerificationResult {
  valid: boolean;
  signature: Signature;
  timestamp: string;
  verificationMethod: string;
  details?: string;
}

export interface SignatureCertificate {
  id: string;
  userId: string;
  publicKey: string;
  privateKeyEncrypted: string;
  algorithm: string;
  validFrom: string;
  validUntil: string;
  issuer: string;
  revoked: boolean;
  revokedAt?: string;
  createdAt: string;
}

export interface SignatureRequest {
  id: string;
  documentId: string;
  requesterId: string;
  signerId: string;
  status: 'pending' | 'signed' | 'declined' | 'expired';
  message?: string;
  expiresAt: string;
  signedAt?: string;
  createdAt: string;
}

// ============================================================================
// Signature API
// ============================================================================

export const signatureApi = {
  /**
   * Create a new signature
   */
  async create(input: CreateSignatureInput): Promise<ApiResponse<Signature>> {
    return apiClient.post<Signature>('/api/signatures', input);
  },

  /**
   * Get a signature by ID
   */
  async get(id: string): Promise<ApiResponse<Signature>> {
    return apiClient.get<Signature>(`/api/signatures/${id}`);
  },

  /**
   * List signatures for a document
   */
  async listByDocument(
    documentId: string,
    options?: { page?: number; pageSize?: number }
  ): Promise<ApiResponse<PaginatedResponse<Signature>>> {
    const params = new URLSearchParams({ documentId });
    if (options?.page) params.append('page', String(options.page));
    if (options?.pageSize) params.append('pageSize', String(options.pageSize));

    return apiClient.get<PaginatedResponse<Signature>>(`/api/signatures?${params.toString()}`);
  },

  /**
   * List signatures by user
   */
  async listByUser(
    userId: string,
    options?: { page?: number; pageSize?: number }
  ): Promise<ApiResponse<PaginatedResponse<Signature>>> {
    const params = new URLSearchParams({ userId });
    if (options?.page) params.append('page', String(options.page));
    if (options?.pageSize) params.append('pageSize', String(options.pageSize));

    return apiClient.get<PaginatedResponse<Signature>>(`/api/signatures?${params.toString()}`);
  },

  /**
   * Verify a signature
   */
  async verify(input: VerifySignatureInput): Promise<ApiResponse<SignatureVerificationResult>> {
    return apiClient.post<SignatureVerificationResult>('/api/signatures/verify', input);
  },

  /**
   * Batch verify multiple signatures
   */
  async batchVerify(
    signatures: VerifySignatureInput[]
  ): Promise<ApiResponse<SignatureVerificationResult[]>> {
    return apiClient.post<SignatureVerificationResult[]>('/api/signatures/batch-verify', {
      signatures,
    });
  },

  /**
   * Delete a signature
   */
  async delete(id: string): Promise<ApiResponse<void>> {
    return apiClient.delete(`/api/signatures/${id}`);
  },

  /**
   * Generate a signature certificate
   */
  async generateCertificate(
    password: string
  ): Promise<ApiResponse<SignatureCertificate>> {
    return apiClient.post<SignatureCertificate>('/api/signatures/certificates', {
      password,
    });
  },

  /**
   * Get user's certificates
   */
  async getCertificates(): Promise<ApiResponse<SignatureCertificate[]>> {
    return apiClient.get<SignatureCertificate[]>('/api/signatures/certificates');
  },

  /**
   * Revoke a certificate
   */
  async revokeCertificate(certificateId: string): Promise<ApiResponse<void>> {
    return apiClient.post(`/api/signatures/certificates/${certificateId}/revoke`);
  },

  /**
   * Create a signature request
   */
  async createRequest(
    documentId: string,
    signerId: string,
    message?: string,
    expiresAt?: string
  ): Promise<ApiResponse<SignatureRequest>> {
    return apiClient.post<SignatureRequest>('/api/signatures/requests', {
      documentId,
      signerId,
      message,
      expiresAt,
    });
  },

  /**
   * Get signature request
   */
  async getRequest(requestId: string): Promise<ApiResponse<SignatureRequest>> {
    return apiClient.get<SignatureRequest>(`/api/signatures/requests/${requestId}`);
  },

  /**
   * List signature requests (sent or received)
   */
  async listRequests(
    type: 'sent' | 'received',
    options?: { page?: number; pageSize?: number }
  ): Promise<ApiResponse<PaginatedResponse<SignatureRequest>>> {
    const params = new URLSearchParams({ type });
    if (options?.page) params.append('page', String(options.page));
    if (options?.pageSize) params.append('pageSize', String(options.pageSize));

    return apiClient.get<PaginatedResponse<SignatureRequest>>(
      `/api/signatures/requests?${params.toString()}`
    );
  },

  /**
   * Respond to a signature request
   */
  async respondToRequest(
    requestId: string,
    action: 'sign' | 'decline',
    signatureData?: CreateSignatureInput
  ): Promise<ApiResponse<SignatureRequest>> {
    return apiClient.post<SignatureRequest>(`/api/signatures/requests/${requestId}/respond`, {
      action,
      signatureData,
    });
  },

  /**
   * Anchor signature to blockchain
   */
  async anchorToBlockchain(signatureId: string): Promise<ApiResponse<{ txHash: string }>> {
    return apiClient.post<{ txHash: string }>(`/api/signatures/${signatureId}/anchor`);
  },

  /**
   * Get signature audit trail
   */
  async getAuditTrail(signatureId: string): Promise<ApiResponse<any[]>> {
    return apiClient.get<any[]>(`/api/signatures/${signatureId}/audit`);
  },

  /**
   * Export signature certificate
   */
  async exportCertificate(
    certificateId: string,
    format: 'pem' | 'der' | 'p12'
  ): Promise<ApiResponse<Blob>> {
    return apiClient.get<Blob>(`/api/signatures/certificates/${certificateId}/export/${format}`);
  },
};

// ============================================================================
// Convenience Functions with unwrap
// ============================================================================

export const signatures = {
  create: (input: CreateSignatureInput) => unwrap(signatureApi.create(input)),
  get: (id: string) => unwrap(signatureApi.get(id)),
  listByDocument: (documentId: string, options?: { page?: number; pageSize?: number }) =>
    unwrap(signatureApi.listByDocument(documentId, options)),
  listByUser: (userId: string, options?: { page?: number; pageSize?: number }) =>
    unwrap(signatureApi.listByUser(userId, options)),
  verify: (input: VerifySignatureInput) => unwrap(signatureApi.verify(input)),
  batchVerify: (signatures: VerifySignatureInput[]) => unwrap(signatureApi.batchVerify(signatures)),
  delete: (id: string) => unwrap(signatureApi.delete(id)),
  generateCertificate: (password: string) => unwrap(signatureApi.generateCertificate(password)),
  getCertificates: () => unwrap(signatureApi.getCertificates()),
  revokeCertificate: (certificateId: string) => unwrap(signatureApi.revokeCertificate(certificateId)),
  createRequest: (documentId: string, signerId: string, message?: string, expiresAt?: string) =>
    unwrap(signatureApi.createRequest(documentId, signerId, message, expiresAt)),
  getRequest: (requestId: string) => unwrap(signatureApi.getRequest(requestId)),
  listRequests: (type: 'sent' | 'received', options?: { page?: number; pageSize?: number }) =>
    unwrap(signatureApi.listRequests(type, options)),
  respondToRequest: (requestId: string, action: 'sign' | 'decline', signatureData?: CreateSignatureInput) =>
    unwrap(signatureApi.respondToRequest(requestId, action, signatureData)),
  anchorToBlockchain: (signatureId: string) => unwrap(signatureApi.anchorToBlockchain(signatureId)),
  getAuditTrail: (signatureId: string) => unwrap(signatureApi.getAuditTrail(signatureId)),
  exportCertificate: (certificateId: string, format: 'pem' | 'der' | 'p12') =>
    unwrap(signatureApi.exportCertificate(certificateId, format)),
};
