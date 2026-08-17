-- Indexes and lean views for PF2 monster search and MonsterImage lookups.
-- Run in SSMS or: sqlcmd -S localhost -d PathfinderUtil -E -i ensure_monster_search_indexes.sql

SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'pf2.MonsterImage')
      AND name = N'PK_MonsterImage'
)
BEGIN
    ALTER TABLE pf2.MonsterImage
        ADD CONSTRAINT PK_MonsterImage PRIMARY KEY CLUSTERED (MonsterID);
END
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'pf2.SourceBook')
      AND name = N'IX_SourceBook_Name'
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_SourceBook_Name
        ON pf2.SourceBook (Name);
END
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'pf2.MonsterFamily')
      AND name = N'IX_MonsterFamily_Name'
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_MonsterFamily_Name
        ON pf2.MonsterFamily (Name);
END
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'pf2.Rarity')
      AND name = N'IX_Rarity_Name'
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_Rarity_Name
        ON pf2.Rarity (Name);
END
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'pf2.SizeCategory')
      AND name = N'IX_SizeCategory_Name'
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_SizeCategory_Name
        ON pf2.SizeCategory (Name);
END
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'pf2.Alignment')
      AND name = N'IX_Alignment_Name'
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_Alignment_Name
        ON pf2.Alignment (Name);
END
GO

CREATE OR ALTER VIEW pf2.vwMonsterImagePresent
AS
SELECT MonsterID
FROM pf2.MonsterImage
WHERE MonsterImage IS NOT NULL;
GO

CREATE OR ALTER VIEW pf2.vwMonsterHasImage
AS
SELECT
    m.MonsterId,
    m.Name,
    m.Level,
    m.AonId
FROM pf2.Monster m
INNER JOIN pf2.vwMonsterImagePresent i
    ON i.MonsterID = m.MonsterId;
GO

