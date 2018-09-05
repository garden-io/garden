const express = require("express")

const app = express()

app.get("/evening", (req, res) => {
  res.json({message: "Good evening!"})
})

// This is the path GAE uses for health checks
app.get("/_ah/health", (req, res) => {
  res.sendStatus(200)
})

module.exports = { app }
