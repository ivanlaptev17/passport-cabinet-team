import os
import subprocess
from pathlib import Path

BASE_DIR = Path(__file__).parent
SQL_DIR = BASE_DIR / "sql"

DATABASE_URL = os.getenv("DATABASE_URL")


def run(cmd):
    subprocess.run(cmd, check=True)


def run_psql_file(file_path: Path):
    run([
        "psql",
        DATABASE_URL,
        "-v", "ON_ERROR_STOP=1",
        "-f", str(file_path),
    ])


def reset_db():
    run([
        "psql",
        DATABASE_URL,
        "-v", "ON_ERROR_STOP=1",
        "-c",
        "DROP SCHEMA public CASCADE; CREATE SCHEMA public;",
    ])


def init_db():
    for f in sorted(SQL_DIR.glob("*.sql")):
        print(f"Running {f.name}")
        run_psql_file(f)


def main():
    if not DATABASE_URL:
        raise Exception("DATABASE_URL not set")

    print("🔥 RESET DB")
    reset_db()

    print("🚀 INIT DB")
    init_db()

    print("✅ DONE")


if __name__ == "__main__":
    main()
    