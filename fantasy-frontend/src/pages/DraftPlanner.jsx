// src/pages/DraftPlanner.jsx
import { useEffect, useMemo, useState } from "react";
import Loading from "../components/Loading";
import SeasonDropdown from "../components/SeasonDropdown";
import RiskSlider from "../components/RiskSlider";
import { useSeason } from "../hooks/useSeason";
import { useLeagueStats } from "../hooks/useLeagueStats";
import { getRotoRiskRankings } from "../api/fantasyApi";
import { loadJSON, saveJSON } from "../utils/storage";

const STORAGE_KEY = "draftPlannerState_v1";
const POSITIONS = ["All", "PG", "SG", "SF", "PF", "C", "G", "F"];
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

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

function snakeManagerSlot(leagueSize, overallPick) {
  const round = Math.ceil(overallPick / leagueSize);
  const pickInRound = ((overallPick - 1) % leagueSize) + 1;
  if (round % 2 === 1) return pickInRound;
  return leagueSize - pickInRound + 1;
}

function shuffle(arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
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
  const noise = (Math.random() - 0.5) * 0.8;

  return (
    combined +
    catGain * 5.8 +
    slotBonus +
    scarcityBonus +
    focusRaw * 0.22 +
    riskRaw * 0.18 +
    valueGapScore -
    puntPenalty * 0.14 +
    noise
  );
}

function initTeamZ() {
  const out = {};
  for (const cat of MOCK_CATEGORIES) out[cat] = 0;
  return out;
}

function sampleManagerStrategy() {
  const pool = shuffle(MOCK_CATEGORIES);
  const focusCount = Math.random() < 0.55 ? 3 : 4;
  const focusCats = pool.slice(0, focusCount);
  const puntPool = pool.filter((c) => !focusCats.includes(c));
  const puntCats = Math.random() < 0.45 && puntPool.length ? [puntPool[0]] : [];
  return { focusCats, puntCats };
}

function createMockManagers({ leagueSize, userSlot, rounds }) {
  const rosterTemplate = makeMockRosterTemplate(rounds);
  return Array.from({ length: leagueSize }, (_, idx) => {
    const slot = idx + 1;
    const strategy = sampleManagerStrategy();
    return {
      slot,
      label: slot === userSlot ? `You (Pick ${slot})` : `Manager ${slot}`,
      isUser: slot === userSlot,
      focusCats: strategy.focusCats,
      puntCats: strategy.puntCats,
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
      slotsRemaining: [...m.slotsRemaining],
      rosterIds: [...m.rosterIds],
      teamZByCat: { ...m.teamZByCat },
    })),
  };
}

function currentTurnInfo(draft) {
  if (!draft) return null;
  const totalPicks = draft.leagueSize * draft.rounds;
  if (draft.currentOverallPick > totalPicks) return null;

  const overall = draft.currentOverallPick;
  const round = Math.ceil(overall / draft.leagueSize);
  const pickInRound = ((overall - 1) % draft.leagueSize) + 1;
  const managerSlot = snakeManagerSlot(draft.leagueSize, overall);

  return { overall, round, pickInRound, managerSlot };
}

