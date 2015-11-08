module.exports = {
	name: 'youtube',
	dependencies: [{
		name: 'youtubeApi',
		url: 'https://www.youtube.com/iframe_api'
	}],
	html: '<div id="player"></div>',
	func: function( socket, username ) {
        socket.send( JSON.stringify({
            message: 'isPlaying',
            data: false
        }) );

		var yt;
		function onYouTubeIframeAPIReady() {
			yt = new YT.Player('player', {
				height: '390',
				width: '640',
				videoId: 'M7lc1UVf-VE',
				events: {
					onStateChange: onStateChange
				}
			});
		}
		onYouTubeIframeAPIReady();

		function onStateChange(e) {
			if ( e.data === YT.PlayerState.PLAYING ) {
				isPlaying = true;
			} else if ( e.data === YT.PlayerState.PAUSED ) {
				isPlaying = false;
			} else if ( e.data === YT.PlayerState.ENDED ) {
				isPlaying = false;
				// tell bot we need a new song
				if ( socket ) {
					socket.send( JSON.stringify({
						message: 'songEnded'
					}) );
				}
			}
		}

		registerSocketMessage( 'youtube-play', function( messageObj ) {
			if ( messageObj.message === 'youtube-play' ) {
				if ( yt ) {
					yt.playVideo();
				}
			}
		} );

		registerSocketMessage( 'youtube-pause', function( messageObj ) {
			if ( messageObj.message === 'youtube-pause' ) {
				if ( yt ) {
					yt.stopVideo();
				}
			}
		} );

		registerSocketMessage( 'youtube-skip', function( messageObj ) {
			if ( messageObj.message === 'youtube-skip' ) {
				if ( yt ) {
					yt.playVideo();
					yt.loadVideoById( messageObj.youtubeID );
				}
			}
		} );
	}
};
