const axios = require('axios');
const { expect } = require('chai');

describe('POST /vote', () => {
  it('respond with message from hello-function', async () => {
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Access-Control-Allow-Origin': '*',
    };
    const voteResult = 'a';
    const result = await axios.post('http://api/vote/', `vote=${voteResult}`, { headers });
    expect(result.status).to.eql(200);
  });
});
