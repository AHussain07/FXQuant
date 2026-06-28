import axios from "axios";
import { auth } from "../firebase/config";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000/api";

const getAuthToken = async () => {
  const user = auth.currentUser;
  if (user) {
    return await user.getIdToken();
  }
  return null;
};

export const createOrGetUser = async (userId, gmail) => {
  try {
    const response = await fetch(`${API_URL}/users/auth`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ userId, gmail }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Failed to authenticate user");
    }

    return await response.json();
  } catch (error) {
    console.error("Auth error:", error);
    throw error;
  }
};

export const sendEmailCode = async (email) => {
  try {
    const response = await fetch(`${API_URL}/email-auth/send-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Failed to send verification code");
    }

    return await response.json();
  } catch (error) {
    console.error("Send email code error:", error);
    throw error;
  }
};

export const verifyEmailCode = async (email, code) => {
  try {
    const response = await fetch(`${API_URL}/email-auth/verify-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Verification failed");
    }

    return await response.json();
  } catch (error) {
    console.error("Verify email code error:", error);
    throw error;
  }
};

export const setupAccount = async (userId, accountType, balance) => {
  try {
    const response = await fetch(`${API_URL}/users/${userId}/setup-account`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ accountType, balance }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Failed to set up account");
    }

    return await response.json();
  } catch (error) {
    console.error("Setup account error:", error);
    throw error;
  }
};

export const getUser = async (userId) => {
  try {
    const response = await fetch(`${API_URL}/users/${userId}`);

    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error("Failed to fetch user");
    }

    return await response.json();
  } catch (error) {
    console.error("Get user error:", error);
    throw error;
  }
};

export const createTrade = async (tradeData) => {
  try {
    const response = await fetch(`${API_URL}/trades`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(tradeData),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Failed to create trade");
    }

    return await response.json();
  } catch (error) {
    console.error("Create trade error:", error);
    throw error;
  }
};

export const getUserTrades = async (userId) => {
  try {
    const response = await fetch(`${API_URL}/trades/user/${userId}`);

    if (!response.ok) {
      throw new Error("Failed to fetch trades");
    }

    return await response.json();
  } catch (error) {
    console.error("Get trades error:", error);
    throw error;
  }
};

export const getOpenTrades = async (userId) => {
  try {
    const response = await fetch(`${API_URL}/trades/user/${userId}/open`);

    if (!response.ok) {
      throw new Error("Failed to fetch open trades");
    }

    return await response.json();
  } catch (error) {
    console.error("Get open trades error:", error);
    throw error;
  }
};

export const fetchTradeHistory = async (userId, filters = {}) => {
  try {
    const params = new URLSearchParams(filters).toString();
    const response = await axios.get(
      `${API_URL}/trades/user/${userId}/history?${params}`
    );
    return response.data;
  } catch (error) {
    console.error("Error fetching trade history:", error);
    throw error;
  }
};

export const closeTrade = async (tradeId, currentPrice) => {
  try {
    const token = await getAuthToken();
    const response = await axios.post(
      `${API_URL}/trades/${tradeId}/close`,
      { currentPrice },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error("Error closing trade:", error);
    throw error;
  }
};

export const updateTradeLevels = async (tradeId, levels) => {
  try {
    const response = await fetch(`${API_URL}/trades/${tradeId}/levels`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(levels),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Failed to update trade levels");
    }

    return await response.json();
  } catch (error) {
    console.error("Update trade levels error:", error);
    throw error;
  }
};

export const cancelPendingOrder = async (tradeId) => {
  try {
    const response = await fetch(`${API_URL}/trades/${tradeId}/cancel`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Failed to cancel order");
    }

    return await response.json();
  } catch (error) {
    console.error("Cancel order error:", error);
    throw error;
  }
};

export const checkTradeTPSL = async (tradeId) => {
  try {
    const response = await fetch(`${API_URL}/trades/${tradeId}/check`);

    if (!response.ok) {
      throw new Error("Failed to check trade");
    }

    return await response.json();
  } catch (error) {
    console.error("Check trade error:", error);
    throw error;
  }
};

export const getLivePrice = async (symbol) => {
  try {
    const response = await fetch(`${API_URL}/prices/${symbol}`);

    if (!response.ok) {
      throw new Error("Failed to fetch price");
    }

    return await response.json();
  } catch (error) {
    console.error("Get price error:", error);
    throw error;
  }
};

export const createJournalEntry = async (entryData) => {
  try {
    const response = await axios.post(`${API_URL}/journal`, entryData);
    return response.data;
  } catch (error) {
    console.error("Error creating journal entry:", error);
    throw error;
  }
};

export const getCurrentPrice = async (symbol) => {
  try {
    const response = await axios.get(`${API_URL}/prices/current/${symbol}`);
    return response.data;
  } catch (error) {
    console.error("Error fetching current price:", error);
    throw error;
  }
};

export const getJournalEntry = async (tradeId) => {
  try {
    const response = await axios.get(`${API_URL}/journal/trade/${tradeId}`);
    return response.data;
  } catch (error) {
    if (error.response?.status === 404) {
      return null;
    }
    console.error("Error fetching journal entry:", error);
    throw error;
  }
};

export const getDashboardStats = async (userId, timeframe = "all") => {
  const response = await fetch(
    `${API_URL}/dashboard/${userId}?timeframe=${timeframe}`
  );
  if (!response.ok) throw new Error("Failed to fetch dashboard stats");
  return response.json();
};

export const getTradeById = async (tradeId) => {
  try {
    const response = await axios.get(`${API_URL}/trades/${tradeId}`);
    return response.data;
  } catch (error) {
    console.error("Error fetching trade:", error);
    throw error;
  }
};

export const updateJournalEntry = async (tradeId, data) => {
  try {
    const response = await axios.put(`${API_URL}/journal/${tradeId}`, data);
    return response.data;
  } catch (error) {
    console.error("Error updating journal entry:", error);
    throw error;
  }
};

export const markTourComplete = async (userId) => {
  try {
    const response = await fetch(`${API_URL}/users/${userId}/tour-complete`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Failed to mark tour complete");
    }

    return await response.json();
  } catch (error) {
    console.error("Mark tour complete error:", error);
    throw error;
  }
};

export const resetTradingAccount = async (userId) => {
  try {
    const response = await fetch(`${API_URL}/users/${userId}/reset-trading`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Failed to reset trading account");
    }

    return await response.json();
  } catch (error) {
    console.error("Reset trading account error:", error);
    throw error;
  }
};

export const resetFullAccount = async (userId) => {
  try {
    const response = await fetch(`${API_URL}/users/${userId}/reset-full`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Failed to reset account");
    }

    return await response.json();
  } catch (error) {
    console.error("Reset full account error:", error);
    throw error;
  }
};

export const deleteAccount = async (userId) => {
  try {
    const response = await fetch(`${API_URL}/users/${userId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Failed to delete account");
    }

    return await response.json();
  } catch (error) {
    console.error("Delete account error:", error);
    throw error;
  }
};
