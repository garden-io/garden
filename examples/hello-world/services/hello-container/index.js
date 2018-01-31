const express = require("express")
const request = require("request-promise")

const app = express()

app.get("/hello", (req, res) => {
  // Query the example cloud function and return the response
  request.get(process.env.GARDEN_SERVICES_HELLO_FUNCTION_ENDPOINT)
    .then(response => {
      res.send(response)
    })
})

app.get("/healthz", (req, res) => {
  res.sendStatus(200)
})

app.listen(3000, "0.0.0.0", () => console.log("App started"))
