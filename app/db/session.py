from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Use a SQLite database stored in a file called app.db (in your project folder)
SQLALCHEMY_DATABASE_URL = "sqlite:///./app.db"

# Engine = connection to the database
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)

# SessionLocal = what we will use to talk to the database
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
