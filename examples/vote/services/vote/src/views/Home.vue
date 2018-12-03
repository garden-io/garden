<template>
  <div class="home">
    <!-- <Vote optionA="Cats" optionB="Dogs"/> -->
    <Vote optionA="Pizza" optionB="Hot Dogs"/>
  </div>
</template>

<script>
// @ is an alias to /src
import Vote from '@/components/Vote.vue';

export default {
  name: 'home',
  components: {
    Vote,
  },
};
</script>
