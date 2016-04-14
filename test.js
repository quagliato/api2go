//test.js

var API2Go = require('./api.js');
var apiObj = new API2Go({"NODEJS_LISTEN_PORT":"8787"});

apiObj.registerFunction("test", function(data, requestKey, callback, req){
  callback({"status": "OK"});
});

apiObj.start();


var http = require('http');

var options = {
  host: '127.0.0.1',
  port: '8787',
  path: '/test',
  method: 'POST'
};

var req = http.request(options, function(res){
  res.on('data', function(chunk){
    var obj = chunk;

    try {
      var obj = JSON.parse(chunk);
    } catch (e) {
      console.log("ERROR: " + e.message);
      process.exit(1);
    }

    if (obj.hasOwnProperty("status") && obj.status == "OK") {
      console.log("Everything's fine.");
      process.exit(0);
    } else {
      process.exit(1);
    }

  });
}).on('error', function(e){
  console.log("ERROR: " + e.message);
  process.exit(1);
});

req.write('{}');

req.end();
