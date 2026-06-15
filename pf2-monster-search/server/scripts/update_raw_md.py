import subprocess
import sys
import tempfile
from pathlib import Path


SQLCMD = "sqlcmd"
SERVER = "localhost"
DATABASE = "PathfinderUtil"

QUERY = r"""
SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;

EXEC(N'
CREATE OR ALTER FUNCTION pf2.ConvertAoNMarkdown(@input nvarchar(max))
RETURNS nvarchar(max)
AS
BEGIN
  DECLARE @s nvarchar(max) = @input;
  IF @s IS NULL RETURN NULL;

  SET @s = REPLACE(@s, CHAR(13) + CHAR(10), CHAR(10));
  SET @s = REPLACE(@s, CHAR(13), CHAR(10));
  SET @s = REPLACE(@s, ''<br />'', CHAR(10));
  SET @s = REPLACE(@s, ''<br/>'', CHAR(10));
  SET @s = REPLACE(@s, ''<br>'', CHAR(10));

  DECLARE @start int, @tagEnd int, @close int, @end int;
  DECLARE @tag nvarchar(max), @body nvarchar(max), @replacement nvarchar(max);
  DECLARE @attrStart int, @attrEnd int, @level int, @right nvarchar(400), @label nvarchar(400), @src nvarchar(1000);
  DECLARE @tableStart int, @tableTagEnd int, @tableClose int, @tableInner nvarchar(max), @tableMarkdown nvarchar(max);
  DECLARE @rowStart int, @rowTagEnd int, @rowClose int, @rowInner nvarchar(max), @rowMarkdown nvarchar(max);
  DECLARE @cellStart int, @cellTagEnd int, @cellClose int, @cellValue nvarchar(max), @cellCount int, @rowCount int;

  WHILE CHARINDEX(''<title'', @s) > 0 AND CHARINDEX(''</title>'', @s) > 0
  BEGIN
    SET @start = CHARINDEX(''<title'', @s);
    SET @tagEnd = CHARINDEX(''>'', @s, @start);
    SET @close = CHARINDEX(''</title>'', @s, @tagEnd);
    IF @tagEnd = 0 OR @close = 0 BREAK;

    SET @tag = SUBSTRING(@s, @start, @tagEnd - @start + 1);
    SET @body = LTRIM(RTRIM(SUBSTRING(@s, @tagEnd + 1, @close - @tagEnd - 1)));
    SET @level = 2;
    SET @right = NULL;

    SET @attrStart = CHARINDEX(''level="'', @tag);
    IF @attrStart > 0
    BEGIN
      SET @attrStart = @attrStart + LEN(''level="'');
      SET @attrEnd = CHARINDEX(''"'', @tag, @attrStart);
      SET @level = TRY_CONVERT(int, SUBSTRING(@tag, @attrStart, @attrEnd - @attrStart));
    END

    SET @attrStart = CHARINDEX(''right="'', @tag);
    IF @attrStart > 0
    BEGIN
      SET @attrStart = @attrStart + LEN(''right="'');
      SET @attrEnd = CHARINDEX(''"'', @tag, @attrStart);
      SET @right = NULLIF(LTRIM(RTRIM(SUBSTRING(@tag, @attrStart, @attrEnd - @attrStart))), N'''');
    END

    SET @replacement =
      CHAR(10) + REPLICATE(N''#'', ISNULL(NULLIF(@level, 0), 2)) + N'' '' + @body +
      CASE WHEN @right IS NULL THEN N'''' ELSE N'' '' + @right END +
      CHAR(10) + CHAR(10);

    SET @end = @close + LEN(''</title>'');
    SET @s = STUFF(@s, @start, @end - @start, @replacement);
  END

  WHILE CHARINDEX(''<trait'', @s) > 0
  BEGIN
    SET @start = CHARINDEX(''<trait'', @s);
    SET @tagEnd = CHARINDEX(''>'', @s, @start);
    IF @tagEnd = 0 BREAK;

    SET @tag = SUBSTRING(@s, @start, @tagEnd - @start + 1);
    SET @label = NULL;
    SET @attrStart = CHARINDEX(''label="'', @tag);
    IF @attrStart > 0
    BEGIN
      SET @attrStart = @attrStart + LEN(''label="'');
      SET @attrEnd = CHARINDEX(''"'', @tag, @attrStart);
      SET @label = NULLIF(LTRIM(RTRIM(SUBSTRING(@tag, @attrStart, @attrEnd - @attrStart))), N'''');
    END

    SET @replacement = CASE WHEN @label IS NULL THEN N'''' ELSE N''- '' + @label + CHAR(10) END;
    SET @s = STUFF(@s, @start, @tagEnd - @start + 1, @replacement);
  END

  WHILE CHARINDEX(''<actions'', @s) > 0
  BEGIN
    SET @start = CHARINDEX(''<actions'', @s);
    SET @tagEnd = CHARINDEX(''>'', @s, @start);
    IF @tagEnd = 0 BREAK;

    SET @tag = SUBSTRING(@s, @start, @tagEnd - @start + 1);
    SET @label = NULL;
    SET @attrStart = CHARINDEX(''string="'', @tag);
    IF @attrStart > 0
    BEGIN
      SET @attrStart = @attrStart + LEN(''string="'');
      SET @attrEnd = CHARINDEX(''"'', @tag, @attrStart);
      SET @label = NULLIF(LTRIM(RTRIM(SUBSTRING(@tag, @attrStart, @attrEnd - @attrStart))), N'''');
    END

    SET @replacement = CASE WHEN @label IS NULL THEN N'''' ELSE @label END;
    SET @s = STUFF(@s, @start, @tagEnd - @start + 1, @replacement);
  END

  WHILE CHARINDEX(''<image'', @s) > 0
  BEGIN
    SET @start = CHARINDEX(''<image'', @s);
    SET @tagEnd = CHARINDEX(''>'', @s, @start);
    IF @tagEnd = 0 BREAK;

    SET @tag = SUBSTRING(@s, @start, @tagEnd - @start + 1);
    SET @src = NULL;
    SET @attrStart = CHARINDEX(''src="'', @tag);
    IF @attrStart > 0
    BEGIN
      SET @attrStart = @attrStart + LEN(''src="'');
      SET @attrEnd = CHARINDEX(''"'', @tag, @attrStart);
      SET @src = NULLIF(LTRIM(RTRIM(SUBSTRING(@tag, @attrStart, @attrEnd - @attrStart))), N'''');
    END

    SET @replacement = CASE WHEN @src IS NULL THEN N'''' ELSE N''![]('' + @src + N'')'' + CHAR(10) END;
    SET @s = STUFF(@s, @start, @tagEnd - @start + 1, @replacement);
  END

  WHILE CHARINDEX(''<table'', @s) > 0 AND CHARINDEX(''</table>'', @s) > 0
  BEGIN
    SET @tableStart = CHARINDEX(''<table'', @s);
    SET @tableTagEnd = CHARINDEX(''>'', @s, @tableStart);
    SET @tableClose = CHARINDEX(''</table>'', @s, @tableTagEnd);
    IF @tableTagEnd = 0 OR @tableClose = 0 BREAK;

    SET @tableInner = SUBSTRING(@s, @tableTagEnd + 1, @tableClose - @tableTagEnd - 1);
    SET @tableMarkdown = CHAR(10) + CHAR(10) + N''| Roll | Result |'' + CHAR(10) + N''| --- | --- |'' + CHAR(10);
    SET @rowCount = 0;

    WHILE CHARINDEX(''<tr'', @tableInner) > 0 AND CHARINDEX(''</tr>'', @tableInner) > 0
    BEGIN
      SET @rowStart = CHARINDEX(''<tr'', @tableInner);
      SET @rowTagEnd = CHARINDEX(''>'', @tableInner, @rowStart);
      SET @rowClose = CHARINDEX(''</tr>'', @tableInner, @rowTagEnd);
      IF @rowTagEnd = 0 OR @rowClose = 0 BREAK;

      SET @rowInner = SUBSTRING(@tableInner, @rowTagEnd + 1, @rowClose - @rowTagEnd - 1);
      SET @rowMarkdown = N''|'';
      SET @cellCount = 0;

      WHILE CHARINDEX(''<td'', @rowInner) > 0 AND CHARINDEX(''</td>'', @rowInner) > 0
      BEGIN
        SET @cellStart = CHARINDEX(''<td'', @rowInner);
        SET @cellTagEnd = CHARINDEX(''>'', @rowInner, @cellStart);
        SET @cellClose = CHARINDEX(''</td>'', @rowInner, @cellTagEnd);
        IF @cellTagEnd = 0 OR @cellClose = 0 BREAK;

        SET @cellValue = LTRIM(RTRIM(SUBSTRING(@rowInner, @cellTagEnd + 1, @cellClose - @cellTagEnd - 1)));
        SET @cellValue = REPLACE(REPLACE(@cellValue, CHAR(10), N'' ''), N''|'', N''\|'');
        SET @rowMarkdown = @rowMarkdown + N'' '' + @cellValue + N'' |'';
        SET @cellCount = @cellCount + 1;

        SET @rowInner = STUFF(@rowInner, @cellStart, @cellClose + LEN(''</td>'') - @cellStart, N'''');
      END

      IF @cellCount > 0
      BEGIN
        SET @tableMarkdown = @tableMarkdown + @rowMarkdown + CHAR(10);
        SET @rowCount = @rowCount + 1;
      END

      SET @tableInner = STUFF(@tableInner, @rowStart, @rowClose + LEN(''</tr>'') - @rowStart, N'''');
    END

    IF @rowCount = 0 SET @tableMarkdown = CHAR(10);

    SET @s = STUFF(@s, @tableStart, @tableClose + LEN(''</table>'') - @tableStart, @tableMarkdown + CHAR(10));
  END

  WHILE CHARINDEX(''<row'', @s) > 0
  BEGIN
    SET @start = CHARINDEX(''<row'', @s);
    SET @tagEnd = CHARINDEX(''>'', @s, @start);
    IF @tagEnd = 0 BREAK;
    SET @s = STUFF(@s, @start, @tagEnd - @start + 1, CHAR(10));
  END

  WHILE CHARINDEX(''<column'', @s) > 0
  BEGIN
    SET @start = CHARINDEX(''<column'', @s);
    SET @tagEnd = CHARINDEX(''>'', @s, @start);
    IF @tagEnd = 0 BREAK;
    SET @s = STUFF(@s, @start, @tagEnd - @start + 1, CHAR(10));
  END

  SET @s = REPLACE(@s, ''</row>'', CHAR(10));
  SET @s = REPLACE(@s, ''</column>'', CHAR(10));
  SET @s = REPLACE(@s, ''<traits>'', CHAR(10));
  SET @s = REPLACE(@s, ''</traits>'', CHAR(10));
  SET @s = REPLACE(@s, ''<aside>'', CHAR(10));
  SET @s = REPLACE(@s, ''</aside>'', CHAR(10));

  WHILE CHARINDEX(''<'', @s) > 0 AND CHARINDEX(''>'', @s, CHARINDEX(''<'', @s)) > 0
  BEGIN
    SET @start = CHARINDEX(''<'', @s);
    SET @tagEnd = CHARINDEX(''>'', @s, @start);
    SET @s = STUFF(@s, @start, @tagEnd - @start + 1, N'''');
  END

  SET @s = REPLACE(@s, N'' **Saving Throw**'', CHAR(10) + CHAR(10) + N''- **Saving Throw**'');
  SET @s = REPLACE(@s, N'' **Trigger**'', CHAR(10) + CHAR(10) + N''- **Trigger**'');
  SET @s = REPLACE(@s, N''; **Effect**'', CHAR(10) + N''- **Effect**'');
  SET @s = REPLACE(@s, N''; **Onset**'', CHAR(10) + N''- **Onset**'');
  SET @s = REPLACE(@s, N''; **Maximum Duration**'', CHAR(10) + N''- **Maximum Duration**'');
  SET @s = REPLACE(@s, N''; **Stage '', CHAR(10) + N''- **Stage '');
  SET @s = REPLACE(@s, CHAR(10) + N''**Critical Success**'', CHAR(10) + CHAR(10) + N''- **Critical Success**'');
  SET @s = REPLACE(@s, CHAR(10) + N''**Success**'', CHAR(10) + N''- **Success**'');
  SET @s = REPLACE(@s, CHAR(10) + N''**Critical Failure**'', CHAR(10) + N''- **Critical Failure**'');
  SET @s = REPLACE(@s, CHAR(10) + N''**Failure**'', CHAR(10) + N''- **Failure**'');
  SET @s = REPLACE(@s, N'' **Critical Success**'', CHAR(10) + CHAR(10) + N''- **Critical Success**'');
  SET @s = REPLACE(@s, N'' **Success**'', CHAR(10) + N''- **Success**'');
  SET @s = REPLACE(@s, N'' **Critical Failure**'', CHAR(10) + N''- **Critical Failure**'');
  SET @s = REPLACE(@s, N'' **Failure**'', CHAR(10) + N''- **Failure**'');
  SET @s = REPLACE(@s, CHAR(10) + N''-'' + CHAR(10), CHAR(10));
  SET @s = REPLACE(@s, CHAR(10) + N''- '' + CHAR(10), CHAR(10));

  WHILE CHARINDEX(CHAR(10) + CHAR(10) + CHAR(10), @s) > 0
  BEGIN
    SET @s = REPLACE(@s, CHAR(10) + CHAR(10) + CHAR(10), CHAR(10) + CHAR(10));
  END

  WHILE LEN(@s) > 0 AND LEFT(@s, 1) IN (N'' '', CHAR(9), CHAR(10))
  BEGIN
    SET @s = SUBSTRING(@s, 2, LEN(@s));
  END

  WHILE LEN(@s) > 0 AND RIGHT(@s, 1) IN (N'' '', CHAR(9), CHAR(10))
  BEGIN
    SET @s = LEFT(@s, LEN(@s) - 1);
  END

  RETURN NULLIF(REPLACE(@s, CHAR(10), CHAR(13) + CHAR(10)), N'''');
END
');

IF COL_LENGTH('pf2.Monster', 'RawMD') IS NULL
BEGIN
  ALTER TABLE pf2.Monster ADD RawMD nvarchar(max) NULL;
END

IF COL_LENGTH('pf2.Spell', 'RawMD') IS NULL
BEGIN
  ALTER TABLE pf2.Spell ADD RawMD nvarchar(max) NULL;
END

IF COL_LENGTH('pf2.Feat', 'RawMD') IS NULL
BEGIN
  ALTER TABLE pf2.Feat ADD RawMD nvarchar(max) NULL;
END

IF COL_LENGTH('pf2.Equipment', 'RawMD') IS NULL
BEGIN
  ALTER TABLE pf2.Equipment ADD RawMD nvarchar(max) NULL;
END

GO

SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;

UPDATE pf2.Monster SET RawMD = NULL;
UPDATE pf2.Spell SET RawMD = NULL;
UPDATE pf2.Feat SET RawMD = NULL;
UPDATE pf2.Equipment SET RawMD = NULL;

UPDATE pf2.Monster
SET RawMD = pf2.ConvertAoNMarkdown(parsed.markdown)
FROM pf2.Monster m
CROSS APPLY OPENJSON(m.RawJson)
WITH (
  markdown nvarchar(max) '$.markdown'
) parsed
WHERE ISJSON(m.RawJson) = 1;

DECLARE @MonsterRows int = @@ROWCOUNT;

UPDATE pf2.Spell
SET RawMD = pf2.ConvertAoNMarkdown(parsed.markdown)
FROM pf2.Spell s
CROSS APPLY OPENJSON(s.RawJson)
WITH (
  markdown nvarchar(max) '$.markdown'
) parsed
WHERE ISJSON(s.RawJson) = 1;

DECLARE @SpellRows int = @@ROWCOUNT;

UPDATE pf2.Feat
SET RawMD = pf2.ConvertAoNMarkdown(parsed.markdown)
FROM pf2.Feat f
CROSS APPLY OPENJSON(f.RawJson)
WITH (
  markdown nvarchar(max) '$.markdown'
) parsed
WHERE ISJSON(f.RawJson) = 1;

DECLARE @FeatRows int = @@ROWCOUNT;

UPDATE pf2.Equipment
SET RawMD = pf2.ConvertAoNMarkdown(parsed.markdown)
FROM pf2.Equipment e
CROSS APPLY OPENJSON(e.RawJson)
WITH (
  markdown nvarchar(max) '$.markdown'
) parsed
WHERE ISJSON(e.RawJson) = 1;

DECLARE @EquipmentRows int = @@ROWCOUNT;

SELECT 'Monster' AS Entity, @MonsterRows AS RowsUpdated
UNION ALL SELECT 'Spell', @SpellRows
UNION ALL SELECT 'Feat', @FeatRows
UNION ALL SELECT 'Equipment', @EquipmentRows;
"""


def main():
    with tempfile.TemporaryDirectory() as tmp_dir:
        query_path = Path(tmp_dir) / "update_raw_md.sql"
        query_path.write_text(QUERY, encoding="utf-8")

        result = subprocess.run(
            [
                SQLCMD,
                "-S",
                SERVER,
                "-d",
                DATABASE,
                "-E",
                "-C",
                "-b",
                "-i",
                str(query_path),
            ],
            text=True,
            capture_output=True,
        )

    if result.stdout:
        print(result.stdout.strip())

    if result.returncode != 0:
        if result.stderr:
            print(result.stderr.strip(), file=sys.stderr)
        return result.returncode

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
