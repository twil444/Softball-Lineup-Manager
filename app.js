const STORAGE_KEY = "softball-lineup-manager-v2";
const POSITIONS = ["P", "C", "1B", "2B", "3B", "SS", "LF", "LCF", "RCF", "RF"];
const OUTFIELD_POSITIONS = ["LF", "LCF", "RCF", "RF"];
const PREFERENCE_OPTIONS = ["P", "C", "1B", "2B", "3B", "SS", "OF"];
const BASES = ["first", "second", "third"];
const TEAM_RULES = {
  "team-a": {
    optimizePositions: ["1B", "2B", "3B", "SS", "LF", "LCF", "RCF", "RF"],
    lockedPositions: ["P", "C"],
  },
  "team-b": {
    optimizePositions: [...POSITIONS],
    lockedPositions: [],
  },
};
const PONIES_PLAYERS = [
  "Charlotte Wilson",
  "Everly McKay",
  "Emerson Stechow",
  "Betsy Bender",
  "Josephine Casper",
  "Isabelle Ross",
  "Ava Arbini",
  "Rosalia Petricca",
  "Juliana Husein",
  "Ameera Husain",
  "Amara Hussein",
  "Claire Wilson",
];
const WILDCATS_PLAYERS = [
  "Victoria Arbini",
  "Madeline Baltic",
  "Audrey Bohm",
  "Josephine Bohm",
  "Mia Cazaux",
  "Harper Foley",
  "Margaret Kearney",
  "Saige McGuckin",
  "Teagan McGuckin",
  "Aviana Welling",
  "Vivian Williams",
  "Lucy Wilson",
];

const defaultState = () => ({
  activeTeamId: "team-a",
  innings: 7,
  teams: [
    createDefaultTeam("team-a", "Ponies", PONIES_PLAYERS),
    createDefaultTeam("team-b", "Wildcats", WILDCATS_PLAYERS),
  ],
});

function createDefaultTeam(id, name, playerNames) {
  const players = playerNames.map((playerName, index) => ({
    id: `${id}-player-${index + 1}`,
    name: playerName,
    preferences: [],
  }));

  const innings = {};
  for (let inning = 1; inning <= 7; inning += 1) {
    innings[String(inning)] = createEmptyAssignments();
  }

  const team = { id, name, players, innings, game: createDefaultGame(), refreshState: {} };
  if (TEAM_RULES[id]?.lockedPositions?.length) {
    for (let inning = 1; inning <= 7; inning += 1) {
      team.innings[String(inning)].P = players[0]?.id || "";
      team.innings[String(inning)].C = players[1]?.id || "";
    }
  }
  rebalanceDefense(team, 7);
  return team;
}

function createEmptyAssignments() {
  return POSITIONS.reduce((assignments, position) => {
    assignments[position] = "";
    return assignments;
  }, {});
}

function createDefaultGame() {
  return {
    inning: 1,
    outs: 0,
    teamScore: 0,
    opponentScore: 0,
    currentBatterIndex: 0,
    bases: {
      first: "",
      second: "",
      third: "",
    },
    totals: {
      hits: 0,
      walks: 0,
      strikeouts: 0,
      runs: 0,
    },
    scorebook: {},
    plateAppearanceHistory: [],
    log: [],
  };
}

function rebalanceDefense(team, inningCount) {
  const plan = buildDefensePlan(team, inningCount, { mode: "full" });
  if (plan) {
    team.innings = { ...team.innings, ...plan.innings };
    team.refreshState = {};
  }
  return getDefenseValidation(team, inningCount);
}

function rebalanceSingleInning(team, targetInning, inningCount) {
  team.refreshState ||= {};
  team.refreshState[String(targetInning)] = (team.refreshState[String(targetInning)] || 0) + 1;
  refreshCycles[`${team.id}-${targetInning}`] = (refreshCycles[`${team.id}-${targetInning}`] || 0) + 1;

  const plan = buildDefensePlan(team, inningCount, { mode: "single", targetInning });
  if (plan?.innings?.[String(targetInning)]) {
    team.innings[String(targetInning)] = plan.innings[String(targetInning)];
  }

  return evaluateBenchRefreshImpact(team, targetInning, inningCount);
}

function buildDefensePlan(team, inningCount, options = {}) {
  const players = team.players;
  const rules = getTeamRules(team);
  const benchSlotsPerInning = Math.max(players.length - POSITIONS.length, 0);
  const tracker = createDefenseTracker(players);
  const targetBenchCounts = computeTargetBenchCounts(
    players,
    benchSlotsPerInning * inningCount,
    options.mode === "single" ? getBenchCountsExcludingInning(team, inningCount, options.targetInning) : null,
  );
  const planInnings = options.mode === "single" ? { ...team.innings } : {};

  if (options.mode === "single") {
    for (let inning = 1; inning <= inningCount; inning += 1) {
      if (inning === options.targetInning) {
        continue;
      }
      applyExistingInningToTracker(team, tracker, inning);
    }
  }

  for (let inning = 1; inning <= inningCount; inning += 1) {
    if (options.mode === "single" && inning !== options.targetInning) {
      continue;
    }

    const assignments = buildInningAssignments(team, inning, inningCount, tracker, targetBenchCounts, { ...options, generatedInnings: planInnings });
    if (!assignments) {
      return null;
    }

    planInnings[String(inning)] = assignments;
    applyPlannedInningToTracker(team, tracker, inning, assignments);
  }

  return { innings: planInnings };
}

function buildInningAssignments(team, inning, inningCount, tracker, targetBenchCounts, options = {}) {
  const players = team.players;
  const rules = getTeamRules(team);
  const optimizedPositions = rules.optimizePositions;
  const lockedPositions = rules.lockedPositions;
  const benchSlotsPerInning = Math.max(players.length - POSITIONS.length, 0);
  const inningKey = String(inning);
  const existingAssignments = team.innings[inningKey] || createEmptyAssignments();
  const assignments = createEmptyAssignments();

  lockedPositions.forEach((position) => {
    assignments[position] = existingAssignments[position] || "";
  });

  const lockedIds = new Set(lockedPositions.map((position) => assignments[position]).filter(Boolean));

  const benchCandidates = players.filter((player) => !lockedIds.has(player.id));
  const currentBenchIds = new Set(getBenchPlayers(players, existingAssignments));
  const benchCombos = buildBenchCombinations(benchCandidates, benchSlotsPerInning);
  const previousAssignments = inning > 1
    ? (options.mode === "full" ? (options.generatedInnings?.[String(inning - 1)] || team.innings[String(inning - 1)]) : team.innings[String(inning - 1)])
    : null;
  const nextAssignments = options.mode === "single" && inning < inningCount ? team.innings[String(inning + 1)] : null;
  const refreshSeed = refreshCycles[`${team.id}-${inning}`] || 0;

  let bestResult = null;

  benchCombos
    .sort((comboA, comboB) => scoreBenchCombo(comboA, tracker, targetBenchCounts, currentBenchIds, players, refreshSeed)
      - scoreBenchCombo(comboB, tracker, targetBenchCounts, currentBenchIds, players, refreshSeed))
    .slice(0, 24)
    .forEach((benchCombo) => {
      if (bestResult) {
        return;
      }

      const benchedIds = new Set(benchCombo.map((player) => player.id));
      const availablePlayers = players.filter((player) => !benchedIds.has(player.id) && !lockedIds.has(player.id));
      const positionPlan = assignPositionsForInning(optimizedPositions, availablePlayers, {
        rosterOrder: players,
        tracker,
        previousAssignments,
        nextAssignments,
        currentAssignments: existingAssignments,
        refreshSeed,
      });

      if (!positionPlan) {
        return;
      }

      optimizedPositions.forEach((position) => {
        assignments[position] = positionPlan[position] || "";
      });
      bestResult = assignments;
    });

  return bestResult;
}

function createDefenseTracker(players) {
  return {
    benchCounts: Object.fromEntries(players.map((player) => [player.id, 0])),
    fieldCounts: Object.fromEntries(players.map((player) => [player.id, 0])),
    positionCounts: Object.fromEntries(players.map((player) => [player.id, Object.fromEntries(POSITIONS.map((position) => [position, 0]))])),
    lastBenchedInning: Object.fromEntries(players.map((player) => [player.id, -999])),
  };
}

function applyExistingInningToTracker(team, tracker, inning) {
  const assignments = team.innings[String(inning)] || createEmptyAssignments();
  applyAssignmentSetToTracker(team.players, tracker, inning, assignments);
}

