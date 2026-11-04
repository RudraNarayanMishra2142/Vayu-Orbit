import os
from datetime import datetime, timezone, timedelta
from typing import Optional
import bcrypt
import jwt

SECRET_KEY = os.environ.get("VAYU_JWT_SECRET", "vayu-orbit-tactical-secret-key-2026-secure-jwt-token")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24
COOKIE_NAME = "vayu_jwt"

def hash_password(password: str) -> str:
    """Hashes a plaintext password using bcrypt with a generated salt."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifies a plaintext password against a stored bcrypt hash."""
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except Exception:
        return False

def create_access_token(user_id: str, email: str, role: str, expires_delta: Optional[timedelta] = None) -> str:
    """Generates a signed JWT access token containing subject, email, role, and expiration."""
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
    """Decodes and validates a JWT token. Returns payload dict or None if invalid/expired."""
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except (jwt.PyJWTError, Exception):
        return None
