const https = require('https');
const fs = require('fs');

https.get('https://raw.githubusercontent.com/MoltBot-Sol/jupiter_prediction_market/main/src/orders.js', (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    fs.writeFileSync('/orders.js', data);
    console.log('Saved orders.js');
  });
}).on('error', (err) => console.error(err));