function applyPlannedInningToTracker(team, tracker, inning, assignments) {
  applyAssignmentSetToTracker(team.players, tracker, inning, assignments);
}

function applyAssignmentSetToTracker(players, tracker, inning, assignments) {
  const benchIds = getBenchPlayers(players, assignments);
  Object.entries(assignments).forEach(([position, playerId]) => {
    if (!playerId) {
      return;
    }
    tracker.fieldCounts[playerId] += 1;
    tracker.positionCounts[playerId][position] += 1;
  });
  benchIds.forEach((playerId) => {
    tracker.benchCounts[playerId] += 1;
    tracker.lastBenchedInning[playerId] = inning;
  });
}

function computeTargetBenchCounts(players, totalBenchSlots, baselineCounts = null) {
  const base = Math.floor(totalBenchSlots / players.length);
  const extra = totalBenchSlots % players.length;
  const ordered = [...players].sort((a, b) => {
    const baselineDelta = (baselineCounts?.[b.id] || 0) - (baselineCounts?.[a.id] || 0);
    if (baselineDelta !== 0) {
      return baselineDelta;
    }
    return players.findIndex((player) => player.id === a.id) - players.findIndex((player) => player.id === b.id);
  });
  const highIds = new Set(ordered.slice(0, extra).map((player) => player.id));
  return Object.fromEntries(players.map((player) => [player.id, base + (highIds.has(player.id) ? 1 : 0)]));
}

function getBenchCountsExcludingInning(team, inningCount, skippedInning) {
  const counts = Object.fromEntries(team.players.map((player) => [player.id, 0]));
  for (let inning = 1; inning <= inningCount; inning += 1) {
    if (inning === skippedInning) {
      continue;
    }
    const benchIds = getBenchPlayers(team.players, team.innings[String(inning)] || createEmptyAssignments());
    benchIds.forEach((playerId) => {
      counts[playerId] += 1;
    });
  }
  return counts;
}

function buildBenchCombinations(players, benchSlots) {
  if (!benchSlots) {
    return [[]];
  }
  const combinations = [];

  function walk(startIndex, current) {
    if (current.length === benchSlots) {
      combinations.push([...current]);
      return;
    }

    for (let index = startIndex; index < players.length; index += 1) {
      current.push(players[index]);
      walk(index + 1, current);
      current.pop();
    }
  }

  walk(0, []);
  return combinations;
}

function scoreBenchCombo(combo, tracker, targetBenchCounts, currentBenchIds, players, refreshSeed) {
  return combo.reduce((score, player) => {
    const projectedBench = tracker.benchCounts[player.id] + 1;
    const targetBench = targetBenchCounts[player.id];
    const rosterIndex = players.findIndex((candidate) => candidate.id === player.id);
    score += Math.abs(projectedBench - targetBench) * 120;
    score += currentBenchIds.has(player.id) ? 18 : 0;
    score -= tracker.fieldCounts[player.id] * 2;
    score += ((rosterIndex + refreshSeed) % players.length) * 0.1;
    return score;
  }, 0);
}

function assignPositionsForInning(positions, availablePlayers, context) {
  const orderedPositions = [...positions].sort((a, b) =>
    rankCandidatesForPosition(a, availablePlayers, context).length - rankCandidatesForPosition(b, availablePlayers, context).length);

  function walk(positionIndex, remainingPlayers, partial) {
    if (positionIndex >= orderedPositions.length) {
      return { ...partial };
    }

    const position = orderedPositions[positionIndex];
    const candidates = rankCandidatesForPosition(position, remainingPlayers, context);
    for (const candidate of candidates) {
      partial[position] = candidate.id;
      const nextRemaining = remainingPlayers.filter((player) => player.id !== candidate.id);
      const result = walk(positionIndex + 1, nextRemaining, partial);
      if (result) {
        return result;
      }
      delete partial[position];
    }

    return null;
  }

  return walk(0, availablePlayers, {});
}

function rankCandidatesForPosition(position, remainingPlayers, context) {
  const cappedPool = remainingPlayers.filter((player) => context.tracker.positionCounts[player.id][position] < 2);
  const pool = cappedPool.length ? cappedPool : remainingPlayers;

  return [...pool]
    .map((player) => ({
      id: player.id,
      score: scorePositionCandidate(player, position, context),
    }))
    .sort((a, b) => a.score - b.score);
}

function scorePositionCandidate(player, position, context) {
  const rosterIndex = context.rosterOrder.findIndex((candidate) => candidate.id === player.id);
  const preferenceRank = getPreferenceRank(player.preferences, position);
  const previousPenalty = context.previousAssignments?.[position] === player.id ? 90 : 0;
  const nextPenalty = context.nextAssignments?.[position] === player.id ? 70 : 0;
  const currentPenalty = context.currentAssignments?.[position] === player.id ? 30 : 0;
  const preferencePenalty = preferenceRank === 999 ? 55 : preferenceRank * 10;
  const positionPenalty = context.tracker.positionCounts[player.id][position] * 35;
  return previousPenalty
    + nextPenalty
    + currentPenalty
    + preferencePenalty
    + positionPenalty
    + ((rosterIndex + context.refreshSeed) % context.rosterOrder.length) * 0.25;
}

function getTeamRules(team) {
  return TEAM_RULES[team.id] || { optimizePositions: [...POSITIONS], lockedPositions: [] };
}

function evaluateBenchRefreshImpact(team, targetInning, inningCount) {
  const benchCounts = getBenchCounts(team, inningCount);
  const values = Object.values(benchCounts);
  const maxBench = Math.max(...values, 0);
  const minBench = Math.min(...values, 0);
  if (maxBench - minBench <= 1) {
    return null;
  }

  const overBenchedIds = Object.entries(benchCounts)
    .filter(([, count]) => count === maxBench)
    .map(([playerId]) => playerId);
  const underBenchedIds = Object.entries(benchCounts)
    .filter(([, count]) => count === minBench)
    .map(([playerId]) => playerId);

  for (let inning = 1; inning <= inningCount; inning += 1) {
    if (inning === targetInning) {
      continue;
    }

    const benchIds = getBenchPlayers(team.players, team.innings[String(inning)] || createEmptyAssignments());
    const hasOverBenchedPlayer = benchIds.some((playerId) => overBenchedIds.includes(playerId));
    const hasUnderBenchedPlayerInField = underBenchedIds.some((playerId) => !benchIds.includes(playerId));
    if (hasOverBenchedPlayer && hasUnderBenchedPlayerInField) {
      return { suggestedInning: inning, maxBench, minBench };
    }
  }

  return { suggestedInning: null, maxBench, minBench };
}

function getBenchCounts(team, inningCount) {
  const benchCounts = Object.fromEntries(team.players.map((player) => [player.id, 0]));
  for (let inning = 1; inning <= inningCount; inning += 1) {
    const benchIds = getBenchPlayers(team.players, team.innings[String(inning)] || createEmptyAssignments());
    benchIds.forEach((playerId) => {
      benchCounts[playerId] += 1;
    });
  }
  return benchCounts;
}

function getDefenseValidation(team, inningCount) {
  const issues = [];
  const benchCounts = getBenchCounts(team, inningCount);
  const benchValues = Object.values(benchCounts);
  const maxBench = Math.max(...benchValues, 0);
  const minBench = Math.min(...benchValues, 0);

  if (maxBench - minBench > 1) {
    issues.push({
      severity: "error",
      text: `Bench balance is ${minBench}-${maxBench}. No player should sit more than one extra inning than another.`,
    });
  }

  for (let inning = 1; inning <= inningCount; inning += 1) {
    const duplicateNames = getDuplicateAssignments(team.players, team.innings[String(inning)] || createEmptyAssignments());
    if (duplicateNames.length) {
      issues.push({
        severity: "error",
        text: `Inning ${inning} has duplicate player assignments: ${duplicateNames.join(", ")}.`,
      });
    }
  }

  team.players.forEach((player) => {
    POSITIONS.forEach((position) => {
      if (getTeamRules(team).lockedPositions.includes(position)) {
        return;
      }
      const count = Array.from({ length: inningCount }, (_, index) => team.innings[String(index + 1)]?.[position] === player.id ? 1 : 0)
        .reduce((sum, value) => sum + value, 0);
      if (count > 2) {
        issues.push({
          severity: "error",
          text: `${player.name} is assigned to ${position} ${count} times. Max is 2.`,
        });
      }
    });
  });

  for (let inning = 2; inning <= inningCount; inning += 1) {
    const previousAssignments = team.innings[String(inning - 1)] || createEmptyAssignments();
    const currentAssignments = team.innings[String(inning)] || createEmptyAssignments();
    getTeamRules(team).optimizePositions.forEach((position) => {
      if (previousAssignments[position] && previousAssignments[position] === currentAssignments[position]) {
        issues.push({
          severity: "warn",
          text: `${getPlayerName(team.players, currentAssignments[position])} repeats ${position} in innings ${inning - 1} and ${inning}.`,
        });
      }
    });
  }

  return issues;
}

