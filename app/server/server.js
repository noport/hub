var static = require('node-static');
var http = require('http');
var file = new(static.Server)();
var app = http.createServer(function (req, res) {
  file.serve(req, res);
}).listen(2013);

var io = require('socket.io').listen(app);
var logs = {};
var clients = {};

io.sockets.on('connection', function (socket){

  function getTime() {
    var current = new Date();
    var time = ('0' + current.getHours()).slice(-2) + ':' +
               ('0' + current.getMinutes()).slice(-2) + ':' +
               ('0' + current.getSeconds()).slice(-2);
    return time;
  }

  // convenience function to log server messages on the client
  function log() {
    var performanceName = arguments[0];
    var array = [];
    var text;
    var time = getTime();
    for (var i = 1; i < arguments.length; i++) {
      text = '[' + time + '] ' + arguments[i];
      logs[performanceName].push(text);
      array.push(text);
    }
    socket.broadcast.to(performanceName).emit('log', array);
    socket.emit('log', array);
  }

  function logHistory(performanceName) {
    socket.emit('log', logs[performanceName]);
  }

  socket.on('message', function (message) {
    // for a real app, would be room only (not broadcast)
    socket.broadcast.emit('message', message);
  });

  socket.on('enter', function (data) {
    clients[socket.id] = {role: data.role, name: data.name};

    var room = io.nsps['/'].adapter.rooms[data.performanceName];
    var numClients = typeof room === 'undefined' ? 0 : room.length;

    log('Performance ' + data.performanceName + ' has ' + numClients + ' client(s)');
    log('Request to create or join performance ' + data.performanceName);

    if (data.role === 'broadcaster' && numClients === 0){
      logs[data.performanceName] = [];
      socket.join(data.performanceName);
      socket.emit('created', data.performanceName);
      log(data.performanceName, data.name + ' started a new performance ' + data.performanceName + '.');
    } else {
      io.sockets.in(data.performanceName).emit('join', data.performanceName);
      socket.join(data.performanceName);
      socket.emit('joined', data.performanceName);
      logHistory(data.performanceName);
      log(data.performanceName, data.name + ' joined performance.');
    }
    socket.emit('emit(): client ' + socket.id + ' joined performance ' + data.performanceName);
    socket.broadcast.emit('broadcast(): client ' + socket.id + ' joined performance ' + data.performanceName);

  });

});
