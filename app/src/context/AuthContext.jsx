import React, { createContext, useContext, useState, useEffect } from "react";
import {
  auth,
  onAuthStateChanged,
  signInWithGoogle,
  logOut,
} from "../firebase/config";
import { createOrGetUser, getUser } from "../services/api";

const AuthContext = createContext(null);

// Fire-and-forget: warms up the ML server cache so the market page loads fast
function warmUpMlServer() {
  fetch("http://localhost:8000/api/bias/eurusd").catch(() => {});
  fetch("http://localhost:8000/api/news/eurusd").catch(() => {});
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
          const response = await createOrGetUser(user.uid, user.email);
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
      getUser(user.userId)
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
          const response = await createOrGetUser(user.uid, user.email);
          setDbUser(response.user);
          warmUpMlServer();
        } catch (error) {
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
