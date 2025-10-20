use axum::{
    async_trait,
    extract::FromRequestParts,
    http::{request::Parts, StatusCode},
    RequestPartsExt,
};
use axum_extra::{
    headers::{authorization::Bearer, Authorization},
    TypedHeader,
};
use chrono::{DateTime, Duration, Utc};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

/// JWT Claims structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,      // User ID
    pub email: String,    // User email
    pub role: String,     // User role (user, admin)
    pub exp: i64,         // Expiration timestamp
    pub iat: i64,         // Issued at timestamp
    pub jti: String,      // JWT ID (unique identifier)
}

/// User from database
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct User {
    pub id: Uuid,
    pub public_key: String,
    pub display_name: Option<String>,
    pub email: Option<String>,
    pub role: Option<String>,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
}

/// Authenticated user (extracted from request)
#[derive(Debug, Clone)]
pub struct AuthUser {
    pub id: Uuid,
    pub email: String,
    pub role: String,
    pub claims: Claims,
}

impl Claims {
    /// Create new claims for a user
    pub fn new(user_id: &str, email: &str, role: &str, expires_in_hours: i64) -> Self {
        let now = Utc::now();
        let exp = now + Duration::hours(expires_in_hours);

        Self {
            sub: user_id.to_string(),
            email: email.to_string(),
            role: role.to_string(),
            exp: exp.timestamp(),
            iat: now.timestamp(),
            jti: Uuid::new_v4().to_string(),
        }
    }

    /// Check if token is expired
    pub fn is_expired(&self) -> bool {
        Utc::now().timestamp() > self.exp
    }
}

/// JWT token manager
pub struct JwtManager {
    encoding_key: EncodingKey,
    decoding_key: DecodingKey,
}

impl JwtManager {
    /// Create new JWT manager with secret
    pub fn new(secret: &str) -> Self {
        Self {
            encoding_key: EncodingKey::from_secret(secret.as_bytes()),
            decoding_key: DecodingKey::from_secret(secret.as_bytes()),
        }
    }

    /// Generate JWT token
    pub fn generate_token(&self, claims: &Claims) -> Result<String, jsonwebtoken::errors::Error> {
        encode(&Header::default(), claims, &self.encoding_key)
    }

    /// Validate and decode JWT token
    pub fn validate_token(&self, token: &str) -> Result<Claims, jsonwebtoken::errors::Error> {
        let validation = Validation::default();
        let token_data = decode::<Claims>(token, &self.decoding_key, &validation)?;
        Ok(token_data.claims)
    }
}

/// Extract authenticated user from request
#[async_trait]
impl<S> FromRequestParts<S> for AuthUser
where
    S: Send + Sync,
{
    type Rejection = (StatusCode, String);

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        // Extract Authorization header
        let TypedHeader(Authorization(bearer)) = parts
            .extract::<TypedHeader<Authorization<Bearer>>>()
            .await
            .map_err(|_| {
                (
                    StatusCode::UNAUTHORIZED,
                    "Missing or invalid Authorization header".to_string(),
                )
            })?;

        // Get JWT secret from environment
        let secret = std::env::var("JWT_SECRET")
            .unwrap_or_else(|_| "your_secret_key_here".to_string());

        // Validate token
        let jwt_manager = JwtManager::new(&secret);
        let claims = jwt_manager
            .validate_token(bearer.token())
            .map_err(|e| {
                (
                    StatusCode::UNAUTHORIZED,
                    format!("Invalid token: {}", e),
                )
            })?;

        // Check expiration
        if claims.is_expired() {
            return Err((StatusCode::UNAUTHORIZED, "Token expired".to_string()));
        }

        // Parse user ID
        let user_id = Uuid::parse_str(&claims.sub).map_err(|_| {
            (
                StatusCode::UNAUTHORIZED,
                "Invalid user ID in token".to_string(),
            )
        })?;

        Ok(AuthUser {
            id: user_id,
            email: claims.email.clone(),
            role: claims.role.clone(),
            claims,
        })
    }
}

/// Password hashing utilities
pub mod password {
    use argon2::{
        password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
        Argon2,
    };

    /// Hash a password using Argon2
    pub fn hash_password(password: &str) -> Result<String, argon2::password_hash::Error> {
        let salt = SaltString::generate(&mut OsRng);
        let argon2 = Argon2::default();
        let password_hash = argon2.hash_password(password.as_bytes(), &salt)?;
        Ok(password_hash.to_string())
    }

    /// Verify a password against a hash
    pub fn verify_password(password: &str, hash: &str) -> Result<bool, argon2::password_hash::Error> {
        let parsed_hash = PasswordHash::new(hash)?;
        let argon2 = Argon2::default();
        Ok(argon2.verify_password(password.as_bytes(), &parsed_hash).is_ok())
    }
}

/// Session management with Redis
pub struct SessionManager {
    redis_client: redis::Client,
}

