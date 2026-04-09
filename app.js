const STORAGE_KEY = "softball-lineup-manager-v2";
const POSITIONS = ["P", "C", "1B", "2B", "3B", "SS", "LF", "LCF", "RCF", "RF"];
const OUTFIELD_POSITIONS = ["LF", "LCF", "RCF", "RF"];
const PREFERENCE_OPTIONS = ["P", "C", "1B", "2B", "3B", "SS", "OF"];
const BASES = ["first", "second", "third"];
const PLAYER_TINTS = [
  "#f8ddd6",
  "#fffb00",
  "#e10b0b",
  "#bdd0ef",
  "#dcccf0",
  "#ffbf17",
  "#bfe3da",
  "#d8d8d8",
  "#4ea8d2",
  "#e27be5",
  "#39d12d",
  "#f55f96",
];
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
    blockedPosition: "",
  }));

  const innings = {};
  for (let inning = 1; inning <= 7; inning += 1) {
    innings[String(inning)] = createEmptyAssignments();
  }

  const team = { id, name, players, innings, game: createDefaultGame() };
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
  const players = team.players;
  const rules = getTeamRules(team);
  const optimizedPositions = getOptimizedAssignmentOrder(rules.optimizePositions);
  const lockedPositions = rules.lockedPositions;
  const balanceSeed = balanceCycleState[team.id] || 0;
  const benchSlotsPerInning = Math.max(players.length - POSITIONS.length, 0);
  const benchCounts = Object.fromEntries(players.map((player) => [player.id, 0]));
  const fieldCounts = Object.fromEntries(players.map((player) => [player.id, 0]));
  const positionCounts = Object.fromEntries(players.map((player) => [player.id, Object.fromEntries(POSITIONS.map((position) => [position, 0]))]));
  const outfieldCounts = Object.fromEntries(players.map((player) => [player.id, 0]));
  const lastBenchedInning = Object.fromEntries(players.map((player) => [player.id, -999]));

  for (let inning = 1; inning <= inningCount; inning += 1) {
    const inningKey = String(inning);
    const existingAssignments = team.innings[inningKey] || createEmptyAssignments();
    const assignments = createEmptyAssignments();
    lockedPositions.forEach((position) => {
      assignments[position] = existingAssignments[position] || "";
    });
    const lockedIds = new Set(lockedPositions.map((position) => assignments[position]).filter(Boolean));
    const benchedPlayers = benchSlotsPerInning > 0
      ? [...players]
          .filter((player) => !lockedIds.has(player.id))
          .sort((a, b) => {
            const benchDelta = benchCounts[a.id] - benchCounts[b.id];
            if (benchDelta !== 0) {
              return benchDelta;
            }

            const fieldDelta = fieldCounts[b.id] - fieldCounts[a.id];
            if (fieldDelta !== 0) {
              return fieldDelta;
            }

            const lastBenchDelta = lastBenchedInning[a.id] - lastBenchedInning[b.id];
            if (lastBenchDelta !== 0) {
              return lastBenchDelta;
            }

            return getSeededRosterIndex(players, a.id, balanceSeed) - getSeededRosterIndex(players, b.id, balanceSeed);
          })
          .slice(0, benchSlotsPerInning)
      : [];

    benchedPlayers.forEach((player) => {
      benchCounts[player.id] += 1;
      lastBenchedInning[player.id] = inning;
    });

    const benchedIds = new Set(benchedPlayers.map((player) => player.id));
    lockedIds.forEach((playerId) => {
      fieldCounts[playerId] += 1;
    });
    const availablePlayers = players
      .filter((player) => !benchedIds.has(player.id) && !lockedIds.has(player.id))
      .sort((a, b) => {
        const fieldDelta = fieldCounts[a.id] - fieldCounts[b.id];
        if (fieldDelta !== 0) {
          return fieldDelta;
        }

        const benchDelta = benchCounts[b.id] - benchCounts[a.id];
        if (benchDelta !== 0) {
          return benchDelta;
        }

        const aIndex = getSeededRosterIndex(players, a.id, balanceSeed);
        const bIndex = getSeededRosterIndex(players, b.id, balanceSeed);
        return ((aIndex - inning + players.length) % players.length) - ((bIndex - inning + players.length) % players.length);
      });

    const remainingPlayers = [...availablePlayers];
    const previousAssignments = inning > 1 ? team.innings[String(inning - 1)] : null;
    optimizedPositions.forEach((position) => {
      const player = choosePlayerForPosition(remainingPlayers, players, position, positionCounts, previousAssignments, {
        balanceSeed,
        outfieldCounts,
      });
      assignments[position] = player?.id || "";
      if (player) {
        fieldCounts[player.id] += 1;
        positionCounts[player.id][position] += 1;
        if (OUTFIELD_POSITIONS.includes(position)) {
          outfieldCounts[player.id] += 1;
        }
        const chosenIndex = remainingPlayers.findIndex((candidate) => candidate.id === player.id);
        remainingPlayers.splice(chosenIndex, 1);
      }
    });

    team.innings[inningKey] = assignments;
  }
}

