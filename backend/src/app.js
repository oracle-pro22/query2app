require("dotenv").config();
const express = require("express");
const cors = require("cors");
const queryRoutes = require("./routes/queryRoutes");
const { getPool, closePool } = require("./config/db");

const app = express();
const port = Number(process.env.PORT || 5000);

app.use(cors());
app.use(express.json());

app.get("/health", async (_req, res) => {
  try {
    const pool = await getPool();
    const connection = await pool.getConnection();
    await connection.execute("SELECT 1 FROM dual");
    await connection.close();
    res.json({ status: "ok", database: "reachable" });
  } catch (error) {
    res.status(500).json({
      status: "error",
      database: "unreachable",
      message: error.message
    });
  }
});

app.use("/api/query", queryRoutes);

const server = app.listen(port, () => {
  console.log(`Backend running on port ${port}`);
});

async function shutdown() {
  server.close(async () => {
    await closePool();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
