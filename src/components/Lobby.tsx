import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { ref, set, onValue, get } from 'firebase/database';
import { startGame } from './Dealer';
import Game from './Game';

function generatePlayerId() {
  return 'player_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
}

function Lobby() {
  const [name, setName] = useState('');
  const [gameId, setGameId] = useState('');
  const [playerId, setPlayerId] = useState('');
  const [canStart, setCanStart] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [players, setPlayers] = useState<any>({});

  const joinGame = async () => {
    if (!name || !gameId) return;
    let id = generatePlayerId();
    setPlayerId(id);
    const playerRef = ref(db, `games/${gameId}/players/${id}`);
    const snap = await get(playerRef);
    if (!snap.exists()) {
      await set(playerRef, {
        name,
        chips: 60,
        hand: [],
        snipedPrediction: null,
        folded: false,
        hasActed: false,
      });
    }
    alert(`Joined game as ${name}`);
  };

  // Watch for players
  useEffect(() => {
    if (!gameId) return;
    const playersRef = ref(db, `games/${gameId}/players`);
    const unsub = onValue(playersRef, (snapshot) => {
      const val = snapshot.val() || {};
      setPlayers(val);
      setCanStart(Object.keys(val).length >= 2);
    });
    return () => unsub();
  }, [gameId]);

  // Watch for dealer state — when it exists, switch to Game screen
  useEffect(() => {
    if (!gameId) return;
    const dealerRef = ref(db, `games/${gameId}/dealer`);
    const unsub = onValue(dealerRef, (snapshot) => {
      if (snapshot.exists()) {
        setGameStarted(true);
      }
    });
    return () => unsub();
  }, [gameId]);

  return gameStarted && playerId ? (
    <Game gameId={gameId} playerId={playerId} />
  ) : (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold mb-4">🔥 Sniper Hold'em v2 🔥</h1>
      <input
        className="border p-2 w-full"
        onChange={(e) => setName(e.target.value)}
        placeholder="Your Name"
      />
      <input
        className="border p-2 w-full"
        onChange={(e) => setGameId(e.target.value)}
        placeholder="Game ID"
      />
      <button
        onClick={joinGame}
        className="bg-blue-500 text-white px-4 py-2 rounded"
      >
        Join Game
      </button>
      <button
        onClick={() => startGame(gameId)}
        className={`px-4 py-2 rounded ${
          canStart
            ? 'bg-green-600 text-white'
            : 'bg-gray-400 text-white cursor-not-allowed'
        }`}
        disabled={!canStart}
      >
        Start Game
      </button>
      <div className="pt-4">
        <h2 className="font-bold">Players:</h2>
        <ul>
          {Object.values(players).map((p: any, i) => (
            <li key={i}>{p.name || 'Unnamed'} ({p.chips} chips)</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default Lobby;
