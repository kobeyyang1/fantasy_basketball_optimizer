import { useEffect, useState } from "react";
import Loading from "../components/Loading";
import { deleteSavedItem, listSavedItems } from "../api/fantasyApi";

export default function Saved() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await listSavedItems();
      setItems(res.data || []);
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
        <div style={{ display: "grid", gap: 10 }}>
          {items.map((x) => (
            <div
              key={x.id}
              style={{
                border: "1px solid rgba(255,255,255,0.10)",
                borderRadius: 14,
                padding: 12,
                background: "rgba(255,255,255,0.03)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 800 }}>{x.title}</div>
                  <div style={{ opacity: 0.75, fontSize: 12 }}>
                    {x.kind} {x.season ? `• ${x.season}` : ""}
                  </div>
                </div>
                <button onClick={() => onDelete(x.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
