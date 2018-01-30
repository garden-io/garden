const express = require("express")
const request = require("request-promise")

const app = express()

app.get("/", (req, res) => {
  // Query the example cloud function and return the response
  request.get(process.env.GARDEN_SERVICES_HELLO_FUNCTION_ENDPOINT)
    .then(response => {
      res.send(response)
    })
})

app.listen(3000, () => console.log("App started"))
