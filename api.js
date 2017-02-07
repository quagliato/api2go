// API2GO
// Created by Eduardo Quagliato <eduardo@quagliato.me>
// São Paulo, Brasil
// 2015-12-21

// DEPENDENCIES (in alphabetical order)
var bodyParser                   = require('body-parser');
var express                      = require('express');
var fs                           = require('fs');
var mime                         = require('mime');
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
    var mailOptions = {};
    if (toAddress != undefined) mailOptions['to'] = toAddress;
    if (fromAddress != undefined) mailOptions['from'] = fromAddress;
    if (fromName != undefined) mailOptions['from_name'] = fromName;
    if (ccAddress != undefined) mailOptions['cc'] = ccAddress;
    if (bccAddress != undefined) mailOptions['bcc'] = bccAddress;

    var mailTemplate = {};
    if (emailSubject != undefined) mailTemplate['subject'] = emailSubject;
    if (htmlContent != undefined) mailTemplate['html'] = htmlContent;
    if (plainTextContent != undefined) mailTemplate['text'] = plainTextContent;

    this.sendTemplateMail(mailOptions,mailTemplate,{},callback);
  }

  this.sendTemplateMail = function(mailOptions, mailTemplate, context, callback){

    var nodemailer = require("nodemailer");
    var smtpTransport = require('nodemailer-smtp-transport');
    var htmlToText = require('nodemailer-html-to-text').htmlToText;

    var validateEmail = function(address){
      var ok = true;
      if (address.indexOf("@") <= 0) ok = false;
      var postAt = address.substr(address.indexOf("@"));
      if (postAt.indexOf(".") <= 0) ok = false;
      return ok;
    }

    if (typeof callback !== "function") {
      apiObj.logger("The callback for sendMail must be a function.", "CRITICAL");
      callback(false);
    }

    if (!mailOptions.hasOwnProperty('to') || mailOptions['to'] == "" || 
        !mailOptions.hasOwnProperty('from_name') || mailOptions['form_name'] == "" || 
        !mailOptions.hasOwnProperty('from') || mailOptions['from'] == "" || 
        !mailTemplate.hasOwnProperty('subject') || mailTemplate['subject'] == "" || 
        !mailTemplate.hasOwnProperty('html') || mailTemplate['html'] == "") {
      apiObj.logger("In order to send an email, to address, from address, from name, email subject and HTML content are required.", "CRITICAL");
      callback(false);
    }

    if (!validateEmail(mailOptions['to'])) {
      apiObj.logger("The {0} address is not valid.".format(mailOptions['to']), "CRITICAL");
      callback(false);
    }

    if (!validateEmail(mailOptions['from'])) {
      apiObj.logger("The {0} address is not valid.".format(mailOptions['from']), "CRITICAL");
      callback(false);
    }

    if (mailOptions.hasOwnProperty('cc')) {
      if (!validateEmail(mailOptions['cc'])) {
        apiObj.logger("The {0} address is not valid.".format(mailOptions['cc']), "CRITICAL");
        callback(false);
      }
    }

    if (mailOptions.hasOwnProperty('bcc')) {
      if (!validateEmail(mailOptions['bcc'])) {
        apiObj.logger("The {0} address is not valid.".format(mailOptions['bcc']), "CRITICAL");
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

    transporter.use('compile', htmlToText());

    var send = transporter.templateSender(mailTemplate);

    mailOptions['replyTo'] = "{0} <{1}>".format(mailOptions['from_name'], mailOptions['from'])
    mailOptions['from'] = "{0} <{1}>".format(mailOptions['from_name'], apiObj.config.MAIL_DEFAULT_FROM_USER);

    send(mailOptions, context, function(error, info){
      if(error){
        apiObj.logger("The '{0}' email to {1} couldn't be sent. Stacktrace: {2}".format(mailTemplate.subject, mailOptions.to, error), "CRITICAL");
      } else {
        apiObj.logger("The '{0}' email to {1} was succefully sent.".format(mailTemplate.subject, mailOptions.to), "INFO");
      }

      callback((error ? true : false));
    });
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

  this.finishAudit = function(requestKey, returnValues, extra) {
    try {
      returnValues = JSON.parse(returnValues);
    } catch (e) {
    }

    var requestInfo = apiObj.audit[requestKey];

    requestInfo["end-time"] = moment().format("YYYYMMDDHHmmssSSSZZ");

    var beginMoment = moment(requestInfo["begin-time"], "YYYYMMDDHHmmssSSSZZ");
    var endMoment = moment(requestInfo["end-time"], "YYYYMMDDHHmmssSSSZZ");

    var minutes = endMoment.diff(beginMoment, "minutes");
    var seconds = endMoment.diff(beginMoment, "seconds");
    var milliseconds = endMoment.diff(beginMoment, "milliseconds");

    requestInfo["duration"] = minutes + "m" + (seconds - (minutes * 60)) + "s" + (milliseconds - (seconds * 1000)) + "ms";
    requestInfo["returnValues"] = returnValues;
    requestInfo["extra"] = extra;

    var auditInfo = {};
    auditInfo[requestKey] = requestInfo;
    apiObj.logger(JSON.stringify(auditInfo), "REQUEST-END", apiObj.config.AUDIT_LOG);
  }

  /**************************************************************************/
  /* FUNCTION VALIDATION - BEGIN */
  /**************************************************************************/
  // TODO: BREAK THIS SHIT IN PIECES!

  this.validateFunction = function(functionName, requestBody, callback) {
    var mapPath = apiObj.config.API_FUNCTIONS_MAP;
    var functionsMap = apiObj.functionsMap;
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
            "description": apiObj._lang.validation.mandatory_parameter_not_found
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

        var requestKey = apiObj.startAudit(functionId, requestBody);
        var validationErrors = apiObj.validateFunction(functionId, requestBody);

        if (validationErrors) {
          var returnValues = {"status":"ERROR", "validationErrors": validationErrors};
          var returnExtra = {
              status: 500,
              type: 'application/json',
              headers: null
            };
          apiObj.finishAudit(requestKey, returnValues, returnExtra);
          res.status(returnExtra.status).type(returnExtra.type).send(returnValues);
        } else {

          if (typeof apiObj.functions[functionId] === "undefined") {
            var returnValues = {"status":"ERROR", "description": "Function not registred."};
            var returnExtra = {
              status: 404,
              type: 'application/json',
              headers: null
            };
            apiObj.finishAudit(requestKey, returnValues, returnExtra);
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

              apiObj.finishAudit(requestKey, returnValues, returnExtra);
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

module.exports = API2Go;
// That's all folks!
