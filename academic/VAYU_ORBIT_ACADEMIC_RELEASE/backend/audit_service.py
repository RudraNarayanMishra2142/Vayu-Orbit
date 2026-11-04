import sqlite3
import json
import uuid
from datetime import datetime, timezone
from typing import Optional, Dict, Any

def now_iso() -> str:
    """Returns current UTC timestamp in ISO-8601 format with timezone offset."""
    return datetime.now(timezone.utc).isoformat()

def _redact_dict(d: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not d:
        return d
    redacted = {}
    for k, v in d.items():
        if any(s in k.lower() for s in ('password', 'secret', 'token', 'api_key')):
            redacted[k] = '[REDACTED]' if v is not None else None
        else:
            redacted[k] = v
    return redacted

def compute_diff(before: Optional[Dict[str, Any]], after: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Computes field-level difference dictionary between before and after images with sensitive field redaction."""
    if not before and not after:
        return {}
    if not before:
        return {"created": _redact_dict(after)}
    if not after:
        return {"deleted": _redact_dict(before)}
    diff = {}
    all_keys = set(before.keys()) | set(after.keys())
    for k in sorted(all_keys):
        v_before = before.get(k)
        v_after = after.get(k)
        if v_before != v_after:
            is_sensitive = any(s in k.lower() for s in ('password', 'secret', 'token', 'api_key'))
            diff[k] = {
                "old": "[REDACTED]" if is_sensitive and v_before is not None else v_before,
                "new": "[REDACTED]" if is_sensitive and v_after is not None else v_after
            }
    return diff

def migrate_audit_schema(c: sqlite3.Cursor) -> None:
    """
    Idempotently ensures audit_log has actor_id and actor_role columns,
    and creates the structured audit_events table if missing.
    Does not delete, recreate, or alter existing data.
    """
    # 1. Inspect existing columns in audit_log
    res = c.execute("PRAGMA table_info(audit_log);")
    existing_cols = {row[1] for row in res.fetchall()}
    if "actor_id" not in existing_cols:
        c.execute("ALTER TABLE audit_log ADD COLUMN actor_id TEXT DEFAULT NULL;")
    if "actor_role" not in existing_cols:
        c.execute("ALTER TABLE audit_log ADD COLUMN actor_role TEXT DEFAULT NULL;")

    # 2. Create structured audit_events table
    c.execute("""
    CREATE TABLE IF NOT EXISTS audit_events (
        event_id TEXT PRIMARY KEY,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        actor_role TEXT NOT NULL,
        details TEXT NOT NULL,
        diff_json TEXT DEFAULT '{}',
        created_at TEXT NOT NULL
    );
    """)
    c.execute("CREATE INDEX IF NOT EXISTS idx_audit_events_entity ON audit_events(entity_type, entity_id);")
    c.execute("CREATE INDEX IF NOT EXISTS idx_audit_events_created ON audit_events(created_at DESC);")

def record_audit(
    c: sqlite3.Cursor,
    action: str,
    object_type: str,
    object_id: str,
    details: str,
    user: Optional[Dict[str, Any]] = None,
    before: Optional[Dict[str, Any]] = None,
    after: Optional[Dict[str, Any]] = None,
    diff: Optional[Dict[str, Any]] = None,
    timestamp: Optional[str] = None
) -> str:
    """
    Atomically records an audit entry into both:
    1. legacy `audit_log` table (with actor_id and actor_role populated)
    2. structured `audit_events` table (with before/after diff JSON)

    Must be called inside caller's existing active SQLite transaction cursor.
    Returns generated event_id.
    """
    t = timestamp or now_iso()
    user_dict = user or {}
    actor_id = str(user_dict.get("id") or user_dict.get("user_id") or user_dict.get("email") or user_dict.get("sub") or "SYSTEM")
    actor_role = str(user_dict.get("role") or "SYSTEM")

    # Generate deterministic, unique event ID
    event_id = f"EVT-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:6].upper()}"

    # Calculate difference dictionary if before/after provided
    calculated_diff = diff if diff is not None else compute_diff(before, after)
    diff_json = json.dumps(calculated_diff, sort_keys=True)

    # 1. Write to legacy audit_log table preserving backwards compatibility
    c.execute("""
        INSERT INTO audit_log (action, object_type, object_id, details, created_at, actor_id, actor_role)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (action, object_type, object_id, details, t, actor_id, actor_role))

    # 2. Write to structured audit_events table
    c.execute("""
        INSERT INTO audit_events (event_id, action, entity_type, entity_id, actor_id, actor_role, details, diff_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (event_id, action, object_type, object_id, actor_id, actor_role, details, diff_json, t))

    return event_id
