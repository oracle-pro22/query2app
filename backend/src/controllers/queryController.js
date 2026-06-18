const { executeQuery, listTables, getSchemaContext } = require("../services/dbService");
const { generateTemplate } = require("../services/uiTemplateService");
const { translateNaturalLanguageToSql } = require("../services/nlQueryService");

const DISALLOWED_TOKENS =
  /\b(insert|update|delete|drop|truncate|alter|create|grant|revoke|merge|commit|rollback|execute|call)\b/i;

function normalizeSql(input) {
  return String(input || "").trim().replace(/;$/, "");
}

function isReadOnlySql(sql) {
  if (!sql) return false;
  if (sql.includes(";")) return false;
  if (!/^(select|with)\b/i.test(sql)) return false;
  if (DISALLOWED_TOKENS.test(sql)) return false;
  return true;
}

async function runQuery(req, res) {
  try {
    const input = String(req.body?.query || "").trim();
    if (!input) {
      return res.status(400).json({ error: "Please enter a query or natural language request." });
    }

    let sql = normalizeSql(input);
    let mode = "sql";
    let translationWarning = "";

    if (!isReadOnlySql(sql)) {
      const schemaContext = await getSchemaContext();
      const translated = await translateNaturalLanguageToSql(input, schemaContext);
      sql = normalizeSql(translated.sql);
      mode = translated.mode;
      translationWarning = translated.warning || "";
    }

    if (!isReadOnlySql(sql)) {
      return res.status(400).json({
        error:
          "Only single read-only SELECT/CTE statements are allowed (or supported natural-language read requests)."
      });
    }

    const result = await executeQuery(sql);
    const template = generateTemplate(result);

    res.json({
      data: result.rows,
      ui: template,
      sql,
      mode,
      warning: translationWarning || undefined
    });
  } catch (err) {
    res.status(500).json({
      error: err.message || "Failed to execute query"
    });
  }
}

async function getTables(_req, res) {
  try {
    const tables = await listTables();
    res.json({ tables });
  } catch (err) {
    res.status(500).json({
      error: err.message || "Failed to read tables"
    });
  }
}

module.exports = { runQuery, getTables };
