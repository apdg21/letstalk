const express = require('express');
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
app.use(express.json());
app.use(express.static('public')); // Serve static files from public folder

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Cross-Origin-Opener-Policy', 'unsafe-none');
  res.header('Cross-Origin-Embedder-Policy', 'unsafe-none');
  next();
});

console.log('🚀 Starting Real Voice Call Server...');

// In-memory storage for rooms and user names
const rooms = new Map();
const userNames = new Map();

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('🔌 User connected:', socket.id);

  socket.on('create-room', (data) => {
    const { userName } = data;
    const roomId = generateRoomId();
    
    userNames.set(socket.id, userName || 'Anonymous');
    rooms.set(roomId, {
      users: [socket.id],
      creator: socket.id,
      createdAt: new Date().toISOString()
    });
    
    socket.join(roomId);
    socket.emit('room-created', { 
      roomId,
      userName: userNames.get(socket.id)
    });
    console.log(`🎪 Room created: ${roomId} by ${userNames.get(socket.id)}`);
  });

  socket.on('join-room', (data) => {
    const { roomId, userName } = data;
    const room = rooms.get(roomId);
    
    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    if (room.users.length >= 10) {
      socket.emit('error', { message: 'Room is full' });
      return;
    }

    userNames.set(socket.id, userName || 'Anonymous');
    room.users.push(socket.id);
    socket.join(roomId);
    
    const userNamesInRoom = room.users.map(userId => ({
      id: userId,
      name: userNames.get(userId)
    }));
    
    console.log(`👥 ${userNames.get(socket.id)} joining room ${roomId}. Current users:`, userNamesInRoom.map(u => u.name));

    // Send room info to the joining user FIRST (includes ALL users)
    socket.emit('room-joined', { 
      roomId, 
      users: userNamesInRoom,
      userName: userNames.get(socket.id),
      isCreator: room.creator === socket.id
    });
    
    // THEN notify others about the new user
    socket.to(roomId).emit('user-joined', { 
      userId: socket.id,
      userName: userNames.get(socket.id)
    });
    
    console.log(`👥 ${userNames.get(socket.id)} joined room ${roomId}`);
  });

  // WebRTC signaling events
  socket.on('webrtc-offer', (data) => {
    const { to, sdp } = data;
    console.log(`📤 WebRTC offer from ${socket.id} to ${to}`);
    socket.to(to).emit('webrtc-offer', {
      from: socket.id,
      sdp: sdp
    });
  });

  socket.on('webrtc-answer', (data) => {
    const { to, sdp } = data;
    console.log(`📥 WebRTC answer from ${socket.id} to ${to}`);
    socket.to(to).emit('webrtc-answer', {
      from: socket.id,
      sdp: sdp
    });
  });

  socket.on('webrtc-ice-candidate', (data) => {
    const { to, candidate } = data;
    socket.to(to).emit('webrtc-ice-candidate', {
      from: socket.id,
      candidate: candidate
    });
  });

  socket.on('leave-room', (roomId) => {
    console.log(`🚪 User ${socket.id} leaving room ${roomId}`);
    socket.leave(roomId);
    const room = rooms.get(roomId);
    if (room) {
      room.users = room.users.filter(id => id !== socket.id);
      socket.to(roomId).emit('user-left', { 
        userId: socket.id,
        userName: userNames.get(socket.id)
      });
      
      if (room.users.length === 0) {
        rooms.delete(roomId);
        console.log(`🗑️ Room ${roomId} deleted (empty)`);
      }
    }
    
    userNames.delete(socket.id);
  });

  socket.on('disconnect', () => {
    const userName = userNames.get(socket.id);
    console.log('🔌 User disconnected:', userName || socket.id);
    
    for (const [roomId, room] of rooms.entries()) {
      if (room.users.includes(socket.id)) {
        room.users = room.users.filter(id => id !== socket.id);
        socket.to(roomId).emit('user-left', { 
          userId: socket.id,
          userName: userName
        });
        
        if (room.users.length === 0) {
          rooms.delete(roomId);
          console.log(`🗑️ Room ${roomId} deleted (empty due to disconnect)`);
        }
      }
    }
    
    userNames.delete(socket.id);
  });
});

function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    rooms: rooms.size,
    totalUsers: Array.from(rooms.values()).reduce((sum, room) => sum + room.users.length, 0),
    timestamp: new Date().toISOString()
  });
});

// Serve the WebRTC version as main page
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// Handle 404
app.use('*', (req, res) => {
  res.redirect('/');
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`
✅ Server running on port ${PORT}
🔗 http://localhost:${PORT}
🎤 Real Voice Call with WebRTC
=========================================
`);
});
