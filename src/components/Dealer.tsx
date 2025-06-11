// src/components/Dealer.tsx

import { db } from '../firebase';
import { ref, get, update } from 'firebase/database';

function getRandomCard(deck: number[]): number {
  const idx = Math.floor(Math.random() * deck.length);
  return deck.splice(idx, 1)[0];
}

function createDeck(): number[] {
  const deck: number[] = [];
  for (let i = 0; i < 4; i++) {
    for (let val = 1; val <= 10; val++) {
      deck.push(val);
    }
  }
  return deck;
}

function getRandomDraw(): number {
  return Math.floor(Math.random() * 5) + 1;
}

function evaluateHand(cards: number[]): [string, number, number[]] {
  const counts: Record<number, number> = {};
  cards.forEach((val) => counts[val] = (counts[val] || 0) + 1);
  const values = Object.values(counts);
  const sortedValues = Object.keys(counts).map(Number).sort((a, b) => b - a);

  // Check for straight
  const isStraight = (() => {
    const sorted = [...new Set(cards)].sort((a, b) => a - b);
    if (sorted.length < 5) return false;
    for (let i = 0; i <= sorted.length - 5; i++) {
      if (sorted[i + 4] - sorted[i] === 4) return true;
    }
    return false;
  })();

  if (values.includes(4)) return ['four of a kind', 7, sortedValues];
  if (values.includes(3) && values.includes(2)) return ['full house', 6, sortedValues];
  if (isStraight) return ['straight', 5, sortedValues];
  if (values.includes(3)) return ['three of a kind', 4, sortedValues];
  if (values.filter(v => v === 2).length === 2) return ['two pair', 3, sortedValues];
  if (values.includes(2)) return ['pair', 2, sortedValues];
  return ['high card', 1, sortedValues];
}

type RoundResult = {
  roundNumber: number;
  winnerId: string;
  winningHand: {
    playerId: string;
    handType: string;
    score: number;
    cards: number[];
  } | null;  // Allow null for split pots
  pot: number;
  snipeResults: Array<{
    sniperId: string;
    predicted: string;
    success: boolean;
  }>;
  playerChips: Record<string, number>;
  chipChanges: Record<string, number>;
};

type DealerState = {
  phase: 'bet1' | 'bet2' | 'snipe';
  currentTurn: number;
  turnOrder: string[];
  communityCards: number[];
  pot: number;
  currentBet: number;
  draws: Record<string, number>;
  roundNumber: number;
  roundResults: RoundResult[];
  actionHistory?: Array<{
    playerId: string;
    action: string;
    amount?: number;
    pot: number;
    chips: Record<string, number>;
    phase: string;
  }>;
  acted: Record<string, boolean>;
};

function logAction(dealer: any, players: any, entry: { playerId?: string, action: string, amount?: number, phase?: string }) {
  if (!dealer.actionHistory) dealer.actionHistory = [];
  dealer.actionHistory.push({
    playerId: entry.playerId || '',
    action: entry.action,
    amount: typeof entry.amount === 'number' ? entry.amount : null,
    pot: dealer.pot,
    chips: Object.fromEntries(Object.entries(players).map(([id, p]) => [id, (p as any).chips])),
    phase: entry.phase || dealer.phase,
  });
}

export async function startGame(gameId: string) {
  const gameRef = ref(db, `games/${gameId}`);
  const snap = await get(gameRef);
  const data = snap.val();
  const players = data?.players || {};
  const dealer = data?.dealer || { roundNumber: 0, roundResults: [] };

  // Initial random draw phase
  const draws: Record<string, number> = {};
  const updates: any = {};
  
  for (const id in players) {
    draws[id] = getRandomDraw();
    updates[`players/${id}/draw`] = draws[id];
    updates[`players/${id}/chips`] = players[id].chips || 60; // Keep existing chips or start with 60
    updates[`players/${id}/folded`] = false;
    updates[`players/${id}/bet`] = 0;
    updates[`players/${id}/snipedPrediction`] = null;
    updates[`players/${id}/hasActed`] = false;
    updates[`players/${id}/lastAction`] = null;
    updates[`players/${id}/lastActionAmount`] = null;
  }

  // Sort players by draw value (highest first)
  const turnOrder = Object.keys(players).sort((a, b) => draws[b] - draws[a]);

  const deck = createDeck();
  // Deal two community cards immediately
  const communityCards = [getRandomCard(deck), getRandomCard(deck)];
  const newState: DealerState = {
    communityCards,
    currentBet: 0,
    pot: 0,
    phase: 'bet1',
    currentTurn: 0,
    turnOrder,
    draws,
    roundNumber: (dealer.roundNumber || 0) + 1,
    roundResults: dealer.roundResults || [],
    actionHistory: [],
    acted: {},
  };

  // Deal initial hands
  for (const id in players) {
    updates[`players/${id}/hand`] = [getRandomCard(deck), getRandomCard(deck)];
  }

  updates['dealer'] = newState;
  await update(gameRef, updates);
}

