const { receivedTraceCall, app } = require("../otlp")
const TEST_TIMEOUT = 20_000

let server

before((done) => {
  server = app.listen(process.env.PORT, "0.0.0.0", () => {
    console.log("OTLP HTTP server started")
    done()
  })
})

after(() => {
  server.closeAllConnections()
  server.close(() => {
    console.log("OTLP HTTP server closed")
  })
})

describe("Traces endpoint", () => {
  it("should receive traces from the exporter", async () => {
    await Promise.race([
      receivedTraceCall,
      new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error("Have not received trace call within timeout"))
        },TEST_TIMEOUT)
      })
    ])

  }).timeout(TEST_TIMEOUT + 1000)
})