CREATE OR ALTER VIEW pf2.vwMonsterList
AS
WITH base AS (
    SELECT
        m.MonsterId,
        m.AonId,
        m.AonUrl,
        m.Name,
        m.Level,
        m.RarityId,
        r.Name AS Rarity,
        m.SizeId,
        sz.Name AS Size,
        m.AlignmentId,
        a.Name AS Alignment,
        m.FamilyId,
        f.Name AS Family,
        m.SourceBookId,
        sb.Name AS PrimarySourceBook,
        m.SourcePage,
        m.IsUnique,
        m.IsNPC,
        m.ImageUrl,
        ms.Perception,
        ms.Senses,
        ms.Languages,
        ms.Skills,
        ms.Items,
        ms.StrMod,
        ms.DexMod,
        ms.ConMod,
        ms.IntMod,
        ms.WisMod,
        ms.ChaMod,
        ms.AC,
        ms.Fortitude,
        ms.Reflex,
        ms.Will,
        ms.HP,
        ms.Immunities,
        ms.Resistances,
        ms.Weaknesses,
        ms.Speed,
        m.RawMD
    FROM pf2.Monster m
    LEFT JOIN pf2.Rarity r
        ON m.RarityId = r.RarityId
    LEFT JOIN pf2.SizeCategory sz
        ON m.SizeId = sz.SizeId
    LEFT JOIN pf2.Alignment a
        ON m.AlignmentId = a.AlignmentId
    LEFT JOIN pf2.MonsterFamily f
        ON m.FamilyId = f.FamilyId
    LEFT JOIN pf2.SourceBook sb
        ON m.SourceBookId = sb.SourceBookId
    LEFT JOIN pf2.MonsterStats ms
        ON m.MonsterId = ms.MonsterId
),
align_groups AS (
    SELECT
        Name,
        Level,
        RarityId,
        SizeId,
        FamilyId,
        IsUnique,
        IsNPC,
        Perception,
        StrMod,
        DexMod,
        ConMod,
        IntMod,
        WisMod,
        ChaMod,
        AC,
        Fortitude,
        Reflex,
        Will,
        HP,
        Speed,
        COUNT(DISTINCT AlignmentId) AS DistinctAlignments,
        MAX(AlignmentId) AS PreferredAlignmentId
    FROM base
    GROUP BY
        Name,
        Level,
        RarityId,
        SizeId,
        FamilyId,
        IsUnique,
        IsNPC,
        Perception,
        StrMod,
        DexMod,
        ConMod,
        IntMod,
        WisMod,
        ChaMod,
        AC,
        Fortitude,
        Reflex,
        Will,
        HP,
        Speed
),
joined AS (
    SELECT
        b.*,
        g.DistinctAlignments,
        g.PreferredAlignmentId,
        CASE
            WHEN g.DistinctAlignments <= 1 THEN ISNULL(g.PreferredAlignmentId, -1)
            ELSE ISNULL(b.AlignmentId, -1)
        END AS AlignmentGroupId
    FROM base b
    INNER JOIN align_groups g
        ON ISNULL(b.Name, N'') = ISNULL(g.Name, N'')
       AND ISNULL(b.Level, -2147483648) = ISNULL(g.Level, -2147483648)
       AND ISNULL(b.RarityId, -2147483648) = ISNULL(g.RarityId, -2147483648)
       AND ISNULL(b.SizeId, -2147483648) = ISNULL(g.SizeId, -2147483648)
       AND ISNULL(b.FamilyId, -2147483648) = ISNULL(g.FamilyId, -2147483648)
       AND ISNULL(CAST(b.IsUnique AS int), -1) = ISNULL(CAST(g.IsUnique AS int), -1)
       AND ISNULL(CAST(b.IsNPC AS int), -1) = ISNULL(CAST(g.IsNPC AS int), -1)
       AND ISNULL(b.Perception, -2147483648) = ISNULL(g.Perception, -2147483648)
       AND ISNULL(b.StrMod, -2147483648) = ISNULL(g.StrMod, -2147483648)
       AND ISNULL(b.DexMod, -2147483648) = ISNULL(g.DexMod, -2147483648)
       AND ISNULL(b.ConMod, -2147483648) = ISNULL(g.ConMod, -2147483648)
       AND ISNULL(b.IntMod, -2147483648) = ISNULL(g.IntMod, -2147483648)
       AND ISNULL(b.WisMod, -2147483648) = ISNULL(g.WisMod, -2147483648)
       AND ISNULL(b.ChaMod, -2147483648) = ISNULL(g.ChaMod, -2147483648)
       AND ISNULL(b.AC, -2147483648) = ISNULL(g.AC, -2147483648)
       AND ISNULL(b.Fortitude, -2147483648) = ISNULL(g.Fortitude, -2147483648)
       AND ISNULL(b.Reflex, -2147483648) = ISNULL(g.Reflex, -2147483648)
       AND ISNULL(b.Will, -2147483648) = ISNULL(g.Will, -2147483648)
       AND ISNULL(b.HP, -2147483648) = ISNULL(g.HP, -2147483648)
       AND ISNULL(b.Speed, N'') = ISNULL(g.Speed, N'')
),
ranked AS (
    SELECT
        j.*,
        ROW_NUMBER() OVER (
            PARTITION BY
                j.Name,
                j.Level,
                j.RarityId,
                j.SizeId,
                j.FamilyId,
                j.IsUnique,
                j.IsNPC,
                j.Perception,
                j.StrMod,
                j.DexMod,
                j.ConMod,
                j.IntMod,
                j.WisMod,
                j.ChaMod,
                j.AC,
                j.Fortitude,
                j.Reflex,
                j.Will,
                j.HP,
                j.Speed,
                j.AlignmentGroupId
            ORDER BY j.MonsterId
        ) AS SourceRank
    FROM joined j
)
SELECT
    b.MonsterId,
    b.AonId,
    b.AonUrl,
    b.Name,
    b.Level,
    b.RarityId,
    b.Rarity,
    b.SizeId,
    b.Size,
    CASE
        WHEN b.DistinctAlignments <= 1 THEN COALESCE(b.PreferredAlignmentId, b.AlignmentId)
        ELSE b.AlignmentId
    END AS AlignmentId,
    CASE
        WHEN b.DistinctAlignments <= 1 THEN COALESCE(pa.Name, b.Alignment)
        ELSE b.Alignment
    END AS Alignment,
    b.FamilyId,
    b.Family,
    b.SourceBookId,
    COALESCE(sources.SourceBook, b.PrimarySourceBook) AS SourceBook,
    b.SourcePage,
    b.IsUnique,
    b.IsNPC,
    b.ImageUrl,
    b.Perception,
    b.Senses,
    b.Languages,
    b.Skills,
    b.Items,
    b.StrMod,
    b.DexMod,
    b.ConMod,
    b.IntMod,
    b.WisMod,
    b.ChaMod,
    b.AC,
    b.Fortitude,
    b.Reflex,
    b.Will,
    b.HP,
    b.Immunities,
    b.Resistances,
    b.Weaknesses,
    b.Speed,
    b.RawMD
