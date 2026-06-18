import { useEffect, useMemo, useState } from "react";

export default function QueryInput({ setResult }) {
  const STORAGE_KEY = "query2app.savedQueries";
  const [query, setQuery] = useState("");
  const [savedQueries, setSavedQueries] = useState([]);
  const [selectedSavedId, setSelectedSavedId] = useState("");
  const [saveLabel, setSaveLabel] = useState("");
  const [messages, setMessages] = useState([
    {
      role: "system",
      text:
        "Ask in plain English or SQL. Example: explore all records of the customers table"
    }
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const apiBaseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5000";

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setSavedQueries(parsed);
      }
    } catch (_err) {
      // Ignore malformed local storage values.
    }
  }, []);

  const persistSaved = (nextSaved) => {
    setSavedQueries(nextSaved);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSaved));
  };

  const selectedSaved = useMemo(
    () => savedQueries.find((item) => item.id === selectedSavedId),
    [savedQueries, selectedSavedId]
  );

  const saveCurrentQuery = () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    const label = saveLabel.trim() || `Saved ${new Date().toLocaleString()}`;
    const next = [
      {
        id: `${Date.now()}`,
        label,
        query: trimmed
      },
      ...savedQueries
    ].slice(0, 30);
    persistSaved(next);
    setSaveLabel("");
  };

  const deleteSavedQuery = () => {
    if (!selectedSavedId) return;
    const next = savedQueries.filter((item) => item.id !== selectedSavedId);
    persistSaved(next);
    setSelectedSavedId("");
  };

  const loadSavedQuery = () => {
    if (!selectedSaved) return;
    setQuery(selectedSaved.query);
  };

  const runQuery = async () => {
    setError("");
    setLoading(true);
    setResult(null);
    const cleanQuery = query.trim();
    setMessages((prev) => [...prev, { role: "user", text: cleanQuery }]);

    try {
      const res = await fetch(`${apiBaseUrl}/api/query/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ query: cleanQuery })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Request failed");
      }
      setResult(data);
      setMessages((prev) => [
        ...prev,
        {
          role: "system",
          text: `Done. Returned ${data.data?.length || 0} row(s). Executed SQL: ${data.sql}`
        }
      ]);
    } catch (err) {
      const message = err.message || "Something went wrong";
      setError(message);
      setMessages((prev) => [...prev, { role: "system", text: `Error: ${message}` }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card">
      <div className="chat-stream">
        {messages.map((msg, idx) => (
          <div key={`${msg.role}-${idx}`} className={`bubble ${msg.role}`}>
            {msg.text}
          </div>
        ))}
      </div>

      <div className="composer">
        <textarea
          placeholder="Ask in natural language, e.g. 'explore all records of the customers table'"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="toolbar">
          <button className="primary" onClick={runQuery} disabled={loading || !query.trim()}>
            {loading ? "Running..." : "Send Query"}
          </button>
          <input
            className="inline-input"
            type="text"
            placeholder="Name this query"
            value={saveLabel}
            onChange={(e) => setSaveLabel(e.target.value)}
          />
          <button onClick={saveCurrentQuery} disabled={!query.trim()}>
            Save Query
          </button>
          <select
            value={selectedSavedId}
            onChange={(e) => setSelectedSavedId(e.target.value)}
          >
            <option value="">Saved queries</option>
            {savedQueries.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
          <button onClick={loadSavedQuery} disabled={!selectedSavedId}>
            Load
          </button>
          <button className="danger" onClick={deleteSavedQuery} disabled={!selectedSavedId}>
            Delete
          </button>
        </div>
      </div>

      {error ? <p className="error-text">{error}</p> : null}
    </div>
  );
}
