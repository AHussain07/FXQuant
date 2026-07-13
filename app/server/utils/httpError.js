/**
 * Uniform handling for unexpected (5xx) failures.
 *
 * Handlers used to return `error.message` straight to the caller, which leaks
 * internals -- Mongoose validator text, connection strings in driver errors,
 * stack-adjacent detail -- to anyone who can provoke a throw. The detail is
 * still wanted, just in the server log rather than the response body.
 *
 * Deliberately only for unexpected errors. Handlers that reject bad input with
 * a 400 keep returning their own message, because that text is written for the
 * user and the frontend displays it.
 */

/** Log the real error, tell the caller nothing beyond "it broke". */
const serverError = (res, context, error) => {
  console.error(`${context}:`, error);
  res.status(500).json({ message: "Internal server error" });
};

module.exports = { serverError };
