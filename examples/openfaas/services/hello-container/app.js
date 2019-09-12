const request = require("request-promise")
const express = require("express")
const hello = require("hello-npm-package")

const app = express()

const functionEndpoint = process.env.FUNCTION_ENDPOINT

app.get("/hello", (req, res) => {
  // Query the example cloud function and return the response
  request.get(functionEndpoint)
    .then(whoAmI => {
      res.json({ message: hello(whoAmI) })
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
