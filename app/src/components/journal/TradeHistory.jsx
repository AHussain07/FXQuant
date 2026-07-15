import React, { useState, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import { useAuth } from "../../context/AuthContext";
import { fetchTradeHistory } from "../../services/api";
import { getJournalEntries } from "../../services/journalService";
import Nav from "../layout/Nav";
import JournalModal from "./JournalModal";
import "../../styles/tradeHistory.css";

const CONFLUENCE_LABELS = [
  "Liquidity Sweep",
  "Break of Structure (BOS)",
  "Fair Value Gap (FVG)",
  "Inversion FVG",
  "SMT Divergence",
  "Equilibrium / Premium vs Discount",
  "Fib Extension",
];

const TradeHistory = () => {
  const { currentUser } = useAuth();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTradeId, setSelectedTradeId] = useState(null);
  const [exporting, setExporting] = useState(false);

  const [timeframe, setTimeframe] = useState("all");
  const [outcome, setOutcome] = useState("all");
  const [confluence, setConfluence] = useState("all");

  const loadHistory = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const data = await fetchTradeHistory(currentUser.uid, {
        timeframe,
        outcome,
        confluence,
      });
      setHistory(data);
    } catch (error) {
      console.error("Failed to load history", error);
    } finally {
      setLoading(false);
    }
  }, [currentUser, timeframe, outcome, confluence]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const formatDate = (dateString) => {
    if (!dateString) return "-";
    return (
      new Date(dateString).toLocaleDateString() +
      " " +
      new Date(dateString).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    );
  };

  const exportToExcel = async () => {
    setExporting(true);
    try {
      const journals = await getJournalEntries(currentUser.uid);
      const journalMap = {};
      journals.forEach((j) => {
        journalMap[j.tradeId] = j;
      });

      const headers = [
        "Symbol",
        "Type",
        "Lots",
        "Entry Price",
        "Exit Price",
        "P/L ($)",
        "Closed At",
        "Journal Notes",
        "Confluences",
      ];

      const rows = history.map((trade) => {
        const journal = journalMap[trade.tradeId];
        return [
          trade.symbol,
          trade.orderType?.toUpperCase() ?? "",
          (trade.lotSize || 0) / 100000,
          trade.entryPrice ?? null,
          trade.exitPrice ?? null,
          trade.profit ?? null,
          trade.closedAt ? new Date(trade.closedAt) : null,
          journal?.notes ?? "",
          journal?.confluences?.join("; ") ?? "",
        ];
      });

      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows], { cellDates: true });

      ws["!cols"] = [
        { wch: 10 },
        { wch: 6 },
        { wch: 6 },
        { wch: 12 },
        { wch: 12 },
        { wch: 12 },
        { wch: 18 },
        { wch: 40 },
        { wch: 40 },
      ];

      const formats = {
        2: "0.00",
        3: "0.00000",
        4: "0.00000",
        5: '"$"#,##0.00;[Red]"-$"#,##0.00',
        6: "yyyy-mm-dd hh:mm",
      };
      for (let r = 1; r <= history.length; r++) {
        for (const c of Object.keys(formats)) {
          const ref = XLSX.utils.encode_cell({ r, c: Number(c) });
          if (ws[ref] && ws[ref].v != null) ws[ref].z = formats[c];
        }
      }

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Trade History");
      XLSX.writeFile(
        wb,
        `trade-history-${new Date().toISOString().slice(0, 10)}.xlsx`
      );
    } catch (err) {
      console.error("Export failed", err);
      alert("Failed to export trade data.");
    } finally {
      setExporting(false);
    }
  };

  const formatProfitLoss = (profit) => {
    const absValue = Math.abs(profit).toFixed(2);
    return profit >= 0 ? `+$${absValue}` : `-$${absValue}`;
  };

  const formatSymbol = (symbol) => {
    if (!symbol) return "-";
    return symbol.length === 6
      ? `${symbol.slice(0, 3)}/${symbol.slice(3)}`
      : symbol;
  };

  return (
    <div className="trade-history-page">
      <Nav showLinks={true} />

      <div className="trade-history-container">
        <div className="history-header">
          <div className="history-heading">
            <span className="dash-eyebrow">Closed trades</span>
            <h2>Trade history</h2>
          </div>

          <div className="history-header-right">
            <button
              className="export-csv-btn"
              onClick={exportToExcel}
              disabled={exporting || history.length === 0}
            >
              {exporting ? "Exporting..." : "Export to Excel"}
            </button>

          <div className="history-filters">
            <select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value)}
              className="filter-select"
            >
              <option value="all">All Time</option>
              <option value="week">Last 7 Days</option>
              <option value="month">Last 30 Days</option>
              <option value="year">Last Year</option>
            </select>

            <select
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
              className="filter-select"
            >
              <option value="all">All Outcomes</option>
              <option value="win">Wins</option>
              <option value="loss">Losses</option>
            </select>

            <select
              value={confluence}
              onChange={(e) => setConfluence(e.target.value)}
              className="filter-select"
            >
              <option value="all">All Confluences</option>
              {CONFLUENCE_LABELS.map((label) => (
                <option key={label} value={label}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          </div>
        </div>

        <div className="table-responsive">
          <table className="history-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Type</th>
                <th>Lots</th>
                <th>Entry</th>
                <th>Exit</th>
                <th>Result (P/L)</th>
                <th>Closed At</th>
                <th>Journal</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="8" className="text-center">
                    Loading history…
                  </td>
                </tr>
              ) : history.length === 0 ? (
                <tr>
                  <td colSpan="8" className="text-center">
                    No closed trades match these filters.
                  </td>
                </tr>
              ) : (
                history.map((trade) => {
                  const isProfit = trade.profit >= 0;
                  return (
                    <tr key={trade.tradeId} className="history-row">
                      <td className="font-bold">{formatSymbol(trade.symbol)}</td>
                      <td>
                        <span className={`badge ${trade.orderType}`}>
                          {trade.orderType.toUpperCase()}
                        </span>
                      </td>
                      <td>{((trade.lotSize || 0) / 100000).toFixed(2)}</td>
                      <td>{trade.entryPrice?.toFixed(5)}</td>
                      <td>{trade.exitPrice?.toFixed(5)}</td>
                      <td className={isProfit ? "text-win" : "text-loss"}>
                        {formatProfitLoss(trade.profit)}
                      </td>
                      <td className="text-muted">
                        {formatDate(trade.closedAt)}
                      </td>
                      <td>
                        <button
                          className={`view-journal-btn ${
                            !trade.hasJournal ? "no-journal" : ""
                          }`}
                          onClick={() => setSelectedTradeId(trade.tradeId)}
                        >
                          {trade.hasJournal ? "View" : "Add"}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Phone layout: one card per trade, no sideways scrolling */}
        <div className="history-cards">
          {loading ? (
            <div className="history-cards-empty">Loading history…</div>
          ) : history.length === 0 ? (
            <div className="history-cards-empty">
              No closed trades match these filters.
            </div>
          ) : (
            history.map((trade) => {
              const isProfit = trade.profit >= 0;
              return (
                <article className="history-card" key={trade.tradeId}>
                  <div className="history-card-top">
                    <div className="history-card-pair">
                      <span className="history-card-symbol">
                        {formatSymbol(trade.symbol)}
                      </span>
                      <span className={`badge ${trade.orderType}`}>
                        {trade.orderType.toUpperCase()}
                      </span>
                    </div>
                    <span
                      className={`history-card-pl ${
                        isProfit ? "text-win" : "text-loss"
                      }`}
                    >
                      {formatProfitLoss(trade.profit)}
                    </span>
                  </div>

                  <div className="history-card-meta">
                    <span>{((trade.lotSize || 0) / 100000).toFixed(2)} lots</span>
                    <span className="history-card-sep">·</span>
                    <span>
                      {trade.entryPrice?.toFixed(5)} → {trade.exitPrice?.toFixed(5)}
                    </span>
                  </div>

                  <div className="history-card-foot">
                    <span className="history-card-date">
                      {formatDate(trade.closedAt)}
                    </span>
                    <button
                      className={`view-journal-btn ${
                        !trade.hasJournal ? "no-journal" : ""
                      }`}
                      onClick={() => setSelectedTradeId(trade.tradeId)}
                    >
                      {trade.hasJournal ? "View" : "Add"}
                    </button>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </div>

      {selectedTradeId && (
        <JournalModal
          tradeId={selectedTradeId}
          onClose={() => setSelectedTradeId(null)}
        />
      )}
    </div>
  );
};

export default TradeHistory;
