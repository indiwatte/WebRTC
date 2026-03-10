const express = require('express')
const app = express()
const http = require('http').createServer(app)
const io = require('socket.io')(http)

const port = 3000;

app.use(express.static('public'))

http.listen(port, () => {
    console.log(`Example app listening on port http://localhost:${port}`)
})

const clients = {};

io.on('connection', (socket) => {
    console.log('A user connected:');

    clients[socket.id] = { //wenever the property connects to the server, we will add the socket id to the clients object
        id: socket.id,
    };

    // Broadcast updated client list to all connected clients
    io.emit('clientList', Object.values(clients));

    socket.on('message', message => {
        console.log(`Received message:', ${message}`);
        if (clients[socket.id].name) {
            //if the client has a name, we will add the name property to the message object
            io.emit('message', clients[socket.id], message); //sending the message back to all the clients connected to the server
        } else {
            socket.emit('messageError', 'Please set your name first before sending messages');
        }
    });

    socket.on('name', name => {
        console.log(`Received name:', ${name}`);

        name = name.trim(); //we will trim the name to remove any whitespace
        if (name.length === 0) {
            socket.emit('nameError', 'Name cannot be empty, please enter a name'); //if the name is empty, we will send an error message back to the client
            return;
        }

        let nameInUse = false;
        for (const socketId in clients) {
            if (clients.hasOwnProperty(socketId)) {
                const OtherClient = clients[socketId];
                if (OtherClient.name === name) {
                    nameInUse = true;
                }
            }
        }

        if (nameInUse) {
            socket.emit('nameError', 'Name is already in use, please choose a different name');
            return;
        }

        clients[socket.id].name = name; //we will add the name property to the clients object with the value of the name sent by the client
        socket.emit('name', clients[socket.id]); //we will send a message back to the client to confirm that the name has been set

        // Broadcast updated client list when a name is set
        io.emit('clientList', Object.values(clients));
    });


    socket.on('update', (targetSocketId, data) => {
        if (clients[targetSocketId]) {
            socket.to(targetSocketId).emit('update', clients[socket.id], data);
        } //we will send the update message to the target socket id with the data sent by the client
    });

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