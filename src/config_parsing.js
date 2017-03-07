// API2GO - Configuration parsing
// 2017-03-07, Curitiba - Brazil
// Author: Eduardo Quagliato<eduardo@quagliato.me>

// Dependencies
const fs                     = require('fs');

module.exports = {
  /*
   * 2017-03-07, Curitiba - Brazil
   * Author: Eduardo Quagliato<eduardo@quagliato.me>
   * Description: Reads the configuration from a file.
   */
  readFromFile: function (configFilepath) {
    var fileConfigs = {};

    var fileData = fs.lstatSync(configFilepath);
    if (!fileData) {
        console.log(`Couldn't find ${configFilepath}.`);
    } else {
      console.log(`Loading config file ${configFilepath}`);
      var fileContent = fs.readFileSync(configFilepath);
      if (!fileContent) {
        console.log(`Couldn't find config file.`);
      } else {
        var configJSON = JSON.parse(fileContent);
        for (var key in configJSON) {
          fileConfigs[key] = configJSON[key];
        }
      }
    }

    return fileConfigs;
  },

  /*
   * 2017-03-07, Curitiba - Brazil
   * Author: Eduardo Quagliato<eduardo@quagliato.me>
   * Description: Merges two sets of configuration
   */
  mergeConfig: function (primary, secondary) {
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
  },

  /*
   * 2017-03-07, Curitiba - Brazil
   * Author: Eduardo Quagliato<eduardo@quagliato.me>
   * Description: Loads the default configuration and the custom and merges it.
   */
  loadConfigFile: function (preseted, loadCallback) {
    let configs = {};

    const defaultConfigs = this.readFromFile(`${__dirname}/../_assets/config-default.json`);
    if (typeof preseted === 'string') {
      const customConfigs = this.readFromFile(preseted);
      configs = this.mergeConfig(defaultConfigs, customConfigs);
    } else {
      if (preseted !== undefined) configs = preseted;
      configs = this.mergeConfig(defaultConfigs, preseted);
    }

    return configs;
  }
}