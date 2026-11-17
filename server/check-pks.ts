import pg from 'pg';

const client = new pg.Client({
  host: 'db.zpenkfrgrosreaketgzr.supabase.co',
  port: 5432,
  user: 'postgres',
  password: '@@tan15082008##',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  const res = await client.query(`
    SELECT
      tc.table_name, 
      kcu.column_name
    FROM 
      information_schema.table_constraints AS tc 
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
    WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema='public'
    ORDER BY tc.table_name, kcu.ordinal_position;
  `);

  const pks: Record<string, string[]> = {};
  for (const r of res.rows) {
    pks[r.table_name] = pks[r.table_name] || [];
    pks[r.table_name].push(r.column_name);
  }

  for (const [table, cols] of Object.entries(pks)) {
    console.log(`${table}: [${cols.join(', ')}]`);
  }
  await client.end();
}

void main();
