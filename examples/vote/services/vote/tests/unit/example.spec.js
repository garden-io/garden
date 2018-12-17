import { expect } from 'chai';
import { shallowMount } from '@vue/test-utils';
import Vote from '@/components/Vote.vue';

describe('Vote.vue', () => {
  it('renders props.msg when passed', () => {
    const optionA = 'Cats';
    const wrapper = shallowMount(Vote, {
      propsData: { optionA },
      // propsData: { optionB },
    });
    expect(wrapper.text()).to.include('Cats');
  });
});
