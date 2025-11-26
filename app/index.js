const { createServer } = require('./app');

const port = process.env.PORT || 3000;

if (require.main === module) {
  const server = createServer();
  server.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
}

module.exports = { createServer };