// Helper: Get next active player index
function getNextActivePlayerIdx(turnOrder: string[], players: any, startIdx: number): number {
  let idx = (startIdx + 1) % turnOrder.length;
  let safety = 0;
  while (players[turnOrder[idx]].folded && safety++ < turnOrder.length) {
    idx = (idx + 1) % turnOrder.length;
  }
  return idx;
}

export async function submitBet(gameId: string, playerId: string, action: 'fold' | 'check' | 'call' | 'raise', amount?: number) {
  const gameRef = ref(db, `games/${gameId}`);
  const snap = await get(gameRef);
  const game = snap.val();
  const dealer = game.dealer;
  const players = game.players;

  // Validation
  if (!dealer || !players[playerId]) return;
  if (dealer.turnOrder[dealer.currentTurn] !== playerId) return;
  if (players[playerId].folded) return;
  if (dealer.phase !== 'bet1' && dealer.phase !== 'bet2') return;

  const player = players[playerId];
  const currentBet = dealer.currentBet || 0;
  const playerBet = player.bet || 0;
  const toCall = currentBet - playerBet;

  // Validate action
  if (action === 'check' && toCall > 0) return; // Can't check when there's a bet to call
  if (action === 'call' && player.chips < toCall) return; // Can't call with insufficient chips
  if (action === 'raise') {
    if (typeof amount !== 'number' || amount <= currentBet) return; // Must raise to strictly greater than current bet
    const raiseAmount = amount - playerBet;
    if (raiseAmount <= toCall) return; // Must raise by at least 1 more than toCall
    if (player.chips < raiseAmount) return;
  }

  // Execute action
  if (action === 'fold') {
    player.folded = true;
    player.lastAction = 'fold';
    player.lastActionAmount = 0;
  } else if (action === 'check') {
    player.lastAction = 'check';
    player.lastActionAmount = 0;
  } else if (action === 'call') {
    const callAmount = Math.min(toCall, player.chips);
    player.chips -= callAmount;
    player.bet = playerBet + callAmount;
    dealer.pot += callAmount;
    player.lastAction = 'call';
    player.lastActionAmount = callAmount;
  } else if (action === 'raise') {
    const raiseAmount = amount! - playerBet;
    player.chips -= raiseAmount;
    player.bet = amount!;
    dealer.pot += raiseAmount;
    dealer.currentBet = amount!;
    player.lastAction = 'raise';
    player.lastActionAmount = raiseAmount;
    // When someone raises, reset acted status for all players except the raiser
    dealer.acted = { [playerId]: true };
  }

  // Mark player as acted
  if (!dealer.acted) dealer.acted = {};
  dealer.acted[playerId] = true;

  // Debug logging
  console.log(`[DEBUG] Action: ${action}, Player: ${playerId}, Chips: ${player.chips}, Bet: ${player.bet}, Pot: ${dealer.pot}, CurrentBet: ${dealer.currentBet}`);
  for (const id of dealer.turnOrder) {
    console.log(`[DEBUG] Player ${id}: chips=${players[id].chips}, bet=${players[id].bet}, folded=${players[id].folded}`);
  }

  // Check if betting round is complete
  const activePlayers = dealer.turnOrder.filter((id: string) => !players[id]?.folded);
  const allActed = activePlayers.every((id: string) => dealer.acted[id] && players[id].bet === dealer.currentBet);
  if (allActed || activePlayers.length === 1) {
    // Only advance if all active players have matched the bet or folded
    for (const id of dealer.turnOrder) {
      if (!players[id].folded) {
        players[id].bet = 0;
      }
    }
    dealer.currentBet = 0;
    dealer.acted = {};
    await advancePhase(gameId);
    return;
  }

  // Advance turn to next active player who has not folded and has not yet acted
  let nextIdx = dealer.currentTurn;
  let safety = 0;
  do {
    nextIdx = (nextIdx + 1) % dealer.turnOrder.length;
    safety++;
    if (safety > dealer.turnOrder.length * 2) break; // Prevent infinite loop
  } while (players[dealer.turnOrder[nextIdx]].folded);
  dealer.currentTurn = nextIdx;

  await update(gameRef, { dealer, players });
}

