// Backend URLs. In development these are RELATIVE, so every request goes to the
// same origin that served the page (localhost, the LAN IP, or an HTTPS tunnel)
// and is forwarded to the right backend by src/setupProxy.js. Relative URLs are
// what make Google sign-in work on a phone: the app can be served over one HTTPS
// tunnel origin with no hardcoded host to break.
//
// To point at absolute backends (e.g. a real deployment) set REACT_APP_API_URL
// / REACT_APP_ML_URL in the environment.

// Express API
export const API_URL = process.env.REACT_APP_API_URL || "/api";

// FastAPI ML service (paths are like `${ML_URL}/api/bias/...`)
export const ML_URL = process.env.REACT_APP_ML_URL || "";
