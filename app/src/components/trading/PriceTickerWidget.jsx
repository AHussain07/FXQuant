import React, { useEffect, useRef, memo } from "react";

const SYMBOL_MAP = {
  EURUSD: "OANDA:EURUSD",
  USDJPY: "OANDA:USDJPY",
  GBPUSD: "OANDA:GBPUSD",
  AUDUSD: "OANDA:AUDUSD",
  USDCAD: "OANDA:USDCAD",
};

function PriceTickerWidget({ symbol }) {
  const containerRef = useRef();
  const isMounted = useRef(false);

  useEffect(() => {
    isMounted.current = true;

    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!containerRef.current || !isMounted.current) return;
    const container = containerRef.current;

    const widgetSymbol = SYMBOL_MAP[symbol] || "FX_IDC:GBPUSD";

    container.innerHTML = "";

    const timeoutId = setTimeout(() => {
      if (!container || !isMounted.current) return;

      const script = document.createElement("script");
      script.src =
        "https://s3.tradingview.com/external-embedding/embed-widget-single-quote.js";
      script.type = "text/javascript";
      script.async = true;
      script.innerHTML = JSON.stringify({
        symbol: widgetSymbol,
        width: "100%",
        colorTheme: "dark",
        isTransparent: true,
        locale: "en",
      });

      script.onerror = (error) => {
        console.warn("Price widget failed to load:", error);
      };

      if (container && isMounted.current) {
        container.appendChild(script);
      }
    }, 300);

    return () => {
      clearTimeout(timeoutId);
      container.innerHTML = "";
    };
  }, [symbol]);

  return (
    <div className="tradingview-widget-container" ref={containerRef}>
      <div className="tradingview-widget-container__widget"></div>
    </div>
  );
}

export default memo(PriceTickerWidget);