impl SessionManager {
    pub fn new(redis_client: redis::Client) -> Self {
        Self { redis_client }
    }

    /// Store session in Redis
    pub async fn create_session(
        &self,
        user_id: &Uuid,
        token_id: &str,
        expires_in_seconds: usize,
    ) -> Result<(), redis::RedisError> {
        let mut conn = self.redis_client.get_multiplexed_async_connection().await?;
        let key = format!("session:{}", token_id);
        
        redis::cmd("SET")
            .arg(&key)
            .arg(user_id.to_string())
            .arg("EX")
            .arg(expires_in_seconds)
            .query_async(&mut conn)
            .await
    }

    /// Check if session exists
    pub async fn validate_session(&self, token_id: &str) -> Result<bool, redis::RedisError> {
        let mut conn = self.redis_client.get_multiplexed_async_connection().await?;
        let key = format!("session:{}", token_id);
        
        let exists: bool = redis::cmd("EXISTS")
            .arg(&key)
            .query_async(&mut conn)
            .await?;
        
        Ok(exists)
    }

    /// Invalidate session (logout)
    pub async fn invalidate_session(&self, token_id: &str) -> Result<(), redis::RedisError> {
        let mut conn = self.redis_client.get_multiplexed_async_connection().await?;
        let key = format!("session:{}", token_id);
        
        redis::cmd("DEL")
            .arg(&key)
            .query_async(&mut conn)
            .await
    }

    /// Refresh session expiration
    pub async fn refresh_session(
        &self,
        token_id: &str,
        expires_in_seconds: usize,
    ) -> Result<(), redis::RedisError> {
        let mut conn = self.redis_client.get_multiplexed_async_connection().await?;
        let key = format!("session:{}", token_id);
        
        redis::cmd("EXPIRE")
            .arg(&key)
            .arg(expires_in_seconds)
            .query_async(&mut conn)
            .await
    }
}

/// Database queries for authentication
pub mod queries {
    use super::*;

    /// Get user by public key
    pub async fn get_user_by_public_key(
        pool: &PgPool,
        public_key: &str,
    ) -> Result<Option<User>, sqlx::Error> {
        sqlx::query_as::<_, User>(
            "SELECT id, public_key, display_name, email, 
                    COALESCE(role, 'user') as role, 
                    is_active, created_at
             FROM users 
             WHERE public_key = $1 AND is_active = true"
        )
        .bind(public_key)
        .fetch_optional(pool)
        .await
    }

    /// Get user by ID
    pub async fn get_user_by_id(
        pool: &PgPool,
        user_id: &Uuid,
    ) -> Result<Option<User>, sqlx::Error> {
        sqlx::query_as::<_, User>(
            "SELECT id, public_key, display_name, email,
                    COALESCE(role, 'user') as role,
                    is_active, created_at
             FROM users 
             WHERE id = $1 AND is_active = true"
        )
        .bind(user_id)
        .fetch_optional(pool)
        .await
    }

    /// Create new user
    pub async fn create_user(
        pool: &PgPool,
        public_key: &str,
        display_name: Option<&str>,
        email: Option<&str>,
    ) -> Result<User, sqlx::Error> {
        sqlx::query_as::<_, User>(
            "INSERT INTO users (public_key, display_name, email, is_active)
             VALUES ($1, $2, $3, true)
             RETURNING id, public_key, display_name, email,
                       COALESCE(role, 'user') as role,
                       is_active, created_at"
        )
        .bind(public_key)
        .bind(display_name)
        .bind(email)
        .fetch_one(pool)
        .await
    }

    /// Update last seen timestamp
    pub async fn update_last_seen(
        pool: &PgPool,
        user_id: &Uuid,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE users 
             SET last_seen_at = NOW()
             WHERE id = $1"
        )
        .bind(user_id)
        .execute(pool)
        .await?;
        
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_claims_creation() {
        let claims = Claims::new("user-123", "test@example.com", "user", 24);
        assert_eq!(claims.sub, "user-123");
        assert_eq!(claims.email, "test@example.com");
        assert_eq!(claims.role, "user");
        assert!(!claims.is_expired());
    }

    #[test]
    fn test_jwt_generation_and_validation() {
        let manager = JwtManager::new("test-secret");
        let claims = Claims::new("user-123", "test@example.com", "user", 24);
        
        let token = manager.generate_token(&claims).expect("Failed to generate token");
        let decoded = manager.validate_token(&token).expect("Failed to validate token");
        
        assert_eq!(decoded.sub, claims.sub);
        assert_eq!(decoded.email, claims.email);
    }

    #[test]
    fn test_password_hashing() {
        let password = "secure_password_123";
        let hash = password::hash_password(password).expect("Failed to hash");
        
        assert!(password::verify_password(password, &hash).expect("Failed to verify"));
        assert!(!password::verify_password("wrong_password", &hash).expect("Failed to verify"));
    }
}
