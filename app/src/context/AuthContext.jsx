import React, { createContext, useContext, useState, useEffect } from "react";
import {
  auth,
  onAuthStateChanged,
  signInWithGoogle,
  logOut,
} from "../firebase/config";
import { createOrGetUser, getUser } from "../services/api";
import { clearToken } from "../services/authToken";
import { ML_URL } from "../config";

const AuthContext = createContext(null);

// Fire-and-forget: warms up the ML server cache so the market page loads fast
function warmUpMlServer() {
  fetch(`${ML_URL}/api/bias/eurusd`).catch(() => {});
  fetch(`${ML_URL}/api/news/eurusd`).catch(() => {});
}

/**
 * Retry the auth bootstrap before giving up on it.
 *
 * Loading the user record is the first request the app makes to the API, and in
 * a deployed setup that is also the request that wakes the service if it has
 * spun down -- so it can fail outright rather than merely being slow. Against a
 * local dev proxy it is instant and effectively never fails, which is why a
 * single attempt was enough until this was deployed.
 *
 * Failing it silently is worse than being slow: it leaves the app signed in with
 * a null dbUser, and downstream code cannot tell that apart from a brand-new
 * account -- which is how the onboarding tour ended up running for existing users.
 */
const BOOTSTRAP_ATTEMPTS = 3;

async function withRetry(request) {
  for (let attempt = 0; attempt < BOOTSTRAP_ATTEMPTS; attempt++) {
    try {
      return await request();
    } catch (error) {
      if (attempt === BOOTSTRAP_ATTEMPTS - 1) throw error;
      // 1s, then 2s -- enough to cover a service coming back up.
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
    }
  }
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dbUser, setDbUser] = useState(null);

  const loginWithGoogle = async () => {
    try {
      const user = await signInWithGoogle();

      if (user) {
        try {
          // Hand the API the token Firebase signed, not our own claim of who we
          // are; it verifies that signature and hands back a session token.
          const response = await createOrGetUser(await user.getIdToken());
          setDbUser(response.user);
          warmUpMlServer();

          if (response.isNewUser) {
            console.log("Welcome! New account created");
          }
        } catch (error) {
          console.error("Error authenticating user:", error);
        }
      }

      return user;
    } catch (error) {
      throw error;
    }
  };

  const loginWithEmail = (user, isNewUser) => {
    // Store the email user session in localStorage
    localStorage.setItem("emailUser", JSON.stringify(user));
    setCurrentUser({ uid: user.userId, email: user.gmail });
    setDbUser(user);
    warmUpMlServer();

    if (isNewUser) {
      console.log("Welcome! New account created");
    }
  };

  const logout = async () => {
    try {
      const emailUser = localStorage.getItem("emailUser");
      if (emailUser) {
        localStorage.removeItem("emailUser");
        setCurrentUser(null);
      } else {
        await logOut();
      }
      clearToken();
      setDbUser(null);
    } catch (error) {
      throw error;
    }
  };

  const refreshUserData = async () => {
    if (currentUser) {
      try {
        const userData = await getUser(currentUser.uid);
        setDbUser(userData);
      } catch (error) {
        console.error("Error refreshing user data:", error);
      }
    }
  };

  useEffect(() => {
    // Check for persisted email user session
    const storedEmailUser = localStorage.getItem("emailUser");
    if (storedEmailUser) {
      const user = JSON.parse(storedEmailUser);
      setCurrentUser({ uid: user.userId, email: user.gmail });
      // Refresh from DB to get latest data
      withRetry(() => getUser(user.userId))
        .then((userData) => {
          if (userData) {
            setDbUser(userData);
            localStorage.setItem("emailUser", JSON.stringify(userData));
            warmUpMlServer();
          } else {
            // User no longer exists in DB
            localStorage.removeItem("emailUser");
            setCurrentUser(null);
          }
        })
        .catch(() => {
          // Still use cached data if DB fetch fails
          setDbUser(user);
        })
        .finally(() => setLoading(false));
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      // Don't override email user session with null Firebase state
      if (!user && localStorage.getItem("emailUser")) {
        return;
      }

      setCurrentUser(user);

      if (user) {
        try {
          // Refreshing the page lands here, which re-exchanges the Firebase
          // token for a fresh session token.
          const response = await withRetry(async () =>
            createOrGetUser(await user.getIdToken())
          );
          setDbUser(response.user);
          warmUpMlServer();
        } catch (error) {
          // Out of retries. Leave dbUser null so the tour stays shut rather than
          // mistaking the missing record for a new account, and let the pages
          // surface the failure.
          console.error("Error fetching user data:", error);
        }
      } else {
        setDbUser(null);
      }

      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const value = {
    currentUser,
    dbUser,
    loginWithGoogle,
    loginWithEmail,
    logout,
    refreshUserData,
    loading,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export default AuthProvider;
