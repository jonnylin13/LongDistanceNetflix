/** 
 * @author Jonathan Lin
 *  @description Background JS script for LDN
 */

import { PLAYER_STATE, READY_STATE, POPUP_STATE, Constants } from '../constants';
import { Utility } from './utility';

var current_url_params;
var player_port;
var player_state = PLAYER_STATE.Inactive;
var popup_state = POPUP_STATE.OutLobby;
var client_id;
var current_lobby; 
var ws;
var broadcast = false;
let utility = new Utility();

function start_player(tab_id, callback) {
    chrome.tabs.executeScript(tab_id, {file: 'scripts/jquery.js'}, function(results) {
        chrome.tabs.executeScript(tab_id, {file: 'build/player.bundle.js', runAt: 'document_idle'}, function(results) {
            chrome.tabs.sendMessage(tab_id, {type: 'register_listeners'}, function(response) {
                default_response(response);
                callback();  
            });  
        });
    });
}

function default_response(response) {
    if (response && response.type) console.log(response.type);
}

function is_watching(params) {
    if (params.includes('watch')) return true;
    return false;
}

/** Generates a client id if one is not found in chrome sync storage */
function update_id() {
    chrome.storage.sync.get('client_id', function(items) {
        var id = items.client_id;
        if (id) {
            client_id = id;
        } else {
            client_id = utility.uuidv4();
            chrome.storage.sync.set({'client_id': client_id});
        }
    });
}

function generic_player_update(tab_id, controller, type) {
    var c = current_lobby.clients[client_id];
    chrome.tabs.sendMessage(tab_id, {
        type: type,
        player_state: controller.player_state,
        progress: controller.progress

    }, function(response) {

        default_response(response);
        player_state = controller.player_state;
        c.player_state = controller.player_state;
        c.progress = controller.progress;
        current_url_params = controller.url_params;
        c.url_params = controller.url_params;
        lifecycle_ping(function() {});

    });
}

function full_player_update(tab_id, controller) {
    generic_player_update(tab_id, controller, 'full_player_update');
}

function player_state_update(tab_id, controller) {
    generic_player_update(tab_id, controller, 'player_state_update');
}

function player_time_update(tab_id, controller) {
    generic_player_update(tab_id, controller, 'player_time_update');
}


function update_listener(event) {
    
    if (!current_lobby) return;
    var data = JSON.parse(event.data);

     if (data.type == 'update') {
        if (client_id == current_lobby.ctl_id) return; // Never want to update the client controller from server
        var lobbies = data.lobbies;

        for (var l in lobbies) {
            if (l == current_lobby.id) { 
                var controller = lobbies[l].clients[lobbies[l].ctl_id];
                var c = current_lobby.clients[client_id];
                chrome.tabs.query({title: 'Netflix'}, function(tabs)  {
                    if (current_url_params != controller.url_params) {
                        chrome.tabs.update(tabs[0].id, {url: 'https://netflix.com/' + controller.url_params}, function() {

                            /** var listener = function (tab_id, change_info, tab) {
                                if (!change_info.status || change_info.status != 'complete') return;
                                if (tab_id == tabs[0].id) {
                                    full_player_update(tabs[0].id, controller);
                                    chrome.tabs.onUpdated.removeListener(listener);
                                }
                            };

                            chrome.tabs.onUpdated.addListener(listener); */

                        });
            
                    } else {
                        player_state_update(tabs[0].id, controller);
                    }
                    c.player_state = controller.player_state;
                    player_state = controller.player_state;
                    c.progress = controller.progress;

                    lifecycle_ping(function() {});
                    
                });
            }
        }
    }

}

function ws_send_connect_lobby(lobby_id) {
    ws.send(
        JSON.stringify({
            'type': 'connect_lobby',
            'lobby_id': lobby_id,
            'client_id': client_id,
            'url_params': current_url_params,
            'player_state': player_state
        })           
    );
}

function connect_lobby(lobby_id, done) {
    if (!ws) {
        ws = new WebSocket(Constants.ws_url);
        ws.onopen = function() {
            ws_send_connect_lobby(lobby_id);
        }
    } else {
        ws_send_connect_lobby(lobby_id);
    }

    ws.onmessage = function(event) {
        var data = JSON.parse(event.data);
        console.log(data);
        if (data.type == 'connect_lobby_ack') {
            if (data.success) {
                current_lobby = data.lobby; 
                var controller = current_lobby.clients[current_lobby.ctl_id];
                if (controller.player_state == PLAYER_STATE.Pause 
                    || controller.player_state == PLAYER_STATE.Play) {
                        // Assuming only one tab of Netflix
                        chrome.tabs.query({title: 'Netflix'}, function(tabs) {
                            if (current_url_params != controller.url_params) {
                                chrome.tabs.update(tabs[0].id, {url: 'https://netflix.com/' + controller.url_params}, function() {

                                /** var listener = function (tab_id, change_info, tab) {
                                    if (!change_info.status || change_info.status != 'complete') return;
                                    if (tab_id == tabs[0].id) {
                                        full_player_update(tabs[0].id, controller);
                                    }
                                    chrome.tabs.onUpdated.removeListener(listener);
                                };

                                chrome.tabs.onUpdated.addListener(listener);**/

                                }); 
                            } else {
                                full_player_update(tabs[0].id, controller);
                            }
                        });
                }
                
                
                done(true);
            } else done(false);
        } else {
            update_listener(event);
        }
    };
}

