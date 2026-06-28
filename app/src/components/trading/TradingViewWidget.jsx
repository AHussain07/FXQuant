import React, { useEffect, useRef, memo } from "react";

const SYMBOL_MAP = {
  EURUSD: "OANDA:EURUSD",
  USDJPY: "OANDA:USDJPY",
  GBPUSD: "OANDA:GBPUSD",
  AUDUSD: "OANDA:AUDUSD",
  USDCAD: "OANDA:USDCAD",
};

function TradingViewWidget({ symbol }) {
  const containerRef = useRef();

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    const widgetSymbol = SYMBOL_MAP[symbol] || "FX_IDC:GBPUSD";

    container.innerHTML = "";

    const widgetDiv = document.createElement("div");
    widgetDiv.className = "tradingview-widget-container__widget";
    container.appendChild(widgetDiv);

    const timeoutId = setTimeout(() => {
      const script = document.createElement("script");
      script.src =
        "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
      script.type = "text/javascript";
      script.async = true;
      script.innerHTML = JSON.stringify({
        autosize: true,
        symbol: widgetSymbol,
        interval: "D",
        timezone: "Etc/UTC",
        theme: "dark",
        style: "1",
        locale: "en",
        enable_publishing: false,
        allow_symbol_change: false,
        hide_side_toolbar: false,
        hide_volume: true,
        support_host: "https://www.tradingview.com",
      });

      if (container) {
        container.appendChild(script);
      }
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      container.innerHTML = "";
    };
  }, [symbol]);

  return (
    <div
      className="tradingview-widget-container"
      ref={containerRef}
      style={{ height: "100%", width: "100%" }}
    />
  );
}

export default memo(TradingViewWidget);
