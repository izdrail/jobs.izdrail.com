import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

DB_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATABASE_URL = os.environ.get(
    "JOBSWIPE_DATABASE_URL", f"sqlite:///{os.path.join(DB_DIR, 'jobswipe.db')}"
)

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def run_migrations(engine):
    """Idempotent, additive migrations for existing SQLite databases.

    create_all only creates missing tables; it never alters existing ones.
    Keep these statements strictly backwards compatible (new nullable
    columns only).
    """
    with engine.connect() as conn:
        app_cols = {
            row[1]
            for row in conn.exec_driver_sql("PRAGMA table_info(applications)")
        }
        if app_cols:
            if "notes" not in app_cols:
                conn.exec_driver_sql("ALTER TABLE applications ADD COLUMN notes TEXT")
            if "status_history" not in app_cols:
                conn.exec_driver_sql(
                    "ALTER TABLE applications ADD COLUMN status_history TEXT"
                )
        conn.commit()
