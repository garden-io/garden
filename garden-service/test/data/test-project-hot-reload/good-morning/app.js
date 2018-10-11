const express = require("express")

const app = express()

app.get("/morning", (req, res) => {
  res.json({message: "Good morning!"})
})

// This is the path GAE uses for health checks
app.get("/_ah/health", (req, res) => {
  res.sendStatus(200)
})

module.exports = { app }
