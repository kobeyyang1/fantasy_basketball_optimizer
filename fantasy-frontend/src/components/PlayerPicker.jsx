import { useMemo, useState } from "react";

export default function PlayerPicker({ allPlayers, onAdd, disabledIds }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allPlayers.slice(0, 50);

    return allPlayers
      .filter((p) => (p.name || "").toLowerCase().includes(q))
      .slice(0, 50);
  }, [query, allPlayers]);

  return (
    <div style={{ marginBottom: 16 }}>
      <h3>Add Players</h3>

      <input
        type="text"
        placeholder="Search player name..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ width: 320, padding: 6, marginBottom: 8 }}
      />

      <div style={{ border: "1px solid #ccc", padding: 8, maxWidth: 560 }}>
        {filtered.map((p) => {
          const isDisabled = disabledIds.has(p.id);

          return (
            <div
              key={p.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "6px 0",
                borderBottom: "1px solid #eee",
              }}
            >
              <div>
                <b>{p.name}</b>{" "}
                <span style={{ color: "#666" }}>
                  {p.team_full_name || p.team || ""}{" "}
                  {p.position ? `(${p.position})` : ""}
                </span>
              </div>

              <button onClick={() => onAdd(p)} disabled={isDisabled}>
                {isDisabled ? "Added" : "Add"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
