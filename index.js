'use strict';

/*
	Song commands:

	!upcoming - List next 5 songs
	!song/!track/!music - current song
	!request URL - request a youtube link to be played
	!skip - skips the track
	!pause - pauses the track
	!play - plays the current track in the play list
 */
const YouTube = require('youtube-node');
const runtime = require('../../utils/Runtime');
const Log = require('../../utils/Log');
const Websocket = require('../../utils/Websocket');
const pluginSettings = require('./settings.json');
const requiredVotesToSkip = pluginSettings.requiredVotesToSkip || 3;
const requestSongRegex = new RegExp( /^(!|\/)request\s(.+)$/ );

const brainKey = 'plugin-youtube';

module.exports = [{
	// Reset current song index and playing boolean
    types: ['startup'],
    action: function( chat ) {
		let player = getPlayer( chat );
		player.playing = false;
		player.started = false;
		player.skipVotes = player.skipVotes || [];
		setPlayer( player, chat );
    }
}, {
	// Tell the chat what the current song is
	name: '!song !track !music !current',
	help: 'Display the currently playing song.',
	types: ['message'],
    regex: /^(!|\/)(song|track|music|current)$/,
    action: function( chat, stanza ) {
		let player = getPlayer( chat );
		let playlist = getPlaylist( chat );

		if ( player.playing && playlist.length > 0 ) {
			// Player is playing a song
			let currentSong = playlist[ player.currentSongIndex ];
			chat.sendMessage( `Current song: ${currentSong.title}`)
		} else {
			// Player is paused or playlist is empty
			chat.sendMessage( 'No song current playing.' );
		}
    }
}, {
	// Request a song
	name: '!request {youtube_id}',
	help: 'Add a YouTube video to the playlist.',
    types: ['message'],
    regex: requestSongRegex,
    action: function( chat, stanza ) {
		let match = requestSongRegex.exec( stanza.message );
		let youtubeID = match[2];

		// Look up the song information
		let youtube = getYoutubeClient( chat );
		youtube.getById( youtubeID, function(err, result) {
			if ( err ) {
				console.log( '[playlist] Error requesting youtube data:', err );
				return;
			}

			if ( result.items.length === 0 ) {
				chat.replyTo( stanza.user.username, 'Your song could not be found.' );
				return;
			}

			let videoObj = result.items[0].snippet;
			let playlist = getPlaylist( chat );
			let songObj = {
				youtubeID: youtubeID,
				requestedBy: stanza.user.username,
				time: new Date().getTime(),
				title: videoObj.title
			};
			playlist.push( songObj );
			setPlaylist( playlist, chat );

			Log.log( `[playlist] Song: ${videoObj.title} has been added to the playlist by ${stanza.user.username}` );
			chat.replyTo( stanza.user.username, `${videoObj.title} has been added to the playlist!` );
		} )

    }
}, {
	// Remove current song
	// MOD only
	name: '!remove',
	help: 'Remove the current song from the playlist (Mod only).',
    types: ['message'],
    regex: /^(!|\/)remove$/,
    action: function( chat, stanza ) {
		let player = getPlayer( chat );
		let playlist = getPlaylist( chat );

		if ( player.playing && stanza.user.isModerator() ) {
			playlist.splice( player.currentSongIndex, 1 );

			// If the song we're removing is not the first song,
			// decrease the index by 1, so 'skipSong' can properly
			// increase the index to the next song
			if ( player.currentSongIndex > 0 ) {
				player.currentSongIndex--;
				setPlayer( player, chat );
			}

			setPlaylist( playlist, chat );
			skipSong( chat );
		}

    }
}, {
	// Skip current song
	// MOD only - or vote to skip, any user
	name: '!skip',
	help: 'Skip the song if moderator, else place a vote to skip the song.',
    types: ['message'],
    regex: /^(!|\/)skip$/,
    action: function( chat, stanza ) {
		let player = getPlayer( chat );

		if ( stanza.user.isModerator() ) {
			skipSong( chat );
		} else {
			if ( player.skipVotes.indexOf( stanza.user.username ) === -1 ) {
				player.skipVotes.push( stanza.user.username );
				setPlayer( player, chat );

				if ( player.skipVotes.length >= requiredVotesToSkip ) {
					chat.sendMessage('Required votes to skip met, skipping song.');
					skipSong( chat );
				} else {
					let remainingVotesNeeded = requiredVotesToSkip - player.skipVotes.length;
					let voteText = remainingVotesNeeded === 1 ? 'vote' : 'votes';
					chat.sendMessage( `Song skip vote recorded. ${remainingVotesNeeded} more ${voteText} needed to skip song.` );
				}
			}

		}
    }
}, {
	// Pause current song
	// MOD only
	name: '!pause',
	help: 'Pauses the YouTube player.',
    types: ['message'],
    regex: /^(!|\/)pause$/,
    action: function( chat, stanza ) {
		let player = getPlayer( chat );
		if ( stanza.user.isModerator() ) {
			player.playing = false;
			setPlayer( player, chat );

			Websocket.sendMessage( chat.credentials.room, {
				message: 'youtube-pause'
			});
		}
    }
}, {
	// Play current song
	// MOD only
	name: '!play',
	help: 'Plays the YouTube player.',
    types: ['message'],
    regex: /^(!|\/)play$/,
    action: function( chat, stanza ) {
		let player = getPlayer( chat );
		if ( stanza.user.isModerator() ) {
            player.playing = true;
			setPlayer( player, chat );

			if ( !player.started ) {
                player.started = true;
                setPlayer( player, chat );
                skipSong( chat );
            }

			Websocket.sendMessage( chat.credentials.room, {
				message: 'youtube-play'
			});
		}
    }
}, {
    types: ['websocket'],
    regex: /^isPlaying$/,
    action: function( chat, messageObj ) {
		let player = getPlayer( chat );
		player.started = player.playing = messageObj.data;
		setPlayer( player, chat );
    }
}, {
	// Skips to the next song when the player is finished playing a song
    types: ['websocket'],
	regex: /^songEnded$/,
    action: function( chat, messageObj ) {
		skipSong( chat );
    }
}];

