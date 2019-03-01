const supertest = require("supertest")
const { app } = require("../app")

describe('GET /call-go-service', () => {
  const agent = supertest.agent(app)

  it('should respond with a message from go-service', (done) => {
    agent
      .get("/call-go-service")
      .expect(200, { message: "Go says: 'Hello from Go!'" })
      .end((err) => {
        if (err) return done(err)
        done()
      })
  })
})

