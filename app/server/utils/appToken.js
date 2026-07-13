/**
 * The API's own session token.
 *
 * Both login paths (Google via Firebase, and the email-code flow) converge on
 * one of these, so every protected route only ever has to understand a single
 * token format. The payload carries the public `userId` string that the rest of
 * the codebase already keys users by.
 */

const jwt = require("jsonwebtoken");

const TOKEN_LIFETIME = "7d";

const getSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    // Fail loudly rather than signing with a default: a predictable secret
    // would let anyone mint a token for any account.
    throw new Error("JWT_SECRET is not set");
  }
  return secret;
};

/** Sign a session token for the given public user id. */
const signAppToken = (userId) =>
  jwt.sign({ sub: userId }, getSecret(), { expiresIn: TOKEN_LIFETIME });

/** Verify a session token and return its public user id, or null if invalid. */
const verifyAppToken = (token) => {
  try {
    return jwt.verify(token, getSecret()).sub;
  } catch {
    return null;
  }
};

module.exports = { signAppToken, verifyAppToken };
