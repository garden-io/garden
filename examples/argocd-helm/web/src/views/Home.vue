<template>
  <div class='home'>
    <div>
      <Vote v-bind:optionA='optionA' v-bind:optionB='optionB' v-on:vote='vote'/>
    </div>
    <div>
      <Results v-bind:optionA='optionA' v-bind:optionB='optionB' v-bind:results='results'/>
    </div>
    <img class='logo' src='/garden-logo.png' />
    <img class='flowers' src='/flowers.png' />
  </div>
</template>

<script>

import Vote from '../components/Vote.vue';
import Results from '../components/Results.vue';

export default {
  name: 'home',

  data: () => ({
    optionA: {
      name: 'flowers',
      // color: 'pink',
      color: '#ED0553',
    },
    optionB: {
      name: 'trees',
      // color: 'lightblue',
      color: '#00C9B6',
    },
    results: {
      a: 0,
      b: 0,
    },
  }),

  created() {
    console.log('App created');

    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Access-Control-Allow-Origin': '*',
    };

    window.axios.get('/api/vote', { headers }).then((res) => {
      console.log("Got votes from API", res)

      const data = res.data;
      const votesByOption = res.data.reduce((acc, curr) => {
        const [option, nVotes] = curr
        acc[option] = nVotes
        return acc
      }, {})

      console.log("Results:", votesByOption)

      const a = parseInt(votesByOption.a || 0, 10)
      const b = parseInt(votesByOption.b || 0, 10)

      this.updateScores({ a, b });
    });
  },

  methods: {
    updateScores({ a, b }) {
      if (a !== this.results.a || b !== this.results.b) {
        console.log(`Setting scores: a=${a} b=${b}`);
        this.results.a = a;
        this.results.b = b;
      }
    },
    vote(v) {
      console.log(`Voting for ${v}`)
      const headers = {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Access-Control-Allow-Origin': '*',
      };
      const self = this;
      window.axios.post('/api/vote', `vote=${v}`, { headers }).then(() => {
        this.results[v]++
        console.log(`Did cast vote`)
      });
    },
  },

  components: {
    Vote,
    Results,
  },
};
</script>

<style>
  @import url(//fonts.googleapis.com/css?family=Open+Sans:400,700,600);

  *{
    box-sizing:border-box;
  }

  html,body{
    margin: 0;
    padding: 0;
    background-color: #F7F8F9;
    height: 100vh;
    font-family: 'Open Sans';
  }

  button{
    border-radius: 0;
    width: 100%;
    height: 50%;
  }

  button[type='submit'] {
    -webkit-appearance: none;
    border-radius: 0;
    -webkit-border-radius: 0;
  }

  div.home {
    display: flex;
    width: 100%;
    height: calc(100vh - 50px);
    overflow: hidden;
  }

  div.home div {
    flex: 50%;
  }

  img.logo {
    position: absolute;
    left: 30px;
    bottom: 20px;
    width: 160px;
  }

  img.flowers {
    position: absolute;
    left: calc(50vw - 85px);
    bottom: 10px;
    width: 160px;
  }
</style>
