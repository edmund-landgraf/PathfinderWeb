USE PathfinderUtil;
GO

SET NOCOUNT ON;
GO

IF COL_LENGTH(N'pf2.UserMonster', N'AonUrl') IS NULL
BEGIN
    ALTER TABLE pf2.UserMonster ADD AonUrl nvarchar(2048) NULL;
END
GO

DECLARE @title nvarchar(500) = N'The Shattered Veil';
DECLARE @url nvarchar(1000) = N'https://www.pathfinderinfinite.com/en/product/578008/the-shattered-veil';
DECLARE @purchaseId int;
DECLARE @sourceBookId int;

SELECT @purchaseId = SourceBookPurchaseId
FROM pf2.SourceBookPurchase
WHERE StoreUrl = @url;

IF @purchaseId IS NULL
BEGIN
    INSERT INTO pf2.SourceBookPurchase (Name, StoreUrl, LongDescription, Price)
    VALUES (@title, @url, N'Pathfinder Infinite product.', NULL);

    SET @purchaseId = SCOPE_IDENTITY();
END
ELSE
BEGIN
    UPDATE pf2.SourceBookPurchase
    SET Name = @title
    WHERE SourceBookPurchaseId = @purchaseId;
END

SELECT @sourceBookId = SourceBookId
FROM pf2.SourceBook
WHERE Name = @title;

IF @sourceBookId IS NULL
BEGIN
    INSERT INTO pf2.SourceBook (Name, SourcePurchaseID)
    VALUES (@title, @purchaseId);
END
ELSE
BEGIN
    UPDATE pf2.SourceBook
    SET SourcePurchaseID = @purchaseId
    WHERE SourceBookId = @sourceBookId;
END

UPDATE pf2.UserMonster
SET
    SourceBook = @title,
    AonUrl = NULL,
    UpdatedAt = SYSUTCDATETIME()
WHERE Name IN (
    N'Thornwick Echo',
    N'Coalesced Echo',
    N'Threshold-Resonant Echo',
    N'Iron Automaton'
);

SELECT UserMonsterId, Name, SourceBook, AonUrl
FROM pf2.UserMonster
ORDER BY UserMonsterId;

SELECT sb.SourceBookId, sb.Name, sbp.StoreUrl
FROM pf2.SourceBook sb
INNER JOIN pf2.SourceBookPurchase sbp
  ON sbp.SourceBookPurchaseId = sb.SourcePurchaseID
WHERE sb.Name = @title;
GO
