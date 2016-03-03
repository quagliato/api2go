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
    /* AUDIT - BEGIN */
    /**************************************************************************/
    apiObj.startAudit = function(functionName, values, response, callback) {
      var requestInfo = {
        "function": functionName, 
        "values": values, 
        "begin-time": moment().format("YYYYMMDDHHmmssSSSZZ")
      };

      var requestKey = sha1(JSON.stringify(requestInfo));

      var auditInfo = {};
      auditInfo[requestKey] = JSON.parse(JSON.stringify(requestInfo));

      requestInfo["response"] = response;
      apiObj.audit[requestKey] = requestInfo;

      //TODO: Store requestKey, functionName and values
      apiObj.logger(JSON.stringify(auditInfo), "REQUEST-BEGIN", apiObj.config.AUDIT_LOG);

      callback(requestKey);
    }

    apiObj.finishAudit = function(requestKey, returnValues, callback) {
      if (typeof returnValues === "string") returnValues = JSON.parse(returnValues);
      
      var requestInfo = apiObj.audit[requestKey];
      var response = requestInfo["response"];

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
      delete auditInfo[requestKey]["response"];

      apiObj.logger(JSON.stringify(auditInfo), "REQUEST-END", apiObj.config.AUDIT_LOG);

      if (returnValues.hasOwnProperty("status")) {
        if (returnValues["status"] == "ERROR") {
          response.status(400).json(returnValues).end();
        } else {
          response.status(200).json(returnValues).end();
        }
      }

      if (callback !== undefined) {
        callback();
      }
    }

    /**************************************************************************/
    /* AUDIT - END */
    /**************************************************************************/

    /**************************************************************************/
    /* FUNCTION VALIDATION - BEGIN */
    /**************************************************************************/
    // TODO: BREAK THIS SHIT IN PIECES!

    apiObj.validateFunction = function(mapPath, functionName, requestBody, callback) {
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

        callback((validationErrors.length === 0 ? undefined : validationErrors), (typeof functionSpecs === "undefined" ? undefined : functionSpecs["apiName"]));
      } else {

        // Verify if the functions-map JSON exists.
        fs.lstat(mapPath, function(err, fileStats){
          if (err) {
            response.status(500).json({"status":"ERROR", "description":"Couldn't process your request."}).end();
          } else {
            // Reads the functions-map
            fs.readFile("_assets/functions-map.json", function(err, fileContent){
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

              callback((validationErrors.length === 0 ? undefined : validationErrors), (typeof functionSpecs === "undefined" ? undefined : functionSpecs["apiName"]));
            });
          }
        });
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

        /****************************************************************************/
        /* HEALTH CHECK */
        /****************************************************************************/
        expressApp.post("/status", function(request, response){
          response.header("Access-Control-Allow-Origin", "*");
          response.header("Access-Control-Allow-Headers", "X-Requested-With");
          response.status(200).json({"status":"OK"}).end();
        });

        expressApp.get("/status", function(request, response){
          response.header("Access-Control-Allow-Origin", "*");
          response.header("Access-Control-Allow-Headers", "X-Requested-With");
          response.status(200).json({"status":"OK"}).end();
        });

        /****************************************************************************/
        /* README PAGE */
        /****************************************************************************/
        expressApp.get("/", function(request, response){
          response.header("Access-Control-Allow-Origin", "*");
          response.header("Access-Control-Allow-Headers", "X-Requested-With");
          fs.lstat("README.md", function(err, stats) {
            if (err) {
              response.status(404).json({"status":"ERROR"}).end();
            } else {
              fs.readFile("README.md", "utf-8", function(err, readmeFileContent){
                var markdown = require('markdown').markdown;
                
                //TODO: Too heavy doing this all the time?
                var htmlContent = markdown.toHTML(readmeFileContent);
                response.set("Content-Type", "text/html");
                response.status(200).end(htmlContent);
              }); 
            }
          });
        });

        /****************************************************************************/
        /* API FUNCTIONS */
        /****************************************************************************/
        expressApp.post("/:functionName", function(request, response){
          response.header("Access-Control-Allow-Origin", "*");
          response.header("Access-Control-Allow-Headers", "X-Requested-With");

          var functionName = request.params.functionName;

          // Parsing the body content of the request.
          var requestBody = request.body;
          if (request.headers.hasOwnProperty("content-type")) {
            if (request.headers["content-type"] != "application/json") {
              try {
                requestBody = JSON.parse(Object.keys(request.body)[0]);
              } catch (parseError) {
                response.status(406).json({"status":"ERROR"}).end();
              }
            }
          }

          apiObj.startAudit(functionName, requestBody, response, function(requestKey){
            apiObj.validateFunction(apiObj.config.API_FUNCTIONS_MAP, functionName, requestBody, function(validationErrors, apiFunctionName){
              if (validationErrors) {
                apiObj.finishAudit(requestKey, {"status":"ERROR", "validationErrors": validationErrors});
              } else {
                // if (typeof moduleObject.functions[apiFunctionName] === "undefined") {
                //   finishAudit(requestKey, {"status":"ERROR", "description": "Function not registred."});
                // } else {
                //   moduleObject.functions[apiFunctionName](requestBody, requestKey, function(returnValues, callback){
                //     finishAudit(requestKey, returnValues, callback);
                //   });
                // }
                if (typeof apiObj.functions[apiFunctionName] === "undefined") {
                  apiObj.finishAudit(requestKey, {"status":"ERROR", "description": "Function not registred."});
                } else {
                  apiObj.functions[apiFunctionName](requestBody, requestKey, function(returnValues, callback){
                    apiObj.finishAudit(requestKey, returnValues, callback);
                  });
                }
              }
            });
          });
        });

        expressApp.listen(apiObj.config.NODEJS_LISTEN_PORT);
      // }
      
      callback(apiObj);
    });

  },
};
// That's all folks!
