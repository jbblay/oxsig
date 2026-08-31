export function mapSignatureRow(row: any) {
  return {
    id: row.id,
    documentId: row.document_id,
    documentTitle: row.document_title,
    signerId: row.signer_id,
    signerName: row.signer_name,
    signerEmail: row.signer_email,
    signatureData: row.signature_data,
    signatureType: row.signature_type,
    publicKey: row.public_key,
    algorithm: row.algorithm,
    signedAt: row.signed_at,
    metadata: row.metadata,
    verified: row.verified,
    verifiedAt: row.verified_at,
    createdAt: row.created_at,
  };
}
