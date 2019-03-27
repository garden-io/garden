const express = require('express');
const app = express();

app.get('/hello-frontend', (req, res) => res.send('Hello from the frontend!'));

module.exports = { app }
