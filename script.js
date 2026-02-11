// NOTE: Game now uses backend API instead of localStorage
// API endpoints are defined in server.js
// Use current origin so it works with tunnels (Cloudflare, ngrok, etc)
const API_URL = `${window.location.origin}/api`;

// ========================================
// GAME CONSTANTS
// ========================================

const COLORS = ['red', 'green', 'orange', 'blue'];
const CARDS_PER_PLAYER = 4;
const MAX_PLAYERS = 4;
const WINNING_COUNT = 4;

// ========================================
// CARD CLASS
// ========================================

class Card {
    constructor(color) {
        this.color = color;
        this.id = Math.random().toString(36).substr(2, 9);
    }

    getSymbol() {
        const symbols = { red: '♥', green: '♣', orange: '◆', blue: '♠' };
        return symbols[this.color] || '♣';
    }
}

// ========================================
// PLAYER CLASS
// ========================================

class Player {
    constructor(name, playerId) {
        this.name = name;
        this.playerId = playerId;
        this.hand = [];
        this.isHost = false;
    }

    addCard(card) {
        this.hand.push(card);
    }

    removeCard(cardId) {
        this.hand = this.hand.filter(card => card.id !== cardId);
    }

    getCardById(cardId) {
        return this.hand.find(card => card.id === cardId);
    }

    hasWinningColor() {
        /**
         * Check if player has 4 cards of the same color
         * Returns the winning color or null
         */
        for (let color of COLORS) {
            const count = this.hand.filter(card => card.color === color).length;
            if (count >= WINNING_COUNT) {
                return color;
            }
        }
        return null;
    }

    getCardsByColor() {
        /**
         * Returns object with color as key and array of cards as value
         */
        const result = {};
        for (let color of COLORS) {
            result[color] = this.hand.filter(card => card.color === color);
        }
        return result;
    }
}

// ========================================
// ROOM CLASS
// ========================================

class Room {
    constructor(roomId, hostName) {
        this.roomId = roomId;
        this.players = [];
        this.currentTurnIndex = 0;
        this.gameStarted = false;
        this.gameEnded = false;
        this.winner = null;

        // Create host player
        const hostPlayer = new Player(hostName, 0);
        hostPlayer.isHost = true;
        this.players.push(hostPlayer);
    }

    addPlayer(playerName) {
        /**
         * Add a player to the room
         * Returns true if successful, false if room is full
         */
        if (this.players.length >= MAX_PLAYERS) {
            return false;
        }

        const newPlayer = new Player(playerName, this.players.length);
        this.players.push(newPlayer);
        return true;
    }

    getPlayerCount() {
        return this.players.length;
    }

    canStart() {
        /**
         * Game can start with 2+ players
         */
        return this.players.length >= 2;
    }

    dealCards() {
        /**
         * Create a shuffled deck and distribute cards to players
         * Total: 16 cards (4 colors × 4 cards each)
         */
        // Create deck - exactly 16 cards with 4 of each color
        const deck = [];
        for (let color of COLORS) {
            for (let j = 0; j < 4; j++) {
                deck.push(new Card(color));
            }
        }

        // Shuffle deck (Fisher-Yates shuffle)
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }

        // Deal cards to each player
        let deckIndex = 0;
        for (let player of this.players) {
            for (let i = 0; i < CARDS_PER_PLAYER; i++) {
                player.addCard(deck[deckIndex]);
                deckIndex++;
            }
        }
    }

    selectRandomStartPlayer() {
        /**
         * Randomly select a player to start
         */
        this.currentTurnIndex = Math.floor(Math.random() * this.players.length);
    }

    getGameState() {
        /**
         * Get current game state for all players
         */
        return {
            roomId: this.roomId,
            players: this.players.map(p => ({
                playerId: p.playerId,
                name: p.name,
                isHost: p.isHost,
                handCount: p.hand.length,
                cards: p.hand
            })),
            currentTurnIndex: this.currentTurnIndex,
            gameStarted: this.gameStarted,
            gameEnded: this.gameEnded,
            winner: this.winner
        };
    }

    getCurrentPlayer() {
        return this.players[this.currentTurnIndex];
    }

    getNextPlayer() {
        /**
         * Get next player (clockwise)
         */
        const nextIndex = (this.currentTurnIndex + 1) % this.players.length;
        return this.players[nextIndex];
    }

    moveToNextPlayer() {
        /**
         * Move turn to next player
         */
        this.currentTurnIndex = (this.currentTurnIndex + 1) % this.players.length;
    }

    passCard(fromPlayerId, cardId, toPlayerId) {
        /**
         * Pass a card from one player to another
         * Returns the card if successful, null otherwise
         */
        const fromPlayer = this.players[fromPlayerId];
        const toPlayer = this.players[toPlayerId];

        if (!fromPlayer || !toPlayer) {
            return null;
        }

        const card = fromPlayer.getCardById(cardId);
        if (!card) {
            return null;
        }

        fromPlayer.removeCard(cardId);
        toPlayer.addCard(card);

        return card;
    }

    checkWinner() {
        /**
         * Check if any player has won
         * Returns the winning player or null
         */
        for (let player of this.players) {
            const winningColor = player.hasWinningColor();
            if (winningColor) {
                this.gameEnded = true;
                this.winner = {
                    playerId: player.playerId,
                    name: player.name,
                    color: winningColor
                };
                return this.winner;
            }
        }
        return null;
    }
}