function rebalanceSingleInning(team, targetInning, inningCount) {
  const players = team.players;
  const rules = getTeamRules(team);
  const optimizedPositions = getOptimizedAssignmentOrder(rules.optimizePositions);
  const lockedPositions = rules.lockedPositions;
  const benchSlotsPerInning = Math.max(players.length - POSITIONS.length, 0);
  const benchCounts = Object.fromEntries(players.map((player) => [player.id, 0]));
  const fieldCounts = Object.fromEntries(players.map((player) => [player.id, 0]));
  const positionCounts = Object.fromEntries(players.map((player) => [player.id, Object.fromEntries(POSITIONS.map((position) => [position, 0]))]));
  const outfieldCounts = Object.fromEntries(players.map((player) => [player.id, 0]));
  const lastBenchedInning = Object.fromEntries(players.map((player) => [player.id, -999]));

  for (let inning = 1; inning <= inningCount; inning += 1) {
    if (inning === targetInning) {
      continue;
    }

    const assignments = team.innings[String(inning)] || createEmptyAssignments();
    Object.entries(assignments).forEach(([position, playerId]) => {
      if (!playerId) {
        return;
      }
      fieldCounts[playerId] += 1;
      positionCounts[playerId][position] += 1;
      if (OUTFIELD_POSITIONS.includes(position)) {
        outfieldCounts[playerId] += 1;
      }
    });

    const benchIds = getBenchPlayers(players, assignments);
    benchIds.forEach((playerId) => {
      benchCounts[playerId] += 1;
      lastBenchedInning[playerId] = Math.max(lastBenchedInning[playerId], inning);
    });
  }

  const inningKey = String(targetInning);
  const existingAssignments = team.innings[inningKey] || createEmptyAssignments();
  const currentBenchIds = new Set(getBenchPlayers(players, existingAssignments));
  const assignments = createEmptyAssignments();
  lockedPositions.forEach((position) => {
    assignments[position] = existingAssignments[position] || "";
  });

  const lockedIds = new Set(lockedPositions.map((position) => assignments[position]).filter(Boolean));
  const benchedPlayers = benchSlotsPerInning > 0
    ? [...players]
        .filter((player) => !lockedIds.has(player.id))
        .sort((a, b) => {
          const benchDelta = benchCounts[a.id] - benchCounts[b.id];
          if (benchDelta !== 0) {
            return benchDelta;
          }

          const refreshBenchDelta = Number(currentBenchIds.has(a.id)) - Number(currentBenchIds.has(b.id));
          if (refreshBenchDelta !== 0) {
            return refreshBenchDelta;
          }

          const fieldDelta = fieldCounts[b.id] - fieldCounts[a.id];
          if (fieldDelta !== 0) {
            return fieldDelta;
          }

          const lastBenchDelta = lastBenchedInning[a.id] - lastBenchedInning[b.id];
          if (lastBenchDelta !== 0) {
            return lastBenchDelta;
          }

          return players.findIndex((player) => player.id === a.id) - players.findIndex((player) => player.id === b.id);
        })
        .slice(0, benchSlotsPerInning)
    : [];

  benchedPlayers.forEach((player) => {
    benchCounts[player.id] += 1;
    lastBenchedInning[player.id] = targetInning;
  });

  const benchedIds = new Set(benchedPlayers.map((player) => player.id));
  lockedIds.forEach((playerId) => {
    fieldCounts[playerId] += 1;
  });

  const availablePlayers = players
    .filter((player) => !benchedIds.has(player.id) && !lockedIds.has(player.id))
    .sort((a, b) => {
      const fieldDelta = fieldCounts[a.id] - fieldCounts[b.id];
      if (fieldDelta !== 0) {
        return fieldDelta;
      }

      const benchDelta = benchCounts[b.id] - benchCounts[a.id];
      if (benchDelta !== 0) {
        return benchDelta;
      }

      return players.findIndex((player) => player.id === a.id) - players.findIndex((player) => player.id === b.id);
    });

  const remainingPlayers = [...availablePlayers];
  const previousAssignments = targetInning > 1 ? team.innings[String(targetInning - 1)] : null;
  optimizedPositions.forEach((position) => {
    const player = choosePlayerForPosition(
      remainingPlayers,
      players,
      position,
      positionCounts,
      previousAssignments,
      {
        refreshAssignments: existingAssignments,
        outfieldCounts,
      },
    );
    assignments[position] = player?.id || "";
    if (player) {
      fieldCounts[player.id] += 1;
      positionCounts[player.id][position] += 1;
      if (OUTFIELD_POSITIONS.includes(position)) {
        outfieldCounts[player.id] += 1;
      }
      const chosenIndex = remainingPlayers.findIndex((candidate) => candidate.id === player.id);
      remainingPlayers.splice(chosenIndex, 1);
    }
  });

  team.innings[inningKey] = assignments;
  return evaluateBenchRefreshImpact(team, targetInning, inningCount);
}

function getTeamRules(team) {
  return TEAM_RULES[team.id] || { optimizePositions: [...POSITIONS], lockedPositions: [] };
}

function getOptimizedAssignmentOrder(positions) {
  const priorityOrder = ["LF", "LCF", "RCF", "RF", "SS", "2B", "1B", "3B", "P", "C"];
  return [...positions].sort((a, b) => priorityOrder.indexOf(a) - priorityOrder.indexOf(b));
}

