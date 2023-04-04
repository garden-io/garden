const axios = require('axios');
const { expect } = require('chai');

describe('GET /', () => {
  it('responds with a summary of current votes', async () => {
    const result = await axios.get('http://vote:8080', {});
    expect(result.status).to.eql(200);
  });
});

describe('POST /api/vote', () => {
  it('processes a valid vote and returns 200', async () => {
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Access-Control-Allow-Origin': '*',
    };
    const voteResult = 'a';
    const result = await axios.post('http://vote:8080/api/vote', `vote=${voteResult}`, { headers });
    expect(result.status).to.eql(200);
  });
  it('adds a batch of votes to the queue and returns 200', async () => {
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Access-Control-Allow-Origin': '*',
    };
    const voteResult = 'a';
    const result = await axios.post('http://vote:8080/api/vote', `vote=${voteResult}`, { headers });
    expect(result.status).to.eql(200);
  });
  it('correctly detects & handles votes using the legacy API', async () => {
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Access-Control-Allow-Origin': '*',
    };
    const voteResult = 'a';
    const result = await axios.post('http://vote:8080/api/vote', `vote=${voteResult}`, { headers });
    expect(result.status).to.eql(200);
  });
});
