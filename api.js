'use strict'

// API2GO
// Created by Eduardo Quagliato <eduardo@quagliato.me>
// São Paulo, Brasil
// 2015-12-21

// Dependencies (in alphabetical order)
const bodyParser                   = require('body-parser');
const express                      = require('express');
const fs                           = require('fs');
const mime                         = require('mime');
const moment                       = require('moment');
const sha1                         = require('sha1');

const Audit                  = require('./src/audit');
const configParsing          = require('./src/config_parsing');
const defaultLogger          = require('./src/default_logger');
const mail                   = require('./src/mail');

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
  this.functions = {};
  this.functionsMap = {};
  this.paths = {};

  var apiObj = this;

  this.audit = new Audit(apiObj);

  apiObj.config = configParsing.loadConfigFile(configSettings);
  console.log("Configuration for this instance:");
  console.log(apiObj.config);
  
  /**************************************************************************/
  /* LOGGER */
  /**************************************************************************/

  // If no log engine is setted or default is setted
  if (!apiObj.config.hasOwnProperty('LOG') || !apiObj.config.LOG.hasOwnProperty('engine') || apiObj.config.LOG.engine === 'default') {
    apiObj.logger = function (message, level, bucket) {
      return defaultLogger(apiObj, message, level, bucket);
    };
  }

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
  /* LANGUAGE */
  /**************************************************************************/
  this._lang = {
    set: function(lang) {
      if (lang == undefined) { lang = apiObj.config.LANGUAGE_DEFAULT};
      if (lang == undefined || !apiObj.config.hasOwnProperty("LANGUAGE_PATH")) return false;

      if (!this.hasOwnProperty("_lang_code") && this._lang_code != lang) {
        var file;
        try {
          file = fs.readFileSync(apiObj.config.LANGUAGE_PATH + lang + ".json", "utf-8");
        } catch (err) {
          try {
            console.log('Language file ' + lang + 'not found. Trying ' + apiObj.config.LANGUAGE_DEFAULT + '...');
            file = fs.readFileSync(apiObj.config.LANGUAGE_PATH + apiObj.config.LANGUAGE_DEFAULT + ".json", "utf-8");
          } catch (err) {
            console.error('Default language file not found');
            return false;
          }
        }
        try {
          var json = JSON.parse(file);
          for (var attrname in json) { this[attrname] = json[attrname]; }
          this.lang_code = lang;
        } catch (err) {
          console.error("Language file is not a valid JSON");
          return false;
        }
      }
      return true;
    },
    file: function(filename) {
      if (!this.hasOwnProperty("lang_code")) {
        if (!this.set(apiObj.config.LANGUAGE_DEFAULT)) {
          console.error('Language not set when trying to access file ' + filename);
          return false;
        }
      }
      var path = apiObj.config.LANGUAGE_PATH +"file/" + this.lang_code + "/" + filename;
      try {
        var html = fs.readFileSync(path, "utf-8");
      } catch (err) {
        console.error('File ' + path + ' not found');
        return false;
      }
      return html;
    },
    "validation": {
      "mandatory_parameter_not_found": "Mandatory parameter not present in the request",
      "string_length_smaller": "String length smaller than needed",
      "string_length_larger": "String length larger than needed",
      "integer_too_small": "Integer number too small",
      "integer_too_big": "Integer number too big",
      "value_not_integer": "Value is string when expecting integer",
      "function_not_found": "Function not found"
    }
  };

  /******************************************************************************/
  /* MAIL */
  /******************************************************************************/
  this.sendMail = function(toAddress, fromAddress, fromName, emailSubject, htmlContent, plainTextContent, callback, ccAddress, bccAddress){
    const mailOptions = {};
    if (toAddress != undefined) mailOptions['to'] = toAddress;
    if (fromAddress != undefined) mailOptions['from'] = fromAddress;
    if (fromName != undefined) mailOptions['from_name'] = fromName;
    if (ccAddress != undefined) mailOptions['cc'] = ccAddress;
    if (bccAddress != undefined) mailOptions['bcc'] = bccAddress;

    const mailTemplate = {};
    if (emailSubject != undefined) mailTemplate['subject'] = emailSubject;
    if (htmlContent != undefined) mailTemplate['html'] = htmlContent;
    if (plainTextContent != undefined) mailTemplate['text'] = plainTextContent;

    this.sendTemplateMail(mailOptions,mailTemplate,{},callback);
  };

  this.sendTemplateMail = function(mailOptions, mailTemplate, context, callback) {
    return mail(apiObj, mailOptions, mailTemplate, context, callback);
  };

  /******************************************************************************/
  /* FUNCTIONS */
  /******************************************************************************/
  this.registerFunction = function(functionName, processing, functionMap) {
    if (!apiObj.functionsMap.hasOwnProperty(functionName) && !functionMap) {
      apiObj.logger("Function {0} does not have definition in functions map file, neither inline definition. It won't be registered".format(functionName), "INFO");
    } else {
      if (apiObj.functionsMap.hasOwnProperty(functionName) && functionMap) {
        apiObj.logger("Function {0} is already defined in the functions map file. Descading inline definition.".format(functionName), "INFO");
      } else if (functionMap) {
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
      apiObj.logger("New function registered: {0}".format(functionName), "INFO");
      apiObj.functions[functionName] = processing;
    }
  };

  /**************************************************************************/
  /* FUNCTION VALIDATION - BEGIN */
  /**************************************************************************/
  // TODO: BREAK THIS SHIT IN PIECES!

  this.validateFunction = function(functionName, requestBody, callback) {
    var mapPath = apiObj.config.API_FUNCTIONS_MAP;
    var functionsMap = apiObj.functionsMap;
    if (functionsMap.hasOwnProperty(functionName)) {
      var validationErrors = [];
      const functionSpecs = functionsMap[functionName];

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
            "description": apiObj._lang.validation.mandatory_parameter_not_found
          };

        } else {
          var paramValue = requestBody[param["paramName"]];

          if (paramValue !== undefined && paramValue !== null){
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
                  "description": apiObj._lang.validation.string_length_smaller
                };
              }
              if (param.hasOwnProperty(["validation"]) &&
                  param["validation"].hasOwnProperty("longerThan") &&
                  paramValue.length > parseInt(param["validation"]["smallerThan"])) {
                // Error - String length longer then needed
                validationErrors[validationErrors.length] = {
                  "param": param["paramName"],
                  "code": "VAL1002", 
                  "description": apiObj._lang.validation.string_length_larger
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
                    "description": apiObj._lang.validation.integer_too_small
                  };
                }
                if (param.hasOwnProperty(["validation"]) &&
                    param["validation"].hasOwnProperty("lesserThan") &&
                    paramValue > parseInt(param["validation"]["lesserThan"])) {
                  // Error - String length longer then needed
                  validationErrors[validationErrors.length] = {
                    "param": param["paramName"],
                    "code": "VAL2002",
                    "description": apiObj._lang.validation.integer_too_big
                  };
                }

              } catch (e) {
                validationErrors[validationErrors.length] = {
                  "param": param["paramName"],
                  "code": "VAL0002",
                  "description": apiObj._lang.validation.value_not_integer
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
        validationErrors[validationErrors.length] = {"code": "VAL0000", "description": apiObj._lang.validation.function_not_found};
      } else {
        const functionSpecs = functionsMap[functionName];

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
              "description": apiObj._lang.validation.mandatory_parameter_not_found
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
                  "description": apiObj._lang.validation.string_length_smaller
                };
              }
              if (param.hasOwnProperty(["validation"]) &&
                  param["validation"].hasOwnProperty("longerThan") &&
                  paramValue.length > parseInt(param["validation"]["smallerThan"])) {
                // Error - String length longer then needed
                validationErrors[validationErrors.length] = {
                  "param": param["paramName"],
                  "code": "VAL1002", "description": apiObj._lang.validation.string_length_larger
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
                    "description": apiObj._lang.validation.integer_too_small
                  };
                }
                if (param.hasOwnProperty(["validation"]) &&
                    param["validation"].hasOwnProperty("lesserThan") &&
                    paramValue > parseInt(param["validation"]["lesserThan"])) {
                  // Error - String length longer then needed
                  validationErrors[validationErrors.length] = {
                    "param": param["paramName"],
                    "code": "VAL2002",
                    "description": apiObj._lang.validation.integer_too_big
                  };
                }

              } catch (e) {
                validationErrors[validationErrors.length] = {
                  "param": param["paramName"],
                  "code": "VAL0002",
                  "description": apiObj._lang.validation.value_not_integer
                };
              }
            }
          }
        }
      }

      return (validationErrors.length > 0 ? validationErrors : undefined);
    }
  };


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
              res.sendStatus(406).type('application/json').send({
                status: 'ERROR'
              });
            }
          }
        }

        var requestedPath = req.route.path.substr(1);
        var requestedMethod = req.method;
        var functionId = apiObj.paths[requestedMethod.toUpperCase() + "-" + requestedPath];

        var apiFunction = apiObj.functions[functionId];

        apiObj._lang.set(requestBody.lang);

        var requestKey = apiObj.audit.start(functionId, requestBody);
        var validationErrors = apiObj.validateFunction(functionId, requestBody);

        if (validationErrors) {
          var returnValues = {"status":"ERROR", "validationErrors": validationErrors};
          var returnExtra = {
              status: 500,
              type: 'application/json',
              headers: null
            };
          apiObj.audit.finish(requestKey, returnValues, returnExtra);
          res.status(returnExtra.status).type(returnExtra.type).send(returnValues);
        } else {

          if (typeof apiObj.functions[functionId] === "undefined") {
            var returnValues = {"status":"ERROR", "description": "Function not registred."};
            var returnExtra = {
              status: 404,
              type: 'application/json',
              headers: null
            };
            apiObj.audit.finish(requestKey, returnValues, returnExtra);
            res.status(returnExtra.status).type(returnExtra.type).send(returnValues);

          } else {
            apiFunction(requestBody, requestKey, function(returnValues, extra, callback){
              var status = 200;
              var type = 'application/json';
              var file = null;

              if (typeof extra === 'function') {
                extra = undefined;
                callback = extra;
              }

              if (!res.headersSent) {
                if (extra) {
                  // If extra has headers, sets all of them
                  if (extra.headers) for (var header in extra.headers) res.set(header, extra.headers[header]);
                  
                  if (extra.type) type = extra.type;
                  if (extra.status) status = extra.status;

                  if (extra.file) {
                    if (!returnValues) {
                      // TODO: Error
                    }
                    type = mime.lookup(returnValues);
                    file = returnValues;
                  }
                }

                if (file) res.status(status).type(type).sendFile(returnValues);
                else if (!returnValues) res.sendStatus(status);
                else res.status(status).type(type).send(returnValues).end();
              }
              
              var returnExtra = {
                status: status,
                type: type,
                headers: extra && extra.headers ? extra.headers : {},
              }

              apiObj.audit.finish(requestKey, returnValues, returnExtra);
              if (callback) callback();
            }, req, apiObj);

          }
        }
      });
    }

    expressApp.all("*", function(req, res){
      res.header("Access-Control-Allow-Origin", "*");
      res.header("Access-Control-Allow-Headers", "X-Requested-With");
      
      res.status(404).type('application/json').send({"status":"ERROR", "description": "Function not registred."});
    });

    expressApp.listen(apiObj.config.NODEJS_LISTEN_PORT);
  };
};

module.exports = API2Go;
// That's all folks!