// ========================================
// GAME MANAGER CLASS
// ========================================

class GameManager {
    constructor() {
        this.currentPlayerName = null;
        this.currentPlayerId = null;
        this.currentRoom = null;
        this.rooms = {}; // Store all rooms
        this.isPlayingCard = false; // Prevent double-clicks
        this.lastPlayTime = 0; // Track last play for debounce
        
        this.initializeEventListeners();
        
        // Start auto-refresh for game updates
        this.startAutoRefresh();
    }
    
    async loadGameState() {
        /**
         * Load game state from server
         */
        if (!this.currentRoom) return;
        
        try {
            const response = await fetch(`${API_URL}/rooms/${this.currentRoom.roomId}/state`);
            if (!response.ok) throw new Error('Failed to load game state');
            
            const data = await response.json();
            
            // Rebuild room state from API response
            const room = new Room(data.room.roomId, '');
            room.gameStarted = data.room.gameStarted;
            room.gameEnded = data.room.gameEnded;
            room.currentTurnIndex = data.room.currentPlayerIndex;
            
            // Rebuild players
            room.players = [];
            for (let playerData of data.players) {
                const player = new Player(playerData.name, playerData.playerId);
                player.isHost = playerData.isHost;
                
                // Add cards from cardsByPlayer
                if (data.cardsByPlayer && data.cardsByPlayer[playerData.playerId]) {
                    player.hand = data.cardsByPlayer[playerData.playerId].map(cardData => {
                        const card = new Card(cardData.color);
                        card.id = cardData.id;
                        return card;
                    });
                }
                
                room.players.push(player);
            }
            
            this.currentRoom = room;
            // If DB indicates a winner, populate winner info for UI
            if (data.room.winnerId !== null && data.room.winnerId !== undefined) {
                const winnerPlayer = room.players.find(p => p.playerId == data.room.winnerId);
                if (winnerPlayer) {
                    const color = winnerPlayer.hasWinningColor();
                    room.winner = { playerId: data.room.winnerId, name: winnerPlayer.name, color };
                }
            }
            return data;
        } catch (e) {
            console.error('Error loading game state:', e);
        }
    }
    
    startAutoRefresh() {
        /**
         * Auto-refresh game state (less frequently during gameplay to avoid interference)
         */
        setInterval(() => {
            if (this.currentRoom && this.currentRoom.gameStarted) {
                // Don't refresh if we're currently playing a card
                if (this.isPlayingCard) {
                    return;
                }
                
                this.loadGameState().then(() => {
                    // Check for winner every 500ms
                    if (this.currentRoom.gameStarted && !this.currentRoom.gameEnded) {
                        // Only do lightweight winner check, don't call updateGameUI every time
                        fetch(`${API_URL}/rooms/${this.currentRoom.roomId}/check-winner`)
                            .then(resp => resp.json())
                            .then(data => {
                                if (data.winner) {
                                    // Found a winner, reload state and show screen
                                    this.loadGameState().then(() => {
                                        this.showWinnerScreen();
                                    });
                                }
                            })
                            .catch(e => console.error('Error checking winner:', e));
                    }
                });
            }
        }, 800); // Increased from 300ms to 800ms for stability
    }
    
