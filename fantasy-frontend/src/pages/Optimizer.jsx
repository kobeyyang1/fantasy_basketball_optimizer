// src/pages/Optimizer.jsx
import { useEffect, useMemo, useState } from "react";
import Loading from "../components/Loading";
import SeasonDropdown from "../components/SeasonDropdown";
import PuntSelector from "../components/PuntSelector";
import { useSeason } from "../hooks/useSeason";
import { useLeagueStats } from "../hooks/useLeagueStats";
import { getRotoRiskRankings, getActivePlayersStats, getPlayersWithStats } from "../api/fantasyApi";
import { createSavedItem } from "../api/fantasyApi";
import { useNavigate } from "react-router-dom";

const DEFAULT_ROUNDS = 9;
const DEFAULT_SLOTS = ["PG", "SG", "SF", "PF", "C", "G", "F", "UTIL", "UTIL"];

const ALL_CATS = [
  "fg_pct",
  "ft_pct",
  "three_pm",
  "points",
  "rebounds",
  "assists",
  "steals",
  "blocks",
  "turnovers",
];

// ---------------- helpers ----------------
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

function snakePick(leagueSize, draftSlot1Indexed, round1Indexed) {
  const n = leagueSize;
  const slot = draftSlot1Indexed;
  const r = round1Indexed;
  if (r % 2 === 1) return (r - 1) * n + slot;
  return r * n - slot + 1;
}

// Probability player is still there at your pick, given their overall “rank”.
// Higher rank number = later pick = more likely available.
function availabilityProb(rank, pick) {
  // rank smaller = earlier pick (harder to still be available later)
  const softness = 6; // tweak: higher = softer curve
  const x = (rank - pick) / softness; // flipped
  return 1 / (1 + Math.exp(-x));
}

function normalizePos(pos) {
  const p = (pos || "").toLowerCase();
  if (!p) return [];
  const tokens = p
    .replace("/", "-")
    .split("-")
    .map((x) => x.trim())
    .filter(Boolean);

  const out = new Set();

  for (const t of tokens) {
    if (t === "pg") out.add("PG");
    if (t === "sg") out.add("SG");
    if (t === "sf") out.add("SF");
    if (t === "pf") out.add("PF");
    if (t === "c" || t === "center") out.add("C");

    if (t === "g" || t === "guard") {
      out.add("PG");
      out.add("SG");
      out.add("G");
    }
    if (t === "f" || t === "forward") {
      out.add("SF");
      out.add("PF");
      out.add("F");
    }
  }

  if (out.has("PG") || out.has("SG")) out.add("G");
  if (out.has("SF") || out.has("PF")) out.add("F");

  return Array.from(out);
}

function canFillSlot(playerEligible, slot) {
  if (slot === "UTIL") return true;
  return playerEligible.includes(slot);
}

function weightForCat(cat, focusCats, puntCats) {
  if (puntCats.includes(cat)) return 0;
  if (focusCats.includes(cat)) return 1.8; // stronger focus influence
  return 1.0;
}

// ---------------- targets + diminishing returns ----------------
function buildTargets({ focusCats, puntCats }) {
  const targets = {};
  for (const cat of ALL_CATS) {
    if (puntCats.includes(cat)) {
      targets[cat] = 0;
      continue;
    }
    targets[cat] = focusCats.includes(cat) ? 4.5 : 2.2;
  }
  return targets;
}

function progressTowardTarget(teamZ, targetZ) {
  if (targetZ <= 0) return 0;
  const x = teamZ / targetZ;
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return x;
}

function marginalCategoryGain({ teamZByCat, candZByCat, targets, focusCats, puntCats }) {
  let gain = 0;

  for (const cat of ALL_CATS) {
    const w = weightForCat(cat, focusCats, puntCats);
    if (w === 0) continue;

    const t = targets[cat] ?? 0;
    if (t <= 0) continue;

    const before = teamZByCat[cat] ?? 0;
    const dz = candZByCat[cat] ?? 0;

    const p0 = progressTowardTarget(before, t);
    const p1 = progressTowardTarget(before + dz, t);

    gain += w * (p1 - p0);
  }

  return gain;
}

