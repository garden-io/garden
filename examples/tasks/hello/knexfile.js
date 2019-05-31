module.exports = {
  development: {
    client: "postgresql",
    connection: {
      host: "postgres",
      port: 5432,
      database: "postgres",
      user: "postgres",
    },
    pool: {
      min: 4,
      max: 30
    },
    migrations: {
      tableName: "knex_migrations"
    }
  }
}