function ws_send_update_generic(type) {
    if (!current_lobby) return; // Disconnected from lobby
    ws.send(
        JSON.stringify({
            'type': type,
            'lobby_id': current_lobby.id,
            'client_id': client_id,
            'player_state': player_state,
            'url_params': current_url_params,
            'progress': current_lobby.clients[client_id].progress
        })
    );
}

function send_update_generic(type) {
    if (!ws) {
        ws = new WebSocket(Constants.ws_url);
        ws.onopen = function() {
            ws_send_update_generic(type);
        }
    } else {
        ws_send_update_generic(type);
    }
}

function broadcast_update() {

    send_update_generic('broadcast_update');

    ws.onmessage = function(event) {
        var data = JSON.parse(event.data);
        if (data.type == 'broadcast_update_ack') {
            console.log(data.type);
        }  else {
            update_listener(event);
        }
    };
}

function lifecycle_ping(done) {
    
    send_update_generic('lifecycle');
    
    ws.onmessage = function(event) {
        var data = JSON.parse(event.data);
        if (data.type == 'lifecycle_ack') {
            done(data.stop);
            if (data.timeout) {
                chrome.tabs.query({title:'Netflix'}, function(tabs) {
                    chrome.tabs.sendMessage(tabs[0].id, {
                        type: 'timeout'
                    }, function(response) {
                        default_response(response);
                    });
                });
            }
        } else {
            update_listener(event);
        }
    }
}

function ws_send_disconnect() {
    ws.send(
        JSON.stringify({
            'type': 'disconnect',
            'client_id': client_id
        })
    );
}

function disconnect(done) {
    if (!ws) {
        ws = new WebSocket(Constants.ws_url);
        ws.onopen = function() {
            ws_send_disconnect();
        };
    } else {
        ws_send_disconnect();
    }

    ws.onmessage = function(event) {
        var data = JSON.parse(event.data);
        if (data.type == 'disconnect_ack') {
            if (data.success) {
                current_lobby = null;
                console.log('exited lobby');
                done();
            }
        } else {
            update_listener(event);
        }
    };

}

function ws_send_start_lobby() {
    ws.send(JSON.stringify({
        'type': 'start_lobby',
        'client_id': client_id, 
        'player_state': player_state, 
        'url_params': current_url_params
    }));
}

/** Starts a lobby with client_id
 * We could use a JS Object for _params, but this works for now (for/in loop vs for/statement loop)
 */
function start_lobby(done) {

    if (!ws) {
        ws = new WebSocket(Constants.ws_url);

        // When the socket is initially opened
        ws.onopen = function() {
            ws_send_start_lobby();
        };
    } else {
        ws_send_start_lobby();
    }

    ws.onmessage = function(event) {
        var data = JSON.parse(event.data);
        if (data.type == 'start_lobby_ack') {
            if (data.success) {
                current_lobby = data.lobby;
                var c = current_lobby.clients[client_id];
                if (is_watching(current_url_params)) {
                    chrome.tabs.query({title: 'Netflix'}, function(tabs) {
                        chrome.tabs.sendMessage(tabs[0].id, {
                            'type': 'get_progress'
                        }, function(response) {
                            if (response && response.type == 'get_progress_ack') {
                                current_lobby.clients[client_id].progress = response.progress;
                                current_lobby.clients[client_id].url_params = current_url_params;
                                current_lobby.clients[client_id].player_state = player_state;
                                lifecycle_ping(function() {});
                            }
                        });
                    });
                }
                done();
                console.log(current_lobby);
            } else if (!data.success) {
                console.log(data.msg);
            }
        } else {
            update_listener(event);
        }
    };

    ws.ondisconnect = function() {
        alert('WEBSOCKET DISCONNECTED');
        ws = null;
    }
}