function getPreferenceRank(preferences, position) {
  const directIndex = preferences.indexOf(position);
  if (directIndex >= 0) {
    return directIndex;
  }
  const outfieldIndex = preferences.indexOf("OF");
  if (outfieldIndex >= 0 && OUTFIELD_POSITIONS.includes(position)) {
    return outfieldIndex;
  }
  return 999;
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      return defaultState();
    }

    const parsed = JSON.parse(saved);
    return normalizeState(parsed);
  } catch (error) {
    console.error("Unable to load saved data", error);
    return defaultState();
  }
}

function normalizeState(saved) {
  const base = defaultState();
  const state = {
    activeTeamId: saved.activeTeamId || base.activeTeamId,
    innings: clampInnings(saved.innings || base.innings),
    teams: Array.isArray(saved.teams) && saved.teams.length === 2 ? saved.teams : base.teams,
  };

  state.teams = state.teams.map((team, teamIndex) => {
    const fallback = base.teams[teamIndex];
    const players = Array.isArray(team.players) && team.players.length >= 1
      ? team.players.map((player, playerIndex) => ({
          id: player.id || fallback.players[playerIndex]?.id || `player-${playerIndex + 1}`,
          name: player.name || fallback.players[playerIndex]?.name || `Player ${playerIndex + 1}`,
          preferences: normalizePreferences(player.preferences),
        }))
      : fallback.players;
    const innings = {};

    for (let inning = 1; inning <= 7; inning += 1) {
      const existing = team.innings?.[String(inning)];
      innings[String(inning)] = POSITIONS.reduce((assignments, position, positionIndex) => {
        const fallbackId = players[positionIndex % players.length]?.id || "";
        const chosenId = existing?.[position];
        assignments[position] = players.some((player) => player.id === chosenId) ? chosenId : fallbackId;
        return assignments;
      }, {});
    }

    return {
      id: team.id || fallback.id,
      name: team.name || fallback.name,
      players,
      innings,
      refreshState: typeof team.refreshState === "object" && team.refreshState ? team.refreshState : {},
      game: normalizeGame(team.game, players),
    };
  });

  if (!state.teams.some((team) => team.id === state.activeTeamId)) {
    state.activeTeamId = state.teams[0].id;
  }

  return state;
}

function clampInnings(value) {
  const numeric = Number(value);
  return Math.min(7, Math.max(1, Number.isFinite(numeric) ? numeric : 7));
}

function normalizeGame(savedGame, players) {
  const game = createDefaultGame();
  game.inning = Math.max(1, Number(savedGame?.inning) || 1);
  game.outs = Math.min(3, Math.max(0, Number(savedGame?.outs) || 0));
  game.teamScore = Math.max(0, Number(savedGame?.teamScore) || 0);
  game.opponentScore = Math.max(0, Number(savedGame?.opponentScore) || 0);
  game.currentBatterIndex = clampBatterIndex(savedGame?.currentBatterIndex, players.length);
  game.totals.hits = Math.max(0, Number(savedGame?.totals?.hits) || 0);
  game.totals.walks = Math.max(0, Number(savedGame?.totals?.walks) || 0);
  game.totals.strikeouts = Math.max(0, Number(savedGame?.totals?.strikeouts) || 0);
  game.totals.runs = Math.max(0, Number(savedGame?.totals?.runs) || 0);
  game.scorebook = normalizeScorebook(savedGame?.scorebook, players);
  game.plateAppearanceHistory = Array.isArray(savedGame?.plateAppearanceHistory) ? savedGame.plateAppearanceHistory.slice(-20) : [];
  game.log = Array.isArray(savedGame?.log) ? savedGame.log.slice(0, 20) : [];

  BASES.forEach((base) => {
    const playerId = savedGame?.bases?.[base];
    game.bases[base] = players.some((player) => player.id === playerId) ? playerId : "";
  });

  return game;
}

function clampBatterIndex(value, playerCount) {
  const count = Math.max(1, playerCount || 1);
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return ((numeric % count) + count) % count;
}

function normalizePreferences(preferences) {
  if (!Array.isArray(preferences)) {
    return [];
  }
  return preferences.filter((position, index) => PREFERENCE_OPTIONS.includes(position) && preferences.indexOf(position) === index).slice(0, 4);
}

function normalizeScorebook(scorebook, players) {
  const normalized = {};
  for (let inning = 1; inning <= 7; inning += 1) {
    const inningKey = String(inning);
    normalized[inningKey] = {};
    players.forEach((player) => {
      const entries = scorebook?.[inningKey]?.[player.id];
      normalized[inningKey][player.id] = Array.isArray(entries)
        ? entries.slice(0, 6).map((entry, entryIndex) => normalizeScorebookEntry(entry, inningKey, player.id, entryIndex))
        : [];
    });
  }
  return normalized;
}

function normalizeScorebookEntry(entry, inningKey, playerId, entryIndex) {
  if (typeof entry === "string") {
    return {
      id: `${inningKey}-${playerId}-${entryIndex}`,
      result: entry,
      basesReached: [],
      scored: false,
      out: entry === "O" || entry === "K",
    };
  }

  return {
    id: entry?.id || `${inningKey}-${playerId}-${entryIndex}`,
    result: entry?.result || "",
    basesReached: Array.isArray(entry?.basesReached) ? entry.basesReached.filter((base) => [1, 2, 3].includes(base)) : [],
    scored: Boolean(entry?.scored),
    out: Boolean(entry?.out),
  };
}

let state = loadState();
let activeSection = "batting";
let draggedRosterIndex = null;
const refreshCycles = {};

const elements = {
  sectionNavButtons: Array.from(document.querySelectorAll(".section-nav-button")),
  sectionPanels: Array.from(document.querySelectorAll("[data-section-panel]")),
  teamTabs: document.querySelector("#team-tabs"),
  teamName: document.querySelector("#team-name"),
  rosterList: document.querySelector("#roster-list"),
  lineupGrid: document.querySelector("#lineup-grid"),
  lockedDefensePanel: document.querySelector("#locked-defense-panel"),
  defenseGrid: document.querySelector("#defense-grid"),
  playerDefenseGrid: document.querySelector("#player-defense-grid"),
  defenseExplainer: document.querySelector("#defense-explainer"),
  defenseValidation: document.querySelector("#defense-validation"),
  preferencesList: document.querySelector("#preferences-list"),
  inningCount: document.querySelector("#inning-count"),
  defenseVisualInning: document.querySelector("#defense-visual-inning"),
  defenseDiamond: document.querySelector("#defense-diamond"),
  rebuildDefense: document.querySelector("#rebuild-defense"),
  resetGame: document.querySelector("#reset-game"),
  addPlayer: document.querySelector("#add-player"),
  teamScore: document.querySelector("#team-score"),
  opponentScore: document.querySelector("#opponent-score"),
  gameInning: document.querySelector("#game-inning"),
  gameOuts: document.querySelector("#game-outs"),
  opponentMinus: document.querySelector("#opponent-minus"),
  opponentPlus: document.querySelector("#opponent-plus"),
  inningMinus: document.querySelector("#inning-minus"),
  inningPlus: document.querySelector("#inning-plus"),
  outsMinus: document.querySelector("#outs-minus"),
  outsPlus: document.querySelector("#outs-plus"),
  currentBatterName: document.querySelector("#current-batter-name"),
  nextBatterName: document.querySelector("#next-batter-name"),
  recordHit: document.querySelector("#record-hit"),
  recordWalk: document.querySelector("#record-walk"),
  recordOut: document.querySelector("#record-out"),
  recordStrikeout: document.querySelector("#record-strikeout"),
  prevBatter: document.querySelector("#prev-batter"),
  nextBatter: document.querySelector("#next-batter"),
  clearBases: document.querySelector("#clear-bases"),
  basesGrid: document.querySelector("#bases-grid"),
  gameDiamond: document.querySelector("#game-diamond"),
  gameTotals: document.querySelector("#game-totals"),
  gameLog: document.querySelector("#game-log"),
  scorebookGrid: document.querySelector("#scorebook-grid"),
  teamTabTemplate: document.querySelector("#team-tab-template"),
  rosterRowTemplate: document.querySelector("#roster-row-template"),
  inningCardTemplate: document.querySelector("#inning-card-template"),
  positionRowTemplate: document.querySelector("#position-row-template"),
  baseCardTemplate: document.querySelector("#base-card-template"),
  preferenceRowTemplate: document.querySelector("#preference-row-template"),
  lockedRowTemplate: document.querySelector("#locked-row-template"),
};

