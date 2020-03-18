const supertest = require("supertest")
const { app } = require("../app")

describe('GET /call-backend', () => {
  const agent = supertest.agent(app)

  it('should respond with a message from the backend service', (done) => {
    agent
      .get("/call-backend")
      .expect(200, { message: "Backend says: 'Hello from Go!'" })
      .end((err) => {
        if (err) return done(err)
        done()
      })
  })
})

