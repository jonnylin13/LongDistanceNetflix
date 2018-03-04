/**
* @author Jonathan Lin
* @description Used to track the NF player
* Initialized when NF Player is created
*/

const PLAYER_STATE = Object.freeze({
    'Inactive': -1, // Initialization state
    'Play': 0,
    'Pause': 1
});
const debug = true;

// Script local
var player_state = PLAYER_STATE.Inactive;
var background_port;

function update_player_state(state) {
    background_port.postMessage({
        'type': 'update_player_state',
        'new_state': state
    });
}

/** Linear contains function, searches given array for item, == comparison */
function contains(arr, item) { // Uses linear search for now...
    for (var i in arr)
        if (item === i) return true;
    return false;
}


/** Returns the button control element from NF by class name, undefined if NF player not loaded */
function get_controls() {
    return document.getElementsByClassName('PlayerControls--button-control-row')[0];
}
/** Returns the progress control row element from NF player by class name, undefined if NF player not loaded */
function get_progress_controls() {
    return document.getElementsByClassName('PlayerControls--progress-control-row')[0];
}

/** Returns the progress from NF player */
function get_progress() {
    var dataElement = get_progress_controls().children[0].children[0].children[0].children[2];
    var progress = {
        'elapsed': dataElement.getAttribute('aria-valuenow'),
        'max': dataElement.getAttribute('aria-valuemax'),
    }
    if (!dataElement) {
        progress = {
            'elapsed': 0,
            'max': 0
        };
    }
    return progress;
}

/** Returns true if NF player is loaded */
function is_loaded() {
    return document.getElementsByClassName('PlayerControls--button-control-row').length > 0;
}

/** Returns the pause play button element */
function get_pause_play() {
    return get_controls().children[0];
}

/** Triggered when pause play button is clicked
 *  Will set the player state manually as a re-calibration (if keyup fails)
 *  Because the click event is called after the element is changed, Pause when the element is Play
 */
function pause_play_click_listener($event) {
    if(contains($event.target.classList, 'button-nfplayerPlay')) update_player_state(PLAYER_STATE.Pause);
    else if (contains($event.target.classList, 'button-nfplayerPause')) update_player_state(PLAYER_STATE.Play);
}

/** Triggered when NF detects a keyup  */
function pause_play_keyup_listener($event) {
    if ($event.keyCode == 32) {
        var el = get_pause_play();
        if (contains(el.classList, 'button-nfplayerPlay')) update_player_state(PLAYER_STATE.Play);
        else if (contains(el.classList, 'button-nfplayerPause')) update_player_state(PLAYER_STATE.Pause);
    }
}

/** Triggered by messages from background.js */
function msg_listener(msg) {

}

function connect_port() {
    background_port = chrome.runtime.connect({name: 'ldn'});
    background_port.onMessage.addListener(msg_listener);
}

/** Register listeners
 *  Called after the main function determines NF player has been loaded
 */
function register_listeners() {

    get_pause_play().addEventListener('click', pause_play_click_listener);
    document.addEventListener('keyup', pause_play_keyup_listener);

    connect_port();

}

/** Main function (entry point) */
function main() {
    var load = setInterval(function() {
        if (is_loaded()) {
            if (debug)
                console.log('LDN has been loaded!');
            clearInterval(load);
            register_listeners();
        }
    }, 1000);
}

main();
