const express = require('express');
const app = express();

app.get('/hello', (req, res) => res.send('Hello from Node service!'));

module.exports = { app }
