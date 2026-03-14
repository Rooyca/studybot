// handlers/blackjack.js — Blackjack game logic

const CARD_VALUES = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
  'J': 10, 'Q': 10, 'K': 10, 'A': 11,
};

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit });
    }
  }
  return deck.sort(() => Math.random() - 0.5);
}

function drawCard(deck) {
  return deck.pop();
}

function calculateHandValue(hand) {
  let value = 0;
  let aces = 0;

  for (const card of hand) {
    value += CARD_VALUES[card.rank];
    if (card.rank === 'A') aces++;
  }

  // Adjust for aces (count as 1 if busting)
  while (value > 21 && aces > 0) {
    value -= 10;
    aces--;
  }

  return value;
}

function formatCard(card) {
  return `${card.rank}${card.suit}`;
}

function formatHand(hand, hideSecond = false) {
  if (hideSecond && hand.length > 1) {
    return `${formatCard(hand[0])} 🂠`;
  }
  return hand.map(formatCard).join(' ');
}

function playBlackjack() {
  const deck = createDeck();

  // Deal initial hands
  const playerHand = [drawCard(deck), drawCard(deck)];
  const dealerHand = [drawCard(deck), drawCard(deck)];

  return {
    deck,
    playerHand,
    dealerHand,
    playerStand: false,
    dealerStand: false,
  };
}

function playerHit(game) {
  if (game.playerStand) return null;
  game.playerHand.push(drawCard(game.deck));

  const value = calculateHandValue(game.playerHand);
  if (value > 21) {
    return { bust: true, value };
  }
  return { value, hand: game.playerHand };
}

function playerStand(game) {
  game.playerStand = true;
  return { value: calculateHandValue(game.playerHand) };
}

function dealerPlay(game) {
  while (calculateHandValue(game.dealerHand) < 17) {
    game.dealerHand.push(drawCard(game.deck));
  }
  game.dealerStand = true;
  return { value: calculateHandValue(game.dealerHand) };
}

function determineWinner(playerValue, dealerValue) {
  if (playerValue > 21) return 'dealer';
  if (dealerValue > 21) return 'player';
  if (playerValue === dealerValue) return 'push';
  return playerValue > dealerValue ? 'player' : 'dealer';
}

function formatGameResult(game) {
  const playerValue = calculateHandValue(game.playerHand);
  const dealerValue = calculateHandValue(game.dealerHand);
  const winner = determineWinner(playerValue, dealerValue);

  let result = `♠️ *RESULTADO* ♠️\n\n`;
  result += `🎴 *Jugador*: ${formatHand(game.playerHand)} = *${playerValue}*\n`;
  result += `🎴 *Crupier*: ${formatHand(game.dealerHand)} = *${dealerValue}*\n\n`;

  if (winner === 'player') {
    result += `🎉 *¡GANASTE!* 🎉`;
  } else if (winner === 'dealer') {
    result += `💔 *¡PERDISTE!* 💔`;
  } else {
    result += `🤝 *¡EMPATE!* 🤝`;
  }

  return { result, winner, playerValue, dealerValue };
}

module.exports = {
  playBlackjack,
  playerHit,
  playerStand,
  dealerPlay,
  determineWinner,
  calculateHandValue,
  formatHand,
  formatGameResult,
};
