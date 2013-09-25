"use strict";

var _ = require("underscore");
var util = require("substance-util");
var Controller = require("substance-application").Controller;
var LensView = require("./lens_view");
var Test = require("substance-test");
var Library = require("substance-library");
var LibraryController = Library.Controller;
var CollectionController = Library.Collection.Controller; // require("./collection_controller");
var LensArticle = require("lens-article");
var Article = require("substance-article");
var ReaderController = require("lens-reader").Controller;

// var Chronicle = require("substance-chronicle");
var Converter = require("lens-converter");

// Lens.Controller
// -----------------
//
// Main Application Controller

var LensController = function(config) {
  Controller.call(this);

  this.config = config;

  // Main controls
  this.on('open:reader', this.openReader);
  this.on('open:library', this.openLibrary);
  this.on('open:login', this.openLogin);
  this.on('open:test_center', this.openTestCenter);
};

LensController.Prototype = function() {

  // Initial view creation
  // ===================================

  this.createView = function() {
    var view = new LensView(this);
    this.view = view;
    return view;
  };


  // After a file gets drag and dropped it will be remembered in Local Storage
  // ---------

  this.storeXML = function(xml) {
    var importer = new Converter.Importer();
    var doc = importer.import(xml);

    // Always set id to 'last' for imported documents
    doc.id = "last";

    try {
      localStorage.setItem("localdoc", JSON.stringify(doc));
    }catch (e) {
      console.log(e);
    }

    // HACK: don't use the global app.router instance
    app.router.navigate('/mydocs', true);
    app.router.navigate('/mydocs/last', true);
  };


  this.populateLibWithLocalDocs = function(data) {
    var localDoc = null;
    
    try {
      localDoc = JSON.parse(localStorage.getItem("localdoc"));
    }catch (e) {
      console.log(e);
    }

    if (localDoc) {
      var docId = localDoc.nodes.document.guid;

      data.nodes["mydocs"].records = ["last"];

      var record = {
        id: "last",
        type: "record",
        title: localDoc.nodes.document.title,
        authors: [],
        url: "localstore://last"
      }

      _.each(localDoc.nodes.document.authors, function(personId) {
        record.authors.push(localDoc.nodes[personId].name);
      });
      data.nodes["last"] = record;
    }

    return data;
  };

  // Loaders
  // --------

  this.loadLibrary = function(url, cb) {
    var that = this;
    if (this.__library) return cb(null);

    $.getJSON(url, function(data) {
      if (url.match(/lens_library\.json/)) {
        data = that.populateLibWithLocalDocs(data);
      }

      that.__library = new Library({
        seed: data
      });
      cb(null);
    }).error(cb);
  };

  // Update Hash fragment
  // --------
  // 

  this.updatePath = function(state) {
    var path = [this.state.collection, this.state.document];

    path.push(state.context);

    if (state.node) {
      path.push(state.node);
    } else {
      path.push('all');
    }

    if (state.resource) {
      path.push(state.resource);
    }

    if (state.fullscreen) {
      path.push('fullscreen');
    }

    window.app.router.navigate(path.join('/'), {
      trigger: false,
      replace: false
    });
  };

  // Transitions
  // ===================================

  var _LOCALSTORE_MATCHER = new RegExp("^localstore://(.*)");

  var _open = function(state, documentId) {


    var that = this;

    var _onDocumentLoad = function(err, doc) {
      if (err) {
        console.log(err.stack);
        throw err;
      }

      that.reader = new ReaderController(doc, state);

      // Trigger URL Fragment update on every state change
      that.reader.on('state-changed', function() {
        that.updatePath(that.reader.state);
      });

      that.modifyState({
        context: 'reader'
      });
    };

    // HACK: for activating the NLM importer ATM it is not possible
    // to leave the loading to the library as it needs the Lens Converter for that.
    // Options:
    //  - provide the library with a document loader which would be constructed here
    //  - do the loading here
    // prefering option2 as it is simpler to achieve...

    var record = this.__library.get(documentId);
    var match = _LOCALSTORE_MATCHER.exec(record.url);

    if (match) {
      var docId = match[1];

      var docData = JSON.parse(localStorage.getItem("localdoc"));
      var doc = LensArticle.fromSnapshot(docData, {});
      _onDocumentLoad(null, doc);
    } else {
      $.get(record.url)
      .done(function(data) {
          var doc, err;

          // Determine type of resource
          var xml = $.isXMLDoc(data);

          // Process XML file
          if(xml) {
            var importer = new Converter.Importer();
            doc = importer.import(data);

            // Hotpatch the doc id, so it conforms to the id specified in the library file
            doc.id = documentId;
            console.log('ON THE FLY CONVERTED DOC', doc.toJSON());

          // Process JSON file
          } else {
            if(typeof data == 'string') data = $.parseJSON(data);
            if (data.schema && data.schema[0] === "lens-article") {
              doc = LensArticle.fromSnapshot(data);
            } else {
              doc = Article.fromSnapshot(data);
            }
            
          }
          _onDocumentLoad(err, doc);  
        })
      .fail(function(err) {
        console.error(err);
      });
    }
  };

  this.openReader = function(collectionId, documentId, context, node, resource, fullscreen) {
    // The article view state
    var state = {
      context: context || "toc",
      node: node,
      resource: resource,
      fullscreen: !!fullscreen,
    };

    this.trigger("loading:started", "Loading document ...");

    // Lens Controller state
    this.state = {
      collection: collectionId,
      document: documentId,
    };

    if (collectionId === "lens" && documentId === "lens_article") {
      return this.openLensArticle(state);
    }

    // Ensure the library is loaded
    this.loadLibrary(this.config.library_url, _open.bind(this, state, documentId));
  };

  this.openAbout = function() {
    this.openReader("lens", "about", "toc");
    app.router.navigate('lens/about', false);
  };

  this.openLensArticle = function(state) {
    var that = this;

    var doc = LensArticle.describe();
    this.reader = new ReaderController(doc, state);

    // Trigger URL Fragment update on every state change
    that.reader.on('state-changed', function() {
      that.updatePath(that.reader.state);
    });

    this.modifyState({
      context: 'reader'
    });

    // Lens Controller state
    this.state = {
      collection: "lens",
      document: "lens_article"
    };
  };


  this.openCollection = function(collectionId) {
    var that = this;

    function open() {
      // Defaults to lens collection
      var state = {
        context: 'collection',
        collection: collectionId
      };

      that.collection = new CollectionController(that.__library.getCollection(collectionId), state);
      that.modifyState(state);
    }

    // Ensure the library is loaded
    this.loadLibrary(this.config.library_url, open);
  };

  // Test control center
  this.openTestCenter = function(suite) {
    this.testRunner = new Test.Runner();
    this.modifyState({
      context: 'test_center',
      report: suite
    });

    // TODO: Run all suites instead of just choosing a default
    this.runSuite(suite);
  };

  // Provides an array of (context, controller) tuples that describe the
  // current state of responsibilities
  // --------
  //
  // E.g., when a document is opened:
  //    ["application", "document"]
  // with controllers taking responisbility:
  //    [this, this.document]
  //
  // The child controller (e.g., document) should itself be allowed to have sub-controllers.
  // For sake of prototyping this is implemented manually right now.
  // TODO: discuss naming

  this.getActiveControllers = function() {
    var result = [ ["sandbox", this] ];

    var context = this.state.context;

    if (context === "article") {
      result = result.concat(this.article.getActiveControllers());
    } else if (context === "library") {
      result = result.concat(["library", this.library]);
    } else if (context === "test_center") {
      result.push(["test_center", this.testRunner]);
    }
    return result;
  };


  // Load and run testsuite
  // --------

  this.runSuite = function(suite, cb) {
    cb = cb || function(err) {
      if (err) console.log('ERROR', err);
    };

    if (!suite) return this.runAllSuites(cb);
    this.testRunner.runSuite(suite, cb);
  };


  // Load and run testsuite
  // --------

  this.runAllSuites = function(cb) {
    var suites = this.testRunner.getTestSuites();
    var testRunner = this.testRunner;

    var funcs = _.map(suites, function(suite, suiteName) {
      return function(data, cb) {
        testRunner.runSuite(suiteName, cb);
      };
    });

    util.async.sequential({
      functions: funcs,
      stopOnError: false
    }, cb);
  };
};


// Exports
// --------

LensController.Prototype.prototype = Controller.prototype;
LensController.prototype = new LensController.Prototype();
_.extend(LensController.prototype, util.Events);

module.exports = LensController;
