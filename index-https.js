const fs = require('fs');
const https = require('https');
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

// Need key.pem and cert.pem in the same directory
const options = {
    key: fs.readFileSync('key.pem'),
    cert: fs.readFileSync('cert.pem')
};

const server = https.createServer(options, app);
const io = require('socket.io')(server);

app.use(express.static('public'));

server.listen(port, () => {
    console.log(`HTTPS server listening on port ${port}`);
    console.log(`Please access via https://localhost:${port} or https://<YOUR_IP>:${port}`);
    console.log(`Note: Accept the security warning in your browser to proceed.`);
});

const clients = {};

io.on('connection', (socket) => {
    console.log('A user connected: ', socket.id);

    clients[socket.id] = {
        id: socket.id,
    };

    io.emit('clientList', Object.values(clients));

    socket.on('signal', (peerId, signal) => {
        console.log(`Received signal from ${socket.id} to ${peerId}`);
        io.to(peerId).emit('signal', peerId, signal, socket.id);
    });

    socket.on('disconnect', () => {
        delete clients[socket.id];
        io.emit('clientList', Object.values(clients));
    });
});
