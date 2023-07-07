const express = require("express")
const app = express()

// Unless configured otherwise, the hostname is simply the service name
const goServiceEndpoint = `http://go-service/`

app.get("/hello", (req, res) => res.send("Hello from Node service!"))

app.get("/call-go-service", (req, res) => {
  // Query the go-service and return the response
  fetch(goServiceEndpoint)
    .then((response) => response.text())
    .then((message) => {
      message = `Go says: '${message}'`
      res.json({
        message,
      })
    })
    .catch((err) => {
      res.statusCode = 500
      res.json({
        error: err,
        message: "Unable to reach service at " + goServiceEndpoint,
      })
    })
})

module.exports = { app }
