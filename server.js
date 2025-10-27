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
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Cross-Origin-Opener-Policy', 'unsafe-none');
  res.header('Cross-Origin-Embedder-Policy', 'unsafe-none');
  res.header('Cross-Origin-Resource-Policy', 'cross-origin');
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
    totalUsers: Array.from(rooms.values()).reduce((sum, room) => sum + room.users.length, 0),
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
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        
        .container {
          background: white;
          padding: 40px;
          border-radius: 20px;
          box-shadow: 0 20px 40px rgba(0,0,0,0.1);
          max-width: 500px;
          width: 100%;
          text-align: center;
        }
        
        h1 {
          color: #333;
          margin-bottom: 10px;
          background: linear-gradient(135deg, #667eea, #764ba2);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        
        .subtitle {
          color: #666;
          margin-bottom: 30px;
        }
        
        .button-group {
          display: flex;
          flex-direction: column;
          gap: 15px;
          margin-bottom: 30px;
        }
        
        button {
          padding: 15px 30px;
          border: none;
          border-radius: 10px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s;
        }
        
        .create-btn {
          background: linear-gradient(135deg, #667eea, #764ba2);
          color: white;
        }
        
        .create-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(102, 126, 234, 0.3);
        }
        
        .join-section {
          display: flex;
          gap: 10px;
        }
        
        input {
          flex: 1;
          padding: 15px;
          border: 2px solid #ddd;
          border-radius: 10px;
          font-size: 16px;
          outline: none;
        }
        
        input:focus {
          border-color: #667eea;
        }
        
        .join-btn {
          background: #2ecc71;
          color: white;
        }
        
        .join-btn:hover {
          background: #27ae60;
        }
        
        .room-info {
          background: #f8f9fa;
          padding: 20px;
          border-radius: 10px;
          margin-top: 20px;
          display: none;
        }
        
        .controls {
          margin-top: 20px;
          display: none;
        }
        
        .talk-btn {
          background: #e74c3c;
          color: white;
          padding: 25px;
          font-size: 20px;
          border-radius: 50px;
          min-height: 100px;
          width: 100%;
          border: none;
          cursor: pointer;
          transition: all 0.3s;
          font-weight: bold;
        }
        
        .talk-btn.talking {
          background: #c0392b;
          transform: scale(1.05);
          box-shadow: 0 0 30px rgba(192, 57, 43, 0.6);
          animation: pulse 1.5s infinite;
        }
        
        @keyframes pulse {
          0% { box-shadow: 0 0 0 0 rgba(192, 57, 43, 0.7); }
          70% { box-shadow: 0 0 0 20px rgba(192, 57, 43, 0); }
          100% { box-shadow: 0 0 0 0 rgba(192, 57, 43, 0); }
        }
        
        .user-count {
          font-weight: bold;
          color: #667eea;
        }
        
        .audio-tips {
          margin-top: 15px;
          padding: 10px;
          background: #e8f4fd;
          border-radius: 8px;
          font-size: 14px;
          color: #0066cc;
        }
        
        .status-indicator {
          margin-top: 10px;
          padding: 8px 15px;
          border-radius: 20px;
          font-size: 14px;
          font-weight: 600;
        }
        
        .status-listening {
          background: #d4edda;
          color: #155724;
          border: 1px solid #c3e6cb;
        }
        
        .status-talking {
          background: #f8d7da;
          color: #721c24;
          border: 1px solid #f5c6cb;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🎤 Simple Walkie Talkie</h1>
        <p class="subtitle">Create a room and share the link with friends</p>
        
        <div class="button-group" id="setup">
          <button class="create-btn" onclick="createRoom()">Create New Room</button>
          <div class="join-section">
            <input type="text" id="roomInput" placeholder="Enter Room ID">
            <button class="join-btn" onclick="joinRoom()">Join Room</button>
          </div>
        </div>
        
        <div class="room-info" id="roomInfo">
          <h3>Room: <span id="roomIdDisplay"></span></h3>
          <p>Share this link: <br><a id="roomLink" href="#" target="_blank"></a></p>
          <p>Users connected: <span class="user-count" id="userCount">1</span></p>
          <div class="audio-tips">
            🔊 Audio will play through speaker (like a real walkie-talkie)
          </div>
        </div>
        
        <div class="controls" id="controls">
          <div class="status-indicator" id="statusIndicator">
            <span id="statusText">Ready to talk</span>
          </div>
          
          <button class="talk-btn" id="talkButton" onclick="toggleTalking()">
            🎤 Click to Start Talking
          </button>
          
          <div class="audio-tips">
            💡 Click once to start talking, click again to stop
          </div>
        </div>
      </div>

      <script src="/socket.io/socket.io.js"></script>
      <script>
        const socket = io();
        let currentRoom = null;
        let mediaRecorder = null;
        let audioChunks = [];
        let isTalking = false;
        let mediaStream = null;

        // Check for room ID in URL
        const urlParams = new URLSearchParams(window.location.search);
        const roomFromUrl = urlParams.get('room');
        if (roomFromUrl) {
          document.getElementById('roomInput').value = roomFromUrl;
          joinRoom();
        }

        function createRoom() {
          socket.emit('create-room');
        }

        function joinRoom() {
          const roomId = document.getElementById('roomInput').value.trim();
          if (roomId) {
            socket.emit('join-room', roomId);
          } else {
            alert('Please enter a room ID');
          }
        }

        async function toggleTalking() {
          if (!isTalking) {
            // Start talking
            await startContinuousRecording();
            document.getElementById('talkButton').classList.add('talking');
            document.getElementById('talkButton').textContent = '🛑 Click to Stop Talking';
            document.getElementById('statusText').textContent = '🎤 TRANSMITTING...';
            document.getElementById('statusIndicator').className = 'status-indicator status-talking';
            isTalking = true;
          } else {
            // Stop talking
            stopContinuousRecording();
            document.getElementById('talkButton').classList.remove('talking');
            document.getElementById('talkButton').textContent = '🎤 Click to Start Talking';
            document.getElementById('statusText').textContent = '👂 Listening...';
            document.getElementById('statusIndicator').className = 'status-indicator status-listening';
            isTalking = false;
          }
        }

        async function startContinuousRecording() {
          try {
            mediaStream = await navigator.mediaDevices.getUserMedia({ 
              audio: {
                echoCancellation: true,
                noiseSuppression: true,
                sampleRate: 16000,
                channelCount: 1
              } 
            });
            
            mediaRecorder = new MediaRecorder(mediaStream, {
              mimeType: 'audio/webm;codecs=opus',
              audioBitsPerSecond: 128000
            });
            
            audioChunks = [];

            mediaRecorder.ondataavailable = (event) => {
              if (event.data.size > 0) {
                audioChunks.push(event.data);
                sendAudioChunk(event.data);
              }
            };

            mediaRecorder.onstop = () => {
              // Clean up
              if (mediaStream) {
                mediaStream.getTracks().forEach(track => track.stop());
                mediaStream = null;
              }
            };

            // Start recording continuously
            mediaRecorder.start(1000); // Send data every second
            console.log('🎤 Started continuous recording');
            
          } catch (error) {
            console.error('Error accessing microphone:', error);
            alert('Cannot access microphone. Please check permissions.');
            // Reset state if failed
            isTalking = false;
            document.getElementById('talkButton').classList.remove('talking');
            document.getElementById('talkButton').textContent = '🎤 Click to Start Talking';
          }
        }

        function stopContinuousRecording() {
          if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
            console.log('🛑 Stopped continuous recording');
          }
          
          if (mediaStream) {
            mediaStream.getTracks().forEach(track => track.stop());
            mediaStream = null;
          }
        }

        function sendAudioChunk(audioBlob) {
          const reader = new FileReader();
          reader.onload = () => {
            const arrayBuffer = reader.result;
            const uint8Array = new Uint8Array(arrayBuffer);
            
            socket.emit('audio', {
              roomId: currentRoom,
              audioData: Array.from(uint8Array)
            });
          };
          reader.readAsArrayBuffer(audioBlob);
        }

        // Force audio through speaker (like walkie-talkie)
        function playAudioThroughSpeaker(audioData) {
          try {
            const uint8Array = new Uint8Array(audioData);
            const audioBlob = new Blob([uint8Array], { type: 'audio/webm' });
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);
            
            // Critical: Force audio through speaker
            audio.setAttribute('playsinline', 'false');
            audio.setAttribute('webkit-playsinline', 'false');
            
            // Important for mobile devices
            document.body.appendChild(audio);
            
            // Play through speaker
            audio.play().then(() => {
              console.log('🔊 Audio playing through speaker');
            }).catch(error => {
              console.log('Audio play error, trying fallback:', error);
              // Fallback: try to play normally
              audio.play().catch(e => console.log('Fallback also failed:', e));
            });
            
            // Clean up
            audio.onended = () => {
              document.body.removeChild(audio);
              URL.revokeObjectURL(audioUrl);
            };
            
          } catch (error) {
            console.error('Error playing audio:', error);
          }
        }

        // Socket event handlers
        socket.on('room-created', (data) => {
          currentRoom = data.roomId;
          showRoomInfo(data.roomId);
        });

        socket.on('room-joined', (data) => {
          currentRoom = data.roomId;
          showRoomInfo(data.roomId);
          document.getElementById('userCount').textContent = data.users.length + 1;
        });

        socket.on('user-joined', (data) => {
          const userCount = parseInt(document.getElementById('userCount').textContent);
          document.getElementById('userCount').textContent = userCount + 1;
        });

        socket.on('user-left', (data) => {
          const userCount = parseInt(document.getElementById('userCount').textContent);
          document.getElementById('userCount').textContent = Math.max(1, userCount - 1);
        });

        socket.on('audio', (data) => {
          playAudioThroughSpeaker(data.audioData);
        });

        socket.on('error', (data) => {
          alert('Error: ' + data.message);
        });

        function showRoomInfo(roomId) {
          document.getElementById('setup').style.display = 'none';
          document.getElementById('roomInfo').style.display = 'block';
          document.getElementById('controls').style.display = 'block';
          
          document.getElementById('roomIdDisplay').textContent = roomId;
          const roomLink = window.location.origin + '?room=' + roomId;
          document.getElementById('roomLink').textContent = roomLink;
          document.getElementById('roomLink').href = roomLink;
        }

        // Clean up on page unload
        window.addEventListener('beforeunload', () => {
          if (isTalking) {
            stopContinuousRecording();
          }
        });

        // Request audio permissions on page load for better UX
        window.addEventListener('load', () => {
          // This helps with getting audio permissions early
          if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            navigator.mediaDevices.getUserMedia({ audio: true })
              .then(stream => {
                console.log('✅ Audio permissions granted');
                stream.getTracks().forEach(track => track.stop()); // Stop immediately
              })
              .catch(error => {
                console.log('Audio permissions not granted yet:', error);
              });
          }
        });
      </script>
    </body>
    </html>
  `);
});

// Handle 404
app.use('*', (req, res) => {
  res.redirect('/');
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(\`\n✅ Server running on port \${PORT}\`);
  console.log(\`🔗 http://localhost:\${PORT}\`);
  console.log(\`🎤 Simple room-based walkie talkie ready!\`);
  console.log(\`🔊 Toggle mode: Click once to talk, click again to stop\`);
  console.log(\`=========================================\`);
});
