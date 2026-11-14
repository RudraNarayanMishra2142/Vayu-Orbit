"""
VAYU ORBIT v6.0.0 — Unified Database Adapter Layer (Hardened)
Academic Release Problem Statement: PDS-3

Features:
- Dual Provider: 'sqlite' (local default) and 'postgresql' (Cloud SQL / Firebase SQL Connect).
- Zero Silent Fallback: When provider is 'postgresql', connection and transaction errors raise
  DatabaseConnectionError / DatabaseOperationalError immediately to prevent split-brain writes.
- Thread-safe PostgreSQL connection pooling via SimpleConnectionPool.
- RowDict compatibility: Rows support column key access (row['status']), integer indexing (row[0]),
  and dict(row), exactly matching sqlite3.Row semantics on both engines.
- Hardened adapt_sql: Preserves single/double quotes, line comments (--), and block comments (/* */)
  while translating parameter placeholders ('?' -> '%s'), datetime('now') -> CURRENT_TIMESTAMP,
  and 'INSERT OR IGNORE' -> 'INSERT ... ON CONFLICT DO NOTHING'.
- Table existence helper (table_exists) querying sqlite_master or information_schema.tables.
"""

import os
import re
import json
import sqlite3
import logging
import threading
import queue
from contextlib import contextmanager
from typing import Any, Dict, List, Optional, Tuple, Union

logger = logging.getLogger("vayu_db_adapter")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# ------------------------------------------------------------------------------
# 1. Custom Exceptions
# ------------------------------------------------------------------------------

class DatabaseError(Exception):
    """Base exception for database adapter errors."""
    pass

class DatabaseConnectionError(DatabaseError):
    """Raised when connecting to the designated database fails."""
    pass

class DatabaseOperationalError(DatabaseError):
    """Raised when executing a query or transaction fails."""
    pass

# ------------------------------------------------------------------------------
# 2. Row & Connection Wrappers
# ------------------------------------------------------------------------------

class RowDict(dict):
    """
    Dictionary row wrapper supporting both key access row['col'] and integer index row[0],
    matching sqlite3.Row semantics across SQLite and PostgreSQL drivers.
    """
    def __init__(self, mapping: Dict[str, Any], values: Optional[List[Any]] = None):
        super().__init__(mapping)
        self._values = list(values) if values is not None else list(mapping.values())

    def __getitem__(self, key: Union[str, int]) -> Any:
        if isinstance(key, int):
            return self._values[key]
        return super().__getitem__(key)

    def get(self, key: str, default: Any = None) -> Any:
        return super().get(key, default)


class PostgresCursorWrapper:
    """Wraps psycopg Cursor to present RowDict results and support executemany."""
    def __init__(self, cur):
        self._cur = cur

    def execute(self, sql: str, args: Union[Tuple, List] = ()):
        adapted = adapt_sql(sql, "postgresql")
        # Gracefully ignore SQLite-only PRAGMAs
        if adapted.strip().upper().startswith("PRAGMA"):
            return self
        self._cur.execute(adapted, args)
        return self

    def executemany(self, sql: str, seq_of_params: List[Union[Tuple, List]]):
        adapted = adapt_sql(sql, "postgresql")
        self._cur.executemany(adapted, seq_of_params)
        return self

    def fetchone(self) -> Optional[RowDict]:
        row = self._cur.fetchone()
        if row is None:
            return None
        return RowDict(dict(row))

    def fetchall(self) -> List[RowDict]:
        rows = self._cur.fetchall()
        return [RowDict(dict(r)) for r in rows]

    def __iter__(self):
        for row in self._cur:
            yield RowDict(dict(row))

    @property
    def rowcount(self) -> int:
        return self._cur.rowcount

    @property
    def lastrowid(self) -> Optional[Any]:
        return getattr(self._cur, "lastrowid", None)


class PostgresConnectionWrapper:
    """
    Wraps psycopg Connection so that .execute(sql, args) mimics SQLite connection semantics
    with automatic query adaptation and RowDict results.
    """
    def __init__(self, pg_conn):
        self._conn = pg_conn

    def execute(self, sql: str, args: Union[Tuple, List] = ()):
        adapted = adapt_sql(sql, "postgresql")
        if adapted.strip().upper().startswith("PRAGMA"):
            return self
        cur = self._conn.cursor()
        cur.execute(adapted, args)
        return PostgresCursorWrapper(cur)

    def executemany(self, sql: str, seq_of_params: List[Union[Tuple, List]]):
        adapted = adapt_sql(sql, "postgresql")
        cur = self._conn.cursor()
        cur.executemany(adapted, seq_of_params)
        return PostgresCursorWrapper(cur)

    def cursor(self):
        return PostgresCursorWrapper(self._conn.cursor())

    def commit(self):
        self._conn.commit()

    def rollback(self):
        self._conn.rollback()

    def close(self):
        self._conn.close()

