//require('dotenv').config()
global.HOST = (process.env.HOST || "127.0.0.1")
global.PORT = (process.env.PORT || 5000)
global.RELATIVE_PATH = (process.env.RELATIVE_PATH || "")
global.SEVER_URL = "https://remotecast.herokuapp.com" //"http://localhost:3000" //
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

const electron = require('electron')
const electron_app = electron.app
const BrowserWindow = electron.BrowserWindow
const url = require('url')

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let win

function createWindow () {
  // Create the browser window.
  win = new BrowserWindow({
    width: 800,
    height: 120,
    resizable: false,
    webPreferences: {
        nodeIntegration: false,
        webSecurity: false,
        plugins: true
    }
  })

  // and load the index.html of the app.
  // win.loadURL(url.format({
  //   pathname: path.join(__dirname, '/views/index.html'),
  //   protocol: 'file:',
  //   slashes: true
  // }))

  win.loadURL("http://localhost:5000")

  // Open the DevTools.
  win.webContents.openDevTools()

  // Emitted when the window is closed.
  win.on('closed', () => {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    win = null
  })

  win.webContents.on("devtools-opened", () => {
    win.webContents.closeDevTools();
  });
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
electron_app.on('ready', createWindow)

// Quit when all windows are closed.
electron_app.on('window-all-closed', () => {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    electron_app.quit()
  }
})

electron_app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (win === null) {
    createWindow()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

function parseTime(number) {
  let fullseconds = Math.round(number);
  let minutes = Math.floor(fullseconds / 60);
  let seconds = fullseconds - (minutes * 60);
  if (seconds < 10) {
    seconds = '0' + seconds;
  }
  return minutes + ':' + seconds;
}

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

    socket.on('update broadcast status', function(callback){
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
            callback()// POST succeeded...
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
            uri = parsedBody["status"]["track"]["track_resource"]["uri"]
            position = '#' + parseTime(parsedBody["status"]["playing_position"])
            if (uri != helper.status.track.track_resource.uri){
              helper.player.play(uri).then(function(res){
                fetchRoomStatus(options, callback)// POST succeeded...
              })
              callback()
            } else {
              fetchRoomStatus(options, callback)
            }
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

    socket.on('listen', function(user, callback){
      var room;
      if (ready){
        var options = {
                        method: 'POST',
                        uri: global.SEVER_URL + '/api/v1/users',
                        body: user,
                        json: true // Automatically stringifies the body to JSON
                    };
        rp(options)
          .then(function (parsedBody) {
              // POST succeeded...
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
                callback() // POST succeeded...
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
                current_user = parsedBody
                callback() // POST succeeded...
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
  });
})


http.listen(app.get("port"), function() {
  console.log("Server up and running. Go to " + "localhost:" + app.get("port"));
});