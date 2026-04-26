import { useEffect, useState } from "react";
import Loading from "../components/Loading";
import { deleteSavedItem, listSavedItems } from "../api/fantasyApi";

function formatAvailability(value) {
  if (value == null) return "-";
  return `${Math.round(Number(value) * 100)}%`;
}

function SavedLineup({ item }) {
  const payload = item.payload || {};
  const picks = Array.isArray(payload.lineup) ? payload.lineup : [];
  const focus = Array.isArray(payload.focus) ? payload.focus : [];
  const punt = Array.isArray(payload.punt) ? payload.punt : [];

  if (picks.length === 0) {
    return <div style={styles.emptyPayload}>No lineup data stored for this item.</div>;
  }

  return (
    <div style={styles.detailWrap}>
      <div style={styles.metaRow}>
        <div style={styles.metaBlock}>
          <span style={styles.metaLabel}>Build</span>
          <span style={styles.metaValue}>{payload.title || item.title}</span>
        </div>
        <div style={styles.metaBlock}>
          <span style={styles.metaLabel}>Focus</span>
          <span style={styles.metaValue}>{focus.length ? focus.join(", ") : "None"}</span>
        </div>
        <div style={styles.metaBlock}>
          <span style={styles.metaLabel}>Punt</span>
          <span style={styles.metaValue}>{punt.length ? punt.join(", ") : "None"}</span>
        </div>
      </div>

      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Slot</th>
              <th style={styles.th}>Round</th>
              <th style={styles.th}>Overall</th>
              <th style={styles.th}>Player</th>
              <th style={styles.th}>Availability</th>
              <th style={styles.th}>2nd Option</th>
              <th style={styles.th}>2nd Avail.</th>
            </tr>
          </thead>
          <tbody>
            {picks.map((pick, index) => (
              <tr key={`${item.id}-${pick.player_id}-${index}`}>
                <td style={styles.td}>{pick.slot || "-"}</td>
                <td style={styles.td}>{pick.round ?? "-"}</td>
                <td style={styles.td}>{pick.overall ?? "-"}</td>
                <td style={styles.td}>
                  <b>{pick.name}</b>{" "}
                  {pick.note ? (
                    <span style={styles.lockNote}>({pick.note})</span>
                  ) : (
                    <span style={styles.playerMeta}>
                      ({pick.pos || "-"} | {pick.team || "-"})
                    </span>
                  )}
                </td>
                <td style={{ ...styles.td, ...styles.numeric }}>
                  {pick.note === "LOCK" ? "Locked" : formatAvailability(pick.availability)}
                </td>
                <td style={styles.td}>
                  {pick.second_option ? (
                    <>
                      <b>{pick.second_option.name}</b>{" "}
                      <span style={styles.playerMeta}>
                        ({pick.second_option.pos || "-"} | {pick.second_option.team || "-"})
                      </span>
                    </>
                  ) : (
                    "-"
                  )}
                </td>
                <td style={{ ...styles.td, ...styles.numeric }}>
                  {pick.second_option ? formatAvailability(pick.second_option.availability) : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Saved() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const res = await listSavedItems();
      const nextItems = res.data || [];
      setItems(nextItems);
      setOpenId((prev) => {
        if (nextItems.length === 0) return null;
        if (prev && nextItems.some((item) => item.id === prev)) return prev;
        return nextItems[0].id;
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const onDelete = async (id) => {
    await deleteSavedItem(id);
    load();
  };

  return (
    <div>
      <h2>Saved</h2>
      {loading ? (
        <Loading text="Loading saved items..." />
      ) : items.length === 0 ? (
        <div style={{ opacity: 0.8 }}>No saved items yet.</div>
      ) : (
        <div style={styles.list}>
          {items.map((item) => {
            const expanded = item.id === openId;
            return (
              <div key={item.id} style={styles.card}>
                <div style={styles.headerRow}>
                  <button type="button" onClick={() => setOpenId(expanded ? null : item.id)} style={styles.toggle}>
                    <div style={styles.title}>{item.title}</div>
                    <div style={styles.subtitle}>
                      {item.kind}
                      {item.season ? ` • ${item.season}` : ""}
                      {expanded ? " • Click to hide lineup" : " • Click to view lineup"}
                    </div>
                  </button>

                  <div style={styles.actions}>
                    <button type="button" onClick={() => setOpenId(expanded ? null : item.id)} style={styles.viewBtn}>
                      {expanded ? "Hide" : "View"}
                    </button>
                    <button type="button" onClick={() => onDelete(item.id)} style={styles.deleteBtn}>
                      Delete
                    </button>
                  </div>
                </div>

                {expanded ? <SavedLineup item={item} /> : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const styles = {
  list: {
    display: "grid",
    gap: 12,
  },
  card: {
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 18,
    padding: 16,
    background: "rgba(255,255,255,0.03)",
  },
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    flexWrap: "wrap",
  },
  toggle: {
    flex: 1,
    minWidth: 240,
    textAlign: "left",
    border: "none",
    background: "transparent",
    color: "inherit",
    padding: 0,
    cursor: "pointer",
  },
  title: {
    fontWeight: 800,
    fontSize: 18,
  },
  subtitle: {
    opacity: 0.75,
    fontSize: 13,
    marginTop: 4,
  },
  actions: {
    display: "flex",
    gap: 10,
    alignItems: "center",
  },
  viewBtn: {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)",
    color: "rgba(255,255,255,0.92)",
    fontWeight: 700,
    cursor: "pointer",
  },
  deleteBtn: {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.08)",
    color: "rgba(255,255,255,0.92)",
    fontWeight: 700,
    cursor: "pointer",
  },
  detailWrap: {
    marginTop: 16,
    paddingTop: 16,
    borderTop: "1px solid rgba(255,255,255,0.08)",
    display: "grid",
    gap: 14,
  },
  metaRow: {
    display: "flex",
    gap: 14,
    flexWrap: "wrap",
  },
  metaBlock: {
    display: "grid",
    gap: 4,
    minWidth: 160,
  },
  metaLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.9,
    color: "rgba(255,255,255,0.52)",
  },
  metaValue: {
    fontSize: 13,
    color: "rgba(255,255,255,0.9)",
  },
  tableWrap: {
    overflowX: "auto",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.08)",
  },
  table: {
    width: "100%",
    minWidth: 760,
    borderCollapse: "collapse",
    background: "rgba(255,255,255,0.02)",
  },
  th: {
    textAlign: "left",
    padding: "10px 12px",
    fontSize: 12,
    color: "rgba(255,255,255,0.72)",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.04)",
  },
  td: {
    padding: "10px 12px",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    fontSize: 13,
    color: "rgba(255,255,255,0.92)",
    verticalAlign: "top",
  },
  numeric: {
    whiteSpace: "nowrap",
  },
  playerMeta: {
    color: "rgba(255,255,255,0.58)",
  },
  lockNote: {
    color: "#ffd166",
  },
  emptyPayload: {
    padding: "10px 12px",
    borderRadius: 12,
    background: "rgba(255,255,255,0.04)",
    color: "rgba(255,255,255,0.72)",
    fontSize: 13,
  },
};
