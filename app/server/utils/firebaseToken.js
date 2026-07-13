/**
 * Verification of Firebase ID tokens for the Google sign-in path.
 *
 * The client used to simply tell us who it was (`POST /users/auth {userId}`),
 * which meant anyone could claim any account. Instead the client now sends the
 * ID token Firebase issued it, and we check the signature ourselves.
 *
 * We verify against Google's published public keys rather than using
 * firebase-admin, which keeps a service-account private key out of the
 * deployment entirely. FIREBASE_PROJECT_ID is not a secret.
 */

// jose is ESM-only and this server is CommonJS, so it is pulled in with a
// dynamic import. Both the module and the key set are memoized: jose caches the
// fetched keys internally and refetches them when Google rotates them.
let jwksPromise = null;

const getJwks = () => {
  if (!jwksPromise) {
    jwksPromise = import("jose").then((jose) => ({
      jose,
      jwks: jose.createRemoteJWKSet(
        new URL(
          "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"
        )
      ),
    }));
  }
  return jwksPromise;
};

/**
 * Verify a Firebase ID token. Resolves to { uid, email } on success.
 * Throws if the signature, issuer, audience or expiry is wrong.
 */
const verifyFirebaseIdToken = async (idToken) => {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error("FIREBASE_PROJECT_ID is not set");

  const { jose, jwks } = await getJwks();

  const { payload } = await jose.jwtVerify(idToken, jwks, {
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId,
  });

  // `sub` is the Firebase uid; it is what the app already uses as its userId
  // for Google-authenticated accounts.
  if (!payload.sub) throw new Error("Firebase token has no subject");

  return { uid: payload.sub, email: payload.email };
};

module.exports = { verifyFirebaseIdToken };
