const http = require('http');
const options = { host: 'localhost', port: 3000, path: '/', timeout: 2000 };

const req = http.request(options, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    if (data.includes('mirrornode-core scaffold running')) {
      console.log('TEST PASSED');
      process.exit(0);
    } else {
      console.error('TEST FAILED');
      process.exit(2);
    }
  });
});

req.on('error', err => {
  console.error('TEST ERROR', err.message);
  process.exit(2);
});

req.end();
