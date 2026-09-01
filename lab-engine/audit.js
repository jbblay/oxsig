'use strict';

const { Pool } = require('pg');

let pool;

function getPool() {
  if (!pool) {
    pool = new Pool({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
      database: process.env.POSTGRES_DB || 'oxsig',
      user: process.env.POSTGRES_USER || 'oxsig',
      password: process.env.POSTGRES_PASSWORD || 'oxsig_secure_password',
      max: 4,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }
  return pool;
}

async function logLabAudit({ userId, action, sessionId, labId, ipAddress, userAgent, metadata = {} }) {
  try {
    await getPool().query(
      `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, ip_address, user_agent, metadata)
       VALUES ($1, $2, 'lab_session', $3, $4, $5, $6)`,
      [
        userId || null,
        action,
        sessionId || null,
        ipAddress || null,
        userAgent || null,
        JSON.stringify({ labId, ...metadata }),
      ]
    );
  } catch (error) {
    console.error('[Labs] audit logging failed:', error.message);
  }
}

module.exports = { logLabAudit };