//  Use backend z_scores so locks/focus really change output (and matches rankings)
function candidateZVectorFromRankings(playerId, zById) {
  const z = zById.get(playerId) || {};
  const out = {};
  for (const cat of ALL_CATS) out[cat] = Number(z[cat] ?? 0) || 0;
  return out;
}

/**
 * Scoring:
 * - catGain dominates (locks/focus must matter)
 * - reachPressure/durability are nudges
 * - antiOverstack reduces piling into already-won categories
 */
function scoreCandidate({
  playerId,
  zById,
  teamZByCat,
  focusCats,
  puntCats,
  pick,
  rank,
  riskRaw,
}) {
  const targets = buildTargets({ focusCats, puntCats });
  const candZByCat = candidateZVectorFromRankings(playerId, zById);

  const catGain = marginalCategoryGain({
    teamZByCat,
    candZByCat,
    targets,
    focusCats,
    puntCats,
  });

  const prob = availabilityProb(rank, pick);
  const reachPressure = 1 - prob; // higher when prob is low
  const dur = num(riskRaw) ?? 0;

  let antiOverstack = 0;
  for (const cat of ALL_CATS) {
    if (puntCats.includes(cat)) continue;
    const t = targets[cat] ?? 0;
    if (t <= 0) continue;

    const prog = progressTowardTarget(teamZByCat[cat] ?? 0, t);
    if (prog >= 0.85) {
      const dz = candZByCat[cat] ?? 0;
      if (dz > 0) antiOverstack += 0.06 * dz;
    }
  }

  const score =
    catGain * 40.0 + // BIG driver
    dur * 0.9 +
    reachPressure * 0.6 -
    antiOverstack * 3.0;

  return { score, prob, catGain };
}

function buildLineup({
  leagueSize,
  draftSlot,
  rounds,
  slots,
  focusCats,
  puntCats,
  lockedIds,
  rankings,
  statsById,
}) {
  // player_id -> overall rank (1..N)
  const rankMap = new Map();
  rankings.forEach((r, idx) => rankMap.set(r.player_id, idx + 1));

  // player_id -> z_scores (from backend)
  const zById = new Map();
  rankings.forEach((r) => zById.set(r.player_id, r.z_scores || {}));

  // quick lookup of ranking row by id (for names / risk)
  const rankRowById = new Map();
  rankings.forEach((r) => rankRowById.set(r.player_id, r));

  const chosen = [];
  const usedIds = new Set();

  // team z accumulation
  const teamZByCat = {};
  for (const cat of ALL_CATS) teamZByCat[cat] = 0;

  // ---------- Locks consume early rounds ----------
  // Lock #1 = Round 1 pick, Lock #2 = Round 2 pick, etc.
  lockedIds.forEach((id, i) => {
    const s = statsById.get(id);
    const r = rankRowById.get(id);
    if (!s || !r) return;

    const round = i + 1;
    const overall = snakePick(leagueSize, draftSlot, round);

    chosen.push({
      round,
      overall,
      player_id: id,
      name: r.player_name,
      pos: s.position || "-",
      team: s.team || "-",
      note: "LOCK",
      slot: null,
      availability: null,
    });

    const zvec = candidateZVectorFromRankings(id, zById);
    for (const cat of ALL_CATS) teamZByCat[cat] += zvec[cat] ?? 0;

    usedIds.add(id);
  });

  // slots remaining and assign slots for locks first
  const slotsRemaining = [...slots];
  for (const pick of chosen) {
    const eligible = normalizePos(pick.pos);
    const idx = slotsRemaining.findIndex((slot) => canFillSlot(eligible, slot));
    if (idx >= 0) {
      pick.slot = slotsRemaining[idx];
      slotsRemaining.splice(idx, 1);
    } else {
      pick.slot = "UTIL";
    }
  }

  // Start drafting AFTER locks
  const startRound = chosen.length + 1;

  for (let round = startRound; round <= rounds; round++) {
    if (chosen.length >= slots.length) break;
    if (slotsRemaining.length === 0) break;

    const overall = snakePick(leagueSize, draftSlot, round);

    // candidate set: can fill remaining slots
    const candidates = [];
    for (const r of rankings) {
      const id = r.player_id;
      if (usedIds.has(id)) continue;

      const s = statsById.get(id);
      if (!s) continue;

      const eligible = normalizePos(s.position);
      if (!slotsRemaining.some((slot) => canFillSlot(eligible, slot))) continue;

      const rank = rankMap.get(id) ?? 9999;
      const prob = availabilityProb(rank, overall);

      // only filter truly impossible picks; allow some risk
      if (prob < 0.15) continue;

      candidates.push({ r, s, rank });
    }

    if (!candidates.length) continue;

    let best = null;
    let bestScore = -Infinity;

    for (const c of candidates) {
      const { score } = scoreCandidate({
        playerId: c.r.player_id,
        zById,
        teamZByCat,
        focusCats,
        puntCats,
        pick: overall,
        rank: c.rank,
        riskRaw: c.r.risk_raw,
      });

      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }

    if (!best) continue;

    const eligible = normalizePos(best.s.position);

    // fill non-UTIL slots first
    let slotIdx = slotsRemaining.findIndex((slot) => slot !== "UTIL" && canFillSlot(eligible, slot));
    if (slotIdx < 0) slotIdx = slotsRemaining.findIndex((slot) => canFillSlot(eligible, slot));

    const assignedSlot = slotIdx >= 0 ? slotsRemaining[slotIdx] : "UTIL";
    if (slotIdx >= 0) slotsRemaining.splice(slotIdx, 1);

    // update team z (✅ from backend z_scores)
    const zvec = candidateZVectorFromRankings(best.r.player_id, zById);
    for (const cat of ALL_CATS) teamZByCat[cat] += zvec[cat] ?? 0;

    usedIds.add(best.r.player_id);

    chosen.push({
      round,
      overall,
      player_id: best.r.player_id,
      name: best.r.player_name,
      pos: best.s.position || "-",
      team: best.s.team || "-",
      slot: assignedSlot,
      availability: availabilityProb(best.rank, overall),
      note: null,
    });
  }

  return chosen.slice(0, slots.length);
}