# ------------------------------------------------------------------------------
# 3. Simple Thread-Safe Connection Pool for PostgreSQL
# ------------------------------------------------------------------------------

class SimpleConnectionPool:
    """Lightweight thread-safe connection pool for PostgreSQL connections."""
    def __init__(self, max_size: int = 10, timeout: float = 5.0):
        self._max_size = max_size
        self._timeout = timeout
        self._pool: queue.Queue = queue.Queue(maxsize=max_size)
        self._lock = threading.Lock()
        self._created = 0

    def get_connection(self):
        try:
            return self._pool.get_nowait()
        except queue.Empty:
            with self._lock:
                if self._created < self._max_size:
                    conn = self._create_new()
                    self._created += 1
                    return conn
            # Wait for available connection
            try:
                return self._pool.get(timeout=self._timeout)
            except queue.Empty:
                raise DatabaseConnectionError(f"PostgreSQL connection pool exhausted ({self._max_size} connections)")

    def release_connection(self, conn):
        try:
            # Check connection liveness before returning
            if hasattr(conn, "_conn") and not conn._conn.closed:
                self._pool.put_nowait(conn)
            elif hasattr(conn, "closed") and not conn.closed:
                self._pool.put_nowait(conn)
            else:
                with self._lock:
                    self._created -= 1
        except queue.Full:
            conn.close()
            with self._lock:
                self._created -= 1

    def _create_new(self):
        try:
            import psycopg
            from psycopg.rows import dict_row
            timeout = int(os.environ.get("DB_CONNECT_TIMEOUT", "2"))
            raw_conn = psycopg.connect(get_postgres_url(), row_factory=dict_row, connect_timeout=timeout)
            return PostgresConnectionWrapper(raw_conn)
        except Exception as e:
            raise DatabaseConnectionError(f"Failed to establish PostgreSQL connection: {e}") from e

_pg_pool: Optional[SimpleConnectionPool] = None

def get_pg_pool() -> SimpleConnectionPool:
    global _pg_pool
    if _pg_pool is None:
        _pg_pool = SimpleConnectionPool(max_size=10, timeout=5.0)
    return _pg_pool

def reset_pg_pool():
    global _pg_pool
    _pg_pool = None

# ------------------------------------------------------------------------------
# 4. Provider & Configuration
# ------------------------------------------------------------------------------

def get_provider() -> str:
    """Returns active database provider: 'sqlite' or 'postgresql'."""
    return os.environ.get("DATABASE_PROVIDER", "sqlite").strip().lower()

def get_sqlite_path() -> str:
    """Returns absolute path to SQLite database."""
    default_path = os.path.join(BASE_DIR, "military_logistics.db")
    return os.environ.get("CMS_DB_PATH", os.environ.get("DATABASE_PATH", default_path))

def get_postgres_url() -> str:
    """Constructs or retrieves PostgreSQL connection string."""
    url = os.environ.get("DATABASE_URL") or os.environ.get("POSTGRES_URL")
    if url:
        return url
        
    user = os.environ.get("DB_USER", "vayu_app_user")
    password = os.environ.get("DB_PASSWORD", "")
    host = os.environ.get("DB_HOST", "localhost")
    port = os.environ.get("DB_PORT", "5432")
    dbname = os.environ.get("DB_NAME", "vayu_orbit_db")
    
    auth = f"{user}:{password}@" if password else f"{user}@"
    return f"postgresql://{auth}{host}:{port}/{dbname}"

# ------------------------------------------------------------------------------
# 5. Hardened SQL Adaptation
# ------------------------------------------------------------------------------

