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

    socket.emit('room-joined', { 
      roomId, 
      users: userNamesInRoom,
      userName: userNames.get(socket.id),
      isCreator: room.creator === socket.id
    });
    
    socket.to(roomId).emit('user-joined', { 
      userId: socket.id,
      userName: userNames.get(socket.id)
    });
    
    console.log(`👥 ${userNames.get(socket.id)} joined room ${roomId}`);
  });

  socket.on('audio', (data) => {
    const { roomId, audioData } = data;
    
    socket.to(roomId).emit('audio', {
      from: socket.id,
      fromName: userNames.get(socket.id),
      audioData: audioData
    });
  });

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
        
        .name-section {
          margin-bottom: 20px;
          text-align: left;
        }
        
        .name-label {
          display: block;
          margin-bottom: 8px;
          font-weight: 600;
          color: #333;
        }
        
        .name-input {
          width: 100%;
          padding: 12px 15px;
          border: 2px solid #ddd;
          border-radius: 10px;
          font-size: 16px;
          outline: none;
          margin-bottom: 15px;
        }
        
        .name-input:focus {
          border-color: #667eea;
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
        
        .control-buttons {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 10px;
          margin-bottom: 20px;
        }
        
        .mute-btn, .speaker-btn, .leave-btn {
          padding: 12px 20px;
          font-size: 16px;
          border-radius: 25px;
          border: none;
          cursor: pointer;
          transition: all 0.3s;
          min-width: 120px;
        }
        
        .mute-btn {
          background: #6c757d;
          color: white;
        }
        
        .mute-btn.muted {
          background: #e74c3c;
        }
        
        .speaker-btn {
          background: #3498db;
          color: white;
        }
        
        .speaker-btn.active {
          background: #2980b9;
          transform: scale(1.05);
        }
        
        .leave-btn {
          background: #dc3545;
          color: white;
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
        
        .debug-info {
          margin-top: 10px;
          padding: 10px;
          background: #f8f9fa;
          border-radius: 8px;
          font-size: 12px;
          color: #666;
          text-align: left;
          max-height: 100px;
          overflow-y: auto;
        }
        
        .audio-mode {
          margin-top: 10px;
          padding: 8px 15px;
          border-radius: 15px;
          font-size: 14px;
          font-weight: 600;
          display: inline-block;
        }
        
        .mode-earpiece {
          background: #d4edda;
          color: #155724;
          border: 1px solid #c3e6cb;
        }
        
        .mode-speaker {
          background: #fff3cd;
          color: #856404;
          border: 1px solid #ffeaa7;
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
          
          .control-buttons {
            flex-direction: column;
            align-items: center;
          }
          
          .mute-btn, .speaker-btn, .leave-btn {
            width: 100%;
            max-width: 200px;
          }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🎤 Real Voice Call</h1>
        <p class="subtitle">Create a room and start talking naturally</p>
        
        <div class="name-section">
          <label class="name-label" for="userNameInput">Your Name:</label>
          <input type="text" id="userNameInput" class="name-input" placeholder="Enter your name" maxlength="20" value="">
        </div>
        
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
          
          <div class="debug-info" id="debugInfo">
            Audio mode: <span id="audioModeText">Earpiece</span>
          </div>
          
          <div class="audio-tips">
            🔊 <strong>Voice call active</strong> - Talk naturally!<br>
            💡 Switch between speaker and earpiece as needed
          </div>
        </div>
        
        <div class="call-controls" id="callControls">
          <div class="call-status call-active" id="callStatus">
            🎤 Voice call active - You can talk freely!
          </div>
          
          <div class="audio-mode mode-earpiece" id="audioModeIndicator">
            🔊 Audio: Earpiece
          </div>
          
          <div class="control-buttons">
            <button class="mute-btn" id="muteButton" onclick="toggleMute()">
              🔇 Mute
            </button>
            
            <button class="speaker-btn" id="speakerButton" onclick="toggleSpeaker()">
              🔈 Switch to Speaker
            </button>
            
            <button class="leave-btn" onclick="leaveRoom()">
              📞 Leave Call
            </button>
          </div>
          
          <div class="audio-tips">
            🎧 <strong>Earpiece</strong>: Private listening (like phone calls)<br>
            🔊 <strong>Speaker</strong>: Loud for groups (like walkie-talkie)
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
        let useSpeaker = false;
        let currentUserName = '';

        // Debug logging
        function addDebug(message) {
          const debugInfo = document.getElementById('debugInfo');
          debugInfo.innerHTML = 'Audio mode: <span id="audioModeText">' + (useSpeaker ? 'Speaker' : 'Earpiece') + '</span><br>' + message;
          console.log(message);
        }

        // Check for room ID in URL
        const urlParams = new URLSearchParams(window.location.search);
        const roomFromUrl = urlParams.get('room');
        if (roomFromUrl) {
          document.getElementById('roomInput').value = roomFromUrl;
        }

        function getUserName() {
          const userNameInput = document.getElementById('userNameInput');
          return userNameInput.value.trim() || 'Anonymous';
        }

        function createRoom() {
          const userName = getUserName();
          addDebug('Creating room with name: ' + userName);
          socket.emit('create-room', { userName });
        }

        function joinRoom() {
          const roomId = document.getElementById('roomInput').value.trim();
          const userName = getUserName();
          
          if (roomId) {
            addDebug('Joining room: ' + roomId + ' with name: ' + userName);
            socket.emit('join-room', { roomId, userName });
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
            addDebug('Microphone muted');
          } else {
            muteButton.textContent = '🔇 Mute';
            muteButton.classList.remove('muted');
            startRecording();
            addDebug('Microphone unmuted');
          }
        }

        function toggleSpeaker() {
          useSpeaker = !useSpeaker;
          const speakerButton = document.getElementById('speakerButton');
          const audioModeIndicator = document.getElementById('audioModeIndicator');
          
          if (useSpeaker) {
            speakerButton.textContent = '📱 Switch to Earpiece';
            speakerButton.classList.add('active');
            audioModeIndicator.textContent = '🔊 Audio: Speaker';
            audioModeIndicator.className = 'audio-mode mode-speaker';
            addDebug('Switched to Speaker mode');
          } else {
            speakerButton.textContent = '🔈 Switch to Speaker';
            speakerButton.classList.remove('active');
            audioModeIndicator.textContent = '🔊 Audio: Earpiece';
            audioModeIndicator.className = 'audio-mode mode-earpiece';
            addDebug('Switched to Earpiece mode');
          }
        }

        async function startVoiceCall() {
          try {
            addDebug('Starting voice call...');
            
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
            
            addDebug('Microphone access granted');

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
            addDebug('Voice call recording started');
            
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
          
          addDebug('Voice call stopped');
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
            
            if (useSpeaker) {
              // Force speaker output
              audio.setAttribute('playsinline', 'false');
              audio.setAttribute('webkit-playsinline', 'false');
              document.body.appendChild(audio);
              addDebug('Playing through speaker');
            } else {
              // Use earpiece/default
              audio.setAttribute('playsinline', 'true');
              audio.setAttribute('webkit-playsinline', 'true');
              addDebug('Playing through earpiece');
            }
            
            audio.volume = 1.0;
            
            audio.play().catch(error => {
              console.log('Audio play failed:', error);
              addDebug('Audio play error: ' + error.message);
            });
            
            audio.onended = () => {
              if (useSpeaker) {
                document.body.removeChild(audio);
              }
              URL.revokeObjectURL(audioUrl);
            };
            
          } catch (error) {
            console.error('Error playing audio:', error);
            addDebug('Audio error: ' + error.message);
          }
        }

        // Socket event handlers
        socket.on('room-created', (data) => {
          currentRoom = data.roomId;
          currentUserName = data.userName;
          addDebug('Room created: ' + data.roomId + ' | You are: ' + data.userName);
          showRoomInfo(data.roomId, data.userName);
          startVoiceCall();
        });

        socket.on('room-joined', (data) => {
          currentRoom = data.roomId;
          currentUserName = data.userName;
          addDebug('Room joined: ' + data.roomId + ' | You are: ' + data.userName);
          addDebug('Received ' + data.users.length + ' users in room');
          
          showRoomInfo(data.roomId, data.userName);
          document.getElementById('userCount').textContent = data.users.length;
          updateUsersList(data.users);
          startVoiceCall();
        });

        socket.on('user-joined', (data) => {
          const userCount = parseInt(document.getElementById('userCount').textContent);
          document.getElementById('userCount').textContent = userCount + 1;
          addDebug('User joined: ' + data.userName);
          addUserToList(data.userId, data.userName, false);
        });

        socket.on('user-left', (data) => {
          const userCount = parseInt(document.getElementById('userCount').textContent);
          document.getElementById('userCount').textContent = Math.max(1, userCount - 1);
          addDebug('User left: ' + data.userName);
          removeUserFromList(data.userId);
        });

        socket.on('audio', (data) => {
          addDebug('Received audio from: ' + data.fromName);
          playReceivedAudio(data.audioData);
        });

        socket.on('error', (data) => {
          addDebug('Error: ' + data.message);
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
          
          addDebug('Updating user list with ' + users.length + ' users');
          
          users.forEach(user => {
            const isCurrentUser = user.id === socket.id;
            addUserToList(user.id, user.name, isCurrentUser);
          });
        }

        function addUserToList(userId, userName, isCurrentUser) {
          const usersList = document.getElementById('usersList');
          const userItem = document.createElement('div');
          userItem.className = 'user-item ' + (isCurrentUser ? 'user-you' : '');
          userItem.id = 'user-' + userId;
          
          const avatar = document.createElement('div');
          avatar.className = 'user-avatar';
          avatar.textContent = userName.split(' ').map(word => word[0]).join('').toUpperCase();
          
          const name = document.createElement('div');
          name.className = 'user-name';
          name.textContent = userName + (isCurrentUser ? ' (You)' : '');
          
          userItem.appendChild(avatar);
          userItem.appendChild(name);
          usersList.appendChild(userItem);
          
          addDebug('Added user to list: ' + userName + (isCurrentUser ? ' (You)' : ''));
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
          // Reset audio mode
          useSpeaker = false;
          const speakerButton = document.getElementById('speakerButton');
          speakerButton.textContent = '🔈 Switch to Speaker';
          speakerButton.classList.remove('active');
        }

        window.addEventListener('beforeunload', () => {
          stopVoiceCall();
        });

        // Focus on name input when page loads
        window.addEventListener('load', () => {
          document.getElementById('userNameInput').focus();
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
🎤 Real Voice Call with Speaker/Earpiece Toggle
=========================================
`);
});
