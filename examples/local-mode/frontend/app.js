const express = require('express');
const request = require('request-promise')
const app = express();

const backend1ServiceEndpoint = `http://backend-1/hello-backend-1`
const backend2ServiceEndpoint = `http://backend-2/hello-backend-2`

app.get('/hello-frontend', (req, res) => res.send('Hello from the frontend!'));

app.get('/call-backend-1', (req, res) => {
  // Query the backend and return the response
  request.get(backend1ServiceEndpoint)
    .then(message => {
      message = `Backend 1 says: '${message}'`
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

app.get('/call-backend-2', (req, res) => {
  // Query the backend and return the response
  request.get(backend2ServiceEndpoint)
    .then(message => {
      message = `Backend 2 says: '${message}'`
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
