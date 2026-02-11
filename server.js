const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
// Use environment-configurable port and DB path for deployment platforms (Render)
const PORT = process.env.PORT || 8000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'game.db');

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Log all requests
app.use((req, res, next) => {
    console.log(`📍 ${req.method} ${req.path}`);
    next();
});

app.use(express.static(path.join(__dirname)));

// Ensure DB directory exists when a custom path is used
try {
    const dbDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }
} catch (e) {
    console.warn('Could not ensure DB directory exists:', e.message);
}

// Initialize SQLite Database (path configurable)
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) console.error('Database connection error:', err);
    else console.log('Connected to SQLite database at', DB_PATH);
    initializeDatabase();
});

// Initialize database schema
function initializeDatabase() {
    db.serialize(() => {
        // Rooms table
        db.run(`
            CREATE TABLE IF NOT EXISTS rooms (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                roomId TEXT UNIQUE NOT NULL,
                gameStarted BOOLEAN DEFAULT 0,
                gameEnded BOOLEAN DEFAULT 0,
                currentPlayerIndex INTEGER DEFAULT 0,
                winnerId INTEGER,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Players table
        db.run(`
            CREATE TABLE IF NOT EXISTS players (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                roomId TEXT NOT NULL,
                playerId INTEGER NOT NULL,
                name TEXT NOT NULL,
                isHost BOOLEAN DEFAULT 0,
                FOREIGN KEY(roomId) REFERENCES rooms(roomId),
                UNIQUE(roomId, playerId)
            )
        `);

        // Cards table
        db.run(`
            CREATE TABLE IF NOT EXISTS cards (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                roomId TEXT NOT NULL,
                playerId INTEGER NOT NULL,
                cardId TEXT NOT NULL,
                color TEXT NOT NULL,
                symbol TEXT NOT NULL,
                FOREIGN KEY(roomId) REFERENCES rooms(roomId)
            )
        `);
    });
}

// ========================================
// API ENDPOINTS
// ========================================

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Server is running' });
});

// Create a new room
app.post('/api/rooms', (req, res) => {
    const { playerName } = req.body;
    console.log('📨 POST /api/rooms - Creating room for player:', playerName);
    
    const roomId = generateRoomId();
    
    db.run(
        'INSERT INTO rooms (roomId) VALUES (?)',
        [roomId],
        function(err) {
            if (err) {
                console.error('❌ Error inserting room:', err);
                return res.status(500).json({ error: 'Failed to create room: ' + err.message });
            }
            
            // Add host player
            db.run(
                'INSERT INTO players (roomId, playerId, name, isHost) VALUES (?, ?, ?, ?)',
                [roomId, 0, playerName, 1],
                (err) => {
                    if (err) {
                        console.error('❌ Error adding player:', err);
                        return res.status(500).json({ error: 'Failed to add player' });
                    }
                    console.log('✅ Room created:', roomId);
                    res.json({ success: true, roomId });
                }
            );
        }
    );
});

// Get room details
app.get('/api/rooms/:roomId', (req, res) => {
    const { roomId } = req.params;
    
    db.get('SELECT * FROM rooms WHERE roomId = ?', [roomId], (err, room) => {
        if (err || !room) {
            return res.status(404).json({ error: 'Room not found' });
        }
        
        db.all(
            'SELECT * FROM players WHERE roomId = ?',
            [roomId],
            (err, players) => {
                if (err) {
                    return res.status(500).json({ error: 'Failed to fetch players' });
                }
                res.json({ room, players });
            }
        );
    });
});

// Join a room
app.post('/api/rooms/:roomId/join', (req, res) => {
    const { roomId } = req.params;
    const { playerName } = req.body;
    
    db.get('SELECT * FROM rooms WHERE roomId = ?', [roomId], (err, room) => {
        if (err || !room) {
            return res.status(404).json({ error: 'Room not found' });
        }
        
        db.all('SELECT * FROM players WHERE roomId = ?', [roomId], (err, players) => {
            if (err) {
                return res.status(500).json({ error: 'Failed to fetch players' });
            }
            
            if (players.length >= 4) {
                return res.status(400).json({ error: 'Room is full' });
            }
            
            const playerId = players.length;
            
            db.run(
                'INSERT INTO players (roomId, playerId, name, isHost) VALUES (?, ?, ?, ?)',
                [roomId, playerId, playerName, 0],
                (err) => {
                    if (err) {
                        return res.status(500).json({ error: 'Failed to join room' });
                    }
                    res.json({ success: true, playerId });
                }
            );
        });
    });
});

// Start game
app.post('/api/rooms/:roomId/start', (req, res) => {
    const { roomId } = req.params;
    const { gameState } = req.body;
    
    // Update game as started and set the random starting player
    db.run(
        'UPDATE rooms SET gameStarted = 1, currentPlayerIndex = ? WHERE roomId = ?',
        [gameState.currentPlayerIndex || 0, roomId],
        (err) => {
            if (err) {
                return res.status(500).json({ error: 'Failed to start game' });
            }
            
            // Save all players' cards
            saveGameState(roomId, gameState, (err) => {
                if (err) {
                    return res.status(500).json({ error: 'Failed to save game state' });
                }
                res.json({ success: true });
            });
        }
    );
});

// Get game state
app.get('/api/rooms/:roomId/state', (req, res) => {
    const { roomId } = req.params;
    
    db.get('SELECT * FROM rooms WHERE roomId = ?', [roomId], (err, room) => {
        if (err || !room) {
            return res.status(404).json({ error: 'Room not found' });
        }
        
        db.all('SELECT * FROM players WHERE roomId = ?', [roomId], (err, players) => {
            if (err) {
                return res.status(500).json({ error: 'Failed to fetch players' });
            }
            
            // Fetch cards for each player
            getGameCards(roomId, (err, cardsByPlayer) => {
                if (err) {
                    return res.status(500).json({ error: 'Failed to fetch cards' });
                }
                
                res.json({
                    room,
                    players,
                    cardsByPlayer
                });
            });
        });
    });
});

// Play card (move card between players)
app.post('/api/rooms/:roomId/play-card', (req, res) => {
    const { roomId } = req.params;
    const { fromPlayerId, toPlayerId, cardId, currentPlayerIndex } = req.body;
    
    // Move card
    db.run(
        'UPDATE cards SET playerId = ? WHERE roomId = ? AND playerId = ? AND cardId = ?',
        [toPlayerId, roomId, fromPlayerId, cardId],
        (err) => {
            if (err) {
                return res.status(500).json({ error: 'Failed to play card' });
            }
            
            // Update current player
            db.run(
                'UPDATE rooms SET currentPlayerIndex = ? WHERE roomId = ?',
                [currentPlayerIndex, roomId],
                (err) => {
                    if (err) {
                        return res.status(500).json({ error: 'Failed to update turn' });
                    }
                    res.json({ success: true });
                }
            );
        }
    );
});

// Check winner
app.get('/api/rooms/:roomId/check-winner', (req, res) => {
    const { roomId } = req.params;
    
    getGameCards(roomId, (err, cardsByPlayer) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to fetch cards' });
        }
        
        // Check each player for winning color
        for (let playerId in cardsByPlayer) {
            const cards = cardsByPlayer[playerId];
            const colorCounts = {};
            
            cards.forEach(card => {
                colorCounts[card.color] = (colorCounts[card.color] || 0) + 1;
            });
            
            for (let color in colorCounts) {
                if (colorCounts[color] >= 4) {
                    // We have a winner
                    db.run(
                        'UPDATE rooms SET gameEnded = 1, winnerId = ? WHERE roomId = ?',
                        [playerId, roomId],
                        (err) => {
                            if (err) {
                                return res.status(500).json({ error: 'Failed to update winner' });
                            }
                            
                            db.get(
                                'SELECT * FROM players WHERE roomId = ? AND playerId = ?',
                                [roomId, playerId],
                                (err, player) => {
                                    if (err) {
                                        return res.status(500).json({ error: 'Failed to get winner' });
                                    }
                                    res.json({ winner: player, color });
                                }
                            );
                        }
                    );
                    return;
                }
            }
        }
        
        res.json({ winner: null });
    });
});

// Delete room
app.delete('/api/rooms/:roomId', (req, res) => {
    const { roomId } = req.params;
    
    db.run('DELETE FROM cards WHERE roomId = ?', [roomId], (err) => {
        if (err) console.error(err);
        
        db.run('DELETE FROM players WHERE roomId = ?', [roomId], (err) => {
            if (err) console.error(err);
            
            db.run('DELETE FROM rooms WHERE roomId = ?', [roomId], (err) => {
                if (err) {
                    return res.status(500).json({ error: 'Failed to delete room' });
                }
                res.json({ success: true });
            });
        });
    });
});

// ========================================
// HELPER FUNCTIONS
// ========================================

function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function saveGameState(roomId, gameState, callback) {
    // Clear existing cards
    db.run('DELETE FROM cards WHERE roomId = ?', [roomId], (err) => {
        if (err) return callback(err);
        
        // Insert new cards
        let completedInserts = 0;
        let totalInserts = 0;
        
        // Count total inserts needed
        for (let playerId in gameState.cardsByPlayer) {
            totalInserts += gameState.cardsByPlayer[playerId].length;
        }
        
        if (totalInserts === 0) {
            return callback(null);
        }
        
        for (let playerId in gameState.cardsByPlayer) {
            const cards = gameState.cardsByPlayer[playerId];
            
            cards.forEach(card => {
                db.run(
                    'INSERT INTO cards (roomId, playerId, cardId, color, symbol) VALUES (?, ?, ?, ?, ?)',
                    [roomId, playerId, card.id, card.color, card.symbol],
                    (err) => {
                        completedInserts++;
                        if (completedInserts === totalInserts) {
                            callback(null);
                        }
                    }
                );
            });
        }
    });
}

function getGameCards(roomId, callback) {
    db.all(
        'SELECT * FROM cards WHERE roomId = ? ORDER BY playerId',
        [roomId],
        (err, rows) => {
            if (err) return callback(err);
            
            const cardsByPlayer = {};
            rows.forEach(row => {
                if (!cardsByPlayer[row.playerId]) {
                    cardsByPlayer[row.playerId] = [];
                }
                cardsByPlayer[row.playerId].push({
                    id: row.cardId,
                    color: row.color,
                    symbol: row.symbol
                });
            });
            
            callback(null, cardsByPlayer);
        }
    );
}

// Start server
app.listen(PORT, () => {
    console.log(`✅ Server running at http://0.0.0.0:${PORT}`);
    console.log(`✅ Static game files served from ${__dirname}`);
    console.log(`✅ Database file: ${DB_PATH}`);
})
.on('error', (err) => {
    console.error('Server error:', err);
    process.exit(1);
});