export default function Optimizer() {
  const nav = useNavigate();
  const { season, setSeason, seasons } = useSeason();
  const { league, loading: loadingLeague } = useLeagueStats(); // still used for UI/loading gating

  const [leagueSize, setLeagueSize] = useState(12);
  const [draftSlot, setDraftSlot] = useState(2);
  const [rounds, setRounds] = useState(DEFAULT_ROUNDS);

  const [focusCats, setFocusCats] = useState(["assists", "three_pm", "steals", "ft_pct"]);
  const [puntCats, setPuntCats] = useState(["turnovers"]);

  const [allPlayers, setAllPlayers] = useState([]);
  const [lockedIds, setLockedIds] = useState([]);

  const [rankings, setRankings] = useState([]);
  const [statsById, setStatsById] = useState(new Map());

  const [loading, setLoading] = useState(true);
  const [loadingPlayers, setLoadingPlayers] = useState(true);

  const [lineups, setLineups] = useState([]);

  const [lockQuery, setLockQuery] = useState("");

  useEffect(() => {
    setLoadingPlayers(true);
    getPlayersWithStats()
      .then((res) => setAllPlayers(res.data || []))
      .catch((err) => {
        console.error(err);
        alert("Failed to load players list.");
      })
      .finally(() => setLoadingPlayers(false));
  }, []);

  useEffect(() => {
    setDraftSlot((s) => clamp(s, 1, leagueSize));
  }, [leagueSize]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    async function load() {
      try {
        const [ranksRes, statsRes] = await Promise.all([
          getRotoRiskRankings({ season, risk_weight: 0, limit: 500 }),
          getActivePlayersStats({ season }),
        ]);

        if (cancelled) return;

        setRankings(ranksRes.data || []);

        const m = new Map();
        (statsRes.data || []).forEach((row) => {
          if (row?.id != null) m.set(Number(row.id), row);
        });
        setStatsById(m);
      } catch (err) {
        console.error(err);
        alert("Failed to load optimizer data. Check backend + CORS.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [season]);

  const disabledIds = useMemo(() => new Set(lockedIds), [lockedIds]);

  const addLockById = (id) => {
    if (!id) return;
    setLockedIds((prev) => {
      if (prev.includes(id)) return prev;
      if (prev.length >= 3) return prev;
      return [...prev, id];
    });
    setLockQuery("");
  };

  const removeLock = (id) => setLockedIds((prev) => prev.filter((x) => x !== id));

  const lockResults = useMemo(() => {
    const q = lockQuery.trim().toLowerCase();
    if (!q) return [];
    return allPlayers
      .filter((p) => !disabledIds.has(p.id))
      .filter((p) => (p.name || "").toLowerCase().includes(q))
      .slice(0, 8);
  }, [lockQuery, allPlayers, disabledIds]);

  const generateLineups = () => {
    // rankings + statsById are the true required inputs
    if (!rankings.length || !statsById.size) {
      alert("Still loading rankings/stats. Try again in a second.");
      return;
    }

    const lineup = buildLineup({
      leagueSize,
      draftSlot,
      rounds,
      slots: DEFAULT_SLOTS,
      focusCats,
      puntCats,
      lockedIds,
      rankings,
      statsById,
    });

    setLineups([
      {
        title: "Targeted Build",
        focus: focusCats,
        punt: puntCats,
        lineup,
      },
    ]);
  };

  const saveLineup = async (lineupObject) => {
    try {
      await createSavedItem({
        kind: "lineup",
        title: "Lineup 1",
        season,
        payload: lineupObject, // store exactly what you render
      });
      alert("Saved!");
    } catch (e) {
      if (e?.response?.status === 401) nav("/login");
      else alert("Save failed.");
    }
  };

  return (
    <div>
      <h2>Optimizer</h2>
      <p>
        Builds lineups using <b>category targets + diminishing returns</b> so locks & focus categories actually
        change the result.
      </p>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", margin: "14px 0" }}>
        <div>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>Season</div>
          <SeasonDropdown value={season} onChange={setSeason} seasons={seasons} />
        </div>

        <div>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>League size</div>
          <select value={leagueSize} onChange={(e) => setLeagueSize(Number(e.target.value))} style={{ padding: 8 }}>
            {[8, 10, 12, 14, 16].map((n) => (
              <option key={n} value={n}>
                {n} teams
              </option>
            ))}
          </select>
        </div>

        <div>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>Your draft slot</div>
          <select value={draftSlot} onChange={(e) => setDraftSlot(Number(e.target.value))} style={{ padding: 8 }}>
            {Array.from({ length: leagueSize }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                Pick {n}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>Rounds planned</div>
          <select value={rounds} onChange={(e) => setRounds(Number(e.target.value))} style={{ padding: 8 }}>
            {[7, 8, 9, 10, 11, 12].map((n) => (
              <option key={n} value={n}>
                {n} rounds
              </option>
            ))}
          </select>
        </div>

        <div style={{ alignSelf: "end" }}>
          <button onClick={generateLineups} disabled={loading || loadingLeague}>
            Generate lineup
          </button>
        </div>
      </div>

      {/* Build-around: search only */}
      <div style={{ marginTop: 10, maxWidth: 520 }}>
        <h3>Build around (optional — up to 3 players)</h3>

        {loadingPlayers ? (
          <Loading text="Loading player search..." />
        ) : (
          <div style={{ position: "relative" }}>
            <input
              value={lockQuery}
              onChange={(e) => setLockQuery(e.target.value)}
              placeholder="Search player name..."
              style={{ width: "100%", padding: 10 }}
            />

            {lockResults.length > 0 && (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  right: 0,
                  zIndex: 30,
                  borderRadius: 12,
                  overflow: "hidden",
                  background: "rgba(20,20,24,0.98)",
                  border: "1px solid rgba(255,255,255,0.10)",
                  boxShadow: "0 14px 40px rgba(0,0,0,0.55)",
                  marginTop: 8,
                }}
              >
                {lockResults.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => addLockById(p.id)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "10px 12px",
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                      color: "#fff",
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                    }}
                  >
                    <span>
                      <b>{p.name}</b>{" "}
                      <span style={{ color: "#aaa" }}>
                        {p.team ? `• ${p.team}` : ""} {p.position ? `(${p.position})` : ""}
                      </span>
                    </span>
                    <span style={{ color: "#9bdcff", fontWeight: 700 }}>Add</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {lockedIds.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <b>Locked:</b>
            <ul style={{ marginTop: 6 }}>
              {lockedIds.map((id) => {
                const p = allPlayers.find((x) => x.id === id);
                return (
                  <li key={id} style={{ marginBottom: 6 }}>
                    <button onClick={() => removeLock(id)}>Remove</button>{" "}
                    {p ? <b>{p.name}</b> : <b>Player #{id}</b>}{" "}
                    <span style={{ color: "#aaa" }}>{p?.position ? `(${p.position})` : ""}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      <div style={{ marginTop: 14 }}>
        <h3>Focus categories</h3>
        <div style={{ color: "#aaa", marginBottom: 8 }}>
          Focus cats have higher target thresholds (the build actively tries to “win” them).
        </div>
        <PuntSelector value={focusCats} onChange={setFocusCats} />
      </div>

      <div style={{ marginTop: 14 }}>
        <h3>Punt categories</h3>
        <div style={{ color: "#aaa", marginBottom: 8 }}>Punted cats are ignored in scoring.</div>
        <PuntSelector value={puntCats} onChange={setPuntCats} />
      </div>

      {loading || loadingLeague ? (
        <Loading text="Loading optimizer data..." />
      ) : lineups.length === 0 ? (
        <div style={{ marginTop: 16, color: "#aaa" }}>
          Click <b>Generate lineup</b> to see a draft plan.
        </div>
      ) : (
        <div style={{ marginTop: 18, display: "grid", gap: 14 }}>
          {lineups.map((b) => (
            <div
              key={b.title}
              style={{
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 14,
                padding: 14,
                background: "rgba(255,255,255,0.03)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{b.title}</div>
                  <div style={{ color: "#aaa", marginTop: 4 }}>
                    Focus: <b style={{ color: "#fff" }}>{b.focus.join(", ") || "None"}</b>
                    {b.punt?.length ? (
                      <>
                        {" "}
                        • Punt: <b style={{ color: "#fff" }}>{b.punt.join(", ")}</b>
                      </>
                    ) : null}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ color: "#aaa" }}>
                    Slot {draftSlot} • {leagueSize} teams • {season}
                  </div>
                  <button onClick={() => saveLineup(b)}>Save lineup</button>
                </div>
              </div>

              <div style={{ marginTop: 12, overflowX: "auto" }}>
                <table border="1" cellPadding="8" style={{ borderCollapse: "collapse", width: "100%", minWidth: 720 }}>
                  <thead>
                    <tr>
                      <th>Slot</th>
                      <th>Round</th>
                      <th>Overall</th>
                      <th>Player</th>
                      <th>Pos</th>
                      <th>Team</th>
                      <th>Availability</th>
                    </tr>
                  </thead>
                  <tbody>
                    {b.lineup.map((p, i) => (
                      <tr key={`${p.player_id}-${i}`}>
                        <td>{p.slot || "-"}</td>
                        <td>{p.round ?? "-"}</td>
                        <td>{p.overall ?? "-"}</td>
                        <td>
                          <b>{p.name}</b>{" "}
                          {p.note ? <span style={{ color: "#ffd166" }}>({p.note})</span> : null}
                        </td>
                        <td>{p.pos}</td>
                        <td>{p.team}</td>
                        <td style={{ textAlign: "right" }}>
                          {p.note === "LOCK" ? "Locked" : `${Math.round((p.availability ?? 0) * 100)}%`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ marginTop: 8, color: "#aaa" }}>
                Note: picks are driven by “what your team still needs” — and locks consume your early rounds.
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
