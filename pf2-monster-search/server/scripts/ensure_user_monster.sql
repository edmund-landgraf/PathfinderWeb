-- User-generated monsters for PF2 search (My Monsters).
-- Run in SSMS or: sqlcmd -S localhost -d PathfinderUtil -E -i ensure_user_monster.sql
-- Docker SQL Server example:
--   docker exec -i <mssql-container> /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -C -d PathfinderUtil -i /tmp/ensure_user_monster.sql

USE PathfinderUtil;
GO

SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;
GO

IF OBJECT_ID(N'pf2.UserMonster', N'U') IS NULL
BEGIN
    CREATE TABLE pf2.UserMonster (
        UserMonsterId int IDENTITY(1,1) NOT NULL CONSTRAINT PK_UserMonster PRIMARY KEY,
        ContentType nvarchar(30) NOT NULL CONSTRAINT DF_UserMonster_ContentType DEFAULT N'user generated',
        Name nvarchar(255) NOT NULL,
        Level int NULL,
        Rarity nvarchar(100) NULL,
        Size nvarchar(100) NULL,
        Alignment nvarchar(100) NULL,
        Family nvarchar(255) NULL,
        SourceBook nvarchar(255) NULL,
        SourcePage nvarchar(50) NULL,
        AonUrl nvarchar(2048) NULL,
        GameSystem nvarchar(3) NOT NULL CONSTRAINT DF_UserMonster_GameSystem DEFAULT N'PF2',
        IsUnique bit NULL,
        IsNPC bit NOT NULL CONSTRAINT DF_UserMonster_IsNPC DEFAULT 0,
        Perception int NULL,
        Senses nvarchar(max) NULL,
        Languages nvarchar(max) NULL,
        Skills nvarchar(max) NULL,
        Items nvarchar(max) NULL,
        StrMod int NULL,
        DexMod int NULL,
        ConMod int NULL,
        IntMod int NULL,
        WisMod int NULL,
        ChaMod int NULL,
        AC int NULL,
        Fortitude int NULL,
        Reflex int NULL,
        Will int NULL,
        HP int NULL,
        Immunities nvarchar(max) NULL,
        Resistances nvarchar(max) NULL,
        Weaknesses nvarchar(max) NULL,
        Speed nvarchar(max) NULL,
        RawMD nvarchar(max) NULL,
        Image varbinary(max) NULL,
        ImageContentType nvarchar(100) NULL,
        CreatedAt datetime2(0) NOT NULL CONSTRAINT DF_UserMonster_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt datetime2(0) NOT NULL CONSTRAINT DF_UserMonster_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_UserMonster_ContentType CHECK (ContentType IN (N'user generated')),
        CONSTRAINT CK_UserMonster_GameSystem CHECK (GameSystem IN (N'PF2', N'SF2'))
    );
END
GO

IF COL_LENGTH(N'pf2.UserMonster', N'AonUrl') IS NULL
BEGIN
    ALTER TABLE pf2.UserMonster ADD AonUrl nvarchar(2048) NULL;
END
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'pf2.UserMonster')
      AND name = N'IX_UserMonster_Name'
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_UserMonster_Name
        ON pf2.UserMonster (Name);
END
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'pf2.UserMonster')
      AND name = N'IX_UserMonster_IsNPC_GameSystem_Level'
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_UserMonster_IsNPC_GameSystem_Level
        ON pf2.UserMonster (IsNPC, GameSystem, Level)
        INCLUDE (Name, ContentType);
END
GO

SELECT
    OBJECT_ID(N'pf2.UserMonster') AS UserMonsterObjectId,
    (SELECT COUNT(*) FROM pf2.UserMonster) AS RowCount;
GO