for (let inning = 1; inning <= 7; inning += 1) {
  const option = document.createElement("option");
  option.value = String(inning);
  option.textContent = String(inning);
  elements.inningCount.append(option);
  elements.defenseVisualInning.append(option.cloneNode(true));
}

elements.teamName.addEventListener("input", (event) => {
  updateActiveTeam((team) => {
    team.name = event.target.value;
  });
});

elements.inningCount.addEventListener("change", (event) => {
  state.innings = clampInnings(event.target.value);
  saveAndRender();
});

elements.rebuildDefense.addEventListener("click", () => {
  updateActiveTeam((team) => {
    rebalanceDefense(team, state.innings);
  });
});

elements.defenseVisualInning.addEventListener("change", () => {
  renderDefenseDiamond();
});

elements.sectionNavButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activeSection = button.dataset.sectionTarget;
    renderSectionVisibility();
  });
});

elements.addPlayer.addEventListener("click", () => {
  updateActiveTeam((team) => {
    const nextNumber = team.players.length + 1;
    const playerId = `${team.id}-player-${Date.now()}`;
    team.players.push({
      id: playerId,
      name: `${team.name} Player ${nextNumber}`,
    });
    team.game = normalizeGame(team.game, team.players);
  });
});

elements.resetGame.addEventListener("click", () => {
  updateActiveTeam((team) => {
    team.game = createDefaultGame();
  });
});

elements.opponentMinus.addEventListener("click", () => adjustGameNumber("opponentScore", -1, 0));
elements.opponentPlus.addEventListener("click", () => adjustGameNumber("opponentScore", 1, 0));
elements.inningMinus.addEventListener("click", () => adjustGameNumber("inning", -1, 1));
elements.inningPlus.addEventListener("click", () => adjustGameNumber("inning", 1, 1));
elements.outsMinus.addEventListener("click", () => adjustGameNumber("outs", -1, 0, 3));
elements.outsPlus.addEventListener("click", () => adjustGameNumber("outs", 1, 0, 3));
elements.recordHit.addEventListener("click", () => recordPlateAppearance("Hit"));
elements.recordWalk.addEventListener("click", () => recordPlateAppearance("Walk"));
elements.recordOut.addEventListener("click", () => recordPlateAppearance("Out"));
elements.recordStrikeout.addEventListener("click", () => recordPlateAppearance("Strikeout"));
elements.prevBatter.addEventListener("click", () => shiftCurrentBatter(-1));
elements.nextBatter.addEventListener("click", () => shiftCurrentBatter(1));
elements.clearBases.addEventListener("click", () => {
  updateActiveTeam((team) => {
    team.game.bases = createDefaultGame().bases;
    addGameLog(team.game, "Bases cleared");
  });
});

function getActiveTeam() {
  return state.teams.find((team) => team.id === state.activeTeamId) || state.teams[0];
}

function updateActiveTeam(mutator) {
  const activeTeam = getActiveTeam();
  mutator(activeTeam);
  saveAndRender();
}

function saveAndRender() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  render();
}

function render() {
  renderSectionVisibility();
  renderTeamTabs();
  renderRoster();
  renderLineups();
  renderLockedDefenseControls();
  renderPreferences();
  renderDefenseExplainer();
  renderDefenseValidation();
  renderDefenseDiamond();
  renderDefenseGrid();
  renderPlayerDefenseGrid();
  renderGameMode();
  renderScorebook();
}

function renderSectionVisibility() {
  elements.sectionNavButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.sectionTarget === activeSection);
  });

  elements.sectionPanels.forEach((panel) => {
    panel.classList.toggle("hidden-section", panel.dataset.sectionPanel !== activeSection);
  });
}

function renderTeamTabs() {
  elements.teamTabs.innerHTML = "";
  for (const team of state.teams) {
    const button = elements.teamTabTemplate.content.firstElementChild.cloneNode(true);
    button.textContent = team.name;
    button.classList.toggle("active", team.id === state.activeTeamId);
    button.addEventListener("click", () => {
      state.activeTeamId = team.id;
      saveAndRender();
    });
    elements.teamTabs.append(button);
  }

  elements.teamName.value = getActiveTeam().name;
  elements.inningCount.value = String(state.innings);
  if (Number(elements.defenseVisualInning.value) > state.innings || !elements.defenseVisualInning.value) {
    elements.defenseVisualInning.value = "1";
  }
}

function renderDefenseExplainer() {
  const team = getActiveTeam();
  const rules = getTeamRules(team);
  const items = [
    "Bench counts are targeted so nobody should sit more than one inning more than anyone else.",
    "Unlocked positions are capped at two appearances per player per game.",
    `${team.name === "Ponies" || rules.lockedPositions.length ? "Ponies pitcher/catcher assignments stay locked and are not auto-moved." : "All 10 field spots can be optimized for this team."}`,
    "Preferred positions are used before non-preferred options when a legal assignment exists.",
    "Refresh Inning is local to one inning. Rebuild Defense recalculates all active innings together.",
  ];

  elements.defenseExplainer.innerHTML = "";
  items.forEach((text) => {
    const item = document.createElement("div");
    item.className = "defense-explainer-item";
    item.textContent = text;
    elements.defenseExplainer.append(item);
  });
}

function renderDefenseValidation() {
  const team = getActiveTeam();
  const issues = getDefenseValidation(team, state.innings);
  elements.defenseValidation.innerHTML = "";

  if (!issues.length) {
    const item = document.createElement("div");
    item.className = "validation-item validation-ok";
    item.textContent = "Defense looks valid across the active innings.";
    elements.defenseValidation.append(item);
    return;
  }

  issues.forEach((issue) => {
    const item = document.createElement("div");
    item.className = `validation-item ${issue.severity === "error" ? "validation-error" : "validation-warn"}`;
    item.textContent = issue.text;
    elements.defenseValidation.append(item);
  });
}

function renderRoster() {
  const team = getActiveTeam();
  elements.rosterList.innerHTML = "";

  team.players.forEach((player, index) => {
    const row = elements.rosterRowTemplate.content.firstElementChild.cloneNode(true);
    row.draggable = true;
    row.dataset.index = String(index);
    row.querySelector(".bat-spot").textContent = String(index + 1);

    const input = row.querySelector(".player-name");
    input.value = player.name;
    input.addEventListener("input", (event) => {
      updateActiveTeam((activeTeam) => {
        activeTeam.players[index].name = event.target.value;
      });
    });

    const upButton = row.querySelector('[data-direction="up"]');
    const downButton = row.querySelector('[data-direction="down"]');
    upButton.textContent = "^";
    downButton.textContent = "v";
    upButton.addEventListener("click", () => movePlayer(index, -1));
    downButton.addEventListener("click", () => movePlayer(index, 1));

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "move-button remove-button";
    removeButton.textContent = "X";
    removeButton.setAttribute("aria-label", `Remove ${player.name || "player"}`);
    removeButton.addEventListener("click", () => removePlayer(index));
    row.querySelector(".row-actions").append(removeButton);

    row.addEventListener("dragstart", () => {
      draggedRosterIndex = index;
      row.classList.add("dragging");
    });
    row.addEventListener("dragend", () => {
      draggedRosterIndex = null;
      row.classList.remove("dragging");
      elements.rosterList.querySelectorAll(".drag-target").forEach((target) => target.classList.remove("drag-target"));
    });
    row.addEventListener("dragover", (event) => {
      event.preventDefault();
      row.classList.add("drag-target");
    });
    row.addEventListener("dragleave", () => {
      row.classList.remove("drag-target");
    });
    row.addEventListener("drop", (event) => {
      event.preventDefault();
      row.classList.remove("drag-target");
      if (draggedRosterIndex === null || draggedRosterIndex === index) {
        return;
      }
      reorderPlayer(draggedRosterIndex, index);
    });

    elements.rosterList.append(row);
  });
}

