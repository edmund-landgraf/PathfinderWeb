from __future__ import annotations

import argparse
import logging
import os

import pyodbc


SCRAPE_VERSION = "demiplane-rawmd-repair-v1"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Repair existing Demiplane creature rows whose RawHtml was imported but RawMD was left empty."
    )
    parser.add_argument(
        "--commit",
        action="store_true",
        help="Commit the repair. Without this flag, only report the rows that would change.",
    )
    return parser.parse_args()


def connect() -> pyodbc.Connection:
    user = os.environ.get("SQL_USER", "sa")
    password = os.environ.get("SQL_PASSWORD", "YourStrong!Password123").strip("'")
    database = os.environ.get("SQL_DATABASE", "PathfinderUtil")
    server = os.environ.get("SQL_SERVER", "localhost")
    port = os.environ.get("SQL_PORT", "1433")

    connection_strings = [
        (
            "DRIVER={ODBC Driver 18 for SQL Server};"
            f"SERVER={server},{port};"
            f"DATABASE={database};"
            f"UID={user};"
            f"PWD={password};"
            "Encrypt=yes;"
            "TrustServerCertificate=yes;"
        ),
        (
            "DRIVER={ODBC Driver 17 for SQL Server};"
            f"SERVER={server},{port};"
            f"DATABASE={database};"
            f"UID={user};"
            f"PWD={password};"
            "Encrypt=no;"
            "TrustServerCertificate=yes;"
        ),
        (
            "DRIVER={ODBC Driver 17 for SQL Server};"
            "SERVER=localhost;"
            "DATABASE=PathfinderUtil;"
            "Trusted_Connection=yes;"
        ),
        (
            "DRIVER={ODBC Driver 17 for SQL Server};"
            "SERVER=localhost;"
            "DATABASE=PathfinderUtil;"
            "Trusted_Connection=yes;"
            "Encrypt=no;"
            "TrustServerCertificate=yes;"
        ),
        (
            "DRIVER={ODBC Driver 18 for SQL Server};"
            "SERVER=localhost;"
            "DATABASE=PathfinderUtil;"
            "Trusted_Connection=yes;"
            "TrustServerCertificate=yes;"
        ),
    ]

    last_error: Exception | None = None
    for connection_string in connection_strings:
        try:
            return pyodbc.connect(connection_string)
        except pyodbc.Error as exc:
            last_error = exc

    raise RuntimeError("Could not connect to PathfinderUtil SQL Server.") from last_error


def main() -> None:
    args = parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")

    with connect() as connection:
        connection.autocommit = False
        cursor = connection.cursor()

        cursor.execute(
            """
            SELECT MonsterId, Name, Level, AonUrl, LEN(RawHtml) AS RawHtmlLength
            FROM pf2.Monster
            WHERE AonUrl LIKE 'https://app.demiplane.com/nexus/pathfinder2e/creature/%'
              AND RawHtml IS NOT NULL
              AND LEN(RawHtml) > 0
              AND (RawMD IS NULL OR LEN(LTRIM(RTRIM(RawMD))) = 0)
            ORDER BY Name, Level, MonsterId
            """
        )
        rows = cursor.fetchall()

        logging.info("Demiplane rows eligible for RawMD repair: %d", len(rows))
        for row in rows:
            logging.info(
                "%s MonsterId=%s | %s | Level=%s | RawHtml=%s chars",
                "WOULD UPDATE" if not args.commit else "UPDATING",
                row.MonsterId,
                row.Name,
                row.Level,
                row.RawHtmlLength,
            )

        if not args.commit:
            connection.rollback()
            logging.info("Preview only. Re-run with --commit to apply the repair.")
            return

        cursor.execute(
            """
            UPDATE pf2.Monster
            SET RawMD = RawHtml,
                UpdatedAt = SYSDATETIME(),
                LastScraped = SYSDATETIME(),
                ScrapeVersion = ?
            WHERE AonUrl LIKE 'https://app.demiplane.com/nexus/pathfinder2e/creature/%'
              AND RawHtml IS NOT NULL
              AND LEN(RawHtml) > 0
              AND (RawMD IS NULL OR LEN(LTRIM(RTRIM(RawMD))) = 0)
            """,
            SCRAPE_VERSION,
        )
        updated = cursor.rowcount
        connection.commit()
        logging.info("Committed RawMD repair for %d rows.", updated)


if __name__ == "__main__":
    main()
