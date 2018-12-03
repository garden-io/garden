import { expect } from 'chai';
import { shallowMount } from '@vue/test-utils';
import Vote from '@/components/Vote.vue';

describe('Vote.vue', () => {
  it('renders props.msg when passed', () => {
    const msg = 'new message';
    const wrapper = shallowMount(Vote, {
      propsData: { msg },
    });
    expect(wrapper.text()).to.include(msg);
  });
});