function getShortPlayerName(players, playerId) {
  const fullName = getPlayerName(players, playerId);
  if (!fullName || fullName === "Unknown") {
    return "Open";
  }
  return fullName.split(" ")[0];
}

function movePlayer(index, direction) {
  updateActiveTeam((team) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= team.players.length) {
      return;
    }

    [team.players[index], team.players[targetIndex]] = [team.players[targetIndex], team.players[index]];
    team.game.currentBatterIndex = clampBatterIndex(team.game.currentBatterIndex, team.players.length);
  });
}

function reorderPlayer(fromIndex, toIndex) {
  updateActiveTeam((team) => {
    if (fromIndex < 0 || toIndex < 0 || fromIndex >= team.players.length || toIndex >= team.players.length) {
      return;
    }

    const [movedPlayer] = team.players.splice(fromIndex, 1);
    team.players.splice(toIndex, 0, movedPlayer);
    team.game.currentBatterIndex = clampBatterIndex(team.game.currentBatterIndex, team.players.length);
  });
}

function removePlayer(index) {
  updateActiveTeam((team) => {
    if (team.players.length <= 1) {
      return;
    }

    const [removedPlayer] = team.players.splice(index, 1);
    for (let inning = 1; inning <= 7; inning += 1) {
      const assignments = team.innings[String(inning)];
      POSITIONS.forEach((position) => {
        if (assignments[position] === removedPlayer.id) {
          assignments[position] = "";
        }
      });
    }

    BASES.forEach((base) => {
      if (team.game.bases[base] === removedPlayer.id) {
        team.game.bases[base] = "";
      }
    });
    team.game.currentBatterIndex = clampBatterIndex(team.game.currentBatterIndex, team.players.length);
  });
}

function renderLineups() {
  const team = getActiveTeam();
  const rules = getTeamRules(team);
  elements.lineupGrid.innerHTML = "";

  for (let inning = 1; inning <= state.innings; inning += 1) {
    const inningKey = String(inning);
    const assignments = team.innings[inningKey];
    const duplicateGroups = getDuplicateAssignmentGroups(assignments);
    const card = elements.inningCardTemplate.content.firstElementChild.cloneNode(true);
    card.querySelector("h3").textContent = `Inning ${inning}`;
    card.querySelector(".inning-refresh-button").addEventListener("click", () => {
      updateActiveTeam((activeTeam) => {
        const refreshImpact = rebalanceSingleInning(activeTeam, inning, state.innings);
        if (refreshImpact) {
          const message = refreshImpact.suggestedInning
            ? `Bench balance is now ${refreshImpact.minBench}-${refreshImpact.maxBench}. To keep sit time more even, consider refreshing inning ${refreshImpact.suggestedInning} too.`
            : `Bench balance is now ${refreshImpact.minBench}-${refreshImpact.maxBench}. Another inning may need an adjustment to keep sit time even.`;
          window.alert(message);
        }
      });
    });

    const positionsContainer = card.querySelector(".inning-positions");
    POSITIONS.forEach((position) => {
      if (rules.lockedPositions.includes(position)) {
        return;
      }
      const row = elements.positionRowTemplate.content.firstElementChild.cloneNode(true);
      row.querySelector("span").textContent = position;
      const select = row.querySelector("select");
      applyDuplicateGroupClass(row, duplicateGroups[assignments[position]]);
      populatePlayerOptions(select, team.players, assignments[position]);
      select.addEventListener("change", (event) => {
        updateActiveTeam((activeTeam) => {
          activeTeam.innings[inningKey][position] = event.target.value;
        });
      });
      positionsContainer.append(row);
    });

    const benchIds = getBenchPlayers(team.players, assignments);
    benchIds.forEach((playerId, index) => {
      const row = elements.positionRowTemplate.content.firstElementChild.cloneNode(true);
      row.classList.add("bench-row");
      row.querySelector("span").textContent = `BN${index + 1}`;
      const select = row.querySelector("select");
      applyDuplicateGroupClass(row, duplicateGroups[playerId]);
      populatePlayerOptions(select, team.players, playerId, "Open");
      select.addEventListener("change", (event) => {
        updateActiveTeam((activeTeam) => {
          const chosenId = event.target.value;
          const inningAssignments = activeTeam.innings[inningKey];
          const currentBench = getBenchPlayers(activeTeam.players, inningAssignments);
          const replacementId = currentBench[index];
          POSITIONS.forEach((position) => {
            if (inningAssignments[position] === chosenId) {
              inningAssignments[position] = replacementId || "";
            }
          });
        });
      });
      positionsContainer.append(row);
    });

    const duplicateNames = getDuplicateAssignments(team.players, assignments);
    const benchLabel = card.querySelector(".bench-list");
    const benchMarkup = benchIds.length
      ? benchIds.map((playerId) => {
          const battingNumber = getBattingNumber(team.players, playerId);
          return `#${battingNumber} ${getPlayerName(team.players, playerId)}`;
        }).join(" | ")
      : "None";
    const duplicateText = duplicateNames.length ? ` | Duplicate: ${duplicateNames.join(", ")}` : "";
    benchLabel.textContent = `Bench: ${benchMarkup}${duplicateText}`;
    if (duplicateNames.length) {
      benchLabel.classList.add("warning");
    }

    elements.lineupGrid.append(card);
  }
}

function renderLockedDefenseControls() {
  const team = getActiveTeam();
  const rules = getTeamRules(team);
  elements.lockedDefensePanel.innerHTML = "";

  if (!rules.lockedPositions.length) {
    elements.lockedDefensePanel.hidden = true;
    return;
  }

  elements.lockedDefensePanel.hidden = false;

  const header = document.createElement("div");
  header.className = "panel-header";
  header.innerHTML = `<div><p class="section-label">Hard Set Defense</p><h3>Pitcher And Catcher By Inning</h3></div>`;
  elements.lockedDefensePanel.append(header);

  rules.lockedPositions.forEach((position) => {
    const row = elements.lockedRowTemplate.content.firstElementChild.cloneNode(true);
    row.querySelector(".locked-label").textContent = position;
    const container = row.querySelector(".locked-selects");

    for (let inning = 1; inning <= state.innings; inning += 1) {
      const slot = document.createElement("div");
      slot.className = "locked-slot";
      const inningLabel = document.createElement("span");
      inningLabel.className = "locked-inning-label";
      inningLabel.textContent = `In ${inning}`;
      const select = document.createElement("select");
      populatePlayerOptions(select, team.players, team.innings[String(inning)][position]);
      select.addEventListener("change", (event) => {
        updateActiveTeam((activeTeam) => {
          activeTeam.innings[String(inning)][position] = event.target.value;
        });
      });
      slot.append(inningLabel, select);
      container.append(slot);
    }

    elements.lockedDefensePanel.append(row);
  });
}

function renderDefenseGrid() {
  const team = getActiveTeam();
  elements.defenseGrid.innerHTML = "";
  const rules = getTeamRules(team);
  const header = document.createElement("div");
  header.className = "defense-grid-row defense-grid-header-row";
  header.append(createDefenseGridCell("Pos", true, true));
  for (let inning = 1; inning <= state.innings; inning += 1) {
    header.append(createDefenseGridCell(`In ${inning}`, true));
  }
  elements.defenseGrid.append(header);

  const rows = [...POSITIONS];
  const maxBenchCount = Math.max(...Array.from({ length: state.innings }, (_, index) => getBenchPlayers(team.players, team.innings[String(index + 1)]).length), 0);
  for (let benchIndex = 0; benchIndex < maxBenchCount; benchIndex += 1) {
    rows.push(`BENCH_${benchIndex + 1}`);
  }

  rows.forEach((rowKey) => {
    const row = document.createElement("div");
    row.className = "defense-grid-row";
    const label = rowKey.startsWith("BENCH_") ? `B${rowKey.split("_")[1]}` : rowKey;
    row.append(createDefenseGridCell(label, true, true));

    for (let inning = 1; inning <= state.innings; inning += 1) {
      const inningAssignments = team.innings[String(inning)];
      const duplicateGroups = getDuplicateAssignmentGroups(inningAssignments);
      const benchIds = getBenchPlayers(team.players, inningAssignments);
      const playerId = rowKey.startsWith("BENCH_")
        ? benchIds[Number(rowKey.split("_")[1]) - 1] || ""
        : inningAssignments[rowKey];
      const battingNumber = getBattingNumber(team.players, playerId);
      const shortName = playerId ? getShortPlayerName(team.players, playerId) : "";
      const cell = document.createElement("div");
      cell.className = `defense-grid-cell${rowKey.startsWith("BENCH_") ? " bench" : ""}`;
      applyDuplicateGroupClass(cell, duplicateGroups[playerId]);
      cell.innerHTML = `<strong>${battingNumber ? `#${battingNumber}` : "-"}</strong><span>${shortName}</span>`;
      row.append(cell);
    }

    elements.defenseGrid.append(row);
  });
}

