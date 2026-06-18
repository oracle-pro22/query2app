const DISALLOWED_TOKENS =
  /\b(insert|update|delete|drop|truncate|alter|create|grant|revoke|merge|commit|rollback|execute|call)\b/i;
const common = require("oci-common");
const generativeAiInference = require("oci-generativeaiinference");

let ociClientCache;

function normalizeText(input) {
  return String(input || "")
    .trim()
    .replace(/\s+/g, " ");
}

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

function extractLimit(text) {
  const limitPatterns = [
    /\b(?:first|top|last)\s+(\d+)\b/i,
    /\b(\d+)\s+(?:rows|records)\b/i
  ];

  for (const pattern of limitPatterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const value = Number(match[1]);
    if (Number.isFinite(value) && value > 0) return value;
  }

  return null;
}

function resolveTableName(requestedName, availableTables) {
  if (!requestedName) return "";
  const upper = requestedName.toUpperCase();
  const exact = availableTables.find((name) => name === upper);
  if (exact) return exact;
  const candidates = [upper, `${upper}S`, upper.replace(/S$/, "")];
  for (const candidate of candidates) {
    const found = availableTables.find((name) => name === candidate);
    if (found) return found;
  }
  return "";
}

function extractRequestedTable(text) {
  const patterns = [
    /\b(?:from|of|in)\s+(?:the\s+)?([a-z][a-z0-9_$#]*)\s+table\b/i,
    /\btable\s+([a-z][a-z0-9_$#]*)\b/i,
    /\bfrom\s+([a-z][a-z0-9_$#]*)\b/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) return match[1];
  }
  return "";
}

function inferIntent(text) {
  const lowered = text.toLowerCase();
  if (/\b(count|how many|number of)\b/.test(lowered)) return "count";
  if (
    /\b(show|list|display|get|fetch|explore|view|see|find)\b/.test(lowered) ||
    /\ball\b/.test(lowered)
  ) {
    return "select_all";
  }
  return "";
}

function toSelectSql(tableName, limit) {
  if (limit) return `SELECT * FROM ${tableName} FETCH FIRST ${limit} ROWS ONLY`;
  return `SELECT * FROM ${tableName}`;
}

function toCountSql(tableName) {
  return `SELECT COUNT(*) AS TOTAL_COUNT FROM ${tableName}`;
}

function buildUnsupportedMessage(availableTables) {
  const examples = availableTables.slice(0, 6).join(", ");
  return `I could not map that to a safe read-only SQL query. Try: "show all records from the customers table" or "count rows in orders table". Available tables include: ${examples}`;
}

function singularize(name) {
  return String(name || "").replace(/S$/i, "");
}

function guessIdColumn(tableName, columnsByTable) {
  const cols = columnsByTable[tableName] || [];
  const singular = singularize(tableName).toUpperCase();
  const preferred = [`${singular}_ID`, `${tableName}_ID`, "ID"];
  for (const candidate of preferred) {
    if (cols.includes(candidate)) return candidate;
  }
  return cols.find((col) => /_ID$/i.test(col)) || "";
}

function findJoinCondition(tableA, tableB, columnsByTable) {
  const aCols = columnsByTable[tableA] || [];
  const bCols = columnsByTable[tableB] || [];
  const aId = guessIdColumn(tableA, columnsByTable);
  const bId = guessIdColumn(tableB, columnsByTable);

  if (aId && bCols.includes(aId)) {
    return `b.${aId} = a.${aId}`;
  }

  if (bId && aCols.includes(bId)) {
    return `a.${bId} = b.${bId}`;
  }

  const common = aCols.find((col) => bCols.includes(col) && /_ID$/i.test(col));
  if (common) {
    return `a.${common} = b.${common}`;
  }

  return "";
}

function extractEntityIdFilter(text) {
  const match = text.match(/\b([a-z][a-z0-9_$#]*)\s+id\s*(?:=|is|equals)\s*(\d+)\b/i);
  if (!match) return null;
  return {
    entity: match[1],
    value: Number(match[2])
  };
}

function extractProjectedNameEntity(text) {
  const match = text.match(/\b([a-z][a-z0-9_$#]*)\s+name\b/i);
  return match ? match[1] : "";
}

function fallbackJoinTranslate(input, schemaContext) {
  const text = normalizeText(input);
  const idFilter = extractEntityIdFilter(text);
  const projectedEntity = extractProjectedNameEntity(text);
  if (!idFilter || !projectedEntity) return null;

  const tables = schemaContext.tables || [];
  const columnsByTable = schemaContext.columnsByTable || {};
  const sourceTable = resolveTableName(idFilter.entity, tables);
  const projectedTable = resolveTableName(projectedEntity, tables);
  if (!sourceTable || !projectedTable || sourceTable === projectedTable) return null;

  const joinCondition = findJoinCondition(projectedTable, sourceTable, columnsByTable);
  if (!joinCondition) return null;

  const sourceIdCol = guessIdColumn(sourceTable, columnsByTable);
  if (!sourceIdCol) return null;
  if (!Number.isFinite(idFilter.value)) return null;

  const projectedNameCol = (columnsByTable[projectedTable] || []).includes("NAME")
    ? "NAME"
    : null;
  if (!projectedNameCol) return null;

  return {
    sql: `SELECT a.${projectedNameCol} FROM ${projectedTable} a JOIN ${sourceTable} b ON ${joinCondition} WHERE b.${sourceIdCol} = ${idFilter.value}`,
    mode: "natural_language_fallback_join"
  };
}

function fallbackTranslate(input, schemaContext) {
  const availableTables = schemaContext.tables || [];
  const joinCandidate = fallbackJoinTranslate(input, schemaContext);
  if (joinCandidate) {
    return joinCandidate;
  }

  const normalized = normalizeText(input);
  const intent = inferIntent(normalized);
  const requestedTable = extractRequestedTable(normalized);
  const tableName = resolveTableName(requestedTable, availableTables);
  const limit = extractLimit(normalized);

  if (!intent || !tableName) {
    throw new Error(buildUnsupportedMessage(availableTables));
  }

  if (intent === "count") {
    return { sql: toCountSql(tableName), mode: "natural_language_fallback" };
  }

  return { sql: toSelectSql(tableName, limit), mode: "natural_language_fallback" };
}

function extractReferencedTables(sql) {
  const matches = Array.from(
    sql.matchAll(/\b(?:from|join)\s+([a-zA-Z][a-zA-Z0-9_$#.]*)\b/gi)
  );
  return matches.map((match) => match[1].split(".").pop().toUpperCase());
}

function validateSqlAgainstSchema(sql, schemaContext) {
  if (!isReadOnlySql(sql)) {
    throw new Error("Generated SQL is not a safe read-only SELECT statement.");
  }

  const available = new Set(schemaContext.tables || []);
  const referenced = extractReferencedTables(sql);

  if (!referenced.length) {
    throw new Error("Generated SQL does not reference any known table.");
  }

  for (const table of referenced) {
    if (!available.has(table)) {
      throw new Error(`Generated SQL referenced unknown table: ${table}`);
    }
  }
}

function buildSchemaPrompt(schemaContext) {
  const lines = [];
  const tables = (schemaContext.tables || []).slice(0, 50);
  for (const table of tables) {
    const cols = (schemaContext.columnsByTable[table] || []).slice(0, 30).join(", ");
    lines.push(`${table}: ${cols}`);
  }
  return lines.join("\n");
}

function extractJsonObject(text) {
  const match = String(text || "").match(/\{[\s\S]*\}/);
  if (!match) return null;
  return JSON.parse(match[0]);
}

async function llmTranslate(input, schemaContext) {
  const compartmentId = process.env.OCI_GENAI_COMPARTMENT_ID;
  const modelId = process.env.OCI_GENAI_MODEL_ID;
  if (!compartmentId || !modelId) {
    throw new Error(
      "OCI Generative AI is not configured. Set OCI_GENAI_COMPARTMENT_ID and OCI_GENAI_MODEL_ID."
    );
  }

  const client = getOciGenAiClient();
  const schemaPrompt = buildSchemaPrompt(schemaContext);
  const systemPrompt = [
    "You convert natural language into safe Oracle SQL.",
    "Return JSON only: {\"sql\":\"...\"}.",
    "Rules:",
    "- Output only one read-only query using SELECT or WITH.",
    "- No semicolon.",
    "- Prefer explicit JOIN when query asks across tables.",
    "- Use only tables and columns provided.",
    "- If request is ambiguous, still return the best safe SQL guess."
  ].join("\n");

  const userPrompt = [
    "Schema:",
    schemaPrompt,
    "",
    `Request: ${input}`
  ].join("\n");

  const response = await client.chat({
    chatDetails: {
      compartmentId,
      servingMode: {
        servingType: "ON_DEMAND",
        modelId
      },
      chatRequest: {
        apiFormat: "COHERE",
        preambleOverride: systemPrompt,
        message: userPrompt,
        temperature: Number(process.env.OCI_GENAI_TEMPERATURE || 0.1),
        maxTokens: Number(process.env.OCI_GENAI_MAX_TOKENS || 300),
        isStream: false
      }
    }
  });

  const outputText = getOciChatText(response);
  const parsed = extractJsonObject(outputText);
  if (!parsed || !parsed.sql) {
    throw new Error("LLM response did not include SQL.");
  }

  return {
    sql: normalizeSql(parsed.sql),
    mode: "natural_language_llm"
  };
}

function getOciAuthProvider() {
  const authMode = String(process.env.OCI_GENAI_AUTH_MODE || "config_file").toLowerCase();

  if (authMode === "resource_principal") {
    return common.ResourcePrincipalAuthenticationDetailsProvider.builder();
  }

  const configPath = process.env.OCI_CONFIG_FILE;
  const profile = process.env.OCI_CONFIG_PROFILE || "DEFAULT";
  return new common.ConfigFileAuthenticationDetailsProvider(configPath, profile);
}

function getOciGenAiClient() {
  if (ociClientCache) return ociClientCache;

  const provider = getOciAuthProvider();
  const client = new generativeAiInference.GenerativeAiInferenceClient({
    authenticationDetailsProvider: provider
  });

  if (process.env.OCI_GENAI_ENDPOINT) {
    client.endpoint = process.env.OCI_GENAI_ENDPOINT;
  } else if (process.env.OCI_GENAI_REGION) {
    client.regionId = process.env.OCI_GENAI_REGION;
  }

  ociClientCache = client;
  return client;
}

function getOciChatText(chatResponse) {
  const apiResponse = chatResponse?.chatResult?.chatResponse;
  if (!apiResponse) {
    throw new Error("OCI Generative AI returned an empty response.");
  }

  if (typeof apiResponse.text === "string" && apiResponse.text.trim()) {
    return apiResponse.text;
  }

  const firstChoice = Array.isArray(apiResponse.choices) ? apiResponse.choices[0] : null;
  const parts = firstChoice?.message?.content;
  if (Array.isArray(parts)) {
    const textPart = parts.find((part) => typeof part?.text === "string");
    if (textPart?.text) {
      return textPart.text;
    }
  }

  throw new Error("Could not read text output from OCI Generative AI response.");
}

async function translateNaturalLanguageToSql(input, schemaContext) {
  const normalizedInput = normalizeText(input);

  try {
    const translated = await llmTranslate(normalizedInput, schemaContext);
    validateSqlAgainstSchema(translated.sql, schemaContext);
    return translated;
  } catch (err) {
    const fallback = fallbackTranslate(normalizedInput, schemaContext);
    validateSqlAgainstSchema(fallback.sql, schemaContext);
    return {
      ...fallback,
      warning: `LLM translation unavailable, used fallback: ${err.message}`
    };
  }
}

module.exports = { translateNaturalLanguageToSql };
