-- Full-text indexes required by PF2 Search (CONTAINS on all five libraries).
-- Run in SSMS: File -> Open -> this file -> Execute (F5). Do not paste from chat.
-- Or: sqlcmd -S localhost -d PathfinderUtil -E -i ensure_fulltext_indexes.sql

USE PathfinderUtil;
GO

SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;
GO

IF FULLTEXTSERVICEPROPERTY('IsFullTextInstalled') <> 1
BEGIN
    RAISERROR('Full-Text Search is not installed on this SQL Server instance.', 16, 1);
    RETURN;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.fulltext_catalogs WHERE name = N'PF2MonsterCatalog')
    CREATE FULLTEXT CATALOG PF2MonsterCatalog WITH ACCENT_SENSITIVITY = OFF;
GO

IF NOT EXISTS (SELECT 1 FROM sys.fulltext_catalogs WHERE name = N'PF2FullTextCatalog')
    CREATE FULLTEXT CATALOG PF2FullTextCatalog WITH ACCENT_SENSITIVITY = OFF;
GO

IF NOT EXISTS (SELECT 1 FROM sys.fulltext_indexes WHERE object_id = OBJECT_ID(N'pf2.Monster'))
BEGIN
    EXEC(N'
        CREATE FULLTEXT INDEX ON pf2.Monster
        (
            Name LANGUAGE 1033,
            RawText LANGUAGE 1033
        )
        KEY INDEX PK_Monster
        ON PF2MonsterCatalog
        WITH CHANGE_TRACKING AUTO;
    ');
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.fulltext_indexes WHERE object_id = OBJECT_ID(N'pf2.Spell'))
BEGIN
    EXEC(N'
        CREATE FULLTEXT INDEX ON pf2.Spell
        (
            Name LANGUAGE 1033,
            Summary LANGUAGE 1033,
            RawText LANGUAGE 1033
        )
        KEY INDEX PK_Spell
        ON PF2FullTextCatalog
        WITH CHANGE_TRACKING AUTO;
    ');
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.fulltext_indexes WHERE object_id = OBJECT_ID(N'pf2.Feat'))
BEGIN
    EXEC(N'
        CREATE FULLTEXT INDEX ON pf2.Feat
        (
            Name LANGUAGE 1033,
            Summary LANGUAGE 1033,
            RawText LANGUAGE 1033
        )
        KEY INDEX PK_Feat
        ON PF2FullTextCatalog
        WITH CHANGE_TRACKING AUTO;
    ');
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.fulltext_indexes WHERE object_id = OBJECT_ID(N'pf2.Equipment'))
BEGIN
    EXEC(N'
        CREATE FULLTEXT INDEX ON pf2.Equipment
        (
            Name LANGUAGE 1033,
            Summary LANGUAGE 1033,
            RawText LANGUAGE 1033
        )
        KEY INDEX PK_Equipment
        ON PF2FullTextCatalog
        WITH CHANGE_TRACKING AUTO;
    ');
END
GO

IF EXISTS (SELECT 1 FROM sys.fulltext_indexes WHERE object_id = OBJECT_ID(N'pf2.Equipment'))
BEGIN
    IF COL_LENGTH('pf2.Equipment', 'BaseItemText') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM sys.fulltext_index_columns fic
            INNER JOIN sys.columns c ON c.object_id = fic.object_id AND c.column_id = fic.column_id
            WHERE fic.object_id = OBJECT_ID(N'pf2.Equipment') AND c.name = N'BaseItemText'
        )
        ALTER FULLTEXT INDEX ON pf2.Equipment ADD (BaseItemText LANGUAGE 1033);

    IF COL_LENGTH('pf2.Equipment', 'SpellText') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM sys.fulltext_index_columns fic
            INNER JOIN sys.columns c ON c.object_id = fic.object_id AND c.column_id = fic.column_id
            WHERE fic.object_id = OBJECT_ID(N'pf2.Equipment') AND c.name = N'SpellText'
        )
        ALTER FULLTEXT INDEX ON pf2.Equipment ADD (SpellText LANGUAGE 1033);

    IF COL_LENGTH('pf2.Equipment', 'StageText') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM sys.fulltext_index_columns fic
            INNER JOIN sys.columns c ON c.object_id = fic.object_id AND c.column_id = fic.column_id
            WHERE fic.object_id = OBJECT_ID(N'pf2.Equipment') AND c.name = N'StageText'
        )
        ALTER FULLTEXT INDEX ON pf2.Equipment ADD (StageText LANGUAGE 1033);
END
GO

PRINT 'Full-text indexes:';
GO

SELECT
    OBJECT_NAME(fi.object_id) AS TableName,
    c.name AS CatalogName,
    fi.is_enabled,
    fi.change_tracking_state_desc,
    STUFF((
        SELECT ', ' + col.name
        FROM sys.fulltext_index_columns fic
        INNER JOIN sys.columns col ON col.object_id = fic.object_id AND col.column_id = fic.column_id
        WHERE fic.object_id = fi.object_id
        ORDER BY col.name
        FOR XML PATH(''), TYPE
    ).value('.', 'NVARCHAR(MAX)'), 1, 2, '') AS FT_Columns
FROM sys.fulltext_indexes fi
INNER JOIN sys.fulltext_catalogs c ON c.fulltext_catalog_id = fi.fulltext_catalog_id
WHERE OBJECT_SCHEMA_NAME(fi.object_id) = N'pf2'
ORDER BY TableName;
GO

PRINT 'CONTAINS smoke tests:';
GO

SELECT 'Monster' AS Module, COUNT(*) AS Matches
FROM pf2.Monster
WHERE CONTAINS((Name, RawText), '"dragon*"');
GO

SELECT 'Spell' AS Module, COUNT(*) AS Matches
FROM pf2.Spell
WHERE CONTAINS((Name, Summary, RawText), '"fire*"');
GO

SELECT 'Feat' AS Module, COUNT(*) AS Matches
FROM pf2.Feat
WHERE CONTAINS((Name, Summary, RawText), '"strike*"');
GO

SELECT 'Equipment' AS Module, COUNT(*) AS Matches
FROM pf2.Equipment
WHERE CONTAINS((Name, Summary, RawText, BaseItemText, SpellText, StageText), '"sword*"');
GO
