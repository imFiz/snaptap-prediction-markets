const fetch = require('node-fetch');
async function test() {
  const urls = [
    'https://api.jup.ag/prediction/v1/events?limit=50',
    'https://api.jup.ag/prediction/v1/events?pageSize=50',
    'https://api.jup.ag/prediction/v1/events?perPage=50',
    'https://api.jup.ag/prediction/v1/events?count=50'
  ];
  for (const url of urls) {
    const res = await fetch(url);
    const json = await res.json();
    console.log(url, '->', json.data ? json.data.length : 'error', json.pagination);
  }
}
test();
