const express = require("express")
const fs = require("fs")
const app = express()

const rawdata = fs.readFileSync("./config/config.json")
const config = JSON.parse(rawdata)

const backendServiceEndpoint = `http://backend/hello-backend`

app.get("/hello-frontend", (req, res) => res.send(`Config says: ${config.sharedConfigMessage}`))

app.get("/call-backend", (req, res) => {
  // Query the backend and return the response
  fetch(backendServiceEndpoint)
    .then((response) => response.text())
    .then((response) => {
      message = `Backend says: '${response}'`
      res.json({
        message,
      })
    })
    .catch((err) => {
      res.statusCode = 500
      res.json({
        error: err,
        message: "Unable to reach service at " + backendServiceEndpoint,
      })
    })
})

module.exports = { app }