function choosePlayerForPosition(remainingPlayers, rosterOrder, position, positionCounts, previousAssignments, options = {}) {
  if (!remainingPlayers.length) {
    return null;
  }

  const allowedPool = remainingPlayers.filter((player) => !isBlockedForPosition(player, position));
  if (!allowedPool.length) {
    return null;
  }

  const hardPool = allowedPool.filter((player) => positionCounts[player.id][position] < 2);
  let legalPool = hardPool.length ? hardPool : allowedPool;

  if (OUTFIELD_POSITIONS.includes(position) && options.outfieldCounts) {
    const minimumOutfieldCount = Math.min(...Object.values(options.outfieldCounts));
    const balancedOutfieldPool = legalPool.filter((player) => options.outfieldCounts[player.id] === minimumOutfieldCount);
    if (balancedOutfieldPool.length) {
      legalPool = balancedOutfieldPool;
    }
  }

  const strongAvoidIds = getStrongAvoidIds(position, previousAssignments, options.refreshAssignments);
  const strongPool = legalPool.filter((player) => !strongAvoidIds.has(player.id));
  const preferredLegalPool = getPreferredPlayers(legalPool, position);
  const preferredStrongPool = getPreferredPlayers(strongPool, position);

  if (preferredStrongPool.length) {
    return sortPlayersForPosition(preferredStrongPool, rosterOrder, position, positionCounts, true, options.balanceSeed, options.outfieldCounts)[0];
  }

  if (strongPool.length) {
    return sortPlayersForPosition(strongPool, rosterOrder, position, positionCounts, false, options.balanceSeed, options.outfieldCounts)[0];
  }

  if (preferredLegalPool.length) {
    return sortPlayersForPosition(preferredLegalPool, rosterOrder, position, positionCounts, true, options.balanceSeed, options.outfieldCounts)[0];
  }

  return sortPlayersForPosition(legalPool, rosterOrder, position, positionCounts, false, options.balanceSeed, options.outfieldCounts)[0];
}

function sortPlayersForPosition(players, rosterOrder, position, positionCounts, usePreferenceRank, balanceSeed = 0, outfieldCounts = null) {
  return [...players].sort((a, b) => {
    if (OUTFIELD_POSITIONS.includes(position) && outfieldCounts) {
      const aNeedsOutfield = outfieldCounts[a.id] === 0 ? 0 : 1;
      const bNeedsOutfield = outfieldCounts[b.id] === 0 ? 0 : 1;
      if (aNeedsOutfield !== bNeedsOutfield) {
        return aNeedsOutfield - bNeedsOutfield;
      }

      const outfieldDelta = outfieldCounts[a.id] - outfieldCounts[b.id];
      if (outfieldDelta !== 0) {
        return outfieldDelta;
      }
    }

    if (usePreferenceRank) {
      const preferenceDelta = getPreferenceRank(a.preferences, position) - getPreferenceRank(b.preferences, position);
      if (preferenceDelta !== 0) {
        return preferenceDelta;
      }
    }

    const varietyDelta = positionCounts[a.id][position] - positionCounts[b.id][position];
    if (varietyDelta !== 0) {
      return varietyDelta;
    }
    return getSeededRosterIndex(rosterOrder, a.id, balanceSeed) - getSeededRosterIndex(rosterOrder, b.id, balanceSeed);
  });
}

function getSeededRosterIndex(players, playerId, balanceSeed = 0) {
  const index = players.findIndex((player) => player.id === playerId);
  if (index < 0) {
    return index;
  }
  return (index + balanceSeed) % players.length;
}

function getStrongAvoidIds(position, previousAssignments, refreshAssignments) {
  const avoidIds = new Set();

  if (previousAssignments?.[position]) {
    avoidIds.add(previousAssignments[position]);
  }

  if (OUTFIELD_POSITIONS.includes(position) && previousAssignments) {
    OUTFIELD_POSITIONS.forEach((outfieldPosition) => {
      if (previousAssignments[outfieldPosition]) {
        avoidIds.add(previousAssignments[outfieldPosition]);
      }
    });
  }

  if (refreshAssignments?.[position]) {
    avoidIds.add(refreshAssignments[position]);
  }

  return avoidIds;
}

function getPreferredPlayers(players, position) {
  return players.filter((player) => player.preferences.includes(position) || (player.preferences.includes("OF") && OUTFIELD_POSITIONS.includes(position)));
}

