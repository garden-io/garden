import { expect } from 'chai';
import { shallowMount } from '@vue/test-utils';
import Vote from '../../src/components/Vote.vue';

describe('Vote.vue', () => {
  it('renders props.msg when passed', () => {
    const wrapper = shallowMount(Vote, {
      propsData: {
        optionA: {
          name: 'flowers',
          color: 'red',
        },
        optionB: {
          name: 'trees',
          color: 'green',
        },
      },
    });
    expect(wrapper.text()).to.include('flowers');
  });
});
