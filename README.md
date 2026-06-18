# Query2App

Query2App lets you submit a read-only SQL query and renders the result as a basic table UI.

## Project Structure

- `backend`: Express API that runs SQL against an OCI-hosted Oracle database.
- `frontend`: Next.js UI for entering SQL and rendering results.

## Prerequisites

- Node.js 18+ (or newer LTS).
- An Oracle database hosted in OCI.
- Database credentials and connect string.

## Backend Setup (OCI Database)

1. Create `backend/.env`:

```env
PORT=5000
OCI_DB_USER=your_db_user
OCI_DB_PASSWORD=your_db_password
OCI_DB_CONNECT_STRING=adb_regionname_high

# Optional for OCI Autonomous Database wallet/mTLS:
# OCI_DB_WALLET_LOCATION=/absolute/path/to/wallet
# OCI_DB_WALLET_PASSWORD=wallet_password

# Optional pool and row limits:
# DB_POOL_MIN=1
# DB_POOL_MAX=4
# DB_POOL_INCREMENT=1
# DB_MAX_ROWS=1000
# DB_TABLE_LIST_LIMIT=200
# DB_SCHEMA_CACHE_MS=300000
#
# Optional for advanced natural-language to SQL using OCI Generative AI:
# OCI_GENAI_COMPARTMENT_ID=ocid1.compartment.oc1..xxxx
# OCI_GENAI_MODEL_ID=cohere.command-r-plus
# OCI_GENAI_REGION=ap-mumbai-1
# OCI_GENAI_ENDPOINT=https://inference.generativeai.ap-mumbai-1.oci.oraclecloud.com
# OCI_GENAI_AUTH_MODE=config_file
# OCI_CONFIG_FILE=~/.oci/config
# OCI_CONFIG_PROFILE=DEFAULT
# OCI_GENAI_TEMPERATURE=0.1
# OCI_GENAI_MAX_TOKENS=300
```

2. Install dependencies and run backend:

```bash
cd backend
npm install
npm run dev
```

3. Health check:

```bash
curl http://localhost:5000/health
```

## Frontend Setup

1. Create `frontend/.env.local`:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:5000
```

2. Install dependencies and run frontend:

```bash
cd frontend
npm install
npm run dev
```

3. Open `http://localhost:3000`.

## Query Rules

- Only single read-only `SELECT`/`WITH` SQL statements are allowed.
- Multi-statement SQL is blocked.
- DDL/DML keywords are blocked for safety.

## Notes for OCI Connectivity

- For Autonomous Database with wallet:
  - Keep wallet files in a secure directory.
  - Set `OCI_DB_WALLET_LOCATION` to that directory, or place `Wallet_*` folder at project root and it will be auto-detected.
  - Use the service name from your `tnsnames.ora` (for example: `yourdb_high`) as `OCI_DB_CONNECT_STRING`.
  - If `OCI_DB_CONNECT_STRING` is omitted and wallet is present, backend auto-selects a service name (`*_high` preferred).
- For TLS-only configurations (no wallet), provide a valid `OCI_DB_CONNECT_STRING` reachable from your runtime environment.

## Quick Table Access Check

- Get visible tables for the connected schema:

```bash
curl http://localhost:5000/api/query/tables
```