function renderPlayerDefenseGrid() {
  const team = getActiveTeam();
  elements.playerDefenseGrid.innerHTML = "";

  const header = document.createElement("div");
  header.className = "defense-grid-row defense-grid-header-row player-defense-header-row";
  header.append(createDefenseGridCell("Player", true, true));
  for (let inning = 1; inning <= state.innings; inning += 1) {
    header.append(createDefenseGridCell(`In ${inning}`, true));
  }
  elements.playerDefenseGrid.append(header);

  team.players.forEach((player, index) => {
    const row = document.createElement("div");
    row.className = "defense-grid-row player-defense-row";
    row.append(createDefenseGridCell(`#${index + 1} ${getShortPlayerName(team.players, player.id)}`, true, true));

    for (let inning = 1; inning <= state.innings; inning += 1) {
      const assignments = team.innings[String(inning)];
      const duplicateGroups = getDuplicateAssignmentGroups(assignments);
      const position = POSITIONS.find((slot) => assignments[slot] === player.id);
      const cell = document.createElement("div");
      cell.className = `defense-grid-cell${position ? "" : " bench"}`;
      applyDuplicateGroupClass(cell, duplicateGroups[player.id]);
      cell.innerHTML = `<strong>${position || "BN"}</strong>`;
      row.append(cell);
    }

    elements.playerDefenseGrid.append(row);
  });
}

function createDefenseGridCell(text, isHeader = false, isRowHeader = false) {
  const cell = document.createElement("div");
  cell.className = `defense-grid-cell${isHeader ? " header" : ""}${isRowHeader ? " row-header" : ""}`;
  cell.textContent = text;
  return cell;
}

function renderPreferences() {
  const team = getActiveTeam();
  const rules = getTeamRules(team);
  const allowedOptions = PREFERENCE_OPTIONS.filter((position) => {
    if (position === "OF") {
      return rules.optimizePositions.some((spot) => OUTFIELD_POSITIONS.includes(spot));
    }
    return rules.optimizePositions.includes(position);
  });
  elements.preferencesList.innerHTML = "";

  team.players.forEach((player, index) => {
    const row = elements.preferenceRowTemplate.content.firstElementChild.cloneNode(true);
    row.querySelector(".preference-player").textContent = `${index + 1}. ${player.name || "Unnamed player"}`;
    const container = row.querySelector(".preference-selects");

    for (let slot = 0; slot < 4; slot += 1) {
      const select = document.createElement("select");
      const emptyOption = document.createElement("option");
      emptyOption.value = "";
      emptyOption.textContent = `Choice ${slot + 1}`;
      select.append(emptyOption);

      allowedOptions.forEach((position) => {
        const option = document.createElement("option");
        option.value = position;
        option.textContent = position;
        option.selected = player.preferences[slot] === position;
        select.append(option);
      });

      select.addEventListener("change", (event) => {
        updateActiveTeam((activeTeam) => {
          const existing = activeTeam.players[index].preferences.filter((_, preferenceIndex) => preferenceIndex !== slot);
          const nextValue = event.target.value;
          const nextPreferences = [...existing];
          nextPreferences.splice(slot, 0, nextValue);
          activeTeam.players[index].preferences = normalizePreferences(nextPreferences.filter(Boolean));
        });
      });

      container.append(select);
    }

    elements.preferencesList.append(row);
  });
}

function renderDefenseDiamond() {
  const team = getActiveTeam();
  const inningKey = elements.defenseVisualInning.value || "1";
  const assignments = team.innings[inningKey] || createEmptyAssignments();
  elements.defenseDiamond.innerHTML = "";

  const coords = {
    P: ["44%", "54%"],
    C: ["44%", "76%"],
    "1B": ["67%", "56%"],
    "2B": ["57%", "41%"],
    "3B": ["21%", "56%"],
    SS: ["31%", "41%"],
    LF: ["13%", "18%"],
    LCF: ["31%", "10%"],
    RCF: ["57%", "10%"],
    RF: ["75%", "18%"],
  };

  POSITIONS.forEach((position) => {
    const spot = document.createElement("article");
    spot.className = "defense-spot";
    const [left, top] = coords[position];
    spot.style.left = left;
    spot.style.top = top;
    const playerId = assignments[position];
    const battingNumber = getBattingNumber(team.players, playerId);
    const playerName = playerId ? getPlayerName(team.players, playerId) : "";
    spot.innerHTML = `<span class="spot-label">${position}</span><span class="spot-value">${battingNumber || "-"}</span><span class="spot-detail">${playerName}</span>`;
    elements.defenseDiamond.append(spot);
  });
}

function renderGameMode() {
  const team = getActiveTeam();
  const game = team.game;
  const currentBatter = team.players[game.currentBatterIndex];
  const nextBatter = team.players[(game.currentBatterIndex + 1) % team.players.length];

  elements.teamScore.textContent = String(game.teamScore);
  elements.opponentScore.textContent = String(game.opponentScore);
  elements.gameInning.textContent = String(game.inning);
  elements.gameOuts.textContent = String(game.outs);
  elements.currentBatterName.textContent = currentBatter?.name || "No batter selected";
  elements.nextBatterName.textContent = nextBatter ? `Next: ${nextBatter.name}` : "";

  renderBases(team);
  renderGameDiamond(team);
  renderGameTotals(game);
  renderGameLog(game);
}

function renderBases(team) {
  elements.basesGrid.innerHTML = "";

  BASES.forEach((base) => {
    const card = elements.baseCardTemplate.content.firstElementChild.cloneNode(true);
    const runnerId = team.game.bases[base];
    card.querySelector("h3").textContent = base === "first" ? "1st Base" : base === "second" ? "2nd Base" : "3rd Base";
    card.querySelector(".runner-status").textContent = runnerId ? "Occupied" : "Empty";

    const select = card.querySelector(".base-runner-select");
    populatePlayerOptions(select, team.players, runnerId, "Empty");
    select.addEventListener("change", (event) => {
      updateActiveTeam((activeTeam) => {
        activeTeam.game.bases[base] = event.target.value;
      });
    });

    card.querySelector('[data-base-action="advance"]').addEventListener("click", () => moveBaseRunner(base, "advance"));
    card.querySelector('[data-base-action="score"]').addEventListener("click", () => moveBaseRunner(base, "score"));
    card.querySelector('[data-base-action="out"]').addEventListener("click", () => moveBaseRunner(base, "out"));
    card.querySelector('[data-base-action="clear"]').addEventListener("click", () => moveBaseRunner(base, "clear"));

    elements.basesGrid.append(card);
  });
}

function renderGameDiamond(team) {
  const game = team.game;
  elements.gameDiamond.innerHTML = "";
  const spots = [
    { key: "third", label: "3rd", left: "23%", top: "31%", value: getBattingNumber(team.players, game.bases.third) || "-", detail: game.bases.third ? getPlayerName(team.players, game.bases.third) : "" },
    { key: "second", label: "2nd", left: "44%", top: "13%", value: getBattingNumber(team.players, game.bases.second) || "-", detail: game.bases.second ? getPlayerName(team.players, game.bases.second) : "" },
    { key: "first", label: "1st", left: "65%", top: "31%", value: getBattingNumber(team.players, game.bases.first) || "-", detail: game.bases.first ? getPlayerName(team.players, game.bases.first) : "" },
    { key: "home", label: "Batter", left: "44%", top: "72%", value: String((game.currentBatterIndex % team.players.length) + 1), detail: team.players[game.currentBatterIndex]?.name || "" },
  ];

  spots.forEach((spotData) => {
    const spot = document.createElement("article");
    spot.className = "game-spot";
    spot.style.left = spotData.left;
    spot.style.top = spotData.top;
    spot.innerHTML = `<span class="spot-label">${spotData.label}</span><span class="spot-value">${spotData.value}</span><span class="spot-detail">${spotData.detail || ""}</span>`;
    elements.gameDiamond.append(spot);
  });
}

