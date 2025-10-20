# OPA Policy for document access control
package oxsig.document.access

import future.keywords.if
import future.keywords.in

default allow := false

# Allow document owner full access
allow if {
    input.user_id == input.document.owner_id
}

# Allow if user has explicit permission
allow if {
    permission := data.permissions[_]
    permission.document_id == input.document.id
    permission.user_id == input.user_id
    permission.permission_level in ["view", "edit", "sign"]
    not permission.revoked
}

# Allow if user is in an authorized room
allow if {
    room := data.rooms[_]
    room.document_id == input.document.id
    participant := room.participants[_]
    participant.user_id == input.user_id
    not participant.left_at
}

# Check consent requirements
consent_granted if {
    consent := data.consent_records[_]
    consent.user_id == input.document.owner_id
    consent.grantee_id == input.user_id
    consent.resource_id == input.document.id
    consent.resource_type == "document"
    consent.granted == true
    not consent.revoked_at
}

# Require consent for sensitive documents
deny["consent_required"] if {
    input.document.metadata.requires_consent == true
    not consent_granted
}

# Rate limiting
deny["rate_limit_exceeded"] if {
    user_requests := data.rate_limits[input.user_id]
    user_requests.count > 1000
    user_requests.window == "1h"
}
