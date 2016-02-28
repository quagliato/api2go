# API2go

## Description

Simple structure to create APIs based on HTTP requests over express

## Usage

To install the package:
```
// Go to your project's directory
// Enter your node_modules directory
git clone http://github.com/quagliato/api2go
cd api2go
npm install
```

To use:
```
var api = require('api2go');
var apiInstance = api.new("path/to/config.json", function(apiObj){
  apiObj.registerFunction("test", function(data, requestKey, callback){
    console.log(data);
    var returnValues = {
      "status": "OK",
      "data": data
    };

    callback(returnValues);
  });
});

// OR

var configs = {};

var apiInstance = api.new(configs, function(apiObj){
  apiObj.registerFunction("test", function(data, requestKey, callback){
    console.log(data);
    var returnValues = {
      "status": "ERROR",
      "data": data
    };

    callback(returnValues);
  });
});
```

Every request must return a property *"status"* with *"OK"* or *"ERROR"*.

## Keep in touch

Eduardo Quagliato, eduardo[at]quagliato[dot]me

## License

This project is copyrighted by **MIT License** (see *license.txt*).
