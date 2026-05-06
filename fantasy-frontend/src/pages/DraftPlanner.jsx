// src/pages/DraftPlanner.jsx
import { Fragment, useEffect, useMemo, useState } from "react";
import Loading from "../components/Loading";
import SeasonDropdown from "../components/SeasonDropdown";
import RiskSlider from "../components/RiskSlider";
import { useSeason } from "../hooks/useSeason";
import { useLeagueStats } from "../hooks/useLeagueStats";
import { getRotoRiskRankings } from "../api/fantasyApi";
import { loadJSON, saveJSON } from "../utils/storage";

const STORAGE_KEY = "draftPlannerState_v1";
const POSITIONS = ["All", "PG", "SG", "SF", "PF", "C", "G", "F"];
const AI_PICK_DELAY_MS = 2000; // delay in milliseconds before the CPU manager makes its pick
const MOCK_CATEGORIES = [
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
const CPU_DIFFICULTY_PRESETS = { // CPU manager behavior presets
  normal: {
    label: "Normal",
    shortlistRange: [3, 5], // number of top candidates the CPU considers; 3 to 5 candidates
    topBias: 0.84, // bias toward top candidates; higher means more likely to pick the top candidate, lower means more randomness among the shortlist
    scoreNoise: 0.3, // random noise added to candidate scores to create variability in CPU picks; higher means more randomness
    mistakeChance: 0.035, // chance that the CPU makes a "mistake" by picking a lower-ranked candidate outside of the shortlist; this simulates occasional suboptimal decisions
    strategyDiscipline: 0.98, // how closely the CPU follows its strategic profile (focus/punt); higher means more discipline, lower means more randomness in following the strategy
    tunnelVisionChance: 0.025, // chance that the CPU develops tunnel vision and overvalues a player who fits its focus categories but is overall a poor pick, leading to a significant score penalty; this simulates the risk of being too narrowly focused on certain categories.
  },
  hard: {
    label: "Hard",
    shortlistRange: [1, 1],
    topBias: 1,
    scoreNoise: 0, 
    mistakeChance: 0,
    strategyDiscipline: 1.04,
    tunnelVisionChance: 0,
  },
};

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const selectOptionStyle = { backgroundColor: "#0f172a", color: "#f8fafc" };

function snakeManagerSlot(leagueSize, overallPick) { // calculates which manager's turn it is based on the overall pick number and league size, following a snake draft order
  const round = Math.ceil(overallPick / leagueSize); // calculate current round based on overall pick and league size
  const pickInRound = ((overallPick - 1) % leagueSize) + 1; // calculate pick number within the current round (1-based index)
  if (round % 2 === 1) return pickInRound; // if it's an odd round, the order is normal (1 to leagueSize)
  return leagueSize - pickInRound + 1; // if it's an even round, the order is reversed
}

function shuffle(arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function chooseWeighted(items, getWeight) {
  if (!items.length) return null;
  const weights = items.map((item, idx) => Math.max(0, Number(getWeight(item, idx) ?? 0)));
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total <= 0) return items[0];

  let roll = Math.random() * total;
  for (let i = 0; i < items.length; i += 1) {
    roll -= weights[i];
    if (roll <= 0) return items[i];
  }
  return items[items.length - 1];
}

function makeMockRosterTemplate(rounds) {
  const base = ["PG", "SG", "SF", "PF", "C", "G", "F", "UTIL", "UTIL"];
  while (base.length < rounds) base.push("UTIL");
  return base.slice(0, rounds);
}

function normalizePos(pos) {
  const raw = String(pos || "")
    .toUpperCase()
    .replace(/\s+/g, "");
  if (!raw) return [];

  const tokens = raw.replace(/\//g, "-").split("-").filter(Boolean);
  const out = new Set();

  for (const t of tokens) {
    if (t === "PG" || t === "SG" || t === "SF" || t === "PF" || t === "C") out.add(t);
    if (t === "G" || t === "GUARD") {
      out.add("PG");
      out.add("SG");
      out.add("G");
    }
    if (t === "F" || t === "FORWARD") {
      out.add("SF");
      out.add("PF");
      out.add("F");
    }
  }

  if (out.has("PG") || out.has("SG")) out.add("G");
  if (out.has("SF") || out.has("PF")) out.add("F");
  return Array.from(out);
}

function canFillSlot(eligible, slot) {
  if (slot === "UTIL") return true;
  return eligible.includes(slot);
}

function findBestSlot(eligible, slotsRemaining) {
  const slotOrder = ["PG", "SG", "SF", "PF", "C", "G", "F", "UTIL"];
  for (const slot of slotOrder) {
    const idx = slotsRemaining.findIndex((s) => s === slot && canFillSlot(eligible, slot));
    if (idx >= 0) return { slot, index: idx };
  }
  return null;
}

function progressTowardTarget(teamZ, targetZ) {
  if (targetZ <= 0) return 0;
  if (teamZ <= 0) return 0;
  if (teamZ >= targetZ) return 1;
  return teamZ / targetZ;
}

function buildCatTargets(rounds, focusCats, puntCats) {
  const targets = {};
  const base = Math.max(1.8, rounds * 0.22);
  const focus = Math.max(base + 1.4, rounds * 0.38);

  for (const cat of MOCK_CATEGORIES) {
    if (puntCats.includes(cat)) targets[cat] = 0;
    else if (focusCats.includes(cat)) targets[cat] = focus;
    else targets[cat] = base;
  }
  return targets;
}

function marginalCategoryGain({ manager, playerZ, rounds }) {
  const targets = buildCatTargets(rounds, manager.focusCats, manager.puntCats);
  let gain = 0;

  for (const cat of MOCK_CATEGORIES) {
    if (manager.puntCats.includes(cat)) continue;
    const before = Number(manager.teamZByCat?.[cat] ?? 0);
    const delta = Number(playerZ?.[cat] ?? 0);
    const target = Number(targets[cat] ?? 0);
    const p0 = progressTowardTarget(before, target);
    const p1 = progressTowardTarget(before + delta, target);
    const w = manager.focusCats.includes(cat) ? 1.8 : 1.0;
    gain += w * (p1 - p0);
  }

  return gain;
}

function chooseTopStrengthLabel(player, manager) {
  const z = player?.z_scores || {};
  const cats = manager.focusCats.length ? manager.focusCats : MOCK_CATEGORIES;
  let bestCat = null;
  let bestVal = -Infinity;

  for (const cat of cats) {
    const val = Number(z[cat] ?? 0);
    if (val > bestVal) {
      bestVal = val;
      bestCat = cat;
    }
  }

  return bestCat ? `leans ${bestCat}` : "best available";
}

function scoreCpuCandidate({ player, manager, rounds, overallPick, overallRank, slotFit }) {
  const combined = Number(player.combined_score ?? player.total_score ?? 0);
  const riskRaw = Number(player.risk_raw ?? 0);
  const playerZ = player.z_scores || {};
  const catGain = marginalCategoryGain({ manager, playerZ, rounds });
  const profile = manager.aiProfile || CPU_DIFFICULTY_PRESETS.normal;

  const slotBonus =
    slotFit.slot === "UTIL" ? 0.2 : slotFit.slot === "G" || slotFit.slot === "F" ? 0.9 : 1.5;
  const exactSlotsLeft = manager.slotsRemaining.filter(
    (s) => s !== "UTIL" && s !== "G" && s !== "F"
  ).length;
  const scarcityBonus = exactSlotsLeft > 0 && slotFit.slot !== "UTIL" ? 0.4 : 0;

  const focusRaw = manager.focusCats.reduce((sum, cat) => sum + Number(playerZ?.[cat] ?? 0), 0);
  const puntPenalty = manager.puntCats.reduce((sum, cat) => {
    const v = Number(playerZ?.[cat] ?? 0);
    return sum + Math.max(0, v);
  }, 0);

  const valueGap = overallPick - overallRank;
  const valueGapScore = clamp(valueGap / 20, -1.5, 1.5);
  const managerVariance = Number(manager.decisionVariance ?? 1);
  const strategicWeight = Number(profile.strategyDiscipline ?? 0.88) * managerVariance;
  const focusWeight = (0.22 + (manager.strategyFlavor === "upside" ? 0.08 : 0)) * strategicWeight;
  const riskWeight =
    manager.strategyFlavor === "steady" ? 0.24 : manager.strategyFlavor === "upside" ? 0.12 : 0.18;
  const valueWeight =
    manager.strategyFlavor === "rankings" ? 1.18 : manager.strategyFlavor === "fit" ? 0.94 : 1;
  const tunnelVisionPenalty =
    manager.strategyFlavor === "specialist" && Math.random() < (profile.tunnelVisionChance ?? 0)
      ? Math.max(0, combined - focusRaw * 0.65)
      : 0;
  const noise = (Math.random() - 0.5) * Number(profile.scoreNoise ?? 1);

  return (
    combined +
    catGain * 5.8 * strategicWeight +
    slotBonus +
    scarcityBonus +
    focusRaw * focusWeight +
    riskRaw * riskWeight +
    valueGapScore * valueWeight -
    puntPenalty * 0.14 * strategicWeight -
    tunnelVisionPenalty +
    noise
  );
}

function initTeamZ() {
  const out = {};
  for (const cat of MOCK_CATEGORIES) out[cat] = 0;
  return out;
}

function sampleManagerStrategy() { // randomly generates a strategic profile for a CPU manager, determining which categories they focus on and which they punt, creating variability in CPU behavior and draft strategies
  const pool = shuffle(MOCK_CATEGORIES); // randomize the order of categories to ensure different focus/punt combinations across managers
  const focusRoll = Math.random(); // determine how many categories the manager focuses on based on a random roll, creating variability in CPU strategies; some may focus on just a couple of categories while others may have a broader focus
  const focusCount = focusRoll < 0.18 ? 2 : focusRoll < 0.58 ? 3 : focusRoll < 0.88 ? 4 : 5; // 18% chance to focus on 2 categories, 40% chance to focus on 3, 30% chance to focus on 4, and 12% chance to focus on 5 categories, creating a range of CPU manager strategies from very specialized to more balanced
  const focusCats = pool.slice(0, focusCount); // select the focus categories from the shuffled pool based on the determined focus count
  const puntPool = pool.filter((c) => !focusCats.includes(c)); // the remaining categories that are not focused on become the punt pool, which the manager will tend to avoid or devalue in their draft strategy
  const puntRoll = Math.random();
  let puntCount = 0; // determine how many categories the manager punts based on a random roll, creating variability in CPU strategies; some may not punt any categories while others may punt one or two, adding another layer of strategic diversity among CPU managers
  if (puntRoll > 0.52 && puntPool.length) puntCount = 1; // 48% chance to punt at least one category, and if the punt pool is not empty, the manager will punt one category; if the roll is above 0.84 and there are enough categories in the punt pool, the manager will punt two categories, creating a range of CPU manager strategies from those that don't punt any categories to those that actively avoid multiple categories in their draft strategy
  if (puntRoll > 0.84 && puntPool.length > 1) puntCount = 2; // if the random roll is above 0.84 and there are more than one category available in the punt pool, the manager will punt two categories, creating a more extreme strategic profile that heavily devalues certain categories in favor of their focused categories
  const puntCats = shuffle(puntPool).slice(0, puntCount);
  return { focusCats, puntCats };
}

function sampleManagerProfile(difficulty) {
  const preset = CPU_DIFFICULTY_PRESETS[difficulty] || CPU_DIFFICULTY_PRESETS.normal;
  const flavorRoll = Math.random();
  const strategyFlavor =
    flavorRoll < 0.25
      ? "fit"
      : flavorRoll < 0.5
        ? "rankings"
        : flavorRoll < 0.75
          ? "steady"
          : flavorRoll < 0.9
            ? "upside"
            : "specialist";

  return {
    ...preset,
    strategyFlavor,
    decisionVariance: difficulty === "hard" ? 1 : 0.985 + Math.random() * 0.03,
  };
}

function createMockManagers({ leagueSize, userSlot, rounds, cpuDifficulty }) {
  const rosterTemplate = makeMockRosterTemplate(rounds); // predefined roster slots based on number of rounds, ensuring enough UTIL slots for flexibility
  return Array.from({ length: leagueSize }, (_, idx) => { // creates manager objects for each slot in the league
    const slot = idx + 1; // assigns a unique slot number to each manager
    const strategy = sampleManagerStrategy(); // randomly generates a strategic profile for the manager, determining which categories they focus on and which they punt
    const aiProfile = sampleManagerProfile(cpuDifficulty); // generates an AI behavior profile based on the selected difficulty, influencing how the CPU manager evaluates players and makes picks
    return {
      slot,
      label: slot === userSlot ? `You (Pick ${slot})` : `Manager ${slot}`,
      isUser: slot === userSlot,
      focusCats: strategy.focusCats,
      puntCats: strategy.puntCats,
      aiProfile,
      decisionVariance: aiProfile.decisionVariance,
      strategyFlavor: aiProfile.strategyFlavor,
      slotsRemaining: [...rosterTemplate],
      rosterIds: [],
      teamZByCat: initTeamZ(),
    };
  });
}

function cloneMockDraft(draft) {
  return {
    ...draft,
    picks: draft.picks.map((p) => ({ ...p })),
    managers: draft.managers.map((m) => ({
      ...m,
      focusCats: [...m.focusCats],
      puntCats: [...m.puntCats],
      aiProfile: m.aiProfile ? { ...m.aiProfile } : null,
      slotsRemaining: [...m.slotsRemaining],
      rosterIds: [...m.rosterIds],
      teamZByCat: { ...m.teamZByCat },
    })),
  };
}

function currentTurnInfo(draft) { // calculates current turn
  if (!draft) return null;
  const totalPicks = draft.leagueSize * draft.rounds; // calculate total number of picks in the draft based on league size and number of rounds
  if (draft.currentOverallPick > totalPicks) return null; // if the current overall pick exceeds the total number of picks, the draft is complete and there is no current turn

  const overall = draft.currentOverallPick; // the current overall pick number
  const round = Math.ceil(overall / draft.leagueSize); // calculate the current round based on the overall pick and league size
  const pickInRound = ((overall - 1) % draft.leagueSize) + 1; // calculate the pick number within the current round (1-based index)
  const managerSlot = snakeManagerSlot(draft.leagueSize, overall); // determine which manager's turn it is based on the overall pick number and league size, following a snake draft order

  return { overall, round, pickInRound, managerSlot }; 
}

function syncMockDraftTurnState(draft) { // decides draft status
  const turn = currentTurnInfo(draft); // get current turn information based on the draft's current overall pick, league size, and rounds to determine which manager's turn it is and what the current round and pick in round are
  if (!turn) { // if there is no current turn (i.e., the draft is complete), update the draft status to "complete" and clear the current turn information
    draft.status = "complete";
    draft.currentTurn = null;
    return draft;
  }

  draft.currentTurn = turn; // if there is a current turn, update the draft's current turn information with the calculated turn details, including overall pick number, round, pick in round, and which manager's turn it is
  draft.status = turn.managerSlot === draft.userSlot ? "user_turn" : "running";
  return draft;
}

function applyPickToDraft(nextDraft, player, managerSlot, reason) { // applies a pick to the draft state by updating the relevant manager's roster
  const turn = currentTurnInfo(nextDraft); // get current turn information to determine which manager is making the pick
  if (!turn) return nextDraft; // if there is no current turn, return the draft state unchanged

  const manager = nextDraft.managers.find((m) => m.slot === managerSlot); // find the manager object corresponding to the manager slot for the current turn, which will be updated with the new pick information
  if (!manager) return nextDraft; // if the manager cannot be found (which should not happen if the draft state is consistent), return the draft state unchanged

  const eligible = normalizePos(player.position); // determine which roster slots the player is eligible for based on their position, which will be used to find the best slot for the player on the manager's roster
  const slotFit = findBestSlot(eligible, manager.slotsRemaining); // find the best roster slot that the player can fill for the manager based on their eligibility and the manager's remaining roster slots; this determines where the player will be placed on the manager's roster and how well they fit the manager's needs
  const assignedSlot = slotFit?.slot || "UTIL"; // the assigned slot for the player is based on the best fit found; if no suitable slot is found, the player is assigned to a UTIL slot, which can accommodate any position but does not provide the same positional value as a specific slot

  if (slotFit && slotFit.index >= 0) { // if a suitable slot fit is found for the player, remove that slot from the manager's remaining slots to reflect that it has been filled by the new pick; this ensures that future picks will not consider that slot as available and helps maintain the integrity of the roster construction logic
    manager.slotsRemaining.splice(slotFit.index, 1);
  } else if (manager.slotsRemaining.length) { // if no suitable slot fit is found but the manager still has remaining slots, remove the first available slot from the manager's remaining slots to reflect that it has been filled by the new pick; this is a fallback mechanism to ensure that the manager's roster state remains consistent even if the player does not fit any specific slot, and it helps prevent issues with tracking available roster slots as the draft progresses
    manager.slotsRemaining.splice(0, 1);
  }

  manager.rosterIds.push(player.player_id); // add the player's ID to the manager's roster IDs to keep track of which players are on the manager's team
  for (const cat of MOCK_CATEGORIES) {
    manager.teamZByCat[cat] =
      Number(manager.teamZByCat[cat] ?? 0) + Number(player.z_scores?.[cat] ?? 0); // update the manager's team Z-scores by category based on the Z-scores of the newly drafted player
  }

  nextDraft.picks.push({
    overall: turn.overall,
    round: turn.round,
    pickInRound: turn.pickInRound,
    managerSlot,
    managerLabel: manager.label,
    isUser: manager.isUser,
    player_id: player.player_id,
    player_name: player.player_name,
    position: player.position || "-",
    team: player.team || "-",
    assignedSlot,
    reason,
  });

  nextDraft.currentOverallPick += 1;
  return nextDraft;
}

function selectCpuPick({ draft, manager, players, takenSet }) { // selects a pick for the CPU managers
  const profile = manager.aiProfile || CPU_DIFFICULTY_PRESETS.normal; // get the CPU manager's behavior profile
  const candidates = []; // initialize an array to hold potential player candidates
  let checked = 0;

  for (let idx = 0; idx < players.length; idx += 1) { // iterate through the player rankings in order
    const p = players[idx]; // get the player at the current index in the rankings
    if (!p || takenSet.has(p.player_id)) continue; // if the player is already taken in the draft, skip to the next player

    const eligible = normalizePos(p.position); // determine which roster slots the player is eligible for based on their position
    const slotFit = findBestSlot(eligible, manager.slotsRemaining); // find the best roster slot that the player can fill for the manager
    if (!slotFit) continue;

    checked += 1; // increment the count of how many players have been checked as potential picks
    const score = scoreCpuCandidate({ // calculate a score for the player as a potential pick for the CPU manager
      player: p,
      manager, 
      rounds: draft.rounds,
      overallPick: draft.currentOverallPick,
      overallRank: idx + 1,
      slotFit,
    });

    candidates.push({ // add the player to the list of candidates along with their calculated score and other relevant information for decision-making
      player: p,
      score,
      overallRank: idx + 1,
      slotFit,
      reason: `${slotFit.slot} fit, ${chooseTopStrengthLabel(p, manager)}`, // the reason for the pick is based on how well the player fits the manager's roster needs and their strongest category relative to the manager's focus
    });

    if (checked >= 70 && candidates.length) break; // 70 player threshold to limit how far down the rankings the CPU will evaluate
  }

  if (!candidates.length) return null;

  candidates.sort((a, b) => b.score - a.score); // sort the candidates by their calculated score in descending order, so that the highest-scoring candidates are at the top of the list
  if (draft.cpuDifficulty === "hard") return candidates[0]; // if CPU difficulty is 'hard', always pick the highest ranking candidate

  const [minShortlist, maxShortlist] = profile.shortlistRange || [4, 8]; // determine the range for how many top candidates the CPU will consider based on their behavior profile
  const shortlistSize = clamp(randInt(minShortlist, maxShortlist), 1, candidates.length); // randomly determine the size of the shortlist
  const shortlist = candidates.slice(0, shortlistSize); // create the shortlist
  const topBias = Number(profile.topBias ?? 0.72); // get the bias toward picking higher-ranked candidates
  const mistakeChance = Number(profile.mistakeChance ?? 0.16); // get the chance that the CPU will make a "mistake" by picking a lower-ranked candidate outside of the shortlist

  if (Math.random() < mistakeChance) { // if the random roll is below the mistake chance threshold, the CPU will pick from a larger pool of candidates that includes some lower-ranked options outside of the shortlist, simulating occasional suboptimal decisions and adding variability to CPU behavior
    const mistakePool = candidates.slice(0, clamp(shortlistSize + 4, 2, candidates.length)); // the mistake pool includes the shortlist plus a few additional candidates below it, creating a range of potential "mistake" picks that are still somewhat reasonable but not the top choices
    return chooseWeighted(
      mistakePool,
      (candidate, idx) => 1 / Math.pow(idx + 1, Math.max(0.55, topBias)) // the weighting for the mistake pool is less biased toward the top candidates compared to the shortlist, allowing for a higher likelihood of picking lower-ranked candidates when a "mistake" occurs, while still giving some preference to higher-ranked options
    );
  }

  return chooseWeighted(
    shortlist,
    (candidate, idx) =>
      1 / Math.pow(idx + 1, Math.max(0.35, 1.8 - topBias)) +
      clamp((200 - candidate.overallRank) / 220, 0, 0.35)
  );
}

function advanceMockDraftOneCpuPick(draft, players) { // advances the mock draft by one pick for CPU managers
  const next = cloneMockDraft(draft); // create a deep copy of the current draft state to modify for the next state, ensuring immutability of the draft state and allowing for proper state updates in React
  const turn = currentTurnInfo(next); // calculate the current turn information based on the next draft state to determine which manager's turn it is and what the current round and pick in round are
  if (!turn) {
    next.status = "complete";
    next.currentTurn = null;
    return next;
  }

  if (turn.managerSlot === next.userSlot) {
    next.status = "user_turn";
    next.currentTurn = turn;
    return next;
  }

  const takenSet = new Set(next.picks.map((p) => p.player_id));
  const manager = next.managers.find((m) => m.slot === turn.managerSlot);
  if (!manager) {
    next.status = "complete";
    next.currentTurn = null;
    return next;
  }

  const choice = selectCpuPick({ draft: next, manager, players, takenSet });
  if (!choice?.player) {
    next.status = "complete";
    next.currentTurn = null;
    return next;
  }

  applyPickToDraft(next, choice.player, manager.slot, choice.reason);
  takenSet.add(choice.player.player_id);
  return syncMockDraftTurnState(next);
}

function draftUserAndAdvance(prevDraft, playerId, players) {
  if (!prevDraft || prevDraft.status !== "user_turn") return prevDraft;

  const next = cloneMockDraft(prevDraft);
  const turn = currentTurnInfo(next);
  if (!turn || turn.managerSlot !== next.userSlot) return prevDraft;

  const takenSet = new Set(next.picks.map((p) => p.player_id));
  if (takenSet.has(playerId)) return prevDraft;

  const player = players.find((p) => Number(p.player_id) === Number(playerId));
  if (!player) return prevDraft;

  applyPickToDraft(next, player, next.userSlot, "User pick");
  return syncMockDraftTurnState(next);
}

export default function DraftPlanner() {
  const { season, setSeason, seasons } = useSeason();

  const [riskWeight, setRiskWeight] = useState(() => {
    const saved = loadJSON(STORAGE_KEY, null);
    return saved?.riskWeight ?? 0.25;
  });

  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [query, setQuery] = useState("");
  const [posFilter, setPosFilter] = useState("All");

  const [draftedIds, setDraftedIds] = useState(() =>
    loadJSON(STORAGE_KEY, { draftedIds: [], myTeamIds: [], riskWeight: 0.25 }).draftedIds
  );
  const [myTeamIds, setMyTeamIds] = useState(() =>
    loadJSON(STORAGE_KEY, { draftedIds: [], myTeamIds: [], riskWeight: 0.25 }).myTeamIds
  );

  const [mockLeagueSize, setMockLeagueSize] = useState(12); // mock draft settings
  const [mockRounds, setMockRounds] = useState(11);
  const [mockUserSlotMode, setMockUserSlotMode] = useState("manual");
  const [mockUserSlot, setMockUserSlot] = useState(1);
  const [mockCpuDifficulty, setMockCpuDifficulty] = useState("normal");
  const [mockDraft, setMockDraft] = useState(null);
  const [workspaceTab, setWorkspaceTab] = useState("mock");
  const [mockRoomOpen, setMockRoomOpen] = useState(false);
  const [showAllPicksPopup, setShowAllPicksPopup] = useState(false);

  const { statsById, loading: loadingLeague } = useLeagueStats({ season });

  useEffect(() => {
    saveJSON(STORAGE_KEY, { draftedIds, myTeamIds, riskWeight });
  }, [draftedIds, myTeamIds, riskWeight]);

  useEffect(() => {
    getRotoRiskRankings({ season, risk_weight: riskWeight })
      .then((res) => setPlayers(res.data || []))
      .catch((err) => {
        console.error(err);
        alert("Failed to load draft rankings (backend/CORS).");
      })
      .finally(() => setLoading(false));
  }, [season, riskWeight]);

  const enrichedPlayers = useMemo(() => {
    return (players || []).map((p) => {
      const pid = Number(p.player_id);
      const row = statsById?.get(pid) ?? statsById?.get(String(pid)) ?? null;
      return {
        ...p,
        position: row?.position || p.position || "-",
        team: row?.team || p.team || "-",
      };
    });
  }, [players, statsById]);

  const playerById = useMemo(() => {
    const m = new Map();
    enrichedPlayers.forEach((p) => m.set(Number(p.player_id), p));
    return m;
  }, [enrichedPlayers]);

  const mockIsActive = !!mockDraft;
  const mockPickByPlayerId = useMemo(() => {
    const m = new Map();
    (mockDraft?.picks || []).forEach((p) => m.set(Number(p.player_id), p));
    return m;
  }, [mockDraft]);

  const activeDraftedIds = useMemo(() => {
    if (!mockIsActive) return draftedIds;
    return (mockDraft?.picks || []).map((p) => Number(p.player_id));
  }, [mockIsActive, mockDraft, draftedIds]);

  const activeMyTeamIds = useMemo(() => {
    if (!mockIsActive) return myTeamIds;
    return (mockDraft?.picks || [])
      .filter((p) => p.isUser)
      .map((p) => Number(p.player_id));
  }, [mockIsActive, mockDraft, myTeamIds]);

  const draftedSet = useMemo(() => new Set(activeDraftedIds), [activeDraftedIds]);
  const myTeamSet = useMemo(() => new Set(activeMyTeamIds), [activeMyTeamIds]);

  const availablePlayers = useMemo(() => { // search and filter available players
    const q = query.trim().toLowerCase();
    return enrichedPlayers
      .filter((p) => !draftedSet.has(Number(p.player_id))) // exclude drafted players
      .filter((p) => (!q ? true : (p.player_name || "").toLowerCase().includes(q))) // filter by name
      .filter((p) => {
        if (posFilter === "All") return true; // filter by position
        return String(p.position || "").toUpperCase().includes(posFilter); // handle missing positions gracefully
      });
  }, [enrichedPlayers, draftedSet, query, posFilter]);

  const myTeam = useMemo( // get my team players
    () => activeMyTeamIds.map((id) => playerById.get(Number(id))).filter(Boolean), // handle missing players gracefully
    [activeMyTeamIds, playerById]
  );

  const currentMockTurn = mockDraft?.currentTurn || currentTurnInfo(mockDraft);
  const activeMockManagerSlot = currentMockTurn?.managerSlot ?? null;
  const isMyMockTurn =
    !!mockDraft &&
    mockDraft.status === "user_turn" &&
    currentMockTurn &&
    currentMockTurn.managerSlot === mockDraft.userSlot;

  const markDrafted = (playerId) => {
    if (mockIsActive) return;
    setDraftedIds((prev) => (prev.includes(playerId) ? prev : [...prev, playerId]));
  };

  const undoDrafted = (playerId) => {
    if (mockIsActive) return;
    setDraftedIds((prev) => prev.filter((x) => x !== playerId));
    setMyTeamIds((prev) => prev.filter((x) => x !== playerId));
  };

  const draftToMyTeam = (playerId) => {
    if (mockIsActive) {
      if (!isMyMockTurn) {
        alert("It is not your turn in the mock draft.");
        return;
      }
      setMockDraft((prev) => draftUserAndAdvance(prev, playerId, enrichedPlayers));
      return;
    }

    setDraftedIds((prev) => (prev.includes(playerId) ? prev : [...prev, playerId]));
    setMyTeamIds((prev) => (prev.includes(playerId) ? prev : [...prev, playerId]));
  };

  const clearDraft = () => {
    if (!confirm(mockIsActive ? "Reset the mock draft?" : "Clear draft state?")) return;
    setMockDraft(null);
    setDraftedIds([]);
    setMyTeamIds([]);
  };

  const startMockDraft = () => { // start draft
    if (!enrichedPlayers.length) {
      alert("Rankings are still loading.");
      return;
    }

    const userSlot = 
      mockUserSlotMode === "random"
        ? Math.floor(Math.random() * mockLeagueSize) + 1
        : clamp(mockUserSlot, 1, mockLeagueSize);

    const initialDraft = { // creates brand new draft
      season,
      riskWeight,
      leagueSize: mockLeagueSize,
      rounds: mockRounds,
      cpuDifficulty: mockCpuDifficulty,
      userSlot,
      status: "running",
      currentOverallPick: 1,
      currentTurn: null,
      managers: createMockManagers({
        leagueSize: mockLeagueSize,
        userSlot,
        rounds: mockRounds,
        cpuDifficulty: mockCpuDifficulty,
      }),
      picks: [],
    };

    setDraftedIds([]);
    setMyTeamIds([]);
    setMockDraft(syncMockDraftTurnState(initialDraft));
  };

  const onUndoLastPick = () => {
    if (mockIsActive) return;

    setMyTeamIds((prev) => {
      if (!prev.length) return prev;
      const removed = prev[prev.length - 1];
      setDraftedIds((dprev) => dprev.filter((id) => id !== removed));
      return prev.slice(0, -1);
    });
  };

  const undoPick = (playerId) => undoDrafted(playerId);
  const undraftOther = (playerId) => undoDrafted(playerId);

  const clearDraftedOthers = () => {
    if (mockIsActive) return;
    setDraftedIds((prev) => prev.filter((id) => myTeamSet.has(id)));
  };

  const draftedOthers = useMemo(() => {
    if (mockIsActive) {
      return (mockDraft?.picks || [])
        .filter((p) => !p.isUser)
        .map((pickRow) => ({
          player: playerById.get(Number(pickRow.player_id)) || {
            player_id: pickRow.player_id,
            player_name: pickRow.player_name,
            position: pickRow.position,
            team: pickRow.team,
          },
          pick: pickRow,
        }));
    }

    return activeDraftedIds
      .filter((id) => !myTeamSet.has(Number(id)))
      .map((id) => ({ player: playerById.get(Number(id)), pick: null }))
      .filter((x) => x.player);
  }, [mockIsActive, mockDraft, playerById, activeDraftedIds, myTeamSet]);

  const mockManagers = useMemo(() => mockDraft?.managers || [], [mockDraft]);
  const recentMockPicks = useMemo(() => (mockDraft?.picks || []).slice(-8).reverse(), [mockDraft]);
  const mockBoardRounds = useMemo(() => {
    if (!mockDraft) return [];

    const pickByRoundAndManager = new Map();
    (mockDraft.picks || []).forEach((pick) => {
      pickByRoundAndManager.set(`${pick.round}-${pick.managerSlot}`, pick);
    });

    return Array.from({ length: mockDraft.rounds }, (_, idx) => {
      const round = idx + 1;
      return {
        round,
        picks: mockManagers.map((manager) => ({
          manager,
          pick: pickByRoundAndManager.get(`${round}-${manager.slot}`) || null,
        })),
      };
    });
  }, [mockDraft, mockManagers]);
  const mockLayoutActive = mockRoomOpen || mockIsActive;
  const mockBoardTemplateColumns = `96px repeat(${Math.max(mockManagers.length, 1)}, minmax(170px, 1fr))`;
  const activeWorkspaceTab =
    !mockLayoutActive && workspaceTab === "mock" ? "my-team" : workspaceTab;

  const handleSeasonChange = (nextSeason) => {
    if (mockIsActive && !confirm("Changing season will reset the current mock draft. Continue?")) {
      return;
    }
    if (mockIsActive) setMockDraft(null);
    setLoading(true);
    setSeason(nextSeason);
  };

  const handleRiskChange = (nextRisk) => {
    if (mockIsActive && !confirm("Changing risk weight will reset the current mock draft. Continue?")) {
      return;
    }
    if (mockIsActive) setMockDraft(null);
    setLoading(true);
    setRiskWeight(nextRisk);
  };

  useEffect(() => { // timers for cpu picks
    if (!mockDraft || mockDraft.status !== "running" || !enrichedPlayers.length) return undefined; // only set timer if mock draft is active and running, and player data is loaded

    const timer = window.setTimeout(() => {
      setMockDraft((prev) => { // advance the draft by one CPU pick after a delay, but first check if the draft is still running to avoid making picks if the user has already ended the draft or if the draft has completed
        if (!prev || prev.status !== "running") return prev;
        return advanceMockDraftOneCpuPick(prev, enrichedPlayers); 
      });
    }, AI_PICK_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [mockDraft, enrichedPlayers]);

  const tableStyle = {
    width: "100%",
    borderCollapse: "separate",
    borderSpacing: 0,
    overflow: "hidden",
    borderRadius: 14,
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.08)",
  };
  const thStyle = {
    textAlign: "left",
    padding: "10px 10px",
    fontSize: 12,
    letterSpacing: 0.2,
    color: "rgba(255,255,255,0.75)",
    borderBottom: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.04)",
    whiteSpace: "nowrap",
  };
  const tdBase = {
    padding: "10px 10px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    borderRight: "1px solid rgba(255,255,255,0.06)",
    color: "#e6edf3",
    background: "transparent",
    whiteSpace: "nowrap",
    fontSize: 13,
  };

  const styles = {
    sidebar: { display: "flex", flexDirection: "column", gap: 16 },
    sideCard: {
      background: "rgba(15, 23, 42, 0.95)",
      border: "none",
      borderRadius: 14,
      overflow: "hidden",
      boxShadow: "0 12px 30px rgba(0,0,0,0.35)",
    },
    sideCardHeader: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "12px 14px",
      borderBottom: "1px solid rgba(255,255,255,0.08)",
      background: "rgba(255,255,255,0.04)",
      gap: 10,
    },
    sideCardTitle: { fontSize: 15, fontWeight: 800, color: "#fff" },
    sideCardSub: { fontSize: 12, color: "rgba(255,255,255,0.65)" },
    miniBtn: {
      padding: "6px 10px",
      borderRadius: 10,
      border: "1px solid rgba(255,255,255,0.16)",
      background: "rgba(255,255,255,0.06)",
      color: "#fff",
      cursor: "pointer",
      fontWeight: 700,
    },
    miniBtnDanger: {
      padding: "6px 10px",
      borderRadius: 10,
      border: "1px solid rgba(239,68,68,0.45)",
      background: "rgba(239,68,68,0.14)",
      color: "#fff",
      cursor: "pointer",
      fontWeight: 700,
    },
    sideList: {
      maxHeight: 420,
      overflow: "auto",
      padding: 12,
      display: "flex",
      flexDirection: "column",
      gap: 10,
    },
    emptyState: { color: "rgba(255,255,255,0.7)", fontSize: 13 },
    emptyHint: { color: "rgba(255,255,255,0.5)", fontSize: 12, marginTop: 4 },
    playerRow: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      padding: "8px 10px",
      borderRadius: 10,
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(255,255,255,0.06)",
    },
    playerName: {
      fontWeight: 700,
      color: "#fff",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
    },
    playerMeta: { fontSize: 12, color: "rgba(255,255,255,0.6)" },
    pillBtn: {
      padding: "6px 10px",
      borderRadius: 999,
      border: "1px solid rgba(255,255,255,0.16)",
      background: "rgba(0,0,0,0.2)",
      color: "#fff",
      cursor: "pointer",
      fontWeight: 700,
      whiteSpace: "nowrap",
    },
    mockInfoGrid: { 
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 10,
      padding: 12,
      borderBottom: "1px solid rgba(255,255,255,0.06)",
    },
    fieldLabel: { fontSize: 11, color: "rgba(255,255,255,0.6)", marginBottom: 6 },
    fieldSelect: {
      width: "100%",
      padding: "8px 10px",
      borderRadius: 10,
      border: "1px solid rgba(255,255,255,0.14)",
      background: "rgba(255,255,255,0.05)",
      color: "#fff",
      colorScheme: "dark",
    },
    mockMetaNote: {
      margin: "0 12px 12px",
      padding: "10px 12px",
      borderRadius: 12,
      border: "1px solid rgba(255,255,255,0.08)",
      background: "rgba(255,255,255,0.03)",
      color: "rgba(255,255,255,0.72)",
      fontSize: 12,
      lineHeight: 1.4,
    },
    statusPill: { // status badge
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      borderRadius: 999,
      padding: "6px 10px",
      fontSize: 12,
      fontWeight: 700,
      border: "1px solid rgba(255,255,255,0.12)",
      background: "rgba(255,255,255,0.04)",
      color: "#fff",
    },
    turnHighlight: { // highlight for current turn
      padding: "10px 12px",
      margin: 12,
      borderRadius: 12,
      border: "1px solid rgba(127,223,255,0.24)",
      background: "rgba(127,223,255,0.08)",
      color: "#d9f6ff",
      fontSize: 13,
      lineHeight: 1.4,
    },
    managerChipWrap: { display: "flex", flexWrap: "wrap", gap: 8, padding: "0 12px 12px" },
    managerChip: {
      borderRadius: 10,
      border: "1px solid rgba(255,255,255,0.10)",
      background: "rgba(255,255,255,0.03)",
      padding: "8px 10px",
      minWidth: 150,
      fontSize: 12,
      color: "#fff",
    },
    managerChipUser: {
      border: "1px solid rgba(127,223,255,0.3)",
      background: "rgba(127,223,255,0.08)",
    },
    managerChipActive: {
      border: "1px solid rgba(255, 214, 102, 0.45)",
      background: "rgba(255, 214, 102, 0.12)",
      boxShadow: "0 0 0 1px rgba(255, 214, 102, 0.18) inset",
    },
    mockBoardShell: { // mock draft ui settings
      borderRadius: 18,
      border: "1px solid rgba(255,255,255,0.08)",
      background:
        "linear-gradient(180deg, rgba(10,18,34,0.98) 0%, rgba(7,13,27,0.98) 100%)",
      overflow: "hidden",
      boxShadow: "0 22px 50px rgba(0,0,0,0.32)",
    },
    mockBoardScroller: {
      overflowX: "auto",
      overflowY: "auto",
      padding: 14,
      maxHeight: 720,
    },
    mockBoardGrid: {
      display: "grid",
      gap: 10,
      minWidth: "max-content",
      alignItems: "start",
    },
    mockRoundLabel: {
      minHeight: 110,
      borderRadius: 12,
      border: "1px solid rgba(255,255,255,0.08)",
      background: "rgba(255,255,255,0.03)",
      color: "rgba(255,255,255,0.72)",
      display: "grid",
      placeItems: "center",
      fontWeight: 800,
      fontSize: 12,
      letterSpacing: 0.4,
      textTransform: "uppercase",
    },
    mockManagerHeader: {
      minHeight: 88,
      borderRadius: 14,
      border: "1px solid rgba(255,255,255,0.1)",
      background: "rgba(255,255,255,0.04)",
      padding: "10px 12px",
      color: "#fff",
      display: "grid",
      gap: 4,
    },
    mockManagerHeaderUser: {
      border: "1px solid rgba(127,223,255,0.32)",
      background: "rgba(127,223,255,0.1)",
    },
    mockManagerHeaderActive: {
      border: "1px solid rgba(255, 214, 102, 0.5)",
      background: "rgba(255, 214, 102, 0.14)",
      boxShadow: "0 0 0 1px rgba(255, 214, 102, 0.18) inset",
    },
    mockBoardCell: { // board cell settings
      minHeight: 110,
      borderRadius: 14,
      border: "1px solid rgba(255,255,255,0.08)",
      background: "rgba(255,255,255,0.03)",
      padding: "10px 12px",
      display: "grid",
      alignContent: "space-between",
      gap: 8,
      color: "#fff",
    },
    mockBoardCellPicked: {
      background: "linear-gradient(135deg, rgba(127,223,255,0.18), rgba(103,80,164,0.18))",
      border: "1px solid rgba(255,255,255,0.12)",
    },
    mockBoardCellUser: {
      background: "linear-gradient(135deg, rgba(127,223,255,0.28), rgba(127,223,255,0.12))",
      border: "1px solid rgba(127,223,255,0.3)",
    },
    mockBoardCellActive: {
      border: "1px solid rgba(255, 214, 102, 0.52)",
      background: "linear-gradient(135deg, rgba(255,214,102,0.22), rgba(255,214,102,0.08))",
      boxShadow: "0 0 0 1px rgba(255, 214, 102, 0.18) inset",
    },
    mockBoardCellEmpty: {
      color: "rgba(255,255,255,0.42)",
      fontSize: 12,
      alignContent: "center",
      justifyItems: "center",
      textAlign: "center",
    },
    mockBoardPlayerName: {
      fontWeight: 800,
      lineHeight: 1.2,
      fontSize: 14,
      overflow: "hidden",
      display: "-webkit-box",
      WebkitLineClamp: 2,
      WebkitBoxOrient: "vertical",
    },
    mockBoardMeta: {
      fontSize: 12,
      color: "rgba(255,255,255,0.72)",
      lineHeight: 1.35,
    },
    mockBoardPickNo: {
      fontSize: 11,
      fontWeight: 800,
      color: "rgba(255,255,255,0.65)",
      letterSpacing: 0.35,
      textTransform: "uppercase",
    },
    workspaceShell: {
      borderRadius: 16,
      border: "1px solid rgba(255,255,255,0.08)",
      background: "rgba(255,255,255,0.025)",
      overflow: "hidden",
    },
    workspaceHeader: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 12,
      padding: "12px 14px",
      borderBottom: "1px solid rgba(255,255,255,0.08)",
      background: "rgba(255,255,255,0.03)",
      flexWrap: "wrap",
    },
    workspaceTitle: {
      fontSize: 15,
      fontWeight: 800,
      color: "#fff",
    },
    workspaceTabs: {
      display: "flex",
      gap: 8,
      flexWrap: "wrap",
    },
    workspaceTabBtn: {
      padding: "8px 11px",
      borderRadius: 999,
      border: "1px solid rgba(255,255,255,0.12)",
      background: "rgba(255,255,255,0.03)",
      color: "rgba(255,255,255,0.8)",
      cursor: "pointer",
      fontWeight: 700,
      fontSize: 12,
    },
    workspaceTabBtnActive: {
      background: "rgba(127,223,255,0.12)",
      border: "1px solid rgba(127,223,255,0.28)",
      color: "#d7f6ff",
    },
    workspaceBody: {
      padding: 14,
    },
    boardPane: {
      minWidth: 0,
    },
    boardTableWrap: {
      overflowX: "auto",
      overflowY: "hidden",
      borderRadius: 14,
    },
    linkBtn: {
      border: "none",
      background: "transparent",
      color: "#9bdcff",
      cursor: "pointer",
      padding: 0,
      fontSize: 12,
      fontWeight: 700,
      textDecoration: "underline",
    },
    popupOverlay: { // 'recent picks' popup overlay
      position: "fixed",
      inset: 0,
      zIndex: 9999,
      background: "rgba(2, 6, 16, 0.65)",
      backdropFilter: "blur(4px)",
      display: "grid",
      placeItems: "center",
      padding: 16,
    },
    popupCard: {
      width: "min(760px, 100%)",
      maxHeight: "80vh",
      overflow: "hidden",
      borderRadius: 16,
      border: "1px solid rgba(255,255,255,0.12)",
      background: "rgba(12, 18, 30, 0.97)",
      boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
      display: "grid",
      gridTemplateRows: "auto 1fr",
    },
    popupHeader: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 10,
      padding: "12px 14px",
      borderBottom: "1px solid rgba(255,255,255,0.08)",
    },
    popupTitle: {
      fontSize: 16,
      fontWeight: 800,
      color: "#fff",
    },
    popupClose: {
      width: 32,
      height: 32,
      borderRadius: 999,
      border: "1px solid rgba(255,255,255,0.16)",
      background: "rgba(255,255,255,0.04)",
      color: "#fff",
      cursor: "pointer",
      fontWeight: 900,
      fontSize: 16,
      lineHeight: 1,
      display: "grid",
      placeItems: "center",
    },
    popupBody: {
      padding: 14,
      overflow: "auto",
      display: "grid",
      gap: 8,
    },
  };

  return (
    <div>
      <div data-tour="draft-header">
        <h2>Draft Planner</h2>
        <p style={{ color: "rgba(255,255,255,0.75)" }}>
          Track who is drafted and who is still available using your roto + durability ranking.
          Mock Draft mode can auto-pick for every other manager using roster fit and category-focused AI profiles.
        </p>
      </div>

      <div
        data-tour="draft-controls"
        style={{ display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 16, alignItems: "end" }}
      >
        <div style={{ opacity: mockIsActive ? 0.7 : 1 }}>
          <SeasonDropdown value={season} onChange={handleSeasonChange} seasons={seasons} />
        </div>

        <div style={{ opacity: mockIsActive ? 0.7 : 1 }}>
          <RiskSlider value={riskWeight} onChange={handleRiskChange} />
        </div>

        <div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", marginBottom: 6 }}>Search</div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a player name..."
            style={{
              width: 300,
              padding: 10,
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(0,0,0,0.25)",
              color: "#fff",
              outline: "none",
            }}
          />
        </div>

        <div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", marginBottom: 6 }}>Position</div>
          <select
            value={posFilter}
            onChange={(e) => setPosFilter(e.target.value)}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(0,0,0,0.25)",
              color: "#fff",
            }}
          >
            {POSITIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={clearDraft}
          style={{
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.16)",
            background: "rgba(255,255,255,0.06)",
            color: "#fff",
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          {mockIsActive ? "Reset Mock Draft" : "Clear Draft"}
        </button>

        <button
          onClick={() => {
            if (mockLayoutActive && !mockIsActive) {
              setMockRoomOpen(false);
              if (workspaceTab === "mock") setWorkspaceTab("my-team");
              return;
            }
            setMockRoomOpen(true);
            setWorkspaceTab("mock");
          }}
          disabled={mockIsActive && mockLayoutActive}
          title={
            mockIsActive && mockLayoutActive
              ? "Mock layout stays open while a mock draft is active"
              : "Open mock draft simulation layout"
          }
          style={{
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid rgba(127,223,255,0.24)",
            background: mockLayoutActive ? "rgba(127,223,255,0.12)" : "rgba(127,223,255,0.06)",
            color: mockLayoutActive ? "#d9f6ff" : "#bfefff",
            cursor: mockIsActive && mockLayoutActive ? "not-allowed" : "pointer",
            fontWeight: 800,
            opacity: mockIsActive && mockLayoutActive ? 0.75 : 1,
          }}
        >
          {mockLayoutActive ? "Mock Draft Layout Open" : "Simulate Mock Draft"}
        </button>
      </div>

      {loading || loadingLeague ? (
        <Loading text="Loading draft planner..." />
      ) : (
        <div style={{ display: "grid", gap: 18 }}>
          {mockLayoutActive && activeWorkspaceTab === "mock" && (
            <section style={styles.mockBoardShell} data-tour="draft-workspace">
              <div style={styles.sideCardHeader}>
                <div>
                  <div style={styles.sideCardTitle}>Mock Draft Room</div>
                  <div style={styles.sideCardSub}>
                    Managers across the top, rounds down the left, and the player pool below.
                  </div>
                </div>
                <div style={styles.statusPill}>
                  {mockDraft?.status === "user_turn"
                    ? "Your Turn"
                    : mockDraft?.status === "complete"
                      ? "Complete"
                      : mockDraft
                        ? "Running"
                        : "Idle"}
                </div>
              </div>

              <div style={styles.mockInfoGrid}>
                <div>
                  <div style={styles.fieldLabel}>League Size</div>
                  <select
                    value={mockLeagueSize}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      setMockLeagueSize(n);
                      setMockUserSlot((prev) => clamp(prev, 1, n));
                    }}
                    disabled={mockIsActive}
                    style={styles.fieldSelect}
                  >
                    {[8, 10, 12, 14, 16].map((n) => (
                      <option key={n} value={n} style={selectOptionStyle}>
                        {n} teams
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div style={styles.fieldLabel}>Rounds</div>
                  <select
                    value={mockRounds}
                    onChange={(e) => setMockRounds(Number(e.target.value))}
                    disabled={mockIsActive}
                    style={styles.fieldSelect}
                  >
                    {[8, 9, 10, 11, 12, 13].map((n) => (
                      <option key={n} value={n} style={selectOptionStyle}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div style={styles.fieldLabel}>Your Pick</div>
                  <select
                    value={mockUserSlotMode}
                    onChange={(e) => setMockUserSlotMode(e.target.value)}
                    disabled={mockIsActive}
                    style={styles.fieldSelect}
                  >
                    <option value="manual" style={selectOptionStyle}>Choose Slot</option>
                    <option value="random" style={selectOptionStyle}>Randomize Slot</option>
                  </select>
                </div>

                <div>
                  <div style={styles.fieldLabel}>
                    {mockUserSlotMode === "random" ? "Preview" : "Slot Number"}
                  </div>
                  <select
                    value={mockUserSlot}
                    onChange={(e) => setMockUserSlot(Number(e.target.value))}
                    disabled={mockIsActive || mockUserSlotMode === "random"}
                    style={styles.fieldSelect}
                  >
                    {Array.from({ length: mockLeagueSize }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n} style={selectOptionStyle}>
                        Pick {n}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div style={styles.fieldLabel}>CPU Difficulty</div>
                  <select
                    value={mockCpuDifficulty}
                    onChange={(e) => setMockCpuDifficulty(e.target.value)}
                    disabled={mockIsActive}
                    style={styles.fieldSelect}
                  >
                    {Object.entries(CPU_DIFFICULTY_PRESETS).map(([key, preset]) => (
                      <option key={key} value={key} style={selectOptionStyle}>
                        {preset.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={styles.mockMetaNote}>
                {mockCpuDifficulty === "hard"
                  ? "Hard CPUs always take the mathematically best pick for their build."
                  : "Normal CPUs draft strongly with only the slightest occasional human-like variance."}
              </div>

              <div style={{ padding: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  style={styles.miniBtn}
                  onClick={startMockDraft}
                  disabled={mockIsActive || !enrichedPlayers.length}
                >
                  Start Mock Draft
                </button>
                <button
                  style={styles.miniBtnDanger}
                  onClick={() => setMockDraft(null)}
                  disabled={!mockIsActive}
                >
                  End Mock
                </button>
              </div>

              {mockIsActive && (
                <>
                  <div style={styles.turnHighlight}>
                    <div>
                      <b>Season:</b> {mockDraft.season} | <b>Risk Weight:</b> {mockDraft.riskWeight} |{" "}
                      <b>CPU:</b>{" "}
                      {CPU_DIFFICULTY_PRESETS[mockDraft.cpuDifficulty]?.label || "Medium"}
                    </div>
                    <div>
                      <b>Your slot:</b> Pick {mockDraft.userSlot} | <b>Progress:</b>{" "}
                      {mockDraft.picks.length}/{mockDraft.leagueSize * mockDraft.rounds} picks
                    </div>
                    <div>
                      {mockDraft.status === "user_turn" && currentMockTurn
                        ? `Round ${currentMockTurn.round}, pick ${currentMockTurn.pickInRound} (overall ${currentMockTurn.overall}) is your turn.`
                        : mockDraft.status === "complete"
                          ? "Mock draft is complete."
                          : currentMockTurn
                            ? `Round ${currentMockTurn.round}, pick ${currentMockTurn.pickInRound} (overall ${currentMockTurn.overall}): Manager ${currentMockTurn.managerSlot} is on the clock.`
                            : "The simulator is advancing CPU picks."}
                    </div>
                  </div>

                  <div style={styles.mockBoardScroller}>
                    <div
                      style={{
                        ...styles.mockBoardGrid,
                        gridTemplateColumns: mockBoardTemplateColumns,
                      }}
                    >
                      <div style={styles.mockRoundLabel}>Board</div>
                      {mockManagers.map((m) => (
                        <div
                          key={m.slot}
                          style={{
                            ...styles.mockManagerHeader,
                            ...(m.isUser ? styles.mockManagerHeaderUser : {}),
                            ...(activeMockManagerSlot === m.slot ? styles.mockManagerHeaderActive : {}),
                          }}
                        >
                          <div style={{ fontWeight: 900 }}>{m.label}</div>
                          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.74)" }}>
                            Focus: {m.focusCats.join(", ")}
                          </div>
                          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.58)" }}>
                            Punt: {m.puntCats.join(", ") || "None"}
                          </div>
                        </div>
                      ))}

                      {mockBoardRounds.map((roundRow) => (
                        <Fragment key={`round-${roundRow.round}`}>
                          <div style={styles.mockRoundLabel}>Round {roundRow.round}</div>
                          {roundRow.picks.map(({ manager, pick }) => {
                            const isActiveCell =
                              activeMockManagerSlot === manager.slot &&
                              currentMockTurn?.round === roundRow.round &&
                              !pick &&
                              mockDraft?.status === "running";

                            return (
                              <div
                                key={`${roundRow.round}-${manager.slot}`}
                                style={{
                                  ...styles.mockBoardCell,
                                  ...(pick ? styles.mockBoardCellPicked : styles.mockBoardCellEmpty),
                                  ...(pick?.isUser ? styles.mockBoardCellUser : {}),
                                  ...(isActiveCell ? styles.mockBoardCellActive : {}),
                                }}
                              >
                                {pick ? (
                                  <>
                                    <div>
                                      <div style={styles.mockBoardPickNo}>Pick #{pick.overall}</div>
                                      <div style={styles.mockBoardPlayerName}>{pick.player_name}</div>
                                    </div>
                                    <div style={styles.mockBoardMeta}>
                                      {pick.position || "-"} | {pick.team || "-"} | {pick.assignedSlot}
                                      <br />
                                      {pick.reason}
                                    </div>
                                  </>
                                ) : isActiveCell ? (
                                  <>
                                    <div style={styles.mockBoardPickNo}>On The Clock</div>
                                    <div style={styles.mockBoardPlayerName}>{manager.label}</div>
                                    <div style={styles.mockBoardMeta}>
                                      Selecting in 2 seconds...
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <div style={styles.mockBoardPickNo}>Pending</div>
                                    <div>Waiting for this round slot.</div>
                                  </>
                                )}
                              </div>
                            );
                          })}
                        </Fragment>
                      ))}
                    </div>
                  </div>

                  <div style={{ padding: "0 14px 14px" }}>
                    <div
                      style={{
                        fontSize: 12,
                        color: "rgba(255,255,255,0.65)",
                        marginBottom: 8,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 10,
                      }}
                    >
                      <span>Recent picks</span>
                      <button
                        type="button"
                        style={styles.linkBtn}
                        onClick={() => setShowAllPicksPopup(true)}
                        disabled={!mockDraft?.picks?.length}
                        title={mockDraft?.picks?.length ? "View all draft picks" : "No picks yet"}
                      >
                        View all picks
                      </button>
                    </div>
                    <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                      {recentMockPicks.length === 0 ? (
                        <div style={styles.emptyState}>No picks yet.</div>
                      ) : (
                        recentMockPicks.map((p) => (
                          <div
                            key={`${p.overall}-${p.player_id}`}
                            style={{
                              borderRadius: 10,
                              border: "1px solid rgba(255,255,255,0.08)",
                              background: "rgba(255,255,255,0.02)",
                              padding: "8px 10px",
                              fontSize: 12,
                            }}
                          >
                            <div style={{ color: "#fff", fontWeight: 700 }}>
                              #{p.overall} {p.player_name} ({p.managerLabel})
                            </div>
                            <div style={{ color: "rgba(255,255,255,0.68)" }}>
                              Round {p.round} | {p.position || "-"} | Slot {p.assignedSlot}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </section>
          )}

          <div style={styles.boardPane} data-tour="draft-board">
            <h3>
              {mockLayoutActive ? "Player Pool" : "Available Players"} ({availablePlayers.length})
              {mockIsActive && mockDraft?.status === "user_turn" ? " - Your turn" : ""}
              {mockIsActive && mockDraft?.status === "complete" ? " - Mock complete" : ""}
            </h3>

            <div style={styles.boardTableWrap}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>#</th>
                    <th style={thStyle}>Name</th>
                    <th style={thStyle}>Pos</th>
                    <th style={thStyle}>Team</th>
                    <th style={thStyle}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                {availablePlayers.slice(0, 120).map((p, idx) => {
                  const pid = Number(p.player_id);
                  const row =
                    statsById?.get(pid) ??
                    statsById?.get(String(pid)) ??
                    null;
                  const team = row?.team || p.team || "-";
                  const pos = row?.position || p.position || "-";

                  const canUserDraft = !mockIsActive || isMyMockTurn;

                  return (
                    <tr key={pid}>
                      <td style={tdBase}>{idx + 1}</td>
                      <td style={{ ...tdBase, fontWeight: 700 }}>{p.player_name}</td>
                      <td style={tdBase}>{pos}</td>
                      <td style={tdBase}>{team}</td>

                      <td style={{ ...tdBase, borderRight: "none" }}>
                        <button
                          onClick={() => draftToMyTeam(pid)}
                          disabled={!canUserDraft}
                          title={
                            mockIsActive && !isMyMockTurn
                              ? "Wait for your turn in the mock draft"
                              : "Draft to My Team"
                          }
                          style={{
                            padding: "8px 10px",
                            borderRadius: 10,
                            border: "1px solid rgba(255,255,255,0.16)",
                            background: canUserDraft ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.02)",
                            color: canUserDraft ? "#fff" : "rgba(255,255,255,0.45)",
                            cursor: canUserDraft ? "pointer" : "not-allowed",
                            fontWeight: 700,
                            marginRight: mockIsActive ? 0 : 8,
                          }}
                        >
                          Draft (My Team)
                        </button>

                        {!mockIsActive && (
                          <button
                            onClick={() => markDrafted(pid)}
                            style={{
                              padding: "8px 10px",
                              borderRadius: 10,
                              border: "1px solid rgba(255,255,255,0.16)",
                              background: "rgba(255,255,255,0.04)",
                              color: "#fff",
                              cursor: "pointer",
                              fontWeight: 700,
                            }}
                          >
                            Drafted
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: 10, color: "rgba(255,255,255,0.65)" }}>
              Showing first 120 available players (search/filters to narrow down).
            </div>
          </div>

          <section style={{ ...styles.workspaceShell, minWidth: 0 }}>
            <div style={styles.workspaceHeader}>
              <div>
                <div style={styles.workspaceTitle}>Draft Room Workspace</div>
                <div style={{ ...styles.sideCardSub, marginTop: 2 }}>
                  {mockLayoutActive
                    ? "Track your roster and the rest of the room while the board stays above the player pool."
                    : "Tracking workspace for your roster and drafted players. Open mock layout to simulate a live draft board."}
                </div>
              </div>

              <div style={styles.workspaceTabs}>
                {[
                  ...(mockLayoutActive ? [{ id: "mock", label: "Mock Draft" }] : []),
                  { id: "my-team", label: "My Team" },
                  { id: "drafted", label: mockIsActive ? "Mock Picks (Others)" : "Drafted (Others)" },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setWorkspaceTab(tab.id)}
                    style={{
                      ...styles.workspaceTabBtn,
                      ...(activeWorkspaceTab === tab.id ? styles.workspaceTabBtnActive : {}),
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={styles.workspaceBody}>
              {activeWorkspaceTab === "mock" && (
                <div style={styles.emptyState}>
                  Mock draft board is shown above the player pool.
                  <div style={styles.emptyHint}>
                    Switch to My Team or Mock Picks (Others) here for supporting panels.
                  </div>
                </div>
              )}

              {activeWorkspaceTab === "my-team" && (
                <div style={styles.sideCard}>
                  <div style={styles.sideCardHeader}>
                    <div>
                      <div style={styles.sideCardTitle}>My Team</div>
                      <div style={styles.sideCardSub}>
                        {myTeam.length} player{myTeam.length === 1 ? "" : "s"}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        style={styles.miniBtn}
                        onClick={() => onUndoLastPick?.()}
                        disabled={!myTeam.length || mockIsActive}
                        title={mockIsActive ? "Undo is disabled during mock simulation" : "Undo last pick"}
                      >
                        Undo
                      </button>

                      <button style={styles.miniBtnDanger} onClick={clearDraft}>
                        Clear
                      </button>
                    </div>
                  </div>

                  <div style={styles.sideList}>
                    {myTeam.length === 0 ? (
                      <div style={styles.emptyState}>
                        No picks yet.
                        <div style={styles.emptyHint}>
                          {mockIsActive ? "Wait for your turn, then use Draft (My Team)." : 'Use "Draft (My Team)" in the table.'}
                        </div>
                      </div>
                    ) : (
                      myTeam.map((p) => {
                        const meta = mockPickByPlayerId.get(Number(p.player_id));
                        return (
                          <div key={p.player_id} style={styles.playerRow}>
                            <div style={{ minWidth: 0 }}>
                              <div style={styles.playerName} title={p.player_name}>
                                {p.player_name}
                              </div>
                              <div style={styles.playerMeta}>
                                {p.position || "-"} | {p.team || "-"}
                                {meta ? ` | R${meta.round} #${meta.overall}` : ""}
                              </div>
                            </div>

                            {!mockIsActive && (
                              <button
                                style={styles.pillBtn}
                                onClick={() => undoPick?.(p.player_id)}
                                title="Remove from My Team"
                              >
                                Remove
                              </button>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {activeWorkspaceTab === "drafted" && (
                <div style={styles.sideCard}>
                  <div style={styles.sideCardHeader}>
                    <div>
                      <div style={styles.sideCardTitle}>
                        {mockIsActive ? "Mock Picks (Others)" : "Drafted (Others)"}
                      </div>
                      <div style={styles.sideCardSub}>
                        {draftedOthers.length} {mockIsActive ? "auto picks" : "marked"}
                      </div>
                    </div>

                    <button
                      style={styles.miniBtn}
                      onClick={clearDraftedOthers}
                      disabled={mockIsActive}
                      title={mockIsActive ? "Use Reset Mock Draft to clear" : "Clear others"}
                    >
                      Clear
                    </button>
                  </div>

                  <div style={styles.sideList}>
                    {draftedOthers.length === 0 ? (
                      <div style={styles.emptyState}>
                        None yet.
                        <div style={styles.emptyHint}>
                          {mockIsActive ? "CPU managers have not picked yet." : 'Use "Drafted" to track other managers.'}
                        </div>
                      </div>
                    ) : (
                      draftedOthers.map(({ player, pick: mockPick }) => (
                        <div
                          key={mockPick ? `${mockPick.overall}-${player.player_id}` : player.player_id}
                          style={styles.playerRow}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div style={styles.playerName} title={player.player_name}>
                              {player.player_name}
                            </div>
                            <div style={styles.playerMeta}>
                              {player.position || "-"} | {player.team || "-"}
                              {mockPick
                                ? ` | ${mockPick.managerLabel} | R${mockPick.round} #${mockPick.overall}`
                                : ""}
                            </div>
                            {mockPick?.reason && (
                              <div style={{ ...styles.playerMeta, marginTop: 2 }}>{mockPick.reason}</div>
                            )}
                          </div>

                          {!mockIsActive && (
                            <button
                              style={styles.pillBtn}
                              onClick={() => undraftOther?.(player.player_id)}
                              title="Unmark drafted"
                            >
                              Undo
                            </button>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {showAllPicksPopup && (
        <div style={styles.popupOverlay} onMouseDown={() => setShowAllPicksPopup(false)}>
          <div style={styles.popupCard} onMouseDown={(e) => e.stopPropagation()}>
            <div style={styles.popupHeader}>
              <div>
                <div style={styles.popupTitle}>All Picks</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)" }}>
                  {(mockDraft?.picks || []).length} total pick
                  {(mockDraft?.picks || []).length === 1 ? "" : "s"}
                </div>
              </div>
              <button
                type="button"
                aria-label="Close all picks popup"
                title="Close"
                style={styles.popupClose}
                onClick={() => setShowAllPicksPopup(false)}
              >
                X
              </button>
            </div>

            <div style={styles.popupBody}>
              {(mockDraft?.picks || []).length === 0 ? (
                <div style={styles.emptyState}>No picks yet.</div>
              ) : (
                (mockDraft?.picks || []).map((p) => (
                  <div
                    key={`all-${p.overall}-${p.player_id}`}
                    style={{
                      borderRadius: 10,
                      border: "1px solid rgba(255,255,255,0.08)",
                      background: "rgba(255,255,255,0.02)",
                      padding: "8px 10px",
                      fontSize: 12,
                    }}
                  >
                    <div style={{ color: "#fff", fontWeight: 700 }}>
                      #{p.overall} {p.player_name}
                    </div>
                    <div style={{ color: "rgba(255,255,255,0.7)" }}>
                      {p.managerLabel} | Round {p.round}, Pick {p.pickInRound}
                      {p.position ? ` | ${p.position}` : ""}
                      {p.team ? ` | ${p.team}` : ""}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
