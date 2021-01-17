const axios = require('axios');
const { expect } = require('chai');

describe('GET /', () => {
  it('respond with 200', async () => {
    const result = await axios.get('http://vote', {});
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
    const result = await axios.post('http://vote/api/vote', `vote=${voteResult}`, { headers });
    expect(result.status).to.eql(200);
  });
});