function renderGameTotals(game) {
  elements.gameTotals.innerHTML = "";
  [
    ["Runs", game.totals.runs],
    ["Hits", game.totals.hits],
    ["Walks", game.totals.walks],
    ["Strikeouts", game.totals.strikeouts],
  ].forEach(([label, value]) => {
    const card = document.createElement("article");
    card.className = "mini-stat";
    card.innerHTML = `<span class="score-label">${label}</span><strong>${value}</strong>`;
    elements.gameTotals.append(card);
  });
}

function renderGameLog(game) {
  elements.gameLog.innerHTML = "";
  if (!game.log.length) {
    const empty = document.createElement("article");
    empty.className = "log-entry";
    empty.textContent = "No plays recorded yet.";
    elements.gameLog.append(empty);
    return;
  }

  game.log.forEach((entry) => {
    const item = document.createElement("article");
    item.className = "log-entry";
    item.innerHTML = `<strong>${entry.title}</strong><p>${entry.detail}</p>`;
    elements.gameLog.append(item);
  });
}

function renderScorebook() {
  const team = getActiveTeam();
  const table = document.createElement("div");
  table.className = "scorebook-table";

  const headerRow = document.createElement("div");
  headerRow.className = "scorebook-row";
  headerRow.append(createScorebookCell("Batter", true));
  for (let inning = 1; inning <= state.innings; inning += 1) {
    headerRow.append(createScorebookCell(String(inning), true));
  }
  table.append(headerRow);

  team.players.forEach((player, index) => {
    const row = document.createElement("div");
    row.className = "scorebook-row";
    row.append(createScorebookCell(`${index + 1}. ${player.name}`, true));
    for (let inning = 1; inning <= state.innings; inning += 1) {
      const cellEntries = team.game.scorebook?.[String(inning)]?.[player.id] || [];
      row.append(createScorebookCell(renderScorebookEntries(cellEntries)));
    }
    table.append(row);
  });

  elements.scorebookGrid.innerHTML = "";
  elements.scorebookGrid.append(table);
}

function createScorebookCell(content, isHeader = false) {
  const cell = document.createElement("div");
  cell.className = `scorebook-cell${isHeader ? " header" : ""}`;
  if (typeof content === "string") {
    cell.textContent = content;
  } else {
    cell.append(content);
  }
  return cell;
}

function renderScorebookEntries(entries) {
  const wrapper = document.createElement("div");
  wrapper.className = "scorebook-entry-stack";

  if (!entries.length) {
    return wrapper;
  }

  entries.forEach((entry) => {
    const item = document.createElement("div");
    item.className = "scorebook-entry";
    item.append(createScorebookDiamond(entry));

    const note = document.createElement("div");
    note.className = "scorebook-note";
    note.textContent = entry.result;
    item.append(note);

    wrapper.append(item);
  });

  return wrapper;
}

function createScorebookDiamond(entry) {
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", "0 0 40 40");
  svg.setAttribute("class", "scorebook-diamond");

  const outline = document.createElementNS(svgNS, "polygon");
  outline.setAttribute("points", "20,3 37,20 20,37 3,20");
  outline.setAttribute("fill", "white");
  outline.setAttribute("stroke", "#1c2f44");
  outline.setAttribute("stroke-width", "1.5");
  svg.append(outline);

  const home = [20, 37];
  const first = [37, 20];
  const second = [20, 3];
  const third = [3, 20];
  const segments = [];

  if (entry.basesReached.includes(1)) {
    segments.push([home, first]);
  }
  if (entry.basesReached.includes(2)) {
    segments.push([first, second]);
  }
  if (entry.basesReached.includes(3)) {
    segments.push([second, third]);
  }
  if (entry.scored) {
    segments.push([third, home]);
  }

  segments.forEach((segment) => {
    const line = document.createElementNS(svgNS, "line");
    line.setAttribute("x1", String(segment[0][0]));
    line.setAttribute("y1", String(segment[0][1]));
    line.setAttribute("x2", String(segment[1][0]));
    line.setAttribute("y2", String(segment[1][1]));
    line.setAttribute("stroke", "#111");
    line.setAttribute("stroke-width", "2.6");
    svg.append(line);
  });

  if (entry.out) {
    const outMark = document.createElementNS(svgNS, "line");
    outMark.setAttribute("x1", "8");
    outMark.setAttribute("y1", "32");
    outMark.setAttribute("x2", "32");
    outMark.setAttribute("y2", "8");
    outMark.setAttribute("stroke", "#a6452f");
    outMark.setAttribute("stroke-width", "2");
    svg.append(outMark);
  }

  const text = document.createElementNS(svgNS, "text");
  text.setAttribute("x", "20");
  text.setAttribute("y", "23");
  text.setAttribute("text-anchor", "middle");
  text.setAttribute("font-size", "9");
  text.setAttribute("font-weight", "700");
  text.setAttribute("fill", "#17324d");
  text.textContent = entry.result;
  svg.append(text);

  return svg;
}

function adjustGameNumber(key, delta, minimum = 0, maximum = Number.POSITIVE_INFINITY) {
  updateActiveTeam((team) => {
    const nextValue = Math.max(minimum, Math.min(maximum, team.game[key] + delta));
    team.game[key] = nextValue;
    if (key === "outs" && nextValue >= 3) {
      team.game.outs = 0;
      team.game.inning += 1;
      addGameLog(team.game, "Three outs recorded", `Moving to inning ${team.game.inning}`);
    }
  });
}

function shiftCurrentBatter(delta) {
  updateActiveTeam((team) => {
    if (delta < 0 && team.game.plateAppearanceHistory?.length) {
      restorePreviousPlateAppearance(team.game);
      return;
    }
    team.game.currentBatterIndex = clampBatterIndex(team.game.currentBatterIndex + delta, team.players.length);
  });
}

function recordPlateAppearance(result) {
  updateActiveTeam((team) => {
    const batter = team.players[team.game.currentBatterIndex];
    const inningKey = String(team.game.inning);
    if (!batter) {
      return;
    }

    pushPlateAppearanceSnapshot(team.game);

    if (result === "Hit") {
      team.game.totals.hits += 1;
      addScorebookMark(team.game, batter.id, inningKey, createScorebookEntry("1B", 1));
      placeBatterOnFirst(team.game, batter.id, inningKey);
      addGameLog(team.game, `${batter.name} hit`, describeBases(team, team.game));
    }

    if (result === "Walk") {
      team.game.totals.walks += 1;
      addScorebookMark(team.game, batter.id, inningKey, createScorebookEntry("BB", 1));
      forceWalk(team.game, batter.id, inningKey);
      addGameLog(team.game, `${batter.name} walk`, describeBases(team, team.game));
    }

    if (result === "Out") {
      addScorebookMark(team.game, batter.id, inningKey, createScorebookEntry("O", null, { out: true }));
      team.game.outs = Math.min(3, team.game.outs + 1);
      if (team.game.outs >= 3) {
        team.game.outs = 0;
        team.game.inning += 1;
        addGameLog(team.game, `${batter.name} out in play`, `Three outs. Inning ${team.game.inning}`);
      } else {
        addGameLog(team.game, `${batter.name} out in play`, `${team.game.outs} out(s)`);
      }
    }

    if (result === "Strikeout") {
      team.game.totals.strikeouts += 1;
      addScorebookMark(team.game, batter.id, inningKey, createScorebookEntry("K", null, { out: true }));
      team.game.outs = Math.min(3, team.game.outs + 1);
      if (team.game.outs >= 3) {
        team.game.outs = 0;
        team.game.inning += 1;
        addGameLog(team.game, `${batter.name} strikeout`, `Three outs. Inning ${team.game.inning}`);
      } else {
        addGameLog(team.game, `${batter.name} strikeout`, `${team.game.outs} out(s)`);
      }
    }

    team.game.currentBatterIndex = clampBatterIndex(team.game.currentBatterIndex + 1, team.players.length);
  });
}

function pushPlateAppearanceSnapshot(game) {
  game.plateAppearanceHistory ||= [];
  game.plateAppearanceHistory.push(JSON.parse(JSON.stringify({
    inning: game.inning,
    outs: game.outs,
    teamScore: game.teamScore,
    opponentScore: game.opponentScore,
    currentBatterIndex: game.currentBatterIndex,
    bases: game.bases,
    totals: game.totals,
    scorebook: game.scorebook,
    log: game.log,
  })));
  game.plateAppearanceHistory = game.plateAppearanceHistory.slice(-20);
}

