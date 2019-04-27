const Lobby = require("./shared/model/lobby");
const User = require("./shared/model/user");
const WebSocket = require("ws");
const Constants = require("./shared/constants");
// We use hri here because shared cannot import npm modules
const hri = require("human-readable-ids").hri;
const Util = require("./shared/util");

const PORT = 3000;

class LDNServer {
  constructor(start = true) {
    this.lobbies = {};
    process.on("exit", () => {
      this._exitHandler();
    });
    process.on("SIGINT", () => {
      this._exitHandler();
    });
    if (start) this.start();
  }

  // ===============
  // Handler Methods
  // ===============

  _exitHandler() {
    if (this.server) this.server.close();
  }

  _onConnection(socket, req) {
    console.log(
      "<Info> Connection received from: ",
      req.connection.remoteAddress
    );
    socket.on("message", msg => {
      this._onMessage(socket, msg);
    });
  }

  _onMessage(socket, msg) {
    const data = JSON.parse(msg);

    if (!data) {
      console.log("<Error> Server received janky JSON data!");
      return;
    }

    console.log("<Info> Received message with type: ", data.type);

    switch (data.type) {
      case Constants.Protocol.Messages.START_LOBBY:
        this._startLobby(socket, data);
      case Constants.Protocol.Messages.DISCONNECT_LOBBY:
        this._disconnectLobby(socket, data);
    }
  }

  // ===============
  // Private Methods
  // ===============
  _startLobby(socket, data) {
    const response = JSON.stringify({
      type: Constants.Protocol.Messages.START_LOBBY_ACK,
      code: Constants.Protocol.SUCCESS,
      lobbyId: lobby.id
    });

    try {
      const user = User.fromJson(data.user);
      user.id = Util.uuidv4();

      if (this.isConnected(user)) {
        console.log("<Error> User is already connected. ID: " + user.id);
        return;
      }

      const lobby = new Lobby(hri.random(), user);
      user.lobbyId = lobby.id;
      this.addLobby(lobby);

      response.code = Constants.Protocol.SUCCESS;
      response.lobbyId = lobby.id;
      response.userId = user.id;
    } catch (err) {
      response.code = Constants.Protocol.FAIL;
      console.log(err);
    }
    socket.send(payload);
  }

  _disconnectLobby(socket, data) {
    const response = {
      type: Constants.Protocol.Messages.DISCONNECT_LOBBY_ACK
    };
    try {
      const user = User.fromJson(data.user);
      const lobby = this.getLobby(user.lobbyId);
      lobby.remove(user);
      // Remove the lobby from this.lobbies is empty
      if (lobby.controller === null && lobby.size() === 0)
        delete this.lobbies[user.lobbyId];

      response.code = Constants.Protocol.SUCCESS;
    } catch (err) {
      response.code = Constants.Protocol.FAIL;
      console.log(err);
    }
    socket.send(JSON.stringify(response));
  }

  // ==============
  // Public Methods
  // ==============

  start() {
    this.server = new WebSocket.Server({ port: PORT });
    console.log("<Info> Listening on port: ", PORT);
    this.server.on("connection", (socket, req) => {
      this._onConnection(socket, req);
    });
  }

  contains(lobbyId) {
    return lobbyId in this.lobbies;
  }

  addLobby(lobby) {
    if (!this.contains(lobby.id)) this.lobbies[lobby.id] = lobby;
  }

  getLobby(lobbyId) {
    if (!this.contains(lobbyId)) return this.lobbies[lobbyId];
    else throw new Error("<Error> Could not find lobby in server.");
  }

  isConnected(user) {
    return this.lobbies[user.lobbyId].contains(user);
  }
}

const ldnServer = new LDNServer(true);
