
/**
	VideoGallery

	Module to handle loading and updating video lists for 
	HostBaby dashboard and themes. 

	"Define"d as a RequireJS module.
**/

/* global gapi require FB define jQuery $ */
require.config({
	paths: {
		"gapiclient" : "https://apis.google.com/js/client.js?onload=googleApiClientReady",
		"gapiplatform" : "https://apis.google.com/js/platform"
	}
});

define(["gapiclient", "gapiplatform"], function(gapiclient, gapiplatform) { // eslint-disable-line no-unused-vars
	var youtubeApiKey = "AIzaSyA__UGHFtQJWDcOgZpSo-tKDvDP2wxKiDg",
		playlistsHash = {},
		pageData = {},
		maxVideosPerPlaylist = 9,
		playlistContainerWidth = 0,
		videoElementColClass = "",
		threeColumnMin = 666,
		isMobile = false,
		playlistsLoadedTimerId = undefined;

	var displaySettings = {
		selectorPlaylistsContainer: "#playlists_container"
	};

	/* API loading *******************************************************************/
	var googleApiClientReady = function() {
		gapi.auth.init(function() {
			window.setTimeout(loadAPIClientInterfaces,1);
		});
	};

	var loadAPIClientInterfaces = function() {
		gapi.client.load("youtube", "v3", function() {
			handleAPILoaded();
		});

		// facebook embed api
		(function(d, s, id) {
			var js, fjs = d.getElementsByTagName(s)[0];
			if (d.getElementById(id)) return;
			js = d.createElement(s); js.id = id;
			js.src = "https://connect.facebook.net/en_US/sdk.js#xfbml=1&version=v2.6";
			fjs.parentNode.insertBefore(js, fjs);
			}(document, 'script', 'facebook-jssdk'))
	};

	var handleAPILoaded = function() {
		isMobile = $(window).width() < 500;
		syncPlaylists();
	};

	/** Update the playlist data
		Using either playlist_id or list of video ids, request list from API
	**/
	var syncPlaylists = function() {
		playlistsHash = {};
		$(pageData.playlist_ids).each(function(){
			var playlistId = this.toString();
			// request the playlist info
			requestVideoPlaylist(playlistId, null, function(playlistObj) {
				playlistsHash[playlistId] = playlistObj;
				redrawPlaylists();

				clearTimeout(playlistsLoadedTimerId);
				playlistsLoadedTimerId = setTimeout(function(){
					// for testing/screenshotting convenience
					$(".screenshot_now").remove();
					$(document).trigger("playlistsRendered");
					$(displaySettings.selectorPlaylistsContainer).append($("<span class='screenshot_now'></span>"));
				},1500);
			});
		});
	};

	/** Request channel info
	**/
	var requestChannelInfo = function(channelId, channelName, callbackFunction) {
		var requestOptions = {
			part: "id",
			maxResults: 1,
			key: youtubeApiKey
		};

		// api quirkiness -- request using name vs. id depending on what's provided
		if (channelName) {
			requestOptions["forUsername"] = channelName;
		} else {
			requestOptions["id"] = channelId;
		}

		var request = gapi.client.youtube.channels.list(requestOptions);
		request.execute(function(response){
			callbackFunction(response.items);
		});
	};

	/**
		Retrieve the list of videos in the specified playlist.
	**/
	var requestVideoPlaylist = function(playlistId, pageToken, callbackFunction) {
		var newPlaylist = new PlaylistObject(playlistId);

		// set up the request for playlist "meta data"
		var playlistRequestOptions = {
			"id": playlistId,
			"part": "snippet",
			"maxResults": 1,
			"key": youtubeApiKey
		};
		var playlistInfoRequest = gapi.client.youtube.playlists.list(playlistRequestOptions);

		// set up the request for playlist videos 
		var playlistVideosRequestOptions = {
			playlistId: playlistId,
			part: "snippet",
			maxResults: maxVideosPerPlaylist * 2,
			key: youtubeApiKey
		};
		var playlistVideosRequest = gapi.client.youtube.playlistItems.list(playlistVideosRequestOptions);

		playlistInfoRequest.execute(function(response) {
			if (response.items && response.items[0] && response.items[0].snippet) {
				newPlaylist.title = response.items[0].snippet.title;
				newPlaylist.channelTitle = response.items[0].snippet.channelTitle;
				newPlaylist.channelId = response.items[0].snippet.channelId;
				newPlaylist.apiResponsePlaylist = response;
				var snippetThumbnails = response.items[0].snippet.thumbnails,
					thumbnailUrl = "";
				if (snippetThumbnails) {
					if (snippetThumbnails.standard) { // most likely
						thumbnailUrl = snippetThumbnails.standard.url;
					} else if (snippetThumbnails.default) {
						thumbnailUrl = snippetThumbnails.default.url;
					}
				}
				newPlaylist.thumbnailUrl = thumbnailUrl;

				playlistVideosRequest.execute(function(response2){
					if (response2.items) {
						newPlaylist.videosList = response2.items;
						newPlaylist.videosCount = response2.result.pageInfo.totalResults;
						newPlaylist.apiResponseVideos = response2;

						// scrub invalid videos from consideration
						newPlaylist.videosList = scrubInvalidVideosFromList(newPlaylist.videosList);
						newPlaylist.apiResponseVideos.items = scrubInvalidVideosFromList(newPlaylist.apiResponseVideos.items);

						callbackFunction(newPlaylist); // return the new playlist object
					}
				});
			} else {
				callbackFunction(null, "That didn't work, check the Playlist ID or URL and try again.");
			}
		});
	};

	var scrubInvalidVideosFromList = function(listToScrub) {
		var newList = [];
		var len = listToScrub.length;
		for (var i = 0; i < len; i++) {
			var testItem = listToScrub[i];
			if (testItem.snippet && testItem.snippet.title && !hasInvalidatingTitle(testItem.snippet.title)) {
				newList.push(testItem);
			}
		}
		return newList;
	};

	/**
		playlist object
		@playlistId: string, id of youtube playlist
	**/
	var PlaylistObject = function(playlistId) {
		this.videosList = [];
		this.videosCount = 0;
		this.thumbnailUrl = "";
		this.id = playlistId;
		this.title = "";
	};

	var redrawPlaylists = function() {
		$(displaySettings.selectorPlaylistsContainer).html("");

		playlistContainerWidth = $(displaySettings.selectorPlaylistsContainer).width();
		if (playlistContainerWidth < threeColumnMin) {
			videoElementColClass = "video_element_two_col";
			maxVideosPerPlaylist = 8;
		}

		$(pageData.playlist_ids).each(function(){
			var playlistId = this.toString();
			var playlistObj = playlistsHash[playlistId];
			if (!playlistObj) {
				return true;
			}

			// if one is already made, use that, otherwise make a holder
			var playlistSelector = "#playlist_" + playlistId,
				$playlistEl = $(playlistSelector)[0] || $("<div class='playlist_holder entry_content' id='playlist_" + playlistId + "'/>"),
				$playlistHeaderEl = $(playlistSelector + " .playlist_title")[0] || $("<h2 class='playlist_title'/>");

			$playlistEl.html(""); // clear it
			$playlistHeaderEl.html(playlistObj.title);
			$playlistEl.append($playlistHeaderEl);

			var plVids = $(playlistSelector + " .playlist_videos")[0] || $("<ul class='playlist_videos'/>"),
				vidCount = 0,
				isTruncatedList = (playlistObj.videosCount > maxVideosPerPlaylist);

			$(playlistObj.videosList).each(function(){
				vidCount += 1;
				if (isTruncatedList && (vidCount >= maxVideosPerPlaylist)) {
					var playlistLink = "https://www.youtube.com/playlist?list=" + playlistId;
					plVids.append($("<div class='vid_element " + videoElementColClass + "'><div class='vid_thumbnail playlist_link' data-linkurl='" + playlistLink + "' title='View full playlist of " + playlistObj.videosList.length + " videos on YouTube.'>..</div></div>"));
					return false;
				}
				var vidEl = makeVideoElement(this);
				plVids.append(vidEl);
				addPlayButtonToVideo(vidEl);
				vidEl.css("opacity",0);
				setTimeout(function() {
					vidEl.css("opacity",1);
				}, vidCount * 100);
			});

			plVids.append($("<div style='clear:both;'> </div>")); // to pad out the container
			$playlistEl.append(plVids);
			$(displaySettings.selectorPlaylistsContainer).append($playlistEl);

			// clone svg button and append to all playlistLinks
			$(".playlist_link").html("");
			$(".see_more_videos_icon").clone().appendTo(".playlist_link");
			$(".playlist_link .see_more_videos_icon").removeClass("svg_template"); // allow it to be visible
		});
		updateVideoEmbedLinks();
		updatePlaylistEmbedLinks();
	};

	var addPlayButtonToVideo = function(vidEl) {
		// clone svg video_play button and append
		var pb = vidEl.find(".vid_play_button");
		pb.html("");
		pb.append($(".video_play_button_svg.svg_template").clone());
		pb.find(".video_play_button_svg").removeClass("svg_template");
	};

	var hasInvalidatingTitle = function(testTitle) {
		var regex = /^Deleted|Private video$/; // forbidden pattern for title
		if (testTitle.match(regex)) {
			return true;
		}
		return false;
	};

	/**
		Create the HTML for individual videos
	**/
	var makeVideoElement = function(vidItem) {
		// abort if video is deleted (weakness in YT data api)
		if (hasInvalidatingTitle(vidItem.snippet.title)) {
			return $("<div class='vid_element " + videoElementColClass + "'/>"); // blank
		}
		var videoId = vidItem.snippet.resourceId.videoId;
		var vidEl = $("<div class='vid_element " + videoElementColClass + "'/>");
		var vidThumb = $("<div class='vid_thumbnail' data-id='" + videoId + "' title='" + vidItem.snippet.title + "'/>");
		vidThumb.css("background-image","url(" + vidItem.snippet.thumbnails.high.url + ")");

		var $vidPlayButton = $("<div class='vid_play_button'/>");

		vidEl.append(vidThumb);
		vidEl.append($vidPlayButton);

		return vidEl;
	};

	var updatePlaylistEmbedLinks = function() {
		$(".playlist_widget_button").off("click").on("click", function() {
			var playlistId = $(this).data("id"),
				holder = $(this).closest(".playlist_holder").find(".playlist_videos").html(""); // empty it
			var w = $(holder).width(),
				h = w * .56;
			$(holder).append($("<iframe width='" + w + "' height='" + h + "' src='https://www.youtube.com/embed/videoseries?list=" + playlistId + "&autoplay=1' frameborder='0' allowfullscreen></iframe>"));
			$(this).hide();
			return false;
		});
	};

	/**
		Refresh the links that load video embeds
	**/
	var updateVideoEmbedLinks = function() {
		$(".vid_thumbnail,.vid_play_button").off("click").on("click", function() {
			var embedTarget = this;
			if ($(this).hasClass("vid_play_button")) {
				embedTarget = $(this).siblings(".vid_thumbnail");
			}
			embedInlineVideoPlayer(embedTarget);
		});
		$(".vid_thumbnail").off("hover").on("hover",function() {
			$(this).parent().addClass("rollover");
		}, function() {
			$(this).parent().removeClass("rollover");
		});

		// links to playlist override thumblink behavior
		$(".vid_thumbnail.playlist_link").off("click").on("click", function() {
			window.open($(this).data("linkurl"));
		});

		if (isMobile){
			embedOnlyViewportVideos();
			$(window).scroll(function(){
				embedOnlyViewportVideos();
			});
		}
	};

	var embedOnlyViewportVideos = function() {
		$(".vid_thumbnail").each(function(){
			if ($(this).hasClass("playlist_link") === false
				&& isElementInViewport(this) ) {
				setTimeout(embedInlineVideoPlayer, 1500, this); // brief blip before loading, to help communicate it is loading
			}
		});
	};

	var embedInlineVideoPlayer = function(embedTarget, requestAutoplay) {
		// abort if already embedded
		if ($(embedTarget).children("iframe").length > 0) {
			return; // skip it
		}

		var w = $(embedTarget).width();
		var h = $(embedTarget).outerHeight();
		// Create an iFrame with autoplay set to true (unless isMobile)
		var autoplayVal = (isMobile || requestAutoplay == false) ? 0 : 1;

		var vidType = $(embedTarget).data("videosource");
		var vidId = $(embedTarget).data("id");
		var iframeUrl = "";
		switch(vidType) {
			case "facebook":
				// embedding differently
				break;
			case "vimeo":
				iframeUrl = "//player.vimeo.com/video/" + vidId + "?autoplay=" + ((autoplayVal == 1) ? "true" : "false");
				break;
			case "youtube":
			default:
				iframeUrl = "//www.youtube.com/embed/" + vidId + "?iv_load_policy=3&autoplay=" + autoplayVal + "&autohide=1&border=0&html5=1";
				break;
		}

		if (vidType == "facebook") {
			autoplayVal = 1; // Always "off" for now. Trade-off between extra-click and volume-zero-on-autoplay
			var $fbVidHolder = $("<div class='fb-video' data-href='https://www.facebook.com/video.php?v=" + vidId + "' data-width='" + w + "'data-height='" + h + "' data-allowfullscreen='true' data-autoplay='" + autoplayVal + "'>");
			$(embedTarget).append($fbVidHolder);
			FB.XFBML.parse($(embedTarget)[0]);
			$(embedTarget).css({"padding-bottom":"0px", "background-color":"transparent"});
		} else {
			var iframe = document.createElement("iframe");
			$(iframe).attr("allowfullscreen","allowfullscreen");
			$(iframe).attr("width", w + "px");
			$(iframe).attr("height",h + "px");
			iframe.setAttribute("src",iframeUrl);
			iframe.setAttribute("frameborder", "0");
			$(iframe).css("position", "absolute");
			$(embedTarget).append(iframe);
		}
		$(embedTarget).css("background-image", "none");
		$(embedTarget).parent().children(".vid_play_button").hide();
	};

	/** Helper to detect if element is in viewport
	**/
	var isElementInViewport = function(el) {
		//special bonus for those using jQuery
		if (typeof jQuery === "function" && el instanceof jQuery) {
			el = el[0];
		}

		var rect = el.getBoundingClientRect();

		return (
			rect.top >= 0 &&
			rect.left >= 0 &&
			rect.bottom <= ($(window).height() + 250) &&
			rect.right <= $(window).width()
		);
	};

	var setPageData = function(pdObj) {
		pageData = pdObj;
	};

	/*	setCustomPlaylist: multi-source playlist setter 
		expects an array of objects a la: {videoId:"foo", videoSource:"bar"}
	*/
	var setCustomPlaylist = function(plArray, playlistSelector) {
		var videoPlaylist = {},
			videoPlaylistOrder = [],
			playlistRebuildTimeoutId;

		/*	nested functions to promote limited scope for playlist generation,
			allows multiple separate playlists (indicated by playlistSelector) on one page.
		*/
		var getPlaylistVideos = function(plArray) {
			videoPlaylistOrder = plArray;
			$(plArray).each(function(i){
				var vid = plArray[i].video_id; // "video_id" from public view JS
				var vsrc = plArray[i].video_source; // "video_source" from public view JS
				getVideoData(vid, vsrc);
			});
		};

		var getVideoData = function(vid, vsrc) {
			switch(vsrc) {
				case "vimeo":
					getVideoDataVimeo(vid, playlistSelector);
					break;
				case "facebook":
					getVideoDataFacebook(vid, playlistSelector);
					break;
				case "youtube":
					getVideoDataYouTube(vid, playlistSelector);
					break;
			}
		};

		var getVideoDataYouTube = function(vid) {
			$.getJSON("https://www.googleapis.com/youtube/v3/videos?id=" + vid + "&key=" + youtubeApiKey + "&part=snippet&callback=?",
				function(data){
					if (typeof(data.items[0]) != "undefined") {
						var snippet = data.items[0].snippet;
						snippet["video_id"] = data.items[0].id;
						addVideoToPlaylist(vid, "youtube", snippet);
						window.clearTimeout(playlistRebuildTimeoutId);
						playlistRebuildTimeoutId = window.setTimeout(function(){
							rebuildPlaylistElement();
						}, 1000);
					}
				}
			);
		};

		var getVideoDataVimeo = function(vid) {
			$.get("https://vimeo.com/api/oembed.json?url=https%3A//vimeo.com/" + vid,
				function(s){
					addVideoToPlaylist(vid, "vimeo", s);
					window.clearTimeout(playlistRebuildTimeoutId);
					playlistRebuildTimeoutId = window.setTimeout(function(){
						rebuildPlaylistElement();
					}, 1000);
				}, "json");
		};

		var getVideoDataFacebook = function(vid) {
			// fake response
			response = {
				"embed_html": null,
				"id": vid,
				"picture": "https://graph.facebook.com/" + vid + "/picture",
				"title": "Facebook video"
			};
			addVideoToPlaylist(vid, "facebook", response);
			window.clearTimeout(playlistRebuildTimeoutId);
			playlistRebuildTimeoutId = window.setTimeout(function() {
				rebuildPlaylistElement();
			}, 1000);
		};

		var addVideoToPlaylist = function(vId, vSource, vJson) {
			videoPlaylist[vId] = {
				"videoSource": vSource,
				"json": vJson
			};
		};

		var rebuildPlaylistElement = function() {
			var vpElement = $(playlistSelector);
			vpElement.empty();
			$.each(videoPlaylistOrder, function(i){
				var vpobj = videoPlaylist[videoPlaylistOrder[i].video_id];
				if (vpobj) {
					var vhEl = buildVideoHolderElement(vpobj);
					vpElement.append(vhEl);
				}
			});
			vpElement.toggleClass("loading",false);
		};

		var buildVideoHolderElement = function(vidObj) {
			playlistContainerWidth = $(displaySettings.selectorPlaylistsContainer).width();
			videoElementColClass = (playlistContainerWidth < threeColumnMin) ? "video_element_two_col" : "";

			var vjson = vidObj.json,
				videoId = vjson.video_id || vjson.id,
				vidTitle = escapeHtml(vjson.title),
				vidEl = $("<div class='vid_element " + videoElementColClass + "'/>"),
				vidThumb = $("<div class='vid_thumbnail' data-id='" + videoId + "' data-videosource='" + vidObj.videoSource + "' title='" + vidTitle + "'/>");

			switch(vidObj.videoSource) {
				case "facebook":
					vidThumb.css("background-image","url(" + vjson.picture + ")");
					break;
				case "vimeo":
					vidThumb.css("background-image","url(" + vjson.thumbnail_url + ")");
					break;
				case "youtube":
					vidThumb.css("background-image","url(" + vjson.thumbnails.medium.url + ")");
					break;
			}

			var $vidPlayButton = $("<div class='vid_play_button'/>");

			vidEl.append(vidThumb);
			vidEl.append($vidPlayButton);
			addPlayButtonToVideo(vidEl);

			vidEl.find(".vid_thumbnail,.vid_play_button").on("click", function(){
				var embedTarget = this;
				if ($(this).hasClass("vid_play_button")) {
					embedTarget = $(this).siblings(".vid_thumbnail");
				}
				embedInlineVideoPlayer(embedTarget);
			});
			return vidEl;
		};

		getPlaylistVideos(plArray);
	};

	var entityMap = {
		"&": "&amp;",
		"<": "&lt;",
		">": "&gt;",
		'"': "&quot;", // eslint-disable-line quotes
		"'": "&#39;",
		"/": "&#x2F;",
		"`": "&#x60;",
		"=": "&#x3D;"
	};

	var escapeHtml = function(string) {
		return String(string).replace(/[&<>"'`=\/]/g, function (s) { // eslint-disable-line no-useless-escape
			return entityMap[s];
		});
	};

	// external-facing vars and functions
	return {
		googleApiClientReady: googleApiClientReady,
		setPageData: setPageData,
		requestVideoPlaylist: requestVideoPlaylist,
		hasInvalidatingTitle: hasInvalidatingTitle,
		requestChannelInfo: requestChannelInfo,
		setCustomPlaylist: setCustomPlaylist,
		youtubeApiKey: youtubeApiKey
	};
});
