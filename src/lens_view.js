"use strict";

var _ = require("underscore");
var util = require('substance-util');
var html = util.html;
var View = require("substance-application").View;
var TestCenter = require("substance-test").TestCenter;

// Lens.View Constructor
// ==========================================================================

var LensView = function(controller) {
  View.call(this);

  this.controller = controller;
  this.$el.attr({id: "container"});

  // Handle state transitions
  // --------
  
  this.listenTo(this.controller, 'context-changed', this.onContextChanged);
  this.listenTo(this.controller, 'loading:started', this.displayLoadingIndicator);

  $(document).on('dragover', function () { return false; });
  $(document).on('ondragend', function () { return false; });
  $(document).on('drop', this.handleDroppedFile.bind(this));
};



LensView.Prototype = function() {

  this.displayLoadingIndicator = function(msg) {
    this.$('#main').empty();
    this.$('.loading').html(msg).show();
  };

  this.handleDroppedFile = function(e) {
    var ctrl = this.controller;
    var files = event.dataTransfer.files;
    var file = files[0];
    var reader = new FileReader();

    reader.onload = function(e) {
      ctrl.storeXML(e.target.result);
    };

    reader.readAsText(file);
    return false;
  };

  // Session Event handlers
  // ==========================================================================
  //

  this.onContextChanged = function(context) {
    if (context === "reader") {
      this.openReader();
    // } else if (context === "library") {
    //   this.openLibrary();
    } else if (context === "collection") {
      this.openCollection();
    } else if (context === "test_center") {
      this.openTestCenter();
    } else {
      console.log("Unknown application state: " + context);
    }

    this.updateMenu();
  };

  this.updateMenu = function() {
    var hash = window.location.hash;

    this.$('.toggle-view').removeClass('active');
    if (hash.match(/#examples/)) {
      this.$('.toggle-view.examples').addClass('active')
    } else if (hash.match(/lens_article/)) {
      this.$('.toggle-view.lens-article').addClass('active');
    } else if (hash.match(/manual/)) {
      this.$('.toggle-view.manual').addClass('active');
    } else if (hash.match(/tests/)) {
      this.$('.toggle-view.tests').addClass('active');
    } else {
      this.$('.toggle-view.about').addClass('active');
    }
  };

  this.convertDocument = function() {
    console.log('converting..');
  };

  // Open Collection
  // ----------
  //

  this.openCollection = function() {
    var view = this.controller.collection.createView();
    this.replaceMainView('collection', view);
  };

  // Open the reader view
  // ----------
  //

  this.openReader = function() {
    // Application controller has a editor controller ready
    // -> pass it to the editor view
    // var view = new EditorView(this.controller.editor.view);

    var view = this.controller.reader.createView();
    this.replaceMainView('reader', view);
  };

  // Open TestCenter
  // ----------
  //

  this.openTestCenter = function() {
    var view = new TestCenter(this.controller.testRunner, this.controller.state);
    this.replaceMainView('test_center', view);
  };


  // Rendering
  // ==========================================================================
  //

  this.replaceMainView = function(name, view) {
    $('body').removeClass().addClass('current-view '+name);

    // if (this.mainView && this.mainView !== view) {
    //   console.log('disposing it..');
    //   this.mainView.dispose();
    // }

    this.mainView = view;
    this.$('#main').html(view.render().el);
  };

  this.render = function() {
    this.$el.html(html.tpl('lens', this.controller.session));
    return this;
  };

  this.dispose = function() {
    this.stopListening();
    if (this.mainView) this.mainView.dispose();
  };
};




// Export
// --------

LensView.Prototype.prototype = View.prototype;
LensView.prototype = new LensView.Prototype();

module.exports = LensView;
