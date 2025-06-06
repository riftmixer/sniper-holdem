import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { ref, onValue } from 'firebase/database';
import { submitBet, foldPlayer, submitSnipe, startGame } from './Dealer';

type Player = {
  id: string;
  name: string;
  chips: number;
  hand: number[];
  bet: number;
  folded: boolean;
  hasActed: boolean;
  snipedPrediction: string | null;
  draw: number;
  lastAction?: string | null;
  lastActionAmount?: number | null;
};

type RoundResult = {
  roundNumber: number;
  winnerId: string;
  winningHand: {
    playerId: string;
    handType: string;
    score: number;
    cards: number[];
  } | null;
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
  maxBet: number;
  draws: Record<string, number>;
  roundNumber: number;
  roundResults: RoundResult[];
};

type GameProps = {
  gameId: string;
  playerId: string;
};

const fadeInAnimation = `
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.animate-fade-in {
  animation: fadeIn 0.5s ease-in;
}
`;

const styleSheet = document.createElement("style");
styleSheet.innerText = fadeInAnimation;
document.head.appendChild(styleSheet);

const TABLE_RADIUS = 220; // px
const SEAT_RADIUS = 300; // px (distance from table center)
const TABLE_SIZE = 500; // px

function getSeatPositions(numPlayers: number) {
  // Dynamically adjust seat radius and size for small tables
  let seatRadius = SEAT_RADIUS;
  let seatWidth = 140;
  let seatHeight = 100;
  if (numPlayers === 2) {
    seatRadius = 200;
    seatWidth = 120;
    seatHeight = 90;
  } else if (numPlayers === 3) {
    seatRadius = 230;
    seatWidth = 120;
    seatHeight = 90;
  }
  const angleStep = (2 * Math.PI) / numPlayers;
  const center = TABLE_SIZE / 2;
  return Array.from({ length: numPlayers }, (_, i) => {
    // Seat 0 is at the bottom (angle -Math.PI/2)
    const angle = angleStep * i - Math.PI / 2;
    return {
      left: center + seatRadius * Math.cos(angle) - seatWidth / 2,
      top: center + seatRadius * Math.sin(angle) - seatHeight / 2,
      width: seatWidth,
      height: seatHeight,
    };
  });
}

