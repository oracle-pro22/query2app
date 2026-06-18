function mapType(typeName) {
  const normalized = String(typeName || "").toUpperCase();

  if (
    normalized.includes("NUMBER") ||
    normalized.includes("FLOAT") ||
    normalized.includes("BINARY_FLOAT") ||
    normalized.includes("BINARY_DOUBLE")
  ) {
    return "number";
  }

  if (normalized.includes("DATE") || normalized.includes("TIMESTAMP")) {
    return "date";
  }

  return "text";
}

function generateTemplate(result) {
  const columns = result.fields.map((f) => ({
    field: f.name,
    label: f.name.toUpperCase(),
    type: mapType(f.dataTypeName)
  }));

  return {
    pageTitle: "Generated App",
    type: "table",
    columns,
    searchableFields: columns
      .filter((c) => c.type === "text")
      .map((c) => c.field),
    pagination: true
  };
}

module.exports = { generateTemplate };
