const PAIRS = [
  { key: "EURUSD", base: "EUR", quote: "USD" },
  { key: "USDJPY", base: "USD", quote: "JPY" },
  { key: "GBPUSD", base: "GBP", quote: "USD" },
  { key: "AUDUSD", base: "AUD", quote: "USD" },
  { key: "USDCAD", base: "USD", quote: "CAD" },
];

export default function WatchlistWidget({ selected, onSelect }) {
  return (
    <div className="watchlist">
      {PAIRS.map((pair) => (
        <button
          key={pair.key}
          className={`watchlist-row ${selected === pair.key ? "watchlist-row-active" : ""}`}
          onClick={() => onSelect(pair.key)}
        >
          <span className="watchlist-base">{pair.base}</span>
          <span className="watchlist-slash">/</span>
          <span className="watchlist-quote">{pair.quote}</span>
        </button>
      ))}
    </div>
  );
}
