require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Fix COOP error
app.use((req, res, next) => {
  res.header('Cross-Origin-Opener-Policy', 'unsafe-none');
  res.header('Cross-Origin-Embedder-Policy', 'unsafe-none');
  next();
});

console.log('🚀 Starting Simple Walkie-Talkie Server...');

// In-memory storage for rooms
const rooms = new Map(); // roomId -> { users: [], creator: socketId }

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('🔌 User connected:', socket.id);

  // Create a new room
  socket.on('create-room', () => {
    const roomId = generateRoomId();
    rooms.set(roomId, {
      users: [socket.id],
      creator: socket.id,
      createdAt: new Date().toISOString()
    });
    
    socket.join(roomId);
    socket.emit('room-created', { roomId });
    console.log(`🎪 Room created: ${roomId} by ${socket.id}`);
  });

  // Join an existing room
  socket.on('join-room', (roomId) => {
    const room = rooms.get(roomId);
    
    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    if (room.users.length >= 10) { // Limit room size
      socket.emit('error', { message: 'Room is full' });
      return;
    }

    room.users.push(socket.id);
    socket.join(roomId);
    
    // Notify others in the room
    socket.to(roomId).emit('user-joined', { userId: socket.id });
    socket.emit('room-joined', { 
      roomId, 
      users: room.users.filter(id => id !== socket.id),
      isCreator: room.creator === socket.id
    });
    
    console.log(`👥 User ${socket.id} joined room ${roomId}`);
  });

  // Handle audio transmission
  socket.on('audio', (data) => {
    const { roomId, audioData } = data;
    
    // Broadcast to everyone in the room except sender
    socket.to(roomId).emit('audio', {
      from: socket.id,
      audioData: audioData
    });
    
    console.log(`🎤 Audio in room ${roomId} from ${socket.id}`);
  });

  // Handle user leaving
  socket.on('leave-room', (roomId) => {
    socket.leave(roomId);
    const room = rooms.get(roomId);
    if (room) {
      room.users = room.users.filter(id => id !== socket.id);
      
      // Notify others
      socket.to(roomId).emit('user-left', { userId: socket.id });
      
      // Clean up empty rooms
      if (room.users.length === 0) {
        rooms.delete(roomId);
        console.log(`🗑️ Room ${roomId} deleted (empty)`);
      }
    }
    console.log(`👋 User ${socket.id} left room ${roomId}`);
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('🔌 User disconnected:', socket.id);
    
    // Remove user from all rooms
    for (const [roomId, room] of rooms.entries()) {
      if (room.users.includes(socket.id)) {
        room.users = room.users.filter(id => id !== socket.id);
        socket.to(roomId).emit('user-left', { userId: socket.id });
        
        // Clean up empty rooms
        if (room.users.length === 0) {
          rooms.delete(roomId);
          console.log(`🗑️ Room ${roomId} deleted (empty)`);
        }
      }
    }
  });
});

// Generate random room ID
function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// API Routes
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    rooms: rooms.size,
    timestamp: new Date().toISOString()
  });
});

app.get('/api/room/:roomId/exists', (req, res) => {
  const roomId = req.params.roomId;
  const room = rooms.get(roomId);
  
  res.json({ 
    exists: !!room,
    users: room ? room.users.length : 0
  });
});

// Serve simple frontend
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Simple Walkie Talkie</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        button { padding: 10px 20px; margin: 10px; font-size: 16px; }
        input { padding: 10px; font-size: 16px; margin: 10px; }
      </style>
    </head>
    <body>
      <h1>🎤 Simple Walkie Talkie</h1>
      <div id="app">
        <button onclick="createRoom()">Create New Room</button>
        <div>
          <input type="text" id="roomId" placeholder="Enter Room ID">
          <button onclick="joinRoom()">Join Room</button>
        </div>
        <div id="status"></div>
      </div>
      <script src="/socket.io/socket.io.js"></script>
      <script>
        const socket = io();
        let currentRoom = null;
        
        function createRoom() {
          socket.emit('create-room');
        }
        
        function joinRoom() {
          const roomId = document.getElementById('roomId').value;
          if (roomId) {
            socket.emit('join-room', roomId);
          }
        }
        
        socket.on('room-created', (data) => {
          currentRoom = data.roomId;
          document.getElementById('status').innerHTML = 
            '<h3>Room Created: ' + data.roomId + '</h3>' +
            '<p>Share this link: <a href="' + window.location.href + '?room=' + data.roomId + '">' + 
            window.location.href + '?room=' + data.roomId + '</a></p>';
        });
        
        socket.on('room-joined', (data) => {
          currentRoom = data.roomId;
          document.getElementById('status').innerHTML = 
            '<h3>Joined Room: ' + data.roomId + '</h3>' +
            '<p>Users in room: ' + (data.users.length + 1) + '</p>';
        });
        
        socket.on('error', (data) => {
          alert('Error: ' + data.message);
        });
      </script>
    </body>
    </html>
  `);
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`\n✅ Server running on port ${PORT}`);
  console.log(`🔗 http://localhost:${PORT}`);
  console.log(`🎤 Simple room-based walkie talkie ready!`);
});
