var cdb = require('cartodb.js');
var Backbone = require('backbone');
var UploadConfig = require('./upload_config');
var Utils = require('cdb.Utils');

/** 
 *  Model that let user upload files
 *  to our endpoints
 *
 */

module.exports = Backbone.Model.extend({

  url: '/api/v1/imports',

  fileAttribute: 'filename',

  defaults: {
    type: '',
    value: '',
    interval: 0,
    progress: 0,
    state: 'idle',
    service_item_id: '',
    service_name: '',
    option: '',
    content_guessing: true,
    type_guessing: true
  },

  initialize: function(val, opts) {
    this.user = opts && opts.user;
    this._initBinds();
    // We need to validate entry attributes
    this._validate(this.attributes, { validate: true});
  },

  _initBinds: function() {
    this.bind('progress', function(progress) {
      this.set({
        progress: progress*100,
        state: 'uploading'
      });
    }, this);

    this.bind('change:value', function() {
      if (this.get('state') === "error") {
        this.set({ state: 'idle' })
        this.unset('get_error_text', { silent: true });
      }
    }, this);

    this.bind('error invalid', function(m, msg) {
      this.set({
        state: 'error',
        get_error_text: { title: 'Invalid import', what_about: msg || '' }
      }, { silent: true });
      // We need this, if not validate will run again and again and again... :(
      this.trigger('change');
    }, this);
  },

  validate: function(attrs) {
    if (!attrs) return;

    if (attrs.type === "file") {
      // Number of files
      if (attrs.value && attrs.value.length) {
        return "Unfortunately only one file is allowed per upload"
      }
      // File extension
      var name = attrs.value.name;
      var ext = name.substr(name.lastIndexOf('.') + 1);
      if (!_.contains(UploadConfig.fileExtensions, ext)) {
        return "Unfortunately this file extension is not allowed"
      }
      // File size
      if (this.user && ((this.user.get('remaining_byte_quota') * UploadConfig.fileTimesBigger) < attrs.value.size)) {
        return "Unfortunately the size of the file is bigger than your remaining quota"
      }
    }

    if (attrs.type === "remote") {
      // Valid remote visualization id?
      if (!attrs.remote_visualization_id) {
        return "The remote visualization id was not specified";
      }
      // Remote size?
      if (this.user && attrs.size && ((this.user.get('remaining_byte_quota') * UploadConfig.fileTimesBigger) < attrs.size)) {
        return "Unfortunately the size of the remote dataset is bigger than your remaining quota";
      }
    }

    if (attrs.type === "url") {
      // Valid URL?
      if (!Utils.isURL(attrs.value)) {
        return "Unfortunately the URL provided is not valid"
      }
    }
  },

  isValid: function() {
    return this.get('value') && this.get('state') !== "error"
  },

  upload: function() {
    if (this.get('type') === "file") {
      var self = this;
      this.xhr = this.save(
        {
          filename: this.get('value')
        },
        {
          success: function(m) {
            m.set('state', 'uploaded');
          },
          error: function(m, msg) {

            var message = 'Unfortunately there was a connection error';

            if (msg && msg.status === 429) {
              var response = JSON.parse(msg.responseText);
              message = response.errors.imports;
            }

            self.set({
              state: 'error',
              get_error_text: { title: 'There was an error', what_about: message }
            });

          },
          complete: function() {
            delete self.xhr;
          }
        }
      );
    }
  },

  stopUpload: function() {
    if (this.xhr) this.xhr.abort();
  }

});
