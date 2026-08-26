-- Staging table for Archives of Nethys Sources.aspx scrape.
-- Run in SSMS or: sqlcmd -S localhost -d PathfinderUtil -E -i create_source_book_aon.sql

USE PathfinderUtil;
GO

SET NOCOUNT ON;
GO

IF OBJECT_ID(N'pf2.SourceBookAoN', N'U') IS NULL
BEGIN
    CREATE TABLE pf2.SourceBookAoN
    (
        AonSourceId    INT            NOT NULL,
        Name           NVARCHAR(500)  NOT NULL,
        ProductPageUrl NVARCHAR(1000) NULL,
        ReleaseDate    DATE           NULL,
        ProductLine    NVARCHAR(200)  NULL,
        CONSTRAINT PK_SourceBookAoN PRIMARY KEY CLUSTERED (AonSourceId)
    );
END
GO

SELECT
    c.name AS ColumnName,
    t.name AS DataType,
    c.is_nullable AS IsNullable
FROM sys.columns c
INNER JOIN sys.types t
  ON t.user_type_id = c.user_type_id
WHERE c.object_id = OBJECT_ID(N'pf2.SourceBookAoN')
ORDER BY c.column_id;
GO
