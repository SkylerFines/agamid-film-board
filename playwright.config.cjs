const { defineConfig } = require('@playwright/test');
// Test traffic stays local even on workstations with a corporate proxy.
process.env.NO_PROXY = [process.env.NO_PROXY, '127.0.0.1', 'localhost'].filter(Boolean).join(',');
process.env.no_proxy = process.env.NO_PROXY;
module.exports = defineConfig({
  testDir: './tests/browser',
  workers: 1,
  timeout: 30000,
  use: { baseURL: 'http://127.0.0.1:8782', viewport: { width: 1440, height: 1000 } },
  webServer: {
    command: 'python3 tests/serve_browser_fixture.py',
    wait: { stdout: /Film Board test server ready/ },
  },
});
