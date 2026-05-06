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
import { tokenStore } from "../api/api";

const DEFAULT_ROUNDS = 9;
const DEFAULT_SLOTS = ["PG", "SG", "SF", "PF", "C", "G", "F", "UTIL", "UTIL"];
const PENDING_SAVE_KEY = "pending_optimizer_save_v1";

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

// Probability that player is still there at your pick, given their overall “rank”.
// Higher rank number = later pick = more likely available.
function availabilityProb(rank, pick) {
  // smaller rank = earlier pick (harder to still be available later)
  const softness = 7; // controls how quickly availability drops as rank gets worse than pick; smaller softness = sharper drop-off, larger softness = more gradual drop-off.
  const x = (rank - pick) / softness; // normalize the difference between rank and pick by softness to control the steepness of the curve
  return 1 / (1 + Math.exp(-x)); //convert normalized difference to a probability
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

function weightForCat(cat, focusCats, puntCats) { // adjusts category weights
  if (puntCats.includes(cat)) return 0;
  if (focusCats.includes(cat)) return 1.8; // stronger focus influence
  return 1.0;
}

// ---------------- targets + diminishing returns ----------------
function buildTargets({ focusCats, puntCats }) { // sets category targets based on focus and punt selections; focus cats have higher targets, punt cats are set to 0
  const targets = {};
  for (const cat of ALL_CATS) { // iterate through all categories to build target thresholds
    if (puntCats.includes(cat)) { // if category is punted, set target to 0 so it doesn't influence scoring
      targets[cat] = 0;
      continue;
    }
    targets[cat] = focusCats.includes(cat) ? 4.5 : 2.2; // focus categories have higher targets (4.5) to encourage the optimizer to build around them, while non-focus categories have lower targets (2.2) that still contribute but are easier to "win"
  }
  return targets;
}

function progressTowardTarget(teamZ, targetZ) { // calculates progress toward a category target with diminishing returns
  if (targetZ <= 0) return 0; 
  const x = teamZ / targetZ; // progress is linear up to the target, but we clamp it between 0 and 1 to reflect that contributions beyond the target have no additional value (diminishing returns). This encourages the optimizer to diversify category contributions rather than piling too much into one category.
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return x;
}

function marginalCategoryGain({ teamZByCat, candZByCat, targets, focusCats, puntCats }) {
  let gain = 0; // calculate marginal gain in category progress from adding a player, weighted by category importance (focus/punt)

  for (const cat of ALL_CATS) { // iterate through all categories to calculate gain
    const w = weightForCat(cat, focusCats, puntCats); // get weight for category based on focus/punt
    if (w === 0) continue;

    const t = targets[cat] ?? 0; // if target is 0 (either punted or default), skip since it doesn't contribute to gain
    if (t <= 0) continue; // skip categories with no target

    const before = teamZByCat[cat] ?? 0; // current team z in this category before adding the player
    const dz = candZByCat[cat] ?? 0; // candidate player's z contribution in this category; if null/undefined, treat as 0

    const p0 = progressTowardTarget(before, t); // progress toward target before adding player
    const p1 = progressTowardTarget(before + dz, t); // progress toward target after adding player

    gain += w * (p1 - p0); // marginal gain in progress toward target, weighted by category importance; this encourages the optimizer to value players who contribute more to focus categories and less to punt categories, while also considering diminishing returns as you get closer to targets
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
  nextPick,
  rank,
  combinedScore,
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

  const prob = availabilityProb(rank, pick); // if the player is very unlikely to be available, we give them a score of -Infinity to effectively remove them from consideration
  if (prob < 0.22) return { score: -Infinity, prob, catGain };

  const probNext = nextPick ? availabilityProb(rank, nextPick) : 0; // probability at next pick
  const urgency = clamp(prob - probNext, 0, 1); // urgency to pick this player now rather than later; if prob is much higher than probNext, it means the player likely won't be available at next pick, so urgency is high
  const valueDelta = pick - rank; // positive = value, negative = reach
  const reachPenalty = valueDelta < -2 ? Math.abs(valueDelta + 2) / 18 : 0; // penalize players who are ranked much higher than the current pick (i.e., reaches), with a buffer of 2 picks where there's no penalty, and then increasing penalty as you reach more and more for a player who is unlikely to be available.
  const valueBonus = valueDelta > 0 ? Math.min(valueDelta / 22, 1.2) : 0; // bonus for value picks, capped at 1.2 for players who are ranked much lower than the current pick (i.e., steals), with a scaling factor of 22 to control how quickly the bonus increases.
  const rawValue = num(combinedScore) ?? 0; // use combined_score from backend as a tiebreaker for players with similar category gain, since it incorporates overall player value and risk into a single metric based on the backend's model. This allows the optimizer to prefer players who not only fit the category needs but also have strong overall profiles according to the backend's analysis.
  const dur = num(riskRaw) ?? 0; // durability/risk metric from backend; lower risk (higher durability) should increase score, but we treat it as a nudge rather than a dominant factor since it's less directly related to category needs and more about overall player reliability.

  let antiOverstack = 0; // protection against overstacking categories that are already close to target
  for (const cat of ALL_CATS) {
    if (puntCats.includes(cat)) continue; // skip punt categories since they don't contribute to targets and we don't want them to influence overstacking penalties
    const t = targets[cat] ?? 0;
    if (t <= 0) continue;

    const prog = progressTowardTarget(teamZByCat[cat] ?? 0, t); // how close we are to the target in this category before adding the player
    if (prog >= 0.85) { // if we're already close to the target (prog >= 0.85), we start applying an overstacking penalty for adding more players who contribute to this category, since it has diminishing returns and we want to encourage more balanced builds.
      const dz = candZByCat[cat] ?? 0; // The penalty is proportional to how much the candidate contributes to this category (dz) and only applies if dz > 0 (i.e., the player would push us closer to or beyond the target).
      if (dz > 0) antiOverstack += 0.06 * dz; // the 0.06 factor controls how harsh the penalty is for overstacking; this encourages the optimizer to diversify category contributions rather than piling too much into categories that are already close to their targets, which can lead to more well-rounded lineups.
    }
  }

  const score =
    catGain * 34.0 +
    rawValue * 1.6 +
    urgency * 2.8 +
    dur * 0.5 +
    valueBonus * 1.2 -
    antiOverstack * 3.0 -
    reachPenalty * 2.6;

  const buildScore = catGain * 34.0 + rawValue * 1.6 + dur * 0.5 - antiOverstack * 3.0;
  return { score, buildScore, prob, catGain };
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
    const s = statsById.get(id); // need stats for position eligibility
    const r = rankRowById.get(id); // need ranking for name and availability
    if (!s || !r) return; // if we don't have stats or ranking info for a locked player, we skip them (they won't be included in the lineup)

    const round = i + 1; // assign locks to the earliest rounds
    const overall = snakePick(leagueSize, draftSlot, round); // calculate overall pick number for this lock based on its assigned round

    chosen.push({ // add lock to Chosen list
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

  
  const slotsRemaining = [...slots]; // create a mutable copy of slots to track which roster slots are still open as we assign locks and draft players.
  for (const pick of chosen) { // assign locked players to their appropriate slots based on their position eligibility, prioritizing non-UTIL slots first.
    const eligible = normalizePos(pick.pos); 
    const idx = slotsRemaining.findIndex((slot) => canFillSlot(eligible, slot)); // find the first available slot that the player can fill
    if (idx >= 0) { // if we found an eligible slot
      pick.slot = slotsRemaining[idx]; // assign the player to that slot
      slotsRemaining.splice(idx, 1); // remove that slot from the remaining slots since it's now filled
    } else { // if no eligible non-UTIL slot is available
      pick.slot = "UTIL"; // assign the player to a UTIL slot
    }
  }

  // Start drafting AFTER locks
  const startRound = chosen.length + 1;

  for (let round = startRound; round <= rounds; round++) { // controls how many rounds the optimizer plans for.
    if (chosen.length >= slots.length) break;
    if (slotsRemaining.length === 0) break;

    const overall = snakePick(leagueSize, draftSlot, round); // overall = current pick number
    const nextOverall = round < rounds ? snakePick(leagueSize, draftSlot, round + 1) : null; // nextOverall = your next pick number

    // candidate set: can fill remaining slots
    const candidates = [];
    for (const r of rankings) {
      const id = r.player_id;
      if (usedIds.has(id)) continue;

      const s = statsById.get(id);
      if (!s) continue;

      const eligible = normalizePos(s.position);
      if (!slotsRemaining.some((slot) => canFillSlot(eligible, slot))) continue;

      const rank = rankMap.get(id) ?? 9999; // get the overall rank of the player; if not found, assign a very high rank to indicate low availability (this can happen if the player is new or has limited data)
      const prob = availabilityProb(rank, overall); // calculate the probability that this player will still be available at the current pick based on their rank

      // only filter truly impossible picks; allow some risk
      if (prob < 0.15) continue;

      candidates.push({ r, s, rank });
    }

    if (!candidates.length) continue;

    const evaluated = [];

    for (const c of candidates) {
      const { score, buildScore, prob } = scoreCandidate({
        playerId: c.r.player_id,
        zById,
        teamZByCat,
        focusCats,
        puntCats,
        pick: overall,
        nextPick: nextOverall,
        rank: c.rank,
        combinedScore: c.r.combined_score,
        riskRaw: c.r.risk_raw,
      });

      if (!Number.isFinite(score)) continue;
      evaluated.push({ ...c, score, buildScore, prob });
    }

    if (!evaluated.length) continue;

    evaluated.sort((a, b) => { // second option logic
      if (b.buildScore !== a.buildScore) return b.buildScore - a.buildScore; // if buildScore (category fit) differs, prioritize higher buildScore since it better reflects category fit and overall value; this ensures that the optimizer's top pick is not only a good fit for the team's needs but also has a strong overall profile according to the backend's model.
      return b.score - a.score;
    });
    const best = evaluated[0]; // best candidate based on overall score, with buildScore as tiebreaker

    let second = null; // look for a safer alternative
    const safer = evaluated.filter((e) => e.r.player_id !== best.r.player_id && e.prob > best.prob + 0.08); // alternative player must have > 0.08 availability probability than the best player
    if (safer.length) { // if we have safer alternatives, pick the one with the highest buildScore (best category fit) as the second option
      safer.sort((a, b) => { // among safer alternatives, prioritize buildScore first
        if (b.buildScore !== a.buildScore) return b.buildScore - a.buildScore; // if buildScore differs, prioritize higher buildScore since it better reflects category fit and overall value; this ensures that the second option is not only safer but also has a strong overall profile according to the backend's model.
        return b.prob - a.prob;
      });
      second = safer[0];
    } else { // if no safer alternatives, just pick the next best option by score as the second option, even if it's not much safer, to at least provide some alternative for the user to consider.
      const byProb = evaluated
        .filter((e) => e.r.player_id !== best.r.player_id) 
        .sort((a, b) => b.prob - a.prob || b.buildScore - a.buildScore); // sort by probability first, then by buildScore as tiebreaker
      if (byProb.length) second = byProb[0]; // pick the most available alternative as the second option
    }

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
      second_option: second
        ? {
            player_id: second.r.player_id,
            name: second.r.player_name,
            pos: second.s.position || "-",
            team: second.s.team || "-",
            availability: second.prob,
          }
        : null,
      note: null,
    });
  }

  return chosen.slice(0, slots.length);
}

export default function Optimizer() {
  const nav = useNavigate();
  const { season, setSeason, seasons } = useSeason();
  const { league, loading: loadingLeague } = useLeagueStats(); // still used for UI/loading gating

  const [leagueSize, setLeagueSize] = useState(12); // optimizer parameters
  const [draftSlot, setDraftSlot] = useState(2);
  const [rounds, setRounds] = useState(DEFAULT_ROUNDS);

  const [focusCats, setFocusCats] = useState(["assists", "three_pm", "steals", "ft_pct"]); // default focus categories that the optimizer will try to build around; can be customized by the user
  const [puntCats, setPuntCats] = useState(["turnovers"]); // default punt categories that the optimizer will ignore; can be customized by the user

  const [allPlayers, setAllPlayers] = useState([]);
  const [lockedIds, setLockedIds] = useState([]); // locked players stored here

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
        ]); // optimizer loads from chosen season

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

  useEffect(() => {
    const token = tokenStore.get();
    const pendingRaw = sessionStorage.getItem(PENDING_SAVE_KEY);
    if (!token || !pendingRaw) return;

    let pending;
    try {
      pending = JSON.parse(pendingRaw);
    } catch {
      sessionStorage.removeItem(PENDING_SAVE_KEY);
      return;
    }

    if (!pending?.payload) {
      sessionStorage.removeItem(PENDING_SAVE_KEY);
      return;
    }

    createSavedItem(pending)
      .then(() => {
        sessionStorage.removeItem(PENDING_SAVE_KEY);
        alert("Saved!");
      })
      .catch((e) => {
        if (e?.response?.status !== 401) {
          alert("Save failed.");
          sessionStorage.removeItem(PENDING_SAVE_KEY);
        }
      });
  }, []);

  const disabledIds = useMemo(() => new Set(lockedIds), [lockedIds]);

  const addLockById = (id) => { // adds a player to Locks by their ID
    if (!id) return;
    setLockedIds((prev) => {
      if (prev.includes(id)) return prev; // ensure no duplicates
      if (prev.length >= 3) return prev; // enforce max of 3 locks
      return [...prev, id]; // add new lock to the list
    });
    setLockQuery("");
  };

  const removeLock = (id) => setLockedIds((prev) => prev.filter((x) => x !== id)); // removes a player from Locks by their ID

  const lockResults = useMemo(() => {  // search for locks from all players, excluding already locked players
    const q = lockQuery.trim().toLowerCase(); // if query is empty, return empty results; only show results when there's a search term
    if (!q) return [];
    return allPlayers
      .filter((p) => !disabledIds.has(p.id)) // exclude already locked players from search results
      .filter((p) => (p.name || "").toLowerCase().includes(q)) // filter players whose names include the search query (case-insensitive)
      .slice(0, 8); // limit to top 8 results
  }, [lockQuery, allPlayers, disabledIds]);

  const generateLineups = () => {
    // rankings + statsById are the true required inputs
    if (!rankings.length || !statsById.size) {
      alert("Still loading rankings/stats. Try again in a second.");
      return;
    }

    const lineup = buildLineup({ // once user picks focus and punt cats, the 2 arrays are passed into lineup generation.
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
    const payload = {
      kind: "lineup",
      title: "Lineup 1",
      season,
      payload: lineupObject,
    };

    try {
      await createSavedItem(payload);
      alert("Saved!");
    } catch (e) {
      if (e?.response?.status === 401) {
        sessionStorage.setItem(PENDING_SAVE_KEY, JSON.stringify(payload));
        nav("/login", { state: { from: "/optimizer" } });
      }
      else alert("Save failed.");
    }
  };

  return (
    <div>
      <div data-tour="optimizer-header">
        <h2>Optimizer</h2>
        <p>
          Builds lineups using <b>category targets + diminishing returns</b> so locks & focus categories actually
          change the result.
        </p>
      </div>

      <div data-tour="optimizer-controls" style={{ display: "flex", gap: 16, flexWrap: "wrap", margin: "14px 0" }}>
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
      <div data-tour="optimizer-locks" style={{ marginTop: 10, maxWidth: 520 }}>
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

      <div data-tour="optimizer-focus" style={{ marginTop: 14 }}> // Focus + punt: how the optimizer scores candidates
        <h3>Focus categories</h3>
        <div style={{ color: "#aaa", marginBottom: 8 }}>
          Focus cats have higher target thresholds (the build actively tries to “win” them).
        </div>
        <PuntSelector value={focusCats} onChange={setFocusCats} />
      </div>

      <div data-tour="optimizer-punt" style={{ marginTop: 14 }}>
        <h3>Punt categories</h3>
        <div style={{ color: "#aaa", marginBottom: 8 }}>Punted cats are ignored in scoring.</div>
        <PuntSelector value={puntCats} onChange={setPuntCats} />
      </div>

      {loading || loadingLeague ? (
        <Loading text="Loading optimizer data..." />
      ) : lineups.length === 0 ? (
        <div data-tour="optimizer-results" style={{ marginTop: 16, color: "#aaa" }}>
          Click <b>Generate lineup</b> to see a draft plan.
        </div>
      ) : (
        <div data-tour="optimizer-results" style={{ marginTop: 18, display: "grid", gap: 14 }}>
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
                      <th>Availability</th>
                      <th>2nd Option</th>
                      <th>2nd Avail.</th>
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
                          {!p.note ? (
                            <span style={{ color: "#aaa" }}>
                              {" "}
                              ({p.pos} | {p.team})
                            </span>
                          ) : null}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {p.note === "LOCK" ? "Locked" : `${Math.round((p.availability ?? 0) * 100)}%`}
                        </td>
                        <td>
                          {p.note === "LOCK" || !p.second_option ? (
                            "-"
                          ) : (
                            <>
                              <b>{p.second_option.name}</b>{" "}
                              <span style={{ color: "#aaa" }}>
                                ({p.second_option.pos} | {p.second_option.team})
                              </span>
                            </>
                          )}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {p.note === "LOCK" || !p.second_option
                            ? "-"
                            : `${Math.round((p.second_option.availability ?? 0) * 100)}%`}
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