def adapt_sql(sql: str, provider: str = "sqlite") -> str:
    """
    Translates SQLite-specific SQL syntax to PostgreSQL standards when provider='postgresql'.
    - Preserves single quotes, double quotes, line comments (--), and block comments (/* */).
    - Translates parameter placeholders '?' outside quotes/comments to '%s'.
    - Translates datetime('now') to CURRENT_TIMESTAMP.
    - Translates INSERT OR IGNORE INTO to INSERT INTO ... ON CONFLICT DO NOTHING.
    - Translates sqlite_master table lookups to information_schema.tables.
    - Leaves SQL untouched when provider='sqlite'.
    """
    if provider == "sqlite":
        return sql

    s = sql

    # 1. Replace SQLite datetime('now')
    s = re.sub(r"datetime\s*\(\s*['\"]now['\"]\s*\)", "CURRENT_TIMESTAMP", s, flags=re.IGNORECASE)

    # 2. Replace INSERT OR IGNORE INTO -> INSERT INTO ... ON CONFLICT DO NOTHING
    if re.search(r"INSERT\s+OR\s+IGNORE\s+INTO\s+", s, flags=re.IGNORECASE):
        s = re.sub(r"INSERT\s+OR\s+IGNORE\s+INTO\s+", "INSERT INTO ", s, flags=re.IGNORECASE)
        if not re.search(r"\bON\s+CONFLICT\b", s, flags=re.IGNORECASE):
            s_clean = s.rstrip()
            if s_clean.endswith(";"):
                s = s_clean[:-1].rstrip() + " ON CONFLICT DO NOTHING;"
            else:
                s = s_clean + " ON CONFLICT DO NOTHING"

    # 3. Replace sqlite_master table query with information_schema
    if re.search(r"\bsqlite_master\b", s, flags=re.IGNORECASE):
        s = re.sub(r"\bsqlite_master\b", "information_schema.tables", s, flags=re.IGNORECASE)
        s = re.sub(r"\btype\s*=\s*['\"]table['\"]", "table_type = 'BASE TABLE'", s, flags=re.IGNORECASE)
        s = re.sub(r"\bname\b", "table_name", s, flags=re.IGNORECASE)

    # 4. Replace '?' placeholders with '%s' outside of quotes and comments
    parts = []
    in_single_quote = False
    in_double_quote = False
    in_line_comment = False
    in_block_comment = False
    i = 0
    n = len(s)

    while i < n:
        c = s[i]
        nxt = s[i + 1] if i + 1 < n else ""

        # Comment detection
        if not in_single_quote and not in_double_quote:
            if not in_line_comment and not in_block_comment:
                if c == "-" and nxt == "-":
                    in_line_comment = True
                    parts.append(c)
                    parts.append(nxt)
                    i += 2
                    continue
                elif c == "/" and nxt == "*":
                    in_block_comment = True
                    parts.append(c)
                    parts.append(nxt)
                    i += 2
                    continue
            elif in_line_comment:
                parts.append(c)
                if c == "\n":
                    in_line_comment = False
                i += 1
                continue
            elif in_block_comment:
                parts.append(c)
                if c == "*" and nxt == "/":
                    parts.append(nxt)
                    in_block_comment = False
                    i += 2
                    continue
                i += 1
                continue

        # String literal detection
        if not in_line_comment and not in_block_comment:
            if c == "'" and not in_double_quote:
                if in_single_quote:
                    if nxt == "'":  # Escaped single quote
                        parts.append("''")
                        i += 2
                        continue
                    in_single_quote = False
                else:
                    in_single_quote = True
                parts.append(c)
                i += 1
                continue
            elif c == '"' and not in_single_quote:
                if in_double_quote:
                    in_double_quote = False
                else:
                    in_double_quote = True
                parts.append(c)
                i += 1
                continue

        # Replace parameter placeholder
        if not in_single_quote and not in_double_quote and not in_line_comment and not in_block_comment:
            if c == "?":
                parts.append("%s")
            else:
                parts.append(c)
        else:
            parts.append(c)
        i += 1

    return "".join(parts)


def table_exists(table_name: str) -> bool:
    """Checks whether a table exists in the active database provider."""
    provider = get_provider()
    try:
        if provider == "postgresql":
            r = query("SELECT 1 FROM information_schema.tables WHERE table_name = ?", (table_name.lower(),), one=True)
        else:
            r = query("SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?", (table_name,), one=True)
        return bool(r)
    except Exception:
        return False

# ------------------------------------------------------------------------------
# 6. Public Connection & Transaction API
# ------------------------------------------------------------------------------