function restorePreviousPlateAppearance(game) {
  const previous = game.plateAppearanceHistory?.pop();
  if (!previous) {
    return;
  }

  game.inning = previous.inning;
  game.outs = previous.outs;
  game.teamScore = previous.teamScore;
  game.opponentScore = previous.opponentScore;
  game.currentBatterIndex = previous.currentBatterIndex;
  game.bases = previous.bases;
  game.totals = previous.totals;
  game.scorebook = previous.scorebook;
  game.log = previous.log;
}

function addScorebookMark(game, playerId, inningKey, mark) {
  game.scorebook ||= {};
  game.scorebook[inningKey] ||= {};
  game.scorebook[inningKey][playerId] ||= [];
  game.scorebook[inningKey][playerId].push(mark);
  game.scorebook[inningKey][playerId] = game.scorebook[inningKey][playerId].slice(-4);
}

function createScorebookEntry(result, reachedBase = null, options = {}) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    result,
    basesReached: reachedBase ? [reachedBase] : [],
    scored: Boolean(options.scored),
    out: Boolean(options.out),
  };
}

function updateRunnerScorebookProgress(game, playerId, inningKey, reachedBase, scored = false) {
  const entry = getLatestScorebookEntry(game, playerId, inningKey);
  if (!entry) {
    return;
  }

  if (reachedBase && !entry.basesReached.includes(reachedBase)) {
    entry.basesReached.push(reachedBase);
    entry.basesReached.sort((a, b) => a - b);
  }

  if (scored) {
    entry.scored = true;
  }
}

function markRunnerScorebookOut(game, playerId, inningKey) {
  const entry = getLatestScorebookEntry(game, playerId, inningKey);
  if (entry) {
    entry.out = true;
  }
}

function getLatestScorebookEntry(game, playerId, inningKey) {
  const entries = game.scorebook?.[inningKey]?.[playerId];
  if (!Array.isArray(entries) || !entries.length) {
    return null;
  }
  return entries[entries.length - 1];
}

function placeBatterOnFirst(game, batterId, inningKey) {
  if (!game.bases.first) {
    game.bases.first = batterId;
    return;
  }

  if (!game.bases.second) {
    updateRunnerScorebookProgress(game, game.bases.first, inningKey, 2);
    game.bases.second = game.bases.first;
    game.bases.first = batterId;
    return;
  }

  if (!game.bases.third) {
    updateRunnerScorebookProgress(game, game.bases.second, inningKey, 3);
    updateRunnerScorebookProgress(game, game.bases.first, inningKey, 2);
    game.bases.third = game.bases.second;
    game.bases.second = game.bases.first;
    game.bases.first = batterId;
    return;
  }

  scoreRunnerFromBase(game, "third", inningKey);
  updateRunnerScorebookProgress(game, game.bases.second, inningKey, 3);
  updateRunnerScorebookProgress(game, game.bases.first, inningKey, 2);
  game.bases.third = game.bases.second;
  game.bases.second = game.bases.first;
  game.bases.first = batterId;
}

function forceWalk(game, batterId, inningKey) {
  if (game.bases.first && game.bases.second && game.bases.third) {
    scoreRunnerFromBase(game, "third", inningKey);
  }

  if (game.bases.first && game.bases.second) {
    updateRunnerScorebookProgress(game, game.bases.second, inningKey, 3);
    game.bases.third = game.bases.second;
  }

  if (game.bases.first) {
    updateRunnerScorebookProgress(game, game.bases.first, inningKey, 2);
    game.bases.second = game.bases.first;
  }

  game.bases.first = batterId;
}

function moveBaseRunner(base, action) {
  updateActiveTeam((team) => {
    const runnerId = team.game.bases[base];
    const runnerName = getPlayerName(team.players, runnerId);
    const inningKey = String(team.game.inning);
    if (!runnerId && action !== "clear") {
      return;
    }

    if (action === "advance") {
      if (base === "third") {
        scoreRunnerFromBase(team.game, "third", inningKey);
        addGameLog(team.game, `${runnerName} advanced`, "Scored from 3rd");
        return;
      }

      const nextBase = base === "first" ? "second" : "third";
      updateRunnerScorebookProgress(team.game, runnerId, inningKey, nextBase === "second" ? 2 : 3);
      team.game.bases[nextBase] = runnerId;
      team.game.bases[base] = "";
      addGameLog(team.game, `${runnerName} advanced`, `${formatBase(base)} to ${formatBase(nextBase)}`);
      return;
    }

    if (action === "score") {
      scoreRunnerFromBase(team.game, base, inningKey);
      addGameLog(team.game, `${runnerName} scored`);
      return;
    }

    if (action === "out") {
      team.game.bases[base] = "";
      markRunnerScorebookOut(team.game, runnerId, inningKey);
      team.game.outs = Math.min(3, team.game.outs + 1);
      if (team.game.outs >= 3) {
        team.game.outs = 0;
        team.game.inning += 1;
      }
      addGameLog(team.game, `${runnerName} out`, `${team.game.outs} out(s)`);
      return;
    }

    team.game.bases[base] = "";
    addGameLog(team.game, `${formatBase(base)} cleared`);
  });
}

function scoreRunnerFromBase(game, base, inningKey) {
  if (!game.bases[base]) {
    return;
  }

  updateRunnerScorebookProgress(game, game.bases[base], inningKey, base === "first" ? 1 : base === "second" ? 2 : 3, true);
  game.bases[base] = "";
  game.teamScore += 1;
  game.totals.runs += 1;
}

function populatePlayerOptions(select, players, selectedId, emptyLabel = "Open") {
  select.innerHTML = "";
  const emptyOption = document.createElement("option");
  emptyOption.value = "";
  emptyOption.textContent = emptyLabel;
  emptyOption.selected = selectedId === "";
  select.append(emptyOption);

  players.forEach((player) => {
    const option = document.createElement("option");
    option.value = player.id;
    option.textContent = formatPlayerOption(players, player.id);
    option.selected = player.id === selectedId;
    select.append(option);
  });
}

function formatPlayerOption(players, playerId) {
  const battingNumber = getBattingNumber(players, playerId);
  const playerName = getPlayerName(players, playerId);
  return battingNumber ? `${battingNumber}. ${playerName}` : playerName;
}

function getBenchPlayers(players, assignments) {
  const selected = new Set(Object.values(assignments).filter(Boolean));
  return players.filter((player) => !selected.has(player.id)).map((player) => player.id);
}

function getDuplicateAssignments(players, assignments) {
  const counts = getAssignmentCounts(assignments);

  return Object.entries(counts)
    .filter(([, count]) => count > 1)
    .map(([playerId]) => getPlayerName(players, playerId));
}

function getDuplicateAssignmentGroups(assignments) {
  const counts = getAssignmentCounts(assignments);
  const duplicateIds = Object.entries(counts)
    .filter(([, count]) => count > 1)
    .map(([playerId]) => playerId);

  return duplicateIds.reduce((groups, playerId, index) => {
    groups[playerId] = index;
    return groups;
  }, {});
}

function getAssignmentCounts(assignments) {
  return Object.values(assignments).reduce((map, playerId) => {
    if (!playerId) {
      return map;
    }
    map[playerId] = (map[playerId] || 0) + 1;
    return map;
  }, {});
}

function applyDuplicateGroupClass(element, groupIndex) {
  if (groupIndex === undefined || groupIndex === null) {
    return;
  }

  element.classList.add("duplicate-assignment", `duplicate-group-${(groupIndex % 4) + 1}`);
}

function getPlayerName(players, playerId) {
  if (!playerId) {
    return "Unknown";
  }
  return players.find((player) => player.id === playerId)?.name || "Unknown";
}

function getBattingNumber(players, playerId) {
  const index = players.findIndex((player) => player.id === playerId);
  return index >= 0 ? index + 1 : null;
}

function addGameLog(game, title, detail = "") {
  game.log.unshift({ title, detail });
  game.log = game.log.slice(0, 20);
}

function describeBases(team, game) {
  return BASES
    .map((base) => `${formatBase(base)}: ${game.bases[base] ? getPlayerName(team.players, game.bases[base]) : "Empty"}`)
    .join(" | ");
}

function formatBase(base) {
  return base === "first" ? "1st" : base === "second" ? "2nd" : "3rd";
}

render();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").then((registration) => {
      registration.update();
    }).catch((error) => {
      console.error("Service worker registration failed", error);
    });
  });
}
