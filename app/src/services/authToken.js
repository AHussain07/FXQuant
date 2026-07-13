/**
 * The session token our API issues at login (from Google sign-in or the email
 * code flow). Every private endpoint requires it as a Bearer token.
 *
 * Note this is deliberately NOT the Firebase ID token. Firebase only proves who
 * you are to Google; the API exchanges that proof once, at login, for a token of
 * its own that it can verify on every subsequent request.
 */

import axios from "axios";

const STORAGE_KEY = "authToken";

export const getToken = () => localStorage.getItem(STORAGE_KEY);

export const setToken = (token) => {
  if (token) localStorage.setItem(STORAGE_KEY, token);
};

export const clearToken = () => localStorage.removeItem(STORAGE_KEY);

/**
 * A rejected token means the session is gone (expired, or predates the move to
 * authenticated requests). Drop the stale session and send the user back to the
 * login screen rather than leaving them half-logged-in with every call failing.
 */
const handleUnauthorized = () => {
  clearToken();
  localStorage.removeItem("emailUser");
  if (window.location.pathname !== "/") {
    window.location.href = "/";
  }
};

// Attach the token to every axios request so individual call sites don't have to
// remember to. Registered once, on import.
axios.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) handleUnauthorized();
    return Promise.reject(error);
  }
);

/** fetch(), with the session token attached. */
export const authFetch = async (url, options = {}) => {
  const token = getToken();
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (response.status === 401) handleUnauthorized();
  return response;
};
