// REST API Module based on express
// Created by Eduardo Quagliato <eduardo@quagliato.me>
// São Paulo, Brasil
// 2015-12-21

// DEPENDENCIES (in alphabetical order)
var bodyParser                   = require('body-parser');
var cluster                      = require('cluster');
var express                      = require('express');
var fs                           = require('fs');
var moment                       = require('moment');
var sha1                         = require('sha1');

// CUSTOM DEVELOPED MODULES
// logger                       = require('./logger.js');

String.prototype.format = function()
{
   var content = this;
   for (var i=0; i < arguments.length; i++)
   {
        var replacement = '{' + i + '}';
        content = content.replace(replacement, arguments[i]);
   }
   return content;
};


module.exports = {
  new                        : function(configSettings, callback){

    var apiObj = {};
    apiObj.functions = [];
    apiObj.functionsMap = {};
    apiObj.audit = [];

    /**************************************************************************/
    /* AUDIT - BEGIN */
    /**************************************************************************/
    var startAudit = function(functionName, values) {
      var requestInfo = {
        "function": functionName, 
        "values": values, 
        "begin-time": moment().format("YYYYMMDDHHmmssSSSZZ")
      };

      var requestKey = sha1(JSON.stringify(requestInfo));
      requestInfo["requestKey"] = requestKey;

      apiObj.audit[requestKey] = requestInfo;

      //TODO: Store requestKey, functionName and values
      apiObj.logger(JSON.stringify(apiObj.audit[requestKey]), "REQUEST-BEGIN", apiObj.config.AUDIT_LOG);

      return requestKey;
    }

    var finishAudit = function(requestKey, returnValues) {
      if (typeof returnValues === "string") returnValues = JSON.parse(returnValues);

      var requestInfo = apiObj.audit[requestKey];

      requestInfo["end-time"] = moment().format("YYYYMMDDHHmmssSSSZZ");

      var beginMoment = moment(requestInfo["begin-time"], "YYYYMMDDHHmmssSSSZZ");
      var endMoment = moment(requestInfo["end-time"], "YYYYMMDDHHmmssSSSZZ");

      var minutes = endMoment.diff(beginMoment, "minutes");
      var seconds = endMoment.diff(beginMoment, "seconds");
      var milliseconds = endMoment.diff(beginMoment, "milliseconds");

      requestInfo["duration"] = minutes + "m" + (seconds - (minutes * 60)) + "s" + (milliseconds - (seconds * 1000)) + "ms";
      requestInfo["returnValues"] = returnValues;

      var auditInfo = {};
      auditInfo[requestKey] = requestInfo;
      apiObj.logger(JSON.stringify(auditInfo), "REQUEST-END", apiObj.config.AUDIT_LOG);

      // if (returnValues.hasOwnProperty("status")) {
      //   response.json(returnValues).end();
      // }
    }

    /**************************************************************************/
    /* AUDIT - END */
    /**************************************************************************/


    apiObj.registerFunction = function(functionName, processing, functionMap) {
      apiObj.logger("New function registered: {0}".format(functionName), "INFO");
      apiObj.functions[functionName] = processing;
      if (functionMap !== undefined) {
        apiObj.functionsMap[functionName] = functionMap;
      }
    };

    /**************************************************************************/
    /* LOGGER */
    /**************************************************************************/
    apiObj.logger = logger = function(message, level, filename) {
      var LOG_FILENAME = apiObj.config.GENERAL_LOG;
      var MAX_FILESIZE = apiObj.config.MAX_LOG_FILESIZE; // 10MB

      if (filename === undefined) filename = LOG_FILENAME;
      if (level === undefined) level = "INFO";
      var logTimestamp = moment().format("YYYY-MM-DD HH:mm:ss.SSS ZZ");

      if (filename !== undefined) {
        fs.lstat(filename, function(err, stats){
          if (err) {
            print(filename, message, level, logTimestamp);
          } else {  
            if (stats.size >= MAX_FILESIZE) {
              rotate(filename, function(){
                print(filename, message, level, logTimestamp);
              });
            } else {
              print(filename, message, level, logTimestamp);
            }
          }
        });

        function print(filename, message, level, logTimestamp) {
          var formattedMessage = 
              "[" + logTimestamp + "] " + 
              "[" + level.toUpperCase() + "] " + 
              message;
          fs.appendFileSync(filename, formattedMessage + "\n", { encoding: "utf8", "mode": 644 });
          if (level.toUpperCase() == "CRITICAL" || apiObj.config.DEBUG_MODE == 1) {
            console.log(formattedMessage);
            if (typeof apiObj.config.DEBUG_LOG !== "undefined") {
              fs.appendFileSync(apiObj.config.DEBUG_LOG, formattedMessage + "\n", { encoding: "utf8", "mode": 644 });
            }
          }
        }

         function rotate(filename, callback) {
          fs.rename(filename, filename + "." + moment().format("YYYYMMDDHHmmssSSSZZ"), function(err, data){
            if (!err) {
              callback();
            }
          });
        }
      }
    };

    /**************************************************************************/
    /* CONFIG POOL */
    /**************************************************************************/
    apiObj.loadConfigFile = function(preseted, loadCallback) {

      function readFromFile(configFilepath, callback) {
        fs.lstat(configFilepath, function(err, fileData){
          if (err) {
            console.log("Couldn't find {0}.".format(configFilepath));
            if (typeof callback !== "undefined") callback({});
          } else {
            fs.readFile(configFilepath, function(err, fileContent){
              console.log("{0} Loading config file {1}".format(moment().format("YYYY-MM-DD HH:mm:ss.SSS ZZ"), configFilepath));
              if (err) {
                console.log("Couldn't find config file.");
              } else{
                var configJSON = JSON.parse(fileContent);
                var fileConfigs = {};
                for (var key in configJSON) {
                  fileConfigs[key] = configJSON[key];
                }
              }

              if (typeof callback !== "undefined") callback(fileConfigs);
            });
          }
        });
      }

      function mergeConfig(primary, secondary) {
        var configs = primary;
        for (var key in configs) {
          if (secondary.hasOwnProperty(key)) {
            configs[key] = secondary[key];
          }
        }

        return configs;
      }


      readFromFile("{0}/_assets/config-default.json".format(__dirname), function(defaultConfigs){
        if (typeof preseted === "string") {
          readFromFile(preseted, function(customConfigs){
            var configs = mergeConfig(defaultConfigs, customConfigs);
            loadCallback(configs);
          });
        } else {
          if (preseted !== undefined) config = preseted;
          var configs = mergeConfig(defaultConfigs, preseted);
          loadCallback(configs);
        }
      });
    };

    /******************************************************************************/
    /* MAIL */
    /******************************************************************************/
    apiObj.sendMail = function(toAddress, fromAddress, emailSubject, htmlContent, plainTextContent, callback){
      var nodemailer = require("nodemailer");
      var smtpTransport = require('nodemailer-smtp-transport');
       
      var transporter = nodemailer.createTransport(smtpTransport({
        host: apiObj.config.MAIL_HOST,
        port: apiObj.config.MAIL_PORT,
        secure: apiObj.config.MAIL_SECURE,
        ignoreTLS: apiObj.config.MAIL_IGNORE_TLS,
        auth: {
          user: apiObj.config.MAIL_USER,
          pass: apiObj.config.MAIL_PASSWORD
        }
      }));

      var mailOptions = {
        to: toAddress,
        from: (fromAddress !== undefined ? fromAddress : undefined),
        subject: emailSubject,
        text: (plainTextContent !== undefined ? plainTextContent : undefined),
        html: htmlContent
      };

      transporter.sendMail(mailOptions, function(error, info){
        if(error){
          logger("The '{0}' email to {1} couldn't be sent. Stacktrace: {2}".format(emailSubject, toAddress, error), "CRITICAL");
        } else {
          logger("The '{0}' email to {1} was succefully sent.".format(emailSubject, toAddress), "INFO");
        }

        callback((error ? true : false));
      });
    };

    /**************************************************************************/
    /* FUNCTION VALIDATION - BEGIN */
    /**************************************************************************/
    // TODO: BREAK THIS SHIT IN PIECES!

    apiObj.validateFunction = function(mapPath, functionName, requestBody, callback) {
      console.log(functionName);

      if (apiObj.functionsMap.hasOwnProperty(functionName)) {
        var validationErrors = [];
        functionSpecs = apiObj.functionsMap[functionName];

        // Iterate all the parameters specified in the maps.
        for (var param in functionSpecs["params"]) {
          param = functionSpecs["params"][param];

          // The parameter is mandatory but is not in the request content?
          if (!requestBody.hasOwnProperty(param["paramName"]) && 
              param["mandatory"] == true) {
            // Error - Mandatory parameter not present in the request
            validationErrors[validationErrors.length] = {
              "param": param["paramName"],
              "code": "VAL0001",
              "description": "Mandatory parameter not present in the request"
            };

          } else {
            var paramValue = requestBody[param["paramName"]];

            // Validation for string
            if (param["type"] == "string") {
              paramValue = paramValue.trim();

              if (param.hasOwnProperty(["validation"]) && 
                  param["validation"].hasOwnProperty("longerThan") && 
                  paramValue.length < parseInt(param["validation"]["longerThan"])) {
                // Error - String length smaller then needed
                validationErrors[validationErrors.length] = {
                  "param": param["paramName"], 
                  "code": "VAL1001", 
                  "description": "String legnth smaller than needed."
                };
              }
              if (param.hasOwnProperty(["validation"]) && 
                  param["validation"].hasOwnProperty("longerThan") && 
                  paramValue.length > parseInt(param["validation"]["smallerThan"])) {
                // Error - String length longer then needed 
                validationErrors[validationErrors.length] = {
                  "param": param["paramName"], 
                  "code": "VAL1002", "description": 
                  "String legnth longer than needed."
                };
              }

            // validation for integer
            } else if (param["type"] == "int") {
              try {
                paramValue = parseInt(paramValue);

                if (param.hasOwnProperty(["validation"]) && 
                    param["validation"].hasOwnProperty("greaterThan") && 
                    paramValue < parseInt(param["validation"]["greaterThan"])) {
                  // Error - String length smaller then needed
                  validationErrors[validationErrors.length] = {
                    "param": param["paramName"], 
                    "code": "VAL2001", 
                    "description": "Integer number lesser than needed."
                  };
                }
                if (param.hasOwnProperty(["validation"]) && 
                    param["validation"].hasOwnProperty("lesserThan") && 
                    paramValue > parseInt(param["validation"]["lesserThan"])) {
                  // Error - String length longer then needed
                  validationErrors[validationErrors.length] = {
                    "param": param["paramName"], 
                    "code": "VAL2002", 
                    "description": "Integer number greater than needed."
                  };
                }

              } catch (e) {
                validationErrors[validationErrors.length] = {
                  "param": param["paramName"], 
                  "code": "VAL0002", 
                  "description": "Integer value could not be parsed into integer."
                };
              }
            }
          }
        }

        return (validationErrors.length > 0 ? validationErrors : undefined);
      } else {
        // Reads the functions-map
        var fileContent = fs.readFileSync("_assets/functions-map.json");
        var functionsMap = JSON.parse(fileContent);
        var validationErrors = [];

        // Verify if the requested function exists in the map.
        if (!functionsMap.hasOwnProperty(functionName)) {
          // Error - Function not found
          validationErrors[validationErrors.length] = {"code": "VAL0000", "description": "Function not found."};
        } else {
          functionSpecs = functionsMap[functionName];

          // Iterate all the parameters specified in the maps.
          for (var param in functionSpecs["params"]) {
            param = functionSpecs["params"][param];

            // The parameter is mandatory but is not in the request content?
            if (!requestBody.hasOwnProperty(param["paramName"]) && 
                param["mandatory"] == true) {
              // Error - Mandatory parameter not present in the request
              validationErrors[validationErrors.length] = {
                "param": param["paramName"],
                "code": "VAL0001",
                "description": "Mandatory parameter not present in the request"
              };

            } else {
              var paramValue = requestBody[param["paramName"]];

              // Validation for string
              if (param["type"] == "string") {
                paramValue = paramValue.trim();

                if (param.hasOwnProperty(["validation"]) && 
                    param["validation"].hasOwnProperty("longerThan") && 
                    paramValue.length < parseInt(param["validation"]["longerThan"])) {
                  // Error - String length smaller then needed
                  validationErrors[validationErrors.length] = {
                    "param": param["paramName"], 
                    "code": "VAL1001", 
                    "description": "String legnth smaller than needed."
                  };
                }
                if (param.hasOwnProperty(["validation"]) && 
                    param["validation"].hasOwnProperty("longerThan") && 
                    paramValue.length > parseInt(param["validation"]["smallerThan"])) {
                  // Error - String length longer then needed 
                  validationErrors[validationErrors.length] = {
                    "param": param["paramName"], 
                    "code": "VAL1002", "description": 
                    "String legnth longer than needed."
                  };
                }

              // validation for integer
              } else if (param["type"] == "int") {
                try {
                  paramValue = parseInt(paramValue);

                  if (param.hasOwnProperty(["validation"]) && 
                      param["validation"].hasOwnProperty("greaterThan") && 
                      paramValue < parseInt(param["validation"]["greaterThan"])) {
                    // Error - String length smaller then needed
                    validationErrors[validationErrors.length] = {
                      "param": param["paramName"], 
                      "code": "VAL2001", 
                      "description": "Integer number lesser than needed."
                    };
                  }
                  if (param.hasOwnProperty(["validation"]) && 
                      param["validation"].hasOwnProperty("lesserThan") && 
                      paramValue > parseInt(param["validation"]["lesserThan"])) {
                    // Error - String length longer then needed
                    validationErrors[validationErrors.length] = {
                      "param": param["paramName"], 
                      "code": "VAL2002", 
                      "description": "Integer number greater than needed."
                    };
                  }

                } catch (e) {
                  validationErrors[validationErrors.length] = {
                    "param": param["paramName"], 
                    "code": "VAL0002", 
                    "description": "Integer value could not be parsed into integer."
                  };
                }
              }
            }
          }
        }

        return (validationErrors.length > 0 ? validationErrors : undefined);
      }
    };
    /**************************************************************************/
    /* FUNCTION VALIDATION - END */
    /**************************************************************************/
    
    apiObj.loadConfigFile(configSettings, function(config){
      apiObj.config = config;

      /**************************************************************************/
      /* INSTANCING PROCESS */
      /**************************************************************************/

      // var moduleObject = module.exports;

      /******************************************************************************/
      /* NODE CLUSTER
      /******************************************************************************/
      // if (cluster.isMaster) {
      //   var cpuCount = require("os").cpus().length;

      //   // Starts one node instance for each core
      //   while (cpuCount >= 0) {
      //     cluster.fork();
      //     cpuCount--;
      //   }
      // } else {
        var expressApp = new express();

        // We will parse data sent in the content of the request using json if it has
        // content-type header setted or not.
        expressApp.use(bodyParser.json());
        expressApp.use(bodyParser.urlencoded({
          extended: true
        }));

        var allowCrossDomain = function(req, res, next) {
          res.header('Access-Control-Allow-Origin', '*');
          res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
          res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With');

          // intercept OPTIONS method
          if ('OPTIONS' == req.method) {
            res.sendStatus(200);
          }
          else {
            next();
          }
        };
        expressApp.use(allowCrossDomain);

        /****************************************************************************/
        /* HEALTH CHECK */
        /****************************************************************************/
        expressApp.post("/status", function(request, response){
          response.header("Access-Control-Allow-Origin", "*");
          response.header("Access-Control-Allow-Headers", "X-Requested-With");
          response.send({"status":"OK"});
        });

        expressApp.get("/status", function(request, response){
          response.header("Access-Control-Allow-Origin", "*");
          response.header("Access-Control-Allow-Headers", "X-Requested-With");
          response.send({"status":"OK"});
        });

        /****************************************************************************/
        /* README PAGE */
        /****************************************************************************/
        expressApp.get("/", function(request, response){
          response.header("Access-Control-Allow-Origin", "*");
          response.header("Access-Control-Allow-Headers", "X-Requested-With");
          fs.lstat("README.md", function(err, stats) {
            if (err) {
              response.sendStatus(404).send({"status":"ERROR"});
            } else {
              fs.readFile("README.md", "utf-8", function(err, readmeFileContent){
                var markdown = require('markdown').markdown;
                
                //TODO: Too heavy doing this all the time?
                var htmlContent = markdown.toHTML(readmeFileContent);
                response.set("Content-Type", "text/html");
                response.end(htmlContent);
              }); 
            }
          });
        });

        /****************************************************************************/
        /* API FUNCTIONS */
        /****************************************************************************/
        fs.lstat(apiObj.config.API_FUNCTIONS_MAP, function(err, fileStats){
          if (err) {
            console.log("Couldn't find the functions map.");
            process.exit(1);
          } else {
            // Reads the functions-map
            fs.readFile(apiObj.config.API_FUNCTIONS_MAP, function(err, fileContent){
              var functionsMap = JSON.parse(fileContent);

              for (var functionName in functionsMap) {
                expressApp.post("/" + functionName, function(req, res){
                  res.header("Access-Control-Allow-Origin", "*");
                  res.header("Access-Control-Allow-Headers", "X-Requested-With");

                  var functionId = req.route.path.replace("/", "");

                  // Parsing the body content of the request.
                  var requestBody = req.body;
                  if (req.headers.hasOwnProperty("content-type")) {
                    if (req.headers["content-type"].indexOf("application/json") == -1) {

                      if (typeof requestBody !== "object") {
                        try {
                          requestBody = JSON.parse(Object.keys(req.body)[0]);
                        } catch (parseError) {
                          res.sendStatus(406).send({"status":"ERROR"});
                        }
                      } else{
                        requestBody = req.body;
                      }
                    }
                  }

                  var apiFunction = apiObj.functions[functionId];

                  var requestKey = startAudit(functionId, requestBody);
                  var validationErrors = apiObj.validateFunction(apiObj.config.API_FUNCTIONS_MAP, functionId, requestBody);
                  if (validationErrors) {
                    var returnValues = {"status":"ERROR", "validationErrors": validationErrors};
                    finishAudit(requestKey, returnValues);
                    res.send(returnValues);
                  } else {
                    if (typeof apiObj.functions[functionId] === "undefined") {
                      var returnValues = {"status":"ERROR", "description": "Function not registred."};
                      finishAudit(requestKey, returnValues);
                      res.send(returnValues);
                    res.send(returnValues);
                    } else {
                      apiFunction(requestBody, requestKey, function(returnValues, callback){
                        finishAudit(requestKey, returnValues);
                        if (!res.headersSent) res.send(returnValues).end();
                        if (callback) callback();
                      }, req);
                    }
                  }
                });
              }
            });
          }
        });

        expressApp.listen(apiObj.config.NODEJS_LISTEN_PORT);
      // }
      
      callback(apiObj);
    });

  },
};
// That's all folks!