/**
 * Skips to the next song
 * @param  {Client} chat
 * @return void
 */
function skipSong( chat ) {
	let player = getPlayer( chat );
	let playlist = getPlaylist( chat );
    let playlistLength = playlist.length;

    if ( playlistLength < 3 ) {
        chat.sendMessage("Not enough songs in the playlist to skip! Add more songs!");
        return;
    }

	// Clear out the previous tracks if there are
	// more than half of the playlist items in the previous tracks
	if ( player.previousTracks.length > ( playlistLength / 2 ) ) {
        console.log('[playlist] Removing first track from previousTracks array');
		player.previousTracks.shift();
	}

	// Push the current track into the previous tracks array
	player.previousTracks.push( player.currentSongIndex );

	// Find the next track
	let nextTrackIndex = getNextSongIndex( chat );
	while ( player.previousTracks.indexOf( nextTrackIndex ) >= 0 ) {
		nextTrackIndex = getNextSongIndex( chat );
	}

	player.currentSongIndex = nextTrackIndex;
	player.skipVotes = [];
	setPlayer( player, chat );

	Log.log( `[playlist] Skipping song, new index: ${player.currentSongIndex} out of ${playlist.length}`);

	if ( player.playing && playlistLength > 0 ) {
		// Player is playing a song
		let currentSong = playlist[ player.currentSongIndex ];
		Websocket.sendMessage( chat.credentials.room, {
			message: 'youtube-skip',
			youtubeID: currentSong.youtubeID
		});
	}
}

function getNextSongIndex( chat ) {
	let playlist = getPlaylist( chat );
	return Math.floor( Math.random() * playlist.length );
}

/**
 * Returns the youtube-node client.
 * @param  {Client} chat
 * @return {YouTube}
 */
function getYoutubeClient( chat ) {
	let youtube = new YouTube();
	youtube.setKey( pluginSettings.youtubeApiKey );
	return youtube;
}

/**
 * Get the player status from the brain.
 * @param {Client} chat
 * @return {obj} player
 */
function getPlayer( chat ) {
	return runtime.brain.get( 'plugin-youtube-song-player' ) || {
		playing: false,
		currentSongIndex: 0,
		previousTracks: []
	};
}

/**
 * Save the player status to the brain.
 * @param {obj} player
 * @param {Client} chat
 */
function setPlayer( player, chat ) {
	runtime.brain.set( 'plugin-youtube-song-player', player );
}

/**
 * Returns the playlist from the brain.
 * @param  {Client} chat
 * @return {array}
 */
function getPlaylist( chat ) {
	return runtime.brain.get( 'plugin-youtube-playlist' ) || [];
}

/**
 * Saves the playlist to the brain.
 * @param  {array} playlist
 * @param  {Client} chat
 * @return void
 */
function setPlaylist( playlist, chat ) {
	runtime.brain.set( 'plugin-youtube-playlist', playlist );
}
