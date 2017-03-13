'use strict'

// API2GO - Request validation
// 2017-03-07, Curitiba - Brazil
// Author: Eduardo Quagliato<eduardo@quagliato.me>

// Dependencies
const moment                 = require('moment');
const sha1                   = require('sha1');

/*
 * 2017-03-07, Curitiba - Brazil
 * Author: Eduardo Quagliato<eduardo@quagliato.me>
 * Description: validates request's body based on its mapping.
 */
module.exports = function(apiObj, functionName, requestBody, callback) {
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