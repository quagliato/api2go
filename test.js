//test.js

var async = require('async');

var API2Go = require('./api.js');
var apiObj = new API2Go({"NODEJS_LISTEN_PORT":"8787"});

// RPC example
apiObj.registerFunction("test", function(payload, requestKey, callback, req, res){
  callback({"status": "OK"});
});

// REST example
apiObj.registerFunction("test2", function(payload, requestKey, callback, req, res){
  callback({"status": "OK", "ID": req.params.id});
});

apiObj.start();

var testOptions = [
  {
    host: '127.0.0.1',
    port: '8787',
    path: '/test',
    method: 'POST'
  },
  {
    host: '127.0.0.1',
    port: '8787',
    path: '/default/123abc',
    method: 'GET'
  }
];

var testFunctions = [];

for (var i = 0; i < testOptions.length; i++) {
  var requestOptions = testOptions[i];
  testFunctions[testFunctions.length] = function(callback){
    var http = require('http');
    var options = requestOptions;
    var req = http.request(options, function(res){
      res.on('data', function(chunk){
        var obj = chunk;

        try {
          var obj = JSON.parse(chunk);
        } catch (e) {
          console.log("ERROR+ " + e.message);
          process.exit(1);
        }

        if (obj.hasOwnProperty("status") && obj.status == "OK") {
          console.log("Everything's fine.");
          callback(null, 0);
        } else {
          console.log("ERROR!");
          process.exit(1);
        }

      });
    }).on('error', function(e){
      console.log("ERROR- " + e.message);
      process.exit(1);
    });

    req.write('{}');
    req.end();
  };
}

async.parallel(testFunctions, function(err, results){
  var ok = true;
  for (var i = 0; i < results.length; i++) {
    if (results[i] !== 0) ok = false;
  }

  if (ok) {
    process.exit(0);
  } else {
    process.exit(1);
  }
});
