export function mapDocumentRow(row: any) {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    contentType: row.content_type,
    ownerId: row.owner_id,
    encrypted: row.encrypted,
    fileUrl: row.storage_key || row.file_url ? `/api/documents/${row.id}/download` : null,
    fileSize: row.file_size === null ? null : Number(row.file_size),
    mimeType: row.mime_type,
    contentHash: row.content_hash,
    metadata: row.metadata,
    tags: row.tags,
    status: row.status,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