    saveRoomToServer() {
        /**
         * Game state is managed by server API
         */
        console.log('Game state synchronized with server');
    }
    
    removeRoomFromStorage(roomId) {
        /**
         * Remove a room from localStorage
         */
        try {
            const roomsData = localStorage.getItem('cardGameRooms') || '{}';
            const rooms = JSON.parse(roomsData);
            delete rooms[roomId];
            localStorage.setItem('cardGameRooms', JSON.stringify(rooms));
        } catch (e) {
            console.error('Error removing room from storage:', e);
        }
    }
    
    onStorageChange(e) {
        /**
         * Called when storage changes in another window
         */
        if (e.key === 'cardGameRooms') {
            // Reload rooms from storage
            this.loadRoomsFromStorage();
            
            // Update UI if we're in a room
            if (this.currentRoom) {
                this.updateWaitingRoom();
                if (this.currentRoom.gameStarted) {
                    this.updateGameUI();
                }
            }
        }
    }

    initializeEventListeners() {
        /**
         * Set up keyboard and input listeners
         */
        document.getElementById('playerNameInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.createRoom();
        });

        document.getElementById('roomIdInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.joinRoom();
        });

        // Prevent refresh warning
        window.addEventListener('beforeunload', (e) => {
            if (this.currentRoom) {
                e.preventDefault();
                e.returnValue = '';
            }
        });
        
        // Auto-refresh UI every 300ms to sync with other windows and catch winner immediately
        this.autoRefreshInterval = setInterval(() => {
            if (this.currentRoom) {
                const waitingRoomScreen = document.getElementById('waitingRoomScreen');
                const gameScreen = document.getElementById('gameScreen');
                const winnerScreen = document.getElementById('winnerScreen');
                
                // Check if waiting room is visible (has active class and not hidden)
                if (waitingRoomScreen.classList.contains('active') && 
                    !waitingRoomScreen.classList.contains('hidden')) {
                    // In waiting room - refresh player list
                    this.updateWaitingRoom();
                } else if (gameScreen.classList.contains('active') && 
                           !gameScreen.classList.contains('hidden')) {
                    // In game - refresh game state (will also check for winner)
                    this.updateGameUI();
                } else if (winnerScreen.classList.contains('active') && 
                           !winnerScreen.classList.contains('hidden')) {
                    // Already showing winner screen - no need to refresh
                }
            }
        }, 500);
    }

    // ========================================
    // LOBBY FUNCTIONS
    // ========================================

    createRoom() {
        /**
         * Create a new room with the current player as host (via API)
         */
        const playerName = document.getElementById('playerNameInput').value.trim();

        if (!playerName) {
            alert('Please enter your name');
            return;
        }

        this.currentPlayerName = playerName;
        
        // Call API to create room
        console.log('Creating room for player:', playerName);
        
        fetch(`${API_URL}/rooms`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playerName })
        })
        .then(response => {
            console.log('Response status:', response.status);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('Room response:', data);
            
            if (data.error) {
                alert('Error creating room: ' + data.error);
                return;
            }
            
            const roomId = data.roomId;
            const room = new Room(roomId, playerName);
            this.currentRoom = room;
            this.currentPlayerId = 0; // Host is always player 0
            
            console.log('Room created:', roomId);
            
            // Update UI
            this.showWaitingRoom();
            this.updateWaitingRoom();
        })
        .catch(e => {
            console.error('Error creating room:', e.message, e);
            alert('Error creating room: ' + e.message + '\n\nMake sure server is running at ' + window.location.origin);
        });
    }

    joinRoom() {
        /**
         * Join an existing room with the entered room ID (via API)
         */
        const playerName = document.getElementById('playerNameInput').value.trim();
        const roomId = document.getElementById('roomIdInput').value.trim().toUpperCase();

        if (!playerName) {
            alert('Please enter your name');
            return;
        }

        if (!roomId) {
            alert('Please enter a room ID');
            return;
        }

        console.log('Attempting to join room:', roomId);
        
        // Call API to join room
        fetch(`${API_URL}/rooms/${roomId}/join`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playerName })
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                alert('Error: ' + data.error);
                return;
            }
            
            const playerId = data.playerId;
            this.currentPlayerName = playerName;
            this.currentPlayerId = playerId;
            
            // Load full room state
            return fetch(`${API_URL}/rooms/${roomId}/state`);
        })
        .then(response => response.json())
        .then(data => {
            // Build room object
            const room = new Room(data.room.roomId, '');
            room.gameStarted = data.room.gameStarted;
            room.gameEnded = data.room.gameEnded;
            room.currentTurnIndex = data.room.currentPlayerIndex;
            
            room.players = [];
            for (let playerData of data.players) {
                const player = new Player(playerData.name, playerData.playerId);
                player.isHost = playerData.isHost;
                room.players.push(player);
            }
            
            this.currentRoom = room;
            
            console.log('Successfully joined room as player:', this.currentPlayerId);
            
            // Close dialog and show waiting room
            this.closeJoinDialog();
            this.showWaitingRoom();
            this.updateWaitingRoom();
        })
        .catch(e => {
            console.error('Error joining room:', e);
            alert('Error joining room. Make sure server is running.');
        });
    }

    openJoinDialog() {
        /**
         * Show the join room dialog
         */
        document.getElementById('joinDialog').classList.remove('hidden');
    }

    closeJoinDialog() {
        /**
         * Hide the join room dialog
         */
        document.getElementById('joinDialog').classList.add('hidden');
    }

    generateRoomId() {
        /**
         * Generate a unique 6-character room ID
         */
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let roomId = '';
        for (let i = 0; i < 6; i++) {
            roomId += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return this.rooms[roomId] ? this.generateRoomId() : roomId;
    }

    copyRoomId() {
        /**
         * Copy room ID to clipboard
         */
        const roomId = this.currentRoom.roomId;
        navigator.clipboard.writeText(roomId).then(() => {
            const notification = document.getElementById('copyNotification');
            notification.classList.remove('hidden');
            setTimeout(() => {
                notification.classList.add('hidden');
            }, 2000);
        });
    }

    // ========================================
    // WAITING ROOM FUNCTIONS
    // ========================================

    updateWaitingRoom() {
        /**
         * Update waiting room UI with current players
         */
        // Reload from server to get latest room data
        this.loadGameState().then(() => {
            const room = this.currentRoom;
            if (!room) {
                return;
            }
            
            // Check if game has started - if so, auto-transition to game screen
            if (room.gameStarted) {
                console.log('Game started! Auto-transitioning to game screen');
                this.showGameScreen();
                this.updateGameUI();
                return;
            }

            // Show room ID
            document.getElementById('roomIdDisplay').textContent = room.roomId;

            // Update player list
            const playersList = document.getElementById('playersList');
            playersList.innerHTML = '';

            for (let player of room.players) {
                const playerItem = document.createElement('div');
                playerItem.className = 'player-item';
                if (player.isHost) {
                    playerItem.classList.add('host');
                }

                let html = `<span>${player.name}</span>`;
                if (player.isHost) {
                    html += '<span class="player-badge">HOST</span>';
                }
                playerItem.innerHTML = html;

                playersList.appendChild(playerItem);
            }

            // Update player count
            document.getElementById('playerCount').textContent = room.getPlayerCount();

            // Show start button only for host
            const startBtn = document.getElementById('hostStartBtn');
            if (room.players[this.currentPlayerId].isHost) {
                startBtn.classList.remove('hidden');
            } else {
                startBtn.classList.add('hidden');
            }

            // Show waiting message only for non-host
            const waitingMsg = document.getElementById('waitingMessage');
            if (room.players[this.currentPlayerId].isHost) {
                waitingMsg.classList.add('hidden');
            } else {
                waitingMsg.classList.remove('hidden');
            }
        });
    }

    // ========================================
    // GAME START FUNCTIONS
    // ========================================

    startGame() {
        /**
         * Start the game (host only)
         */
        const room = this.currentRoom;

        if (!room.players[this.currentPlayerId].isHost) {
            alert('Only the host can start the game');
            return;
        }

        if (!room.canStart()) {
            alert('Need at least 2 players to start');
            return;
        }

        // Deal cards
        room.dealCards();

        // Select random starting player
        room.selectRandomStartPlayer();

        // Mark game as started
        room.gameStarted = true;
        
        // Prepare game state for API
        const gameState = {
            cardsByPlayer: {},
            currentPlayerIndex: room.currentTurnIndex  // Send the randomly selected starting player
        };
        
        for (let player of room.players) {
            gameState.cardsByPlayer[player.playerId] = player.hand.map(card => ({
                id: card.id,
                color: card.color,
                symbol: card.getSymbol()
            }));
        }
        
        // Send to server
        fetch(`${API_URL}/rooms/${room.roomId}/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gameState })
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                alert('Error starting game: ' + data.error);
                return;
            }
            
            // Show game screen
            this.showGameScreen();
            this.updateGameUI();
        })
        .catch(e => {
            console.error('Error starting game:', e);
            alert('Error starting game');
        });
    }

    // ========================================
    // GAME PLAY FUNCTIONS
    // ========================================

    playCard(cardId) {
        /**
         * Current player selects a card to play (with debounce)
         */
        // Prevent double-clicks/multiple simultaneous plays
        if (this.isPlayingCard) {
            console.log('Already playing a card, please wait...');
            return;
        }

        // Debounce: prevent clicks within 500ms
        const now = Date.now();
        if (now - this.lastPlayTime < 500) {
            console.log('Click too fast, please wait...');
            return;
        }
        this.lastPlayTime = now;
        this.isPlayingCard = true;

        // Disable the card element immediately
        const cardElement = document.getElementById(`card-${cardId}`);
        if (cardElement) {
            cardElement.style.opacity = '0.5';
            cardElement.style.pointerEvents = 'none';
            cardElement.style.cursor = 'not-allowed';
        }

        const room = this.currentRoom;
        const currentPlayer = room.getCurrentPlayer();
        const nextPlayer = room.getNextPlayer();

        // Verify it's the current player
        if (currentPlayer.playerId !== this.currentPlayerId) {
            this.isPlayingCard = false;
            if (cardElement) {
                cardElement.style.opacity = '1';
                cardElement.style.pointerEvents = 'auto';
                cardElement.style.cursor = 'pointer';
            }
            alert('It is not your turn');
            return;
        }

        // Get card BEFORE passing it
        const card = currentPlayer.getCardById(cardId);
        if (!card) {
            this.isPlayingCard = false;
            if (cardElement) {
                cardElement.style.opacity = '1';
                cardElement.style.pointerEvents = 'auto';
                cardElement.style.cursor = 'pointer';
            }
            alert('Card not found');
            return;
        }

        // Start animation BEFORE modifying the game state
        this.animateCardMovement(card, currentPlayer.playerId, nextPlayer.playerId);

        // Calculate next player index
        const nextPlayerIndex = (room.currentTurnIndex + 1) % room.players.length;

        // Now pass card to next player (local state)
        room.passCard(currentPlayer.playerId, cardId, nextPlayer.playerId);

        // Move to next turn
        room.moveToNextPlayer();

        // Check for winner locally
        const winner = room.checkWinner();
        if (winner) {
            // Send to server and show winner
            fetch(`${API_URL}/rooms/${room.roomId}/play-card`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fromPlayerId: currentPlayer.playerId,
                    toPlayerId: nextPlayer.playerId,
                    cardId,
                    currentPlayerIndex: nextPlayerIndex
                })
            })
            .then(response => response.json())
            .then(data => {
                console.log('Card played, winner found');
                this.isPlayingCard = false;
                this.showWinnerScreen();
            })
            .catch(e => {
                console.error('Error playing card:', e);
                this.isPlayingCard = false;
            });
            return;
        }

        // Send card play to server
        fetch(`${API_URL}/rooms/${room.roomId}/play-card`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fromPlayerId: currentPlayer.playerId,
                toPlayerId: nextPlayer.playerId,
                cardId,
                currentPlayerIndex: nextPlayerIndex
            })
        })
        .then(response => response.json())
        .then(data => {
            console.log('Card played successfully');
            this.isPlayingCard = false;
            
            // Update UI after animation (1.6s for card animation)
            setTimeout(() => {
                this.loadGameState().then(() => {
                    this.updateGameUI();
                });
            }, 1600);
        })
        .catch(e => {
            console.error('Error playing card:', e);
            this.isPlayingCard = false;
            // Re-enable card on error
            if (cardElement) {
                cardElement.style.opacity = '1';
                cardElement.style.pointerEvents = 'auto';
                cardElement.style.cursor = 'pointer';
            }
            alert('Error playing card: ' + e.message);
        });
    }

    animateCardMovement(card, fromPlayerId, toPlayerId) {
        /**
         * Animate card sliding to center of table
         */
        const room = this.currentRoom;
        
        if (!card) {
            return;
        }
        
        // Create animated card element
        const animatedCard = document.createElement('div');
        animatedCard.className = `card ${card.color}`;
        animatedCard.textContent = card.getSymbol();
        
        // Explicit styling for flying card
        animatedCard.style.position = 'fixed';
        animatedCard.style.zIndex = '9999';
        animatedCard.style.width = '60px';
        animatedCard.style.height = '85px';
        animatedCard.style.pointerEvents = 'none';
        animatedCard.style.opacity = '1';
        
        let sourceElement = null;
        
        // If it's YOUR card being played, look in the your-hand section
        if (fromPlayerId === this.currentPlayerId) {
            const YourHandSection = document.getElementById('yourHand');
            if (YourHandSection) {
                // Find the card element by its data attribute or by matching the card symbol
                const cardElements = YourHandSection.querySelectorAll('.card');
                for (let element of cardElements) {
                    if (element.textContent.trim() === card.getSymbol() && element.classList.contains(card.color)) {
                        sourceElement = element;
                        break;
                    }
                }
            }
        } else {
            // For opponent cards, use the diamond position
            const playerPosMap = ['bottom', 'left', 'top', 'right'];
            const visualPosition = (fromPlayerId - this.currentPlayerId + room.players.length) % room.players.length;
            const sourcePosId = `playerPos-${playerPosMap[visualPosition]}`;
            sourceElement = document.getElementById(sourcePosId);
        }
        
        // Get center table position
        const tableElement = document.querySelector('.table');
        
        if (sourceElement && tableElement) {
            const sourceRect = sourceElement.getBoundingClientRect();
            const tableRect = tableElement.getBoundingClientRect();
            
            // Start position (player position)
            const startX = sourceRect.left + sourceRect.width / 2;
            const startY = sourceRect.top + sourceRect.height / 2;
            
            // End position (table center)
            const endX = tableRect.left + tableRect.width / 2;
            const endY = tableRect.top + tableRect.height / 2;
            
            // Set initial position
            animatedCard.style.left = startX + 'px';
            animatedCard.style.top = startY + 'px';
            animatedCard.style.transform = 'translate(-50%, -50%) scale(1)';
            
            // Add to DOM
            document.body.appendChild(animatedCard);
            
            // Force reflow to ensure initial state is applied
            animatedCard.offsetHeight;
            
            // Trigger animation
            animatedCard.style.transition = 'all 1.5s ease-in-out';
            animatedCard.style.left = endX + 'px';
            animatedCard.style.top = endY + 'px';
            animatedCard.style.transform = 'translate(-50%, -50%) scale(0.8)';
            animatedCard.style.opacity = '0.7';
            
            // Remove after animation
            setTimeout(() => {
                animatedCard.remove();
            }, 1600);
        }
    }

    // ========================================
    // UI UPDATE FUNCTIONS
    // ========================================

    async updateGameUI() {
        /**
         * Update all game UI elements (just UI, don't check for winner here)
         */
        // Reload from server to get latest game state
        await this.loadGameState();
        
        const room = this.currentRoom;
        if (!room) {
            return;
        }

        // If state already indicates game ended & winner, show immediately
        if (room.gameEnded && room.winner) {
            this.showWinnerScreen();
            return;
        }

        const currentPlayer = room.getCurrentPlayer();
        const myPlayer = room.players[this.currentPlayerId];

        // Update room title
        document.getElementById('roomTitle').textContent = `Room: ${room.roomId}`;

        // Update current turn
        document.getElementById('currentPlayerTurn').textContent = 
            `Current Turn: ${currentPlayer.name}`;

        // Update your hand
        this.updateYourHand(myPlayer);

        // Update other players
        this.updateOtherPlayers(room);

        // Update game message
        let message = '';
        if (currentPlayer.playerId === this.currentPlayerId) {
            message = 'Your turn! Choose a card to pass.';
        } else {
            message = `Waiting for ${currentPlayer.name}...`;
        }
        document.getElementById('gameMessage').textContent = message;
    }

    updateYourHand(player) {
        /**
         * Update the display of your hand
         */
        const handContainer = document.getElementById('yourHand');
        handContainer.innerHTML = '';

        for (let card of player.hand) {
            const cardElement = this.createCardElement(card);
            handContainer.appendChild(cardElement);
        }
    }

    updateOtherPlayers(room) {
        /**
         * Update display of other players' cards (hidden) in diamond layout
         * Each player sees themselves at bottom, others arranged around them
         */
        const positionNames = ['bottom', 'left', 'top', 'right'];
        const totalPlayers = room.players.length;
        
        // Hide all player slots first
        for (let pos of positionNames) {
            document.getElementById(`playerPos-${pos}`).classList.add('hidden');
        }
        
        // Position each other player
        for (let player of room.players) {
            if (player.playerId === this.currentPlayerId) {
                // This is you - shown in your hand section, not in player slots
                continue;
            }
            
            // Calculate visual position relative to current player
            const visualPosition = (player.playerId - this.currentPlayerId + totalPlayers) % totalPlayers;
            const positionName = positionNames[visualPosition];
            
            const playerSlot = document.getElementById(`playerPos-${positionName}`);
            
            // Show this player
            playerSlot.classList.remove('hidden');
            
            // Set player name
            document.getElementById(`playerPos-${positionName}-name`).textContent = player.name;
            
            // Show hidden cards
            const cardsContainer = document.getElementById(`playerPos-${positionName}-cards`);
            cardsContainer.innerHTML = '';
            
            for (let j = 0; j < player.hand.length; j++) {
                const cardBack = document.createElement('div');
                cardBack.className = 'card-back';
                cardBack.textContent = '?';
                cardsContainer.appendChild(cardBack);
            }
            
            // Highlight if it's their turn
            if (player.playerId === room.currentTurnIndex) {
                playerSlot.classList.add('active-turn');
            } else {
                playerSlot.classList.remove('active-turn');
            }
        }
    }

    // ========================================
    // TOUCH & SWIPE GESTURE HANDLING
    // ========================================

    detectSwipe(touchStart, touchEnd) {
        /**
         * Detect swipe direction and distance
         * Returns: { direction: 'up', 'down', 'left', 'right', 'none', distance: pixels }
         */
        const xDiff = touchEnd.clientX - touchStart.clientX;
        const yDiff = touchEnd.clientY - touchStart.clientY;
        const distance = Math.sqrt(xDiff * xDiff + yDiff * yDiff);
        const moveThreshold = 30; // Minimum pixels to register swipe

        if (distance < moveThreshold) {
            return { direction: 'tap', distance };
        }

        const isVertical = Math.abs(yDiff) > Math.abs(xDiff);

        if (isVertical) {
            return { direction: yDiff < 0 ? 'up' : 'down', distance };
        } else {
            return { direction: xDiff < 0 ? 'left' : 'right', distance };
        }
    }

    createCardElement(card) {
        /**
         * Create a clickable card element with touch and click support
         */
        const cardElement = document.createElement('div');
        cardElement.className = `card ${card.color}`;
        cardElement.id = `card-${card.id}`;
        cardElement.textContent = card.getSymbol();
        cardElement.style.touchAction = 'manipulation';

        // Store touch start position for swipe detection
        let touchStartPos = null;
        let touchHandled = false;

        // Touch handlers for tap/swipe detection
        cardElement.addEventListener('touchstart', (e) => {
            touchStartPos = {
                clientX: e.touches[0].clientX,
                clientY: e.touches[0].clientY
            };
            touchHandled = false;
        }, { passive: true });

        cardElement.addEventListener('touchend', (e) => {
            if (!touchStartPos || touchHandled) return;

            const touchEnd = {
                clientX: e.changedTouches[0].clientX,
                clientY: e.changedTouches[0].clientY
            };

            const swipe = this.detectSwipe(touchStartPos, touchEnd);
            
            // Play card on tap or any swipe
            touchHandled = true;
            e.preventDefault();
            this.playCard(card.id);
            
            touchStartPos = null;
        }, { passive: false });

        // Click handler for desktop fallback (single-use, won't double-fire from touch)
        cardElement.addEventListener('click', (e) => {
            // Prevent click from firing if touch already handled it
            if (touchHandled) return;
            this.playCard(card.id);
        }, { passive: true });

        // Disable if not your turn
        const room = this.currentRoom;
        const currentPlayer = room.getCurrentPlayer();
        if (currentPlayer.playerId !== this.currentPlayerId) {
            cardElement.classList.add('disabled');
            cardElement.style.pointerEvents = 'none';
            cardElement.style.opacity = '0.5';
        }

        return cardElement;
    }

    // ========================================
    // SCREEN MANAGEMENT
    // ========================================

    showWaitingRoom() {
        /**
         * Hide all screens, show waiting room
         */
        document.getElementById('lobbyScreen').classList.remove('active');
        document.getElementById('gameScreen').classList.remove('active');
        document.getElementById('gameScreen').classList.add('hidden');
        document.getElementById('waitingRoomScreen').classList.remove('hidden');
        document.getElementById('waitingRoomScreen').classList.add('active');
    }

    showGameScreen() {
        /**
         * Hide all screens, show game screen
         */
        document.getElementById('lobbyScreen').classList.remove('active');
        document.getElementById('waitingRoomScreen').classList.remove('active');
        document.getElementById('waitingRoomScreen').classList.add('hidden');
        document.getElementById('gameScreen').classList.remove('hidden');
        document.getElementById('gameScreen').classList.add('active');
    }

    showWinnerScreen() {
        /**
         * Display the winner screen
         */
        const winner = this.currentRoom.winner;

        document.getElementById('winnerName').textContent = winner.name;

        // Set color
        const colorElement = document.getElementById('winningColor');
        colorElement.style.backgroundColor = this.getColorValue(winner.color);
        colorElement.className = `winning-color ${winner.color}`;

        // Show winning cards
        const winningPlayer = this.currentRoom.players.find(p => p.playerId === winner.playerId);
        const winningCards = winningPlayer.getCardsByColor()[winner.color];

        const winningCardsContainer = document.getElementById('winningCards');
        winningCardsContainer.innerHTML = '';

        for (let card of winningCards) {
            const cardElement = this.createCardElement(card);
            winningCardsContainer.appendChild(cardElement);
        }

        // Show winner screen
        document.getElementById('gameScreen').classList.remove('active');
        document.getElementById('gameScreen').classList.add('hidden');
        document.getElementById('winnerScreen').classList.remove('hidden');
        document.getElementById('winnerScreen').classList.add('active');
    }

    getColorValue(color) {
        /**
         * Get CSS color value for a card color
         */
        const colorMap = {
            red: '#ef4444',
            green: '#22c55e',
            orange: '#f97316',
            blue: '#3b82f6'
        };
        return colorMap[color] || '#666';
    }

    // ========================================
    // LEAVE GAME
    // ========================================

    leaveGame() {
        /**
         * Leave the current game/room
         */
        if (confirm('Are you sure you want to leave?')) {
            // Delete room on server
            const roomId = this.currentRoom.roomId;
            fetch(`${API_URL}/rooms/${roomId}`, {
                method: 'DELETE'
            }).catch(e => console.error('Error deleting room:', e));

            this.currentRoom = null;
            this.currentPlayerId = null;
            this.currentPlayerName = null;

            // Reset inputs
            document.getElementById('playerNameInput').value = '';
            document.getElementById('roomIdInput').value = '';

            // Show lobby
            document.getElementById('lobbyScreen').classList.add('active');
            document.getElementById('waitingRoomScreen').classList.remove('active');
            document.getElementById('waitingRoomScreen').classList.add('hidden');
            document.getElementById('gameScreen').classList.remove('active');
            document.getElementById('gameScreen').classList.add('hidden');
            document.getElementById('winnerScreen').classList.remove('active');
            document.getElementById('winnerScreen').classList.add('hidden');
        }
    }

    backToLobby() {
        /**
         * Return to lobby from winner screen
         */
        // Delete room on server
        const roomId = this.currentRoom.roomId;
        fetch(`${API_URL}/rooms/${roomId}`, {
            method: 'DELETE'
        }).catch(e => console.error('Error deleting room:', e));

        this.currentRoom = null;
        this.currentPlayerId = null;
        this.currentPlayerName = null;

        // Reset inputs
        document.getElementById('playerNameInput').value = '';
        document.getElementById('roomIdInput').value = '';

        // Show lobby
        document.getElementById('lobbyScreen').classList.add('active');
        document.getElementById('winnerScreen').classList.remove('active');
        document.getElementById('winnerScreen').classList.add('hidden');
    }
}

// ========================================
// INITIALIZE GAME
// ========================================

const game = new GameManager();
