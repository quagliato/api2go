// API2GO - Mail
// 2017-03-07, Curitiba - Brazil
// Author: Eduardo Quagliato<eduardo@quagliato.me>

// Dependencies
const fs                     = require('fs');
const htmlToText             = require('nodemailer-html-to-text').htmlToText;
const moment                 = require('moment');
const nodemailer             = require("nodemailer");
const smtpTransport          = require('nodemailer-smtp-transport');

/*
 * 2017-03-07, Curitiba - Brazil
 * Author: Eduardo Quagliato<eduardo@quagliato.me>
 * Description: The default mail function
 */
module.exports = function(apiObj, mailOptions, mailTemplate, context, callback){

    const validateEmail = function(address){
      let ok = true;
      if (address.indexOf("@") <= 0) ok = false;
      let postAt = address.substr(address.indexOf("@"));
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

    let transporter = nodemailer.createTransport(smtpTransport({
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

    let send = transporter.templateSender(mailTemplate);

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