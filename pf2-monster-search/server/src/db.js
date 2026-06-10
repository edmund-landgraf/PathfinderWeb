import sql from 'mssql/msnodesqlv8.js';
import dotenv from 'dotenv';

dotenv.config();

const trusted =
  String(process.env.SQL_TRUSTED_CONNECTION || '').toLowerCase() === 'true';

let config;

if (trusted) {
  config = {
    connectionString:
      `Driver={ODBC Driver 17 for SQL Server};` +
      `Server=${process.env.SQL_SERVER || 'localhost'};` +
      `Database=${process.env.SQL_DATABASE || 'PathfinderUtil'};` +
      `Trusted_Connection=Yes;` +
      `TrustServerCertificate=Yes;`,

    driver: 'msnodesqlv8',

    options: {
      trustedConnection: true,
      trustServerCertificate: true
    },

    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000
    }
  };
}
else {
  config = {
    server: process.env.SQL_SERVER || 'localhost',
    database: process.env.SQL_DATABASE || 'PathfinderUtil',
    port: Number(process.env.SQL_PORT || 1433),

    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,

    options: {
      encrypt:
        String(process.env.SQL_ENCRYPT || '').toLowerCase() === 'true',

      trustServerCertificate:
        String(process.env.SQL_TRUST_SERVER_CERTIFICATE || 'true').toLowerCase() ===
        'true'
    },

    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000
    }
  };
}

let poolPromise;

export async function getPool() {
  if (!poolPromise) {
    console.log('Connecting to SQL Server...');
    console.log(
      trusted
        ? 'Authentication: Windows Integrated Security'
        : `Authentication: SQL Login (${process.env.SQL_USER})`
    );

    poolPromise = sql.connect(config);
  }

  return poolPromise;
}

export { sql };