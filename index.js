const express = require('express')
const app = express()
const http = require('http').createServer(app)
const io = require('socket.io')(http)

const port = process.env.PORT || 3000;

app.use(express.static('public'))

http.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})

const clients = {};

io.on('connection', (socket) => {
    console.log('A user connected:');

    clients[socket.id] = { //wenever the property connects to the server, we will add the socket id to the clients object
        id: socket.id,
    };

    // Broadcast updated client list to all connected clients
    io.emit('clientList', Object.values(clients));



    // WebRTC signaling - forward signals between peers
    socket.on('signal', (peerId, signal) => {
        console.log(`Received signal from ${socket.id} to ${peerId}`);
        io.to(peerId).emit('signal', peerId, signal, socket.id);
    });

    socket.on('disconnect', () => {
        delete clients[socket.id]; //when the user disconnects, we will remove the socket id from the clients object

        // Broadcast updated client list when a user disconnects
        io.emit('clientList', Object.values(clients));
    });
})