/** Called when a chrome tab is updated */
function tab_update_listener(tab_id, change_info, tab) {
    if (!change_info.status || change_info.status != 'complete') return;
    if (tab.url.indexOf('https://www.netflix.com/') == 0) {
        chrome.pageAction.show(tab_id);

        var new_url_params = tab.url.split('netflix.com/')[1].split('?')[0];
        if (current_url_params != new_url_params) {
            current_url_params = new_url_params;
            if (is_watching(new_url_params)) {

            start_player(tab_id, function() {
                // May not need this...
                // if (current_lobby && current_lobby.ctl_id == client_id) broadcast = true;
            });
 
            } else {
                
                player_state = PLAYER_STATE.Inactive;
                if (current_lobby && current_lobby.ctl_id != client_id) {
                    popup_state = POPUP_STATE.OutLobby;
                    disconnect(function() {});
                }
            }

            if (current_lobby) {
                current_lobby.clients[client_id].url_params = new_url_params;
            }
        }
            
    }
}

/** Triggered when popup.js has notified background that it has completed init */
function start_background() {
    update_id();
}

/** Triggered with messages from content scripts */
function msg_listener(req, sender, send_response) {
    if (req.type) {
        console.log(req.type);
        if (req.type === 'ldn_loaded') {
            start_background();
            send_response({
                type: 'start_background_ack'
            });
        } else if (req.type === 'start_lobby') {
            start_lobby(function() {
                // This makes assumption that only 1 Netflix tab is open...
                if (is_watching(current_url_params)) {
                    chrome.tabs.query({title: 'Netflix'}, function(tabs) {
                        chrome.tabs.sendMessage(tabs[0].id, {
                            type: 'check_lifecycle'
                        }, function(response) {
                            default_response(response);
                        });
                    });
                }
                send_response({type:'start_lobby_ack', success: true});
            });

        } else if (req.type === 'update_player_state') {
            var result = false;
            if (player_state != req.new_state)  { // Handle duplicate messages
                player_state = req.new_state;
                if (current_lobby) current_lobby.clients[client_id].progress = req.progress;

                if (current_lobby && client_id) {
                    if (current_lobby.ctl_id == client_id) {
                        if (req.new_state == PLAYER_STATE.Pause || req.new_state == PLAYER_STATE.Play) {
                            broadcast_update();
                        }
                    }
                }
                result = true;
            }

            send_response({
                type: 'update_player_state_ack',
                success: result
            });
        } else if (req.type === 'disconnect') {

            disconnect(function() {
                send_response({
                    type: 'disconnect_ack',
                    success: true
                });
            });
            
        } else if (req.type === 'update_popup_state') {
            if (popup_state == req.new_state) return;
            console.log('popup_state: ', popup_state, ' -> ', req.new_state);
            popup_state = req.new_state;
            send_response({
                type: 'update_popup_state_ack',
                success: true
            });
        } else if (req.type === 'get_popup_state') {
            send_response({
                type: 'get_popup_state_ack',
                state: popup_state
            });
        } else if (req.type === 'get_lobby_id') {
            if (!current_lobby) {
                send_response({
                    type: 'get_lobby_id_ack',
                    msg: 'Error: no current lobby',
                    success: false
                });
            }
            send_response({
                type: 'get_lobby_id_ack',
                lobby_id: current_lobby.id,
                success: true
            });
        } else if (req.type === 'lifecycle') {
            if (!current_lobby || player_state == PLAYER_STATE.Inactive) {
                send_response({
                    'type': 'lifecycle_ack',
                    'stop': true
                });

                if (current_lobby && current_lobby.ctl_id == client_id) {
                    broadcast_update();
                }
                return;
            }
            current_lobby.clients[client_id].progress = req.progress;
            if (broadcast) {
                broadcast_update();
                send_response({
                    'type': 'lifecycle_ack',
                    'stop': false
                });
                broadcast = false;
            } else {
                lifecycle_ping(function(stop) {
                    send_response({
                        'type': 'lifecycle_ack',
                        'stop': stop
                    });
                });
            }
        } else if (req.type === 'connect_lobby') {
            connect_lobby(req.lobby_id, function(success) {
                send_response({
                    'type': 'connect_lobby_ack',
                    'success': success
                });
            });
        } else if (req.type === 'full_update_request') {
            if (current_lobby && current_lobby.ctl_id != client_id) {
                chrome.tabs.query({title: 'Netflix'}, function(tabs) {
                    full_player_update(tabs[0].id, current_lobby.clients[current_lobby.ctl_id]);
                });
            }
            send_response({'type': 'full_update_request_ack'});
        }
    }
    return true;
}

function register_listeners() {
    chrome.tabs.onUpdated.addListener(tab_update_listener);
    chrome.runtime.onMessage.addListener(msg_listener);
}

/** Main function (entry point) */
function main() {
    register_listeners();
}

main();
