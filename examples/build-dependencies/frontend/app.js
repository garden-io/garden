const express = require('express');
const request = require('request-promise')
const path = require('path')
const dotenv = require('dotenv')
const app = express();

const config = dotenv.config({ path: path.resolve(process.cwd(), "config", "config.env") })
const backendServiceEndpoint = `http://backend/hello-backend`

app.get('/hello-frontend', (req, res) => res.send(`Config says: ${config.parsed.MESSAGE}`));

app.get('/call-backend', (req, res) => {
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
