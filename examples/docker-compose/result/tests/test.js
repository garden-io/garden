const axios = require('axios');
const { expect } = require('chai');

describe('Voting endpoint', () => {
  it('responds with 200 when submitting a valid vote', async () => {
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Access-Control-Allow-Origin': '*',
    };
    const voteResult = 'a';
    const result = await axios.post('http://vote', `vote=${voteResult}`, { headers });
    expect(result.status).to.eql(200);
  });
});
