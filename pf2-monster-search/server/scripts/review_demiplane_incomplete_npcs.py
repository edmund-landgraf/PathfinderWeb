from __future__ import annotations

import argparse
import csv
import logging
import os
import re
from pathlib import Path

import pyodbc


VARIANT_HTML = re.compile(
    r'Variant <tooltip category="creature"[^>]*>([^<]+)</tooltip>',
    re.IGNORECASE,
)
VARIANT_MD = re.compile(r"(?im)^\**\s*variant\s+(.+?)\**\s*$")
AS_MD = re.compile(r"(?im)^\**\s*as\s+(.+?)\**\s*$")
GENDER_BASE = re.compile(
    r"(?i)(?:elite\s+|weak\s+)?(?:male|female)\s+(?:human\s+|elf\s+|dwarf\s+|halfling\s+|goblin\s+|hobgoblin\s+|aiuvarin\s+|aasimar\s+)?(.+)"
)
ELITE_BASE = re.compile(r"(?im)^(?:elite|weak)\s+(.+)$")
AS_INLINE = re.compile(r"(?i)\bas\s+([A-Za-z][A-Za-z '’-]+)")
ROLE_BASE = re.compile(
    r"(?i)(captain of the guard|watch officer|exorcist|gendarme|commoner|servant|urchin|smuggler|fence|conspiracist)"
)
WORD = re.compile(r"[a-z']+", re.IGNORECASE)
STOP_WORDS = {"of", "the", "a", "an", "and", "to", "in", "on", "for", "level", "male", "female"}
ELITE_WEAK_NAME = re.compile(r"^(elite|weak)\b", re.IGNORECASE)
HAS_HP_MD = re.compile(r"(?im)^\*\*HP\b")
HAS_PERCEPTION = re.compile(r"(?im)^\*\*Perception\*\*")
HAS_AC = re.compile(r"(?im)^\*\*AC\*\*")
INITIATIVE = re.compile(r"(?im)^\*\*Initiative\*\*")
INFLUENCE = re.compile(r"(?im)^\*\*(Discovery|Influence Skills)\*\*")
IMPERSONATE = re.compile(r"(?i)impersonating\s+(.+)$")

