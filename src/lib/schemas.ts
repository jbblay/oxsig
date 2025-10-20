"use client";

export const SCHEMAS: Record<string, unknown> = {
  User: {
    $id: "User",
    type: "object",
    properties: {
      did: { type: "string", description: "Decentralized identifier" },
      displayName: { type: "string" },
      biometricHash: { type: "string", description: "Optional bio-hash reference" },
      devices: {
        type: "array",
        items: {
          type: "object",
          properties: {
            deviceId: { type: "string" },
            publicKey: { type: "string" },
            lastSeen: { type: "string", format: "date-time" },
          },
          required: ["deviceId", "publicKey"],
        },
      },
      recoveryContacts: { type: "array", items: { type: "string", description: "DIDs for social recovery" } },
      consentPolicy: { type: "object", additionalProperties: true },
    },
    required: ["did"],
  },
  Document: {
    $id: "Document",
    type: "object",
    properties: {
      docId: { type: "string" },
      title: { type: "string" },
      hash: { type: "string", description: "SHA-256 hash of plaintext" },
      encryptedBlobCid: { type: "string", description: "IPFS CID" },
      sections: {
        type: "array",
        items: { type: "object", properties: { sectionId: { type: "string" }, maskPolicy: { type: "string" } }, required: ["sectionId"] },
      },
    },
    required: ["docId", "hash", "encryptedBlobCid"],
  },
  Signature: {
    $id: "Signature",
    type: "object",
    properties: {
      sigId: { type: "string" },
      docId: { type: "string" },
      signerDid: { type: "string" },
      timestamp: { type: "string", format: "date-time" },
      geoHash: { type: "string" },
      behavioralMarkers: { type: "object", additionalProperties: true },
      thresholdGroup: { type: "array", items: { type: "string" } },
      duress: { type: "boolean" },
      zkProofRef: { type: "string", description: "Reference to ZK proof artifact" },
      verifiableCredential: { type: "object", additionalProperties: true },
    },
    required: ["sigId", "docId", "signerDid", "timestamp"],
  },
  Key: {
    $id: "Key",
    type: "object",
    properties: {
      kid: { type: "string" },
      type: { type: "string", enum: ["Ed25519", "Dilithium", "Kyber", "ECDSA", "RSA"] },
      publicKey: { type: "string" },
      createdAt: { type: "string", format: "date-time" },
      expiresAt: { type: "string", format: "date-time" },
      thresholdIndex: { type: "number" },
    },
    required: ["kid", "type", "publicKey", "createdAt"],
  },
  AuditTrail: {
    $id: "AuditTrail",
    type: "object",
    properties: {
      eventId: { type: "string" },
      type: { type: "string", enum: ["DID_REGISTER", "CHAT_SEND", "SIGNATURE_CREATE", "CONSENT_UPDATE", "RECOVERY_REQUEST"] },
      actorDid: { type: "string" },
      timestamp: { type: "string", format: "date-time" },
      metadata: { type: "object", additionalProperties: true },
      anchors: { type: "array", items: { type: "string" }, description: "Multichain anchors (ICP/EVM/Ordinals)" },
    },
    required: ["eventId", "type", "timestamp"],
  },
};