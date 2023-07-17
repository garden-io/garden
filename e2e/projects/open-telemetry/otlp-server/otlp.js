const express = require("express")
const app = express()
const pDefer = require("p-defer")

const receivedTraceCall = pDefer()

app.post("/v1/traces", (req, res) => {
  if (req.headers["x-garden-test-header"] === "1") {
    receivedTraceCall.resolve()
  }

  res.sendStatus(200)
})

module.exports = { app, receivedTraceCall: receivedTraceCall.promise }
