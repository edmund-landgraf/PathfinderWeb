import dotenv from 'dotenv';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config({
  path: join(dirname(fileURLToPath(import.meta.url)), '../.env')
});

const trusted =
  String(process.env.SQL_TRUSTED_CONNECTION || '').toLowerCase() === 'true' ||
  (
    process.platform === 'win32' &&
    !String(process.env.SQL_USER || '').trim() &&
    String(process.env.SQL_TRUSTED_CONNECTION || '').toLowerCase() !== 'false'
  );

const { default: sql } = trusted
  ? await import('mssql/msnodesqlv8.js')
  : await import('mssql');

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

    requestTimeout: Number(process.env.SQL_REQUEST_TIMEOUT_MS || 120000),

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
} else {
  config = {
    server: process.env.SQL_SERVER || 'localhost',
    database: process.env.SQL_DATABASE || 'PathfinderUtil',
    port: Number(process.env.SQL_PORT || 1433),

    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,

    requestTimeout: Number(process.env.SQL_REQUEST_TIMEOUT_MS || 120000),

    options: {
      encrypt:
        String(process.env.SQL_ENCRYPT || 'false').toLowerCase() === 'true',

      trustServerCertificate:
        String(
          process.env.SQL_TRUST_SERVER_CERTIFICATE || 'true'
        ).toLowerCase() === 'true',

      enableArithAbort: true
    },

    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000,

      // Required by current Tarn versions
      createRetryIntervalMillis: 200
    }
  };
}

let poolPromise = null;

export async function getPool() {
  if (!poolPromise) {
    console.log('=======================================');
    console.log('Connecting to SQL Server...');
    console.log(
      trusted
        ? 'Authentication: Windows Integrated Security'
        : `Authentication: SQL Login (${process.env.SQL_USER})`
    );
    console.log(
      `Server: ${config.server || process.env.SQL_SERVER}`
    );
    console.log(
      `Database: ${config.database || process.env.SQL_DATABASE}`
    );
    console.log('=======================================');

    poolPromise = sql.connect(config).catch((err) => {
      poolPromise = null;
      console.error(err);
      throw err;
    });
  }

  return poolPromise;
}

export { sql };