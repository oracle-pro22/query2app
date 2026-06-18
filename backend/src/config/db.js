const oracledb = require("oracledb");
const fs = require("fs");
const path = require("path");

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

let poolPromise;

function getEnv(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  return "";
}

function requiredEnv(...names) {
  const value = getEnv(...names);
  if (!value) {
    throw new Error(
      `Missing required environment variable. Set one of: ${names.join(", ")}`
    );
  }
  return value;
}

function isWalletDir(candidatePath) {
  if (!candidatePath) return false;
  return fs.existsSync(path.join(candidatePath, "tnsnames.ora"));
}

function autoDetectWalletLocation() {
  const cwd = process.cwd();
  const candidates = [cwd, path.resolve(cwd, ".."), path.resolve(cwd, "../..")];

  for (const baseDir of candidates) {
    if (!fs.existsSync(baseDir)) continue;
    const entries = fs.readdirSync(baseDir, { withFileTypes: true });
    const walletDirEntry = entries.find(
      (entry) => entry.isDirectory() && /^Wallet_/i.test(entry.name)
    );
    if (!walletDirEntry) continue;

    const walletPath = path.join(baseDir, walletDirEntry.name);
    if (isWalletDir(walletPath)) {
      return walletPath;
    }
  }

  return "";
}

function getWalletServiceNames(walletLocation) {
  const tnsPath = path.join(walletLocation, "tnsnames.ora");
  if (!fs.existsSync(tnsPath)) return [];

  const tnsData = fs.readFileSync(tnsPath, "utf8");
  return Array.from(tnsData.matchAll(/^\s*([a-zA-Z0-9_]+)\s*=/gm)).map(
    (match) => match[1]
  );
}

function pickDefaultServiceName(serviceNames) {
  if (!serviceNames.length) return "";
  const preferred = serviceNames.find((name) => /_high$/i.test(name));
  return preferred || serviceNames[0];
}

async function createPool() {
  const user = requiredEnv("OCI_DB_USER", "DB_USER");
  const password = requiredEnv("OCI_DB_PASSWORD", "DB_PASSWORD");
  const walletLocation =
    getEnv("OCI_DB_WALLET_LOCATION", "DB_WALLET_LOCATION") ||
    autoDetectWalletLocation();
  const walletPassword = getEnv("OCI_DB_WALLET_PASSWORD", "DB_WALLET_PASSWORD");
  const connectStringFromEnv = getEnv("OCI_DB_CONNECT_STRING", "DB_CONNECT_STRING");
  const walletServiceNames = walletLocation
    ? getWalletServiceNames(walletLocation)
    : [];
  const connectString =
    connectStringFromEnv || pickDefaultServiceName(walletServiceNames);

  if (!connectString) {
    throw new Error(
      "Missing Oracle connect string. Set OCI_DB_CONNECT_STRING or provide a wallet with tnsnames.ora."
    );
  }

  const poolConfig = {
    user,
    password,
    connectString,
    poolMin: Number(process.env.DB_POOL_MIN || 1),
    poolMax: Number(process.env.DB_POOL_MAX || 4),
    poolIncrement: Number(process.env.DB_POOL_INCREMENT || 1)
  };

  // OCI Autonomous Database with mTLS wallet.
  if (walletLocation) {
    process.env.TNS_ADMIN = walletLocation;
    poolConfig.configDir = walletLocation;
    poolConfig.walletLocation = walletLocation;
    if (walletPassword) {
      poolConfig.walletPassword = walletPassword;
    }
  }

  return oracledb.createPool(poolConfig);
}

async function getPool() {
  if (!poolPromise) {
    poolPromise = createPool();
  }
  return poolPromise;
}

async function closePool() {
  if (!poolPromise) return;
  const pool = await poolPromise;
  await pool.close(10);
  poolPromise = undefined;
}

module.exports = { getPool, closePool, oracledb };
