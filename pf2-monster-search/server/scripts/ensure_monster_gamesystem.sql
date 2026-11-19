-- Persist pf2.Monster.GameSystem so creature search can filter it by equality.
-- The search API uses this column when it exists and otherwise derives it from SourceBook.Name.
-- Run: sqlcmd -S localhost -d PathfinderUtil -U sa -C -b -i ensure_monster_gamesystem.sql

SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;
GO

IF COL_LENGTH(N'pf2.Monster', N'GameSystem') IS NULL
BEGIN
    ALTER TABLE pf2.Monster ADD GameSystem nvarchar(3) NULL;
END
GO

UPDATE m
SET GameSystem = CASE
    WHEN sb.Name = N'Alien Core'
      OR sb.Name LIKE N'Alien Core,%'
      OR sb.Name LIKE N'%, Alien Core'
      OR sb.Name LIKE N'%, Alien Core,%'
      OR sb.Name LIKE N'%Starfinder%'
    THEN N'SF2'
    ELSE N'PF2'
END
FROM pf2.Monster m
LEFT JOIN pf2.SourceBook sb
    ON sb.SourceBookId = m.SourceBookId
WHERE m.GameSystem IS NULL
   OR m.GameSystem NOT IN (N'PF2', N'SF2');
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'pf2.Monster')
      AND name = N'IX_Monster_IsNPC_GameSystem_Level'
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_Monster_IsNPC_GameSystem_Level
        ON pf2.Monster (IsNPC, GameSystem, Level)
        INCLUDE (Name, IsUnique);
END
GO

CREATE OR ALTER TRIGGER pf2.TR_Monster_GameSystem
ON pf2.Monster
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF TRIGGER_NESTLEVEL() > 1 RETURN;

    UPDATE m
    SET GameSystem = CASE
        WHEN sb.Name = N'Alien Core'
          OR sb.Name LIKE N'Alien Core,%'
          OR sb.Name LIKE N'%, Alien Core'
          OR sb.Name LIKE N'%, Alien Core,%'
          OR sb.Name LIKE N'%Starfinder%'
        THEN N'SF2'
        ELSE N'PF2'
    END
    FROM pf2.Monster m
    INNER JOIN inserted i
        ON i.MonsterId = m.MonsterId
    LEFT JOIN pf2.SourceBook sb
        ON sb.SourceBookId = m.SourceBookId
    WHERE ISNULL(m.GameSystem, N'') <> CASE
        WHEN sb.Name = N'Alien Core'
          OR sb.Name LIKE N'Alien Core,%'
          OR sb.Name LIKE N'%, Alien Core'
          OR sb.Name LIKE N'%, Alien Core,%'
          OR sb.Name LIKE N'%Starfinder%'
        THEN N'SF2'
        ELSE N'PF2'
    END;
END
GO

CREATE OR ALTER TRIGGER pf2.TR_SourceBook_MonsterGameSystem
ON pf2.SourceBook
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE(Name) RETURN;

    UPDATE m
    SET GameSystem = CASE
        WHEN sb.Name = N'Alien Core'
          OR sb.Name LIKE N'Alien Core,%'
          OR sb.Name LIKE N'%, Alien Core'
          OR sb.Name LIKE N'%, Alien Core,%'
          OR sb.Name LIKE N'%Starfinder%'
        THEN N'SF2'
        ELSE N'PF2'
    END
    FROM pf2.Monster m
    INNER JOIN inserted sb
        ON sb.SourceBookId = m.SourceBookId;
END
GO
