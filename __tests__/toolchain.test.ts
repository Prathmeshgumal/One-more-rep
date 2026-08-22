import {APP_NAME} from '@/constants';

describe('toolchain', () => {
  it('resolves the @/ path alias', () => {
    expect(APP_NAME).toBe('One More Rep');
  });
});
