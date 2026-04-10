const fetch = require('node-fetch');

async function test() {
  try {
    const response = await fetch('https://api.jup.ag/prediction/v1/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ownerPubkey: 'AJdZhryzpDMmnSM7ymLVSJuBP1ARYfoiq1YMPXtsVj63', // Dummy pubkey
        marketId: '11111111111111111111111111111111', // Dummy market
        isYes: true,
        isBuy: true,
        depositAmount: 1000000, // 1 USDC
        depositMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
      })
    });
    
    const text = await response.text();
    console.log('Status:', response.status);
    console.log('Response:', text);
  } catch (err) {
    console.error(err);
  }
}

test();
