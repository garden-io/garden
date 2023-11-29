<template>
  <div class="hello">
    <div>
      <h3>{{optionA.name}} <span>vs.</span> {{optionB.name}}</h3>

      <button
        type="submit"
        name="vote"
        value="a"
        v-on:click="$emit('vote', 'a')"
        v-bind:style="{ backgroundColor: optionA.color }"
      >
        <span>{{optionA.name}}</span>
      </button>

      <button
        type="submit"
        name="vote"
        value="b"
        v-on:click="$emit('vote', 'b')"
        v-bind:style="{ backgroundColor: optionB.color }"
      >
        <span>{{optionB.name}}</span>
      </button>

      <p>
        When you click one of the above buttons, a vote is submitted to the <em>api</em> service,
        which places the vote on a <em>redis</em> queue. The vote is picked up by the
        <em>worker</em> service, which then writes it to the <em>postgres</em> database.
        Finally, the <em>result</em> service sends updated results to this <em>vote</em>
        UI through a websocket connection.
        <br><br>
        Over-engineered? Oh absolutely.<br>
        But that's alright, it's still just <code>garden deploy</code> for the whole thing .)
      </p>
    </div>
  </div>
</template>

<script>

export default {
  name: 'Vote',

  props: {
    optionA: {
      name: String,
      color: String,
    },
    optionB: {
      name: String,
      color: String,
    },
  },
};
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>

div.hello {
  display: flex;
  margin: 0 auto;
  height: 100%;
  justify-content: center;
  align-items: center;
}

div.hello >div {
  transition: all 300ms linear;
  line-height: 1.3em;
  padding-top: 50px;
}

h3 {
  color: #272a3a;
  font-weight: 800;
  font-size: 4em;
}

h3 span {
  font-weight: 100;
}

button {
  cursor: pointer;
  display: block;
  height: 80px;
  width: 330px;
  margin: 0 auto;
  border: none;
  color: white;
  text-transform: lowercase;
  text-decoration: none;
  letter-spacing: 0.2ch;
  outline: 0;
  font-size: 18px;
  font-weight: 600;
  margin-top: 10px;
  margin-bottom: 10px;
  text-align: left;
  padding-left: 50px;
  font-size: 1.3em;
}

button span {
  opacity: 0.9;
}

button:hover, button:focus{
  outline: 0;
  text-decoration: none;
}

button:hover {
  opacity: 0.8;
}

p {
  width: 420px;
  margin: 50px auto;
  text-align: left;
  color: #bbb;
  font-weight: 500;
  font-size: 0.8rem;
  line-height: 1.3em;
}

p code {
  font-weight: 800;
}

p em {
  font-weight: 800;
}

</style>
