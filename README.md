# Setup

You must create an app under in the YouTube Developer portal.  (https://console.developers.google.com/start)[https://console.developers.google.com/start]

Create a settings.json file in the root plugin directory with the following structure:

```
{
	"youtubeApiKey" : "YOUTUBE_API_KEY",
	"requiredVotesToSkip" : 3
}
```

# Commands

Once you've setup the `settings.json` file, make sure you have the client app running.
To run the new client app:
  * Make sure the bot is running
  * Open a new terminal window and navigate to `/client`
  * Run `python -m SimpleHTTPServer {PORT}`
  * Navgiate to `localhost:{PORT}/#{USERNAME}`
  * The websocket connection should happen, any plugin code should be loaded, and then the client page should be ready to go.

Once the client app is running, you can use the following commands:

* !play - Starts the player
* !pause - Pauses the player
* !skip - As a moderator: Skips the track (currently random)
* !skip - As a viewer: Places a vote to skip the track. The number of votes required is defined in the `requiredVotesToSkip` setting
* !request {YOUTUBE_VIDEO_ID} - Adds the request YouTube video to the playlist
