const https = require('https');
const data = JSON.stringify({
  compiler: 'openjdk-jdk-21+35',
  code: 'class Solution {\n    public static void main(String[] args) {\n        System.out.println("Hello World");\n    }\n}\n',
  stdin: ''
});

const req = https.request('https://wandbox.org/api/compile.json', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
}, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => console.log('Wandbox status:', res.statusCode, '\nResponse:', body));
});
req.on('error', e => console.error('Error:', e));
req.write(data);
req.end();
