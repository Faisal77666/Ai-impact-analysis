const axios = require('axios');
require('dotenv').config();

const BASE = process.env.OPENMETADATA_BASE_URL;
const TOKEN = process.env.OPENMETADATA_TOKEN;
const ADMIN_EMAIL = process.env.OPENMETADATA_ADMIN_EMAIL || 'admin@open-metadata.org';
const ADMIN_PASSWORD = process.env.OPENMETADATA_ADMIN_PASSWORD || 'admin';

const client = axios.create({
  baseURL: BASE,
  headers: {
    'Content-Type': 'application/json'
  }
});

const log = (msg) => console.log(`[ingest] ${msg}`);

async function getAuthHeaders() {
  if (TOKEN) {
    return { Authorization: `Bearer ${TOKEN}` };
  }

  const encodedPassword = Buffer.from(ADMIN_PASSWORD).toString('base64');
  const loginRes = await client.post('/api/v1/users/login', {
    email: ADMIN_EMAIL,
    password: encodedPassword
  });

  if (!loginRes.data?.accessToken) {
    throw new Error('Login succeeded but no access token was returned by OpenMetadata.');
  }

  log(`Authenticated as ${ADMIN_EMAIL} using login JWT.`);
  return { Authorization: `Bearer ${loginRes.data.accessToken}` };
}

async function upsertDatabaseService(headers, name) {
  try {
    const existing = await client.get(`/api/v1/services/databaseServices/name/${name}`, { headers });
    return existing.data.fullyQualifiedName;
  } catch (error) {
    if (error.response?.status !== 404) {
      throw error;
    }
  }

  await client.post('/api/v1/services/databaseServices', {
    name,
    serviceType: 'CustomDatabase'
  }, { headers });

  const created = await client.get(`/api/v1/services/databaseServices/name/${name}`, { headers });
  return created.data.fullyQualifiedName;
}

async function upsertDatabase(headers, serviceFqn, databaseName) {
  const databaseFqn = `${serviceFqn}.${databaseName}`;

  try {
    await client.get(`/api/v1/databases/name/${databaseFqn}`, { headers });
    return databaseFqn;
  } catch (error) {
    if (error.response?.status !== 404) {
      throw error;
    }
  }

  await client.post('/api/v1/databases', {
    name: databaseName,
    service: serviceFqn
  }, { headers });

  return databaseFqn;
}

async function upsertSchema(headers, databaseFqn, schemaName) {
  const schemaFqn = `${databaseFqn}.${schemaName}`;

  try {
    await client.get(`/api/v1/databaseSchemas/name/${schemaFqn}`, { headers });
    return schemaFqn;
  } catch (error) {
    if (error.response?.status !== 404) {
      throw error;
    }
  }

  await client.post('/api/v1/databaseSchemas', {
    name: schemaName,
    database: databaseFqn
  }, { headers });

  return schemaFqn;
}

