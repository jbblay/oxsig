// ===========================================================================
// OxSig Consent Ledger Canister
// Decentralized consent management with zero-knowledge proofs
// ===========================================================================

import Principal "mo:base/Principal";
import Time "mo:base/Time";
import Text "mo:base/Text";
import Array "mo:base/Array";
import HashMap "mo:base/HashMap";
import Hash "mo:base/Hash";
import Iter "mo:base/Iter";
import Result "mo:base/Result";
import Option "mo:base/Option";
import Nat "mo:base/Nat";

persistent actor ConsentLedger {
  
  // ===========================================================================
  // TYPES
  // ===========================================================================
  
  type DID = Text;
  type ConsentId = Text;
  type HashValue = Text;
  type ZKProof = Text;
  
  type ConsentRecord = {
    id: ConsentId;
    version: Text;
    grantor: DID;
    grantee: DID;
    purpose: Text;
    scope: [Text];
    timestamp: Time.Time;
    expiresAt: Time.Time;
    revocable: Bool;
    revoked: Bool;
    revokedAt: ?Time.Time;
    zkProof: ZKProof;
    onChainHash: HashValue;
  };
  
  type VerificationResult = {
    valid: Bool;
    consentId: ?ConsentId;
    reason: ?Text;
    expiresAt: ?Time.Time;
  };
  
  type ConsentEvent = {
    eventId : Text;
    actorDid : Text;
    targetDid : Text;
    documentId : Text;
    action : Text; // GRANT | REVOKE | UPDATE
    timestamp : Text;
  };
  
  // ===========================================================================
  // STATE
  // ===========================================================================
  
  private stable var consentEntries : [(ConsentId, ConsentRecord)] = [];
  private transient var consents = HashMap.HashMap<ConsentId, ConsentRecord>(
    10,
    Text.equal,
    Text.hash
  );
  
  stable var events : [ConsentEvent] = [];
  private stable var nextConsentId : Nat = 0;
  
  // ===========================================================================
  // UPGRADE HOOKS
  // ===========================================================================
  
  system func preupgrade() {
    consentEntries := Iter.toArray(consents.entries());
  };
  
  system func postupgrade() {
    consents := HashMap.fromIter<ConsentId, ConsentRecord>(
      consentEntries.vals(),
      10,
      Text.equal,
      Text.hash
    );
  };
  
  // ===========================================================================
  // HELPER FUNCTIONS
  // ===========================================================================
  
  private func generateConsentId() : ConsentId {
    let id = "consent_" # Nat.toText(nextConsentId);
    nextConsentId += 1;
    id
  };
  
  private func isExpired(expiresAt: Time.Time) : Bool {
    Time.now() > expiresAt
  };
  
  // ===========================================================================
  // PUBLIC API
  // ===========================================================================
  
  // Legacy event-based API
  public func updateConsent(e : ConsentEvent) : async Bool {
    events := Array.append(events, [e]);
    return true;
  };

  public query func listEvents() : async [ConsentEvent] {
    return events;
  };
  
  // Record new consent
  public shared(msg) func recordConsent(
    grantee: DID,
    purpose: Text,
    scope: [Text],
    expiresAt: Time.Time,
    zkProof: ZKProof
  ) : async Result.Result<ConsentId, Text> {
    
    let caller = Principal.toText(msg.caller);
    
    if (Text.size(purpose) == 0) {
      return #err("Purpose cannot be empty");
    };
    
    if (Array.size(scope) == 0) {
      return #err("Scope cannot be empty");
    };
    
    if (expiresAt <= Time.now()) {
      return #err("Expiration time must be in the future");
    };
    
    let consentId = generateConsentId();
    
    let record : ConsentRecord = {
      id = consentId;
      version = "1.0";
      grantor = caller;
      grantee = grantee;
      purpose = purpose;
      scope = scope;
      timestamp = Time.now();
      expiresAt = expiresAt;
      revocable = true;
      revoked = false;
      revokedAt = null;
      zkProof = zkProof;
      onChainHash = "";
    };
    
    consents.put(consentId, record);
    #ok(consentId)
  };
  
  // Revoke consent
  public shared(msg) func revokeConsent(
    consentId: ConsentId
  ) : async Result.Result<Bool, Text> {
    
    let caller = Principal.toText(msg.caller);
    
    switch (consents.get(consentId)) {
      case null { #err("Consent not found") };
      case (?consent) {
        if (consent.grantor != caller) {
          return #err("Only grantor can revoke consent");
        };
        
        if (not consent.revocable) {
          return #err("Consent is not revocable");
        };
        
        if (consent.revoked) {
          return #err("Consent already revoked");
        };
        
        let updatedConsent : ConsentRecord = {
          consent with
          revoked = true;
          revokedAt = ?Time.now();
        };
        
        consents.put(consentId, updatedConsent);
        #ok(true)
      };
    };
  };
  
  // Verify consent validity
  public query func verifyConsent(
    consentId: ConsentId,
    grantee: DID,
    purpose: Text
  ) : async VerificationResult {
    
    switch (consents.get(consentId)) {
      case null {
        {
          valid = false;
          consentId = null;
          reason = ?"Consent not found";
          expiresAt = null;
        }
      };
      case (?consent) {
        if (consent.revoked) {
          return {
            valid = false;
            consentId = ?consentId;
            reason = ?"Consent has been revoked";
            expiresAt = null;
          };
        };
        
        if (isExpired(consent.expiresAt)) {
          return {
            valid = false;
            consentId = ?consentId;
            reason = ?"Consent has expired";
            expiresAt = ?consent.expiresAt;
          };
        };
        
        if (consent.grantee != grantee) {
          return {
            valid = false;
            consentId = ?consentId;
            reason = ?"Grantee mismatch";
            expiresAt = null;
          };
        };
        
        if (consent.purpose != purpose) {
          return {
            valid = false;
            consentId = ?consentId;
            reason = ?"Purpose mismatch";
            expiresAt = null;
          };
        };
        
        {
          valid = true;
          consentId = ?consentId;
          reason = null;
          expiresAt = ?consent.expiresAt;
        }
      };
    };
  };
  
  // Get consent by ID
  public query func getConsent(consentId: ConsentId) : async ?ConsentRecord {
    consents.get(consentId)
  };
  
  // Get consent statistics
  public query func getStatistics() : async {
    total: Nat;
    active: Nat;
    revoked: Nat;
    expired: Nat;
  } {
    var total = 0;
    var active = 0;
    var revoked = 0;
    var expired = 0;
    
    for (consent in consents.vals()) {
      total += 1;
      if (consent.revoked) {
        revoked += 1;
      } else if (isExpired(consent.expiresAt)) {
        expired += 1;
      } else {
        active += 1;
      };
    };
    
    { total; active; revoked; expired }
  };
}