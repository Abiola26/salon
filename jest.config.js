/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
  setupFilesAfterFramework: [],
  // Prevent open handles from the server/cron
  forceExit: true,
  detectOpenHandles: true,
  // Timeout per test
  testTimeout: 15000,
  verbose: true,
  collectCoverage: false,
};
