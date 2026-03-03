// 🌐 SERVER CODE - This is like the "phone company" that connects everyone
// =======================================================================

// STEP 1: Load the tools we need
const express = require('express');  // Helps us create a web server
const http = require('http');  // Helps us handle internet connections
const path = require('path');  // Helps us work with file paths
const { Server } = require("socket.io");  // Helps us send live messages between browsers

// STEP 2: Create our web server
const app = express();  // Create the web app
const server = http.createServer(app);  // Create the server
const io = new Server(server);  // Create the messaging system on top of the server
const port = 3000;  // The "door number" where people can access our server

// STEP 3: Tell the server to share files from the 'public' folder
// When someone visits our website, they can see sender.html, receiver.html, etc.
app.use(express.static(path.join(__dirname, 'public')));

// STEP 4: Start the server and listen for visitors
server.listen(port, () => {
  console.log(`App listening on port ${port}`);
  console.log(`Open http://localhost:${port}/sender.html or receiver.html`);
});

// STEP 5: Handle when someone connects to our server
// Think of this like someone plugging their phone into the phone network
io.on('connection', socket => {
  console.log('connection:', socket.id);  // Someone just connected! Show their ID

  // Make a list of everyone who's currently connected
  // Like a phone book of everyone online right now
  const clients = {};
  io.sockets.sockets.forEach((socket) => {
    clients[socket.id] = socket.id;  // Add each person's ID to the list
  });
  io.emit('clients', clients);  // Send this list to EVERYONE so they know who's online

  // STEP 6: Handle when someone disconnects (closes their browser)
  socket.on('disconnect', () => {
    console.log('disconnect:', socket.id);  // Someone left!

    // Update the list of who's still connected
    const clients = {};
    io.sockets.sockets.forEach((socket) => {
      clients[socket.id] = socket.id;
    });
    io.emit('clients', clients);  // Tell everyone the updated list
  });

  // STEP 7: Be the messenger! Pass messages between the two people trying to connect
  // Our server is like a post office - we just deliver messages, we don't read them

  // When Person A wants to call Person B (sends an "offer")
  socket.on('peerOffer', (peerId, offer) => {
    console.log(`📞 ${socket.id} is calling ${peerId}`);
    // Forward the offer to Person B
    io.to(peerId).emit('peerOffer', peerId, offer, socket.id);
  });

  // When Person B answers Person A's call (sends an "answer")
  socket.on('peerAnswer', (peerId, answer) => {
    console.log(`✅ ${socket.id} answered ${peerId}'s call`);
    // Forward the answer back to Person A
    io.to(peerId).emit('peerAnswer', peerId, answer, socket.id);
  });

  // When either person sends "directions" to connect (ICE candidates)
  // These are like GPS coordinates - help them find the best path to each other
  socket.on('peerIce', (peerId, candidate) => {
    console.log(`🗺️  ${socket.id} sent route info to ${peerId}`);
    // Forward the directions to the other person
    io.to(peerId).emit('peerIce', peerId, candidate, socket.id);
  });
});
