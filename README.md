# Multiplayer Card Game

A browser-based multiplayer card game where players pass cards to collect matching colors.

## Game Overview

### Objective
Be the first to collect 4 cards of the same color to win!

### Game Features
- **4-Player Maximum**: Create or join rooms with up to 4 players
- **Unique Room IDs**: Each game session has a unique room code
- **Real-time Turn System**: Turns progress clockwise around the table
- **Hidden Hands**: You can only see your own cards; other players' cards are hidden
- **Card Animation**: Smooth animations when cards are passed between players
- **Winner Animation**: Celebratory animations when someone wins

## How to Run

### Option 1: Direct File Opening (Simplest)
1. Navigate to the game folder
2. Right-click on `index.html`
3. Select "Open with" > "Your browser" (Chrome, Firefox, Safari, Edge, etc.)
4. The game will open in your browser

### Option 2: Using a Local Server (Recommended)

**For Windows (Using Python):**
```bash
# Python 3.x
python -m http.server 8000

# Python 2.x
python -m SimpleHTTPServer 8000
```

Then open: `http://localhost:8000`

**For Windows (Using Node.js):**
```bash
# First, install http-server globally (one time only)
npm install -g http-server

# Then run it
http-server .
```

Then open the URL shown (usually `http://localhost:8080`)

**For Mac/Linux:**
```bash
# Using Python
python3 -m http.server 8000

# Or using Node.js (after installing)
http-server .
```

## How to Play

### 1. Lobby Screen
- Enter your player name
- **Create Room**: Start a new game and become the host
  - A unique 6-character Room ID will be generated
  - Share this ID with other players
- **Join Room**: Join an existing game using the Room ID

### 2. Waiting Room
- See all connected players
- Only the host can start the game
- Once started, the game deals cards and begins

### 3. Game Screen
- **Your Cards**: Visible at the bottom of the screen
- **Other Players**: Shown around a table with hidden cards
- **Turns**: Complete clockwise around the table
- **Your Turn**: Click any card in your hand to pass it to the next player
- **Other Players' Turns**: Watch the turn indicator to see whose turn it is

### 4. Winning
- First player to have 4 cards of the same color wins
- Winner screen displays with celebration animation
- Return to lobby to play again

## File Structure

```
game/
├── index.html      # Main HTML structure
├── style.css       # All styling and animations
├── script.js       # Complete game logic
└── README.md       # This file
```

## Game Rules

### Card Setup
- **Deck Composition**: 16 cards (4 red, 4 green, 4 orange, 4 blue)
- **Initial Deal**: Each player receives 4 random cards at game start
- **Deck Shuffle**: Cards are randomly shuffled before dealing

### Turn Order
1. Players sit around a virtual table
2. The first player is randomly selected
3. Each player must choose ONE card from their hand
4. The card is passed to the next player (clockwise)
5. Turn passes to the next player

### Winning Condition
- **Win**: First to collect 4 cards of the SAME color
- **Immediate End**: Game ends the moment a player gets 4 matching cards
- **No Ties**: Winner is displayed with celebration animation

## Technical Details

### Architecture
- **Game Logic**: Fully modular with Card, Player, and Room classes
- **No Backend**: Everything runs in the browser (multiplayer simulation)
- **State Management**: Game state stored in memory during play
- **Room System**: Each room maintains independent game state

### Classes

**Card**
- Properties: `color`, `id`
- Methods: `getSymbol()` - returns symbol representation

**Player**
- Properties: `name`, `playerId`, `hand`, `isHost`
- Methods: `addCard()`, `removeCard()`, `hasWinningColor()`, `getCardsByColor()`

**Room**
- Properties: Players list, current turn index, game state
- Methods: `addPlayer()`, `dealCards()`, `passCard()`, `checkWinner()`

**GameManager**
- Controls all game flow and UI updates
- Manages multiple rooms and game transitions

### Browser Compatibility
- Modern browsers (Chrome, Firefox, Safari, Edge)
- Requires JavaScript enabled
- Works on desktop and mobile browsers
- Responsive design adapts to different screen sizes

## Features Implemented

✅ **Lobby System**
- Player name input
- Room creation with unique IDs
- Room joining with ID entry
- Player limit (max 4)

✅ **Waiting Room**
- Live player list
- Host-only start button
- Player count display
- Room ID copy button

✅ **Game Logic**
- Card shuffling and dealing
- Turn-based system (clockwise)
- Hidden hands for other players
- Card passing between players
- Win condition detection

✅ **UI & UX**
- Clean, modern interface
- Responsive layout
- Table visualization
- Player positioning
- Status messages and indicators

✅ **Animations**
- Card flip animations
- Card movement animations
- Winner celebration effects
- Smooth transitions between screens
- Pulse effects for active elements

## Tips for Multiplayer Fun

1. **Multiple Windows**: You can open the game in multiple browser windows/tabs to simulate multiple players
2. **Share the Room ID**: Copy and share your Room ID with friends to invite them
3. **Watch the Turn Indicator**: The glowing dot in the center shows whose turn it is
4. **Card Strategy**: Think carefully about which card you pass - it might help or hurt other players!

## Troubleshooting

**"Room not found" error**
- Verify the Room ID is correct (6 characters, uppercase)
- Make sure the host hasn't left the room
- Room IDs are unique and case-sensitive

**Cards not appearing**
- Refresh the page
- Make sure you've entered a name before creating/joining

**Can't start game**
- Only the host can start
- Need at least 2 players to start

**Animations not smooth**
- Ensure your browser is up to date
- Close other browser tabs to free up resources

## Notes

- This is a local multiplayer simulation - all game state stays in your browser
- Refreshing the page will lose your current game
- The game uses localStorage concepts but stores state in memory for now
- Perfect for learning multiplayer game logic

## Development

The code is organized into clear sections:
1. **Constants**: Game rules and settings
2. **Classes**: Card, Player, Room, GameManager
3. **Methods**: Grouped by functionality (lobby, game, UI, etc.)
4. **Comments**: Extensive documentation throughout

Feel free to modify the code to add:
- Custom card decks
- Different game modes
- Persistent player profiles
- Backend integration for true multiplayer
- More complex strategies

## License

Free to use and modify for personal and commercial projects.

---

**Enjoy the game! Have fun with friends!** 🎮
