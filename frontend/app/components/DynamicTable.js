import { useMemo, useState } from "react";

function stringify(value) {
  if (value === null || value === undefined) return "";
  return String(value);
}

export default function DynamicTable({ columns, data }) {
  const [globalSearch, setGlobalSearch] = useState("");
  const [columnFilters, setColumnFilters] = useState({});

  const filteredRows = useMemo(() => {
    const globalNeedle = globalSearch.trim().toLowerCase();

    return data.filter((row) => {
      if (globalNeedle) {
        const hit = columns.some((col) =>
          stringify(row[col.field]).toLowerCase().includes(globalNeedle)
        );
        if (!hit) return false;
      }

      for (const col of columns) {
        const filterValue = stringify(columnFilters[col.field]).trim().toLowerCase();
        if (!filterValue) continue;
        if (!stringify(row[col.field]).toLowerCase().includes(filterValue)) {
          return false;
        }
      }

      return true;
    });
  }, [columnFilters, columns, data, globalSearch]);

  const clearFilters = () => {
    setGlobalSearch("");
    setColumnFilters({});
  };

  if (!data.length) {
    return <div className="empty-state">No rows returned for this query.</div>;
  }

  return (
    <div>
      <div className="table-header">
        <strong>
          Showing {filteredRows.length} of {data.length} row(s)
        </strong>
        <div className="table-tools">
          <input
            type="text"
            placeholder="Search all columns..."
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
          />
          <button onClick={clearFilters}>Clear Filters</button>
        </div>
      </div>

      <div className="table-shell">
        <table>
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.field}>{col.label}</th>
              ))}
            </tr>
            <tr className="filter-row">
              {columns.map((col) => (
                <th key={`filter-${col.field}`}>
                  <input
                    type="text"
                    placeholder={`Filter ${col.label}`}
                    value={columnFilters[col.field] || ""}
                    onChange={(e) =>
                      setColumnFilters((prev) => ({
                        ...prev,
                        [col.field]: e.target.value
                      }))
                    }
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row, i) => (
              <tr key={i}>
                {columns.map((col) => (
                  <td key={col.field}>{stringify(row[col.field]) || "-"}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
