import { useEffect, useRef, useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";
import { useAuth } from "../context/AuthContext";
import { markTourComplete as markTourCompleteAPI } from "../services/api";

const TOUR_PHASE_KEY = "fxquant_tourPhase";

// --- localStorage helpers (phase only — completion is in DB) ---

function getTourPhaseKey(userId) {
  return `${TOUR_PHASE_KEY}_${userId}`;
}

export function resetTour(userId) {
  localStorage.removeItem(getTourPhaseKey(userId));
}

function getTourPhase(userId) {
  return localStorage.getItem(getTourPhaseKey(userId)) || "dashboard_intro";
}

function setTourPhase(userId, phase) {
  localStorage.setItem(getTourPhaseKey(userId), phase);
}

// --- Tour phases ---
// dashboard_intro -> market_setup -> market_trading -> complete

export default function useOnboardingTour(userId, page = "dashboard") {
  const driverRef = useRef(null);
  const navigate = useNavigate();
  const { dbUser, refreshUserData } = useAuth();
  const [phase, setPhaseState] = useState(() =>
    userId ? getTourPhase(userId) : null
  );

  const skipTour = useCallback(async () => {
    try {
      await markTourCompleteAPI(userId);
      await refreshUserData();
    } catch (error) {
      console.error("Failed to mark tour complete:", error);
    }
    localStorage.removeItem(getTourPhaseKey(userId));
    if (driverRef.current) {
      driverRef.current.destroy();
    }
  }, [userId, refreshUserData]);

  // Advance to the next phase (updates both localStorage and local state)
  const advancePhase = useCallback(
    (nextPhase) => {
      if (userId) {
        setTourPhase(userId, nextPhase);
        setPhaseState(nextPhase);
      }
    },
    [userId]
  );

  // `hasSeenTutorial` is only meaningful once the user record has actually
  // arrived. While dbUser is still null -- or failed to load -- the flag reads
  // as undefined, which is indistinguishable from "false" and would run the
  // tour at an established account. Wait for the record before deciding.
  const dbUserLoaded = Boolean(dbUser);
  const hasSeenTutorial = dbUser?.hasSeenTutorial;

  useEffect(() => {
    if (!userId || !dbUserLoaded || hasSeenTutorial || !phase) return;

    // Only run the phase that matches the current page
    if (page === "dashboard" && phase === "dashboard_intro") {
      return runDashboardIntro(userId, driverRef, navigate, skipTour, advancePhase);
    }
    if (page === "market" && phase === "market_setup") {
      return runMarketSetup(userId, driverRef, skipTour, advancePhase);
    }
    if (page === "market" && phase === "market_trading") {
      return runMarketTrading(userId, driverRef, refreshUserData);
    }
    // Primitives, not dbUser itself: refreshUserData hands back a new object on
    // every call, and depending on its identity would restart the tour mid-run.
  }, [userId, page, phase, dbUserLoaded, hasSeenTutorial, navigate, skipTour, advancePhase, refreshUserData]);

  return { driverRef, skipTour, advancePhase, phase };
}

// --- Phase runners ---

function runDashboardIntro(_userId, driverRef, navigate, skipTour, advancePhase) {
  const timeout = setTimeout(() => {
    const steps = [
      {
        popover: {
          title: "Welcome to FXQuant!",
          description:
            "Let's take a quick tour of the platform so you can start paper trading like a pro. You can close this tour at any time.",
        },
      },
      {
        element: "#tour-nav-links",
        popover: {
          title: "Navigation",
          description:
            "Use these links to move between the Dashboard, Trading page, and your Trade History.",
        },
      },
      {
        element: "#tour-nav-dashboard",
        popover: {
          title: "Dashboard",
          description:
            "You're here now! The Dashboard shows your trading performance including win rate, equity curve, and most traded pairs.",
        },
      },
      {
        element: "#tour-nav-history",
        popover: {
          title: "Trade History",
          description:
            "Review all your past trades here. Track your progress and learn from your wins and losses.",
        },
      },
      {
        element: "#tour-nav-trade",
        popover: {
          title: "Let's Set Up Your Account",
          description:
            "Next, we'll head to the Trade page where you can choose your account type and start trading. Click 'Let's Go!' to continue.",
        },
      },
    ];

    // Remove steps whose target elements are missing
    const filteredSteps = steps.filter(
      (s) => !s.element || document.querySelector(s.element)
    );

    driverRef.current = driver({
      showProgress: true,
      animate: true,
      smoothScroll: true,
      allowClose: true,
      overlayColor: "rgba(0, 0, 0, 0.6)",
      stagePadding: 8,
      stageRadius: 8,
      popoverClass: "fxquant-tour-popover",
      nextBtnText: "Next",
      prevBtnText: "Back",
      doneBtnText: "Let's Go!",
      progressText: "{{current}} of {{total}}",
      onDestroyStarted: (_, __, { state }) => {
        if (state.activeIndex === filteredSteps.length - 1) {
          // Finished the dashboard intro, navigate to market
          advancePhase("market_setup");
          driverRef.current?.destroy();
          navigate("/market");
        } else {
          // User closed early
          skipTour();
        }
      },
      steps: filteredSteps,
    });

    driverRef.current.drive();
  }, 800);

  return () => {
    clearTimeout(timeout);
    if (driverRef.current) {
      driverRef.current.destroy();
    }
  };
}

function runMarketSetup(_userId, driverRef, skipTour, advancePhase) {
  const timeout = setTimeout(() => {
    // Check if account setup screen is showing
    const setupEl = document.querySelector("#tour-account-setup");
    if (!setupEl) {
      // Account already set up, skip to trading phase
      advancePhase("market_trading");
      return;
    }

    const steps = [
      {
        element: "#tour-account-setup",
        popover: {
          title: "Choose Your Account",
          description:
            "Before you can trade, you need to pick an account type. You have two options below.",
        },
      },
      {
        element: "#tour-prop-options",
        popover: {
          title: "Prop Firm Challenges",
          description:
            "Pick a $50K, $100K, or $150K challenge. Each has a profit target to hit and a max loss limit. Reach the target to pass!",
        },
      },
      {
        element: "#tour-live-option",
        popover: {
          title: "Demo Live Account",
          description:
            "Prefer no rules? Choose this to set your own starting balance with no profit target or loss limit. Great for casual practice.",
        },
      },
      {
        popover: {
          title: "Pick One to Continue",
          description:
            "Go ahead and select an account type above. Once you do, we'll show you around the trading interface.",
        },
      },
    ];

    // Remove steps whose target elements are missing
    const filteredSteps = steps.filter(
      (s) => !s.element || document.querySelector(s.element)
    );

    driverRef.current = driver({
      showProgress: true,
      animate: true,
      smoothScroll: true,
      allowClose: true,
      overlayColor: "rgba(0, 0, 0, 0.6)",
      stagePadding: 8,
      stageRadius: 8,
      popoverClass: "fxquant-tour-popover",
      nextBtnText: "Next",
      prevBtnText: "Back",
      doneBtnText: "Got It",
      progressText: "{{current}} of {{total}}",
      onDestroyStarted: (_, __, { state }) => {
        if (state.activeIndex === filteredSteps.length - 1) {
          // User finished setup tour, keep phase as market_setup
          // It will advance to market_trading when the setup screen disappears
          driverRef.current?.destroy();
        } else {
          skipTour();
        }
      },
      steps: filteredSteps,
    });

    driverRef.current.drive();
  }, 800);

  return () => {
    clearTimeout(timeout);
    if (driverRef.current) {
      driverRef.current.destroy();
    }
  };
}

function runMarketTrading(userId, driverRef, refreshUserData) {
  const timeout = setTimeout(() => {
    const allSteps = [
      {
        popover: {
          title: "Your Trading Interface",
          description:
            "Great, your account is ready! Let's walk through the tools you'll use to analyse the market and place trades.",
        },
      },
      {
        element: "#tour-chart",
        popover: {
          title: "Live Chart",
          description:
            "Real-time price charts powered by TradingView. You can draw trendlines, mark support and resistance levels, and switch timeframes.",
        },
      },
      {
        element: "#tour-watchlist",
        popover: {
          title: "Switch Trading Pairs",
          description:
            "Click any currency pair in the watchlist to load its chart and price data. Use this to quickly jump between the pairs you're tracking.",
        },
      },
      {
        element: "#tour-quick-trade",
        popover: {
          title: "Place a Trade",
          description:
            "Hit BUY or SELL to open the trading form. You'll set your position size, take profit, and stop loss before executing.",
        },
      },
      {
        element: "#tour-ml-indicators",
        popover: {
          title: "ML Analysis",
          description:
            "Our machine learning model provides daily bias predictions for each pair. Use these signals alongside your own analysis to make informed decisions.",
        },
      },
      {
        element: "#tour-news",
        popover: {
          title: "Economic News",
          description:
            "Stay on top of market-moving economic events. High-impact news releases can cause sudden price swings, so always check before trading.",
        },
      },
      {
        popover: {
          title: "You're All Set!",
          description:
            "You now know your way around FXQuant. Pick a pair from the watchlist, check the ML analysis and news, then place your first trade. Good luck!",
        },
      },
    ];

    // Remove steps whose target elements are missing
    const filteredSteps = allSteps.filter(
      (s) => !s.element || document.querySelector(s.element)
    );

    driverRef.current = driver({
      showProgress: true,
      animate: true,
      smoothScroll: true,
      allowClose: true,
      overlayColor: "rgba(0, 0, 0, 0.6)",
      stagePadding: 8,
      stageRadius: 8,
      popoverClass: "fxquant-tour-popover",
      nextBtnText: "Next",
      prevBtnText: "Back",
      doneBtnText: "Start Trading!",
      progressText: "{{current}} of {{total}}",
      onDestroyStarted: () => {
        markTourCompleteAPI(userId)
          .then(() => refreshUserData())
          .catch((err) => console.error("Failed to mark tour complete:", err));
        localStorage.removeItem(`${TOUR_PHASE_KEY}_${userId}`);
        driverRef.current?.destroy();
      },
      steps: filteredSteps,
    });

    driverRef.current.drive();
  }, 1000);

  return () => {
    clearTimeout(timeout);
    if (driverRef.current) {
      driverRef.current.destroy();
    }
  };
}
