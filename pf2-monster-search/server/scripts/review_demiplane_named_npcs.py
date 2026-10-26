from __future__ import annotations

import argparse
import csv
import logging
import os
import re
from collections import Counter
from pathlib import Path

import pyodbc


VARIANT_TOOLTIP = re.compile(
    r'Variant <tooltip category="creature"[^>]*element="([^"]+)"[^>]*>([^<]+)</tooltip>',
    re.IGNORECASE,
)
WORD = re.compile(r"[a-z']+", re.IGNORECASE)
STOP_WORDS = {
    "of",
    "the",
    "a",
    "an",
    "and",
    "to",
    "in",
    "on",
    "for",
    "level",
}
ELITE_WEAK = re.compile(r"^(elite|weak)\b", re.IGNORECASE)
LEVEL_SUFFIX = re.compile(r"\s*\(level\s+\d+\)\s*$", re.IGNORECASE)

ROLE_WORDS = {
    "officer",
    "guard",
    "mage",
    "priest",
    "cultist",
    "cobbler",
    "hunter",
    "scout",
    "archer",
    "maralictor",
    "hellknight",
    "hellbreaker",
    "mystic",
    "sister",
    "prince",
    "appraiser",
    "drummer",
    "kidnappers",
    "soldier",
    "infantry",
    "grandmaster",
    "champion",
    "astronomer",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "List Demiplane creatures that look like named NPCs (variants whose names "
            "do not match the base creature). Does not change IsNPC unless --commit."
        )
    )
    default_out = Path(__file__).resolve().parent / "demiplane_named_npc_review.csv"
    parser.add_argument(
        "--out",
        type=Path,
        default=default_out,
        help="CSV review file to write (default: server/scripts/demiplane_named_npc_review.csv).",
    )
    parser.add_argument(
        "--commit",
        action="store_true",
        help="Set IsNPC=1 for rows in the CSV whose MarkedNpc value is Y or yes.",
    )
    parser.add_argument(
        "--apply-suggested",
        action="store_true",
        help="With --commit, use SuggestedNpc instead of MarkedNpc.",
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


def tokens(value: str) -> set[str]:
    return {match.group(0).lower() for match in WORD.finditer(value or "") if match.group(0).lower() not in STOP_WORDS and len(match.group(0)) > 2}


def first_line(raw_md: str | None) -> str:
    if not raw_md:
        return ""
    return raw_md.replace("\r\n", "\n").split("\n", 1)[0].strip()


def suggest_npc(name: str, token_counts: Counter[str]) -> str:
    stripped = LEVEL_SUFFIX.sub("", name or "").strip()
    if ELITE_WEAK.match(stripped):
        return "N"
    name_tokens = tokens(stripped)
    if not name_tokens:
        return "N"
    rare = [word for word in name_tokens if token_counts.get(word, 0) <= 2]
    role = name_tokens & ROLE_WORDS
    if rare or role:
        return "Y"
    return "N"


def load_candidates(cursor: pyodbc.Cursor) -> tuple[list[dict[str, object]], Counter[str]]:
    cursor.execute(
        """
        SELECT Name
        FROM pf2.Monster
        WHERE IsNPC = 0
        """
    )
    token_counts: Counter[str] = Counter()
    for (name,) in cursor.fetchall():
        token_counts.update(tokens(name or ""))

    cursor.execute(
        """
        SELECT MonsterId, Name, Level, AonUrl, RawHtml, RawMD
        FROM pf2.Monster
        WHERE AonUrl LIKE 'https://app.demiplane.com/nexus/pathfinder2e/creature/%'
          AND IsNPC = 0
          AND CAST(RawHtml AS nvarchar(max)) LIKE N'%Variant <tooltip category="creature"%'
        ORDER BY Name, Level, MonsterId
        """
    )

    rows: list[dict[str, object]] = []
    for monster_id, name, level, aon_url, raw_html, raw_md in cursor.fetchall():
        match = VARIANT_TOOLTIP.search(raw_html or "")
        if not match:
            continue
        base_name = match.group(2).strip()
        if tokens(name or "") & tokens(base_name):
            continue
        rows.append(
            {
                "MonsterId": monster_id,
                "Name": name,
                "Level": level,
                "BaseCreature": base_name,
                "AonUrl": aon_url,
                "RawMDFirstLine": first_line(raw_md),
                "SuggestedNpc": suggest_npc(name or "", token_counts),
                "MarkedNpc": "",
            }
        )
    return rows, token_counts


def write_review_csv(path: Path, rows: list[dict[str, object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "MonsterId",
        "Name",
        "Level",
        "BaseCreature",
        "AonUrl",
        "RawMDFirstLine",
        "SuggestedNpc",
        "MarkedNpc",
    ]
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def approved_ids(path: Path, use_suggested: bool) -> list[int]:
    with path.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        ids: list[int] = []
        for row in reader:
            mark = (row.get("SuggestedNpc") if use_suggested else row.get("MarkedNpc")) or ""
            if mark.strip().lower() in {"y", "yes", "1", "true"}:
                ids.append(int(row["MonsterId"]))
        return ids


def main() -> None:
    args = parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")

    with connect() as connection:
        connection.autocommit = False
        cursor = connection.cursor()

        if args.commit:
            if not args.out.exists():
                raise SystemExit(f"Review file not found: {args.out}")
            ids = approved_ids(args.out, args.apply_suggested)
            if not ids:
                logging.info("No approved MonsterIds in %s.", args.out)
                return
            logging.info("Setting IsNPC=1 for %d rows.", len(ids))
            for monster_id in ids:
                cursor.execute(
                    """
                    UPDATE pf2.Monster
                    SET IsNPC = 1,
                        UpdatedAt = SYSDATETIME()
                    WHERE MonsterId = ?
                      AND IsNPC = 0
                    """,
                    monster_id,
                )
            connection.commit()
            logging.info("Committed IsNPC updates.")
            return

        rows, _token_counts = load_candidates(cursor)
        write_review_csv(args.out, rows)
        suggested = sum(1 for row in rows if row["SuggestedNpc"] == "Y")
        logging.info(
            "Wrote %d candidates (%d suggested Y) to %s. MarkedNpc is blank.",
            len(rows),
            suggested,
            args.out,
        )
        for row in rows:
            logging.info(
                "MonsterId=%s | %s | base=%s | suggested=%s | %s",
                row["MonsterId"],
                row["Name"],
                row["BaseCreature"],
                row["SuggestedNpc"],
                row["AonUrl"],
            )


if __name__ == "__main__":
    main()
