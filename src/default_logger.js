// API2GO - Default logger
// 2017-03-07, Curitiba - Brazil
// Author: Eduardo Quagliato<eduardo@quagliato.me>

// Dependencies
const fs                     = require('fs');
const moment                 = require('moment');

/*
 * 2017-03-07, Curitiba - Brazil
 * Author: Eduardo Quagliato<eduardo@quagliato.me>
 * Description: The default log engine, using local filesystem.
 */
module.exports = function (apiObj, message, level, bucket) {
  let filename = apiObj.config.LOG.buckets['all'] || 'general.log';
  if (bucket !== undefined) {
    if (!apiObj.config.LOG.buckets.hasOwnProperty(bucket.toLowerCase())) {
      console.log(`The bucket ${bucket} is not set up in the configuration file.`);
      return false;
    }

    filename = apiObj.config.LOG.buckets[bucket.toLowerCase()];
  }

  const maxFilesize = apiObj.config.LOG.max_filesize || 10485760; // 10MB
  const logTimestamp = moment().format('YYYY-MM-DD HH:mm:ss.SSS ZZ');

  if (level === undefined) level = 'INFO';

  fs.lstat(filename, function (err, stats){
    if (!err && stats.size >= maxFilesize) {
      return rotate(filename, function(err){
        if (err) {
          throw err;
        }

        print(filename, message, level, logTimestamp);
      });
    }
    print(filename, message, level, logTimestamp);
  });

  /*
    * 2017-03-07, Curitiba - Brazil
    * Author: Eduardo Quagliato<eduardo@quagliato.me>
    * Description: Actual writing on the file
    */
  function print (filename, message, level, logTimestamp) {
    let onlyFilename = filename;
    while (onlyFilename.indexOf('/') >= 0) onlyFilename = onlyFilename.substr(onlyFilename.indexOf('/') + 1);

    mkdirp(`${__dirname}/../${filename}`.replace(onlyFilename, ''));

    const formattedMessage = `[${logTimestamp}] [${level.toUpperCase()}] ${message}`;
    fs.appendFileSync(filename, formattedMessage + '\n', { encoding: "utf8", "mode": 644 });
    if (level.toUpperCase() == "CRITICAL" || apiObj.config.DEBUG_MODE == 1) {
      console.log(formattedMessage);
    }
  }

  /*
    * 2017-03-07, Curitiba - Brazil
    * Author: Eduardo Quagliato<eduardo@quagliato.me>
    * Description: If the log file hits the max_filesize, it rotates it.
    */
  function rotate (filename, callback) {
    fs.rename(filename, filename + "." + moment().format("YYYYMMDDHHmmssSSSZZ"), function(err, data){
      if (err) return callback(err);
      callback();
    });
  }

  /*
    * 2017-03-07, Curitiba - Brazil
    * Author: Eduardo Quagliato<eduardo@quagliato.me>
    * Description: It creates directores recursively.
    */
  function mkdirp (destination) {
    const directories = destination.split('/');
    let composedPath = '';
    if (directories.length > 0) {
      for (let i = 0; i < directories.length; i++) {
        if (directories[i].trim() === '') continue;

        composedPath += `/${directories[i]}`;
        if (!fs.existsSync(composedPath)) {
          fs.mkdirSync(composedPath);
        }
      }
    }

    return true;
  }
};