const supertest = require("supertest")
const { app } = require("../app")

describe('GET /call-backend', () => {
  const agent = supertest.agent(app)

  it('should respond with a message from the backend-1 service', (done) => {
    agent
      .get("/call-backend-1")
      .expect(200, { message: "Backend 1 says: 'Hello from 1st Go!'" })
      .end((err) => {
        if (err) return done(err)
        done()
      })
  })

  it('should respond with a message from the backend-2 service', (done) => {
    agent
      .get("/call-backend-2")
      .expect(200, { message: "Backend 2 says: 'Hello from 2nd Go!'" })
      .end((err) => {
        if (err) return done(err)
        done()
      })
  })
})
