const express = require('express');
const app = express();

// These environment variables are set differently in Dockerfile-dev and Dockerfile-prod
const envName = process.env.ENVIRONMENT;
const helloPath = process.env.HELLO_PATH

const helloMsg = `Greetings! This container was built with Dockerfile-${envName}.`;

app.get(helloPath, (req, res) => res.send(helloMsg));

module.exports = { app }
