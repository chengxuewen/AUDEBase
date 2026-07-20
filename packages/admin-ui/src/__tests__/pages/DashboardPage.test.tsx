import { describe, it, expect, vi } from 'vitest';

// Tests skipped: needs full Ant Design 5 / ProLayout / QueryClientProvider context.
// Re-enable when AdminContext, ConfigProvider, and ACLProvider are set up
// in the test render wrapper.
describe.skip('DashboardPage', () => {
  it.todo('renders page title');
  it.todo('renders stat cards after data loads');
  it.todo('shows database status tag');
  it.todo('shows error state when all queries fail');
  it.todo('clicking retry button reloads data');
});
