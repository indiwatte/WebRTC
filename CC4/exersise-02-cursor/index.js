const clients = {};

clients[socket.id] = {
    id: socket.id,
    x: Math.random(),
    y: Math.random()
};