export async function foldPlayer(gameId: string, playerId: string) {
  const gameRef = ref(db, `games/${gameId}`);
  const snap = await get(gameRef);
  const game = snap.val();
  const dealer = game.dealer;
  const players = game.players;
  if (dealer.turnOrder[dealer.currentTurn] !== playerId) return;
  players[playerId].folded = true;
  players[playerId].hasActed = true;
  // Advance turn
  const totalPlayers = dealer.turnOrder.length;
  let nextTurn = (dealer.currentTurn + 1) % totalPlayers;
  let safety = 0;
  while ((players[dealer.turnOrder[nextTurn]]?.folded || players[dealer.turnOrder[nextTurn]]?.hasActed) && safety++ < totalPlayers) {
    nextTurn = (nextTurn + 1) % totalPlayers;
  }
  dealer.currentTurn = nextTurn;

  logAction(dealer, players, {
    playerId,
    action: 'fold',
  });

  await update(gameRef, { dealer, players });
}

export async function submitSnipe(gameId: string, playerId: string, prediction: string) {
  const gameRef = ref(db, `games/${gameId}`);
  const snap = await get(gameRef);
  const game = snap.val();
  const dealer = game.dealer;
  const players = game.players;
  
  // Validation
  if (!dealer || !players[playerId]) return;
  if (dealer.phase !== 'snipe') return;
  if (dealer.turnOrder[dealer.currentTurn] !== playerId) return;
  if (players[playerId].folded) return;
  if (players[playerId].snipedPrediction) return; // Already sniped
  
  // Validate prediction
  const validPredictions = ['high card', 'pair', 'two pair', 'three of a kind', 'straight', 'full house', 'four of a kind'];
  if (!validPredictions.includes(prediction)) return;

  // Submit snipe
  players[playerId].snipedPrediction = prediction;
  players[playerId].lastAction = 'snipe';
  players[playerId].lastActionAmount = 0;

  // Log the action
  logAction(dealer, players, {
    playerId,
    action: 'snipe',
    amount: 0,
    phase: dealer.phase,
  });

  // Check if all active players have sniped
  const activePlayers = dealer.turnOrder.filter((id: string) => !players[id].folded);
  const allSniped = activePlayers.every((id: string) => players[id].snipedPrediction);
  
  if (allSniped) {
    // All active players have sniped, resolve the round
    await resolveBets(gameId);
    return;
  }

  // Advance turn to next active player who hasn't sniped
  let nextIdx = (dealer.currentTurn + 1) % dealer.turnOrder.length;
  let safety = 0;
  while ((players[dealer.turnOrder[nextIdx]]?.folded || 
          players[dealer.turnOrder[nextIdx]]?.snipedPrediction) && 
         safety++ < dealer.turnOrder.length) {
    nextIdx = (nextIdx + 1) % dealer.turnOrder.length;
  }
  dealer.currentTurn = nextIdx;

  await update(gameRef, { dealer, players });
}

export function checkBetsComplete(players: any, currentBet: number): boolean {
  return Object.values(players).every((p: any) => {
    return p.folded || (typeof p.bet === 'number' && p.bet === currentBet);
  });
}