CREATURE_WORDS = {
    "akata",
    "amalgamite",
    "butler",
    "bulwark",
    "caypin",
    "darrok",
    "drone",
    "gogiteth",
    "hound",
    "hydra",
    "imp",
    "mantis",
    "monster",
    "mount",
    "ort",
    "paleohemoth",
    "phantom",
    "quelaunt",
    "redcap",
    "serpent",
    "spider",
    "tsunami",
    "widget",
    "wight",
    "zombie",
    "component",
    "weaver",
    "mount",
    "hardlight",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "List Demiplane creatures with incomplete stat blocks (usually a named NPC "
            "that only lists deltas from a base creature). Does not change IsNPC unless --commit."
        )
    )
    default_out = Path(__file__).resolve().parent / "demiplane_incomplete_npc_review.csv"
    parser.add_argument("--out", type=Path, default=default_out)
    parser.add_argument(
        "--commit",
        action="store_true",
        help="Set IsNPC=1 for rows in the CSV whose MarkedNpc value is Y or yes.",
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
            f"SERVER={server},{port};DATABASE={database};UID={user};PWD={password};"
            "Encrypt=yes;TrustServerCertificate=yes;"
        ),
        (
            "DRIVER={ODBC Driver 17 for SQL Server};"
            f"SERVER={server},{port};DATABASE={database};UID={user};PWD={password};"
            "Encrypt=no;TrustServerCertificate=yes;"
        ),
        "DRIVER={ODBC Driver 17 for SQL Server};SERVER=localhost;DATABASE=PathfinderUtil;Trusted_Connection=yes;",
        (
            "DRIVER={ODBC Driver 17 for SQL Server};SERVER=localhost;DATABASE=PathfinderUtil;"
            "Trusted_Connection=yes;Encrypt=no;TrustServerCertificate=yes;"
        ),
        (
            "DRIVER={ODBC Driver 18 for SQL Server};SERVER=localhost;DATABASE=PathfinderUtil;"
            "Trusted_Connection=yes;TrustServerCertificate=yes;"
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
    return {
        match.group(0).lower()
        for match in WORD.finditer(value or "")
        if match.group(0).lower() not in STOP_WORDS and len(match.group(0)) > 2
    }


def prose_lines(raw_md: str) -> list[str]:
    lines: list[str] = []
    for line in (raw_md or "").replace("\r\n", "\n").split("\n"):
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or stripped.startswith("- "):
            continue
        lines.append(stripped)
    return lines


def detect_base(raw_html: str, raw_md: str) -> str:
    html_match = VARIANT_HTML.search(raw_html or "")
    if html_match:
        return html_match.group(1).strip()
    for line in prose_lines(raw_md):
        for pattern in (VARIANT_MD, AS_MD, ELITE_BASE):
            match = pattern.match(line)
            if match:
                return re.sub(r"\*+", "", match.group(1)).strip()
        gender = GENDER_BASE.search(line)
        if gender:
            return re.sub(r"\*+", "", gender.group(1)).split(";")[0].strip()
        as_inline = AS_INLINE.search(line)
        if as_inline:
            return as_inline.group(1).strip()
        role = ROLE_BASE.search(line)
        if role:
            return role.group(1).strip()
        impersonate = IMPERSONATE.search(line)
        if impersonate:
            return impersonate.group(0).strip()
    return ""


def is_incomplete_source(raw_md: str, base: str) -> bool:
    text = raw_md or ""
    if not text.strip():
        return True
    if HAS_HP_MD.search(text):
        return False
    if base:
        return True
    if INITIATIVE.search(text) or INFLUENCE.search(text):
        return True
    if not HAS_PERCEPTION.search(text) and not HAS_AC.search(text):
        return True
    return False


def suggest_npc(name: str, base: str, raw_md: str) -> str:
    if ELITE_WEAK_NAME.match(name or ""):
        return "N"
    name_tokens = tokens(name)
    if name_tokens & {"monster", "mount", "hydra", "akata"}:
        return "N"
    if name_tokens & CREATURE_WORDS and not (tokens(name) - CREATURE_WORDS - {"infected", "fiendish", "spectral", "fang", "busoborn", "shrewd", "cruel", "automatic", "hardlight", "component", "nursery", "crowncrusher", "stygian", "aucturnite", "bastardhall", "elemental", "mindwarp", "hellfire", "grinder", "iron", "rose"}):
        return "N"
    if name_tokens & CREATURE_WORDS and tokens(base) & name_tokens:
        return "N"
    creature_name_bits = name_tokens & CREATURE_WORDS
    if creature_name_bits and not INFLUENCE.search(raw_md or ""):
        leftover = name_tokens - CREATURE_WORDS - {"infected", "fiendish", "spectral", "fang", "busoborn", "shrewd", "cruel", "automatic", "elite", "weak", "greater", "deadly", "hardlight", "component", "nursery", "crowncrusher", "stygian", "aucturnite", "bastardhall", "elemental", "mindwarp", "hellfire", "grinder", "iron", "rose", "fog", "fungal", "hungry", "ghost", "crested", "maze", "mushfens"}
        if not leftover:
            return "N"
    return "Y"


def first_line(raw_md: str | None) -> str:
    if not raw_md:
        return ""
    return raw_md.replace("\r\n", "\n").split("\n", 1)[0].strip()


def load_candidates(cursor: pyodbc.Cursor) -> list[dict[str, object]]:
    cursor.execute(
        """
        SELECT m.MonsterId, m.Name, m.Level, m.AonUrl,
               CAST(m.RawHtml AS nvarchar(max)), CAST(m.RawMD AS nvarchar(max))
        FROM pf2.Monster m
        LEFT JOIN pf2.MonsterStats ms ON ms.MonsterId = m.MonsterId
        WHERE m.AonUrl LIKE 'https://app.demiplane.com/nexus/pathfinder2e/creature/%'
          AND m.IsNPC = 0
          AND ms.HP IS NULL
        ORDER BY m.Name, m.Level, m.MonsterId
        """
    )
    rows: list[dict[str, object]] = []
    for monster_id, name, level, aon_url, raw_html, raw_md in cursor.fetchall():
        base = detect_base(raw_html or "", raw_md or "")
        if not is_incomplete_source(raw_md or "", base):
            continue
        suggested = suggest_npc(name or "", base, raw_md or "")
        rows.append(
            {
                "MonsterId": monster_id,
                "Name": name,
                "Level": level,
                "BaseCreature": base,
                "AonUrl": aon_url,
                "RawMDFirstLine": first_line(raw_md),
                "SuggestedNpc": suggested,
                "MarkedNpc": suggested,
            }
        )
    return rows


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


def approved_ids(path: Path) -> list[int]:
    with path.open(encoding="utf-8", newline="") as handle:
        return [
            int(row["MonsterId"])
            for row in csv.DictReader(handle)
            if (row.get("MarkedNpc") or "").strip().lower() in {"y", "yes", "1", "true"}
        ]


def main() -> None:
    args = parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")

    with connect() as connection:
        connection.autocommit = False
        cursor = connection.cursor()
        if args.commit:
            if not args.out.exists():
                raise SystemExit(f"Review file not found: {args.out}")
            ids = approved_ids(args.out)
            logging.info("Setting IsNPC=1 for %d rows.", len(ids))
            for monster_id in ids:
                cursor.execute(
                    """
                    UPDATE pf2.Monster
                    SET IsNPC = 1, UpdatedAt = SYSDATETIME()
                    WHERE MonsterId = ? AND IsNPC = 0
                    """,
                    monster_id,
                )
            connection.commit()
            logging.info("Committed IsNPC updates.")
            return

        rows = load_candidates(cursor)
        write_review_csv(args.out, rows)
        suggested = sum(1 for row in rows if row["SuggestedNpc"] == "Y")
        logging.info("Wrote %d incomplete candidates (%d Y) to %s", len(rows), suggested, args.out)
        for row in rows:
            logging.info(
                "MonsterId=%s | %s | base=%s | %s",
                row["MonsterId"],
                row["Name"],
                row["BaseCreature"] or "-",
                row["SuggestedNpc"],
            )


if __name__ == "__main__":
    main()
