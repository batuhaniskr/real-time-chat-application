var express = require('express'),
    app = express(),
    path = require('path'); //built in path module, used to resolve paths of relative files
    server = require('http').createServer(app),
    io = require('socket.io').listen(server),
    mongoose = require('mongoose'),
 bodyParser = require('body-parser'),
    users = {};
server.listen(3000);

mongoose.connect('mongodb://localhost/chat_db',function (err) {
    if (err){
        console.log(err);
    }else {
        console.log('Connected to mongo db')
    }
})

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Routes
app.use('/messages', require('./routes/messages'));

var chatSchema = mongoose.Schema({

    nick: String,
    msg: String,
    group:String,
    created: {type: Date, default: Date.now}
})
var Chat = mongoose.model('Message', chatSchema);
app.use(express.static(path.join(__dirname + '/assets'))); //allows html file to reference stylesheet "helloworld.css" that is stored in ./css directory
app.get('/', function (req, res) {
    res.sendfile(__dirname + '/assets/index.html');
})


var rooms = ['room1'];


io.sockets.on('connection',function (socket) {



    Chat.find({}, function (err, docs) {
        if (err) throw err;
        socket.emit('load old msgs', docs);
    })
    socket.on('new user', function (data ,callback) {
        if (data in users){
            callback(false);
        }
        else {
            callback(true);
            socket.nickname = data;
            users[socket.nickname] = socket;
            updateNicknames();


            socket.room = 'room1';
            // add the client's username to the global list
            // send client to room 1
            socket.join('room1');
            // echo to client they've connected
            // echo to room 1 that a person has connected to their room
            socket.emit('updatechat', 'SERVER', 'you have connected to room1');

            socket.broadcast.to('room1').emit('updatechat', 'SERVER', socket.nickname + ' has connected to this room');
            socket.emit('updaterooms', rooms, 'room1');
        }
        // send client to room 1

    })



    function updateNicknames() {
        io.sockets.emit('usernames', Object.keys(users));
    }

    //creating a chat room
    socket.on('create', function(room) {
        rooms.push(room);
        socket.emit('updaterooms', rooms, socket.room);
    });


    socket.on('send message', function (data, callback) {
        var msg = data.trim();
        if(msg.substr(0,3) === '/w '){
            msg = msg.substr(3);
            var ind = msg.indexOf(' ');
            if(ind !== -1) {
                var name = msg.substring(0, ind);
                var msg  = msg.substring(ind+1);

                if(name in users){
                    users[name].emit('whisper', {msg: msg ,nick: socket.nickname});
                    console.log('Private Message!');
                }else {
                    callback('Error! Enter a valid user');
                }
                console.log('Whisper');
            }else {
                callback('Error! Please enter a message for your whisper');
            }
        }
        else {
            var newMsg = new Chat({msg: msg, nick: socket.nickname})
            newMsg.save(function (err) {
                if (err) throw err;
                io.sockets.in(socket.room).emit('new message', {msg: msg, nick: socket.nickname})

            })
        }
    })




    socket.on('switchRoom', function(newroom){
        socket.leave(socket.room);
        socket.join(newroom);
        socket.emit('updatechat', 'SERVER', 'you have connected to '+ newroom);
        // sent message to OLD room
        socket.broadcast.to(socket.room).emit('updatechat', 'SERVER', socket.nickname+' has left this room');
        // update socket session room title
        socket.room = newroom;
        socket.broadcast.to(newroom).emit('updatechat', 'SERVER', socket.nickname+' has joined this room');
        socket.emit('updaterooms', rooms, newroom);
    });



    socket.on('disconnect', function (data) {
       if (!socket.nickname) return;
       delete  users[socket.nickname];
        //io.sockets.emit('updateusers', usernames);
        // echo globally that this client has left
        socket.broadcast.emit('updatechat', 'SERVER', socket.nickname + ' has disconnected');
        socket.leave(socket.room);

        updateNicknames();
    });
})
