const fetch = require('node-fetch');
async function count() {
  const res = await fetch('https://api.jup.ag/prediction/v1/events?limit=1000');
  const json = await res.json();
  console.log('Total events:', json.data.length);
}
count();