function isBlockedForPosition(player, position) {
  if (!player?.blockedPosition) {
    return false;
  }
  if (player.blockedPosition === "OF" && OUTFIELD_POSITIONS.includes(position)) {
    return true;
  }
  return player.blockedPosition === position;
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

function getOutfieldCounts(team, inningCount) {
  const outfieldCounts = Object.fromEntries(team.players.map((player) => [player.id, 0]));
  for (let inning = 1; inning <= inningCount; inning += 1) {
    const assignments = team.innings[String(inning)] || createEmptyAssignments();
    OUTFIELD_POSITIONS.forEach((position) => {
      const playerId = assignments[position];
      if (playerId) {
        outfieldCounts[playerId] += 1;
      }
    });
  }
  return outfieldCounts;
}

function getDefenseValidation(team, inningCount) {
  const issues = [];
  const benchCounts = getBenchCounts(team, inningCount);
  const benchValues = Object.values(benchCounts);
  const maxBench = Math.max(...benchValues, 0);
  const minBench = Math.min(...benchValues, 0);
  const outfieldCounts = getOutfieldCounts(team, inningCount);
  const outfieldValues = Object.values(outfieldCounts);
  const maxOutfield = Math.max(...outfieldValues, 0);
  const minOutfield = Math.min(...outfieldValues, 0);

  if (maxBench - minBench > 1) {
    issues.push({
      severity: "error",
      text: `Bench balance is ${minBench}-${maxBench}. No player should sit more than one extra inning than another.`,
    });
  }

  if (maxOutfield - minOutfield > 1) {
    issues.push({
      severity: "error",
      text: `Outfield balance is ${minOutfield}-${maxOutfield}. No player should have more than one extra outfield inning than another.`,
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
    const outfieldCount = Array.from({ length: inningCount }, (_, index) => {
      const assignments = team.innings[String(index + 1)] || createEmptyAssignments();
      return OUTFIELD_POSITIONS.some((position) => assignments[position] === player.id) ? 1 : 0;
    }).reduce((sum, value) => sum + value, 0);

    if (outfieldCount === 0) {
      issues.push({
        severity: "warn",
        text: `${player.name} does not have an outfield inning yet.`,
      });
    }

    for (let inning = 1; inning <= inningCount; inning += 1) {
      const assignments = team.innings[String(inning)] || createEmptyAssignments();
      const blockedPosition = POSITIONS.find((position) => assignments[position] === player.id && isBlockedForPosition(player, position));
      if (blockedPosition) {
        issues.push({
          severity: "error",
          text: `${player.name} is assigned to blocked position ${blockedPosition} in inning ${inning}.`,
        });
      }
    }

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

    team.players.forEach((player) => {
      const previousOutfield = OUTFIELD_POSITIONS.some((position) => previousAssignments[position] === player.id);
      const currentOutfield = OUTFIELD_POSITIONS.some((position) => currentAssignments[position] === player.id);
      if (previousOutfield && currentOutfield) {
        issues.push({
          severity: "warn",
          text: `${player.name} is in the outfield in both innings ${inning - 1} and ${inning}.`,
        });
      }
    });
  }

  return issues;
}

function getDefenseViolationMap(team, inningCount) {
  const map = {};
  const rules = getTeamRules(team);
  const benchCounts = getBenchCounts(team, inningCount);
  const benchValues = Object.values(benchCounts);
  const maxBench = Math.max(...benchValues, 0);
  const minBench = Math.min(...benchValues, 0);
  const outfieldCounts = getOutfieldCounts(team, inningCount);
  const outfieldValues = Object.values(outfieldCounts);
  const maxOutfield = Math.max(...outfieldValues, 0);
  const minOutfield = Math.min(...outfieldValues, 0);

  if (maxBench - minBench > 1) {
    for (let inning = 1; inning <= inningCount; inning += 1) {
      const assignments = team.innings[String(inning)] || createEmptyAssignments();
      const benchIds = getBenchPlayers(team.players, assignments);
      benchIds.forEach((playerId, index) => {
        if (benchCounts[playerId] === maxBench) {
          addDefenseViolation(map, String(inning), `BENCH_${index + 1}`, playerId);
        }
      });
    }
  }

  for (let inning = 1; inning <= inningCount; inning += 1) {
    const assignments = team.innings[String(inning)] || createEmptyAssignments();
    const counts = getAssignmentCounts(assignments);
    Object.entries(counts).forEach(([playerId, count]) => {
      if (count <= 1) {
        return;
      }
      POSITIONS.forEach((position) => {
        if (assignments[position] === playerId) {
          addDefenseViolation(map, String(inning), position, playerId);
        }
      });
    });

    team.players.forEach((player) => {
      POSITIONS.forEach((position) => {
        if (assignments[position] === player.id && isBlockedForPosition(player, position)) {
          addDefenseViolation(map, String(inning), position, player.id);
        }
      });
    });

    if (maxOutfield - minOutfield > 1) {
      OUTFIELD_POSITIONS.forEach((position) => {
        const playerId = assignments[position];
        if (playerId && outfieldCounts[playerId] === maxOutfield) {
          addDefenseViolation(map, String(inning), position, playerId);
        }
      });
    }
  }

  team.players.forEach((player) => {
    POSITIONS.forEach((position) => {
      if (rules.lockedPositions.includes(position)) {
        return;
      }
      const inningsUsed = [];
      for (let inning = 1; inning <= inningCount; inning += 1) {
        if (team.innings[String(inning)]?.[position] === player.id) {
          inningsUsed.push(String(inning));
        }
      }
      if (inningsUsed.length > 2) {
        inningsUsed.forEach((inningKey) => {
          addDefenseViolation(map, inningKey, position, player.id);
        });
      }
    });
  });

  return map;
}

function addDefenseViolation(map, inningKey, slotKey, playerId) {
  map[inningKey] ||= {};
  map[inningKey][slotKey] = { playerId, invalid: true };
}

function applyViolationClass(element, violationMap, inningKey, slotKey, playerId) {
  if (!playerId) {
    return;
  }
  if (violationMap?.[inningKey]?.[slotKey]?.playerId === playerId) {
    element.classList.add("rule-violation");
  }
}

function applyPlayerRowViolationClass(element, violationMap, inningKey, playerId) {
  if (!playerId || !violationMap?.[inningKey]) {
    return;
  }
  const hasViolation = Object.values(violationMap[inningKey]).some((violation) => violation.playerId === playerId);
  if (hasViolation) {
    element.classList.add("rule-violation");
  }
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

const balanceCycleState = {};
const defenseUndoState = {};

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
          blockedPosition: normalizeBlockedPosition(player.blockedPosition),
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
  return preferences.filter((position, index) => PREFERENCE_OPTIONS.includes(position) && preferences.indexOf(position) === index).slice(0, 3);
}

function normalizeBlockedPosition(position) {
  if (typeof position !== "string") {
    return "";
  }
  return PREFERENCE_OPTIONS.includes(position) ? position : "";
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
const lineupCardCollapseState = {};
const subsectionCollapseState = {
  lockedDefense: true,
};

const elements = {
  sectionNavButtons: Array.from(document.querySelectorAll(".section-nav-button")),
  sectionPanels: Array.from(document.querySelectorAll("[data-section-panel]")),
  subsectionToggles: Array.from(document.querySelectorAll(".subsection-toggle")),
  teamTabs: document.querySelector("#team-tabs"),
  teamName: document.querySelector("#team-name"),
  rosterList: document.querySelector("#roster-list"),
  lineupGrid: document.querySelector("#lineup-grid"),
  lockedDefensePanel: document.querySelector("#locked-defense-panel"),
  defenseGrid: document.querySelector("#defense-grid"),
  playerDefenseGrid: document.querySelector("#player-defense-grid"),
  defenseValidation: document.querySelector("#defense-validation"),
  preferencesList: document.querySelector("#preferences-list"),
  inningCount: document.querySelector("#inning-count"),
  balanceDefense: document.querySelector("#balance-defense"),
  balanceDefenseInningGrid: document.querySelector("#balance-defense-inning-grid"),
  balanceDefensePlayerGrid: document.querySelector("#balance-defense-player-grid"),
  undoInningGrid: document.querySelector("#undo-inning-grid"),
  undoPlayerGrid: document.querySelector("#undo-player-grid"),
  defenseVisualInning: document.querySelector("#defense-visual-inning"),
  defenseDiamond: document.querySelector("#defense-diamond"),
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

elements.teamName?.addEventListener("input", (event) => {
  updateActiveTeam((team) => {
    team.name = event.target.value;
  });
});

elements.inningCount?.addEventListener("change", (event) => {
  state.innings = clampInnings(event.target.value);
  saveAndRender();
});

elements.balanceDefense?.addEventListener("click", () => {
  runBalanceDefense();
});

elements.balanceDefenseInningGrid?.addEventListener("click", () => {
  runBalanceDefense();
});

elements.balanceDefensePlayerGrid?.addEventListener("click", () => {
  runBalanceDefense();
});

function runBalanceDefense() {
  updateActiveTeam((team) => {
    balanceCycleState[team.id] = (balanceCycleState[team.id] || 0) + 1;
    rebalanceDefense(team, state.innings);
  });
}

elements.undoInningGrid?.addEventListener("click", () => {
  updateActiveTeam((team) => {
    restoreDefenseUndo(team);
  });
});

elements.undoPlayerGrid?.addEventListener("click", () => {
  updateActiveTeam((team) => {
    restoreDefenseUndo(team);
  });
});

elements.defenseVisualInning?.addEventListener("change", () => {
  renderDefenseDiamond();
});

elements.sectionNavButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activeSection = button.dataset.sectionTarget;
    renderSectionVisibility();
  });
});

elements.subsectionToggles.forEach((button) => {
  button.addEventListener("click", () => {
    toggleSubsection(button);
  });
});

elements.addPlayer?.addEventListener("click", () => {
  updateActiveTeam((team) => {
    const nextNumber = team.players.length + 1;
    const playerId = `${team.id}-player-${Date.now()}`;
    team.players.push({
      id: playerId,
      name: `${team.name} Player ${nextNumber}`,
      preferences: [],
      blockedPosition: "",
    });
    team.game = normalizeGame(team.game, team.players);
  });
});

elements.resetGame?.addEventListener("click", () => {
  updateActiveTeam((team) => {
    team.game = createDefaultGame();
  });
});

elements.opponentMinus?.addEventListener("click", () => adjustGameNumber("opponentScore", -1, 0));
elements.opponentPlus?.addEventListener("click", () => adjustGameNumber("opponentScore", 1, 0));
elements.inningMinus?.addEventListener("click", () => adjustGameNumber("inning", -1, 1));
elements.inningPlus?.addEventListener("click", () => adjustGameNumber("inning", 1, 1));
elements.outsMinus?.addEventListener("click", () => adjustGameNumber("outs", -1, 0, 3));
elements.outsPlus?.addEventListener("click", () => adjustGameNumber("outs", 1, 0, 3));
elements.recordHit?.addEventListener("click", () => recordPlateAppearance("Hit"));
elements.recordWalk?.addEventListener("click", () => recordPlateAppearance("Walk"));
elements.recordOut?.addEventListener("click", () => recordPlateAppearance("Out"));
elements.recordStrikeout?.addEventListener("click", () => recordPlateAppearance("Strikeout"));
elements.prevBatter?.addEventListener("click", () => shiftCurrentBatter(-1));
elements.nextBatter?.addEventListener("click", () => shiftCurrentBatter(1));
elements.clearBases?.addEventListener("click", () => {
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
  safeRender();
}

function safeRender() {
  try {
    clearRuntimeError();
    render();
  } catch (error) {
    reportRuntimeError("Render failed", error);
  }
}

function reportRuntimeError(context, error) {
  console.error(context, error);
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  showRuntimeError(`${context}. ${message}`);
}

function showRuntimeError(message) {
  let overlay = document.querySelector("#runtime-error-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "runtime-error-overlay";
    overlay.className = "runtime-error-overlay";
    overlay.innerHTML = `
      <div class="runtime-error-card">
        <div class="runtime-error-header">
          <strong>App Error</strong>
          <button type="button" class="ghost-button runtime-error-close">Close</button>
        </div>
        <p class="runtime-error-text"></p>
      </div>
    `;
    overlay.querySelector(".runtime-error-close")?.addEventListener("click", () => {
      overlay.remove();
    });
    document.body.append(overlay);
  }

  const text = overlay.querySelector(".runtime-error-text");
  if (text) {
    text.textContent = message;
  }
}

function clearRuntimeError() {
  document.querySelector("#runtime-error-overlay")?.remove();
}

function render() {
  renderSectionVisibility();
  renderTeamTabs();
  renderRoster();
  renderLineups();
  renderLockedDefenseControls();
  renderPreferences();
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

function toggleSubsection(button) {
  const targetId = button.dataset.targetId;
  if (!targetId) {
    return;
  }
  const target = document.querySelector(`#${targetId}`);
  if (!target) {
    return;
  }

  const isCollapsed = target.classList.toggle("is-collapsed");
  button.textContent = isCollapsed ? "Show" : "Hide";
  button.setAttribute("aria-expanded", String(!isCollapsed));
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

  const activeTeam = getActiveTeam();
  elements.teamName.value = activeTeam.name;
  elements.inningCount.value = String(state.innings);
  if (Number(elements.defenseVisualInning.value) > state.innings || !elements.defenseVisualInning.value) {
    elements.defenseVisualInning.value = "1";
  }

  const canUndoDefense = Boolean(defenseUndoState[activeTeam.id]);
  if (elements.undoInningGrid) {
    elements.undoInningGrid.disabled = !canUndoDefense;
  }
  if (elements.undoPlayerGrid) {
    elements.undoPlayerGrid.disabled = !canUndoDefense;
  }
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
    const commitPlayerName = () => {
      const nextName = input.value;
      updateActiveTeam((activeTeam) => {
        activeTeam.players[index].name = nextName;
      });
    };
    input.addEventListener("change", commitPlayerName);
    input.addEventListener("blur", commitPlayerName);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        input.blur();
      }
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
    const collapseKey = `${team.id}-${inningKey}`;
    const assignments = team.innings[inningKey];
    const duplicateGroups = getDuplicateAssignmentGroups(assignments);
    const card = elements.inningCardTemplate.content.firstElementChild.cloneNode(true);
    card.querySelector("h3").textContent = `Inning ${inning}`;
    const collapseButton = card.querySelector(".inning-collapse-button");
    const cardContent = card.querySelector(".inning-card-content");
    const isCollapsed = lineupCardCollapseState[collapseKey] ?? (inning > 1);
    if (isCollapsed) {
      cardContent.classList.add("is-collapsed");
      collapseButton.textContent = "Show";
    } else {
      collapseButton.textContent = "Hide";
    }
    collapseButton.addEventListener("click", () => {
      const nextCollapsed = cardContent.classList.toggle("is-collapsed");
      lineupCardCollapseState[collapseKey] = nextCollapsed;
      collapseButton.textContent = nextCollapsed ? "Show" : "Hide";
    });
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
  header.innerHTML = `<div><p class="section-label">Hard Set Defense</p><h3>Pitcher And Catcher By Inning</h3></div><button class="ghost-button dynamic-subsection-toggle" type="button" aria-expanded="false">Show</button>`;
  elements.lockedDefensePanel.append(header);

  const content = document.createElement("div");
  content.id = "locked-defense-content";
  content.className = "subsection-content";
  const toggleButton = header.querySelector(".dynamic-subsection-toggle");
  const isCollapsed = subsectionCollapseState.lockedDefense ?? true;
  if (isCollapsed) {
    content.classList.add("is-collapsed");
    toggleButton.textContent = "Show";
  } else {
    toggleButton.textContent = "Hide";
  }
  toggleButton.setAttribute("aria-expanded", String(!isCollapsed));
  toggleButton.addEventListener("click", () => {
    const nextCollapsed = content.classList.toggle("is-collapsed");
    subsectionCollapseState.lockedDefense = nextCollapsed;
    toggleButton.textContent = nextCollapsed ? "Show" : "Hide";
    toggleButton.setAttribute("aria-expanded", String(!nextCollapsed));
  });

  const grid = document.createElement("div");
  grid.className = "locked-defense-grid";

  const headerRow = document.createElement("div");
  headerRow.className = "defense-grid-row defense-grid-header-row locked-defense-header-row";
  headerRow.append(createDefenseGridCell("Pos", true, true));
  for (let inning = 1; inning <= state.innings; inning += 1) {
    headerRow.append(createDefenseGridCell(`In ${inning}`, true));
  }
  grid.append(headerRow);

  rules.lockedPositions.forEach((position) => {
    const row = document.createElement("div");
    row.className = "defense-grid-row locked-defense-row";
    row.append(createDefenseGridCell(position, true, true));

    for (let inning = 1; inning <= state.innings; inning += 1) {
      const slot = document.createElement("div");
      slot.className = "defense-grid-cell locked-defense-cell";
      const select = document.createElement("select");
      select.className = "grid-player-select";
      populatePlayerOptions(select, team.players, team.innings[String(inning)][position]);
      select.addEventListener("change", (event) => {
        updateActiveTeam((activeTeam) => {
          activeTeam.innings[String(inning)][position] = event.target.value;
        });
      });
      slot.append(select);
      row.append(slot);
    }

    grid.append(row);
  });

  content.append(grid);
  elements.lockedDefensePanel.append(content);
}

function renderDefenseValidation() {
  const team = getActiveTeam();
  const issues = getDefenseValidation(team, state.innings);
  elements.defenseValidation.innerHTML = "";

  if (!issues.length) {
    const item = document.createElement("div");
    item.className = "validation-item validation-ok";
    item.textContent = "No defense warnings right now.";
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

function renderDefenseGrid() {
  const team = getActiveTeam();
  const violationMap = getDefenseViolationMap(team, state.innings);
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
      const cell = document.createElement("div");
      cell.className = `defense-grid-cell${rowKey.startsWith("BENCH_") ? " bench" : ""}`;
      applyPlayerTint(cell, team.players, playerId);
      applyDuplicateGroupClass(cell, duplicateGroups[playerId]);
      applyViolationClass(cell, violationMap, String(inning), rowKey, playerId);
      const select = document.createElement("select");
      select.className = "grid-player-select";
      populatePlayerOptions(
        select,
        team.players,
        playerId,
        rowKey.startsWith("BENCH_") ? "Bench" : "Open",
        formatGridPlayerOption,
      );
      if (rules.lockedPositions.includes(rowKey)) {
        select.disabled = true;
      } else {
        select.addEventListener("change", (event) => {
          if (!wouldDefenseGridSelectionChange(team, String(inning), rowKey, event.target.value)) {
            return;
          }
          updateActiveTeam((activeTeam) => {
            saveDefenseUndoSnapshot(activeTeam);
            applyDefenseGridSelection(activeTeam, String(inning), rowKey, event.target.value);
          });
        });
      }
      cell.append(select);
      row.append(cell);
    }

    elements.defenseGrid.append(row);
  });
}

function renderPlayerDefenseGrid() {
  const team = getActiveTeam();
  const violationMap = getDefenseViolationMap(team, state.innings);
  elements.playerDefenseGrid.innerHTML = "";
  const rules = getTeamRules(team);

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
      const benchIds = getBenchPlayers(team.players, assignments);
      const cell = document.createElement("div");
      cell.className = `defense-grid-cell${position ? "" : " bench"}`;
      applyPlayerTint(cell, team.players, player.id);
      applyDuplicateGroupClass(cell, duplicateGroups[player.id]);
      applyPlayerRowViolationClass(cell, violationMap, String(inning), player.id);
      const select = document.createElement("select");
      select.className = "grid-player-select";
      populatePlayerSlotOptions(select, rules, benchIds.length, position || getBenchSlotKey(benchIds, player.id));
      select.addEventListener("change", (event) => {
        if (!wouldPlayerGridSelectionChange(team, String(inning), player.id, event.target.value)) {
          return;
        }
        updateActiveTeam((activeTeam) => {
          saveDefenseUndoSnapshot(activeTeam);
          applyPlayerGridSelection(activeTeam, String(inning), player.id, event.target.value);
        });
      });
      cell.append(select);
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

    for (let slot = 0; slot < 3; slot += 1) {
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

    const blockedSelect = document.createElement("select");
    const blockedEmpty = document.createElement("option");
    blockedEmpty.value = "";
    blockedEmpty.textContent = "Blocked";
    blockedSelect.append(blockedEmpty);

    allowedOptions.forEach((position) => {
      const option = document.createElement("option");
      option.value = position;
      option.textContent = `No ${position}`;
      option.selected = player.blockedPosition === position;
      blockedSelect.append(option);
    });

    blockedSelect.addEventListener("change", (event) => {
      updateActiveTeam((activeTeam) => {
        activeTeam.players[index].blockedPosition = normalizeBlockedPosition(event.target.value);
      });
    });

    container.append(blockedSelect);

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

function applyPlayerTint(element, players, playerId) {
  if (!playerId) {
    return;
  }

  const playerIndex = players.findIndex((player) => player.id === playerId);
  if (playerIndex < 0) {
    return;
  }

  const tint = PLAYER_TINTS[playerIndex % PLAYER_TINTS.length];
  element.classList.add("player-tint-cell");
  element.style.setProperty("--player-tint", tint);
}

function applyDefenseGridSelection(team, inningKey, rowKey, chosenId) {
  const assignments = team.innings[inningKey];
  if (!assignments) {
    return;
  }

  if (rowKey.startsWith("BENCH_")) {
    const benchIndex = Number(rowKey.split("_")[1]) - 1;
    const currentBench = getBenchPlayers(team.players, assignments);
    const replacementId = currentBench[benchIndex] || "";
    POSITIONS.forEach((position) => {
      if (assignments[position] === chosenId) {
        assignments[position] = replacementId;
      }
    });
    return;
  }

  const currentId = assignments[rowKey] || "";
  if (!chosenId) {
    assignments[rowKey] = "";
    return;
  }

  const existingPosition = POSITIONS.find((position) => assignments[position] === chosenId);
  if (existingPosition && existingPosition !== rowKey) {
    assignments[existingPosition] = currentId;
  }

  assignments[rowKey] = chosenId;
}

function saveDefenseUndoSnapshot(team) {
  defenseUndoState[team.id] = {
    innings: JSON.parse(JSON.stringify(team.innings)),
  };
}

function restoreDefenseUndo(team) {
  const snapshot = defenseUndoState[team.id];
  if (!snapshot) {
    return;
  }
  team.innings = JSON.parse(JSON.stringify(snapshot.innings));
  delete defenseUndoState[team.id];
}

function wouldDefenseGridSelectionChange(team, inningKey, rowKey, chosenId) {
  const assignments = team.innings[inningKey];
  if (!assignments) {
    return false;
  }

  if (rowKey.startsWith("BENCH_")) {
    const benchIndex = Number(rowKey.split("_")[1]) - 1;
    const benchIds = getBenchPlayers(team.players, assignments);
    const currentBenchId = benchIds[benchIndex] || "";
    return currentBenchId !== chosenId;
  }

  return (assignments[rowKey] || "") !== chosenId;
}

function populatePlayerSlotOptions(select, rules, benchCount, selectedSlot) {
  select.innerHTML = "";

  const slotOptions = rules.optimizePositions.map((position) => ({ value: position, label: position }));
  for (let index = 0; index < benchCount; index += 1) {
    slotOptions.push({ value: `BENCH_${index + 1}`, label: `BN${index + 1}` });
  }

  slotOptions.forEach((slot) => {
    const option = document.createElement("option");
    option.value = slot.value;
    option.textContent = slot.label;
    option.selected = slot.value === selectedSlot;
    select.append(option);
  });
}

function getBenchSlotKey(benchIds, playerId) {
  const index = benchIds.findIndex((benchId) => benchId === playerId);
  return index >= 0 ? `BENCH_${index + 1}` : "BENCH_1";
}

function applyPlayerGridSelection(team, inningKey, playerId, chosenSlot) {
  const assignments = team.innings[inningKey];
  if (!assignments || !playerId || !chosenSlot) {
    return;
  }

  const currentPosition = POSITIONS.find((position) => assignments[position] === playerId);
  const benchIds = getBenchPlayers(team.players, assignments);

  if (chosenSlot.startsWith("BENCH_")) {
    const benchIndex = Number(chosenSlot.split("_")[1]) - 1;
    const targetBenchId = benchIds[benchIndex] || "";
    if (currentPosition) {
      assignments[currentPosition] = targetBenchId || "";
    }
    return;
  }

  const targetOccupantId = assignments[chosenSlot] || "";
  if (currentPosition) {
    assignments[currentPosition] = targetOccupantId || "";
  }
  assignments[chosenSlot] = playerId;
}

function wouldPlayerGridSelectionChange(team, inningKey, playerId, chosenSlot) {
  const assignments = team.innings[inningKey];
  if (!assignments || !playerId || !chosenSlot) {
    return false;
  }

  const currentPosition = POSITIONS.find((position) => assignments[position] === playerId);
  const benchIds = getBenchPlayers(team.players, assignments);
  const currentSlot = currentPosition || getBenchSlotKey(benchIds, playerId);
  return currentSlot !== chosenSlot;
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

function populatePlayerOptions(select, players, selectedId, emptyLabel = "Open", formatter = formatPlayerOption) {
  select.innerHTML = "";
  const emptyOption = document.createElement("option");
  emptyOption.value = "";
  emptyOption.textContent = emptyLabel;
  emptyOption.selected = selectedId === "";
  select.append(emptyOption);

  players.forEach((player) => {
    const option = document.createElement("option");
    option.value = player.id;
    option.textContent = formatter(players, player.id);
    option.selected = player.id === selectedId;
    select.append(option);
  });
}

function formatPlayerOption(players, playerId) {
  const battingNumber = getBattingNumber(players, playerId);
  const playerName = getPlayerName(players, playerId);
  return battingNumber ? `${battingNumber}. ${playerName}` : playerName;
}

function formatGridPlayerOption(players, playerId) {
  const playerName = getCompactPlayerName(players, playerId);
  return playerName;
}

function getCompactPlayerName(players, playerId) {
  const fullName = getPlayerName(players, playerId);
  if (!fullName || fullName === "Unknown") {
    return "Open";
  }
  const parts = fullName.trim().split(/\s+/);
  const firstName = parts[0] || "";
  const lastInitial = parts.length > 1 ? ` ${parts[parts.length - 1][0] || ""}` : "";
  return `${firstName}${lastInitial}`.trim();
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

safeRender();

window.addEventListener("error", (event) => {
  reportRuntimeError("JavaScript error", event.error || event.message);
});

window.addEventListener("unhandledrejection", (event) => {
  reportRuntimeError("Unhandled promise rejection", event.reason);
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").then((registration) => {
      registration.update();
    }).catch((error) => {
      console.error("Service worker registration failed", error);
    });
  });
}