async function ingest() {
  try {
    const headers = await getAuthHeaders();

    // 1. Ensure service/database/schemas exist
    log('Step 1: Ensuring service, database, and schemas...');
    const svcFqn = await upsertDatabaseService(headers, 'impact-demo-warehouse');
    const databaseFqn = await upsertDatabase(headers, svcFqn, 'warehouse');
    const rawSchemaFqn = await upsertSchema(headers, databaseFqn, 'raw');
    const curatedSchemaFqn = await upsertSchema(headers, databaseFqn, 'curated');
    const martsSchemaFqn = await upsertSchema(headers, databaseFqn, 'marts');
    const opsSchemaFqn = await upsertSchema(headers, databaseFqn, 'ops');
    log(`✅ Service/database ready: ${svcFqn} / ${databaseFqn}`);

    // 2. Create Tables with correct dataLength
    const tables = [
      {
        name: 'raw_orders',
        databaseSchema: rawSchemaFqn,
        columns: [
          { name: 'order_id',   dataType: 'UUID',      constraint: 'PRIMARY_KEY' },
          { name: 'user_id',    dataType: 'UUID' },
          { name: 'amount',     dataType: 'DECIMAL' },
          { name: 'status',     dataType: 'VARCHAR',   dataLength: 50 },
          { name: 'created_at', dataType: 'TIMESTAMP' }
        ],
        description: 'Raw orders ingested from production database'
      },
      {
        name: 'orders_cleaned',
        databaseSchema: curatedSchemaFqn,
        columns: [
          { name: 'order_id',   dataType: 'UUID',    constraint: 'PRIMARY_KEY' },
          { name: 'user_id',    dataType: 'UUID' },
          { name: 'amount_usd', dataType: 'DECIMAL' },
          { name: 'status',     dataType: 'VARCHAR', dataLength: 50 },
          { name: 'created_at', dataType: 'TIMESTAMP' }
        ],
        description: 'Cleaned and validated orders data'
      },
      {
        name: 'orders_summary',
        databaseSchema: martsSchemaFqn,
        columns: [
          { name: 'date',          dataType: 'DATE' },
          { name: 'total_orders',  dataType: 'INT' },
          { name: 'total_revenue', dataType: 'DECIMAL' }
        ],
        description: 'Daily orders summary for finance reporting'
      },
      {
        name: 'user_profiles',
        databaseSchema: rawSchemaFqn,
        columns: [
          { name: 'user_id',    dataType: 'UUID',    constraint: 'PRIMARY_KEY' },
          { name: 'email',      dataType: 'VARCHAR', dataLength: 255 },
          { name: 'full_name',  dataType: 'VARCHAR', dataLength: 100 },
          { name: 'created_at', dataType: 'TIMESTAMP' }
        ],
        description: 'Core user profile data'
      },
      {
        name: 'sales_metrics',
        databaseSchema: martsSchemaFqn,
        columns: [
          { name: 'metric_date',   dataType: 'DATE' },
          { name: 'revenue',       dataType: 'DECIMAL' },
          { name: 'order_count',   dataType: 'INT' },
          { name: 'avg_order_val', dataType: 'DECIMAL' }
        ],
        description: 'Aggregated sales metrics mart'
      },
      {
        name: 'temp_logs_table',
        databaseSchema: opsSchemaFqn,
        columns: [
          { name: 'event_id',   dataType: 'UUID',      constraint: 'PRIMARY_KEY' },
          { name: 'source_app', dataType: 'VARCHAR',   dataLength: 80 },
          { name: 'severity',   dataType: 'VARCHAR',   dataLength: 20 },
          { name: 'message',    dataType: 'VARCHAR',   dataLength: 500 },
          { name: 'created_at', dataType: 'TIMESTAMP' }
        ],
        description: 'Operational transient logs table used for low-risk demo scenarios'
      }
    ];

    log('Step 2: Creating tables...');
    const tableIds = {};
    for (const table of tables) {
      const res = await client.post('/api/v1/tables', table, { headers })
        .catch(async e => {
          if (e.response?.status === 409) {
            log(`Table ${table.name} already exists, fetching ID...`);
            const existing = await client.get(
              `/api/v1/tables/name/${table.databaseSchema}.${table.name}`,
              { headers }
            );
            return existing;
          }
          throw e;
        });

      tableIds[table.name] = res.data.id;
      log(`✅ Table: ${table.name} (${res.data.id})`);
    }

    // 3. Create Lineage
    log('Step 3: Creating lineage edges...');
    const edges = [
      { from: 'raw_orders',     to: 'orders_cleaned' },
      { from: 'orders_cleaned', to: 'orders_summary'  },
      { from: 'orders_cleaned', to: 'sales_metrics'   },
      { from: 'orders_summary', to: 'sales_metrics'   },
      { from: 'user_profiles',  to: 'orders_cleaned'  }
    ];

    let edgeCount = 0;
    for (const edge of edges) {
      await client.put('/api/v1/lineage', {
        edge: {
          fromEntity: { id: tableIds[edge.from], type: 'table' },
          toEntity:   { id: tableIds[edge.to],   type: 'table' }
        }
      }, { headers }).catch(e => {
        log(`⚠️ Lineage ${edge.from}→${edge.to}: ${e.response?.data?.message || e.message}`);
      });
      log(`✅ Lineage: ${edge.from} → ${edge.to}`);
      edgeCount++;
    }

    // 4. Verify
    const verify = await client.get('/api/v1/tables?limit=100', { headers });
    const createdNames = new Set(tables.map(table => table.name));
    const visibleDemoTables = (verify.data.data || []).filter(t => createdNames.has(t.name));

    log('');
    log('🎉 INGESTION COMPLETE!');
    log(`📊 Demo tables visible in OpenMetadata: ${visibleDemoTables.length}/${tables.length}`);
    log(`📋 Visible demo tables: ${visibleDemoTables.map(t => t.name).sort().join(', ')}`);
    log(`🔗 Lineage edges created: ${edgeCount}`);
    log('🌐 Verify at: http://localhost:8585');

  } catch (error) {
    console.error('❌ Ingestion failed:', error.response?.data || error.message);
    process.exit(1);
  }
}

ingest();
