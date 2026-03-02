const https = require('https');
const http = require('http');

const url = new URL(process.env.PERF_URL || 'http://localhost:3000');
const client = url.protocol === 'https:' ? https : http;
const userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile Safari/604.1';

const start = Date.now();
const req = client.request(url, { headers: { 'User-Agent': userAgent } }, (res) => {
  const duration = Date.now() - start;
  console.log(`Mobile page load: ${duration}ms (status ${res.statusCode})`);
  res.resume();
});

req.on('error', (err) => {
  console.error('Performance test failed:', err.message);
  process.exit(1);
});

req.end();
