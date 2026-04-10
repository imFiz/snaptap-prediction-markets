const https = require('https');
const fs = require('fs');

https.get('https://raw.githubusercontent.com/MoltBot-Sol/jupiter_prediction_market/main/src/client.js', (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    fs.writeFileSync('client.js', data);
    console.log('Saved client.js');
  });
}).on('error', (err) => console.error(err));
