-- Shared replay protection for encrypted Session Manager terminal bridge tickets.
-- Production can run more than one application instance, so a process-local Map
-- is not sufficient to guarantee that a one-time ticket is consumed only once.

CREATE TABLE IF NOT EXISTS terminal_bridge_ticket_uses (
    ticket_hash CHAR(64) PRIMARY KEY,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_terminal_bridge_ticket_uses_expires
    ON terminal_bridge_ticket_uses(expires_at);

COMMENT ON TABLE terminal_bridge_ticket_uses IS
    'Short-lived shared replay-protection records for one-time encrypted terminal bridge tickets';
