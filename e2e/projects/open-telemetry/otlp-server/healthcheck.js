const express = require("express")
const app = express()

app.get("/health", (req, res) => {
  res.sendStatus(200)
})

app.listen(process.env.HEALTHCHECK_PORT, "0.0.0.0", () => {
  console.log("Healthcheck endpoint started")
})