function applyPickToDraft(nextDraft, player, managerSlot, reason) {
  const turn = currentTurnInfo(nextDraft);
  if (!turn) return nextDraft;

  const manager = nextDraft.managers.find((m) => m.slot === managerSlot);
  if (!manager) return nextDraft;

  const eligible = normalizePos(player.position);
  const slotFit = findBestSlot(eligible, manager.slotsRemaining);
  const assignedSlot = slotFit?.slot || "UTIL";

  if (slotFit && slotFit.index >= 0) {
    manager.slotsRemaining.splice(slotFit.index, 1);
  } else if (manager.slotsRemaining.length) {
    manager.slotsRemaining.splice(0, 1);
  }

  manager.rosterIds.push(player.player_id);
  for (const cat of MOCK_CATEGORIES) {
    manager.teamZByCat[cat] =
      Number(manager.teamZByCat[cat] ?? 0) + Number(player.z_scores?.[cat] ?? 0);
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

function selectCpuPick({ draft, manager, players, takenSet }) {
  let best = null;
  let bestScore = -Infinity;
  let checked = 0;

  for (let idx = 0; idx < players.length; idx += 1) {
    const p = players[idx];
    if (!p || takenSet.has(p.player_id)) continue;

    const eligible = normalizePos(p.position);
    const slotFit = findBestSlot(eligible, manager.slotsRemaining);
    if (!slotFit) continue;

    checked += 1;
    const score = scoreCpuCandidate({
      player: p,
      manager,
      rounds: draft.rounds,
      overallPick: draft.currentOverallPick,
      overallRank: idx + 1,
      slotFit,
    });

    if (score > bestScore) {
      bestScore = score;
      best = {
        player: p,
        reason: `${slotFit.slot} fit, ${chooseTopStrengthLabel(p, manager)}`,
      };
    }

    if (checked >= 140 && best) break;
  }

  return best;
}

function runCpuUntilUserTurn(draft, players) {
  const next = cloneMockDraft(draft);
  const totalPicks = next.leagueSize * next.rounds;
  const takenSet = new Set(next.picks.map((p) => p.player_id));

  while (next.currentOverallPick <= totalPicks) {
    const turn = currentTurnInfo(next);
    if (!turn) break;

    if (turn.managerSlot === next.userSlot) {
      next.status = "user_turn";
      next.currentTurn = turn;
      return next;
    }

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
  }

  next.status = "complete";
  next.currentTurn = null;
  return next;
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
  return runCpuUntilUserTurn(next, players);
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

  const [mockLeagueSize, setMockLeagueSize] = useState(12);
  const [mockRounds, setMockRounds] = useState(11);
  const [mockUserSlotMode, setMockUserSlotMode] = useState("manual");
  const [mockUserSlot, setMockUserSlot] = useState(1);
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

  const playerById = useMemo(() => {
    const m = new Map();
    (players || []).forEach((p) => m.set(Number(p.player_id), p));
    return m;
  }, [players]);

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

  const availablePlayers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (players || [])
      .filter((p) => !draftedSet.has(Number(p.player_id)))
      .filter((p) => (!q ? true : (p.player_name || "").toLowerCase().includes(q)))
      .filter((p) => {
        if (posFilter === "All") return true;
        return String(p.position || "").toUpperCase().includes(posFilter);
      });
  }, [players, draftedSet, query, posFilter]);

  const myTeam = useMemo(
    () => activeMyTeamIds.map((id) => playerById.get(Number(id))).filter(Boolean),
    [activeMyTeamIds, playerById]
  );

  const currentMockTurn = mockDraft?.currentTurn || currentTurnInfo(mockDraft);
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
      setMockDraft((prev) => draftUserAndAdvance(prev, playerId, players));
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

  const startMockDraft = () => {
    if (!players.length) {
      alert("Rankings are still loading.");
      return;
    }

    const userSlot =
      mockUserSlotMode === "random"
        ? Math.floor(Math.random() * mockLeagueSize) + 1
        : clamp(mockUserSlot, 1, mockLeagueSize);

    const initialDraft = {
      season,
      riskWeight,
      leagueSize: mockLeagueSize,
      rounds: mockRounds,
      userSlot,
      status: "running",
      currentOverallPick: 1,
      currentTurn: null,
      managers: createMockManagers({ leagueSize: mockLeagueSize, userSlot, rounds: mockRounds }),
      picks: [],
    };

    setDraftedIds([]);
    setMyTeamIds([]);
    setMockDraft(runCpuUntilUserTurn(initialDraft, players));
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

  const mockManagers = mockDraft?.managers || [];
  const recentMockPicks = useMemo(() => (mockDraft?.picks || []).slice(-8).reverse(), [mockDraft]);
  const mockLayoutActive = mockRoomOpen || mockIsActive;
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
    },
    statusPill: {
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
    turnHighlight: {
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
    popupOverlay: {
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
      <h2>Draft Planner</h2>
      <p style={{ color: "rgba(255,255,255,0.75)" }}>
        Track who is drafted and who is still available using your roto + durability ranking.
        Mock Draft mode can auto-pick for every other manager using roster fit and category-focused AI profiles.
      </p>

      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 16, alignItems: "end" }}>
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
        <div
          style={{
            display: "grid",
            gap: 18,
            gridTemplateColumns: mockLayoutActive ? "minmax(0, 1fr) minmax(380px, 460px)" : "1fr",
            alignItems: "start",
          }}
        >
          <div style={styles.boardPane}>
            <h3>
              Available Players ({availablePlayers.length})
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
                    ? "Mock draft view: rankings on the left, draft room on the right."
                    : "Tracking workspace for your roster and drafted players. Open mock layout to simulate a draft side-by-side."}
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
              {mockLayoutActive && activeWorkspaceTab === "mock" && (
                <div style={styles.sideCard}>
                  <div style={styles.sideCardHeader}>
                    <div>
                      <div style={styles.sideCardTitle}>Mock Draft</div>
                      <div style={styles.sideCardSub}>
                        Auto-picks for all other managers using roster fit + category focus
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
                          <option key={n} value={n}>
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
                          <option key={n} value={n}>
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
                        <option value="manual">Choose Slot</option>
                        <option value="random">Randomize Slot</option>
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
                          <option key={n} value={n}>
                            Pick {n}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div style={{ padding: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      style={styles.miniBtn}
                      onClick={startMockDraft}
                      disabled={mockIsActive || !players.length}
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
                          <b>Season:</b> {mockDraft.season} | <b>Risk Weight:</b> {mockDraft.riskWeight}
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
                              : "The simulator is advancing CPU picks."}
                        </div>
                      </div>

                      <div style={{ padding: "0 12px 10px", color: "rgba(255,255,255,0.7)", fontSize: 12 }}>
                        AI manager profiles (focus / punt categories):
                      </div>
                      <div style={styles.managerChipWrap}>
                        {mockManagers.map((m) => (
                          <div
                            key={m.slot}
                            style={{
                              ...styles.managerChip,
                              ...(m.isUser ? styles.managerChipUser : {}),
                            }}
                          >
                            <div style={{ fontWeight: 800, marginBottom: 4 }}>{m.label}</div>
                            <div style={{ opacity: 0.9 }}>Focus: {m.focusCats.join(", ")}</div>
                            <div style={{ opacity: 0.8 }}>Punt: {m.puntCats.join(", ") || "None"}</div>
                            <div style={{ opacity: 0.7, marginTop: 2 }}>
                              Picks: {m.rosterIds.length}/{mockDraft.rounds}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div style={{ padding: "0 12px 12px" }}>
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
                            title={
                              mockDraft?.picks?.length
                                ? "View all draft picks"
                                : "No picks yet"
                            }
                          >
                            View all picks
                          </button>
                        </div>
                        <div style={{ display: "grid", gap: 8 }}>
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
                                  Round {p.round} | {p.position || "-"} | Slot {p.assignedSlot} | {p.reason}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </>
                  )}
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
