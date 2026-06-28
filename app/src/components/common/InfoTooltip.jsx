import React, { useState, useRef } from "react";
import { createPortal } from "react-dom";

const TOOLTIP_WIDTH = 220;
const TOOLTIP_GAP = 8;

function InfoTooltip({ text }) {
  const [pos, setPos] = useState(null);
  const iconRef = useRef(null);

  const handleMouseEnter = () => {
    if (!iconRef.current) return;
    const rect = iconRef.current.getBoundingClientRect();
    // Align right edge of tooltip with right edge of icon,
    // but clamp so it never goes off the left of the viewport.
    const left = Math.max(TOOLTIP_GAP, rect.right - TOOLTIP_WIDTH);
    const bottom = window.innerHeight - rect.top + TOOLTIP_GAP;
    setPos({ left, bottom });
  };

  const handleMouseLeave = () => setPos(null);

  return (
    <span
      className="info-icon-wrapper"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <span className="info-icon" ref={iconRef}>i</span>
      {pos &&
        createPortal(
          <span
            className="info-tooltip info-tooltip-portal"
            style={{
              position: "fixed",
              bottom: pos.bottom,
              left: pos.left,
              width: TOOLTIP_WIDTH,
            }}
          >
            {text}
          </span>,
          document.body
        )}
    </span>
  );
}

export default InfoTooltip;
