/**
 * Jest configuration for the server-side unit suite.
 *
 * All DB/WS/SMTP collaborators are mocked at the module boundary inside
 * each test file, so the suite runs in pure Node with no service deps.
 */

module.exports = {
  testEnvironment: "node",
  testMatch: ["<rootDir>/tests/**/*.test.js"],
  clearMocks: true,
  verbose: true,
  // Silence the noisy console.log calls coming from the trade engine + price
  // feed during tests. Override with `--verbose` if debugging a failure.
  silent: true,
};