export default function Game({ gameId, playerId }: GameProps) {
  const [players, setPlayers] = useState<Record<string, Player>>({});
  const [dealer, setDealer] = useState<DealerState | null>(null);
  const [betInput, setBetInput] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [actionLog, setActionLog] = useState<string[]>([]);

  useEffect(() => {
    const gameRef = ref(db, `games/${gameId}`);
    const unsubscribe = onValue(gameRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setPlayers(data.players || {});
        setDealer(data.dealer || null);
      }
    });

    return () => unsubscribe();
  }, [gameId]);

  useEffect(() => {
    if (!dealer || !players) return;
    
    // Start the game if it's the first round and we have players
    if (dealer.roundNumber === 1 && Object.keys(players).length > 0) {
      startGame(gameId);
    }
  }, [dealer?.roundNumber, players, gameId]);

  useEffect(() => {
    if (!dealer || !playerId) return;
    
    const isTurn = dealer.currentTurn < dealer.turnOrder.length && 
      dealer.turnOrder[dealer.currentTurn] === playerId;
    setIsMyTurn(isTurn);
  }, [dealer?.currentTurn, dealer?.turnOrder, playerId]);

  useEffect(() => {
    if (!dealer || !players) return;
    const log: string[] = [];
    // For each player in turn order, log their last action if present
    dealer.turnOrder.forEach((pid) => {
      const p = players[pid];
      if (!p) return;
      if (p.lastAction && typeof p.lastActionAmount === 'number' && p.lastActionAmount > 0) {
        log.push(`${p.name} ${p.lastAction.toUpperCase()}: ${p.lastActionAmount} chips`);
      } else if (p.folded) {
        log.push(`${p.name} FOLDED`);
      }
    });
    // Add whose turn it is
    if (dealer.currentTurn < dealer.turnOrder.length) {
      const current = players[dealer.turnOrder[dealer.currentTurn]];
      if (current) {
        log.push(`→ ${current.name}'s turn`);
      }
    }
    setActionLog(log);
  }, [players, dealer]);

  const handleBet = async () => {
    if (betInput <= 0) {
      setError('Bet must be greater than 0');
      return;
    }
    try {
      await submitBet(gameId, playerId, betInput);
      setBetInput(0);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit bet');
    }
  };

  const handleFold = async () => {
    try {
      await foldPlayer(gameId, playerId);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fold');
    }
  };

  const handleSnipe = async (prediction: string) => {
    try {
      await submitSnipe(gameId, playerId, prediction);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit snipe');
    }
  };

  const renderRoundHistory = () => {
    if (!dealer?.roundResults?.length) return null;

    // Helper to render a player's cards
    const renderCards = (cards: number[] | undefined) => (
      <span className="inline-flex gap-1 align-middle ml-1">
        {cards && cards.map((card, i) => (
          <span key={i} className="inline-block w-6 h-8 bg-white text-black rounded text-center font-bold border border-gray-400 align-middle">{card}</span>
        ))}
      </span>
    );

    return (
      <div className="fixed right-4 top-4 w-96 bg-gray-800 rounded-lg p-4 shadow-lg max-h-[calc(100vh-2rem)] overflow-y-auto">
        <h2 className="text-2xl font-bold mb-4 text-white">Round History</h2>
        {dealer.roundResults.map((result, index) => {
          // Find the winning player and hand
          const winner = result.winnerId && result.winnerId !== 'split' ? players[result.winnerId] : null;
          const winningHand = result.winningHand;
          // Build explanation
          let explanation = '';
          if (result.winnerId === 'split') {
            explanation = 'Pot was split because all players were sniped or there was a tie.';
          } else if (winningHand) {
            explanation = `${winner?.name || 'Unknown'} won with a ${winningHand.handType} because it was the highest eligible hand.`;
          }
          return (
            <div key={index} className="mb-8 p-4 bg-gray-700 rounded-lg">
              <div className="text-xl font-semibold text-white mb-2">Round {result.roundNumber}</div>
              {/* Winner and Pot */}
              <div className="mb-2">
                <div className={result.winnerId === 'split' ? 'text-green-300 font-bold' : 'text-green-400 font-bold'}>
                  {result.winnerId === 'split' ? 'Pot Split' : `Winner: ${winner?.name || 'Unknown'} (+${result.pot} chips)`}
                </div>
                {winningHand && (
                  <div className="text-blue-300 mt-1">
                    Winning Hand: <span className="font-bold">{winningHand.handType}</span> {renderCards(winningHand.cards)}
                  </div>
                )}
                {explanation && <div className="text-xs text-gray-300 mt-1">{explanation}</div>}
              </div>
              {/* Show all players' hands */}
              <div className="mb-2">
                <div className="text-gray-200 font-semibold mb-1">Player Hands:</div>
                {Object.entries(players).map(([pid, p]) => (
                  <div key={pid} className="text-sm text-gray-100 mb-1">
                    <span className="font-bold">{p.name}</span>: {renderCards(p.hand)}
                    {result.winnerId === pid && <span className="ml-2 text-green-400">(Winner)</span>}
                    {result.snipeResults.some(s => s.success && s.predicted === result.winningHand?.handType && pid === result.winnerId) && (
                      <span className="ml-2 text-red-400">(Sniped!)</span>
                    )}
                  </div>
                ))}
              </div>
              {/* Snipe Results */}
              {result.snipeResults.length > 0 && (
                <div className="mb-2">
                  <div className="text-yellow-400 font-bold mb-1">Snipe Attempts:</div>
                  {result.snipeResults.map((snipe, i) => (
                    <div key={i} className="text-sm">
                      {players[snipe.sniperId]?.name || 'Unknown'} predicted{' '}
                      <span className={snipe.success ? 'text-green-400' : 'text-red-400'}>
                        {snipe.predicted}
                      </span>
                      {' '}({snipe.success ? 'Success' : 'Failed'})
                    </div>
                  ))}
                </div>
              )}
              {/* Chip Changes */}
              <div className="text-sm text-gray-400">
                <div className="mb-1">Chip Changes:</div>
                {result.chipChanges && Object.entries(result.chipChanges).map(([playerId, change]) => (
                  <div key={playerId} className={change > 0 ? 'text-green-400' : change < 0 ? 'text-red-400' : 'text-gray-300'}>
                    {players[playerId]?.name || 'Unknown'}: {change > 0 ? '+' : ''}{change}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderControls = () => {
    if (!dealer || !isMyTurn || players[playerId]?.folded) return null;

    const currentPlayer = players[playerId];
    if (!currentPlayer || currentPlayer.hasActed) return null;

    const maxBet = dealer.maxBet || 0;
    const myBet = currentPlayer.bet || 0;
    const toCall = maxBet - myBet;
    const canCall = toCall > 0 && toCall <= currentPlayer.chips;
    const canRaise = betInput > toCall && betInput <= currentPlayer.chips;
    const isFirstToAct = maxBet === 0;

    // Unified bet handler for both Bet and Call
    const handleCall = async () => {
      if (canCall) {
        await submitBet(gameId, playerId, toCall);
        setBetInput(0);
      }
    };

    return (
      <div className="mt-4 space-y-4">
        {/* Betting Controls */}
        {(dealer.phase === 'bet1' || dealer.phase === 'bet2') && (
          <div>
            <div className="flex gap-2 items-center mb-2">
              {isFirstToAct ? (
                <>
                  <input
                    type="number"
                    value={betInput}
                    onChange={(e) => setBetInput(Number(e.target.value))}
                    min={1}
                    max={currentPlayer.chips}
                    className="w-24 px-2 py-1 border rounded text-black"
                    placeholder="Bet amount"
                  />
                  <button
                    onClick={handleBet}
                    className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-1 rounded"
                    disabled={betInput < 1 || betInput > currentPlayer.chips}
                  >
                    Bet
                  </button>
                  <button
                    onClick={handleFold}
                    className="bg-red-500 hover:bg-red-600 text-white px-4 py-1 rounded"
                  >
                    Fold
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={handleCall}
                    className="bg-green-500 hover:bg-green-600 text-white px-4 py-1 rounded"
                    disabled={!canCall}
                  >
                    Call {toCall}
                  </button>
                  <input
                    type="number"
                    value={betInput}
                    onChange={(e) => setBetInput(Number(e.target.value))}
                    min={toCall + 1}
                    max={currentPlayer.chips}
                    className="w-24 px-2 py-1 border rounded text-black"
                    placeholder="Raise to"
                  />
                  <button
                    onClick={handleBet}
                    className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-1 rounded"
                    disabled={!canRaise}
                  >
                    Raise
                  </button>
                  <button
                    onClick={handleFold}
                    className="bg-red-500 hover:bg-red-600 text-white px-4 py-1 rounded"
                  >
                    Fold
                  </button>
                </>
              )}
            </div>
            {error && <div className="text-red-500 text-sm">{error}</div>}
          </div>
        )}

        {/* Snipe Phase Controls */}
        {dealer.phase === 'snipe' && !currentPlayer.snipedPrediction && (
          <div className="mt-4">
            <h3 className="text-lg font-semibold mb-2">Snipe Phase</h3>
            <div className="grid grid-cols-2 gap-2">
              {['high card', 'pair', 'two pair', 'three of a kind', 'straight', 'full house', 'four of a kind'].map((hand) => (
                <button
                  key={hand}
                  onClick={() => handleSnipe(hand)}
                  className="bg-purple-500 hover:bg-purple-600 text-white px-4 py-2 rounded"
                >
                  Snipe {hand}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderPokerTable = () => {
    if (!dealer || !dealer.turnOrder) return null;
    const numPlayers = dealer.turnOrder.length;
    if (numPlayers === 0) return null;

    // Find the current user's seat index
    const myIndex = dealer.turnOrder.findIndex((id) => id === playerId);
    // Rotate the turnOrder so the current user is always seat 0 (bottom)
    const rotatedOrder = [
      ...dealer.turnOrder.slice(myIndex),
      ...dealer.turnOrder.slice(0, myIndex),
    ];
    const seatPositions = getSeatPositions(numPlayers);

    return (
      <div
        className="relative mx-auto my-8"
        style={{ width: `${TABLE_SIZE}px`, height: `${TABLE_SIZE + 80}px` }}
      >
        {/* Table background */}
        <div
          className="absolute rounded-full"
          style={{
            width: `${TABLE_RADIUS * 2}px`,
            height: `${TABLE_RADIUS * 2}px`,
            left: `${(TABLE_SIZE - TABLE_RADIUS * 2) / 2}px`,
            top: `${(TABLE_SIZE - TABLE_RADIUS * 2) / 2}px`,
            background: 'radial-gradient(circle at 60% 40%, #3a5d2c 80%, #1b2e13 100%)',
            border: '8px solid #bfa76a',
            boxShadow: '0 0 40px #222',
          }}
        />
        {/* Pot value above community cards */}
        <div
          className="absolute left-1/2"
          style={{
            top: `calc(50% - 70px)`,
            transform: 'translateX(-50%)',
            zIndex: 3,
          }}
        >
          <div className="bg-yellow-900 text-green-200 font-bold text-lg px-4 py-2 rounded-full shadow-lg border-2 border-yellow-400">
            Pot: {dealer.pot} chips
          </div>
        </div>
        {/* Community cards in the center */}
        <div
          className="absolute left-1/2 top-1/2 flex gap-2 justify-center items-center"
          style={{
            transform: 'translate(-50%, -50%)',
            zIndex: 2,
          }}
        >
          {dealer.communityCards?.map((card, i) => (
            <div
              key={i}
              className="w-12 h-16 bg-white border rounded flex items-center justify-center text-lg text-black shadow"
            >
              {card}
            </div>
          ))}
        </div>
        {/* Player seats */}
        {rotatedOrder.map((pid, idx) => {
          const player = players[pid];
          if (!player) return null;
          const isMe = pid === playerId;
          const isCurrentTurn = dealer.currentTurn < dealer.turnOrder.length && dealer.turnOrder[dealer.currentTurn] === pid;
          const seat = seatPositions[idx];
          let actionLabel = null;
          if (player.lastAction && typeof player.lastActionAmount === 'number' && player.lastActionAmount > 0) {
            if (player.lastAction === 'bet') {
              actionLabel = <span className="ml-2 text-xs text-green-300">(Bet: {player.lastActionAmount})</span>;
            } else if (player.lastAction === 'call') {
              actionLabel = <span className="ml-2 text-xs text-blue-300">(Call: {player.lastActionAmount})</span>;
            } else if (player.lastAction === 'raise') {
              actionLabel = <span className="ml-2 text-xs text-yellow-300">(Raise: {player.lastActionAmount})</span>;
            }
          }
          return (
            <div
              key={pid}
              className={`absolute flex flex-col items-center justify-center transition-all duration-300 ${
                isMe ? 'ring-4 ring-yellow-400' : ''
              }`}
              style={{
                left: `${seat.left}px`,
                top: `${seat.top}px`,
                width: `${seat.width}px`,
                height: `${seat.height}px`,
                zIndex: 3,
              }}
            >
              <div
                className={`rounded-lg px-3 py-2 w-full text-center font-bold text-gray-800 ${
                  isCurrentTurn ? 'bg-yellow-200' : isMe ? 'bg-blue-100' : 'bg-gray-100'
                }`}
              >
                {player.name}
              </div>
              <div className="flex gap-1 mt-1 mb-1">
                {player.hand?.map((card, i) => (
                  <div
                    key={i}
                    className="w-8 h-12 bg-white border rounded flex items-center justify-center text-base text-black"
                  >
                    {isMe ? card : <span className="text-2xl">🂠</span>}
                  </div>
                ))}
              </div>
              {/* Prominent chip count and bet/call label */}
              <div className="mt-1 mb-1">
                <span className="inline-block px-3 py-1 rounded-full bg-gray-900 text-yellow-300 font-bold text-base shadow border-2 border-yellow-400">
                  {player.chips} chips
                </span>
                {actionLabel}
              </div>
              {player.folded && <div className="text-xs text-red-500">Folded</div>}
              {player.snipedPrediction && (
                <div className="text-xs text-purple-600">Sniped: {player.snipedPrediction}</div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4">
      <div className="fixed left-4 top-4 w-96 bg-gray-800 rounded-lg p-4 shadow-lg max-h-[calc(100vh-2rem)] overflow-y-auto z-50">
        <h2 className="text-2xl font-bold mb-4 text-white">Action Log</h2>
        <div className="text-white space-y-2">
          {actionLog.map((entry, idx) => (
            <div key={idx} className="text-sm">{entry}</div>
          ))}
        </div>
      </div>
      {renderRoundHistory()}
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-4">🔥 Sniper Hold'em v2 🔥</h1>
        {renderPokerTable()}
        {/* Controls below the table, with extra margin */}
        <div className="flex justify-center mt-12">
          {renderControls()}
        </div>
      </div>
    </div>
  );
}