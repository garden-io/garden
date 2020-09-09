const { homedir } = require("os")
const { resolve } = require("path")

module.exports = {
  type: "better-sqlite3",
  database: resolve(homedir(), ".garden", "db"),
  entities: [
    resolve(__dirname, "build", "src", "db", "entities", "*.js"),
  ],
  cli: {
    entitiesDir: "build/src/db/entities",
    migrationsDir: "src/db/migrations",
  }
}
