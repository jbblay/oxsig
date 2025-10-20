"use client";

export type UploadResult = { cid: string; size: number };

export async function uploadEncryptedBlob(blob: Blob): Promise<UploadResult> {
  // Stub: In production, use Web3.Storage or IPFS client.
  const cid = `bafy-stub-${crypto.randomUUID()}`;
  return { cid, size: blob.size };
}

export async function fetchEncryptedBlob(cid: string): Promise<Blob> {
  // Stub: fetch from IPFS gateway after auth; here return empty blob.
  return new Blob([], { type: "application/octet-stream" });
}