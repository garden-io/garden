const request = require("request-promise")
const express = require("express")

const app = express()

const functionEndpoint = process.env.GARDEN_SERVICES_HELLO_FUNCTION_ENDPOINT

app.get("/hello", (req, res) => {
  // Query the example cloud function and return the response
  request.get(functionEndpoint)
    .then(message => {
      res.json({ message })
    })
    .catch(() => {
      res.statusCode = 500
      res.json({ error: "Unable to reach function at " + functionEndpoint })
    })
})

// This is the path GAE uses for health checks
app.get("/_ah/health", (req, res) => {
  res.sendStatus(200)
})

module.exports = { app }
