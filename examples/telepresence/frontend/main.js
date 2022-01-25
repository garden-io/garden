const { app } = require('./app');

// const port = process.env.PORT
const port = 8080
app.listen(port, 'localhost', () => console.log('Frontend service started on port!', port));
