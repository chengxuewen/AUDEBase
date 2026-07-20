import { describe, it, expect, vi } from 'vitest';

// Tests skipped: needs full Ant Design 5 / ProLayout provider context.
// Re-enable when AdminContext, ConfigProvider, and ACLProvider are set up
// in the test render wrapper.
describe.skip('LoginPage', () => {
  it.todo('renders login form with username and password fields');
  it.todo('calls onSubmit with credentials when form submitted');
  it.todo('shows error message on failed login');
});
