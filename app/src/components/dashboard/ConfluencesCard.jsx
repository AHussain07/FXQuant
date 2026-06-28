import React from "react";
import "../../styles/dashboard.css";

function ConfluencesCard({ confluences }) {
  if (!confluences || confluences.length === 0) {
    return (
      <div className="info-card">
        <h3>Top Confluences</h3>
        <div className="empty-state">
          No journal entries with confluences yet
        </div>
      </div>
    );
  }

  return (
    <div className="info-card">
      <h3>Top Confluences</h3>
      <div className="confluences-list">
        {confluences.map((confluence, index) => (
          <div key={index} className="confluence-item">
            <div className="confluence-rank">#{index + 1}</div>
            <div className="confluence-info">
              <div className="confluence-name">{confluence.name}</div>
              <div className="confluence-count">
                Used {confluence.count} times
              </div>
            </div>
            <div className="confluence-bar">
              <div
                className="confluence-bar-fill"
                style={{
                  width: `${(confluence.count / confluences[0].count) * 100}%`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ConfluencesCard;
