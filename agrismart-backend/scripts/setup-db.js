const { getConfig, readSql, requireMysql } = require('./mysql');

async function main() {
  const mysql = requireMysql();
  const connection = await mysql.createConnection(getConfig({ includeDatabase: false }));

  await connection.query(readSql('database/schema.mysql.sql'));
  await connection.query(readSql('database/seed.mysql.sql'));
  await connection.end();

  console.log('AgriSmart database schema and seed data are ready.');
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
