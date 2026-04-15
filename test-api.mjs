import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL);

const rows = await sql`SELECT * FROM holdings`;
console.log("Holdings from DB:", JSON.stringify(rows, null, 2));

await sql.end();
