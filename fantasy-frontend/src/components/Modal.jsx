// src/components/Modal.jsx
import React, { useEffect } from "react";

export default function Modal({ open, title, onClose, width = 920, children }) {
  useEffect(() => {
    if (!open) return;

    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onMouseDown={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,

        // dark overlay (keeps focus on modal)
        background: "rgba(3, 7, 18, 0.65)",
        backdropFilter: "blur(6px)",

        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 18,
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: width,

          // modal surface (neutral, not pure white)
          background: "rgba(17, 24, 39, 0.96)", // slate-900-ish
          color: "#e5e7eb", // slate-200

          borderRadius: 16,
          overflow: "hidden",
          boxShadow: "0 30px 90px rgba(0,0,0,0.55)",
          border: "1px solid rgba(255,255,255,0.10)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 16px",
            borderBottom: "1px solid rgba(255,255,255,0.10)",

            // subtle header sheen
            background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0))",
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 800, color: "#f9fafb" }}>
            {title}
          </div>

          <button
            onClick={onClose}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.16)",
              background: "rgba(255,255,255,0.06)",
              color: "#f9fafb",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Close
          </button>
        </div>

        {/* Body */}
        <div
          style={{
            padding: 16,
            maxHeight: "75vh",
            overflow: "auto",
            color: "#e5e7eb",
          }}
        >
          {/* Readability defaults for typical content inside modal */}
          <div
            style={{
              color: "#e5e7eb",
              lineHeight: 1.45,
            }}
          >
            {/* This wrapper gives tables a consistent readable look */}
            <div
              style={{
                // make any table inside look good without editing page code
                // (your inline table border="1" will still work, but this helps)
              }}
            >
              {children}
            </div>
          </div>
        </div>

        {/* Global-ish styling for tables inside modal (works because it’s inside the component) */}
        <style>{`
          /* Table base */
          div[role="dialog"] table,
          table {
            color: #e5e7eb;
          }

          table {
            width: 100%;
            border-collapse: collapse;
          }

          th {
            text-align: left;
            background: rgba(255,255,255,0.06);
            color: #f9fafb;
            border: 1px solid rgba(255,255,255,0.10);
          }

          td {
            border: 1px solid rgba(255,255,255,0.08);
          }

          tr:hover td {
            background: rgba(255,255,255,0.03);
          }
        `}</style>
      </div>
    </div>
  );
}
