export default function Modal({ open, title, onClose, children, width = 720 }) {
  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: width,
          background: "#fff",
          borderRadius: 12,
          border: "1px solid #ddd",
          boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "12px 14px",
            borderBottom: "1px solid #eee",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div style={{ fontWeight: 700 }}>{title}</div>
          <button onClick={onClose} style={{ padding: "6px 10px" }}>
            Close
          </button>
        </div>

        <div style={{ padding: 14, maxHeight: "70vh", overflow: "auto" }}>
          {children}
        </div>
      </div>
    </div>
  );
}
