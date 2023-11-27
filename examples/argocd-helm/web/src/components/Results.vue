<template>
  <div class='results'>
    <div v-bind:style="{ backgroundColor: optionA.color, height: aPercent + '%' }">
      <div>
        <h2>{{aPercent}}%</h2>
        <p>({{ results.a }} votes)</p>
      </div>
    </div>
    <div v-bind:style="{ backgroundColor: optionB.color, height: bPercent + '%' }">
      <div>
        <h2>{{bPercent}}%</h2>
        <p>({{ results.b }} votes)</p>
      </div>
    </div>
  </div>
</template>

<script>
const results = {
  name: 'Results',

  props: {
    optionA: {
      name: String,
      color: String,
    },
    optionB: {
      name: String,
      color: String,
    },
    results: {
      a: Number, 
      b: Number,
    }
  },

  computed: {
    aPercent() {
      if (this.results.a + this.results.b <= 0) {
        return 50;
      }
      return Math.round(this.results.a / (this.results.a + this.results.b) * 100);
    },
    bPercent() {
      if (this.results.a + this.results.b <= 0) {
        return 50;
      }
      return 100 - Math.round(this.results.a / (this.results.a + this.results.b) * 100);
    },
  },
};
export default results;

</script>

<!-- Add 'scoped' attribute to limit CSS to this component only -->
<style scoped>
  .results {
    width: 100%;
    height: 100%;
  }

  .results div {
    color: white;
    font-weight: bold;
    transition: height 0.5s ease-in-out;
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .results div >div {
    width: 100%;
    display: block;
  }

  .results div >div h2 {
    font-size: 4rem;
    padding-bottom: 0rem;
    margin-bottom: 0rem;
  }

  .results div >div p {
    margin-top: 0.4rem;
    font-size: 1rem;
  }
</style>
