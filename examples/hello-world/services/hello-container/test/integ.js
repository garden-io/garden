const supertest = require("supertest")
const { app } = require("../app")

describe('GET /hello', () => {
  const agent = supertest.agent(app)

  it('respond with message from hello-function', (done) => {
    agent
      .get("/hello")
      .expect(200, { message: "Hello there, I'm a function" })
      .end((err) => {
        if (err) return done(err)
        done()
      })
  })
})
