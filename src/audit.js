'use strict'

// API2GO - Audit
// 2017-03-07, Curitiba - Brazil
// Author: Eduardo Quagliato<eduardo@quagliato.me>

// Dependencies
const moment                 = require('moment');
const sha1                   = require('sha1');

/*
 * 2017-03-07, Curitiba - Brazil
 * Author: Eduardo Quagliato<eduardo@quagliato.me>
 * Description: constructor
 */
function Audit (apiObj) {
  this.apiObj = apiObj;
  this.records = {};
};

/*
 * 2017-03-07, Curitiba - Brazil
 * Author: Eduardo Quagliato<eduardo@quagliato.me>
 * Description: It starts the process of auditoring.
 */
Audit.prototype.start = function (functionName, values) {
  const audit = this;
  const apiObj = this.apiObj;
  const requestInfo = {
    function: functionName,
    values: values,
    begin: moment().format("YYYYMMDDHHmmssSSSZZ")
  };

  var requestKey = sha1(JSON.stringify(requestInfo));
  requestInfo.requestKey = requestKey;

  audit.records[requestKey] = requestInfo;

  apiObj.logger(JSON.stringify(audit.records[requestKey]), 'REQUEST_BEGIN', 'audit');

  return requestKey;
};

/*
 * 2017-03-07, Curitiba - Brazil
 * Author: Eduardo Quagliato<eduardo@quagliato.me>
 * Description: It finishes the process of auditoring.
 */
Audit.prototype.finish = function (requestKey, returnValues, extra) {
  const apiObj = this.apiObj;
  const audit = this;

  const requestInfo = audit.records[requestKey];

  requestInfo.end = moment().format("YYYYMMDDHHmmssSSSZZ");

  let beginMoment = moment(requestInfo.begin, "YYYYMMDDHHmmssSSSZZ");
  let endMoment = moment(requestInfo.end, "YYYYMMDDHHmmssSSSZZ");

  const minutes = endMoment.diff(beginMoment, "minutes");
  const seconds = endMoment.diff(beginMoment, "seconds");
  const milliseconds = endMoment.diff(beginMoment, "milliseconds");

  requestInfo.duration = `${minutes}m${(seconds - (minutes * 60))}s${(milliseconds - (seconds * 1000))}ms`;
  if (typeof returnValues !== 'string') returnValues = JSON.stringify(returnValues)
  if (returnValues.length > 500) {
    returnValues = returnValues.substr(0, 500) + '...'
  } else {
    try {
      returnValues = JSON.parse(returnValues);
    } catch (e) {
    }
  }
  requestInfo.returnValues = returnValues
  requestInfo.extra = extra;

  var auditInfo = {};
  auditInfo[requestKey] = requestInfo;

  apiObj.logger(JSON.stringify(auditInfo), "REQUEST-END", 'audit');
};
  

module.exports = Audit;