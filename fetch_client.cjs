const https = require('https');

https.get('https://raw.githubusercontent.com/MoltBot-Sol/jupiter_prediction_market/main/src/client.js', (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    console.log(data.substring(0, 1000));
  });
}).on('error', (err) => console.error(err));
