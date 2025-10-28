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

// In-memory storage for rooms and user names
const rooms = new Map();
const userNames = new Map(); // socket.id -> username

// Generate random user names
function generateUserName() {
  const adjectives = ['Happy', 'Clever', 'Brave', 'Swift', 'Gentle', 'Witty', 'Calm', 'Proud', 'Lucky', 'Smart'];
  const animals = ['Tiger', 'Eagle', 'Dolphin', 'Fox', 'Lion', 'Owl', 'Wolf', 'Bear', 'Hawk', 'Falcon'];
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const animal = animals[Math.floor(Math.random() * animals.length)];
  return `${adjective} ${animal}`;
}

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('🔌 User connected:', socket.id);

  // Assign a random name to the user
  const userName = generateUserName();
  userNames.set(socket.id, userName);
  console.log(`👤 User ${socket.id} assigned name: ${userName}`);

  // Create a new room
  socket.on('create-room', () => {
    const roomId = generateRoomId();
    rooms.set(roomId, {
      users: [socket.id],
      creator: socket.id,
      createdAt: new Date().toISOString()
    });
    
    socket.join(roomId);
    socket.emit('room-created', { 
      roomId,
      userName: userName
    });
    console.log(`🎪 Room created: ${roomId} by ${userName}`);
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
    
    // Get names of all users in the room
    const userNamesInRoom = room.users.map(userId => ({
      id: userId,
      name: userNames.get(userId)
    }));
    
    // Notify others in the room
    socket.to(roomId).emit('user-joined', { 
      userId: socket.id,
      userName: userName
    });
    
    socket.emit('room-joined', { 
      roomId, 
      users: userNamesInRoom,
      userName: userName,
      isCreator: room.creator === socket.id
    });
    
    console.log(`👥 ${userName} joined room ${roomId}`);
  });

  // Handle audio transmission
  socket.on('audio', (data) => {
    const { roomId, audioData } = data;
    
    // Broadcast to everyone in the room except sender
    socket.to(roomId).emit('audio', {
      from: socket.id,
      fromName: userNames.get(socket.id),
      audioData: audioData
    });
  });

  // Handle user leaving
  socket.on('leave-room', (roomId) => {
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
    
    // Clean up user name
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
          padding: 30px;
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
          font-size: 1.8rem;
        }
        
        .subtitle { 
          color: #666; 
          margin-bottom: 25px;
          font-size: 1rem;
        }
        
        .button-group {
          display: flex;
          flex-direction: column;
          gap: 15px;
          margin-bottom: 25px;
        }
        
        button {
          padding: 15px 25px;
          border: none;
          border-radius: 10px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s;
          min-height: 50px;
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
          flex-direction: column;
          gap: 10px; 
        }
        
        @media (min-width: 480px) {
          .join-section {
            flex-direction: row;
          }
        }
        
        input {
          flex: 1;
          padding: 15px;
          border: 2px solid #ddd;
          border-radius: 10px;
          font-size: 16px;
          outline: none;
          min-height: 50px;
        }
        
        input:focus { border-color: #667eea; }
        
        .join-btn { 
          background: #2ecc71; 
          color: white; 
          min-width: 120px;
        }
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
          padding: 12px 25px;
          font-size: 16px;
          border-radius: 25px;
          margin: 8px;
          min-width: 100px;
        }
        
        .mute-btn.muted {
          background: #e74c3c;
        }
        
        .leave-btn {
          background: #dc3545;
          color: white;
          padding: 12px 25px;
          font-size: 16px;
          border-radius: 25px;
          margin: 8px;
          min-width: 100px;
        }
        
        .user-count { 
          font-weight: bold; 
          color: #667eea;
          font-size: 1.1rem;
        }
        
        .your-name {
          background: #667eea;
          color: white;
          padding: 8px 15px;
          border-radius: 20px;
          display: inline-block;
          margin: 10px 0;
          font-weight: 600;
        }
        
        .audio-tips {
          margin-top: 15px;
          padding: 12px;
          background: #e8f4fd;
          border-radius: 8px;
          font-size: 14px;
          color: #0066cc;
          line-height: 1.4;
        }
        
        .users-list {
          margin-top: 15px;
          text-align: left;
        }
        
        .user-item {
          padding: 10px 15px;
          margin: 8px 0;
          background: white;
          border-radius: 8px;
          border-left: 4px solid #667eea;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        
        .user-avatar {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: linear-gradient(135deg, #667eea, #764ba2);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: bold;
          font-size: 14px;
        }
        
        .user-name {
          font-weight: 600;
          color: #333;
        }
        
        .user-you {
          border-left-color: #2ecc71;
          background: #f8fff9;
        }
        
        /* Mobile improvements */
        @media (max-width: 480px) {
          .container {
            padding: 20px;
            margin: 10px;
          }
          
          h1 {
            font-size: 1.5rem;
          }
          
          .subtitle {
            font-size: 0.9rem;
          }
          
          button {
            padding: 12px 20px;
            font-size: 15px;
          }
          
          input {
            padding: 12px 15px;
            font-size: 15px;
          }
          
          .room-info {
            padding: 15px;
          }
          
          .user-item {
            padding: 8px 12px;
            font-size: 14px;
          }
        }
        
        /* Very small screens */
        @media (max-width: 360px) {
          .container {
            padding: 15px;
          }
          
          h1 {
            font-size: 1.3rem;
          }
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
          <div class="your-name">You are: <span id="userNameDisplay"></span></div>
          <p>Users in call: <span class="user-count" id="userCount">1</span></p>
          
          <div class="users-list" id="usersList">
            <!-- Users will be added here dynamically -->
          </div>
          
          <div class="audio-tips">
            🔊 <strong>Voice call active</strong> - Talk naturally!<br>
            💡 Everyone can speak and listen at the same time
          </div>
        </div>
        
        <div class="call-controls" id="callControls">
          <div class="call-status call-active" id="callStatus">
            🎤 Voice call active - You can talk freely!
          </div>
          
          <div>
            <button class="mute-btn" id="muteButton" onclick="toggleMute()">
              🔇 Mute
            </button>
            
            <button class="leave-btn" onclick="leaveRoom()">
              📞 Leave Call
            </button>
          </div>
          
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
        let currentUserName = '';

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

            mediaRecorder.start(100);
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
            
            audio.setAttribute('playsinline', 'false');
            audio.setAttribute('webkit-playsinline', 'false');
            audio.volume = 1.0;
            
            document.body.appendChild(audio);
            
            audio.play().catch(error => {
              console.log('Audio play failed:', error);
            });
            
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
          currentUserName = data.userName;
          showRoomInfo(data.roomId, data.userName);
          startVoiceCall();
        });

        socket.on('room-joined', (data) => {
          currentRoom = data.roomId;
          currentUserName = data.userName;
          showRoomInfo(data.roomId, data.userName);
          document.getElementById('userCount').textContent = data.users.length;
          updateUsersList(data.users);
          startVoiceCall();
        });

        socket.on('user-joined', (data) => {
          const userCount = parseInt(document.getElementById('userCount').textContent);
          document.getElementById('userCount').textContent = userCount + 1;
          addUserToList(data.userId, data.userName, false);
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

        function showRoomInfo(roomId, userName) {
          document.getElementById('setup').style.display = 'none';
          document.getElementById('roomInfo').style.display = 'block';
          document.getElementById('callControls').style.display = 'block';
          
          document.getElementById('roomIdDisplay').textContent = roomId;
          document.getElementById('userNameDisplay').textContent = userName;
          
          const roomLink = window.location.origin + '?room=' + roomId;
          document.getElementById('roomLink').textContent = roomLink;
          document.getElementById('roomLink').href = roomLink;
        }

        function updateUsersList(users) {
          const usersList = document.getElementById('usersList');
          usersList.innerHTML = '';
          
          // Add current user first
          addUserToList(socket.id, currentUserName, true);
          
          // Add other users
          users.forEach(user => {
            if (user.id !== socket.id) {
              addUserToList(user.id, user.name, false);
            }
          });
        }

        function addUserToList(userId, userName, isCurrentUser) {
          const usersList = document.getElementById('usersList');
          const userItem = document.createElement('div');
          userItem.className = `user-item ${isCurrentUser ? 'user-you' : ''}`;
          userItem.id = 'user-' + userId;
          
          const avatar = document.createElement('div');
          avatar.className = 'user-avatar';
          avatar.textContent = userName.split(' ').map(word => word[0]).join('').toUpperCase();
          
          const name = document.createElement('div');
          name.className = 'user-name';
          name.textContent = `${userName} ${isCurrentUser ? '(You)' : ''}`;
          
          userItem.appendChild(avatar);
          userItem.appendChild(name);
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
          currentUserName = '';
        }

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
🎤 Real Voice Call with User Names
=========================================
`);
});
