const express = require('express');
const request = require('request-promise')
const app = express();

const backendServiceEndpoint = `http://backend/hello-backend`

app.get('/hello-frontend', (_req, res) => {
  const msg = process.env.IS_LOCAL ? "Hello from local frontend" : "Hello from remote frontend"
  res.send(msg)
});


app.get('/call-backend', (_req, res) => {
  // Query the backend and return the response
  request.get(backendServiceEndpoint)
    .then(message => {
      message = `Backend says: '${message}'`
      res.json({
        message,
      })
    })
    .catch(err => {
      res.statusCode = 500
      res.json({
        error: err,
        message: "Unable to reach service at " + backendServiceEndpoint,
      })
    });
});

module.exports = { app }
