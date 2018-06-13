finicky.setDefaultBrowser('com.google.Chrome');

// Open Spotify links in client
finicky.onUrl(function(url, opts) {
  if (url.match(/^https?:\/\/open\.spotify\.com/)) {
    return {
      bundleIdentifier: "com.spotify.client"
    };
  }
});

// Open Slack links in client
// slack://channel?team=T0HMJC1K3&id=DAE2WRWFP&message=1526504560.000693
//finicky.onUrl(function(url, opts) {
//  if (url.match(/^https?:\/\/\w+\.slack\.com\/archives/)) {
//    return {
//      bundleIdentifier: "com.tinyspeck.slackmacgap"
//    };
//  }
//});

// Open some classes of link in Google Chrome Canary
finicky.onUrl(function(url, opts) {
  if (url.match(/^https?:\/\/\w+\.facebook\.com/)) {
    return {
      bundleIdentifier: "com.google.Chrome.canary"
    };
  }
});

// Rewrite all Bing links to DuckDuckGo instead
finicky.onUrl(function(url, opts) {
  var url = url.replace(
    /^https?:\/\/www\.bing\.com\/search/,
    "https://duckduckgo.com"
  );
  return {
    url: url
  };
});