FROM ranked b
LEFT JOIN pf2.Alignment pa
    ON pa.AlignmentId = b.PreferredAlignmentId
OUTER APPLY (
    SELECT STRING_AGG(src.Name, ', ') WITHIN GROUP (ORDER BY src.SortOrder) AS SourceBook
    FROM (
        SELECT
            x.PrimarySourceBook AS Name,
            MIN(x.MonsterId) AS SortOrder
        FROM joined x
        WHERE x.PrimarySourceBook IS NOT NULL
          AND ISNULL(x.Name, N'') = ISNULL(b.Name, N'')
          AND ISNULL(x.Level, -2147483648) = ISNULL(b.Level, -2147483648)
          AND ISNULL(x.RarityId, -2147483648) = ISNULL(b.RarityId, -2147483648)
          AND ISNULL(x.SizeId, -2147483648) = ISNULL(b.SizeId, -2147483648)
          AND ISNULL(x.FamilyId, -2147483648) = ISNULL(b.FamilyId, -2147483648)
          AND ISNULL(CAST(x.IsUnique AS int), -1) = ISNULL(CAST(b.IsUnique AS int), -1)
          AND ISNULL(CAST(x.IsNPC AS int), -1) = ISNULL(CAST(b.IsNPC AS int), -1)
          AND ISNULL(x.Perception, -2147483648) = ISNULL(b.Perception, -2147483648)
          AND ISNULL(x.StrMod, -2147483648) = ISNULL(b.StrMod, -2147483648)
          AND ISNULL(x.DexMod, -2147483648) = ISNULL(b.DexMod, -2147483648)
          AND ISNULL(x.ConMod, -2147483648) = ISNULL(b.ConMod, -2147483648)
          AND ISNULL(x.IntMod, -2147483648) = ISNULL(b.IntMod, -2147483648)
          AND ISNULL(x.WisMod, -2147483648) = ISNULL(b.WisMod, -2147483648)
          AND ISNULL(x.ChaMod, -2147483648) = ISNULL(b.ChaMod, -2147483648)
          AND ISNULL(x.AC, -2147483648) = ISNULL(b.AC, -2147483648)
          AND ISNULL(x.Fortitude, -2147483648) = ISNULL(b.Fortitude, -2147483648)
          AND ISNULL(x.Reflex, -2147483648) = ISNULL(b.Reflex, -2147483648)
          AND ISNULL(x.Will, -2147483648) = ISNULL(b.Will, -2147483648)
          AND ISNULL(x.HP, -2147483648) = ISNULL(b.HP, -2147483648)
          AND ISNULL(x.Speed, N'') = ISNULL(b.Speed, N'')
          AND x.AlignmentGroupId = b.AlignmentGroupId
        GROUP BY x.PrimarySourceBook
    ) src
) sources
WHERE b.SourceRank = 1;
GO
