// Generic logger module
// Created by Eduardo Quagliato <eduardo@quagliato.me>
// Bauru, Brasil
// 2015-12-26

var fs                       = require("fs");
var moment                   = require("moment");

module.exports = function(message, level, filename) {
  var LOG_FILENAME = config.GENERAL_LOG;
  var MAX_FILESIZE = config.MAX_LOG_FILESIZE; // 10MB

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
      if (level.toUpperCase() == "CRITICAL" || config.DEBUG_MODE == 1) {
        console.log(formattedMessage);
        if (typeof config.DEBUG_LOG !== "undefined") {
          fs.appendFileSync(config.DEBUG_LOG, formattedMessage + "\n", { encoding: "utf8", "mode": 644 });
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
}