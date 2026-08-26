"""
HeatShield Backend Database
=============================
SQLite persistent database for users, authentication sessions, and saved locations.
Uses standard Python library `sqlite3` + `hashlib` PBKDF2-HMAC-SHA256 for secure password hashing.
"""

import os
import sqlite3
import hashlib
import secrets
from datetime import datetime, timedelta
from typing import Optional

DB_PATH = os.path.join(os.path.dirname(__file__), "heatshield.db")


def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()

    # Users table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            last_login TEXT
        )
    """)

    # Sessions table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """)

    # Saved Locations table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS saved_locations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            lat REAL NOT NULL,
            lon REAL NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """)

    conn.commit()

    # Seed demo user (mirey17981@bejum.com / admin)
    cursor.execute("SELECT id FROM users WHERE email = ?", ("mirey17981@bejum.com",))
    if not cursor.fetchone():
        demo_pass_hash = hash_password("admin")
        now = datetime.now().isoformat()
        cursor.execute(
            """
            INSERT INTO users (name, email, password_hash, created_at, updated_at, last_login)
            VALUES (?, ?, ?, ?, ?, ?)
        """,
            ("Mirey User", "mirey17981@bejum.com", demo_pass_hash, now, now, now),
        )
        conn.commit()

    conn.close()


# ── SECURITY HELPERS ──────────────────────────────────────────────
def hash_password(password: str, salt: Optional[str] = None) -> str:
    if not salt:
        salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac(
        'sha256', password.encode('utf-8'), salt.encode('utf-8'), 100000
    )
    return f"{salt}${key.hex()}"


def verify_password(password: str, password_hash: str) -> bool:
    try:
        salt, key_hex = password_hash.split('$')
        computed_key = hashlib.pbkdf2_hmac(
            'sha256', password.encode('utf-8'), salt.encode('utf-8'), 100000
        )
        return secrets.compare_digest(computed_key.hex(), key_hex)
    except Exception:
        return False


def generate_token() -> str:
    return secrets.token_urlsafe(32)


# ── DB API FUNCTIONS ──────────────────────────────────────────────
def create_user(name: str, email: str, password: str) -> dict:
    conn = get_db_connection()
    cursor = conn.cursor()
    email_clean = email.lower().strip()

    cursor.execute("SELECT id FROM users WHERE email = ?", (email_clean,))
    if cursor.fetchone():
        conn.close()
        raise ValueError("An account with this email already exists.")

    pw_hash = hash_password(password)
    now = datetime.now().isoformat()
    cursor.execute(
        """
        INSERT INTO users (name, email, password_hash, created_at, updated_at, last_login)
        VALUES (?, ?, ?, ?, ?, ?)
    """,
        (name.strip(), email_clean, pw_hash, now, now, now),
    )
    user_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return {
        "id": user_id,
        "name": name.strip(),
        "email": email_clean,
        "created_at": now,
        "last_login": now,
    }


def authenticate_user(email: str, password: str) -> dict:
    conn = get_db_connection()
    cursor = conn.cursor()
    email_clean = email.lower().strip()

    cursor.execute(
        "SELECT id, name, email, password_hash FROM users WHERE email = ?",
        (email_clean,),
    )
    user = cursor.fetchone()
    if not user or not verify_password(password, user["password_hash"]):
        conn.close()
        raise ValueError("Invalid email or password.")

    user_id = user["id"]
    now = datetime.now()
    cursor.execute(
        "UPDATE users SET last_login = ? WHERE id = ?",
        (now.isoformat(), user_id),
    )

    # Create session token valid for 30 days
    token = generate_token()
    expires_at = (now + timedelta(days=30)).isoformat()
    cursor.execute(
        "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
        (token, user_id, now.isoformat(), expires_at),
    )
    conn.commit()
    conn.close()

    return {
        "token": token,
        "user": {
            "id": user["id"],
            "name": user["name"],
            "email": user["email"],
            "initials": "".join([part[0].upper() for part in user["name"].split()[:2]]) or "U",
        },
    }


def get_user_by_token(token: str) -> Optional[dict]:
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute(
        """
        SELECT u.id, u.name, u.email, s.expires_at
        FROM sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.token = ?
    """,
        (token,),
    )
    row = cursor.fetchone()
    conn.close()

    if not row:
        return None

    # Check expiration
    expires = datetime.fromisoformat(row["expires_at"])
    if expires < datetime.now():
        return None

    return {
        "id": row["id"],
        "name": row["name"],
        "email": row["email"],
        "initials": "".join([part[0].upper() for part in row["name"].split()[:2]]) or "U",
    }


def delete_session(token: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM sessions WHERE token = ?", (token,))
    conn.commit()
    conn.close()


def get_saved_locations(user_id: int) -> list[dict]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, name, lat, lon, created_at FROM saved_locations WHERE user_id = ? ORDER BY id DESC",
        (user_id,),
    )
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]


def add_saved_location(user_id: int, name: str, lat: float, lon: float) -> dict:
    conn = get_db_connection()
    cursor = conn.cursor()
    now = datetime.now().isoformat()
    cursor.execute(
        "INSERT INTO saved_locations (user_id, name, lat, lon, created_at) VALUES (?, ?, ?, ?, ?)",
        (user_id, name.strip(), lat, lon, now),
    )
    loc_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return {"id": loc_id, "name": name.strip(), "lat": lat, "lon": lon, "created_at": now}


def delete_saved_location(user_id: int, location_id: int):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "DELETE FROM saved_locations WHERE id = ? AND user_id = ?",
        (location_id, user_id),
    )
    conn.commit()
    conn.close()
