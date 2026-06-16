-- Create pf2.SourceBookPurchase and replace SourceBook.SourcePurchaseURL with SourcePurchaseID.
-- Run in SSMS or: sqlcmd -S localhost -d PathfinderUtil -E -i create_source_book_purchase.sql

USE PathfinderUtil;
GO

SET NOCOUNT ON;
GO

IF OBJECT_ID(N'pf2.SourceBookPurchase', N'U') IS NULL
BEGIN
    CREATE TABLE pf2.SourceBookPurchase
    (
        SourceBookPurchaseId INT IDENTITY(1,1) NOT NULL,
        Name                 NVARCHAR(500) NOT NULL,
        StoreUrl             NVARCHAR(1000) NOT NULL,
        LongDescription      NVARCHAR(MAX) NULL,
        Price                DECIMAL(10, 2) NULL,
        CONSTRAINT PK_SourceBookPurchase PRIMARY KEY CLUSTERED (SourceBookPurchaseId),
        CONSTRAINT UQ_SourceBookPurchase_StoreUrl UNIQUE (StoreUrl)
    );
END
GO

IF COL_LENGTH('pf2.SourceBook', 'SourcePurchaseURL') IS NOT NULL
   AND COL_LENGTH('pf2.SourceBook', 'SourcePurchaseID') IS NULL
BEGIN
    ALTER TABLE pf2.SourceBook DROP COLUMN SourcePurchaseURL;
END
GO

IF COL_LENGTH('pf2.SourceBook', 'SourcePurchaseID') IS NULL
BEGIN
    ALTER TABLE pf2.SourceBook
        ADD SourcePurchaseID INT NULL;
END
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.foreign_keys
    WHERE name = N'FK_SourceBook_SourceBookPurchase'
)
BEGIN
    ALTER TABLE pf2.SourceBook
        ADD CONSTRAINT FK_SourceBook_SourceBookPurchase
            FOREIGN KEY (SourcePurchaseID)
            REFERENCES pf2.SourceBookPurchase (SourceBookPurchaseId);
END
GO

SELECT
    c.name AS ColumnName,
    t.name AS DataType,
    c.is_nullable AS IsNullable
FROM sys.columns c
INNER JOIN sys.types t
  ON t.user_type_id = c.user_type_id
WHERE c.object_id = OBJECT_ID(N'pf2.SourceBook')
  AND c.name IN (N'SourcePurchaseURL', N'SourcePurchaseID')
ORDER BY c.name;
GO

SELECT
    c.name AS ColumnName,
    t.name AS DataType,
    c.is_nullable AS IsNullable,
    c.is_identity AS IsIdentity
FROM sys.columns c
INNER JOIN sys.types t
  ON t.user_type_id = c.user_type_id
WHERE c.object_id = OBJECT_ID(N'pf2.SourceBookPurchase')
ORDER BY c.column_id;
GO
