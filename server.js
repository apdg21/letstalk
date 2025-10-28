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
  res.header('Cross-Origin-Opener-Policy', 'unsafe-none');
  res.header('Cross-Origin-Embedder-Policy', 'unsafe-none');
  next();
});

console.log('🚀 Starting Real Voice Call Server...');

// In-memory storage for rooms
const rooms = new Map();

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

    if (room.users.length >= 10) {
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

  // Handle audio transmission - REAL-TIME VOICE CALL
  socket.on('audio', (data) => {
    const { roomId, audioData } = data;
    
    // Broadcast to everyone in the room except sender
    socket.to(roomId).emit('audio', {
      from: socket.id,
      audioData: audioData
    });
  });

  // Handle user leaving
  socket.on('leave-room', (roomId) => {
    socket.leave(roomId);
    const room = rooms.get(roomId);
    if (room) {
      room.users = room.users.filter(id => id !== socket.id);
      socket.to(roomId).emit('user-left', { userId: socket.id });
      
      if (room.users.length === 0) {
        rooms.delete(roomId);
        console.log(`🗑️ Room ${roomId} deleted (empty)`);
      }
    }
  });

  socket.on('disconnect', () => {
    console.log('🔌 User disconnected:', socket.id);
    
    for (const [roomId, room] of rooms.entries()) {
      if (room.users.includes(socket.id)) {
        room.users = room.users.filter(id => id !== socket.id);
        socket.to(roomId).emit('user-left', { userId: socket.id });
        
        if (room.users.length === 0) {
          rooms.delete(roomId);
        }
      }
    }
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

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Real Voice Call</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
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
        
        .subtitle { color: #666; margin-bottom: 30px; }
        
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
        
        .join-section { display: flex; gap: 10px; }
        
        input {
          flex: 1;
          padding: 15px;
          border: 2px solid #ddd;
          border-radius: 10px;
          font-size: 16px;
          outline: none;
        }
        
        input:focus { border-color: #667eea; }
        
        .join-btn { background: #2ecc71; color: white; }
        .join-btn:hover { background: #27ae60; }
        
        .room-info {
          background: #f8f9fa;
          padding: 20px;
          border-radius: 10px;
          margin-top: 20px;
          display: none;
        }
        
        .call-controls { 
          margin-top: 20px; 
          display: none;
          text-align: center;
        }
        
        .call-status {
          padding: 15px;
          background: #d4edda;
          color: #155724;
          border-radius: 10px;
          margin-bottom: 20px;
          font-weight: 600;
        }
        
        .call-active {
          background: #cce5ff;
          color: #004085;
        }
        
        .mute-btn {
          background: #6c757d;
          color: white;
          padding: 15px 30px;
          font-size: 16px;
          border-radius: 25px;
          margin: 10px;
        }
        
        .mute-btn.muted {
          background: #e74c3c;
        }
        
        .leave-btn {
          background: #dc3545;
          color: white;
          padding: 15px 30px;
          font-size: 16px;
          border-radius: 25px;
          margin: 10px;
        }
        
        .user-count { font-weight: bold; color: #667eea; }
        
        .audio-tips {
          margin-top: 15px;
          padding: 10px;
          background: #e8f4fd;
          border-radius: 8px;
          font-size: 14px;
          color: #0066cc;
        }
        
        .users-list {
          margin-top: 15px;
          text-align: left;
        }
        
        .user-item {
          padding: 8px;
          margin: 5px 0;
          background: white;
          border-radius: 5px;
          border-left: 4px solid #667eea;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🎤 Real Voice Call</h1>
        <p class="subtitle">Create a room and start talking naturally</p>
        
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
          <p>Users in call: <span class="user-count" id="userCount">1</span></p>
          
          <div class="users-list" id="usersList">
            <div class="user-item">You (Connected)</div>
          </div>
          
          <div class="audio-tips">
            🔊 <strong>Voice call active</strong> - Talk naturally like a phone call!<br>
            💡 Everyone can speak and listen at the same time
          </div>
        </div>
        
        <div class="call-controls" id="callControls">
          <div class="call-status call-active" id="callStatus">
            🎤 Voice call active - You can talk freely!
          </div>
          
          <button class="mute-btn" id="muteButton" onclick="toggleMute()">
            🔇 Mute
          </button>
          
          <button class="leave-btn" onclick="leaveRoom()">
            📞 Leave Call
          </button>
          
          <div class="audio-tips">
            🎧 Use headphones for best audio quality<br>
            🗣️ Speak naturally - no buttons to press!
          </div>
        </div>
      </div>

      <script src="/socket.io/socket.io.js"></script>
      <script>
        const socket = io();
        let currentRoom = null;
        let mediaRecorder = null;
        let mediaStream = null;
        let isMuted = false;
        let audioContext = null;

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

        function leaveRoom() {
          if (currentRoom) {
            socket.emit('leave-room', currentRoom);
            stopVoiceCall();
            resetUI();
          }
        }

        function toggleMute() {
          isMuted = !isMuted;
          const muteButton = document.getElementById('muteButton');
          
          if (isMuted) {
            muteButton.textContent = '🔊 Unmute';
            muteButton.classList.add('muted');
            stopRecording();
          } else {
            muteButton.textContent = '🔇 Mute';
            muteButton.classList.remove('muted');
            startRecording();
          }
        }

        async function startVoiceCall() {
          try {
            console.log('Starting voice call...');
            
            // Get microphone access with optimal settings for voice calls
            mediaStream = await navigator.mediaDevices.getUserMedia({ 
              audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                sampleRate: 48000,
                channelCount: 1,
                latency: 0.01
              } 
            });
            
            console.log('Microphone access granted');

            // Set up continuous recording for real-time voice
            const options = {
              audioBitsPerSecond: 128000,
              mimeType: 'audio/webm;codecs=opus'
            };

            if (!MediaRecorder.isTypeSupported(options.mimeType)) {
              options.mimeType = 'audio/webm';
            }

            mediaRecorder = new MediaRecorder(mediaStream, options);
            
            mediaRecorder.ondataavailable = (event) => {
              if (event.data.size > 0 && !isMuted) {
                sendAudioChunk(event.data);
              }
            };

            // Start continuous recording with small chunks for low latency
            mediaRecorder.start(100); // 100ms chunks for real-time feel
            console.log('Voice call recording started');
            
          } catch (error) {
            console.error('Error starting voice call:', error);
            alert('Cannot access microphone. Please check permissions.');
          }
        }

        function stopVoiceCall() {
          if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
          }
          
          if (mediaStream) {
            mediaStream.getTracks().forEach(track => track.stop());
            mediaStream = null;
          }
          
          console.log('Voice call stopped');
        }

        function startRecording() {
          if (mediaStream && !isMuted) {
            mediaRecorder.start(100);
          }
        }

        function stopRecording() {
          if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
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

        function playReceivedAudio(audioData) {
          try {
            const uint8Array = new Uint8Array(audioData);
            const audioBlob = new Blob([uint8Array], { type: 'audio/webm' });
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);
            
            // Force speaker output
            audio.setAttribute('playsinline', 'false');
            audio.setAttribute('webkit-playsinline', 'false');
            audio.volume = 1.0;
            
            document.body.appendChild(audio);
            
            audio.play().then(() => {
              // Success - audio is playing
            }).catch(error => {
              console.log('Audio play failed:', error);
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
          startVoiceCall();
        });

        socket.on('room-joined', (data) => {
          currentRoom = data.roomId;
          showRoomInfo(data.roomId);
          document.getElementById('userCount').textContent = data.users.length + 1;
          updateUsersList(data.users);
          startVoiceCall();
        });

        socket.on('user-joined', (data) => {
          const userCount = parseInt(document.getElementById('userCount').textContent);
          document.getElementById('userCount').textContent = userCount + 1;
          addUserToList(data.userId);
        });

        socket.on('user-left', (data) => {
          const userCount = parseInt(document.getElementById('userCount').textContent);
          document.getElementById('userCount').textContent = Math.max(1, userCount - 1);
          removeUserFromList(data.userId);
        });

        socket.on('audio', (data) => {
          playReceivedAudio(data.audioData);
        });

        socket.on('error', (data) => {
          alert('Error: ' + data.message);
        });

        function showRoomInfo(roomId) {
          document.getElementById('setup').style.display = 'none';
          document.getElementById('roomInfo').style.display = 'block';
          document.getElementById('callControls').style.display = 'block';
          
          document.getElementById('roomIdDisplay').textContent = roomId;
          const roomLink = window.location.origin + '?room=' + roomId;
          document.getElementById('roomLink').textContent = roomLink;
          document.getElementById('roomLink').href = roomLink;
        }

        function updateUsersList(users) {
          const usersList = document.getElementById('usersList');
          usersList.innerHTML = '<div class="user-item">You (Connected)</div>';
          
          users.forEach(userId => {
            addUserToList(userId);
          });
        }

        function addUserToList(userId) {
          const usersList = document.getElementById('usersList');
          const userItem = document.createElement('div');
          userItem.className = 'user-item';
          userItem.textContent = 'User ' + userId.substring(0, 6) + ' (Connected)';
          userItem.id = 'user-' + userId;
          usersList.appendChild(userItem);
        }

        function removeUserFromList(userId) {
          const userElement = document.getElementById('user-' + userId);
          if (userElement) {
            userElement.remove();
          }
        }

        function resetUI() {
          document.getElementById('setup').style.display = 'block';
          document.getElementById('roomInfo').style.display = 'none';
          document.getElementById('callControls').style.display = 'none';
          currentRoom = null;
        }

        // Clean up on page unload
        window.addEventListener('beforeunload', () => {
          stopVoiceCall();
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
  console.log(`
✅ Server running on port ${PORT}
🔗 http://localhost:${PORT}
🎤 Real Voice Call - Talk naturally like a phone call!
=========================================
`);
});
