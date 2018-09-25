const express = require("express")
const knex = require("knex")({
  client: "postgresql",
  connection: {
    host: "postgres-service",
    port: 5432,
    database: "postgres",
    user: "postgres",
  },
  pool: {
    min: 4,
    max: 10
  },
})

const app = express();

app.get("/hello", (req, res) => {
  knex.select("name").from("users")
    .then((rows) => {
      res.send(`Hello from Node! Usernames: ${rows.map(r => r.name).join(', ')}`)
    })
});

module.exports = { app }
