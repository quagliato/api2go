//test.js

var async = require('async');
var fs = require('fs');
var request = require('request'); 

var API2Go = require('./api.js');
var apiObj = new API2Go({"NODEJS_LISTEN_PORT":"8787"});

async.series([

  // Register everything
  function(cb) {
    // RPC example
    apiObj.registerFunction("test", function(payload, requestKey, callback, req, apiObj){
      callback({"status": "OK"});
    });

    // REST example
    apiObj.registerFunction("test2", function(payload, requestKey, callback, req, apiObj){
      callback({"status": "OK", "ID": req.params.id});
    });

    apiObj.registerFunction('changelog', function(payload, reqKey, callback, req, apiObj){
      var changelogPath = __dirname + '/changelog.txt';
      fs.readFile(changelogPath, {
        encoding: 'utf8',
        flag: 'r'
      }, function(err, data){
        if (err) {
          return callback({
            status: 'ERROR',
            description: 'Changelog not found'
          }, {
            status: 500
          });
        }

        callback(changelogPath, {
          file: 1
        });
      });
    }, {
      path: 'changelog',
      module: 'test',
      method: 'get',
      params: []
    });

    apiObj.registerFunction('error500', function(payload, reqKey, callback, req, apiObj){
      callback({
        status: 'ERROR',
        description: 'Testing error'
      }, {
        status: 500
      });
    }, {
      path: 'error',
      module: 'test',
      method: 'delete',
      params: []
    });

    apiObj.start();
    cb();
  },

  // 1st test
  function(cb){
    var requestOptions = {
      url: 'http://localhost:' + apiObj.config.NODEJS_LISTEN_PORT + '/test',
      method: 'POST',
      json: {
        parameter1: '123456',
        parameter2: '1234567890123456789012345678901234567890123456789012345678901234'
      }
    };

    request(requestOptions, function(err, httpResponse, body){
      if (err) return cb(err);

      console.log(body);
      console.log(body.status);
      console.log(httpResponse.statusCode);
      console.log(httpResponse.headers);

      if (body.status === 'OK' && 
          httpResponse.statusCode === 200 && 
          httpResponse.headers['content-type'].indexOf('application/json') >= 0) {
        return cb();
      } else {
        return cb(new Error('Problem on first test!'));
      }
    })
  },

  // 2st test
  function(cb){
    var id = parseInt(Math.random() * 1000);
    var requestOptions = {
      url: 'http://localhost:' + apiObj.config.NODEJS_LISTEN_PORT + '/default/' + id,
      method: 'GET'
    };

    request(requestOptions, function(err, httpResponse, body){
      if (err) return cb(err);

      try {
        body = JSON.parse(body);
      } catch (e) {
        return cb(new Error('Response body is not a valid JSON on second test.'));
      }

      console.log(id);
      console.log(body);
      console.log(body.status);
      console.log(httpResponse.statusCode);
      console.log(httpResponse.headers);

      if (body.status === 'OK' && 
          parseInt(body.ID) === id && 
          httpResponse.statusCode === 200 && 
          httpResponse.headers['content-type'].indexOf('application/json') >= 0) {
        return cb();
      } else {
        return cb(new Error('Problem on second test!'));
      }
    })
  },

  // 3rd test
  function(cb){
    var requestOptions = {
      url: 'http://localhost:' + apiObj.config.NODEJS_LISTEN_PORT + '/test/changelog',
      method: 'GET'
    };

    request(requestOptions, function(err, httpResponse, body){
      if (err) return cb(err);

      console.log(body);
      console.log(body.status);
      console.log(httpResponse.statusCode);
      console.log(httpResponse.headers);

      if (httpResponse.statusCode !== 200) return cb(new Error('Third test did not return status 200.'));
      if (httpResponse.headers['content-type'].indexOf('text/plain') === -1) return cb(new Error('Third test did not return text/plain.'));
      if (body.length === 0) return cb(new Error('Third test returned a empty body'));

      cb();
    });
  },

  // 4th test
  function(cb){
    var requestOptions = {
      url: 'http://localhost:' + apiObj.config.NODEJS_LISTEN_PORT + '/test/error',
      method: 'DELETE'
    };

    request(requestOptions, function(err, httpResponse, body){
      console.log(err);
      console.log(httpResponse.statusCode);
      console.log(body);

      if (err) return cb(new Error('Error on fourth test\'s request.'));
      if (httpResponse.statusCode !== 500) return cb(new Error('The fourth test did not return status 500.'));
      try {
        body = JSON.parse(body);
      } catch (e) {
        return cb(new Error('Fourth test did not return a valid JSON.'));
      }
      
      cb();
    });
  }
], function(err){
  if (err) {
    console.log('TEST FAILED!')
    console.log(err);
    process.exit(1);
  }

  console.log('TEST SUCCEEDED!');
  process.exit(0);
});
