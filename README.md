# API2go

## Description

Simple structure to create APIs based on HTTP requests over express.

You can create RESTful or RPC APIs, using any kind of HTTP method accepted by
expressjs and customize the paths you use.

### Why use API2Go instead of express?

API2Go abstracts a lot of things that in express you would have to implement
manually, like this:

- **Logger**: API2GO() has a **logger** function publicly accessible;
- **Email**: every instance of API2Go() has also a function **sendMail** 
publicly accessible;
- **Auditing**: the API2Go logs every request, the input, the output, how many
time it tooks to process etc.

### Some things that need to be implemented

Like any one-man-army, I can't do everything at the same time, so these are some
of the things that I plan to program or want to program:

- Middleware;
- Unified and strong authentication (can't continue using the payload);
- Headers filtering;
- N-level validation on functions' map;
- Got any idea? *eduardo@quagliato.me* or add a new issue in the Github repo;

## Usage

    npm install api2go

* * * * *

To use (**from v0.0.13 and on**):
    
    var API2Go = require('api2go');

    // You can instance N API objects in the same application, but they have to
    // listen to different ports.
    var apiObj = new API2Go("path/to/config.json");

    // You can also instance a API object without a file, but informing the config
    // object right here, like this:
    var apiObj = new API2Go({
      "DEBUG_MODE"               : 1,
      "NODEJS_LISTEN_PORT"       : 3000,
      "API_FUNCTIONS_MAP"        : "_assets/functions-map.json",
      "GENERAL_LOG"              : "_logs/general.log"
    });

    // You have to register the functions that you want to make invokable
    apiObj.registerFunction("test", function(payload, requestKey, callback, req, res){
      console.log(payload);
      var returnValues = {
        "status": "OK",
        "data": data
      };

      callback(returnValues);
    },
    // This is the map for the function, it defines the path which this request can
    // be invoke and the parameters that will be validated.
    {
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

    // The API will start listen in the port you specified in the config.
    apiObj.start();

Every request must return a property *"status"* with *"OK"* or *"ERROR"*.

## Changelog

Refer to `changelog.txt` inside the repo.

## Keep in touch

Eduardo Quagliato, eduardo@quagliato.me

## License

This project is copyrighted by **MIT License** (see *license.txt*).
