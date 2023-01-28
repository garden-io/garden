<template>
  <div class="hello">
        <div id="content-container">
      <div id="content-container-center">
         <div id="choice" >
        <h3>Cats vs Dogs!</h3>
          <button id="a" type="submit" name="vote" class="a" v-on:click="vote('a')" value="a">
            {{optionA}}
          </button>
          <button id="b" type="submit" name="vote" class="b" v-on:click="vote('b')" value="b">
            {{optionB}}
          </button>
        </div>
      </div>
    </div>
  </div>


</template>

<script>
export default {
  name: 'Vote',
  data() {
    return {
      counter: 0,
      voteResult: '',
    };
  },
  props: {
    optionA: String,
    optionB: String,
  },
  methods: {
    vote(v) {
      this.voteResult = v;
      const headers = {
        'Content-Type': 'application/x-www-form-urlencoded',
      };
      const self = this;
      window.axios.post('/api/vote', `vote=${this.voteResult}`, { headers }).then(() => {
        self.counter += 1;
      });
    },
  },
};
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>
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

button[type="submit"] {
  -webkit-appearance:none; -webkit-border-radius:0;
}

button i{
  float: right;
  padding-right: 30px;
  margin-top: 3px;
}

button.a{
  background-color: #1aaaf8;
  /* background-color: #f17fcd; */
}

button.b{
  background-color: #00cbca;
}

#tip{
  text-align: left;
  color: #c0c9ce;
  font-size: 14px;
}

#content-container{
  z-index: 2;
  position: relative;
  margin: 0 auto;
  display: table;
  padding: 10px;
  max-width: 940px;
  height: 100%;
}
#content-container-center{
  display: table-cell;
  text-align: center;
}

#content-container-center h3{
  color: #254356;
}

#choice{
  transition: all 300ms linear;
  line-height: 1.3em;
  display: inline;
  vertical-align: middle;
  font-size: 3em;
}
#choice a{
  text-decoration:none;
}
#choice a:hover, #choice a:focus{
  outline:0;
  text-decoration:underline;
}

#choice button{
  display: block;
  height: 80px;
  width: 330px;
  border: none;
  color: white;
  text-transform: uppercase;
  font-size:18px;
  font-weight: 700;
  margin-top: 10px;
  margin-bottom: 10px;
  text-align: left;
  padding-left: 50px;
}

#choice button.a:hover{
  background-color: #1488c6;
}

#choice button.b:hover{
  background-color: #00a2a1;
}

#choice button.a:focus{
  background-color: #1488c6;
}

#choice button.b:focus{
  background-color: #00a2a1;
}

</style>
