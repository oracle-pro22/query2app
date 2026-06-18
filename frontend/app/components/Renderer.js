import DynamicTable from "./DynamicTable";

export default function Renderer({ config, data }) {
  if (config.type === "table") {
    return (
      <div className="card">
        <DynamicTable columns={config.columns} data={data} />
      </div>
    );
  }

  return <div className="empty-state">Unsupported renderer type: {config.type}</div>;
}