def _configure_sqlite_connection(c: sqlite3.Connection) -> sqlite3.Connection:
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA journal_mode=WAL;")
    c.execute("PRAGMA busy_timeout=5000;")
    c.execute("PRAGMA synchronous=NORMAL;")
    return c


def get_connection():
    """Returns an active database connection based on configured provider."""
    provider = get_provider()
    if provider == "postgresql":
        try:
            import psycopg
            from psycopg.rows import dict_row
            timeout = int(os.environ.get("DB_CONNECT_TIMEOUT", "2"))
            raw_conn = psycopg.connect(get_postgres_url(), row_factory=dict_row, connect_timeout=timeout)
            return PostgresConnectionWrapper(raw_conn)
        except Exception as e:
            allow_fallback = os.environ.get("DATABASE_ALLOW_FALLBACK", "false").lower() == "true"
            if allow_fallback:
                logger.error("PostgreSQL connection failed (%s). EMERGENCY FALLBACK to SQLite active.", e)
                c = sqlite3.connect(get_sqlite_path(), timeout=5.0)
                return _configure_sqlite_connection(c)
            raise DatabaseConnectionError(f"PostgreSQL connection failed: {e}. Set DATABASE_ALLOW_FALLBACK=true to allow SQLite fallback.") from e
    else:
        c = sqlite3.connect(get_sqlite_path(), timeout=5.0)
        return _configure_sqlite_connection(c)


@contextmanager
def db_transaction():
    """
    Context manager providing an atomic transactional database connection.
    Yields connection object; commits on successful block completion; rolls back on exception.
    Does NOT silently fall back to SQLite when PostgreSQL is configured.
    """
    provider = get_provider()
    if provider == "postgresql":
        try:
            import psycopg
            from psycopg.rows import dict_row
            timeout = int(os.environ.get("DB_CONNECT_TIMEOUT", "2"))
            raw_conn = psycopg.connect(get_postgres_url(), row_factory=dict_row, connect_timeout=timeout)
            wrapper = PostgresConnectionWrapper(raw_conn)
            try:
                with raw_conn.transaction():
                    yield wrapper
            finally:
                raw_conn.close()
            return
        except Exception as e:
            allow_fallback = os.environ.get("DATABASE_ALLOW_FALLBACK", "false").lower() == "true"
            if allow_fallback:
                logger.error("PostgreSQL transaction failed (%s). EMERGENCY FALLBACK to SQLite active.", e)
            else:
                raise DatabaseOperationalError(f"PostgreSQL transaction failed: {e}") from e

    # SQLite transactional path
    c = sqlite3.connect(get_sqlite_path(), timeout=5.0, isolation_level=None)
    _configure_sqlite_connection(c)
    c.execute("BEGIN IMMEDIATE;")
    try:
        yield c
        c.execute("COMMIT;")
    except Exception:
        c.execute("ROLLBACK;")
        raise
    finally:
        c.close()


def conn():
    """Helper returning a configured connection."""
    return get_connection()


def query(sql: str, args: Union[Tuple, List] = (), one: bool = False) -> Any:
    """Executes a query and returns list of RowDicts or single RowDict."""
    provider = get_provider()
    if provider == "postgresql":
        try:
            import psycopg
            from psycopg.rows import dict_row
            with psycopg.connect(get_postgres_url(), row_factory=dict_row) as raw_conn:
                with raw_conn.cursor() as cur:
                    adapted = adapt_sql(sql, "postgresql")
                    cur.execute(adapted, args)
                    rows = [RowDict(dict(r)) for r in cur.fetchall()]
                    return rows[0] if one and rows else (None if one else rows)
        except Exception as e:
            allow_fallback = os.environ.get("DATABASE_ALLOW_FALLBACK", "false").lower() == "true"
            if allow_fallback:
                logger.error("PostgreSQL query failed (%s). EMERGENCY FALLBACK to SQLite active.", e)
            else:
                raise DatabaseOperationalError(f"PostgreSQL query failed: {e}") from e

    # SQLite query execution
    c = sqlite3.connect(get_sqlite_path(), timeout=5.0)
    _configure_sqlite_connection(c)
    try:
        rows = c.execute(sql, args).fetchall()
        data = [RowDict(dict(r)) for r in rows]
        return data[0] if one and data else (None if one else data)
    finally:
        c.close()


def execsql(sql: str, args: Union[Tuple, List] = ()) -> None:
    """Executes a statement within an atomic transaction."""
    with db_transaction() as c:
        c.execute(sql, args)
