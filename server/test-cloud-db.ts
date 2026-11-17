import pg from 'pg';

const passwordsToTry = [
  '@@tan15082008##',
  '[@@tan15082008##]',
  'tan15082008'
];

async function tryConnect(password: string) {
  console.log('Trying with password:', password);
  const client = new pg.Client({
    host: 'db.zpenkfrgrosreaketgzr.supabase.co',
    port: 5432,
    user: 'postgres',
    password: password,
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('SUCCESS! Connected to Supabase PostgreSQL!');
    const res = await client.query('SELECT current_database(), current_user, version()');
    console.log('Result:', res.rows[0]);

    // Check if tables exist
    const tablesRes = await client.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);
    console.log('Tables in public schema:', tablesRes.rows.map(r => r.table_name).join(', '));
    await client.end();
    return true;
  } catch (err: any) {
    console.log('Failed:', err.message);
    try { await client.end(); } catch {}
    return false;
  }
}

async function main() {
  for (const pwd of passwordsToTry) {
    const ok = await tryConnect(pwd);
    if (ok) return;
  }
}

void main();
