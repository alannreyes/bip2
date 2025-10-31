const { Client } = require('pg');

const client = new Client({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'postgres',
  database: 'catalog_sync',
});

async function registerCollection() {
  try {
    await client.connect();
    console.log('Connected to PostgreSQL');

    // Insert the collection
    const result = await client.query(
      `INSERT INTO qdrant_collections
       (name, "vectorSize", distance, "datasourceId", "totalPoints", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       ON CONFLICT (name) DO UPDATE
       SET "totalPoints" = $5, "updatedAt" = NOW()
       RETURNING *`,
      ['catalogo_efc_200k', 3072, 'Cosine', 'b2cd714c-b3ea-4eed-80ff-2454c89d9d50', 9501]
    );

    console.log('Collection registered:', result.rows[0]);

    await client.end();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

registerCollection();
