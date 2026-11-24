-- Indexes for equipment, feat, and spell search filters and page-by-id lookups.
-- Run in SSMS or: sqlcmd -S localhost -d PathfinderUtil -E -i ensure_search_indexes.sql

SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'pf2.Equipment') AND name = N'IX_Equipment_Name'
)
    CREATE NONCLUSTERED INDEX IX_Equipment_Name
        ON pf2.Equipment (Name)
        INCLUDE (Level, RarityId, EquipmentType, ItemCategory, PriceCp);
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'pf2.EquipmentTrait') AND name = N'IX_EquipmentTrait_EquipmentId'
)
    CREATE NONCLUSTERED INDEX IX_EquipmentTrait_EquipmentId
        ON pf2.EquipmentTrait (EquipmentId)
        INCLUDE (TraitId);
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'pf2.EquipmentSourceLink') AND name = N'IX_EquipmentSourceLink_EquipmentId'
)
    CREATE NONCLUSTERED INDEX IX_EquipmentSourceLink_EquipmentId
        ON pf2.EquipmentSourceLink (EquipmentId)
        INCLUDE (SourceBookId);
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'pf2.FeatTrait') AND name = N'IX_FeatTrait_FeatId'
)
    CREATE NONCLUSTERED INDEX IX_FeatTrait_FeatId
        ON pf2.FeatTrait (FeatId)
        INCLUDE (TraitId);
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'pf2.FeatSourceLink') AND name = N'IX_FeatSourceLink_FeatId'
)
    CREATE NONCLUSTERED INDEX IX_FeatSourceLink_FeatId
        ON pf2.FeatSourceLink (FeatId)
        INCLUDE (SourceBookId);
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'pf2.SpellTrait') AND name = N'IX_SpellTrait_SpellId'
)
    CREATE NONCLUSTERED INDEX IX_SpellTrait_SpellId
        ON pf2.SpellTrait (SpellId)
        INCLUDE (TraitId);
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'pf2.SpellTradition') AND name = N'IX_SpellTradition_SpellId'
)
    CREATE NONCLUSTERED INDEX IX_SpellTradition_SpellId
        ON pf2.SpellTradition (SpellId)
        INCLUDE (TraditionId);
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'pf2.SpellSourceLink') AND name = N'IX_SpellSourceLink_SpellId'
)
    CREATE NONCLUSTERED INDEX IX_SpellSourceLink_SpellId
        ON pf2.SpellSourceLink (SpellId)
        INCLUDE (SourceBookId);
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'pf2.Monster') AND name = N'IX_Monster_IsNPC_Name'
)
    CREATE NONCLUSTERED INDEX IX_Monster_IsNPC_Name
        ON pf2.Monster (IsNPC, Name)
        INCLUDE (Level, RarityId, SizeId, AlignmentId, FamilyId, SourceBookId);
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'pf2.UserEquipment') AND name = N'IX_UserEquipment_Name'
)
    CREATE NONCLUSTERED INDEX IX_UserEquipment_Name
        ON pf2.UserEquipment (Name)
        INCLUDE (Level, ItemCategory, Rarity);
GO
