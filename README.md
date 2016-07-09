# API2go

## Description

Simple structure to create APIs based on HTTP requests over express

## Usage

To install the package:
```
// Go to your project's directory
// Enter your node_modules directory
npm install api2go
```

* * * * *

To use (**from v0.0.13 and on**):
```
var API2Go = require('api2go');
var apiObj = new API2Go("path/to/config.json");
apiObj.registerFunction("test", function(payload, requestKey, callback, req, res){
  console.log(pauload);
  var returnValues = {
    "status": "OK",
    "data": data
  };

  callback(returnValues);
},{
  "path": ":id",
  "module": "default",
  "method": "get",
  "params": [
    {
      "paramName": "parameter1",
      "type": "string",
      "mandatory": false,
      "validation": {
        "longerThan": "5",
        "smallerThan": "100"
      }
    },
    {
      "paramName": "parameter2",
      "type": "string",
      "mandatory": false,
      "validation": {
        "longerThan": "60",
        "smallerThan": "65"
      }
    }
  ]
});
apiObj.start();
```

* * * * *

To use (**from v0.0.10 to v0.0.12**):
```
var API2Go = require('api2go');
var apiObj = new API2Go("path/to/config.json");
apiObj.registerFunction("test", function(data, requestKey, callback, requestObj){
  console.log(data);
  var returnValues = {
    "status": "OK",
    "data": data
  };

  callback(returnValues);
},{
  "params": [
    {
      "paramName": "parameter1",
      "type": "string",
      "mandatory": false,
      "validation": {
        "longerThan": "5",
        "smallerThan": "100"
      }
    },
    {
      "paramName": "parameter2",
      "type": "string",
      "mandatory": false,
      "validation": {
        "longerThan": "60",
        "smallerThan": "65"
      }
    }
  ]
});
apiObj.start();

// OR
var configs = {};

var API2Go = require('api2go');
var apiObj = new API2Go(configs);

apiObj.registerFunction("test", function(data, requestKey, callback, requestObj){
  console.log(data);
  var returnValues = {
    "status": "ERROR",
    "data": data
  };

  callback(returnValues);
},{
  "params": [
    {
      "paramName": "parameter1",
      "type": "string",
      "mandatory": false,
      "validation": {
        "longerThan": "5",
        "smallerThan": "100"
      }
    },
    {
      "paramName": "parameter2",
      "type": "string",
      "mandatory": false,
      "validation": {
        "longerThan": "60",
        "smallerThan": "65"
      }
    }
  ]
});

apiObj.start();
```

* * * * *

To use (**before v0.0.10**):
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
  },{
    "params": [
      {
        "paramName": "parameter1",
        "type": "string",
        "mandatory": false,
        "validation": {
          "longerThan": "5",
          "smallerThan": "100"
        }
      },
      {
        "paramName": "parameter2",
        "type": "string",
        "mandatory": false,
        "validation": {
          "longerThan": "60",
          "smallerThan": "65"
        }
      }
    ]
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
  },{
    "params": [
      {
        "paramName": "parameter1",
        "type": "string",
        "mandatory": false,
        "validation": {
          "longerThan": "5",
          "smallerThan": "100"
        }
      },
      {
        "paramName": "parameter2",
        "type": "string",
        "mandatory": false,
        "validation": {
          "longerThan": "60",
          "smallerThan": "65"
        }
      }
    ]
  });
});
```

Every request must return a property *"status"* with *"OK"* or *"ERROR"*.

## Keep in touch

Eduardo Quagliato, eduardo[at]quagliato[dot]me

## License

This project is copyrighted by **MIT License** (see *license.txt*).
