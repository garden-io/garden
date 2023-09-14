const { app } = require('./app');

app.listen(process.env.PORT, '0.0.0.0', () => console.log('Frontend service started'));
