// API2GO
// Created by Eduardo Quagliato <eduardo@quagliato.me>
// São Paulo, Brasil
// 2015-12-21

// DEPENDENCIES (in alphabetical order)
var bodyParser                   = require('body-parser');
var express                      = require('express');
var fs                           = require('fs');
var moment                       = require('moment');
var sha1                         = require('sha1');

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



var API2Go = function(configSettings){
  this.audit = {};
  this.functions = {};
  this.functionsMap = {};
  this.paths = {};

  var apiObj = this;

  apiObj.config = loadConfigFile(configSettings);
  console.log("Configuration for this instance:");
  console.log(apiObj.config);

  /****************************************************************************/
  /* API FUNCTIONS */
  /****************************************************************************/

  var functionMapFileExists = fs.lstatSync(apiObj.config.API_FUNCTIONS_MAP);
  if (!functionMapFileExists) {
    console.log("Couldn't find the functions map.");
    process.exit(1);
  } else {
    // Reads the functions-map
    var fileContent = fs.readFileSync(apiObj.config.API_FUNCTIONS_MAP);
    if (fileContent) {
      var fileFunctionsMap = JSON.parse(fileContent);
      for (var functionName in fileFunctionsMap) {
        apiObj.functionsMap[functionName] = fileFunctionsMap[functionName];
        var functionMap = apiObj.functionsMap[functionName];
        var path = "POST-" + functionName;
        if (functionMap.hasOwnProperty("path") && functionMap.hasOwnProperty("module")) {
          // Modules can't have slashes in their names.
          if (functionMap["module"].indexOf("/") !== undefined) {
            //TODO: Error
          }

          // Path must not begin with a slash.
          if (functionMap["path"].substr(0, 1) == "/") {
            functionMap["path"] = functionMap["path"].substr(1);
          }

          path = functionMap["module"] + "/" + functionMap["path"];

          if (functionMap.hasOwnProperty("method")) path = functionMap.method.toUpperCase() + "-" + path;
          else path = "POST-" + path;
        }
        apiObj.paths[path] = functionName;
      }
    }
  }

  /**************************************************************************/
  /* LOGGER */
  /**************************************************************************/
  this.logger = function(message, level, filename) {
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

  /******************************************************************************/
  /* MAIL */
  /******************************************************************************/
  this.sendMail = function(toAddress, fromAddress, fromName, emailSubject, htmlContent, plainTextContent, callback, ccAddress, bccAddress){
    var nodemailer = require("nodemailer");
    var smtpTransport = require('nodemailer-smtp-transport');

    var validateEmail = function(address){
      var ok = true;
      if (address.indexOf("@") <= 0) ok = false;
      var postAt = address.substr(address.indexOf("@"));
      if (postAt.indexOf(".") <= 0) ok = false;
      return ok;
    }

    if (typeof callback !== "function") {
      logger("The callback for sendMail must be a function.", "CRITICAL");
      callback(false);
    }

    if (toAddress === undefined || toAddress == "" || fromName === undefined || fromName == "" || fromAddress === undefined || fromAddress == "" || emailSubject === undefined || emailSubject == "" || htmlContent === undefined || htmlContent == "") {
      logger("In order to send an email, to address, from address, from name, email subject and HTML content are required.", "CRITICAL");
      callback(false);
    }

    if (!validateEmail(toAddress)) {
      logger("The {0} address is not valid.".format(toAddress), "CRITICAL");
      callback(false);
    }

    if (!validateEmail(fromAddress)) {
      logger("The {0} address is not valid.".format(fromAddress), "CRITICAL");
      callback(false);
    }

    if (ccAddress !== undefined) {
      if (!validateEmail(ccAddress)) {
        logger("The {0} address is not valid.".format(ccAddress), "CRITICAL");
        callback(false);
      }
    }

    if (bccAddress !== undefined) {
      if (!validateEmail(bccAddress)) {
        logger("The {0} address is not valid.".format(bccAddress), "CRITICAL");
        callback(false);
      }
    }

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
      from: "{0} <{1}>".format(fromName, apiObj.config.MAIL_DEFAULT_FROM_USER),
      subject: emailSubject,
      text: (plainTextContent !== undefined ? plainTextContent : undefined),
      html: htmlContent,
      replyTo: "{0} <{1}>".format(fromName, fromAddress),
      cc: (ccAddress !== undefined ? ccAddress : undefined),
      bcc: (bccAddress !== undefined ? bccAddress : undefined)
    };

    transporter.sendMail(mailOptions, function(error, info){
      if(error){
        apiObj.logger("The '{0}' email to {1} couldn't be sent. Stacktrace: {2}".format(emailSubject, toAddress, error), "CRITICAL");
      } else {
        apiObj.logger("The '{0}' email to {1} was succefully sent.".format(emailSubject, toAddress), "INFO");
      }

      callback((error ? true : false));
    });
  };

  /******************************************************************************/
  /* FUNCTIONS */
  /******************************************************************************/
  this.registerFunction = function(functionName, processing, functionMap) {
    apiObj.logger("New function registered: {0}".format(functionName), "INFO");
    if (apiObj.functionMap !== undefined) {
      if (apiObj.functionsMap != undefined && functionsMap.hasOwnProperty(functionName)) {
        logger("Function {0} is already defined in the functions map file. Descading this definition.".format(functionName), "INFO");
      } else {
        apiObj.functionsMap[functionName] = functionMap;
        var path = "POST-" + functionName;
        if (functionMap.hasOwnProperty("path") && functionMap.hasOwnProperty("module")) {
          // Modules can't have slashes in their names.
          if (functionMap["module"].indexOf("/") !== undefined) {
            //TODO: Error
          }

          // Path must not begin with a slash.
          if (functionMap["path"].substr(0, 1) == "/") {
            functionMap["path"] = functionMap["path"].substr(1);
          }

          path = functionMap["module"] + "/" + functionMap["path"];

          if (functionMap.hasOwnProperty("method")) path = functionMap.method.toUpperCase()+"-"+path;
          else path = "POST-"+path;
        }
        apiObj.paths[path] = functionName;
      }
    }
    apiObj.functions[functionName] = processing;
  };

  /**************************************************************************/
  /* AUDIT */
  /**************************************************************************/
  this.startAudit = function(functionName, values) {
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

  this.finishAudit = function(requestKey, returnValues) {
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

  /******************************************************************************/
  /* START */
  /******************************************************************************/
  this.start = function(){
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

    for (functionName in apiObj.functionsMap) {
      var functionMapping = apiObj.functionsMap[functionName];

      var method = "post";

      if (functionMapping.hasOwnProperty("method")) {
        method = functionMapping["method"].toLowerCase();
      }

      // Primary path is the functionName, but when developing a REST API, for
      // example, you may need the possibility to register different functions
      // in the same path, like a PUT and a GET on the same ID.
      var path = functionName;
      if (functionMapping.hasOwnProperty("path") && functionMapping.hasOwnProperty("module")) {

        // Modules can't have slashes in their names.
        if (functionMapping["module"].indexOf("/") !== undefined) {
          //TODO: Error
        }

        // Path must not begin with a slash.
        if (functionMapping["path"].substr(0, 1) == "/") {
          functionMapping["path"] = functionMapping["path"].substr(1);
        }

        path = functionMapping["module"] + "/" + functionMapping["path"];
      }

      expressApp[method]("/" + path, function(req, res){
        res.header("Access-Control-Allow-Origin", "*");
        res.header("Access-Control-Allow-Headers", "X-Requested-With");

        // Parsing the body content of the request.
        var requestBody = req.body;
        try {
          var stringTest = JSON.stringify(requestBody);
        } catch (e) {
          if (req.headers.hasOwnProperty("content-type") && req.headers["content-type"].indexOf("application/json") == -1) {
            try {
              requestBody = JSON.parse(Object.keys(req.body)[0]);
            } catch (parseError) {
              res.sendStatus(406).send({"status":"ERROR"});
            }
          }
        }

        var requestedPath = req.route.path.substr(1);
        var requestedMethod = req.method;
        var functionId = apiObj.paths[requestedMethod.toUpperCase() + "-" + requestedPath];

        var apiFunction = apiObj.functions[functionId];

        var requestKey = apiObj.startAudit(functionId, requestBody);
        var validationErrors = validateFunction(apiObj.config.API_FUNCTIONS_MAP, apiObj.functionsMap, functionId, requestBody);
        if (validationErrors) {
          var returnValues = {"status":"ERROR", "validationErrors": validationErrors};
          apiObj.finishAudit(requestKey, returnValues);
          res.send(returnValues);
        } else {
          if (typeof apiObj.functions[functionId] === "undefined") {
            var returnValues = {"status":"ERROR", "description": "Function not registred."};
            apiObj.finishAudit(requestKey, returnValues);
            res.send(returnValues);
          res.send(returnValues);
          } else {
            apiFunction(requestBody, requestKey, function(returnValues, callback){
              apiObj.finishAudit(requestKey, returnValues);
              if (!res.headersSent) res.send(returnValues).end();
              if (callback) callback();
            }, req, res, apiObj);

          }
        }
      });
    }

    expressApp.listen(apiObj.config.NODEJS_LISTEN_PORT);
  };
};

/**************************************************************************/
/* CONFIG */
/**************************************************************************/
var readFromFile = function(configFilepath) {
  var fileConfigs = {};

  var fileData = fs.lstatSync(configFilepath);
  if (!fileData) {
      console.log("Couldn't find {0}.".format(configFilepath));
  } else {
    console.log("{0} Loading config file {1}".format(moment().format("YYYY-MM-DD HH:mm:ss.SSS ZZ"), configFilepath));
    var fileContent = fs.readFileSync(configFilepath);
    if (!fileContent) {
      console.log("Couldn't find config file.");
    } else {
      var configJSON = JSON.parse(fileContent);
      for (var key in configJSON) {
        fileConfigs[key] = configJSON[key];
      }
    }
  }

  return fileConfigs;
};

var mergeConfig = function(primary, secondary) {
  var configs = primary;
  for (var key in configs) {
    if (secondary !== undefined && secondary.hasOwnProperty(key)) {
      configs[key] = secondary[key];
    }
  }

  if (secondary !== undefined) {
    for (var key in secondary) {
      if (!configs.hasOwnProperty(key)) {
        configs[key] = secondary[key];
      }
    }
  }

  return configs;
};

var loadConfigFile = function(preseted, loadCallback) {
  var configs = {};

  var defaultConfigs = readFromFile("{0}/_assets/config-default.json".format(__dirname));
  if (typeof preseted === "string") {
    var customConfigs = readFromFile(preseted);
    configs = mergeConfig(defaultConfigs, customConfigs);
  } else {
    if (preseted !== undefined) config = preseted;
    configs = mergeConfig(defaultConfigs, preseted);
  }

  return configs;
};

/**************************************************************************/
/* FUNCTION VALIDATION - BEGIN */
/**************************************************************************/
// TODO: BREAK THIS SHIT IN PIECES!

var validateFunction = function(mapPath, functionsMap, functionName, requestBody, callback) {
  if (functionsMap.hasOwnProperty(functionName)) {
    var validationErrors = [];
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

        if (paramValue !== undefined){
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

        } else if (requestBody.hasOwnProperty(param["paramName"])) {
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

module.exports = API2Go;
// That's all folks!
