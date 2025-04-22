const axios = require('axios');
const { expect } = require('chai');

const axiosRetry = require('axios-retry');
axiosRetry(axios, {
  retries: 2, // number of retries
  retryDelay: (retryCount) => {
      console.log(`axios retry attempt: ${retryCount}`);
      return retryCount * 2000; // time interval between retries
  },
})

describe('GET /', () => {
  it('respond with 200', async () => {
    const result = await axios.get('http://vote:8080', {});
    expect(result.status).to.eql(200);
  });
});

describe('POST /api/vote', () => {
  it('respond with 200', async () => {
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Access-Control-Allow-Origin': '*',
    };
    const voteResult = 'a';
    const result = await axios.post('http://vote:8080/api/vote', `vote=${voteResult}`, { headers });
    expect(result.status).to.eql(200);
  });
});
