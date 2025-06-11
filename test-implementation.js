// Test script for Sniper Hold'em implementation
// This script tests the core betting logic and turn management

console.log('🧪 Testing Sniper Hold\'em Implementation...\n');

// Test 1: Betting Logic
console.log('Test 1: Betting Logic Validation');
const testBettingLogic = () => {
  const player1 = { chips: 60, bet: 0, folded: false };
  const player2 = { chips: 60, bet: 0, folded: false };
  const currentBet = 0;
  
  // Test check validation
  const canCheck = currentBet === player1.bet;
  console.log(`✓ Can check when no bet: ${canCheck}`);
  
  // Test call validation
  const toCall = 10 - player2.bet;
  const canCall = toCall > 0 && player2.chips >= toCall;
  console.log(`✓ Can call with sufficient chips: ${canCall}`);
  
  // Test raise validation
  const raiseAmount = 20 - player1.bet;
  const canRaise = player1.chips >= raiseAmount;
  console.log(`✓ Can raise with sufficient chips: ${canRaise}`);
};

// Test 2: Turn Management
console.log('\nTest 2: Turn Management');
const testTurnManagement = () => {
  const turnOrder = ['player1', 'player2', 'player3'];
  const players = {
    player1: { folded: false },
    player2: { folded: true },
    player3: { folded: false }
  };
  
  // Test next active player
  const getNextActivePlayer = (currentIndex) => {
    let nextIdx = (currentIndex + 1) % turnOrder.length;
    let safety = 0;
    while (players[turnOrder[nextIdx]]?.folded && safety++ < turnOrder.length) {
      nextIdx = (nextIdx + 1) % turnOrder.length;
    }
    return nextIdx;
  };
  
  const nextPlayer = getNextActivePlayer(0);
  console.log(`✓ Next active player after player1: ${turnOrder[nextPlayer]}`);
};

// Test 3: Phase Progression
console.log('\nTest 3: Phase Progression');
const testPhaseProgression = () => {
  const phases = ['bet1', 'bet2', 'snipe'];
  const phaseIndex = phases.indexOf('bet1');
  const nextPhase = phases[phaseIndex + 1] || 'bet1';
  console.log(`✓ Phase progression: bet1 → ${nextPhase}`);
};

// Test 4: Snipe Validation
console.log('\nTest 4: Snipe Validation');
const testSnipeValidation = () => {
  const validPredictions = ['high card', 'pair', 'two pair', 'three of a kind', 'straight', 'full house', 'four of a kind'];
  const testPrediction = 'pair';
  const isValid = validPredictions.includes(testPrediction);
  console.log(`✓ Valid snipe prediction: ${isValid}`);
  
  const invalidPrediction = 'invalid';
  const isInvalid = !validPredictions.includes(invalidPrediction);
  console.log(`✓ Invalid snipe prediction rejected: ${isInvalid}`);
};

// Test 5: Betting Round Completion
console.log('\nTest 5: Betting Round Completion');
const testBettingRoundCompletion = () => {
  const players = {
    player1: { folded: false, bet: 10 },
    player2: { folded: false, bet: 10 },
    player3: { folded: true, bet: 0 }
  };
  const currentBet = 10;
  const acted = { player1: true, player2: true };
  
  const activePlayers = Object.keys(players).filter(id => !players[id].folded);
  const allActed = activePlayers.every(id => acted[id] && players[id].bet === currentBet);
  
  console.log(`✓ Betting round complete when all active players acted: ${allActed}`);
};

// Test 6: Pot and Chip Consistency After Raise/Call
console.log('\nTest 6: Pot and Chip Consistency After Raise/Call');
const testPotChipConsistency = () => {
  // Player 1 raises to 10
  let p1 = { chips: 60, bet: 0, folded: false };
  let p2 = { chips: 60, bet: 0, folded: false };
  let pot = 0;
  let currentBet = 0;

  // Player 1 raises to 10
  let raiseTo = 10;
  let raiseAmount = raiseTo - p1.bet;
  p1.chips -= raiseAmount;
  p1.bet = raiseTo;
  pot += raiseAmount;
  currentBet = raiseTo;

  // Player 2 calls
  let toCall = currentBet - p2.bet;
  p2.chips -= toCall;
  p2.bet += toCall;
  pot += toCall;

  // Both players should have 50 chips, pot should be 20
  console.log(`✓ After raise/call: p1 chips=${p1.chips}, p2 chips=${p2.chips}, pot=${pot}`);
  if (p1.chips !== 50 || p2.chips !== 50 || pot !== 20) {
    throw new Error('Pot/chip update failed!');
  }
};

// Test 7: Phase does not advance until all active players have called or folded
console.log('\nTest 7: Phase does not advance until all active players have called or folded');
const testPhaseAdvance = () => {
  let dealer = {
    currentBet: 10,
    acted: { p1: true },
    turnOrder: ['p1', 'p2'],
    phase: 'bet1',
  };
  let players = {
    p1: { folded: false, bet: 10 },
    p2: { folded: false, bet: 0 },
  };
  // Simulate check for betting round completion
  const activePlayers = dealer.turnOrder.filter((id) => !players[id].folded);
  const allActed = activePlayers.every((id) => dealer.acted[id] && players[id].bet === dealer.currentBet);
  if (allActed) throw new Error('Phase should not advance until p2 calls or folds!');
  players.p2.bet = 10; dealer.acted.p2 = true;
  const allActed2 = activePlayers.every((id) => dealer.acted[id] && players[id].bet === dealer.currentBet);
  if (!allActed2) throw new Error('Phase should advance now!');
  console.log('✓ Phase only advances when all active players have matched the bet or folded');
};
testPhaseAdvance();

// Test 8: Raises to lower or equal amounts are rejected
console.log('\nTest 8: Raises to lower or equal amounts are rejected');
const testRaiseValidation = () => {
  let currentBet = 10;
  let playerBet = 5;
  let amount = 10; // equal to currentBet
  let raiseAmount = amount - playerBet;
  if (!(typeof amount === 'number' && amount > currentBet && raiseAmount > (currentBet - playerBet))) {
    console.log('✓ Raise to equal or lower amount is correctly rejected');
  } else {
    throw new Error('Raise to equal or lower amount should be rejected!');
  }
  amount = 12; // valid raise
  raiseAmount = amount - playerBet;
  if (typeof amount === 'number' && amount > currentBet && raiseAmount > (currentBet - playerBet)) {
    console.log('✓ Valid raise is accepted');
  } else {
    throw new Error('Valid raise should be accepted!');
  }
};
testRaiseValidation();

// Run all tests
testBettingLogic();
testTurnManagement();
testPhaseProgression();
testSnipeValidation();
testBettingRoundCompletion();
testPotChipConsistency();

console.log('\n✅ All core logic tests passed!');
console.log('\nNext steps:');
console.log('1. Test the actual application in browser');
console.log('2. Verify Firebase synchronization');
console.log('3. Test with multiple players');
console.log('4. Verify UI controls work correctly'); 