export async function resolveBets(gameId: string) {
  const gameRef = ref(db, `games/${gameId}`);
  const snap = await get(gameRef);
  const game = snap.val();

  const dealer = game.dealer;
  const players = game.players;

  // Reveal all community cards if needed
  if (dealer.communityCards.length < 4) {
    const deck = createDeck();
    const used = Object.values(players).flatMap((p: any) => p.hand || []);
    used.push(...(dealer.communityCards || []));
    const remaining = deck.filter(c => !used.includes(c));
    while (dealer.communityCards.length < 4) {
      dealer.communityCards.push(getRandomCard(remaining));
    }
  }

  const predictions: Record<string, string> = {};
  const hands: Record<string, [string, number, number[]]> = {};
  let winnerId = '';
  let maxScore = 0;

  // Evaluate all hands
  for (const id in players) {
    if (players[id].folded) continue;
    const p = players[id];
    const fullHand = [...(p.hand || []), ...(dealer.communityCards || [])];
    const [type, score, sortedValues] = evaluateHand(fullHand);
    hands[id] = [type, score, sortedValues];
    predictions[id] = p.snipedPrediction;
  }

  // Find sniped players
  const sniped: Set<string> = new Set();
  for (const sniper in predictions) {
    const predicted = predictions[sniper];
    for (const id in hands) {
      if (hands[id][0] === predicted) {
        sniped.add(id);
      }
    }
  }

  // Find eligible players (not folded, not sniped)
  const eligible = Object.keys(hands).filter((id) => !sniped.has(id) && !players[id]?.folded);

  // Store chip counts before distribution
  const playerChips: Record<string, number> = {};
  Object.keys(players).forEach(id => {
    playerChips[id] = players[id].chips;
  });

  // Determine winner and distribute pot
  if (eligible.length === 0) {
    // If no eligible players, split pot among all players
    const each = Math.floor(dealer.pot / Object.keys(players).length);
    for (const id in players) {
      players[id].chips += each;
    }
    winnerId = 'split';
  } else {
    // Find highest scoring hand among eligible players
    for (const id of eligible) {
      const score = hands[id][1];
      if (score > maxScore) {
        maxScore = score;
        winnerId = id;
      }
    }

    // Winner collects pot
    players[winnerId].chips += dealer.pot;
  }

  // Calculate chip changes for the round log
  const chipChanges: Record<string, number> = {};
  Object.keys(players).forEach(id => {
    chipChanges[id] = players[id].chips - playerChips[id];
  });

  // Create round result
  const roundResult: RoundResult = {
    roundNumber: dealer.roundNumber,
    winnerId,
    winningHand: winnerId === 'split' ? null : {
      playerId: winnerId,
      handType: hands[winnerId]?.[0],
      score: hands[winnerId]?.[1],
      cards: winnerId === 'split' ? [] : [...(players[winnerId]?.hand || []), ...(dealer.communityCards || [])]
    },
    pot: dealer.pot,
    snipeResults: Object.entries(predictions).map(([sniperId, predicted]) => ({
      sniperId,
      predicted,
      success: Object.values(hands).some(([type]) => type === predicted)
    })),
    playerChips: playerChips,
    chipChanges: chipChanges
  };
//  Force redeploy: test comment
  // Add to round history
  dealer.roundResults = [...(dealer.roundResults || []), roundResult];

  // Reset game state for next round
  dealer.pot = 0;
  dealer.currentBet = 0;
  dealer.phase = 'bet1';
  dealer.currentTurn = 0;
  dealer.acted = {};

  // Reset player states
  for (const id in players) {
    players[id].bet = 0;
    players[id].folded = false;
    players[id].hasActed = false;
    players[id].snipedPrediction = null;
    players[id].lastAction = null;
    players[id].lastActionAmount = null;
  }

  // Start new round
  await startNewRound(gameId);
}

export async function startNewRound(gameId: string) {
  const gameRef = ref(db, `games/${gameId}`);
  const snap = await get(gameRef);
  const game = snap.val();
  const dealer = game.dealer;
  const players = game.players;

  // Reset game state for next round
  dealer.pot = 0;
  dealer.currentBet = 0;
  dealer.phase = 'bet1';
  dealer.currentTurn = 0;
  dealer.acted = {};

  // Reset player states
  for (const id in players) {
    players[id].bet = 0;
    players[id].folded = false;
    players[id].hasActed = false;
    players[id].snipedPrediction = null;
    players[id].lastAction = null;
    players[id].lastActionAmount = null;
  }

  // Start new round
  await startGame(gameId);
}

export async function advancePhase(gameId: string) {
  const gameRef = ref(db, `games/${gameId}`);
  const snap = await get(gameRef);
  const game = snap.val();
  const dealer = game.dealer;
  const players = game.players;

  if (!dealer || !players) return;

  // Reset player states for new phase
  Object.keys(players).forEach((id: string) => {
    players[id].hasActed = false;
    players[id].lastAction = null;
    players[id].lastActionAmount = null;
  });
  dealer.currentBet = 0;
  dealer.currentTurn = 0;
  dealer.acted = {};

  // Phase progression logic
  switch (dealer.phase) {
    case 'bet1':
      // Deal two more community cards before starting bet2
      const deck = createDeck();
      const used = Object.values(players).flatMap((p: any) => p.hand || []);
      used.push(...(dealer.communityCards || []));
      const remaining = deck.filter(c => !used.includes(c));
      // Add exactly two more cards
      dealer.communityCards.push(getRandomCard(remaining), getRandomCard(remaining));
      dealer.phase = 'bet2';
      break;
    case 'bet2':
      dealer.phase = 'snipe';
      break;
    case 'snipe':
      await resolveBets(gameId);
      return;
    default:
      dealer.phase = 'bet1';
  }

  logAction(dealer, players, {
    action: 'phase',
    phase: dealer.phase,
  });

  await update(gameRef, { dealer, players });
}
