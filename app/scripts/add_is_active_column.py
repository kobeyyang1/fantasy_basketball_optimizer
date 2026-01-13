from sqlalchemy import text
from app.db.session import engine

def run():
    with engine.connect() as conn:
        # Check if column already exists
        cols = conn.execute(text("PRAGMA table_info(players);")).fetchall()
        col_names = {c[1] for c in cols}
        if "is_active" in col_names:
            print("players.is_active already exists")
            return

        conn.execute(text("ALTER TABLE players ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT 1;"))
        conn.commit()
        print("Added players.is_active column")

if __name__ == "__main__":
    run()
