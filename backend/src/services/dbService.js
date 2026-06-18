const { getPool } = require("../config/db");
let schemaCache = { expiresAt: 0, value: null };

async function executeQuery(sql) {
  const pool = await getPool();
  const connection = await pool.getConnection();

  try {
    const result = await connection.execute(sql, [], {
      extendedMetaData: true,
      maxRows: Number(process.env.DB_MAX_ROWS || 1000)
    });

    return {
      rows: result.rows || [],
      fields: (result.metaData || []).map((field) => ({
        name: field.name,
        dataTypeName: field.dbTypeName || String(field.dbType)
      }))
    };
  } finally {
    await connection.close();
  }
}

async function listTables() {
  const pool = await getPool();
  const connection = await pool.getConnection();

  try {
    const limit = Number(process.env.DB_TABLE_LIST_LIMIT || 200);
    const result = await connection.execute(
      `
      SELECT table_name
      FROM (
        SELECT table_name
        FROM user_tables
        ORDER BY table_name
      )
      WHERE ROWNUM <= :limit
      `,
      { limit }
    );

    return (result.rows || []).map((row) => row.TABLE_NAME);
  } finally {
    await connection.close();
  }
}

async function getSchemaContext() {
  const now = Date.now();
  const ttlMs = Number(process.env.DB_SCHEMA_CACHE_MS || 300000);
  if (schemaCache.value && schemaCache.expiresAt > now) {
    return schemaCache.value;
  }

  const pool = await getPool();
  const connection = await pool.getConnection();

  try {
    const tableLimit = Number(process.env.DB_TABLE_LIST_LIMIT || 200);
    const rows = await connection.execute(
      `
      SELECT c.table_name, c.column_name
      FROM user_tab_columns c
      WHERE c.table_name IN (
        SELECT table_name
        FROM (
          SELECT table_name
          FROM user_tables
          ORDER BY table_name
        )
        WHERE ROWNUM <= :tableLimit
      )
      ORDER BY c.table_name, c.column_id
      `,
      { tableLimit }
    );

    const columnsByTable = {};
    for (const row of rows.rows || []) {
      const tableName = row.TABLE_NAME;
      const columnName = row.COLUMN_NAME;
      if (!columnsByTable[tableName]) {
        columnsByTable[tableName] = [];
      }
      columnsByTable[tableName].push(columnName);
    }

    const context = {
      tables: Object.keys(columnsByTable).sort(),
      columnsByTable
    };

    schemaCache = {
      value: context,
      expiresAt: now + ttlMs
    };

    return context;
  } finally {
    await connection.close();
  }
}

module.exports = { executeQuery, listTables, getSchemaContext };
