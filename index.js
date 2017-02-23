//require('dotenv').config()
global.HOST = (process.env.HOST || "127.0.0.1")
global.PORT = (process.env.PORT || 5000)
global.RELATIVE_PATH = (process.env.RELATIVE_PATH || "")
global.SEVER_URL = "https://remotecast.herokuapp.com"
global.API_HOST = (process.env.API_HOST || "http://localhost:5000")
global.RELATIVE_API_PATH = (process.env.RELATIVE_API_PATH || "")
var request = require('request');
var rp = require('request-promise');
var express = require('express')
var app = express()
var http = require('http').Server(app)
var path = require('path')
var io = require('socket.io')(http, {path: global.RELATIVE_PATH + '/socket.io'})
const SpotifyWebHelper = require('spotify-web-helper');

app.use(express.static(path.join(__dirname, 'public')))
app.set("host", global.HOST);
app.set('port', global.PORT);
app.set('views', __dirname + '/views');

app.get("*", function(req, res){
  res.sendFile(__dirname + '/views/index.html');
});

io.on('connection', function(socket){
  var current_user, current_room_token, ready
  const helper = SpotifyWebHelper();

  helper.player.on('ready', () => {
    socket.emit("player ready")
    ready = true

    socket.on('broadcast start', function(name, callback){
      var room;
      var options = {
                        method: 'POST',
                        uri: global.SEVER_URL + '/api/v1/rooms',
                        body: {
                            caster_id: current_user["id"],
                            name: name,
                            status: JSON.stringify(helper.status)
                        },
                        json: true // Automatically stringifies the body to JSON
                    };
      rp(options)
        .then(function (parsedBody) {
            room = parsedBody// POST succeeded...
            callback(room)
        })
        .catch(function (err) {
            console.log(err)// POST failed...
        });
    })

    socket.on('update broadcast status', function(){
      var options = {
                        method: 'PUT',
                        uri: global.SEVER_URL + '/api/v1/rooms',
                        body: {
                            caster_id: current_user.id,
                            status: helper.status,
                            playing: helper.status.playing
                        },
                        json: true // Automatically stringifies the body to JSON
                    };
      rp(options)
        .then(function (parsedBody) {
            console.log(parsedBody)// POST succeeded...
        })
        .catch(function (err) {
            console.log(err)// POST failed...
        });
    })
    socket.on('broadcast stop', function(){
      
    })

    function fetchRoomStatus(options, callback) {
      rp(options)
          .then(function (parsedBody) {
            console.log("GET ROOM")
            console.log(parsedBody)
            if (parsedBody["changed"]){
              helper.player.play(uri + '#' + parsedBody["status"]["playing_position"]).then(function(){
                console.log("Player seek to position " + parsedBody["status"]["playing_position"])
              })
              helper.player.pause(parsedBody["playing"])
              callback()
            }
            fetchRoomStatus(options, callback)// POST succeeded...
          })
          .catch(function (err) {
              console.log(err)// POST failed...
          });
    }

    socket.on('update player', function(room, callback){
      var options = {
                        method: 'GET',
                        uri: global.SEVER_URL + '/api/v1/rooms',
                        body: {
                          token: room.token
                        },
                        json: true // Automatically stringifies the body to JSON
                    };
        fetchRoomStatus(options, callback)
    })

    // Playback events
    helper.player.on('play', () => { console.log("PLAY") });
    helper.player.on('pause', () => { console.log("PAUSE") });
    helper.player.on('end', () => { console.log("END") });
    helper.player.on('track-will-change', track => { console.log("TRACK WILL CHANGE")});
    helper.player.on('status-will-change', status => { console.log("STATUS WILL CHANGE")});

    // Playback control. These methods return promises
    // helper.player.pause();
    // helper.player.seek();

    // Get current playback status, including up to date playing position
    // 'status': {
    //    'track': ...,
    //    'shuffle': ...,
    //    'playing_position': ...
    //  }

    socket.on('listen', function(user, callback){
      var room;
      if (ready){
        console.log("READY")
        var options = {
                        method: 'POST',
                        uri: global.SEVER_URL + '/api/v1/users',
                        body: user,
                        json: true // Automatically stringifies the body to JSON
                    };
        console.log(options)
        rp(options)
          .then(function (parsedBody) {
              console.log("USER LIST")
              console.log(parsedBody)
              console.log("USER LIST")// POST succeeded...
          })
          .catch(function (err) {
              console.log(err)// POST failed...
          });

        var options = {
                        method: 'GET',
                        uri: global.SEVER_URL + '/api/v1/rooms?token=' + current_room_token,
                        json: true // Automatically stringifies the body to JSON
                    };
        rp(options)
          .then(function (parsedBody) {
              room = parsedBody// POST succeeded...
              callback(room)
          })
          .catch(function (err) {
              console.log(err)// POST failed...
          });

      } else {
        callback({name: "Undefined Room"})
      }
    })

    socket.on('user connected', function(user, room_token, callback){
      if (room_token){
        current_room_token = room_token
        console.log(current_room_token)
        var options = {
                          method: 'GET',
                          uri: global.SEVER_URL + '/api/v1/users',
                          body: {
                            token: current_room_token
                          },
                          json: true // Automatically stringifies the body to JSON
                      };
          rp(options)
            .then(function (parsedBody) {
                console.log(parsedBody)// POST succeeded...
                callback()
            })
            .catch(function (err) {
                console.log(err)// POST failed...
            });
      } else {
        var options = {
                          method: 'POST',
                          uri: global.SEVER_URL + '/api/v1/users',
                          body: user,
                          json: true // Automatically stringifies the body to JSON
                      };
          rp(options)
            .then(function (parsedBody) {
                console.log(parsedBody)// POST succeeded...
                current_user = parsedBody
                callback()
            })
            .catch(function (err) {
                console.log(err)// POST failed...
            }); 
      }
    })
  });


  helper.player.on('error', err => {
    console.log(err)
    if (err.message.match(/No user logged in/)) {
      console.log("not logged in")// also fires when Spotify client quits
    } else {
      console.log("not installed")
      // other errors: /Cannot start Spotify/ and /Spotify is not installed/
    }
  });

  socket.on('disconnect', function(){
    helper.player.pause()
  });
})


http.listen(app.get("port"), function() {
  console.log("Server up and running. Go to " + app.get("host") + ":" + app.get("port"));
  console.log(process.env.NODE_ENV)
});