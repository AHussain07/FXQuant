import React from "react";
import "../../styles/statCard.css";
import InfoTooltip from "../common/InfoTooltip";

function StatCard({ title, value, subtitle, icon, trend, highlight, small, tooltip }) {
  return (
    <div
      className={`stat-card ${highlight ? "highlight" : ""} ${
        small ? "small" : ""
      }`}
    >
      <div className="stat-header">
        {icon && <span className="stat-icon">{icon}</span>}
        <span className="stat-title">
          {title}
          {tooltip && <InfoTooltip text={tooltip} direction="below" />}
        </span>
      </div>

      <div className="stat-value-container">
        <div className={`stat-value ${trend ? `trend-${trend}` : ""}`}>
          {value}
          {trend && (
            <span className="trend-indicator">
              {trend === "up" ? "↗" : "↘"}
            </span>
          )}
        </div>
        {subtitle && <div className="stat-subtitle">{subtitle}</div>}
      </div>
    </div>
  );
}

export default StatCard;
