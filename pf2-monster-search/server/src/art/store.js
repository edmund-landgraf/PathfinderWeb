// SQL for pf2.ArtUpload (audit + review queue) and for reading/writing art on both targets.
export const TARGETS = {
  monster: { exists: 'SELECT 1 AS ok FROM pf2.Monster WHERE MonsterId = @id' },
  'user-monster': { exists: 'SELECT 1 AS ok FROM pf2.UserMonster WHERE UserMonsterId = @id' }
};

export const SCHEMA_SQL = `
IF OBJECT_ID(N'pf2.ArtUpload', N'U') IS NULL
BEGIN
  CREATE TABLE pf2.ArtUpload (
    ArtUploadId int IDENTITY(1,1) NOT NULL CONSTRAINT PK_ArtUpload PRIMARY KEY,
    TargetType nvarchar(20) NOT NULL,
    TargetId int NOT NULL,
    Action nvarchar(10) NOT NULL CONSTRAINT DF_ArtUpload_Action DEFAULT N'upload',
    NewSha256 char(64) NULL,
    NewContentType nvarchar(100) NULL,
    NewBytes int NULL,
    NewWidth int NULL,
    NewHeight int NULL,
    PrevRowExisted bit NOT NULL CONSTRAINT DF_ArtUpload_PrevRow DEFAULT 0,
    PrevImage varbinary(max) NULL,
    PrevThumbnail varbinary(max) NULL,
    PrevContentType nvarchar(100) NULL,
    Role nvarchar(10) NOT NULL,
    PasswordVersion nvarchar(20) NULL,
    PartnerLabel nvarchar(50) NULL,
    Ip nvarchar(64) NULL,
    UserAgent nvarchar(300) NULL,
    Status nvarchar(20) NOT NULL,
    CreatedAt datetime2(3) NOT NULL CONSTRAINT DF_ArtUpload_CreatedAt DEFAULT SYSUTCDATETIME(),
    ReviewedAt datetime2(3) NULL,
    ReviewNote nvarchar(200) NULL,
    CONSTRAINT CK_ArtUpload_TargetType CHECK (TargetType IN (N'monster', N'user-monster')),
    CONSTRAINT CK_ArtUpload_Role CHECK (Role IN (N'art', N'admin')),
    CONSTRAINT CK_ArtUpload_Action CHECK (Action IN (N'upload', N'remove')),
    CONSTRAINT CK_ArtUpload_Status CHECK (Status IN (N'pending', N'approved', N'auto_approved', N'rejected', N'rolled_back'))
  );
  CREATE INDEX IX_ArtUpload_Status ON pf2.ArtUpload (Status, CreatedAt);
  CREATE INDEX IX_ArtUpload_Version ON pf2.ArtUpload (PasswordVersion, CreatedAt);
  CREATE INDEX IX_ArtUpload_Target ON pf2.ArtUpload (TargetType, TargetId, ArtUploadId);
END;`;

export async function readCurrentArt(request, type, id) {
  request.input('id', id);
  if (type === 'monster') {
    const r = await request.query(`
      SELECT MonsterImage AS Image, MonsterThumbnail AS Thumb, CAST(NULL AS nvarchar(100)) AS ContentType
      FROM pf2.MonsterImage WITH (UPDLOCK, HOLDLOCK) WHERE MonsterID = @id;`);
    const row = r.recordset?.[0];
    return { rowExists: Boolean(row), image: row?.Image || null, thumb: row?.Thumb || null, contentType: null };
  }
  const r = await request.query(`
    SELECT Image, ImageContentType AS ContentType
    FROM pf2.UserMonster WITH (UPDLOCK, HOLDLOCK) WHERE UserMonsterId = @id;`);
  const row = r.recordset?.[0];
  return { rowExists: Boolean(row), image: row?.Image || null, thumb: null, contentType: row?.ContentType || null };
}

export async function writeArt(request, sql, type, id, { image, thumb, contentType, rowExists, deleteRow }) {
  request.input('id', sql.Int, id)
    .input('image', sql.VarBinary(sql.MAX), image)
    .input('thumb', sql.VarBinary(sql.MAX), thumb ?? image)
    .input('ct', sql.NVarChar(100), contentType);
  if (type === 'monster') {
    if (deleteRow) return request.query('DELETE FROM pf2.MonsterImage WHERE MonsterID = @id;');
    if (rowExists) return request.query('UPDATE pf2.MonsterImage SET MonsterImage = @image, MonsterThumbnail = @thumb WHERE MonsterID = @id;');
    return request.query('INSERT INTO pf2.MonsterImage (MonsterID, MonsterImage, MonsterThumbnail) VALUES (@id, @image, @thumb);');
  }
  return request.query(`UPDATE pf2.UserMonster SET Image = @image, ImageContentType = @ct, UpdatedAt = SYSUTCDATETIME() WHERE UserMonsterId = @id;`);
}

export const LIST_COLUMNS = `ArtUploadId, TargetType, TargetId, Action, NewSha256, NewContentType, NewBytes, NewWidth, NewHeight,
  PrevRowExisted, CAST(CASE WHEN PrevImage IS NULL THEN 0 ELSE 1 END AS bit) AS HadPreviousArt, PrevContentType,
  Role, PasswordVersion, PartnerLabel, Ip, UserAgent, Status, CreatedAt, ReviewedAt, ReviewNote`;
