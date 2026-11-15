import os
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional
import bcrypt
import jwt

logger = logging.getLogger("vayu.auth")

APP_ENV = os.environ.get("APP_ENV", os.environ.get("ENVIRONMENT", "development")).lower()

def _resolve_jwt_secret() -> str:
    current_env = os.environ.get("APP_ENV", os.environ.get("ENVIRONMENT", "development")).lower()
    secret = os.environ.get("VAYU_JWT_SECRET")
    if secret and secret.strip():
        # Validate that it is not a documented placeholder in production
        banned = {
            "CHANGE_THIS_TO_A_SECURE_64_CHAR_RANDOM_SECRET_KEY",
            "PLACEHOLDER_CHANGE_IN_PRODUCTION_64_CHAR_HEX_STRING",
            "vayu-orbit-auth-token-rot-2026-c7f8a9e2d1b0",
            "vayu-orbit-tactical-secret-key-2026-secure-jwt-token"
        }
        if secret in banned and current_env == "production":
            raise RuntimeError(
                "CRITICAL SECURITY CONFIGURATION ERROR: VAYU_JWT_SECRET is set to an unrotated or template placeholder string. "
                "Production startup blocked. Generate a cryptographically secure 64-character secret using: "
                "python -c \"import secrets; print(secrets.token_hex(32))\""
            )
        return secret.strip()

    if current_env == "production":
        raise RuntimeError(
            "CRITICAL SECURITY CONFIGURATION ERROR: VAYU_JWT_SECRET is not configured in the environment. "
            "Production startup blocked. A cryptographically secure secret is mandatory in production mode."
        )

    # In local development or test mode only, use an explicitly documented non-production secret
    logger.warning(
        "DEVELOPMENT ADVISORY: VAYU_JWT_SECRET not provided in environment. "
        "Using isolated local development fallback secret. Set VAYU_JWT_SECRET in .env for custom keying."
    )
    return "vayu-dev-only-jwt-secret-not-for-production-use-4a8b2c1d"

SECRET_KEY = _resolve_jwt_secret()
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24
COOKIE_NAME = "vayu_auth_token"
LEGACY_COOKIE_NAME = "vayu_jwt"
FIREBASE_PROJECT_ID = os.environ.get("FIREBASE_PROJECT_ID", "vayuorbit-b20b5")

# Test secret for deterministic offline / test token verification
TEST_TOKEN_SECRET = os.environ.get("VAYU_TEST_TOKEN_SECRET", "vayu-test-signing-secret-offline-2026")

def hash_password(password: str) -> str:
    """Hashes a plaintext password using bcrypt with a generated salt."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifies a plaintext password against a stored bcrypt hash."""
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except Exception:
        return False

def verify_firebase_id_token(token: str, check_revoked: bool = False) -> Optional[dict]:
    """
    Verifies a Firebase ID token.
    In testing or offline development mode, supports test tokens signed for FIREBASE_PROJECT_ID.
    In production mode, enforces official Firebase Admin SDK cryptographic verification.
    """
    if not token or not isinstance(token, str):
        return None

    # 1. Offline / Testing fallback for unit tests and local test suite
    if os.environ.get("APP_ENV") != "production":
        try:
            payload = jwt.decode(token, TEST_TOKEN_SECRET, algorithms=[ALGORITHM], options={"verify_aud": False})
            if payload.get("aud") == FIREBASE_PROJECT_ID or payload.get("iss") == f"https://securetoken.google.com/{FIREBASE_PROJECT_ID}":
                return {
                    "uid": payload.get("uid") or payload.get("sub"),
                    "email": payload.get("email"),
                    "sub": payload.get("sub"),
                    "aud": payload.get("aud") or FIREBASE_PROJECT_ID,
                    "test_token": True,
                    "firebase": True
                }
        except Exception:
            pass

    # 2. Official Firebase Admin SDK verification (against Google JWKS public keys)
    try:
        import firebase_admin
        from firebase_admin import auth as fb_auth
        if firebase_admin._apps:
            decoded = fb_auth.verify_id_token(token, check_revoked=check_revoked)
            if decoded.get("aud") == FIREBASE_PROJECT_ID:
                return {
                    "uid": decoded.get("uid") or decoded.get("sub"),
                    "email": decoded.get("email"),
                    "sub": decoded.get("sub"),
                    "aud": decoded.get("aud"),
                    "auth_time": decoded.get("auth_time"),
                    "firebase": True
                }
            else:
                logger.warning("Firebase ID token audience mismatch: %s != %s", decoded.get("aud"), FIREBASE_PROJECT_ID)
                return None
    except Exception as e:
        logger.warning("Firebase Admin token verification notice: %s", e)
        return None

    return None

def verify_legacy_jwt(token: str) -> Optional[dict]:
    """
    Verifies VAYU ORBIT sovereign JWT access tokens.
    Supports secure token verification across all deployment environments.
    """
    if not token or not isinstance(token, str):
        return None

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except (jwt.PyJWTError, Exception):
        return None

def create_firebase_test_token(uid: str, email: str, expires_delta: Optional[timedelta] = None) -> str:
    """
    Generates a deterministic test Firebase ID token for local testing and CI/CD pipelines.
    Signed for the project 'vayuorbit-b20b5'.
    """
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(hours=1)
    payload = {
        "sub": uid,
        "uid": uid,
        "email": email,
        "aud": FIREBASE_PROJECT_ID,
        "iss": f"https://securetoken.google.com/{FIREBASE_PROJECT_ID}",
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "auth_time": int(datetime.now(timezone.utc).timestamp())
    }
    return jwt.encode(payload, TEST_TOKEN_SECRET, algorithm=ALGORITHM)

def create_access_token(user_id: str, email: str, role: str, expires_delta: Optional[timedelta] = None) -> str:
    """
    Legacy token generator for regression test compatibility.
    """
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "exp": expire,
        "iat": datetime.now(timezone.utc)
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def decode_access_token(token: str) -> Optional[dict]:
    """
    Decodes legacy JWT access token if legacy transition is active.
    """
    return verify_legacy_jwt(token)
