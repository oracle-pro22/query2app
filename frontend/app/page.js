"use client";

import { useState } from "react";
import QueryInput from "./components/QueryInput";
import Renderer from "./components/Renderer";

export default function Home() {
  const [result, setResult] = useState(null);

  return (
    <main className="page-shell">
      <section className="hero">
        <h1>Query2App Workspace</h1>
        <p>
          Ask your database in natural workflow style: write SQL, save useful queries, and
          inspect results in an interactive table with search and filters.
        </p>
      </section>

      <section className="workspace">
        <QueryInput setResult={setResult} />
        {result ? (
          <Renderer config={result.ui} data={result.data} />
        ) : (
          <div className="card empty-state">
            Results will appear here after you run a query.
          </div>
        )}
      </section>
    </main>
  );
}
