// This should probably be split across multiple files for the routes
// and a config folder/file.  But for such a small problem, I just
// dumped it all into one file (this one)

var express = require("express");
var OAuth = require("oauth").OAuth;
var cookieParser = require('cookie-parser');
var session = require('express-session');
var logfmt = require("logfmt");

var site = "http://127.0.0.1:3000";
if (process.env.NODE_ENV == "production") {
  site = "http://sheltered-scrubland-1187.herokuapp.com";
}

var TWITTER_CONSUMER_KEY = process.env.TWITTER_CONSUMER_KEY || "<insert consumer key here>";
var TWITTER_CONSUMER_SECRET = process.env.TWITTER_CONSUMER_SECRET || "<insert consumer secret here>";
var twitterSearchTweetsUrl = "https://api.twitter.com/1.1/search/tweets.json";
var twitterTimelineUrl = "https://api.twitter.com/1.1/statuses/user_timeline.json";
var twitterAuthenticateUrl = "https://twitter.com/oauth/authenticate";

var app = express();
app.set('views', __dirname + '/views');
app.set('view engine', 'jade');
app.use('/public', express.static(__dirname + '/public'));
app.use(logfmt.requestLogger());
app.use(cookieParser());
app.use(session({secret: 'purple monkey dishwasher'}));

var twitterCallbackURL = site + "/auth/twitter/callback";
var oauth = new OAuth(
      'https://api.twitter.com/oauth/request_token',
      'https://api.twitter.com/oauth/access_token',
      process.env.TWITTER_CONSUMER_KEY,
      process.env.TWITTER_CONSUMER_SECRET,
      '1.0',
      twitterCallbackURL,
      'HMAC-SHA1');

app.get('/', function(req, res) {
  res.render('index', 
    { loggedIn: (!!req.session.oauth) });
});

app.get('/logout', function(req, res) {
  req.session.oauth = undefined;
  res.redirect('/');
});

app.get('/search', isLoggedIn, function(req, res) {
  var reqUrl = twitterSearchTweetsUrl + "?q=" + req.query.q;
  reqUrl += "&result_type=mixed";
  oauth.get(reqUrl,
    req.session.oauth.access_token,
    req.session.oauth.access_token_secret,
    function (error, data, response) {
      if (error) {
        console.log("Error searching: " + error);
      } else {
        res.render('index', 
          { tweets: JSON.parse(data).statuses,
            q: req.query.q,
            loggedIn: (!!req.session.oauth)
          });
      }
    });
});

app.get('/search/user', isLoggedIn, function(req, res) {
  if (req.query.username) {
    res.redirect('/timeline/' + req.query.username);
  } else {
    res.redirect('/');
  }
});

app.get('/timeline/:user', isLoggedIn, function(req, res) {
  var reqUrl = twitterTimelineUrl + "?screen_name=" + req.params.user;
  reqUrl += "&count=200";
  oauth.get(reqUrl,
    req.session.oauth.access_token,
    req.session.oauth.access_token_secret,
    function (error, data, response) {
      if (error) {
        console.log("Error searching: " + error);
      } else {
        var tweets = JSON.parse(data);
        
        var tweet_texts = [];
        var coordinates = [];
        
        for (i in tweets) {
          if (tweets[i].place) {
            var coord = tweets[i].place.bounding_box.coordinates[0][0];
            var index = -1;
            for (j in coordinates) {
              if (coord[0] == coordinates[j][0] && coord[1] == coordinates[j][1]) {
                index = j;
              } 
            }
            if (index >= 0) {
              tweet_texts[index].push(tweets[i].text);
            } else {
              coordinates.push(coord);
              tweet_texts.push(new Array(tweets[i].text));
            }
          }
        }
        res.render('index', 
          { tweets: tweets,
            tweet_locations: JSON.stringify({coordinates: coordinates, tweet_texts:tweet_texts}),
            screen_name: req.params.user,
            loggedIn: (!!req.session.oauth)
          });
      }
    });
});

app.get('/auth/twitter', function(req, res) {
  oauth.getOAuthRequestToken(function(error, oauth_token, oauth_token_secret, results){
    if (error) {
      console.log(error);
      res.send("didn't work." + error);
    } else {
      req.session.oauth = {};
      req.session.oauth.token = oauth_token;
      req.session.oauth.token_secret = oauth_token_secret;
      res.redirect(twitterAuthenticateUrl + "?oauth_token=" + oauth_token);
   }
  });
});
 
app.get('/auth/twitter/callback', function(req, res, next) {
  req.session.oauth.verifier = req.query.oauth_verifier;
  var oauth_data = req.session.oauth;
     
  oauth.getOAuthAccessToken(
  oauth_data.token,
  oauth_data.token_secret,
  oauth_data.verifier,
  function(error, oauth_access_token, oauth_access_token_secret, results) {
    if (error) {
      console.log(error);
      res.send("Authentication Failure!");
    } else {
      req.session.oauth.access_token = oauth_access_token;
      req.session.oauth.access_token_secret = oauth_access_token_secret;
      res.send("Authentication Successful");
      res.redirect('/');  //You might actually want to redirect!
    }
  });
});

var port = Number(process.env.PORT || 5000);
app.listen(port, function() {
  console.log("Listening on " + port);
});

function isLoggedIn(req, res, next) {
  if (req.session.oauth) { return next(); }
  res.redirect('/');
}
