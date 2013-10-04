;(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
window.Lens = require("./src/lens");
},{"./src/lens":213}],2:[function(require,module,exports){
module.exports={
  "env": "development",
  "library_url": "/data/lens_library.json"
}
},{}],3:[function(require,module,exports){
module.exports=// The Lens Router
// --------

[
  {
    "route": ":collection/:document/:context/:node/:resource/:fullscreen",
    "name": "document-resource",
    "command": "openReader"
  },
  {
    "route": ":collection/:document/:context/:node/:resource",
    "name": "document-resource",
    "command": "openReader"
  },
  {
    "route": ":collection/:document/:context/:node/:resource",
    "name": "document-resource",
    "command": "openReader"
  },
  {
    "route": ":collection/:document/:context/:node",
    "name": "document-node", 
    "command": "openReader"
  },
  {
    "route": ":collection/:document/:context",
    "name": "document-context",
    "command": "openReader"
  },
  {
    "route": ":collection/:document", 
    "name": "document",
    "command": "openReader"
  },
  {
    "route": ":collection",
    "name": "collection",
    "command": "openCollection"
  },
  {
    "route": "",
    "name": "about",
    "command": "openAbout"
  },
  {
    "route": "tests",
    "name": "tests",
    "command": "openTestCenter"
  },
  {
    "route": "tests/:suite",
    "name": "tests",
    "command": "openTestCenter"
  }
]
},{}],4:[function(require,module,exports){
"use strict";

var _ = require("underscore");
var util = require("substance-util");
var Document = require("substance-document");

// Lens.Article
// -----------------

var Article = function(options) {
  options = options || {};

  // Check if format is compatible

  // Extend Schema
  // --------

  options.schema = util.deepclone(Document.schema);

  options.schema.id = "lens-article";
  options.schema.version = "0.1.0";

  // Merge in custom types
  _.each(Article.types, function(type, key) {
    options.schema.types[key] = type;
  });

  // Register annotation types
  _.each(Article.annotations, function(aType, key) {
    options.schema.types[key] = aType;
  });


  // Merge in node types
  _.each(Article.nodeTypes, function(nodeSpec, key) {
    options.schema.types[key] = nodeSpec.Model.type;
  });

  // Merge in custom indexes
  _.each(Article.indexes, function(index, key) {
    options.schema.indexes[key] = index;
  });

  // Call parent constructor
  // --------

  Document.call(this, options);

  // Index for easy mapping from NLM sourceIds to generated nodeIds
  // Needed for resolving figrefs / citationrefs etc.
  this.bySourceId = this.addIndex("by_source_id", {
    types: ["content"],
    property: "source_id"
  });

  this.nodeTypes = Article.nodeTypes;

  // Seed the doc
  // --------

  if (options.seed === undefined) {
    this.create({
      id: "document",
      type: "document",
      guid: options.id, // external global document id
      creator: options.creator,
      created_at: options.created_at,
      views: ["content"], // is views really needed on the instance level
      title: "",
      abstract: ""
    });

    // Create views on the doc
    _.each(Article.views, function(view) {
      this.create({
        id: view,
        "type": "view",
        nodes: []
      });
    }, this);
  }
};


// Renders an article
// --------
//

Article.Renderer = function(docCtrl, options) {
  this.docCtrl = docCtrl;

  this.nodeTypes = Article.nodeTypes;

  this.options = options || {};

  // Collect all node views
  this.nodes = {};

  // Build views
  _.each(this.docCtrl.getNodes(), function(node) {
    this.nodes[node.id] = this.createView(node);
  }, this);

};

Article.Renderer.Prototype = function() {

  // Create a node view
  // --------
  //
  // Experimental: using a factory which creates a view for a given node type
  // As we want to be able to reuse views
  // However, as the matter is still under discussion consider the solution here only as provisional.
  // We should create views, not only elements, as we need more, e.g., event listening stuff
  // which needs to be disposed later.

  this.createView = function(node) {
    var NodeView = this.nodeTypes[node.type].View;

    if (!NodeView) {
      throw new Error('Node type "'+node.type+'" not supported');
    }

    // Note: passing the factory to the node views
    // to allow creation of nested views
    var nodeView = new NodeView(node, this);

    // we connect the listener here to avoid to pass the document itself into the nodeView
    nodeView.listenTo(this.docCtrl, "operation:applied", nodeView.onGraphUpdate);
    return nodeView;
  };

  // Render it
  // --------
  //

  this.render = function() {
    _.each(this.nodes, function(nodeView) {
      nodeView.dispose();
    });

    var frag = document.createDocumentFragment();

    var docNodes = this.docCtrl.container.getTopLevelNodes();
    _.each(docNodes, function(n) {
      this.renderNode(n, frag);
    }, this);
    
    return frag;
  };


  this.renderNode = function(n, frag) {
    var view = this.createView(n);
    frag.appendChild(view.render().el);
    // Lets you customize the resulting DOM sticking on the el element
    // Example: Lens focus controls
    if (this.options.afterRender) this.options.afterRender(this.docCtrl, view);
  };

};

Article.Renderer.prototype = new Article.Renderer.Prototype();


Article.Prototype = function() {
  this.fromSnapshot = function(data, options) {
    return Article.fromSnapshot(data, options);
  };

  // For a given NLM source id, returns the corresponding node in the document graph
  // --------

  this.getNodeBySourceId = function(sourceId) {
    var nodes = this.bySourceId.get(sourceId);
    var nodeId = Object.keys(nodes)[0];
    var node = nodes[nodeId];
    return node;
  };
};

// Factory method
// --------
//
// TODO: Ensure the snapshot doesn't get chronicled

Article.fromSnapshot = function(data, options) {
  options = options || {};
  options.seed = data;
  return new Article(options);
};


// Define available views
// --------

Article.views = ["content", "figures", "citations", "info"];


// Register node types
// --------

Article.nodeTypes = require("./nodes");


// Define annotation types
// --------

Article.annotations = {

  "strong": {
    "parent": "annotation",
    "properties": {
    }
  },

  "emphasis": {
    "properties": {
    },
    "parent": "annotation"
  },

  "subscript": {
    "properties": {
    },
    "parent": "annotation"
  },

  "superscript": {
    "properties": {
    },
    "parent": "annotation"
  },

  "underline": {
    "properties": {
    },
    "parent": "annotation"
  },

  "code": {
    "parent": "annotation",
    "properties": {
    }
  },

  "link": {
    "parent": "annotation",
    "properties": {
      "url": "string"
    }
  },

  "idea": {
    "parent": "annotation",
    "properties": {
    }
  },

  "error": {
    "parent": "annotation",
    "properties": {
    }
  },

  "question": {
    "parent": "annotation",
    "properties": {
    }
  },

  // Dark blueish person references in the cover
  // They should work everywhere else too

  "person_reference": {
    "parent": "annotation",
    "properties": {
      "target": "person"
    }
  },

  // Greenish figure references in the text

  "figure_reference": {
    "parent": "annotation",
    "properties": {
      "target": "figure"
    }
  },

  // Blueish citation references in the text

  "citation_reference": {
    "parent": "annotation",
    "properties": {
      "target": "content"
    }
  },

  "cross_reference": {
    "parent": "annotation",
    "properties": {
      "target": "content"
    }
  },

  "formula_reference": {
    "parent": "annotation",
    "properties": {
      "target": "content"
    }
  }

};

// Custom type definitions
// --------
//
// Holds comments

Article.types = {

  // Abstarct Annotation Node
  // --------

  "annotation": {
    "properties": {
      "path": ["array", "string"], // -> e.g. ["text_1", "content"]
      "range": "object"
    }
  },

  // Abstract Figure Type
  // --------

  "figure": {
    "properties": {
    }
  },

  // "file": {
  //   "properties": {
  //   }
  // },

  "institution": {
    "properties": {
    }
  },

  "email": {
    "properties": {
    }
  },

  "funding": {
    "properties": {
    }
  },

  "caption": {
    "properties": {
    }
  },

  // Abstract Citation Type
  // --------

  "citation": {
    "properties": {
    }
  },

  // Document
  // --------

  "document": {
    "properties": {
      "views": ["array", "view"],
      "guid": "string",
      "creator": "string",
      "title": "string",
      "authors": ["array", "person"],
      "abstract": "string"
    }
  },

  // Comments
  // --------

  "comment": {
    "properties": {
      "content": "string",
      "created_at": "string", // should be date
      "creator": "string", // should be date
      "node": "node" // references either a content node or annotation
    }
  }
};

// From article definitions generate a nice reference document
// --------
//


var ARTICLE_DOC_SEED = {
  "id": "lens_article",
  "nodes": {
    "document": {
      "type": "document",
      "id": "document",
      "views": [
        "content"
      ],
      "title": "The Anatomy of a Lens Article",
      "authors": ["person_1", "person_2", "person_3"],
      "guid": "lens_article"
    },


    "content": {
      "type": "view",
      "id": "content",
      "nodes": [
        "cover",
      ]
    },

    "cover": {
      "id": "cover",
      "type": "cover"
    },

    "person_1": {
      "id": "person_1",
      "type": "person",
      "name": "Michael Aufreiter"
    },

    "person_2": {
      "id": "person_2",
      "type": "person",
      "name": "Ivan Grubisic"
    },

    "person_3": {
      "id": "person_3",
      "type": "person",
      "name": "Rebecca Close"
    }
  }
};

Article.describe = function() {
  var doc = new Article({seed: ARTICLE_DOC_SEED});

  var id = 0;

  _.each(Article.nodeTypes, function(nodeType) {
    nodeType = nodeType.Model;
    console.log('NAME', nodeType.description.name, nodeType.type.id);

    // Create a heading for each node type
    var headingId = "heading_"+nodeType.type.id;

    doc.create({
      id: headingId,
      type: "heading",
      content: nodeType.description.name,
      level: 1
    });

    // Turn remarks and description into an introduction paragraph
    var introText = nodeType.description.remarks.join(' ');
    var introId = "text_"+nodeType.type.id+"_intro";

    doc.create({
      id: introId,
      type: "text",
      content: introText,
    });


    // Show it in the content view
    doc.show("content", [headingId, introId], -1);


    // Include property description
    // --------
    //

    doc.create({
      id: headingId+"_properties",
      type: "text",
      content: nodeType.description.name+ " uses the following properties:"
    });

    doc.show("content", [headingId+"_properties"], -1);

    var items = [];

    _.each(nodeType.description.properties, function(propertyDescr, key) {

      var listItemId = "text_" + (++id);
      doc.create({
        id: listItemId,
        type: "text",
        content: key +": " + propertyDescr
      });

      // Create code annotation for the propertyName
      doc.create({
        "id": id+"_annotation",
        "type": "code",
        "path": [listItemId, "content"],
        "range":[0, key.length]
      });

      items.push(listItemId);
    });

    // Create list
    doc.create({
      id: headingId+"_property_list",
      type: "list",
      items: items,
      ordered: false
    });

    // And show it
    doc.show("content", [headingId+"_property_list"], -1);

    // Include example
    // --------
    //

    doc.create({
      id: headingId+"_example",
      type: "text",
      content: "Here's an example:"
    });

    doc.create({
      id: headingId+"_example_codeblock",
      type: "codeblock",
      content: JSON.stringify(nodeType.example, null, '  '),
    });

    doc.show("content", [headingId+"_example", headingId+"_example_codeblock"], -1);

  });

  return doc;
};


Article.Prototype.prototype = Document.prototype;
Article.prototype = new Article.Prototype();
Article.prototype.constructor = Article;


// Add convenience accessors for builtin document attributes
Object.defineProperties(Article.prototype, {
  id: {
    get: function () {
      return this.get("document").guid;
    },
    set: function(id) {
      this.get("document").guid = id;
    }
  },
  creator: {
    get: function () {
      return this.get("document").creator;
    },
    set: function(creator) {
      this.get("document").creator = creator;
    }
  },
  created_at: {
    get: function () {
      return this.get("document").created_at;
    },
    set: function(created_at) {
      this.get("document").created_at = created_at;
    }
  },
  title: {
    get: function () {

      return this.get("document").title;
    },
    set: function(title) {
      this.get("document").title = title;
    }
  },
  abstract: {
    get: function () {
      return this.get("document").abstract;
    },
    set: function(abstract) {
      this.get("document").abstract = abstract;
    }
  },
  authors: {
    get: function () {
      var docNode = this.get("document");
      if (docNode.authors) {
        return _.map(docNode.authors, function(personId) {
          return this.get(personId);
        }, this);
      } else {
        return "";
      }
    },
    set: function(val) {
      var docNode = this.get("document");
      docNode.authors = _.clone(val);
    }
  },
  views: {
    get: function () {
      // Note: returing a copy to avoid inadvertent changes
      return this.get("document").views.slice(0);
    }
  },
});

module.exports = Article;

},{"./nodes":28,"substance-document":108,"substance-util":207,"underscore":212}],5:[function(require,module,exports){
"use strict";

var Article = require("./article");

module.exports = Article;
},{"./article":4}],6:[function(require,module,exports){
"use strict";

var Node = require("substance-document").Node;
var _ = require("underscore");

var Affiliation = function(node, doc) {
  Node.call(this, node, doc);
};

Affiliation.type = {
  "id": "affiliation",
  "parent": "content",
  "properties": {
    "source_id": "string",
    "city": "string",
    "country": "string",
    "department": "string",
    "institution": "string",
    "label": "string"
  }
};


Affiliation.description = {
  "name": "Affiliation",
  "description": "Person affiliation",
  "remarks": [
    "Name of a institution or organization, such as a university or corporation, that is the affiliation for a contributor such as an author or an editor."
  ],
  "properties": {
    "coming": "soon"
  }
};


Affiliation.example = {
  "id": "affiliation_1",
  "source_id": "aff1",
  "city": "Jena",
  "country": "Germany",
  "department": "Department of Molecular Ecology",
  "institution": "Max Planck Institute for Chemical Ecology",
  "label": "1",
  "type": "affiliation"
};

Affiliation.Prototype = function() {

};

Affiliation.Prototype.prototype = Node.prototype;
Affiliation.prototype = new Affiliation.Prototype();
Affiliation.prototype.constructor = Affiliation;


// Generate getters
// --------

var getters = {};

_.each(Affiliation.type.properties, function(prop, key) {
  getters[key] = {
    get: function() {
      return this.properties[key];
    }
  };
});

Object.defineProperties(Affiliation.prototype, getters);

module.exports = Affiliation;
},{"substance-document":108,"underscore":212}],7:[function(require,module,exports){
"use strict";

module.exports = {
  Model: require("./affiliation")
};

},{"./affiliation":6}],8:[function(require,module,exports){
var _ = require('underscore');
var Node = require('substance-document').Node;

// Lens.Box
// -----------------
//

var Box = function(node, doc) {
  Node.call(this, node, doc);
};


// Type definition
// -----------------
//

Box.type = {
  "id": "box",
  "parent": "content",
  "properties": {
    "source_id": "string",
    "label": "string",
    "children": ["array", "paragraph"]
  }
};

// This is used for the auto-generated docs
// -----------------
//

Box.description = {
  "name": "Box",
  "remarks": [
    "A box type.",
  ],
  "properties": {
    "label": "string",
    "children": "0..n Paragraph nodes",
  }
};


// Example Box
// -----------------
//

Box.example = {
  "id": "box_1",
  "type": "box",
  "label": "Box 1",
  "children": ["paragraph_1", "paragraph_2"]
};

Box.Prototype = function() {

};

Box.Prototype.prototype = Node.prototype;
Box.prototype = new Box.Prototype();
Box.prototype.constructor = Box;


// Generate getters
// --------

var getters = {};

var getters = {
  header: {
    get: function() {
      return this.properties.label;
    }
  }
};

_.each(Box.type.properties, function(prop, key) {
  getters[key] = {
    get: function() {
      return this.properties[key];
    }
  };
});


Object.defineProperties(Box.prototype, getters);

module.exports = Box;

},{"substance-document":108,"underscore":212}],9:[function(require,module,exports){
"use strict";

var _ = require("underscore");
var util = require("substance-util");
var html = util.html;
var NodeView = require("../node").View;
var $$ = require("substance-application").$$;


// Lens.Box.View
// ==========================================================================

var BoxView = function(node, viewFactory) {
  NodeView.call(this, node, viewFactory);

  this.$el.attr({id: node.id});
  this.$el.addClass("content-node box");
};

BoxView.Prototype = function() {

  // Render it
  // --------
  //

  this.render = function() {
    NodeView.prototype.render.call(this);

    // Create children views
    // --------
    // 

    var children = this.node.children;

    _.each(children, function(nodeId) {
      var child = this.node.document.get(nodeId);
      var childView = this.viewFactory.createView(child);
      var childViewEl = childView.render().el;
      this.content.appendChild(childViewEl);
    }, this);

    this.el.appendChild(this.content);

    return this;
  };
};

BoxView.Prototype.prototype = NodeView.prototype;
BoxView.prototype = new BoxView.Prototype();

module.exports = BoxView;

},{"../node":30,"substance-application":61,"substance-util":207,"underscore":212}],10:[function(require,module,exports){
"use strict";

module.exports = {
  Model: require('./box'),
  View: require('./box_view')
};

},{"./box":8,"./box_view":9}],11:[function(require,module,exports){
"use strict";

var Document = require("substance-document");

var Caption = function(node, document) {
  Document.Composite.call(this, node, document);
};

Caption.type = {
  "id": "caption",
  "parent": "content",
  "properties": {
    "source_id": "string",
    "title": "paragraph",
    "children": ["array", "paragraph"]
  }
};

// This is used for the auto-generated docs
// -----------------
//

Caption.description = {
  "name": "Caption",
  "remarks": [
    "Container element for the textual description that is associated with a Figure, Table, Video node etc.",
    "This is the title for the figure or the description of the figure that prints or displays with the figure."
  ],
  "properties": {
    "title": "Caption title (optional)",
    "children": "0..n Paragraph nodes",
  }
};


// Example File
// -----------------
//

Caption.example = {
  "no_example": "yet"
};

Caption.Prototype = function() {

  this.hasTitle = function() {
    return (!!this.properties.title);
  };

  // The nodes the composite should spit out
  this.getNodes = function() {
    var nodes = [];

    if (this.properties.children) {
      nodes = nodes.concat(this.properties.children);
    }
    return nodes;
  };

  this.getTitle = function() {
    if (this.properties.title) return this.document.get(this.properties.title);
  };

  // this.getCaption = function() {
  //   if (this.properties.caption) return this.document.get(this.properties.caption);
  // };
};

Caption.Prototype.prototype = Document.Composite.prototype;
Caption.prototype = new Caption.Prototype();
Caption.prototype.constructor = Caption;

Document.Node.defineProperties(Caption.prototype, ["title", "children"]);

module.exports = Caption;

},{"substance-document":108}],12:[function(require,module,exports){
"use strict";

var CompositeView = require("../composite").View;
var List = require("substance-document").List;
var $$ = require("substance-application").$$;

// Lens.Caption.View
// ==========================================================================

var CaptionView = function(node, viewFactory) {
  CompositeView.call(this, node, viewFactory);
};


CaptionView.Prototype = function() {

  // Rendering
  // =============================
  //

  this.render = function() {
    this.content = $$('div.content');

    var i;

    // dispose existing children views if called multiple times
    for (i = 0; i < this.childrenViews.length; i++) {
      this.childrenViews[i].dispose();
    }

    // Add title paragraph
    var titleNode = this.node.getTitle();
    if (titleNode) {
      var titleView = this.viewFactory.createView(titleNode);
      var titleEl = titleView.render().el;
      titleEl.classList.add('caption-title');
      this.content.appendChild(titleEl);
    }

    // create children views
    var children = this.node.getNodes();
    for (i = 0; i < children.length; i++) {
      var child = this.node.document.get(children[i]);
      var childView = this.viewFactory.createView(child);
      var childViewEl = childView.render().el;
      this.content.appendChild(childViewEl);
      this.childrenViews.push(childView);
    }

    this.el.appendChild(this.content);
    return this;
  };

  this.onNodeUpdate = function(op) {
    if (op.path[0] === this.node.id && op.path[1] === "items") {
      this.render();
    }
  };

};

CaptionView.Prototype.prototype = CompositeView.prototype;
CaptionView.prototype = new CaptionView.Prototype();

module.exports = CaptionView;

},{"../composite":18,"substance-application":61,"substance-document":108}],13:[function(require,module,exports){
"use strict";

module.exports = {
  Model: require("./caption"),
  View: require("./caption_view")
};

},{"./caption":11,"./caption_view":12}],14:[function(require,module,exports){
var _ = require('underscore');
var Node = require('substance-document').Node;

// Lens.Citation
// -----------------
//

var Citation = function(node) {
  Node.call(this, node);
};

// Type definition
// -----------------
//

Citation.type = {
  "id": "article_citation", // type name
  "parent": "content",
  "properties": {
    "source_id": "string",
    "title": "string",
    "label": "string",
    "authors": ["array", "string"],
    "doi": "string",
    "source": "string",
    "volume": "string",
    "fpage": "string",
    "lpage": "string",
    "year": "string",
    "citation_urls": ["array", "string"]
  }
};

// This is used for the auto-generated docs
// -----------------
//

Citation.description = {
  "name": "Citation",
  "remarks": [
    "A journal citation.",
    "This element can be used to describe all kinds of citations."
  ],
  "properties": {
    "title": "The article's title",
    "label": "Optional label (could be a number for instance)",
    "doi": "DOI reference",
    "source": "Usually the journal name",
    "volume": "Issue number",
    "fpage": "First page",
    "lpage": "Last page",
    "year": "The year of publication",
    "citation_urls": "A list of links for accessing the article on the web"
  }
};


// Example Citation
// -----------------
//

Citation.example = {
  "id": "article_nature08160",
  "type": "article_citation",
  "label": "5",
  "title": "The genome of the blood fluke Schistosoma mansoni",
  "authors": [
    "M Berriman",
    "BJ Haas",
    "PT LoVerde"
  ],
  "doi": "http://dx.doi.org/10.1038/nature08160",
  "source": "Nature",
  "volume": "460",
  "fpage": "352",
  "lpage": "8",
  "year": "1984",
  "citation_urls": [
    "http://www.ncbi.nlm.nih.gov/pubmed/19606141"
  ]
};


Citation.Prototype = function() {
  // Returns the citation URLs if available
  // Falls back to the DOI url
  // Always returns an array;
  this.urls = function() {
    return this.properties.citation_urls.length > 0 ? this.properties.citation_urls
                                                    : [this.properties.doi];
  };
};

Citation.Prototype.prototype = Node.prototype;
Citation.prototype = new Citation.Prototype();
Citation.prototype.constructor = Citation;


// Generate getters
// --------

var getters = {
  header: {
    get: function() {
      return this.properties.title;
    }
  }
};

_.each(Citation.type.properties, function(prop, key) {
  getters[key] = {
    get: function() {
      return this.properties[key];
    }
  };
});

Object.defineProperties(Citation.prototype, getters);

module.exports = Citation;

},{"substance-document":108,"underscore":212}],15:[function(require,module,exports){
"use strict";

var _ = require('underscore');
var util = require('substance-util');
var html = util.html;
var NodeView = require("../node").View;

var $$ = require("substance-application").$$;

var Renderer = function(view) {
    var frag = document.createDocumentFragment(),
        node = view.node;


    // Add Authors
    // -------

    frag.appendChild($$('.authors', {
      html: node.authors.join(', ')
    }));

    // Add Source
    // -------

    frag.appendChild($$('.source', {
      html: [
        [node.source, node.volume].join(', ')+": ",
        [node.fpage, node.lpage].join('-')+", ",
        node.year
      ].join('')
    }));

    // Add DOI (if available)
    // -------

    if (node.doi) {
      frag.appendChild($$('.doi', {
        children: [
          $$('b', {text: "DOI: "}),
          $$('a', {
            href: node.doi,
            target: "_new",
            text: node.doi
          })
        ]
      }));
    }

    // TODO: Add display citations urls
    // -------

    return frag;
};


// Lens.Citation.View
// ==========================================================================


var CitationView = function(node) {
  NodeView.call(this, node);

  this.$el.attr({id: node.id});
  this.$el.addClass('citation');
};


CitationView.Prototype = function() {

  this.render = function() {
    NodeView.prototype.render.call(this);
    this.content.appendChild(new Renderer(this));
    return this;
  };

};

CitationView.Prototype.prototype = NodeView.prototype;
CitationView.prototype = new CitationView.Prototype();
CitationView.prototype.constructor = CitationView;

module.exports = CitationView;

},{"../node":30,"substance-application":61,"substance-util":207,"underscore":212}],16:[function(require,module,exports){
"use strict";

module.exports = {
  Model: require('./citation'),
  View: require('./citation_view')
};

},{"./citation":14,"./citation_view":15}],17:[function(require,module,exports){
"use strict";

var SubstanceNodes = require("substance-nodes");

module.exports = SubstanceNodes["codeblock"];

},{"substance-nodes":132}],18:[function(require,module,exports){
"use strict";

var SubstanceNodes = require("substance-nodes");

module.exports = SubstanceNodes["composite"];

},{"substance-nodes":132}],19:[function(require,module,exports){
var _ = require('underscore');
var Node = require('substance-document').Node;

// Lens.Cover
// -----------------
//

var Cover = function(node, doc) {
  Node.call(this, node, doc);
};

// Type definition
// -----------------
//

Cover.type = {
  "id": "cover",
  "parent": "content",
  "properties": {
    "source_id": "string",
    "authors": ["array", "paragraph"]
    // No properties as they are all derived from the document node
  }
};


// This is used for the auto-generated docs
// -----------------
//

Cover.description = {
  "name": "Cover",
  "remarks": [
    "Virtual view on the title and authors of the paper."
  ],
  "properties": {
    "authors": "A paragraph that has the authors names plus references to the person cards"
  }
};

// Example Cover
// -----------------
//

Cover.example = {
  "id": "cover",
  "type": "cover"
};

Cover.Prototype = function() {

  this.getAuthors = function() {
    return _.map(this.properties.authors, function(paragraphId) {
      return this.document.get(paragraphId);
    }, this);
  };

};

Cover.Prototype.prototype = Node.prototype;
Cover.prototype = new Cover.Prototype();
Cover.prototype.constructor = Cover;

// Generate getters
// --------

var getters = {};


Object.defineProperties(Cover.prototype, {
  title: {
    get: function() {
      return this.document.title;
    }
  },
  authors: {
    // Expand author id's to corresponding person nodes
    get: function() {
      return this.document.authors;
    }
  }
});

module.exports = Cover;

},{"substance-document":108,"underscore":212}],20:[function(require,module,exports){
"use strict";

var _ = require("underscore");
var util = require("substance-util");
var html = util.html;
var NodeView = require("../node").View;
var $$ = require("substance-application").$$;

// Lens.Cover.View
// ==========================================================================

var CoverView = function(node, viewFactory) {
  NodeView.call(this, node, viewFactory);

  this.$el.attr({id: node.id});
  this.$el.addClass("content-node cover");
};


CoverView.Prototype = function() {

  // Render it
  // --------
  //
  // .content
  //   video
  //     source
  //   .title
  //   .caption
  //   .doi

  this.render = function() {
    NodeView.prototype.render.call(this);
    var node = this.node;

    this.content.appendChild($$('.title', {text: node.title }));

    // <span id="citation_reference_13" class="annotation citation_reference">Manz et al., 2011</span>
    // Add title paragraph
    // var titleNode = this.node.getTitle();

    var authors = $$('.authors', {
      children: _.map(node.getAuthors(), function(authorPara) {
        var paraView = this.viewFactory.createView(authorPara);
        var paraEl = paraView.render().el;
        this.content.appendChild(paraEl);
        return paraEl;
      }, this)
    });

    this.content.appendChild(authors);
    return this;
  }
};

CoverView.Prototype.prototype = NodeView.prototype;
CoverView.prototype = new CoverView.Prototype();

module.exports = CoverView;

},{"../node":30,"substance-application":61,"substance-util":207,"underscore":212}],21:[function(require,module,exports){
"use strict";

module.exports = {
  Model: require('./cover'),
  View: require('./cover_view')
};

},{"./cover":19,"./cover_view":20}],22:[function(require,module,exports){
"use strict";

var Document = require("substance-document");

var Figure = function(node, document) {
  Document.Composite.call(this, node, document);
};


Figure.type = {
  "parent": "content",
  "properties": {
    "source_id": "string",
    "label": "string",
    "url": "string",
    "caption": "caption",
    "attrib": "string"
  }
};

Figure.config = {
  "zoomable": true
};

// This is used for the auto-generated docs
// -----------------
//

Figure.description = {
  "name": "Figure",
  "remarks": [
    "A figure is a figure is figure.",
  ],
  "properties": {
    "label": "Label used as header for the figure cards",
    "url": "Image url",
    "caption": "A reference to a caption node that describes the figure",
    "attrib": "Figure attribution"
  }
};

// Example File
// -----------------
//

Figure.example = {
  "no_example": "yet"
};

Figure.Prototype = function() {

  this.hasCaption = function() {
    return (!!this.properties.caption);
  };

  this.getNodes = function() {
    var nodes = [];
    if (this.properties.caption) {
      nodes.push(this.properties.caption);
    }
    return nodes;
  };

  this.getCaption = function() {
    if (this.properties.caption) return this.document.get(this.properties.caption);
  };
};

Figure.Prototype.prototype = Document.Composite.prototype;
Figure.prototype = new Figure.Prototype();
Figure.prototype.constructor = Figure;

Document.Node.defineProperties(Figure.prototype, ["source_id", "label", "url", "caption", "attrib"]);

Object.defineProperties(Figure.prototype, {
  // Used as a resource header
  header: {
    get: function() { return this.properties.label; }
  }
});

module.exports = Figure;

},{"substance-document":108}],23:[function(require,module,exports){
"use strict";

var CompositeView = require("../composite").View;
var $$ = require ("substance-application").$$;

// Substance.Figure.View
// ==========================================================================

var FigureView = function(node, viewFactory) {
  CompositeView.call(this, node, viewFactory);
};

FigureView.Prototype = function() {

  // Rendering
  // =============================
  //

  this.render = function() {

    this.el.innerHTML = "";
    this.content = $$('div.content');

    // Add graphic (img element)
    var imgEl = $$('.image-wrapper', {
      children: [ $$("img", {src: this.node.url}) ]
    });

    this.content.appendChild(imgEl);


    var caption = this.node.getCaption();
    if (caption) {
      var captionView = this.viewFactory.createView(caption);
      var captionEl = captionView.render().el;
      this.content.appendChild(captionEl);
      this.childrenViews.push(captionView);
    }

    // Attrib
    if (this.node.attrib) {
      console.log('ATTRIB!!');
      this.content.appendChild($$('.figure-attribution', {text: this.node.attrib}));
    }

    this.el.appendChild(this.content);
    return this;
  };
};

FigureView.Prototype.prototype = CompositeView.prototype;
FigureView.prototype = new FigureView.Prototype();

module.exports = FigureView;

},{"../composite":18,"substance-application":61}],24:[function(require,module,exports){
"use strict";

module.exports = {
  Model: require('./figure'),
  View: require('./figure_view')
};

},{"./figure":22,"./figure_view":23}],25:[function(require,module,exports){
"use strict";

var SubstanceNodes = require("substance-nodes");

module.exports = SubstanceNodes["formula"];

},{"substance-nodes":132}],26:[function(require,module,exports){
"use strict";
var SubstanceNodes = require("substance-nodes");

module.exports = SubstanceNodes["heading"];

},{"substance-nodes":132}],27:[function(require,module,exports){
"use strict";

var SubstanceNodes = require("substance-nodes");
module.exports = SubstanceNodes["image"];
},{"substance-nodes":132}],28:[function(require,module,exports){
"use strict";
module.exports = {
  "publication_info": require("./publication_info"),
  "affiliation": require("./affiliation"),
  "box": require("./box"),
  "cover": require("./cover"),
  "text": require("./text"),
  "paragraph": require("./paragraph"),
  "heading": require("./heading"),
  "figure": require("./figure"),
  "caption": require("./caption"),
  "image": require("./image"),
  "webresource": require("./web_resource"),
  "table": require("./table"),
  "supplement": require("./supplement"),
  "video": require("./video"),
  "person": require("./person"),
  "citation": require("./citation"),
  "formula": require('./formula'),
  "list": require("./list"),
  "codeblock": require("./codeblock")
};

},{"./affiliation":7,"./box":10,"./caption":13,"./citation":16,"./codeblock":17,"./cover":21,"./figure":24,"./formula":25,"./heading":26,"./image":27,"./list":29,"./paragraph":31,"./person":32,"./publication_info":35,"./supplement":38,"./table":41,"./text":44,"./video":45,"./web_resource":48}],29:[function(require,module,exports){
"use strict";

var SubstanceNodes = require("substance-nodes");

module.exports = SubstanceNodes["list"];

},{"substance-nodes":132}],30:[function(require,module,exports){
"use strict";

var SubstanceNodes = require("substance-nodes");

module.exports = SubstanceNodes["node"];

},{"substance-nodes":132}],31:[function(require,module,exports){
"use strict";

var SubstanceNodes = require("substance-nodes");

module.exports = SubstanceNodes["paragraph"];

},{"substance-nodes":132}],32:[function(require,module,exports){
"use strict";

module.exports = {
  Model: require('./person'),
  View: require('./person_view')
};

},{"./person":33,"./person_view":34}],33:[function(require,module,exports){
var _ = require('underscore');
var Node = require('substance-document').Node;

// Lens.Person
// -----------------
//

var Person = function(node, doc) {
  Node.call(this, node, doc);
};


// Type definition
// -----------------
//

Person.type = {
  "id": "person",
  "parent": "content",
  "properties": {
    "source_id": "string",
    "name": "string", // full author name
    "role": "string",
    "affiliations": ["array", "affiliation"],
    "fundings": ["array", "string"],
    "image": "string", // optional
    "emails": ["array", "string"],
    "contribution": "string",
    "equal_contrib": ["array", "string"]
  }
};

// This is used for the auto-generated docs
// -----------------
//

Person.description = {
  "name": "Person",
  "remarks": [
    "A person entity.",
  ],
  "properties": {
    "name": "Full name.",
  }
};


// Example Video
// -----------------
//

Person.example = {
  "id": "person_1",
  "type": "person",
  "name": "John Doe",
  "affiliations": ["affiliation_1", "affiliation_2"],
  "role": "Author",
  "fundings": ["Funding Organisation 1"],
  "emails": ["a@b.com"],
  "contribution": "Revising the article, data cleanup",
  "equal_contrib": ["John Doe", "Jane Doe"]
};


Person.Prototype = function() {
  this.getAffiliations = function() {
    return _.map(this.properties.affiliations, function(affId) {
      return this.document.get(affId);
    }, this);
  }
};

Person.Prototype.prototype = Node.prototype;
Person.prototype = new Person.Prototype();
Person.prototype.constructor = Person;


// Generate getters
// --------

var getters = {};

var getters = {
  header: {
    get: function() {
      return this.properties.name;
    }
  }
};

_.each(Person.type.properties, function(prop, key) {
  getters[key] = {
    get: function() {
      return this.properties[key];
    }
  };
});




Object.defineProperties(Person.prototype, getters);


module.exports = Person;

},{"substance-document":108,"underscore":212}],34:[function(require,module,exports){
"use strict";

var _ = require("underscore");
var util = require("substance-util");
var html = util.html;
var NodeView = require("../node").View;
var $$ = require("substance-application").$$;

// Lens.Person.View
// ==========================================================================

var PersonView = function(node) {
  NodeView.call(this, node);

  this.$el.attr({id: node.id});
  this.$el.addClass("content-node person");
};

PersonView.Prototype = function() {

  // Render it
  // --------
  //

  this.render = function() {
    NodeView.prototype.render.call(this);

    // Add Affiliations
    // -------

    this.content.appendChild($$('.affiliations', {
      children: _.map(this.node.getAffiliations(), function(aff) {
        
        var affText = _.compact([
          aff.department, 
          aff.institution,
          aff.city,
          aff.country
        ]).join(', ');

        return $$('.affiliation', {text: affText});
      })
    }));

    // Contribution
    // -------

    this.content.appendChild($$('.label', {text: 'Contribution'}));
    this.content.appendChild($$('.contribution', {text: this.node.contribution}));

    // Equal contribution
    // -------

    if (this.node.equal_contrib && this.node.equal_contrib.length > 0) {
      this.content.appendChild($$('.label', {text: 'Contributed equally with'}));
      this.content.appendChild($$('.equal-contribution', {text: this.node.equal_contrib}));
    }

    // Funding
    // -------

    if (this.node.fundings.length > 0) {
      this.content.appendChild($$('.label', {text: 'Funding'}));
      this.content.appendChild($$('.fundings', {
        children: _.map(this.node.fundings, function(funding) {
          return $$('.funding', {text: funding});
        })
      }));
    }

    if (this.node.emails.length > 0) {
      this.content.appendChild($$('.label', {text: 'For correspondence'}));
      this.content.appendChild($$('.label', {
        children: _.map(this.node.emails, function(email) {
          return $$('a', {href: "mailto:"+email, text: email});
        })
      }));
    }

    return this;
  };

};

PersonView.Prototype.prototype = NodeView.prototype;
PersonView.prototype = new PersonView.Prototype();

module.exports = PersonView;

},{"../node":30,"substance-application":61,"substance-util":207,"underscore":212}],35:[function(require,module,exports){
"use strict";

module.exports = {
  Model: require("./publication_info"),
  View: require("./publication_info_view")
};

},{"./publication_info":36,"./publication_info_view":37}],36:[function(require,module,exports){
"use strict";

var Node = require("substance-document").Node;
var _ = require("underscore");

var PublicationInfo = function(node, doc) {
  Node.call(this, node, doc);
};

PublicationInfo.type = {
  "id": "publication_info",
  "parent": "content",
  "properties": {
    "received_on": "string",
    "accepted_on": "string",
    "published_on": "string",
    "journal": "string",
    "article_type": "string",
    "keywords": ["array", "string"],
    "research_organisms": ["array", "string"],
    "subjects": ["array", "string"],
    "pdf_link": "string",
    "xml_link": "string",
    "json_link": "string",
    "doi": "string"
  }
};


PublicationInfo.description = {
  "name": "PublicationInfo",
  "description": "PublicationInfo Node",
  "remarks": [
    "Summarizes the article's meta information. Meant to be customized by publishers"
  ],
  "properties": {
    "received_on": "Submission received",
    "accepted_on": "Paper accepted on",
    "published_on": "Paper published on",
    "journal": "The Journal",
    "article_type": "Research Article vs. Insight, vs. Correction etc.",
    "keywords": "Article's keywords",
    "research_organisms": "Research Organisms",
    "subjects": "Article Subjects",
    "pdf_link": "A link referencing the PDF version for print",
    "xml_link": "A link referencing the original NLM XML file",
    "json_link": "A link pointing to the JSON version of the article",
    "doi": "Article DOI"
  }
};


PublicationInfo.example = {
  "id": "publication_info",
  "received_on": "2012-06-20",
  "accepted_on": "2012-09-05",
  "published_on": "2012-11-13",
  "journal": "eLife",
  "article_type": "Research Article",
  "keywords": [
    "innate immunity",
    "histones",
    "lipid droplet",
    "anti-bacterial"
  ],
  "research_organisms": [
    "B. subtilis",
    "D. melanogaster",
    "E. coli",
    "Mouse"
  ],
  "subjects": [
    "Immunology",
    "Microbiology and infectious disease"
  ],
  "pdf_link": "http://elife.elifesciences.org/content/1/e00003.full-text.pdf",
  "xml_link": "https://s3.amazonaws.com/elife-cdn/elife-articles/00003/elife00003.xml",
  "json_link": "http://cdn.elifesciences.org/documents/elife/00003.json",
  "doi": "http://dx.doi.org/10.7554/eLife.00003"
};


PublicationInfo.Prototype = function() {
};


PublicationInfo.Prototype.prototype = Node.prototype;
PublicationInfo.prototype = new PublicationInfo.Prototype();
PublicationInfo.prototype.constructor = PublicationInfo;


// Generate getters
// --------

var getters = {};

_.each(PublicationInfo.type.properties, function(prop, key) {
  getters[key] = {
    get: function() {
      return this.properties[key];
    }
  };
});

Object.defineProperties(PublicationInfo.prototype, getters);

module.exports = PublicationInfo;
},{"substance-document":108,"underscore":212}],37:[function(require,module,exports){
"use strict";

var NodeView = require("../node").View;
var $$ = require("substance-application").$$;


// Substance.Image.View
// ==========================================================================

var PublicationInfoView = function(node, viewFactory) {
  NodeView.call(this, node, viewFactory);

  this.$el.addClass('publication-info');
  this.$el.attr('id', this.node.id);
};

PublicationInfoView.Prototype = function() {

  // Rendering
  // =============================
  //


  // Render Markup
  // --------
  //

  this.render = function() {
    NodeView.prototype.render.call(this);

    var tableRows = [
      $$('tr', {
        children: [
          $$('td', {
            children: [
              $$('div.label', {text: "Subject"}),
              $$('div.value', {text: this.node.subjects.join(', ')})
            ]
          }),
          $$('td', {
            children: [
              $$('div.label', {text: "Organism"}),
              $$('div.value', {text: this.node.research_organisms.join(', ')})
            ]
          })
        ]
      }),
      $$('tr', {
        children: [
          $$('td', {
            colspan: 2,
            children: [
              $$('div.label', {text: "Keywords"}),
              $$('div.value', {text: this.node.keywords.join(', ')})
            ]
          })
        ]
      })
    ];
    
    var catTbl = $$('table.categorization', {
      children: [ $$('tbody', { children: tableRows }) ]
    });

    this.content.appendChild(catTbl);
    this.content.appendChild($$('.label.links', {text: "Links"}));
      
    // Prepare for download the JSON
    var json = JSON.stringify(this.node.document.toJSON(), null, '  ');
    var bb = new Blob([json], {type: "application/json"});

    var links = $$('.links', {
      children: [
        $$('a.link pdf-link', {
          href: this.node.pdf_link,
          html: '<i class="icon-download-alt"></i> PDF'
        }),
        $$('a.link.json-link', {
          href: window.URL.createObjectURL(bb),
          html: '<i class="icon-download-alt"></i> JSON'
        }),
        $$('a.link.xml-link', {
          href: this.node.xml_link,
          html: '<i class="icon-download-alt"></i> XML'
        }),
        $$('a.link.doi-link', {
          href: this.node.doi,
          html: '<i class="icon-external-link-sign"></i> DOI'
        })
      ]
    });

    this.content.appendChild(links);

    var dateRows = [
      $$('tr', {
        children: [
          $$('td', {
            children: [
              $$('div.label', {text: "Received"}),
              $$('div.value', {text: this.node.received_on || "-" })
            ]
          }),
          $$('td', {
            children: [
              $$('div.label', {text: "Accepted"}),
              $$('div.value', {text: this.node.accepted_on || "-" })
            ]
          }),
          $$('td', {
            children: [
              $$('div.label', {text: "Published"}),
              $$('div.value', {text: this.node.published_on || "-" })
            ]
          })
        ]
      })
    ];
    
    var datesTbl = $$('table.dates', {
      children: [ $$('tbody', { children: dateRows }) ]
    });

    this.content.appendChild(datesTbl);
    return this;
  };

  this.dispose = function() {
    NodeView.prototype.dispose.call(this);
  };
};

PublicationInfoView.Prototype.prototype = NodeView.prototype;
PublicationInfoView.prototype = new PublicationInfoView.Prototype();

module.exports = PublicationInfoView;

},{"../node":30,"substance-application":61}],38:[function(require,module,exports){
"use strict";

module.exports = {
  Model: require('./supplement'),
  View: require('./supplement_view')
};

},{"./supplement":39,"./supplement_view":40}],39:[function(require,module,exports){
var _ = require('underscore');

var Document = require("substance-document");

// Lens.Supplement
// -----------------
//

var Supplement = function(node, doc) {
  Document.Composite.call(this, node, doc);
};

// Type definition
// -----------------
//

Supplement.type = {
  "id": "supplement",
  "parent": "content",
  "properties": {
    "source_id": "string",
    "label": "string",
    "url": "string",
    "caption": "caption", // contains the doi
  }
};


// This is used for the auto-generated docs
// -----------------
//

Supplement.description = {
  "name": "Supplement",
  "remarks": [
    "A Supplement entity.",
  ],
  "properties": {
    "source_id": "Supplement id as it occurs in the source NLM file",
    "label": "Supplement label",
    "caption": "References a caption node, that has all the content",
    "url": "URL of downloadable file"
  }
};

// Example Supplement
// -----------------
//

Supplement.example = {
  "id": "supplement_1",
  "source_id": "SD1-data",
  "type": "supplement",
  "label": "Supplementary file 1.",
  "url": "http://myserver.com/myfile.pdf",
  "caption": "caption_supplement_1"
};


Supplement.Prototype = function() {

  this.getNodes = function() {
    var nodes = [];
    if (this.properties.caption) {
      nodes.push(this.properties.caption);
    }
    return nodes;
  };

  this.getCaption = function() {
    if (this.properties.caption) {
      return this.document.get(this.properties.caption);
    } else {
      return null;
    }
  };
};

Supplement.Prototype.prototype = Document.Composite.prototype;
Supplement.prototype = new Supplement.Prototype();
Supplement.prototype.constructor = Supplement;

// Generate getters
// --------

var getters = {};

_.each(Supplement.type.properties, function(prop, key) {
  getters[key] = {
    get: function() {
      return this.properties[key];
    }
  };
});

// Get the header for resource header display
// --------

getters["header"] = {
  get: function() {
    return this.properties.label;
  }
};


Object.defineProperties(Supplement.prototype, getters);

module.exports = Supplement;

},{"substance-document":108,"underscore":212}],40:[function(require,module,exports){
"use strict";

var _ = require("underscore");
var util = require("substance-util");
var html = util.html;
var CompositeView = require("../composite").View;
var $$ = require("substance-application").$$;

// Lens.Supplement.View
// ==========================================================================

var SupplementView = function(node, viewFactory) {
  CompositeView.call(this, node, viewFactory);

  this.$el.attr({id: node.id});
  this.$el.addClass("content-node supplement");
};

SupplementView.Prototype = function() {

  // Render it
  // --------

  this.render = function() {
    var node = this.node;

    this.content = $$('div.content');

    var caption = node.getCaption();
    if (caption) {
      var captionView = this.viewFactory.createView(caption);
      var captionEl = captionView.render().el;
      this.content.appendChild(captionEl);
      this.childrenViews.push(captionView);
    }

    var file = $$('div.file', {
      children: [
        $$('a', {href: node.url, html: '<i class="icon-download-alt"/> Download' })
      ]
    });

    this.content.appendChild(file);
    this.el.appendChild(this.content);

    return this;
  }
};

SupplementView.Prototype.prototype = CompositeView.prototype;
SupplementView.prototype = new SupplementView.Prototype();
SupplementView.prototype.constructor = SupplementView;

module.exports = SupplementView;

},{"../composite":18,"substance-application":61,"substance-util":207,"underscore":212}],41:[function(require,module,exports){
"use strict";

module.exports = {
  Model: require('./table'),
  View: require('./table_view')
};

},{"./table":42,"./table_view":43}],42:[function(require,module,exports){
var _ = require('underscore');
var Node = require('substance-document').Node;

// Lens.Table
// -----------------
//

var Table = function(node, doc) {
  Node.call(this, node, doc);
};

// Type definition
// -----------------
//

Table.type = {
  "id": "table",
  "parent": "content",
  "properties": {
    "source_id": "string",
    "label": "string",
    "content": "string",
    "footers": ["array", "string"],
    "caption": "caption"
  }
};

Table.config = {
  "zoomable": true
};


// This is used for the auto-generated docs
// -----------------
//

Table.description = {
  "name": "Table",
  "remarks": [
    "A table figure which is expressed in HTML notation"
  ],
  "properties": {
    "source_id": "string",
    "label": "Label shown in the resource header.",
    "title": "Full table title",
    "content": "HTML data",
    "footers": "Table footers expressed as an array strings",
    "caption": "References a caption node, that has all the content"
  }
};


// Example Table
// -----------------
//

Table.example = {
  "id": "table_1",
  "type": "table",
  "label": "Table 1.",
  "title": "Lorem ipsum table",
  "content": "<table>...</table>",
  "footers": [],
  "caption": "caption_1"
};

Table.Prototype = function() {
  this.getCaption = function() {
    if (this.properties.caption) return this.document.get(this.properties.caption);
  };
};

Table.Prototype.prototype = Node.prototype;
Table.prototype = new Table.Prototype();
Table.prototype.constructor = Table;


// Generate getters
// --------

var getters = {
  header: {
    get: function() {
      return this.properties.label;
    }
  }
};

_.each(Table.type.properties, function(prop, key) {
  getters[key] = {
    get: function() {
      return this.properties[key];
    }
  };
});

Object.defineProperties(Table.prototype, getters);

module.exports = Table;

},{"substance-document":108,"underscore":212}],43:[function(require,module,exports){
"use strict";

var _ = require("underscore");
var util = require("substance-util");
var html = util.html;
var NodeView = require("../node").View;
var $$ = require("substance-application").$$;

// Substance.Paragraph.View
// ==========================================================================

var TableView = function(node, viewFactory) {
  NodeView.call(this, node);
  this.viewFactory = viewFactory;

  this.$el.attr({id: node.id});
  this.$el.addClass("content-node table");
};

TableView.Prototype = function() {

  //   <% if (node.url) { %>
  //     <div class="table-image">
  //       <a href="<%= node.large_url %>" target="_new"><img class="thumbnail" src="<%= node.url %>"/></a>
  //     </div>
  //   <% } %>
  //   <div class="table-wrapper">
  //     <%= node.content %>
  //   </div>
  //   <div class="footers">
  //     <% _.each(node.footers, function(f) { %>
  //       <div class="footer"><b><%= annotate(f, 'label') %></b> <%= annotate(f, 'content') %></div>
  //     <% }); %>
  //   </div>
  //   <div class="title"><%= annotate(node.caption, 'title') %></div>
  //   <div class="descr"><%= annotate(node.caption, 'content') %></div>
  //   <% if (node.doi) { %>
  //     <div class="doi"><b>DOI:</b> <a href="<%= node.doi %>" target="_new"><%= node.doi %></a></div>
  //   <% } %>
  // </div>

  // .content
  //   .table-wrapper
  //     <table>...
  //   .footers
  //   .title
  //   .caption
  //   .doi

  this.render = function() {
    var node = this.node;
    NodeView.prototype.render.call(this);

    // The actual content
    // --------
    //

    var tableWrapper = $$('.table-wrapper', {
      html: node.content // HTML table content
    });

    this.content.appendChild(tableWrapper);

    // Display footers (optional)
    // --------
    //

    var footers = $$('.footers', {
      children: _.map(node.footers, function(footer) {
        return $$('.footer', { html: "<b>"+footer.label+"</b> " + footer.content });
      })
    });

    // Display caption


    var caption = this.node.getCaption();
    if (caption) {
      var captionView = this.viewFactory.createView(caption);
      var captionEl = captionView.render().el;
      this.content.appendChild(captionEl);
      // this.childrenViews.push(captionView);
    }

    this.content.appendChild(footers);


    // this.content.appendChild($$('.not-yet-implemented', {text: "This node type has not yet been implemented. "}));
    return this;
  }
};

TableView.Prototype.prototype = NodeView.prototype;
TableView.prototype = new TableView.Prototype();

module.exports = TableView;

},{"../node":30,"substance-application":61,"substance-util":207,"underscore":212}],44:[function(require,module,exports){
"use strict";

var SubstanceNodes = require("substance-nodes");

module.exports = SubstanceNodes["text"];

},{"substance-nodes":132}],45:[function(require,module,exports){
"use strict";

module.exports = {
  Model: require('./video'),
  View: require('./video_view')
};

},{"./video":46,"./video_view":47}],46:[function(require,module,exports){
var _ = require('underscore');
var Node = require('substance-document').Node;

// Lens.Video
// -----------------
//

var Video = function(node, doc) {
  Node.call(this, node, doc);
};

// Type definition
// -----------------
//

Video.type = {
  "id": "video",

  "parent": "content",
  "properties": {
    "source_id": "string",
    "label": "string",
    "url": "string",
    "url_webm": "string",
    "url_ogv": "string",
    "caption": "caption",
    "poster": "string"
  }
};


Video.config = {
  "zoomable": true
};

// This is used for the auto-generated docs
// -----------------
//

Video.description = {
  "name": "Video",
  "remarks": [
    "A video type intended to refer to video resources.",
    "MP4, WebM and OGV formats are supported."
  ],
  "properties": {
    "label": "Label shown in the resource header.",
    "url": "URL to mp4 version of the video.",
    "url_webm": "URL to WebM version of the video.",
    "url_ogv": "URL to OGV version of the video.",
    "poster": "Video poster image.",
    "caption": "References a caption node, that has all the content"
  }
};

// Example Video
// -----------------
//

Video.example = {
  "id": "video_1",
  "type": "video",
  "label": "Video 1.",
  "url": "http://cdn.elifesciences.org/video/eLifeLensIntro2.mp4",
  "url_webm": "http://cdn.elifesciences.org/video/eLifeLensIntro2.webm",
  "url_ogv": "http://cdn.elifesciences.org/video/eLifeLensIntro2.ogv",
  "poster": "http://cdn.elifesciences.org/video/eLifeLensIntro2.png",
  // "doi": "http://dx.doi.org/10.7554/Fake.doi.003",
  "caption": "caption_25"
};

Video.Prototype = function() {

};

Video.Prototype.prototype = Node.prototype;
Video.prototype = new Video.Prototype();
Video.prototype.constructor = Video;


// Generate getters
// --------

var getters = {};

_.each(Video.type.properties, function(prop, key) {
  getters[key] = {
    get: function() {
      return this.properties[key];
    }
  };
});


Object.defineProperties(Video.prototype, _.extend(getters, {
  header: {
    get: function() {
      return this.properties.label;
    }
  },
  caption: {
    get: function() {
      // HACK: this is not yet a real solution
      if (this.properties.caption) {
        return this.document.get(this.properties.caption);
      } else {
        return "";
      }
    }
  }
}));

module.exports = Video;

},{"substance-document":108,"underscore":212}],47:[function(require,module,exports){
"use strict";

var _ = require("underscore");
var util = require("substance-util");
var html = util.html;
var NodeView = require("../node").View;
var $$ = require("substance-application").$$;

// Lens.Video.View
// ==========================================================================

var VideoView = function(node, viewFactory) {
  NodeView.call(this, node, viewFactory);

  this.$el.attr({id: node.id});
  this.$el.addClass("content-node video");
};



VideoView.Prototype = function() {

  // Render it
  // --------
  //
  // .content
  //   video
  //     source
  //   .title
  //   .caption
  //   .doi

  this.render = function() {
    NodeView.prototype.render.call(this);

    // Enrich with video content
    // --------
    //

    var node = this.node;

    // The actual video
    // --------
    //

    var sources = [
      $$('source', {
        src: node.url,
        type: "video/mp4; codecs=&quot;avc1.42E01E, mp4a.40.2&quot;",
      })
    ];

    if (node.url_ogv) {
      sources.push($$('source', {
        src: node.url_ogv,
        type: "video/ogg; codecs=&quot;theora, vorbis&quot;",
      }));
    }

    if (node.url_webm) {
      sources.push($$('source', {
        src: node.url_webm,
        type: "video/webm; codecs=&quot;vp8, vorbis%quot;",
      }));
    }

    var video = $$('.video-wrapper', {
      children: [
        $$('video', {
          controls: "controls",
          poster: node.poster,
          preload: "none",
          // style: "background-color: black",
          children: sources
        })
      ]
    });

    this.content.appendChild(video);

    // The video title
    // --------
    //

    if (node.title) {
      this.content.appendChild($$('.title', {
        text: node.title
      }));
    }

    // Add caption if there is any
    if (this.node.caption) {
      var caption = this.viewFactory.createView(this.node.caption);
      this.content.appendChild(caption.render().el);
      this.captionView = caption;
    }

    // Add DOI link if available
    // --------
    //

    if (node.doi) {
      this.content.appendChild($$('.doi', {
        children: [
          $$('b', {text: "DOI: "}),
          $$('a', {href: node.doi, target: "_new", text: node.doi})
        ]
      }));
    }

    return this;
  }
};

VideoView.Prototype.prototype = NodeView.prototype;
VideoView.prototype = new VideoView.Prototype();

module.exports = VideoView;

},{"../node":30,"substance-application":61,"substance-util":207,"underscore":212}],48:[function(require,module,exports){
"use strict";
var SubstanceNodes = require("substance-nodes");

module.exports = SubstanceNodes["webresource"];

},{"substance-nodes":132}],49:[function(require,module,exports){
"use strict";

var LensConverter = require("./src/lens_converter");

module.exports = LensConverter;

},{"./src/lens_converter":55}],50:[function(require,module,exports){

var DefaultConfiguration = function() {

};

DefaultConfiguration.Prototype = function() {

  this.enhanceSupplement = function(state, node, element) {
    // Noop - override in your configuration
  };

  this.enhanceTable = function(state, node, element) {
    // Noop - override in your configuration
  };

  // Default video resolver
  // --------
  // 

  this.enhanceVideo = function(state, node, element) {
    var el = element.querySelector("media") || element;

    // xlink:href example: elife00778v001.mov
    var url = element.getAttribute("xlink:href");
    // Just return absolute urls
    if (url.match(/http:/)) {
      node.url = url;
      return;
    } else {
      var name = url.split(".")[0];
      node.url = state.options.baseURL+name+".mp4";
      node.url_ogv = state.options.baseURL+name+".ogv";
      node.url_webm = state.options.baseURL+name+".webm";
      node.poster = state.options.baseURL+name+".jpg";
    }
  };

  // Implements resloving of relative urls
  this.enhanceFigure = function(state, node, element) {
    var graphic = element.querySelector("graphic");
    var url = graphic.getAttribute("xlink:href");

    node.url = this.resolveURL(state, url);
  };

  this.enhanceArticle = function(converter, state, article) {
    // Noop - override in your configuration
  };

  this.extractPublicationInfo = function() {
    // Noop - override in your configuration
  };

  this.resolveURL = function(url) {
    return url;
  };

  // Default figure url resolver
  // --------
  // 
  // For relative urls it uses the same basebath as the source XML

  this.resolveURL = function(state, url) {
    // Just return absolute urls
    if (url.match(/http:/)) return url;
    return [
      state.options.baseURL,
      url
    ].join('');
  };
};

DefaultConfiguration.prototype = new DefaultConfiguration.Prototype();
module.exports = DefaultConfiguration;

},{}],51:[function(require,module,exports){
"use strict";

var util = require("substance-util");
var _ = require("underscore");
var DefaultConfiguration = require('./default');

var ElifeConfiguration = function() {

};

ElifeConfiguration.Prototype = function() {

  // Resolves figure url
  // --------
  //

  this.enhanceFigure = function(state, node, element) {
    var graphic = element.querySelector("graphic");
    var url = graphic.getAttribute("xlink:href");

    // Example url to SVG: http://cdn.elifesciences.org/elife-articles/00768/svg/elife00768f001.svg
    // url = [
    //   "http://cdn.elifesciences.org/elife-articles/",
    //   state.doc.id,
    //   "/svg/",
    //   url,
    //   ".svg"
    // ].join('');

    node.url = this.resolveURL(state, url);
  };

  this.enhanceVideo = function(state, node, element) {
    var el = element.querySelector("media") || element;
    var href = element.getAttribute("xlink:href").split(".");
    var name = href[0];

    node.url = "http://static.movie-usa.glencoesoftware.com/mp4/10.7554/"+name+".mp4";
    node.url_ogv = "http://static.movie-usa.glencoesoftware.com/ogv/10.7554/"+name+".ogv";
    node.url_webm = "http://static.movie-usa.glencoesoftware.com/webm/10.7554/"+name+".webm";
    node.poster = "http://static.movie-usa.glencoesoftware.com/jpg/10.7554/"+name+".jpg";
  };

  // Example url to SVG: http://cdn.elifesciences.org/elife-articles/00768/svg/elife00768f001.svg
  this.resolveURL = function(state, url) {
    return [
      "http://cdn.elifesciences.org/elife-articles/",
      state.doc.id,
      "/svg/",
      url,
      ".svg"
    ].join('');
  };

  this.enhanceSupplement = function(state, node, element) {
    node.url = [
      "http://cdn.elifesciences.org/elife-articles/",
      state.doc.id,
      "/supplements/",
      node.url
    ].join('');
  };

  this.extractPublicationInfo = function(converter, state, article) {
    var doc = state.doc;

    var articleMeta = article.querySelector("article-meta");

    function _extractDate(dateEl) {
      if (!dateEl) return null;
      var day = dateEl.querySelector("day").textContent;
      var month = dateEl.querySelector("month").textContent;
      var year = dateEl.querySelector("year").textContent;
      return [year, month, day].join("-");
    }

    var pubDate = articleMeta.querySelector("pub-date");
    var receivedDate = articleMeta.querySelector("date[date-type=received]");
    var acceptedDate = articleMeta.querySelector("date[date-type=accepted]");

    // Extract keywords
    // ------------
    //
    // <kwd-group kwd-group-type="author-keywords">
    // <title>Author keywords</title>
    // <kwd>innate immunity</kwd>
    // <kwd>histones</kwd>
    // <kwd>lipid droplet</kwd>
    // <kwd>anti-bacterial</kwd>
    // </kwd-group>
    var keyWords = articleMeta.querySelectorAll("kwd-group[kwd-group-type=author-keywords] kwd");

    // Extract research organism
    // ------------
    //

    // <kwd-group kwd-group-type="research-organism">
    // <title>Research organism</title>
    // <kwd>B. subtilis</kwd>
    // <kwd>D. melanogaster</kwd>
    // <kwd>E. coli</kwd>
    // <kwd>Mouse</kwd>
    // </kwd-group>
    var organisms = articleMeta.querySelectorAll("kwd-group[kwd-group-type=research-organism] kwd");

    // Extract subjects
    // ------------
    //
    // <subj-group subj-group-type="heading">
    // <subject>Immunology</subject>
    // </subj-group>
    // <subj-group subj-group-type="heading">
    // <subject>Microbiology and infectious disease</subject>
    // </subj-group>

    var subjects = articleMeta.querySelectorAll("subj-group[subj-group-type=heading] subject");

    // Extract article_type
    // ---------------
    //
    // <subj-group subj-group-type="display-channel">
    // <subject>Research article</subject>
    // </subj-group>

    var articleType = articleMeta.querySelector("subj-group[subj-group-type=display-channel] subject");

    // Extract journal title
    // ---------------
    //

    var journalTitle = article.querySelector("journal-title");

    // <article-id pub-id-type="doi">10.7554/eLife.00003</article-id>
    var articleDOI = article.querySelector("article-id[pub-id-type=doi]");


    // Extract PDF link
    // ---------------
    //
    // <self-uri content-type="pdf" xlink:href="elife00007.pdf"/>
    
    var pdfURI = article.querySelector("self-uri[content-type=pdf]");    

    var pdfLink = [
      "http://cdn.elifesciences.org/elife-articles/",
      state.doc.id,
      "/pdf/",
      pdfURI ? pdfURI.getAttribute("xlink:href") : "#"
    ].join('');

    // Create PublicationInfo node
    // ---------------
    
    var pubInfoNode = {
      "id": "publication_info",
      "type": "publication_info",
      "published_on": _extractDate(pubDate),
      "received_on": _extractDate(receivedDate),
      "accepted_on": _extractDate(acceptedDate),
      "keywords": _.pluck(keyWords, "textContent"),
      "research_organisms": _.pluck(organisms, "textContent"),
      "subjects": _.pluck(subjects, "textContent"),
      "article_type": articleType ? articleType.textContent : "",
      "journal": journalTitle ? journalTitle.textContent : "",
      "pdf_link": pdfLink,
      "xml_link": "https://s3.amazonaws.com/elife-cdn/elife-articles/"+state.doc.id+"/elife"+state.doc.id+".xml", // "http://mickey.com/mouse.xml",
      "json_link": "http://mickey.com/mouse.json",
      "doi": articleDOI ? ["http://dx.doi.org/", articleDOI.textContent].join("") : "",
    };


    doc.create(pubInfoNode);
    doc.show("info", pubInfoNode.id, 0);
  };


  // Add additional information to the info view
  // ---------
  //
  // Impact
  // Major datasets
  // Acknowledgements
  // Copyright

  this.enhanceInfo = function(converter, state, article) {
    var doc = state.doc;

    // Initialize the Article Info object
    var articleInfo = {
      "id": "articleinfo",
      "type": "paragraph",
      "children": []
    };
    var nodes = articleInfo.children;

    // Get the author's impact statement
    var meta = article.querySelectorAll("meta-value");
    var impact = meta[1];
    
    var h1 = {
      "type": "heading",
      "id": state.nextId("heading"),
      "level": 1,
      "content": "Impact",
    };
    doc.create(h1);
    nodes.push(h1.id);

    if (impact) {
      var par = converter.paragraphGroup(state, impact);
      nodes.push(par[0].id);      
    }


    // Get conflict of interest

    var conflict = article.querySelectorAll("fn");
    for (var i = 0; i < conflict.length;i++) {
      var indiv = conflict[i];
      var type = indiv.getAttribute("fn-type");
        if (type === 'conflict') {
          var h1 = {
          "type" : "heading",
          "id" : state.nextId("heading"),
          "level" : 1,
          "content" : "Competing Interests"
        };
        doc.create(h1);
        nodes.push(h1.id);
        var par = converter.bodyNodes(state, util.dom.getChildren(indiv));
        nodes.push(par[0].id);
      }
    }

    // Get major datasets

    var datasets = article.querySelectorAll('sec');

    for (var i = 0;i <datasets.length;i++){
      var data = datasets[i];
      var type = data.getAttribute('sec-type');
      if (type === 'datasets') {
        var h1 = {
          "type" : "heading",
          "id" : state.nextId("heading"),
          "level" : 1,
          "content" : "Major Datasets"
        };
        doc.create(h1);
        nodes.push(h1.id);
        var ids = converter.datasets(state, util.dom.getChildren(data));
        for (var j=0;j < ids.length;j++) {
          if (ids[j]) {
            nodes.push(ids[j]);
          }
        }
      }
    }

    // Get acknowledgements

    var ack = article.querySelector("ack");
    if (ack) {
      var h1 = {
        "type" : "heading",
        "id" : state.nextId("heading"),
        "level" : 1,
        "content" : "Acknowledgements"
      };
      doc.create(h1);
      nodes.push(h1.id);
      var par = converter.bodyNodes(state, util.dom.getChildren(ack));
      nodes.push(par[0].id);
    }
    
    // Get copyright and license information
    var license = article.querySelector("permissions");
    if (license) {
      var h1 = {
        "type" : "heading",
        "id" : state.nextId("heading"),
        "level" : 1,
        "content" : "Copyright and License"
      };
      doc.create(h1);
      nodes.push(h1.id);

      var copyright = license.querySelector("copyright-statement");
      if (copyright) {
        var par = converter.paragraphGroup(state, copyright);
        var textid = par[0].children[0];
        doc.nodes[textid].content += ". ";
        nodes.push(par[0].id);
      }
      var lic = license.querySelector("license");
      var children = util.dom.getChildren(lic);
      for (var i = 0;i < children.length;i++) {
        var child = children[i];
        var type = util.dom.getNodeType(child);
        if (type === 'p' || type === 'license-p') {
          var par = converter.paragraphGroup(state, child);
          nodes.push(par[0].id)
        }
      }
      
    }
    
    doc.create(articleInfo);
    doc.show("info", articleInfo.id);
  };

  // Add Decision letter and author response
  // ---------

  this.enhanceArticle = function(converter, state, article) {

    var nodes = [];

    // Decision letter (if available)
    // -----------

    var articleCommentary = article.querySelector("#SA1");
    if (articleCommentary) {

      var heading = {
        id: state.nextId("heading"),
        type: "heading",
        level: 1,
        content: "Article Commentary"
      };
      doc.create(heading);
      nodes.push(heading);

      var heading = {
        id: state.nextId("heading"),
        type: "heading",
        level: 2,
        content: "Decision letter"
      };
      doc.create(heading);
      nodes.push(heading);

      var body = articleCommentary.querySelector("body");
      nodes = nodes.concat(converter.bodyNodes(state, util.dom.getChildren(body)));
    }

    // Author response
    // -----------

    var authorResponse = article.querySelector("#SA2");
    if (authorResponse) {

      var heading = {
        id: state.nextId("heading"),
        type: "heading",
        level: 2,
        content: "Author response"
      };
      doc.create(heading);
      nodes.push(heading);

      var body = authorResponse.querySelector("body");
      nodes = nodes.concat(converter.bodyNodes(state, util.dom.getChildren(body)));
    }

    // Show them off
    // ----------

    if (nodes.length > 0) {
      converter.show(state, nodes);
    }

    this.enhanceInfo(converter, state, article);
  };
};

ElifeConfiguration.Prototype.prototype = DefaultConfiguration.prototype;
ElifeConfiguration.prototype = new ElifeConfiguration.Prototype();
ElifeConfiguration.prototype.constructor = ElifeConfiguration;

module.exports = ElifeConfiguration;

},{"./default":50,"substance-util":207,"underscore":212}],52:[function(require,module,exports){
var DefaultConfiguration = require('./default');

var LandesConfiguration = function() {

};

LandesConfiguration.Prototype = function() {

  var mappings = {
    "CC": "cc",
    "INTV": "intravital",
    "CIB": "cib"
  };        

  var __super__ = DefaultConfiguration.prototype;

  // Provide proper url for supplement
  // --------
  // 

  this.enhanceSupplement = function(state, node, element) {
    var el = element.querySelector("graphic, media") || element;
    var url = el.getAttribute("xlink:href");

    var publisherId = state.xmlDoc.querySelector('journal-id').textContent;

    var url = [
      "https://www.landesbioscience.com/journals/",
      mappings[publisherId],
      "/",
      url,
    ].join('');

    node.url = url;
  };

  // Yield proper video urls
  // --------
  // 

  this.enhanceVideo = function(state, node, element) {
    node.url = "provide_url_here";
  };

  // Customized labels
  // -------

  this.enhanceFigure = function(state, node, element) {
    var graphic = element.querySelector("graphic");
    var url = graphic.getAttribute("xlink:href");
    var publisherId = state.xmlDoc.querySelector('journal-id').textContent;

    var url = [
      "https://www.landesbioscience.com/article_figure/journals/",
      mappings[publisherId],
      "/",
      url,
    ].join('');

    node.url = url;

    if(!node.label) {
      var type = node.type;
      node.label = type.charAt(0).toUpperCase() + type.slice(1);
    }
  };
};


LandesConfiguration.Prototype.prototype = DefaultConfiguration.prototype;
LandesConfiguration.prototype = new LandesConfiguration.Prototype();
LandesConfiguration.prototype.constructor = LandesConfiguration;

module.exports = LandesConfiguration;

},{"./default":50}],53:[function(require,module,exports){
var DefaultConfiguration = require('./default');

var PeerJConfiguration = function() {

};

PeerJConfiguration.Prototype = function() {

  // Resolve figure urls
  // --------
  // 

  this.enhanceFigure = function(state, node, element) {
    var graphic = element.querySelector("graphic");
    var url = graphic.getAttribute("xlink:href");

    node.url = url;
  };

  // Assign video url
  // --------
  // 

  this.enhanceVideo = function(state, node, element) {
    node.url = "http://mickey.com/mouse.mp4";
  };
};


PeerJConfiguration.Prototype.prototype = DefaultConfiguration.prototype;
PeerJConfiguration.prototype = new PeerJConfiguration.Prototype();
PeerJConfiguration.prototype.constructor = PeerJConfiguration;

module.exports = PeerJConfiguration;

},{"./default":50}],54:[function(require,module,exports){
var DefaultConfiguration = require('./default');

var PLOSConfiguration = function() {

};

PLOSConfiguration.Prototype = function() {

  // Resolve figure urls
  // --------
  // 

  this.enhanceFigure = function(state, node, element) {
    var graphic = element.querySelector("graphic");
    var url = graphic.getAttribute("xlink:href");

    url = [
      "http://www.plosone.org/article/fetchObject.action?uri=",
      url,
      "&representation=PNG_L"
    ].join('');

    node.url = url;
  };

  // Assign video url
  // --------
  // 

  this.enhanceVideo = function(state, node, element) {
    node.url = "http://mickey.com/mouse.mp4";
  };
};


PLOSConfiguration.Prototype.prototype = DefaultConfiguration.prototype;
PLOSConfiguration.prototype = new PLOSConfiguration.Prototype();
PLOSConfiguration.prototype.constructor = PLOSConfiguration;

module.exports = PLOSConfiguration;

},{"./default":50}],55:[function(require,module,exports){
"use strict";

var _ = require("underscore");
var util = require("substance-util");
var errors = util.errors;
var ImporterError = errors.define("ImporterError");

// Available configurations
// --------

var ElifeConfiguration = require("./configurations/elife");
var LandesConfiguration = require("./configurations/landes");
var DefaultConfiguration = require("./configurations/default");
var PLOSConfiguration = require("./configurations/plos");
var PeerJConfiguration = require("./configurations/peerj");

var LensImporter = function(options) {
  this.options = options;
};

LensImporter.Prototype = function() {

  // Helpers
  // --------

  var _getName = function(nameEl) {
    var names = [];

    var surnameEl = nameEl.querySelector("surname");
    var givenNamesEl = nameEl.querySelector("given-names");

    if (givenNamesEl) names.push(givenNamesEl.textContent);
    if (surnameEl) names.push(surnameEl.textContent);

    return names.join(" ");
  };

  var _toHtml = function(el) {
    var tmp = document.createElement("DIV");
    tmp.appendChild(el.cloneNode(true));
    return tmp.innerHTML;
  };

  // ### The main entry point for starting an import

  this.import = function(input, options) {
    var xmlDoc;

    // Note: when we are using jqueries get("<file>.xml") we
    // magically get a parsed XML document already
    if (_.isString(input)) {
      var parser = new DOMParser();
      xmlDoc = parser.parseFromString(input,"text/xml");
    } else {
      xmlDoc = input;
    }

    // Creating the output Document via factore, so that it is possible to
    // create specialized NLMImporter later which would want to instantiate
    // a specialized Document type
    var doc = this.createDocument();

    // For debug purposes
    window.doc = doc;

    // A deliverable state which makes this importer stateless
    var state = new LensImporter.State(xmlDoc, doc, options);

    // Note: all other methods are called corresponding
    return this.document(state, xmlDoc);
  };

  // Overridden to create a Lens Article instance
  this.createDocument = function() {
    var Article = require("lens-article");
    var doc = new Article();
    return doc;
  };

  var _viewMapping = {
    // "image": "figures",
    "box": "content",
    "supplement": "figures",
    "figure": "figures",
    "table": "figures",
    "video": "figures"
  };

  this.show = function(state, nodes) {
    var doc = state.doc;

    _.each(nodes, function(n) {
      var view = _viewMapping[n.type] || "content";
      doc.show(view, n.id);
    });
  };


  this.extractCover = function(state, article) {
    var doc = state.doc;
    var docNode = doc.get("document");
    var cover = {
      id: "cover",
      type: "cover",
      title: docNode.title,
      authors: [], // docNode.authors,
      abstract: docNode.abstract
    };

    // Create authors paragraph that has person_reference annotations
    // to activate the author cards

    _.each(docNode.authors, function(personId) {
      var person = doc.get(personId);

      var authorsPara = {
        "id": "text_"+personId+"_reference",
        "type": "text",
        "content": person.name
      };

      doc.create(authorsPara);
      cover.authors.push(authorsPara.id);

      var anno = {
        id: state.nextId("person_reference"),
        type: "person_reference",
        path: ["text_" + personId + "_reference", "content"],
        range: [0, person.name.length],
        target: personId
      };

      doc.create(anno);
    }, this);

    doc.create(cover);
    doc.show("content", cover.id, 0);
  };

  // Note: Substance.Article supports only one author.
  // We use the first author found in the contribGroup for the 'creator' property.
  this.contribGroup = function(state, contribGroup) {
    var i;
    var affiliations = contribGroup.querySelectorAll("aff");
    for (i = 0; i < affiliations.length; i++) {
      this.affiliation(state, affiliations[i]);
    }

    // Extract equal contributors
    var equalContribs = contribGroup.querySelectorAll("contrib[equal-contrib=yes]");

    state.equalContribs = _.map(equalContribs, function(c) {
      return _getName(c);
    });


    var contribs = contribGroup.querySelectorAll("contrib");
    for (i = 0; i < contribs.length; i++) {
      this.contributor(state, contribs[i]);
    }
  };

  this.affiliation = function(state, aff) {
    var doc = state.doc;

    var institution = aff.querySelector("institution");
    var country = aff.querySelector("country");
    var label = aff.querySelector("label");
    var department = aff.querySelector("addr-line named-content[content-type=department]");
    var city = aff.querySelector("addr-line named-content[content-type=city]");

    var affiliationNode = {
      id: state.nextId("affiliation"),
      type: "affiliation",
      source_id: aff.getAttribute("id"),
      label: label ? label.textContent : null,
      department: department ? department.textContent : null,
      city: city ? city.textContent : null,
      institution: institution ? institution.textContent : null,
      country: country ? country.textContent: null
    };

    doc.create(affiliationNode);
  };



  this.contributor = function(state, contrib) {
    var doc = state.doc;

    var id = state.nextId("person");
    var personNode = {
      id: id,
      source_id: contrib.getAttribute("id"),
      type: "person",
      name: "",
      affiliations: [],
      fundings: [],
      // Not yet supported... need examples
      image: "",
      emails: [],
      contribution: ""
    };


    // Extracting equal contributions
    var nameEl = contrib.querySelector("name");
    personNode.name = _getName(nameEl);
    if (_.include(state.equalContribs, personNode.name)) {
      personNode.equal_contrib = _.without(state.equalContribs, personNode.name);
    }

    // extract affiliations stored as xrefs
    var xrefs = contrib.querySelectorAll("xref");

    _.each(xrefs, function(xref) {
      if (xref.getAttribute("ref-type") === "aff") {
        var affId = xref.getAttribute("rid");
        var affNode = doc.getNodeBySourceId(affId);
        if (affNode) {
          personNode.affiliations.push(affNode.id);
        }
      } else if (xref.getAttribute("ref-type") === "other") {
        var awardGroup = state.xmlDoc.getElementById(xref.getAttribute("rid"));
        if (!awardGroup) return;
        var fundingSource = awardGroup.querySelector("funding-source");
        if (!fundingSource) return;
        personNode.fundings.push(fundingSource.textContent);
      } else if (xref.getAttribute("ref-type") === "corresp") {
        var corresp = state.xmlDoc.getElementById(xref.getAttribute("rid"));
        if (!corresp) return;
        var email = corresp.querySelector("email");
        if (!email) return;
        personNode.emails.push(email.textContent);
      } else if (xref.getAttribute("ref-type") === "fn") {
        var elem = state.xmlDoc.getElementById(xref.getAttribute("rid"));

        if (elem && elem.getAttribute("fn-type") === "con") {
          personNode.contribution = elem.textContent;
        } else {
          // skipping...
        }
      }
    });

    if (contrib.getAttribute("contrib-type") === "author") {
      doc.nodes.document.authors.push(id);
    }


    doc.create(personNode);
    doc.show("info", personNode.id);
  };

  // Annotations
  // --------

  var _annotationTypes = {
    "bold": "strong",
    "italic": "emphasis",
    "monospace": "code",
    "sub": "subscript",
    "sup": "superscript",
    "underline": "underline",
    "ext-link": "link",
    "xref": ""
  };

  this.isAnnotation = function(type) {
    return _annotationTypes[type] !== undefined;
  };

  this.createAnnotation = function(state, el, start, end) {
    var type = el.tagName.toLowerCase();
    var anno = {
      path: _.last(state.stack).path,
      range: [start, end],
    };
    if (type === "xref") {
      var refType = el.getAttribute("ref-type");

      var sourceId = el.getAttribute("rid");
      if (refType === "bibr") {
        anno.type = "citation_reference";
      } else if (refType === "fig" || refType === "table" || refType === "supplementary-material" || refType === "other") {
        anno.type = "figure_reference";
      } else {
        // Treat everything else as cross reference
        anno.type = "cross_reference";
        // console.log("Ignoring xref: ", refType, el);
        // return;
      }

      if (sourceId) anno.target = sourceId.split(" ")[0];
    }
    // Common annotations (e.g., emphasis)
    else if (_annotationTypes[type] !== undefined) {
      anno.type = _annotationTypes[type];
      if (type === "ext-link") {
        anno.url = el.getAttribute("xlink:href");
        if (el.getAttribute("ext-link-type") === "doi") {
          anno.url = ["http://dx.doi.org/", anno.url].join("");
        }
      }
    }
    else {
      console.log("Ignoring annotation: ", type, el);
      return;
    }

    anno.id = state.nextId(anno.type);
    state.annotations.push(anno);
  };

  this.annotatedText = function(state, iterator, charPos, nested) {
    var plainText = "";

    if (charPos === undefined) {
      charPos = 0;
    }

    while(iterator.hasNext()) {
      var el = iterator.next();
      // Plain text nodes...
      if (el.nodeType === Node.TEXT_NODE) {
        plainText += el.textContent;
        charPos += el.textContent.length;
      }
      // Annotations...
      else {

        var type = util.dom.getNodeType(el);
        if (this.isAnnotation(type)) {
          var start = charPos;
          // recurse into the annotation element to collect nested annotations
          // and the contained plain text
          var childIterator = new util.dom.ChildNodeIterator(el);
          var annotatedText = this.annotatedText(state, childIterator, charPos, "nested");
          plainText += annotatedText;
          charPos += annotatedText.length;
          this.createAnnotation(state, el, start, charPos);
        }

        // Unsupported...
        else {
          if (nested) {
            throw new ImporterError("Node not yet supported in annoted text: " + type);
          }
          else {
            // on paragraph level other elements can break a text block
            // we shift back the position and finish this call
            iterator.back();
            break;
          }
        }
      }
    }
    return plainText;
  };


  // Parser
  // --------
  // These methods are used to process XML elements in
  // using a recursive-descent approach.


  // ### Top-Level function that takes a full NLM tree
  // Note: a specialized converter can derive this method and
  // add additional pre- or post-processing.

  this.document = function(state, xmlDoc) {
    // Setup configuration objects
    var publisherName = xmlDoc.querySelector("publisher-name").textContent;
    if (publisherName === "Landes Bioscience") {
      state.config = new LandesConfiguration();
    } else if (publisherName === "eLife Sciences Publications, Ltd") {
      state.config = new ElifeConfiguration();
    } else if (publisherName === "Public Library of Science") {
      state.config = new PLOSConfiguration();
    } else if (publisherName === 'PeerJ Inc.') {
      state.config = new PeerJConfiguration();
    } else {
      state.config = new DefaultConfiguration();
    }

    var doc = state.doc;
    var article = xmlDoc.querySelector("article");

    if (!article) {
      throw new ImporterError("Expected to find an 'article' element.");
    }

    // recursive-descent for the main body of the article
    this.article(state, article);

    // post-processing:

    // Creating the annotations afterwards, to make sure
    // that all referenced nodes are available
    for (var i = 0; i < state.annotations.length; i++) {
      var anno = state.annotations[i];
      if (anno.target) {
        var targetNode = state.doc.getNodeBySourceId(anno.target);
        if (targetNode) anno.target = targetNode.id;
      }

      doc.create(state.annotations[i]);
    }

    // Rebuild views to ensure consistency
    _.each(doc.views, function(view) {
      doc.get(view).rebuild();
    });

    return doc;
  };



  this.extractContributors = function(state, article) {
    // TODO: the spec says, that there may be any combination of
    // 'contrib-group', 'aff', 'aff-alternatives', and 'x'
    // However, in the articles seen so far, these were sub-elements of 'contrib-group', which itself was single
    var contribGroup = article.querySelector("article-meta contrib-group");
    if (contribGroup) {
      this.contribGroup(state, contribGroup);
    }
  };


  this.extractFigures = function(state, xmlDoc) {
    // Globally query all figure-ish content, <fig>, <supplementary-material>, <table-wrap>, <media video>
    // mimetype="video"
    var figureElements = xmlDoc.querySelectorAll("fig, table-wrap, supplementary-material, media[mimetype=video]");
    var figureNodes = [];
    var node;

    for (var i = 0; i < figureElements.length; i++) {
      var figEl = figureElements[i];
      var type = util.dom.getNodeType(figEl);

      if (type === "fig") {
        node = this.figure(state, figEl);
        if (node) figureNodes.push(node);
      }
      else if (type === "table-wrap") {
        node = this.tableWrap(state, figEl);
        if (node) figureNodes.push(node);
        // nodes = nodes.concat(this.section(state, child));
      } else if (type === "media") {
        node = this.video(state, figEl);
        if (node) figureNodes.push(node);
      } else if (type === "supplementary-material") {

        node = this.supplement(state, figEl);
        if (node) figureNodes.push(node);
      }
    }

    // Show the figures
    if (figureNodes.length > 0) {
      this.show(state, figureNodes);
    }
  };



  this.extractCitations = function(state, xmlDoc) {
    var refList = xmlDoc.querySelector("ref-list");
    if (refList) {
      this.refList(state, refList);
    }
  };

  // Handle <fig> element
  // --------
  //

  this.figure = function(state, figure) {
    var doc = state.doc;

    var label = figure.querySelector("label");

    // Top level figure node
    var figureNode = {
      "type": "figure",
      "id": state.nextId("figure"),
      "source_id": figure.getAttribute("id"),
      "label": label ? label.textContent : "Figure",
      "url": "http://images.wisegeek.com/young-calico-cat.jpg",
      "caption": null
    };

    // Add a caption if available
    var caption = figure.querySelector("caption");
    if (caption) {
      var captionNode = this.caption(state, caption);
      if (captionNode) figureNode.caption = captionNode.id;
    }

    var attrib = figure.querySelector("attrib");
    if (attrib) {
      figureNode.attrib = attrib.textContent;
    }

    // Lets the configuration patch the figure node properties
    state.config.enhanceFigure(state, figureNode, figure);
    doc.create(figureNode);

    return figureNode;
  };

  // Handle <supplementary-material> element
  // --------
  //
  // eLife Example:
  //
  // <supplementary-material id="SD1-data">
  //   <object-id pub-id-type="doi">10.7554/eLife.00299.013</object-id>
  //   <label>Supplementary file 1.</label>
  //   <caption>
  //     <title>Compilation of the tables and figures (XLS).</title>
  //     <p>This is a static version of the
  //       <ext-link ext-link-type="uri" xlink:href="http://www.vaxgenomics.org/vaxgenomics/" xmlns:xlink="http://www.w3.org/1999/xlink">
  //         Interactive Results Tool</ext-link>, which is also available to download from Zenodo (see major datasets).</p>
  //     <p>
  //       <bold>DOI:</bold>
  //       <ext-link ext-link-type="doi" xlink:href="10.7554/eLife.00299.013">http://dx.doi.org/10.7554/eLife.00299.013</ext-link>
  //     </p>
  //   </caption>
  //   <media mime-subtype="xlsx" mimetype="application" xlink:href="elife00299s001.xlsx"/>
  // </supplementary-material>
  //
  // LB Example:
  //
  // <supplementary-material id="SUP1" xlink:href="2012INTRAVITAL024R-Sup.pdf">
  //   <label>Additional material</label>
  //   <media xlink:href="2012INTRAVITAL024R-Sup.pdf"/>
  // </supplementary-material>

  this.supplement = function(state, supplement) {
    var doc = state.doc;

    //get supplement info
    var label = supplement.querySelector("label");

    var url = "http://meh.com";
    var mediaEl = supplement.querySelector("media");
    var url = mediaEl ? mediaEl.getAttribute("xlink:href") : null;
    var doi = supplement.querySelector("object-id[pub-id-type='doi']");
    doi = doi ? "http://dx.doi.org/" + doi.textContent : "";

    //create supplement node using file ids
    var supplementNode = {
      "id": state.nextId("supplement"),
      "source_id": supplement.getAttribute("id"),
      "type": "supplement",
      "label": label ? label.textContent : "",
      "url": url,
      "caption": null
    };

    // Add a caption if available
    var caption = supplement.querySelector("caption");

    if (caption) {
      var captionNode = this.caption(state, caption);
      if (captionNode) supplementNode.caption = captionNode.id;
    }

    // Let config enhance the node
    state.config.enhanceSupplement(state, supplementNode, supplement);
    doc.create(supplementNode);
    return supplementNode;
    // doc.show("figures", id);
  };


  // Used by Figure, Table, Video, Supplement types.
  // --------

  this.caption = function(state, caption) {
    var doc = state.doc;
    var title = caption.querySelector("title");

    // Only consider direct children
    var paragraphs = _.select(caption.querySelectorAll("p"), function(p) {
      return p.parentNode === caption;
    });

    if (paragraphs.length === 0) return null;

    var captionNode = {
      "id": state.nextId("caption"),
      "source_id": caption.getAttribute("id"),
      "type": "caption",
      "title": "",
      "children": []
    };

    // Titles can be annotated, thus delegate to paragraph
    if (title) {
      // Resolve title by delegating to the paragraph
      var node = this.paragraph(state, title);
      if (node) {
        captionNode.title = node.id;
      }
    }


    var children = [];
    _.each(paragraphs, function(p) {
      var node = this.paragraph(state, p);
      if (node) {
        children.push(node.id);
      }
    }, this);

    captionNode.children = children;
    doc.create(captionNode);

    return captionNode;
  };


  // Example video element
  //
  // <media content-type="glencoe play-in-place height-250 width-310" id="movie1" mime-subtype="mov" mimetype="video" xlink:href="elife00005m001.mov">
  //   <object-id pub-id-type="doi">
  //     10.7554/eLife.00005.013</object-id>
  //   <label>Movie 1.</label>
  //   <caption>
  //     <title>Movement of GFP tag.</title>
  //     <p>
  //       <bold>DOI:</bold>
  //       <ext-link ext-link-type="doi" xlink:href="10.7554/eLife.00005.013">http://dx.doi.org/10.7554/eLife.00005.013</ext-link>
  //     </p>
  //   </caption>
  // </media>

  this.video = function(state, video) {
    var doc = state.doc;

    var label = video.querySelector("label").textContent;

    var id = state.nextId("video");
    var videoNode = {
      "id": id,
      "source_id": video.getAttribute("id"),
      "type": "video",
      "label": label,
      "title": "",
      "caption": null,
      "poster": ""
    };

    // Add a caption if available
    var caption = video.querySelector("caption");
    if (caption) {
      var captionNode = this.caption(state, caption);
      if (captionNode) videoNode.caption = captionNode.id;
    }

    state.config.enhanceVideo(state, videoNode, video);
    doc.create(videoNode);

    return videoNode;
  };

  this.tableWrap = function(state, tableWrap) {
    var doc = state.doc;
    var label = tableWrap.querySelector("label");

    var tableNode = {
      "id": state.nextId("table"),
      "source_id": tableWrap.getAttribute("id"),
      "type": "table",
      "title": "",
      "label": label ? label.textContent : "Table",
      "content": "",
      "caption": null,
      // Not supported yet ... need examples
      footers: [],
      // doi: "" needed?
    };

    // Note: using a DOM div element to create HTML
    var table = tableWrap.querySelector("table");
    tableNode.content = _toHtml(table);

    // Add a caption if available
    var caption = tableWrap.querySelector("caption");
    if (caption) {
      var captionNode = this.caption(state, caption);
      if (captionNode) tableNode.caption = captionNode.id;
    }

    state.config.enhanceTable(state, tableNode, tableWrap);
    doc.create(tableNode);
    return tableNode;
  };


  // Article
  // --------
  // Does the actual conversion.
  //
  // Note: this is implemented as lazy as possible (ALAP) and will be extended as demands arise.
  //
  // If you need such an element supported:
  //  - add a stub to this class (empty body),
  //  - add code to call the method to the appropriate function,
  //  - and implement the handler here if it can be done in general way
  //    or in your specialized importer.

  this.article = function(state, article) {
    var doc = state.doc;

    // Assign id
    var articleId = article.querySelector("article-id");
    // Note: Substance.Article does only support one id
    if (articleId) {
      doc.id = articleId.textContent;
    } else {
      // if no id was set we create a random one
      doc.id = util.uuid();
    }

    // Extract authors etc.
    this.extractContributors(state, article);

    // Same for the citations, also globally
    this.extractCitations(state, article);

    // First extract all figure-ish content, using a global approach
    this.extractFigures(state, article);

    // Make up a cover node
    this.extractCover(state, article);

    // Extract ArticleMeta
    this.extractArticleMeta(state, article);

    var body = article.querySelector("body");
    if (body) {
      this.body(state, body);
    }

    // Give the config the chance to add stuff
    state.config.enhanceArticle(this, state, article);

  };


  // #### Front.ArticleMeta
  //

  this.extractArticleMeta = function(state, article) {
    // var doc = state.doc;

    var articleMeta = article.querySelector("article-meta");
    if (!articleMeta) {
      throw new ImporterError("Expected element: 'article-meta'");
    }

    // <article-id> Article Identifier, zero or more
    var articleIds = articleMeta.querySelectorAll("article-id");
    this.articleIds(state, articleIds);

    // <title-group> Title Group, zero or one
    var titleGroup = articleMeta.querySelector("title-group");
    if (titleGroup) {
      this.titleGroup(state, titleGroup);
    }

    // <pub-date> Publication Date, zero or more
    var pubDates = articleMeta.querySelectorAll("pub-date");
    this.pubDates(state, pubDates);

    // <abstract> Abstract, zero or more
    var abstracts = articleMeta.querySelectorAll("abstract");

    _.each(abstracts, function(abs) {
      this.abstract(state, abs);
    }, this);

    // Populate Publication Info node
    // ------------

    state.config.extractPublicationInfo(this, state, article);

    // Not supported yet:
    // <trans-abstract> Translated Abstract, zero or more
    // <kwd-group> Keyword Group, zero or more
    // <conference> Conference Information, zero or more
    // <counts> Counts, zero or one
    // <custom-meta-group> Custom Metadata Group, zero or one
  };



  // articleIds: array of <article-id> elements
  this.articleIds = function(state, articleIds) {
    var doc = state.doc;

    // Note: Substance.Article does only support one id
    if (articleIds.length > 0) {
      doc.id = articleIds[0].textContent;
    } else {
      // if no id was set we create a random one
      doc.id = util.uuid();
    }
  };

  this.titleGroup = function(state, titleGroup) {
    var doc = state.doc;

    var articleTitle = titleGroup.querySelector("article-title");
    if (articleTitle) {
      doc.title = articleTitle.textContent;
    }

    // Not yet supported:
    // <subtitle> Document Subtitle, zero or one
  };

  // Note: Substance.Article supports no publications directly.
  // We use the first pub-date for created_at
  this.pubDates = function(state, pubDates) {
    var doc = state.doc;
    if (pubDates.length > 0) {
      var converted = this.pubDate(state, pubDates[0]);
      doc.created_at = converted.date;
    }
  };

  // Note: this does not follow the spec but only takes the parts as it was necessary until now
  // TODO: implement it thoroughly
  this.pubDate = function(state, pubDate) {
    var day = -1;
    var month = -1;
    var year = -1;
    _.each(util.dom.getChildren(pubDate), function(el) {
      var type = util.dom.getNodeType(el);

      var value = el.textContent;
      if (type === "day") {
        day = parseInt(value, 10);
      } else if (type === "month") {
        month = parseInt(value, 10);
      } else if (type === "year") {
        year = parseInt(value, 10);
      }
    }, this);
    var date = new Date(year, month, day);
    return {
      date: date
    };
  };

  this.abstract = function(state, abs) {
    var doc = state.doc;
    var nodes = [];

    var title = abs.querySelector("title");

    var heading = {
      id: state.nextId("heading"),
      type: "heading",
      level: 1,
      content: title ? title.textContent : "Abstract"
    };

    doc.create(heading);
    nodes.push(heading);

    nodes = nodes.concat(this.bodyNodes(state, util.dom.getChildren(abs)));
    if (nodes.length > 0) {
      this.show(state, nodes);
    }
  };

  // ### Article.Body
  //

  this.body = function(state, body) {

    var heading = {
      id: state.nextId("heading"),
      type: "heading",
      level: 1,
      content: "Main Text"
    };
    doc.create(heading);


    var nodes = [heading].concat(this.bodyNodes(state, util.dom.getChildren(body)));

    if (nodes.length > 0) {
      this.show(state, nodes);
    }
  };

  // Top-level elements as they can be found in the body or
  // in a section
  // NEW: Also used for boxed-text elements
  this.bodyNodes = function(state, children, startIndex) {
    var nodes = [];
    var node;
    startIndex = startIndex || 0;

    for (var i = startIndex; i < children.length; i++) {
      var child = children[i];
      var type = util.dom.getNodeType(child);

      if (type === "p") {
        nodes = nodes.concat(this.paragraphGroup(state, child));
      }
      else if (type === "sec") {
        nodes = nodes.concat(this.section(state, child));
      }
      else if (type === "list") {
        node = this.list(state, child);
        if (node) nodes.push(node);
      }
      else if (type === "disp-formula") {
        node = this.formula(state, child);
        if (node) nodes.push(node);
      }
      else if (type === "caption") {
        node = this.caption(state, child);
        if (node) nodes.push(node);
      }
      else if (type === "boxed-text") {
        // Just treat as another container
        var node = this.boxedText(state, child);
        if (node) nodes.push(node);
        // nodes = nodes.concat(this.bodyNodes(state, util.dom.getChildren(child)));
      }
      else if (type === "disp-quote") {
        // Just treat as another container
        var node = this.boxedText(state, child);
        if (node) nodes.push(node);
      }
      // Note: here are some node types ignored which are
      // processed in an extra pass (figures, tables, etc.)
      else if (type === "comment") {
        // Note: Maybe we could create a Substance.Comment?
        // Keep it silent for now
        // console.error("Ignoring comment");
      } else {
        // console.error("Node not yet supported as top-level node: " + type);
      }
    }
    return nodes;
  };


  this.boxedText = function(state, box) {
    var doc = state.doc;

    // Assuming that there are no nested <boxed-text> elements
    var childNodes = this.bodyNodes(state, util.dom.getChildren(box));

    var label = box.querySelector("label");
    var boxId = state.nextId("box");

    var boxNode = {
      "type": "box",
      "id": boxId,
      "source_id": box.getAttribute("id"),
      "label": label ? label.textContent : boxId.replace("_", " "),
      "children": _.pluck(childNodes, 'id')
    };
    doc.create(boxNode);

    // Boxes go into the figures view if these conditions are met
    // 1. box has a label (e.g. elife 00288) 
    if (label) {
      doc.show("figures", boxId, -1);
      return null;
    }
    return boxNode;

  };

  this.datasets = function(state, datasets) {
    var nodes = [];

    for (var i=0;i<datasets.length;i++) {
      var data = datasets[i];
      var type = util.dom.getNodeType(data);
      if (type === 'p') {
        var obj = data.querySelector('related-object');
        if (obj) {
          nodes = nodes.concat(this.indivdata(state,obj));
        }
        else {
          var par = this.paragraphGroup(state, data);
          nodes.push(par[0].id);
        }
      }
    }
    return nodes;
  };

  this.indivdata = function(state,indivdata) {
    var p1 = {
      "type" : "paragraph",
      "id" : state.nextId("paragraph"),
      "children" : []
    };
    var text1 = {
      "type" : "text",
      "id" : state.nextId("text"),
      "content" : ""
    };
    p1.children.push(text1.id);
    var input = util.dom.getChildren(indivdata);
    for (var i = 0;i<input.length;i++) {
      var info = input[i];
      var type = util.dom.getNodeType(info);
      if (type === "name") {
        var children = util.dom.getChildren(info);
        for (var j = 0;j<children.length;j++) {
          var name = children[j];
          if (j === 0) {
            var par = this.paragraphGroup(state,name);
            p1.children.push(par[0].children[0]);
          }
          else {
            var text2 = {
              "type" : "text",
              "id" : state.nextId("text"),
              "content" : ", "
            };
            doc.create(text2)
            p1.children.push(text2.id)
            var par = this.paragraphGroup(state,name);
            p1.children.push(par[0].children[0]);
          }
        }
      }
      else {
        var par = this.paragraphGroup(state,info);
        // Smarter null reference check?
        if (par && par[0] && par[0].children) {
          p1.children.push(par[0].children[0]);  
        }
      }
    }    
    doc.create(p1);
    doc.create(text1);
    return p1.id;
  };

  this.section = function(state, section) {

    // pushing the section level to track the level for nested sections
    state.sectionLevel++;

    var doc = state.doc;
    var children = util.dom.getChildren(section);

    // create a heading
    // TODO: headings can contain annotations too
    var title = children[0];
    var heading = {
      id: state.nextId("heading"),
      source_id: section.getAttribute("id"),
      type: "heading",
      level: state.sectionLevel,
      content: title.textContent
    };
    doc.create(heading);

    // Recursive Descent: get all section body nodes
    var nodes = this.bodyNodes(state, children, 1);
    // add the heading at the front
    nodes.unshift(heading);

    // popping the section level
    state.sectionLevel--;

    return nodes;
  };


  this.ignoredParagraphElements = {
    "comment": true,
    "supplementary-material": true,
    "fig": true,
    "fig-group": true,
    "table-wrap": true,
    "media": true
  };

  this.acceptedParagraphElements = {
    "boxed-text": {handler: "boxedText"},
    "list": { handler: "list" },
    "disp-formula": { handler: "formula" },
  };

  this.inlineParagraphElements = {
    "inline-graphic": true,
    "inline-formula": true
  };

  // Segments children elements of a NLM <p> element
  // into blocks grouping according to following rules:
  // - "text", "inline-graphic", "inline-formula", and annotations
  // - ignore comments, supplementary-materials
  // - others are treated as singles
  this.segmentParagraphElements = function(paragraph) {
    var blocks = [];
    var lastType = "";
    var iterator = new util.dom.ChildNodeIterator(paragraph);

    // first fragment the childNodes into blocks
    while (iterator.hasNext()) {
      var child = iterator.next();
      var type = util.dom.getNodeType(child);

      // ignore some elements
      if (this.ignoredParagraphElements[type]) continue;

      // paragraph elements
      if (type === "text" || this.isAnnotation(type) || this.inlineParagraphElements[type]) {
        if (lastType !== "paragraph") {
          blocks.push({ handler: "paragraph", nodes: [] });
          lastType = "paragraph";
        }
        _.last(blocks).nodes.push(child);
        continue;
      }
      // other elements are treated as single blocks
      else if (this.acceptedParagraphElements[type]) {
        blocks.push(_.extend({node: child}, this.acceptedParagraphElements[type]));
      }
      lastType = type;
    }
    return blocks;
  };


  // A 'paragraph' is given a '<p>' tag
  // An NLM <p> can contain nested elements that are represented flattened in a Substance.Article
  // Hence, this function returns an array of nodes
  this.paragraphGroup = function(state, paragraph) {
    var nodes = [];

    // Note: there are some elements in the NLM paragraph allowed
    // which are flattened here. To simplify further processing we
    // segment the children of the paragraph elements in blocks
    var blocks = this.segmentParagraphElements(paragraph);

    for (var i = 0; i < blocks.length; i++) {
      var block = blocks[i];
      var node;
      if (block.handler === "paragraph") {
        node = this.paragraph(state, block.nodes);
        if (node) node.source_id = paragraph.getAttribute("id");
      } else {
        node = this[block.handler](state, block.node);
      }
      if (node) nodes.push(node);
    }

    return nodes;
  };

  this.paragraph = function(state, children) {
    var doc = state.doc;

    var node = {
      id: state.nextId("paragraph"),
      type: "paragraph",
      children: null
    };
    var nodes = [];


    var iterator = new util.dom.ChildNodeIterator(children);
    while (iterator.hasNext()) {
      var child = iterator.next();
      var type = util.dom.getNodeType(child);

      // annotated text node
      if (type === "text" || this.isAnnotation(type)) {
        var textNode = {
          id: state.nextId("text"),
          type: "text",
          content: null
        };
        // pushing information to the stack so that annotations can be created appropriately
        state.stack.push({
          node: textNode,
          path: [textNode.id, "content"]
        });
        // Note: this will consume as many textish elements (text and annotations)
        // but will return when hitting the first un-textish element.
        // In that case, the iterator will still have more elements
        // and the loop is continued
        // Before descending, we reset the iterator to provide the current element again.
        var annotatedText = this.annotatedText(state, iterator.back(), 0);

        // Ignore empty paragraphs
        if (annotatedText.length > 0) {
          textNode.content = annotatedText;
          doc.create(textNode);
          nodes.push(textNode);
        }

        // popping the stack
        state.stack.pop();
      }

      // inline image node
      else if (type === "inline-graphic") {
        var url = child.getAttribute("xlink:href");
        var img = {
          id: state.nextId("image"),
          type: "image",
          url: state.config.resolveURL(state, url)
        };
        doc.create(img);
        nodes.push(img);
      }
      else if (type === "inline-formula") {
        var formula = this.formula(state, child, "inline");
        if (formula) {
          nodes.push(formula);
        }
      }
    }

    // if there is only a single node, return do not create a paragraph around it
    // if (nodes.length < 2) {
    //   return nodes[0];
    // } else {
    if (nodes.length === 0) return null;

    node.children = _.map(nodes, function(n) { return n.id; } );
    doc.create(node);
    return node;
    // }
  };

  // List type
  // --------

  this.list = function(state, list) {
    var doc = state.doc;

    var listNode = {
      "id": state.nextId("list"),
      "source_id": list.getAttribute("id"),
      "type": "list",
      "items": [],
      "ordered": false
    };

    // TODO: better detect ordererd list types (need examples)
    if (list.getAttribute("list-type") === "ordered") {
      listNode.ordered = true;
    }

    var listItems = list.querySelectorAll("list-item");
    for (var i = 0; i < listItems.length; i++) {
      var listItem = listItems[i];
      // Note: we do not care much about what is served as items
      // However, we do not have complex nodes on paragraph level
      // They will be extract as sibling items
      var nodes = this.bodyNodes(state, util.dom.getChildren(listItem), 0);
      for (var j = 0; j < nodes.length; j++) {
        listNode.items.push(nodes[j].id);
      }
    }

    doc.create(listNode);
    return listNode;
  };

  // Formula Node Type
  // --------

  var _getFormula = function(formulaElement, inline) {
    var children = util.dom.getChildren(formulaElement);
    for (var i = 0; i < children.length; i++) {
      var child = children[i];
      var type = util.dom.getNodeType(child);

      if (type === "mml:math") {
        // make sure that 'display' is set to 'block', otherwise
        // there will be rendering issues.
        // Although it is a rendering related issue it is easier
        // to make this conform here
        if (!inline) {
          child.setAttribute("display", "block");
        }
        return {
          format: "mathml",
          data: _toHtml(child)
        };
      }
      else if (type === "tex-math") {
        return {
          format: "latex",
          data: child.textContent
        };
      }
    }
    return null;
  };

  this.formula = function(state, dispFormula, inline) {
    var doc = state.doc;

    var id = inline ? state.nextId("inline_formula") : state.nextId("formula");

    var formulaNode = {
      id: id,
      source_id: dispFormula.getAttribute("id"),
      type: "formula",
      label: "",
      data: "",
      format: "",
    };
    if (inline) formulaNode.inline = true;

    var label = dispFormula.querySelector("label");
    if (label) formulaNode.label = label.textContent;

    var formula = _getFormula(dispFormula, inline);
    if (!formula) {
      return null;
    } else {
      formulaNode.format = formula.format;
      formulaNode.data = formula.data;
    }
    doc.create(formulaNode);
    return formulaNode;
  };

  // Citations
  // ---------

  this.refList = function(state, refList) {
    var refs = refList.querySelectorAll("ref");
    for (var i = 0; i < refs.length; i++) {
      this.ref(state, refs[i]);
    }
  };

  this.ref = function(state, ref) {
    var children = util.dom.getChildren(ref);
    for (var i = 0; i < children.length; i++) {
      var child = children[i];
      var type = util.dom.getNodeType(child);

      if (type === "mixed-citation" || type === "element-citation") {
        this.citation(state, ref, child);
      } else if (type === "label") {
        // ignoring it here...
      } else {
        console.error("Not supported in 'ref': ", type);
      }
    }
  };


  // Citation
  // ------------------
  // NLM input example
  //
  // <element-citation publication-type="journal" publication-format="print">
  // <name><surname>Llanos De La Torre Quiralte</surname>
  // <given-names>M</given-names></name>
  // <name><surname>Garijo Ayestaran</surname>
  // <given-names>M</given-names></name>
  // <name><surname>Poch Olive</surname>
  // <given-names>ML</given-names></name>
  // <article-title xml:lang="es">Evolucion de la mortalidad
  // infantil de La Rioja (1980-1998)</article-title>
  // <trans-title xml:lang="en">Evolution of the infant
  // mortality rate in la Rioja in Spain
  // (1980-1998)</trans-title>
  // <source>An Esp Pediatr</source>
  // <year>2001</year>
  // <month>Nov</month>
  // <volume>55</volume>
  // <issue>5</issue>
  // <fpage>413</fpage>
  // <lpage>420</lpage>
  // <comment>Figura 3, Tendencia de mortalidad infantil
  // [Figure 3, Trends in infant mortality]; p. 418.
  // Spanish</comment>
  // </element-citation>

  // TODO: is implemented naively, should be implemented considering the NLM spec
  this.citation = function(state, ref, citation) {
    var doc = state.doc;
    var citationNode;
    var i;

    var id = state.nextId("article_citation");

    // TODO: we should consider to have a more structured citation type
    // and let the view decide how to render it instead of blobbing everything here.
    var personGroup = citation.querySelector("person-group");

    // HACK: we try to create a 'articleCitation' when there is structured
    // content (ATM, when personGroup is present)
    // Otherwise we create a mixed-citation taking the plain text content of the element
    if (personGroup) {

      citationNode = {
        "id": id,
        "source_id": ref.getAttribute("id"),
        "type": "citation",
        "title": "N/A",
        "label": "",
        "authors": [],
        "doi": "",
        "source": "",
        "volume": "",
        "fpage": "",
        "lpage": "",
        "citation_urls": []
      };

      var nameElements = personGroup.querySelectorAll("name");
      for (i = 0; i < nameElements.length; i++) {
        citationNode.authors.push(_getName(nameElements[i]));
      }

      var articleTitle = citation.querySelector("article-title");
      if (articleTitle) {
        citationNode.title = articleTitle.textContent;
      } else {
        console.error("FIXME: this citation has no title", citation);
      }

      var source = citation.querySelector("source");
      if (source) citationNode.source = source.textContent;

      var volume = citation.querySelector("volume");
      if (volume) citationNode.volume = volume.textContent;

      var fpage = citation.querySelector("fpage");
      if (fpage) citationNode.fpage = fpage.textContent;

      var lpage = citation.querySelector("lpage");
      if (lpage) citationNode.lpage = lpage.textContent;

      var year = citation.querySelector("year");
      if (year) citationNode.year = year.textContent;

      // Note: the label is child of 'ref'
      var label = ref.querySelector("label");
      if(label) citationNode.label = label.textContent;

      var doi = citation.querySelector("pub-id[pub-id-type='doi'], ext-link[ext-link-type='doi']");
      if(doi) citationNode.doi = "http://dx.doi.org/" + doi.textContent;
    } else {
      console.error("FIXME: there is one of those 'mixed-citation' without any structure. Skipping ...", citation);
      return;
      // citationNode = {
      //   id: id,
      //   type: "mixed_citation",
      //   citation: citation.textContent,
      //   doi: ""
      // };
    }

    doc.create(citationNode);
    doc.show("citations", id);
  };

  // Article.Back
  // --------
  // Contains things like references, notes, etc.

  // this.back = function(state, back) {
  //   // No processing at the moment
  //   // citations are taken care of in a global handler.
  // };
};


LensImporter.State = function(xmlDoc, doc, options) {
  // the input xml document
  this.xmlDoc = xmlDoc;

  // the output substance document
  this.doc = doc;

  // keep track of the options
  this.options = options || {};

  // store annotations to be created here
  // they will be added to the document when everything else is in place
  this.annotations = [];

  // when recursing into sub-nodes it is necessary to keep the stack
  // of processed nodes to be able to associate other things (e.g., annotations) correctly.
  this.stack = [];

  this.sectionLevel = 1;

  // an id generator for different types
  var ids = {};
  this.nextId = function(type) {
    ids[type] = ids[type] || 0;
    ids[type]++;
    return type +"_"+ids[type];
  };
};

// LensImporter.Prototype.prototype = NLMImporter.prototype;
LensImporter.prototype = new LensImporter.Prototype();

module.exports = {
  Importer: LensImporter
};

},{"./configurations/default":50,"./configurations/elife":51,"./configurations/landes":52,"./configurations/peerj":53,"./configurations/plos":54,"lens-article":5,"substance-util":207,"underscore":212}],56:[function(require,module,exports){
"use strict";

var Outline = require('./outline');

module.exports = Outline;

},{"./outline":57}],57:[function(require,module,exports){
"use strict";

var View = require("substance-application").View;
var $$ = require("substance-application").$$;
var _ = require("underscore");

// Lens.Outline
// ==========================================================================
// 
// Takes a surface, which is projected to a minimap

var Outline = function(surface) {
  View.call(this);

  this.surface = surface;

  // Initial view state, telling which node is selected and which are highlighted
  this.state = {
    selectedNode: null,
    highlightedNodes: []
  };

  this.$el.addClass('lens-outline');

  _.bindAll(this, 'mouseDown', 'mouseUp', 'mouseMove', 'updateVisibleArea');

  // Mouse event handlers
  // --------

  this.$el.mousedown(this.mouseDown);
  this.$el.mousemove(this.mouseMove);
  this.$el.mouseup(this.mouseUp);
};

Outline.Prototype = function() {
  
  // Render Document Outline
  // -------------
  // 
  // Renders outline and calculates bounds

  this.render = function() {
    var that = this;
    var totalHeight = 0;

    var fragment = document.createDocumentFragment();
    fragment.appendChild($$('.visible-area'));
    

    // Initial Calculations
    // --------

    var contentHeight = this.surface.$('.nodes').height();
    var panelHeight = this.surface.$el.height();

    var factor = (contentHeight / panelHeight);
    this.factor = factor;

    // Render nodes
    // --------

    var container = this.surface.doc.container;
    var nodes = container.getTopLevelNodes();

    _.each(nodes, function(node) {
      var dn = this.surface.$('#'+node.id);
      var height = dn.outerHeight(true) / factor;

      // Outline node construction
      var $node = $('<div class="node">')
        .attr({
          id: 'outline_'+node.id,
        })
        .css({
          "position": "absolute",
          "height": height-1,
          "top": totalHeight
        })
        .addClass(node.type)
        .append('<div class="arrow">');
      fragment.appendChild($node[0]);
      totalHeight += height;
    }, this);

    // Init scroll pos
    var scrollTop = that.surface.$el.scrollTop();

    var that = this;


    that.el.innerHTML = "";
    that.el.appendChild(fragment);
    that.updateVisibleArea(scrollTop);

    return this;
  };


  // Update visible area
  // -------------
  // 
  // Should get called from the user when the content area is scrolled

  this.updateVisibleArea = function(scrollTop) {
    this.$('.visible-area').css({
      "top": scrollTop / this.factor,
      "height": this.surface.$el.height() / this.factor
    });
  };


  // Update Outline
  // -------------
  // 
  // Usage:
  // 
  // outline.update({
  //   selectedNode: "node_14",
  //   highlightNodes: []
  // })

  this.update = function(state) {
    this.render();
    this.state = state;

    // Reset
    this.$('.node').removeClass('selected').removeClass('highlighted');
    this.$el.removeClass('figures').removeClass('citations');

    // Set context
    this.$el.addClass(state.context);

    // Mark selected node
    this.$('#outline_' + state.selectedNode).addClass('selected');

    // 2. Mark highlighted nodes
    _.each(state.highlightedNodes, function(n) {
      this.$('#outline_'+n).addClass('highlighted');
    }, this);
  };


  // Handle Mouse down event
  // -----------------
  // 

  this.mouseDown = function(e) {
    this._mouseDown = true;
    var y = e.pageY;

    // Find offset to visible-area.top
    this.offset = y - $('.visible-area').position().top;
    return false;
  };

  // Handle Mouse Up
  // -----------------
  // 
  // Mouse lifted, no scroll anymore

  this.mouseUp = function() {
    this._mouseDown = false;
  },

  // Handle Scroll
  // -----------------
  // 
  // Handle scroll event
  // .visible-area handle

  this.mouseMove = function(e) {
    if (this._mouseDown) {
      var y = e.pageY;
      // find offset to visible-area.top
      var scroll = (y - this.offset)*this.factor;
      this.surface.$el.scrollTop(scroll);
    }
  };
};

Outline.Prototype.prototype = View.prototype;
Outline.prototype = new Outline.Prototype();

module.exports = Outline;

},{"substance-application":61,"underscore":212}],58:[function(require,module,exports){
"use strict";

var Reader = {
  Controller: require("./reader_controller"),
  View: require("./reader_view")
};

module.exports = Reader;
},{"./reader_controller":59,"./reader_view":60}],59:[function(require,module,exports){
"use strict";

var Document = require("substance-document");
var Controller = require("substance-application").Controller;
var ReaderView = require("./reader_view");
var util = require("substance-util");

// Reader.Controller
// -----------------
//
// Controls the Reader.View

var ReaderController = function(doc, state) {

  // Private reference to the document
  this.__document = doc;


  // Reader state
  // -------

  this.content = new Document.Controller(doc, {view: "content"});

  if (doc.get('figures')) {
    this.figures = new Document.Controller(doc, {view: "figures"});
  }

  if (doc.get('citations')) {
    this.citations = new Document.Controller(doc, {view: "citations"});
  }

  if (doc.get('info')) {
    this.info = new Document.Controller(doc, {view: "info"});
  }

  this.state = state;

  // Current explicitly set context
  this.currentContext = "toc";

};

ReaderController.Prototype = function() {

  this.createView = function() {
    this.view = new ReaderView(this);
    return this.view;
  };

  // Explicit context switch
  // --------
  // 

  this.switchContext = function(context) {
    this.currentContext = context;
    this.modifyState({
      context: context,
      node: null,
      resource: null
    });
  };

  this.modifyState = function(state) {
    // console.log('patched modifystate');
    Controller.prototype.modifyState.call(this, state);
  };

  // TODO: Transition to ao new solid API
  // --------
  // 

  this.getActiveControllers = function() {
    var result = [];
    result.push(["article", this]);
    result.push(["reader", this.content]);
    return result;
  };
};


ReaderController.Prototype.prototype = Controller.prototype;
ReaderController.prototype = new ReaderController.Prototype();

module.exports = ReaderController;

},{"./reader_view":60,"substance-application":61,"substance-document":108,"substance-util":207}],60:[function(require,module,exports){
"use strict";

var _ = require("underscore");
var util = require("substance-util");
var html = util.html;
var Surface = require("substance-surface");
var Outline = require("lens-outline");
var View = require("substance-application").View;
var TOC = require("substance-toc");
var Data = require("substance-data");
var Index = Data.Graph.Index;
var $$ = require("substance-application").$$;

var CORRECTION = -100; // Extra offset from the top


var modes = {
  "node": {
    "icon": "icon-anchor"
  },
  "figure": {
    "icon": "icon-camera"
  },
  "citation": {
    "icon": "icon-link"
  }
};

var modeAssignments = {
  "formula": ["node"],
  "heading": ["node"],
  "paragraph": ["node"],
  "text": ["node"],
  "list": ["node"],
  "box": ["node"]
};


var addFocusControls = function(doc, nodeView) {

  // The content node object
  var node = nodeView.node;

  var modesForType = modeAssignments[node.type] || [];
  if (modesForType.length === 0) return; // skip

  // Per mode
  var focusToggles = [];

  _.each(modesForType, function(key) {
    var mode = modes[key];

    // TODO: this should move outside -> logic-less rendering, you know.
    var refs = doc.getAnnotations({
      node: node.id,
      filter: function(a) {
        return a.type === key+'_reference';
      }
    });

    var refCount = Object.keys(refs).length;
    if (refCount > 0 || key === "node") {
      
      var context = key === "node" ? "toc" : key+"s";

      focusToggles.push($$('div', {
        "sbs-click": 'toggleNode('+context+','+node.id+')',
        class: "focus-mode "+ key,
        html: '<div class="arrow"></div><i class="'+mode.icon+'"></i>'+ (refCount > 0 ? refCount : ""),
        title: "Show relevant"+ key
      }));
    }
  });

  var focus = $$('div.focus', {
    children: focusToggles
  });

  // Add stripe
  focus.appendChild($$('.stripe'));
  nodeView.el.appendChild(focus);
};


var addResourceHeader = function(docCtrl, nodeView) {
  var node = nodeView.node;
  var typeDescr = node.constructor.description;

  // Don't render resource headers in info panel (except for person nodes)
  if (docCtrl.view === "info" && node.type !== "person" && node.type !== "collaborator") {
    return;
  }

  var children = [
    $$('a.name', {
      href: "#",
      text: node.header ,
      "sbs-click": "toggleResource("+node.id+")"
    }),
    // $$('.reference-count', {text: "cited x times"}),
    // $$('.type.figure.publication', {text: typeDescr.name}),
  ];

  var config = node.constructor.config;
  if (config && config.zoomable) {
    children.push($$('a.toggle-fullscreen', {
      "href": "#",
      "html": "<i class=\"icon-resize-full\"></i><i class=\"icon-resize-small\"></i>",
      "sbs-click": "toggleFullscreen("+node.id+")"
    }));
  }

  var resourceHeader = $$('.resource-header', {
    children: children
  });
  nodeView.el.insertBefore(resourceHeader, nodeView.content);
};


// Renders the reader view
// --------
// 
// .document
// .context-toggles
//   .toggle-toc
//   .toggle-figures
//   .toggle-citations
//   .toggle-info
// .resources
//   .toc
//   .surface.figures
//   .surface.citations
//   .info

var Renderer = function(reader) {

  var frag = document.createDocumentFragment();

  // Prepare doc view
  // --------

  var docView = $$('.document');
  docView.appendChild(reader.contentView.render().el);

  // Prepare context toggles
  // --------

  var children = [];

  if (reader.tocView && reader.tocView.headings.length > 2) {
    children.push($$('.context-toggle.toc', {
      'sbs-click': 'switchContext(toc)',
      'html': '<i class="icon-align-left"></i><span> Contents</span>'
    }));
  }

  if (reader.figuresView) {
    children.push($$('.context-toggle.figures', {
      'sbs-click': 'switchContext(figures)',
      'html': '<i class="icon-camera"></i><span> Figures</span>'
    }));
  }

  if (reader.citationsView) {
    children.push($$('.context-toggle.citations', {
      'sbs-click': 'switchContext(citations)',
      'html': '<i class="icon-link"></i><span> References</span>'
    }));
  }

  if (reader.infoView) {
    children.push($$('.context-toggle.info', {
      'sbs-click': 'switchContext(info)',
      'html': '<i class="icon-info-sign"></i><span> Article Info</span>'
    }));
  }

  var contextToggles = $$('.context-toggles', {
    children: children
  });

  // Prepare resources view
  // --------

  var resourcesView = $$('.resources');
  // if (contextToggles.children.length > 1) {
  resourcesView.appendChild(contextToggles);
  // }
  

  // Add TOC
  // --------
 
  resourcesView.appendChild(reader.tocView.render().el);

  if (reader.figuresView) {
    resourcesView.appendChild(reader.figuresView.render().el);
  }
  
  if (reader.citationsView) {
    resourcesView.appendChild(reader.citationsView.render().el);
  }

  if (reader.infoView) {
    resourcesView.appendChild(reader.infoView.render().el);
  }

  frag.appendChild(docView);
  frag.appendChild(resourcesView);
  return frag;
};


// Lens.Reader.View
// ==========================================================================
//

var ReaderView = function(readerCtrl) {
  View.call(this);

  // Controllers
  // --------

  this.readerCtrl = readerCtrl;

  var doc = this.readerCtrl.content.__document;

  this.$el.addClass('article');
  this.$el.addClass(doc.schema.id); // Substance article or lens article?


  var ArticleRenderer = this.readerCtrl.content.__document.constructor.Renderer;

  // Surfaces
  // --------

  // A Substance.Document.Writer instance is provided by the controller
  this.contentView = new Surface(this.readerCtrl.content, {
    editable: false,
    renderer: new ArticleRenderer(this.readerCtrl.content, {
      afterRender: addFocusControls
    })
  });

  // Table of Contents 
  // --------
  // 

  this.tocView = new TOC(this.readerCtrl);

  // Provisional Hack:
  // -----------------
  // We sniff into the tocView to determine the default context based on how many 
  // headings are in the document
  // We show the TOC for headings.length > 2
  // 
  // Real solution: determine on the controller level wheter toc should be shown or not

  if (this.tocView.headings.length <= 2) {
    this.readerCtrl.modifyState({
      context: 'figures'
    });
  }

  this.tocView.$el.addClass('resource-view');

  // A Surface for the figures view
  if (this.readerCtrl.figures && this.readerCtrl.figures.get('figures').nodes.length) {
    this.figuresView = new Surface(this.readerCtrl.figures, {
      editable: false,
      renderer: new ArticleRenderer(this.readerCtrl.figures, {
        afterRender: addResourceHeader
      })
    });
    this.figuresView.$el.addClass('resource-view');
  }

  // A Surface for the citations view
  if (this.readerCtrl.citations && this.readerCtrl.citations.get('citations').nodes.length) {
    this.citationsView = new Surface(this.readerCtrl.citations, {
      editable: false,
      renderer: new ArticleRenderer(this.readerCtrl.citations, {
        afterRender: addResourceHeader
      })
    });
    this.citationsView.$el.addClass('resource-view');
  }

  // A Surface for the info view
  if (this.readerCtrl.info && this.readerCtrl.info.get('info').nodes.length) {
    this.infoView = new Surface(this.readerCtrl.info, {
      editable: false,
      renderer: new ArticleRenderer(this.readerCtrl.info, {
        afterRender: addResourceHeader
      })
    });
    this.infoView.$el.addClass('resource-view');
  }

  // Whenever a state change happens (e.g. user navigates somewhere)
  // the interface gets updated accordingly
  this.listenTo(this.readerCtrl, "state-changed", this.updateState);


  // Keep an index for resources
  this.resources = new Index(this.readerCtrl.__document, {
    types: ["figure_reference", "citation_reference", "person_reference"],
    property: "target"
  });


  // Outline
  // --------

  this.outline = new Outline(this.contentView);

  // DOM Events
  // --------
  // 

  this.contentView.$el.on('scroll', _.bind(this.onContentScroll, this));

  // Resource references
  this.$el.on('click', '.annotation.figure_reference', _.bind(this.toggleFigureReference, this));
  this.$el.on('click', '.annotation.citation_reference', _.bind(this.toggleCitationReference, this));
  this.$el.on('click', '.annotation.person_reference', _.bind(this.togglePersonReference, this));
  this.$el.on('click', '.annotation.cross_reference', _.bind(this.followCrossReference, this));

  this.outline.$el.on('click', '.node', _.bind(this._jumpToNode, this));

};


ReaderView.Prototype = function() {

  // Toggles on and off the zoom
  // --------
  // 

  this.toggleFullscreen = function(resourceId) {
    var state = this.readerCtrl.state;

    // Always activate the resource
    this.readerCtrl.modifyState({
      resource: resourceId,
      fullscreen: !state.fullscreen
    });

    // this.$('#'+resourceId)
  };

  this._jumpToNode = function(e) {
    var nodeId = $(e.currentTarget).attr('id').replace("outline_", "");
    this.jumpToNode(nodeId);
    return false;
  };

  // Toggle Resource Reference
  // --------
  //

  this.toggleFigureReference = function(e) {
    this.toggleResourceReference('figures', e);
  };

  this.toggleCitationReference = function(e) {
    this.toggleResourceReference('citations', e);
  };

  this.togglePersonReference = function(e) {
    this.toggleResourceReference('info', e);
  };

  this.toggleResourceReference = function(context, e) {
    var state = this.readerCtrl.state;
    var aid = $(e.currentTarget).attr('id');
    var a = this.readerCtrl.__document.get(aid);

    var nodeId = this.readerCtrl.content.container.getRoot(a.path[0]);

    var resourceId = a.target;

    if (resourceId === state.resource) {
      this.readerCtrl.modifyState({
        context: this.readerCtrl.currentContext,
        node: null,
        resource:  null
      });
    } else {
      this.readerCtrl.modifyState({
        context: context,
        node: nodeId,
        resource: resourceId
      });

      this.jumpToResource(resourceId);
    }
  };

  // Follow cross reference
  // --------
  //

  this.followCrossReference = function(e) {
    var aid = $(e.currentTarget).attr('id');
    var a = this.readerCtrl.__document.get(aid);
    this.jumpToNode(a.target);
  };


  // Toggle on-off a resource
  // --------
  //

  this.onContentScroll = function() {
    var scrollTop = this.contentView.$el.scrollTop();
    this.outline.updateVisibleArea(scrollTop);
    this.markActiveHeading(scrollTop);
  };


  // Clear selection
  // --------
  //

  this.markActiveHeading = function(scrollTop) {
    var contentHeight = $('.nodes').height();

    // No headings?
    if (this.tocView.headings.length === 0) return;

    // Use first heading as default
    var activeNode = _.first(this.tocView.headings).id;

    this.contentView.$('.content-node.heading').each(function() {
      if (scrollTop >= $(this).position().top + CORRECTION) {
        activeNode = this.id;
      }
    });

    // Edge case: select last item (once we reach the end of the doc)
    if (scrollTop + this.contentView.$el.height() >= contentHeight) {
      activeNode = _.last(this.tocView.headings).id;
    }
    this.tocView.setActiveNode(activeNode);
  };

  // Toggle on-off a resource
  // --------
  //

  this.toggleResource = function(id) {
    var state = this.readerCtrl.state;
    var node = state.node;
    // Toggle off if already on
    if (state.resource === id) {
      id = null;
      node = null;
    }

    this.readerCtrl.modifyState({
      fullscreen: false,
      resource: id,
      node: node
    });
  };

  // Jump to the given node id
  // --------
  //

  this.jumpToNode = function(nodeId) {
    var $n = $('#'+nodeId);
    if ($n.length > 0) {
      var topOffset = $n.position().top+CORRECTION;
      this.contentView.$el.scrollTop(topOffset);
    }
  };

  // Jump to the given resource id
  // --------
  //

  this.jumpToResource = function(nodeId) {
    var $n = $('#'+nodeId);
    if ($n.length > 0) {
      var topOffset = $n.position().top;

      // TODO: Brute force for now
      // Make sure to find out which resource view is currently active
      if (this.figuresView) this.figuresView.$el.scrollTop(topOffset);
      if (this.citationsView) this.citationsView.$el.scrollTop(topOffset);
      if (this.infoView) this.infoView.$el.scrollTop(topOffset);
    }
  };


  // Toggle on-off node focus
  // --------
  //

  this.toggleNode = function(context, nodeId) {
    var state = this.readerCtrl.state;

    if (state.node === nodeId && state.context === context) {
      // Toggle off -> reset, preserve the context
      this.readerCtrl.modifyState({
        context: this.readerCtrl.currentContext,
        node: null,
        resource: null
      });
    } else {
      this.readerCtrl.modifyState({
        context: context,
        node: nodeId,
        resource: null
      });
    }
  };

  // Explicit context switch
  // --------
  //

  this.switchContext = function(context) {
    this.readerCtrl.switchContext(context);
  };

  // Update Reader State
  // --------
  // 

  this.updateState = function(options) {
    options = options || {};
    var state = this.readerCtrl.state;
    var that = this;

    // Set context on the reader view
    // -------

    this.$el.removeClass('toc figures citations info');
    this.contentView.$('.content-node.active').removeClass('active');
    this.$el.addClass(state.context);
  
    if (state.node) {
      this.contentView.$('#'+state.node).addClass('active');
    }

    // According to the current context show active resource panel
    // -------
    this.updateResource();
  };


  // Based on the current application state, highlight the current resource
  // -------
  // 
  // Triggered by updateState

  this.updateResource = function() {
    var state = this.readerCtrl.state;
    this.$('.resources .content-node.active').removeClass('active fullscreen');
    this.contentView.$('.annotation.active').removeClass('active');
    
    if (state.resource) {
      // Show selected resource
      var $res = this.$('#'+state.resource);
      $res.addClass('active');
      if (state.fullscreen) $res.addClass('fullscreen');

      // Mark all annotations that reference the resource
      var annotations = this.resources.get(state.resource);
      
      _.each(annotations, function(a) {
        this.contentView.$('#'+a.id).addClass('active');
      }, this);

      // Update outline
    } else {
      // Hide all resources
    }

    this.updateOutline();
  };

  // Whenever the app state changes
  // --------
  // 
  // Triggered by updateResource.

  this.updateOutline = function() {
    var that = this;

    var state = this.readerCtrl.state;
    var container = this.readerCtrl.content.container;

    // Find all annotations
    // TODO: this is supposed to be slow -> optimize
    var annotations = _.filter(this.readerCtrl.content.getAnnotations(), function(a) {
      return a.target && a.target === state.resource;
    }, this);

    var nodes = _.uniq(_.map(annotations, function(a) {
      var nodeId = container.getRoot(a.path[0]);
      return nodeId;
    }));

    that.outline.update({
      context: state.context,
      selectedNode: state.node,
      highlightedNodes: nodes
    });
  };

  // Annotate current selection
  // --------
  //

  this.annotate = function(type) {
    this.readerCtrl.content.annotate(type);
    return false;
  };

  // Rendering
  // --------
  //

  this.render = function() {
    var that = this;

    var state = this.readerCtrl.state;
    this.el.appendChild(new Renderer(this));

    // After rendering make reader reflect the app state
    this.$('.document').append(that.outline.el);

    // Await next UI tick to update layout and outline
    _.delay(function() {
      // Render outline that sticks on this.surface
      that.updateLayout();
      that.updateState();
      MathJax.Hub.Queue(["Typeset",MathJax.Hub]);
    }, 1);

    // Wait for stuff to be rendered (e.g. formulas)
    // TODO: use a handler? MathJax.Hub.Queue(fn) does not work for some reason

    _.delay(function() {
      that.updateOutline();
    }, 2000);

    var lazyOutline = _.debounce(function() {
      that.updateLayout();
      that.updateOutline();
    }, 1);

    // Jump marks for teh win
    if (state.node) {
      _.delay(function() {
        that.jumpToNode(state.node);
        if (state.resource) {
          that.jumpToResource(state.resource);
        }
      }, 100);
    }

    $(window).resize(lazyOutline);
    
    return this;
  };

  // Recompute Layout properties
  // --------
  // 
  // This fixes some issues that can't be dealth with CSS

  this.updateLayout = function() {
    // var docWidth = this.$('.document').width();
    // 15 = margin for arrows, 42 ?? WTF
    // this.contentView.$('.nodes > .content-node').css('width', docWidth - 15 - 42);
  },

  // Free the memory.
  // --------
  //

  this.dispose = function() {
    this.contentView.dispose();
    if (this.figuresView) this.figuresView.dispose();
    if (this.citationsView) this.citationsView.dispose();
    if (this.infoView) this.infoView.dispose();
    this.stopListening();
  };
};

ReaderView.Prototype.prototype = View.prototype;
ReaderView.prototype = new ReaderView.Prototype();
ReaderView.prototype.constructor = ReaderView;

module.exports = ReaderView;

},{"lens-outline":56,"substance-application":61,"substance-data":94,"substance-surface":196,"substance-toc":205,"substance-util":207,"underscore":212}],61:[function(require,module,exports){
"use strict";

var Application = require("./src/application");
Application.View = require("./src/view");
Application.Router = require("./src/router");
Application.Controller = require("./src/controller");
Application.ElementRenderer = require("./src/renderers/element_renderer");
Application.$$ = Application.ElementRenderer.$$;

module.exports = Application;

},{"./src/application":62,"./src/controller":63,"./src/renderers/element_renderer":64,"./src/router":65,"./src/view":66}],62:[function(require,module,exports){
"use strict";

var View = require("./view");
var Router = require("./router");
var util = require("substance-util");
var _ = require("underscore");

// Substance.Application
// ==========================================================================
//
// Application abstraction suggesting strict MVC

var Application = function(config) {
  View.call(this);
  this.config = config;
};

Application.Prototype = function() {
  
  // Init router
  // ----------

  this.initRouter = function() {
    this.router = new Router();

    _.each(this.config.routes, function(route) {
      this.router.route(route.route, route.name, _.bind(this.controller[route.command], this.controller));
    }, this);

    Router.history.start();
  };

  // Start Application
  // ----------
  //

  this.start = function() {
    // First setup the top level view
    this.$el = $('body');
    this.el = this.$el[0];
    this.render();

    // Now the normal app lifecycle can begin
    // Because app state changes require the main view to be present
    // Triggers an initial app state change according to url hash fragment
    this.initRouter();
  };
};

// Setup prototype chain

Application.Prototype.prototype = View.prototype;
Application.prototype = new Application.Prototype();

module.exports = Application;

},{"./router":65,"./view":66,"substance-util":207,"underscore":212}],63:[function(require,module,exports){
"use strict";

var util = require("substance-util");
var _ = require("underscore");

// Substance.Application.Controller
// ==========================================================================
//
// Application Controller abstraction suggesting strict MVC

var Controller = function(options) {
  this.state = {};
  this.context = null;
};

Controller.Prototype = function() {

  // Finalize state transition
  // -----------------
  //
  // Editor View listens on state-changed events:
  //
  // Maybe this should updateContext, so it can't be confused with the app state
  // which might be more than just the current context
  // 

  this.updateState = function(context, state) {
    console.error('updateState is deprecated, use modifyState. State is now a rich object where context replaces the old state variable');
    var oldContext = this.context;
    this.context = context;
    this.state = state;
    this.trigger('state-changed', this.context, oldContext, state);
  };

  // Inrementally updates the controller state
  // -----------------
  //

  this.modifyState = function(state) {
    var prevContext = this.state.context;
    _.extend(this.state, state);

    if (state.context && state.context !== prevContext) {
      this.trigger('context-changed', state.context);
    }
    
    this.trigger('state-changed', this.state.context);
  };
};


// Setup prototype chain
Controller.Prototype.prototype = util.Events;
Controller.prototype = new Controller.Prototype();

module.exports = Controller;
},{"substance-util":207,"underscore":212}],64:[function(require,module,exports){
"use strict";

var util = require("substance-util");
var SRegExp = require("substance-regexp");

// Substance.Application.ElementRenderer
// ==========================================================================
//
// This is just a simple helper that allows us to create DOM elements
// in a data-driven way

var ElementRenderer = function(attributes) {
  this.attributes = attributes;

  // Pull off preserved properties from attributes
  // --------

  this.tagName = attributes.tag;  
  this.children = attributes.children || [];
  this.text = attributes.text || "";
  this.html = attributes.html;
  
  delete attributes.children;
  delete attributes.text;
  delete attributes.html;
  delete attributes.tag;

  return this.render();
};


ElementRenderer.Prototype = function() {

  // Do the actual rendering
  // --------

  this.render = function() {
    var el = document.createElement(this.tagName);
    if (this.html) {
      el.innerHTML = this.html;
    } else {
      el.textContent = this.text;  
    }

    // Set attributes based on element spec
    for(var attrName in this.attributes) {
      var val = this.attributes[attrName];
      el.setAttribute(attrName, val);
    }

    // Append childs
    for (var i=0; i<this.children.length; i++) {
      var child = this.children[i];
      el.appendChild(child);
    }

    // Remember element
    // Probably we should ditch this
    this.el = el;
    return el;
  };
};


// Provides a shortcut syntax interface to ElementRenderer
// --------

var $$ = function(descriptor, options) {
  var options = options  || {};

  // Extract tagName, defaults to 'div'
  var tagName = /^([a-zA-Z0-9]*)/.exec(descriptor);
  options.tag = tagName && tagName[1] ? tagName[1] : 'div';

  // Any occurence of #some_chars
  var id = /#([a-zA-Z0-9_]*)/.exec(descriptor);
  if (id && id[1]) options.id = id[1];

  // Any occurence of .some-chars
  // if (!options.class) {
  //   var re = new RegExp(/\.([a-zA-Z0-9_-]*)/g);
  //   var classes = [];
  //   var classMatch;
  //   while (classMatch = re.exec(descriptor)) {
  //     classes.push(classMatch[1]);
  //   }
  //   options.class = classes.join(' ');
  // }

  // Any occurence of .some-chars
  var matchClasses = new SRegExp(/\.([a-zA-Z0-9_-]*)/g);
  // options.class = options.class ? options.class+' ' : '';
  if (!options.class) {
    options.class = matchClasses.match(descriptor).map(function(m) {
      return m.match[1];
    }).join(' ');
  }
  
  return new ElementRenderer(options);
};



ElementRenderer.$$ = $$;

// Setup prototype chain
ElementRenderer.Prototype.prototype = util.Events;
ElementRenderer.prototype = new ElementRenderer.Prototype();

module.exports = ElementRenderer;
},{"substance-regexp":186,"substance-util":207}],65:[function(require,module,exports){
"use strict";

var util = require("substance-util");
var _ = require("underscore");

// Application.Router
// ---------------
//
// Implementation borrowed from Backbone.js

// Routers map faux-URLs to actions, and fire events when routes are
// matched. Creating a new one sets its `routes` hash, if not set statically.
var Router = function(options) {
  options || (options = {});
  if (options.routes) this.routes = options.routes;
  this._bindRoutes();
  this.initialize.apply(this, arguments);
};

// Cached regular expressions for matching named param parts and splatted
// parts of route strings.
var optionalParam = /\((.*?)\)/g;
var namedParam    = /(\(\?)?:\w+/g;
var splatParam    = /\*\w+/g;
var escapeRegExp  = /[\-{}\[\]+?.,\\\^$|#\s]/g;

// Set up all inheritable **Application.Router** properties and methods.
_.extend(Router.prototype, util.Events, {

  // Initialize is an empty function by default. Override it with your own
  // initialization logic.
  initialize: function(){},

  // Manually bind a single named route to a callback. For example:
  //
  //     this.route('search/:query/p:num', 'search', function(query, num) {
  //       ...
  //     });
  //
  route: function(route, name, callback) {
    if (!_.isRegExp(route)) route = this._routeToRegExp(route);
    if (_.isFunction(name)) {
      callback = name;
      name = '';
    }
    if (!callback) callback = this[name];
    var router = this;
    Router.history.route(route, function(fragment) {
      var args = router._extractParameters(route, fragment);
      callback && callback.apply(router, args);
      router.trigger.apply(router, ['route:' + name].concat(args));
      router.trigger('route', name, args);
      Router.history.trigger('route', router, name, args);
    });
    return this;
  },

  // Simple proxy to `Router.history` to save a fragment into the history.
  navigate: function(fragment, options) {
    Router.history.navigate(fragment, options);
    return this;
  },

  // Bind all defined routes to `Router.history`. We have to reverse the
  // order of the routes here to support behavior where the most general
  // routes can be defined at the bottom of the route map.
  _bindRoutes: function() {
    if (!this.routes) return;
    this.routes = _.result(this, 'routes');
    var route, routes = _.keys(this.routes);
    while ((route = routes.pop()) != null) {
      this.route(route, this.routes[route]);
    }
  },

  // Convert a route string into a regular expression, suitable for matching
  // against the current location hash.
  _routeToRegExp: function(route) {
    route = route.replace(escapeRegExp, '\\$&')
                 .replace(optionalParam, '(?:$1)?')
                 .replace(namedParam, function(match, optional){
                   return optional ? match : '([^\/]+)';
                 })
                 .replace(splatParam, '(.*?)');
    return new RegExp('^' + route + '$');
  },

  // Given a route, and a URL fragment that it matches, return the array of
  // extracted decoded parameters. Empty or unmatched parameters will be
  // treated as `null` to normalize cross-browser behavior.
  _extractParameters: function(route, fragment) {
    var params = route.exec(fragment).slice(1);
    return _.map(params, function(param) {
      return param ? decodeURIComponent(param) : null;
    });
  }
});




// Router.History
// ----------------

// Handles cross-browser history management, based on either
// [pushState](http://diveintohtml5.info/history.html) and real URLs, or
// [onhashchange](https://developer.mozilla.org/en-US/docs/DOM/window.onhashchange)
// and URL fragments. If the browser supports neither (old IE, natch),
// falls back to polling.
var History = Router.History = function() {
  this.handlers = [];
  _.bindAll(this, 'checkUrl');

  // Ensure that `History` can be used outside of the browser.
  if (typeof window !== 'undefined') {
    this.location = window.location;
    this.history = window.history;
  }
};

// Cached regex for stripping a leading hash/slash and trailing space.
var routeStripper = /^[#\/]|\s+$/g;

// Cached regex for stripping leading and trailing slashes.
var rootStripper = /^\/+|\/+$/g;

// Cached regex for detecting MSIE.
var isExplorer = /msie [\w.]+/;

// Cached regex for removing a trailing slash.
var trailingSlash = /\/$/;

// Has the history handling already been started?
History.started = false;

// Set up all inheritable **Router.History** properties and methods.
_.extend(History.prototype, util.Events, {

  // The default interval to poll for hash changes, if necessary, is
  // twenty times a second.
  interval: 50,

  // Gets the true hash value. Cannot use location.hash directly due to bug
  // in Firefox where location.hash will always be decoded.
  getHash: function(window) {
    var match = (window || this).location.href.match(/#(.*)$/);
    return match ? match[1] : '';
  },

  // Get the cross-browser normalized URL fragment, either from the URL,
  // the hash, or the override.
  getFragment: function(fragment, forcePushState) {
    if (fragment == null) {
      if (this._hasPushState || !this._wantsHashChange || forcePushState) {
        fragment = this.location.pathname;
        var root = this.root.replace(trailingSlash, '');
        if (!fragment.indexOf(root)) fragment = fragment.substr(root.length);
      } else {
        fragment = this.getHash();
      }
    }
    return fragment.replace(routeStripper, '');
  },

  // Start the hash change handling, returning `true` if the current URL matches
  // an existing route, and `false` otherwise.
  start: function(options) {
    if (History.started) throw new Error("Router.history has already been started");
    History.started = true;

    // Figure out the initial configuration. Do we need an iframe?
    // Is pushState desired ... is it available?
    this.options          = _.extend({}, {root: '/'}, this.options, options);
    this.root             = this.options.root;
    this._wantsHashChange = this.options.hashChange !== false;
    this._wantsPushState  = !!this.options.pushState;
    this._hasPushState    = !!(this.options.pushState && this.history && this.history.pushState);
    var fragment          = this.getFragment();
    var docMode           = document.documentMode;
    var oldIE             = (isExplorer.exec(navigator.userAgent.toLowerCase()) && (!docMode || docMode <= 7));

    // Normalize root to always include a leading and trailing slash.
    this.root = ('/' + this.root + '/').replace(rootStripper, '/');

    if (oldIE && this._wantsHashChange) {
      this.iframe = $('<iframe src="javascript:0" tabindex="-1" />').hide().appendTo('body')[0].contentWindow;
      this.navigate(fragment);
    }

    // Depending on whether we're using pushState or hashes, and whether
    // 'onhashchange' is supported, determine how we check the URL state.
    if (this._hasPushState) {
      $(window).on('popstate', this.checkUrl);
    } else if (this._wantsHashChange && ('onhashchange' in window) && !oldIE) {
      $(window).on('hashchange', this.checkUrl);
    } else if (this._wantsHashChange) {
      this._checkUrlInterval = setInterval(this.checkUrl, this.interval);
    }

    // Determine if we need to change the base url, for a pushState link
    // opened by a non-pushState browser.
    this.fragment = fragment;
    var loc = this.location;
    var atRoot = loc.pathname.replace(/[^\/]$/, '$&/') === this.root;

    // If we've started off with a route from a `pushState`-enabled browser,
    // but we're currently in a browser that doesn't support it...
    if (this._wantsHashChange && this._wantsPushState && !this._hasPushState && !atRoot) {
      this.fragment = this.getFragment(null, true);
      this.location.replace(this.root + this.location.search + '#' + this.fragment);
      // Return immediately as browser will do redirect to new url
      return true;

    // Or if we've started out with a hash-based route, but we're currently
    // in a browser where it could be `pushState`-based instead...
    } else if (this._wantsPushState && this._hasPushState && atRoot && loc.hash) {
      this.fragment = this.getHash().replace(routeStripper, '');
      this.history.replaceState({}, document.title, this.root + this.fragment + loc.search);
    }

    if (!this.options.silent) return this.loadUrl();
  },

  // Disable Router.history, perhaps temporarily. Not useful in a real app,
  // but possibly useful for unit testing Routers.
  stop: function() {
    $(window).off('popstate', this.checkUrl).off('hashchange', this.checkUrl);
    clearInterval(this._checkUrlInterval);
    History.started = false;
  },

  // Add a route to be tested when the fragment changes. Routes added later
  // may override previous routes.
  route: function(route, callback) {
    this.handlers.unshift({route: route, callback: callback});
  },

  // Checks the current URL to see if it has changed, and if it has,
  // calls `loadUrl`, normalizing across the hidden iframe.
  checkUrl: function(e) {
    var current = this.getFragment();
    if (current === this.fragment && this.iframe) {
      current = this.getFragment(this.getHash(this.iframe));
    }
    if (current === this.fragment) return false;
    if (this.iframe) this.navigate(current);
    this.loadUrl() || this.loadUrl(this.getHash());
  },

  // Attempt to load the current URL fragment. If a route succeeds with a
  // match, returns `true`. If no defined routes matches the fragment,
  // returns `false`.
  loadUrl: function(fragmentOverride) {
    var fragment = this.fragment = this.getFragment(fragmentOverride);
    var matched = _.any(this.handlers, function(handler) {
      if (handler.route.test(fragment)) {
        handler.callback(fragment);
        return true;
      }
    });
    return matched;
  },

  // Save a fragment into the hash history, or replace the URL state if the
  // 'replace' option is passed. You are responsible for properly URL-encoding
  // the fragment in advance.
  //
  // The options object can contain `trigger: true` if you wish to have the
  // route callback be fired (not usually desirable), or `replace: true`, if
  // you wish to modify the current URL without adding an entry to the history.
  navigate: function(fragment, options) {
    if (!History.started) return false;
    if (!options || options === true) options = {trigger: options};
    fragment = this.getFragment(fragment || '');
    if (this.fragment === fragment) return;
    this.fragment = fragment;
    var url = this.root + fragment;

    // If pushState is available, we use it to set the fragment as a real URL.
    if (this._hasPushState) {
      this.history[options.replace ? 'replaceState' : 'pushState']({}, document.title, url);

    // If hash changes haven't been explicitly disabled, update the hash
    // fragment to store history.
    } else if (this._wantsHashChange) {
      this._updateHash(this.location, fragment, options.replace);
      if (this.iframe && (fragment !== this.getFragment(this.getHash(this.iframe)))) {
        // Opening and closing the iframe tricks IE7 and earlier to push a
        // history entry on hash-tag change.  When replace is true, we don't
        // want this.
        if(!options.replace) this.iframe.document.open().close();
        this._updateHash(this.iframe.location, fragment, options.replace);
      }

    // If you've told us that you explicitly don't want fallback hashchange-
    // based history, then `navigate` becomes a page refresh.
    } else {
      return this.location.assign(url);
    }
    if (options.trigger) this.loadUrl(fragment);
  },

  // Update the hash location, either replacing the current entry, or adding
  // a new one to the browser history.
  _updateHash: function(location, fragment, replace) {
    if (replace) {
      var href = location.href.replace(/(javascript:|#).*$/, '');
      location.replace(href + '#' + fragment);
    } else {
      // Some browsers require that `hash` contains a leading #.
      location.hash = '#' + fragment;
    }
  }
});

Router.history = new History;


module.exports = Router;
},{"substance-util":207,"underscore":212}],66:[function(require,module,exports){
"use strict";

var util = require("substance-util");

// Substance.View
// ==========================================================================
//
// Application View abstraction, inspired by Backbone.js

var View = function(options) {
  var that = this;

  // Either use the provided element or make up a new element
  this.$el = $('<div/>');
  this.el = this.$el[0];

  this.dispatchDOMEvents();
};


View.Prototype = function() {


  // Shorthand for selecting elements within the view
  // ----------
  //

  this.$ = function(selector) {
    return this.$el.find(selector);
  };

  // Dispatching DOM events (like clicks)
  // ----------
  //

  this.dispatchDOMEvents = function() {

    var that = this;

    // showReport(foo) => ["showReport(foo)", "showReport", "foo"]
    // showReport(12) => ["showReport(12)", "showReport", "12"]
    function extractFunctionCall(str) {
      var match = /(\w+)\((.*)\)/.exec(str);
      if (!match) throw new Error("Invalid click handler '"+str+"'");

      return {
        "method": match[1],
        "args": match[2].split(',')
      };
    }

    this.$el.delegate('[sbs-click]', 'click', function(e) {
      
      // Matches things like this
      // showReport(foo) => ["showReport(foo)", "showReport", "foo"]
      // showReport(12) => ["showReport(12)", "showReport", "12"]
      var fnCall = extractFunctionCall($(e.currentTarget).attr('sbs-click'));
      
      // Event bubbles up if there is no handler
      var method = that[fnCall.method];
      if (method) { 
        method.apply(that, fnCall.args);
        return false;
      }      
    });
  };
};


View.Prototype.prototype = util.Events;
View.prototype = new View.Prototype();

module.exports = View;

},{"substance-util":207}],67:[function(require,module,exports){
"use strict";

// Import
// ========

var Test = require('substance-test');
var assert = Test.assert;
var registerTest = Test.registerTest;

var ElementRenderer = require("../src/renderers/element_renderer");
var $$ = ElementRenderer.$$;


// Test
// ========

var ElementRendererTest = function () {

  this.setup = function() {
    // this.importer = new Importer();
  };

  this.actions = [

    "Render a div with id and class attributes", function() {
      var el = new ElementRenderer({
        tag: "div",
        id: "john",
        class: "foo"
      });

      assert.isEqual('foo', el.className);
      assert.isEqual('john', el.id);
    },

    "Test nested composition of DOM elements", function() {
      var list = new ElementRenderer({
        tag: "ul",
        id: "my_list",
        children: [
          new ElementRenderer({"tag": "li", "class": "item-1", "text": "A"}),
          new ElementRenderer({"tag": "li", "text": "B"})
        ]
      });
    },

    "Test deeply nested composition of DOM elements", function() {
      var nestedList = new ElementRenderer({
        tag: "ul",
        id: "my_list",
        children: [
          new ElementRenderer({"tag": "li", "text": "A"}),
          new ElementRenderer({
            "tag": "li",
            "text": "B",
            "children": [
              new ElementRenderer({"tag": "li", "class": "item-1", "text": "B1"}),
              new ElementRenderer({"tag": "li", "text": "B2"})
            ]
          })
        ]
      });

      var itemOne = nestedList.querySelectorAll('li.item-1');
      assert.isEqual(1, itemOne.length);

      var items = nestedList.querySelectorAll('li');
      assert.isEqual(4, items.length);
    },

    "Test shortcut version", function() {
      // Shortcut version
      var el = $$('div#bar.foo');
    },

    "Test depely nested composition with short syntax", function() {

      // <ul id="my_list">
      //   <li>A</li>
      //   <li>B
      //     <ul>
      //       <li>B1</li>
      //       <li>B2</li>
      //     </ul>
      //   </li>
      //   <li>B</li>
      // </ul>

      var nestedList = $$('ul#my_list', {
        children: [
          $$('li.foo', {"text": "A"}),
          $$('li.foo', {
            "text": "B",
            "children": [
              $$('li.item-1', {text: "B1"}),
              $$('li', {text: "B2"})
            ]
          })
        ]
      });

      var fooItems = nestedList.querySelectorAll('li.foo');
      assert.isEqual(2, fooItems.length);

      var items = nestedList.querySelectorAll('li');
      assert.isEqual(4, items.length);
    },

    "Render some images", function() {
      var images = $$('#images', {
        children: [
          $$('img#img_1.cat-1', {"src": "http://foo.com/bar.jpg"}),
          $$('img#img_2.cat-1', {"src": "http://bar.at/foo.png"}),
          // alternatively
          // document.createElement('div')
        ]
      });

      console.log('IMAGES', images);

    },

    // "Render a deeply nested composition of things", function() {
    //   // 3. Deeper nested
    //   // ------

    //   var list = $$('ul#my_list', {
    //     children: [
    //       $$('li', {"text": "A"}),
    //       $$('li', {
    //         "text": "B",
    //         "children": [
    //           $$('li', {"text": "B1"}),
    //           $$('li', {"text": "B2"})
    //         ]
    //       })
    //     ]
    //   });


    // },

    // "Manipulation of an existing renderer instance", function() {
    //   // Find stuff
    //   var list = list.find('#my_list'); // returns you a DOM native NodeList

    //   // Manipulate stuff using regular DOM API
    //   cat1.appendChild($$('li', {"text": "C"}));
    // }


  ];
};

registerTest(['Substance.Application', 'Element Renderer'], new ElementRendererTest());

},{"../src/renderers/element_renderer":64,"substance-test":198}],68:[function(require,module,exports){
"use strict";

// Application Tests
// ---------------

require("./element_renderer_test");

},{"./element_renderer_test":67}],69:[function(require,module,exports){
"use strict";

var Article = require("./src/article");
Article.Renderer = require("./src/renderer");

module.exports = Article;
},{"./src/article":71,"./src/renderer":72}],70:[function(require,module,exports){
"use strict";

var _ = require("underscore");

var nodes = {};

_.each(require("substance-nodes"), function(spec, name) {
  nodes[name] = _.clone(spec);
});

module.exports = nodes;

},{"substance-nodes":132,"underscore":212}],71:[function(require,module,exports){
"use strict";

var _ = require("underscore");
var util = require("substance-util");
var Document = require("substance-document");

// Substance.Article
// -----------------

var Article = function(options) {
  options = options || {};

  // Check if format is compatible

  // Extend Schema
  // --------

  options.schema = util.deepclone(Document.schema);

  options.schema.id = "substance-article";
  options.schema.version = "0.1.0";

  // Merge in custom types
  _.each(Article.types, function(type, key) {
    options.schema.types[key] = type;
  });

  // Register annotation types
  _.each(Article.annotations, function(aType, key) {
    options.schema.types[key] = aType;
  });


  // Merge in node types
  _.each(Article.nodeTypes, function(node, key) {
    options.schema.types[key] = node.Model.type;
  });

  // Merge in custom indexes
  _.each(Article.indexes, function(index, key) {
    options.schema.indexes[key] = index;
  });

  // Call parent constructor
  // --------

  Document.call(this, options);

  this.nodeTypes = Article.nodeTypes;

  // Seed the doc
  // --------

  if (options.seed === undefined) {
    this.create({
      id: "document",
      type: "document",
      guid: options.id, // external global document id
      creator: options.creator,
      created_at: options.created_at,
      views: ["content"], // is views really needed on the instance level
      title: "",
      abstract: "",
    });

    // Create views on the doc
    _.each(Article.views, function(view) {
      this.create({
        id: view,
        "type": "view",
        nodes: []
      });
    }, this);
  }
};


Article.Prototype = function() {

  this.fromSnapshot = function(data, options) {
    return Article.fromSnapshot(data, options);
  };


};

// Factory method
// --------
//
// TODO: Ensure the snapshot doesn't get chronicled

Article.fromSnapshot = function(data, options) {
  options = options || {};
  options.seed = data;
  return new Article(options);
};


// Define available views
// --------

Article.views = ["content"];


// Register node types
// --------


Article.nodeTypes = require("../nodes");

// Define annotation types
// --------

Article.annotations = {

  "strong": {
    "parent": "annotation",
    "properties": {
    }
  },

  "emphasis": {
    "properties": {
    },
    "parent": "annotation"
  },

  "code": {
    "parent": "annotation",
    "properties": {
    }
  },

  "link": {
    "parent": "annotation",
    "properties": {
      "url": "string"
    }
  },

  "idea": {
    "parent": "annotation",
    "properties": {
    }
  },

  "error": {
    "parent": "annotation",
    "properties": {
    }
  },

  "question": {
    "parent": "annotation",
    "properties": {
    }
  },

  "person_reference": {
    "parent": "annotation",
    "properties": {
      "target": "person"
    }
  },
  "figure_reference": {
    "parent": "annotation",
    "properties": {
      "target": "figure"
    }
  },
  "citation_reference": {
    "parent": "annotation",
    "properties": {
      "target": "content"
    }
  },
  "cross_reference": {
    "parent": "annotation",
    "properties": {
      "target": "content"
    }
  },
  "formula_reference": {
    "parent": "annotation",
    "properties": {
      "target": "content"
    }
  }

};

// Custom type definitions
// --------
//
// Holds comments

Article.types = {

  // Abstarct Annotation Node
  // --------

  "annotation": {
    "properties": {
      "path": ["array", "string"], // -> e.g. ["text_1", "content"]
      "range": "object"
    }
  },

  // Document
  // --------

  "document": {
    "properties": {
      "views": ["array", "view"],
      "guid": "string",
      "creator": "string",
      "title": "string",
      "abstract": "string",
      "published_on": "date", // should be part of the main type?
      "meta": "object"
    }
  },

  // Comments
  // --------

  "comment": {
    "properties": {
      "content": "string",
      "created_at": "string", // should be date
      "creator": "string", // should be date
      "node": "node" // references either a content node or annotation
    }
  }
};

// Custom indexes
// --------
//

Article.indexes = {
  // All annotations are now indexed by node
  // "annotations": {
  //   "type": "annotation",
  //   "properties": ["node"]
  // },
  // all comments are now indexed by node association
  "comments": {
    "type": "comment",
    "properties": ["node"]
  }
};

Article.Prototype.prototype = Document.prototype;
Article.prototype = new Article.Prototype();
Article.prototype.constructor = Article;

// Add convenience accessors for builtin document attributes
Object.defineProperties(Article.prototype, {
  id: {
    get: function () {
      return this.get("document").guid;
    },
    set: function(id) {
      this.get("document").guid = id;
    }
  },
  creator: {
    get: function () {
      return this.get("document").creator;
    },
    set: function(creator) {
      this.get("document").creator = creator;
    }
  },
  created_at: {
    get: function () {
      return this.get("document").created_at;
    },
    set: function(created_at) {
      this.get("document").created_at = created_at;
    }
  },
  title: {
    get: function () {
      return this.get("document").title;
    },
    set: function(title) {
      this.get("document").title = title;
    }
  },
  abstract: {
    get: function () {
      return this.get("document").abstract;
    },
    set: function(abstract) {
      this.get("document").abstract = abstract;
    }
  },
  views: {
    get: function () {
      // Note: returing a copy to avoid inadvertent changes
      return this.get("document").views.slice(0);
    }
  },
});

module.exports = Article;

},{"../nodes":70,"substance-document":108,"substance-util":207,"underscore":212}],72:[function(require,module,exports){
var Article = require('./article');
var _ = require("underscore");

// Renders an article
// --------
//

var Renderer = function(docController, options) {
  this.docController = docController;
  // var that = this;
  this.options = options || {};

  // TODO: use reflection
  this.nodeTypes = Article.nodeTypes;

  // Collect all node views
  this.nodes = {};
};

Renderer.Prototype = function() {
  // Create a node view
  // --------
  //
  // Experimental: using a factory which creates a view for a given node type
  // As we want to be able to reuse views
  // However, as the matter is still under discussion consider the solution here only as provisional.
  // We should create views, not only elements, as we need more, e.g., event listening stuff
  // which needs to be disposed later.

  this.createView = function(node) {
    var NodeView = this.nodeTypes[node.type].View;

    if (!NodeView) {
      throw new Error('Node type "'+node.type+'" not supported');
    }

    // Note: passing the renderer to the node views
    // to allow creation of nested views
    var nodeView = new NodeView(node, this);

    // we connect the listener here to avoid to pass the document itself into the nodeView
    nodeView.listenTo(this.docController, "operation:applied", nodeView.onGraphUpdate);

    // register node view to be able to look up nested views later
    this.nodes[node.id] = nodeView;

    return nodeView;
  };

  // Render it
  // --------
  //

  this.render = function() {
    _.each(this.nodes, function(nodeView) {
      nodeView.dispose();
    });

    var frag = document.createDocumentFragment();

    var docNodes = this.docController.container.getTopLevelNodes();
    _.each(docNodes, function(n) {
      var view = this.createView(n);
      frag.appendChild(view.render().el);
      // Lets you customize the resulting DOM sticking on the el element
      // Example: Lens focus controls
      if (this.options.afterRender) this.options.afterRender(this.docController, view);
    }, this);
    
    return frag;
  };

};

Renderer.prototype = new Renderer.Prototype();

module.exports = Renderer;

},{"./article":71,"underscore":212}],73:[function(require,module,exports){
"use strict";

var Chronicle = require('./src/chronicle');

Chronicle.IndexImpl = require('./src/index_impl');
Chronicle.ChronicleImpl = require('./src/chronicle_impl');
Chronicle.DiffImpl = require('./src/diff_impl');
Chronicle.TmpIndex = require('./src/tmp_index');

Chronicle.create = Chronicle.ChronicleImpl.create;
Chronicle.Index.create = Chronicle.IndexImpl.create;
Chronicle.Diff.create = Chronicle.DiffImpl.create;

Chronicle.ArrayOperationAdapter = require('./src/array_adapter');
Chronicle.TextOperationAdapter = require('./src/text_adapter');

module.exports = Chronicle;

},{"./src/array_adapter":74,"./src/chronicle":75,"./src/chronicle_impl":76,"./src/diff_impl":77,"./src/index_impl":78,"./src/text_adapter":79,"./src/tmp_index":80}],74:[function(require,module,exports){
"use strict";

var util = require('substance-util');
var Chronicle = require('./chronicle');
var ArrayOperation = require('substance-operator').ArrayOperation;

var ArrayOperationAdapter = function(chronicle, array) {
  Chronicle.Versioned.call(this, chronicle);
  this.array = array;
};

ArrayOperationAdapter.Prototype = function() {

  var __super__ = util.prototype(this);

  this.apply = function(change) {
    ArrayOperation.fromJSON(change).apply(this.array);
  };

  this.invert = function(change) {
    return ArrayOperation.fromJSON(change).invert();
  };

  this.transform = function(a, b, options) {
    return ArrayOperation.transform(a, b, options);
  };

  this.reset = function() {
    __super__.reset.call(this);
    while(this.array.length > 0) {
      this.array.shift();
    }
  };

};

ArrayOperationAdapter.Prototype.prototype = Chronicle.Versioned.prototype;
ArrayOperationAdapter.prototype = new ArrayOperationAdapter.Prototype();

module.exports = ArrayOperationAdapter;

},{"./chronicle":75,"substance-operator":175,"substance-util":207}],75:[function(require,module,exports){
"use strict";

/*jshint unused: false*/ // deactivating this, as we define abstract interfaces here

var _ = require('underscore');
var util = require('substance-util');
var errors = util.errors;

errors.define("ChronicleError", -1);
errors.define("ChangeError", -1);

// A change recorded in the chronicle
// ========
//
// Each change has an unique id (equivalent to git SHA).
// A change can have multiple parents (merge).
//
// options:
//   - id: a custom id for the change

var Change = function(id, parent, data) {

  this.type = 'change';

  if (!id) {
    throw new errors.ChangeError("Every change needs a unique id.");
  }
  this.id = id;

  if (!parent) {
    throw new errors.ChangeError("Every change needs a parent.");
  }

  this.parent = parent;

  // Application specific data
  // --------
  //
  // This needs to contain all information to be able to apply and revert
  // a change.

  this.data = data;

  this.uuid = util.uuid;

};

Change.prototype = {

  toJSON: function() {
    return {
      type: this.type,
      id: this.id,
      parent: this.parent,
      data: this.data
    };
  }

};

Change.fromJSON = function(json) {
  if (json.type === Merge.TYPE) return new Merge(json);
  if (json.type === Transformed.TYPE) return new Transformed(json);

  return new Change(json.parent, json.data, json);
};

// a dedicated global root node
var ROOT = "ROOT";
var ROOT_NODE = new Change(ROOT, true, null);
ROOT_NODE.parent = ROOT;

// A dedicated Change for merging multiple Chronicle histories.
// ========
//
// A merge is described by a command containing a diff for each of the parents (see Index.diff()).
//
// Example: Consider two sequences of changes [c0, c11, c12] and [c0, c21, c22, c23].
//
//  A merge taking all commits of the second ('theirs') branch and
//  rejecting those of the first ('mine') would be:
//
//    merge = {
//      "c12": ["-", "c11", "c0" "+", "c21", "c22", "c23"],
//      "c23": []
//    }
//
// A manually selected merge with [c11, c21, c23] would look like:
//
//    merge = {
//      "c12": ["-", "c11", "+", "c21", "c23"],
//      "c23": ["-", "c22", "c21", "c0", "+", "c11", "c21", "c23"]
//    }
//

var Merge = function(id, main, branches) {
  Change.call(this, id, main);
  this.type = Merge.TYPE;

  if (!branches) {
    throw new errors.ChangeError("Missing branches.");
  }
  this.branches = branches;
};

Merge.Prototype = function() {

  var __super__ = util.prototype(this);

  this.toJSON = function() {
    var result = __super__.toJSON.call(this);
    result.type = Merge.TYPE;
    result.branches = this.branches;
    return result;
  };

};
Merge.Prototype.prototype = Change.prototype;
Merge.prototype = new Merge.Prototype();

Merge.TYPE =  "merge";

Merge.fromJSON = function(data) {
  if (data.type !== Merge.TYPE) throw new errors.ChangeError("Illegal data for deserializing a Merge node.");
  return new Merge(data.parent, data.branches, data);
};

// Transformed changes are those which have been
// created by transforming (rebasing) another existing change.
// For the time being, the data is persisted redundantly.
// To be able to track the original source of the change,
// this type is introduced.
var Transformed = function(id, parent, data, original) {
  Change.call(this, id, parent, data);
  this.type = Transformed.TYPE;
  this.original = original;
};

Transformed.Prototype = function() {

  var __super__ = util.prototype(this);

  this.toJSON = function() {
    var result = __super__.toJSON.call(this);
    result.type = Transformed.TYPE;
    result.original = this.original;
    return result;
  };

};

Transformed.TYPE = "transformed";

Transformed.fromJSON = function(json) {
  if (json.type !== Transformed.TYPE) throw new errors.ChangeError("Illegal data for deserializing a Transformed node.");
  return new Transformed(json.parent, json.data, json.original, json);
};


Transformed.Prototype.prototype = Change.prototype;
Transformed.prototype = new Transformed.Prototype();

// A class that describes the difference of two states by
// a sequence of changes (reverts and applies).
// =======
//
// The difference is a sequence of commands that forms a transition from
// one state to another.
//
// A diff is specified using the following syntax:
//    [- sha [shas ...]] [+ sha [shas ...]]
// where '-' preceeds a sequence reverts and '+' a sequence of applies.
// Any diff can be described in that order (reverts followed by applies)
//
// Example: Consider an index containing the following changes
//
//        , - c11 - c12
//      c0
//        ` - c21 - c22 - c23
//
// Diffs for possible transitions look like:
// "c21" -> "c23" : ["+", "c22", "c23"]
// "c12" -> "c0" :  ["-", "c11", "c0" ]
// "c21" -> "c11" : ["-", "c0", "+", "c11"]

var Diff = function() {};

Diff.prototype = {

  hasReverts: function() {
    throw new errors.SubstanceError("Not implemented.");
  },

  // Provides the changes that will be reverted
  // --------

  reverts: function() {
    throw new errors.SubstanceError("Not implemented.");
  },

  hasApplies: function() {
    throw new errors.SubstanceError("Not implemented.");
  },

  // Provides the changes that will applied
  // --------

  applies: function() {
    throw new errors.SubstanceError("Not implemented.");
  },

  // Provides the sequence of states visited by this diff.
  // --------

  sequence: function() {
    throw new errors.SubstanceError("Not implemented.");
  },

  // Provides the path from the root to the first change
  // --------
  //
  // The naming refers to a typical diff situation where
  // two branches are compared. The first branch containing the own
  // changes, the second one the others.

  mine: function() {
    throw new errors.SubstanceError("Not implemented.");
  },

  // Provides the path from the root to the second change
  // --------
  //

  theirs: function() {
    throw new errors.SubstanceError("Not implemented.");
  },

  // Provides the common root of the compared branches.
  // --------
  //

  root: function() {
    throw new errors.SubstanceError("Not implemented.");
  },

  // Provides the version this diff has to be applied on.
  // --------

  start: function() {
    throw new errors.SubstanceError("Not implemented.");
  },

  // Provides the version which is generated by applying this diff.
  // --------

  end: function() {
    throw new errors.SubstanceError("Not implemented.");
  },

  // Provides a copy that represents the inversion of this diff.
  // --------

  inverted: function() {
    throw new errors.SubstanceError("Not implemented.");
  },

};

// Creates a new diff for the given reverts and applies
// --------
// Note this factory is provided when loading index_impl.js

Diff.create = function(reverts, applies) {
  /*jshint unused: false*/
  throw new errors.SubstanceError("Not implemented.");
};


// A Chronicle contains the history of a versioned object.
// ========
//

var Chronicle = function(index, options) {
  options = options || {};

  // an instance implementing the 'Index' interface
  this.index = index;

  // the versioned object which must implement the 'Versioned' interface.
  this.versioned = null;

  // flags to control the chronicle's behaviour
  this.__mode__ = options.mode || Chronicle.DEFAULT_MODE;
};

Chronicle.Prototype = function() {

  // Records a change
  // --------
  //
  // Creates a commit and inserts it into the index at the current position.
  //
  // An application should call this after having applied the change to the model successfully.
  // The provided 'change' should contain every information that is necessary to
  // apply the change in both directions (apply and revert).
  //
  // Note: this corresponds to a 'git commit' in git.

  this.record = function(change) {
    throw new errors.SubstanceError("Not implemented.");
  };

  // Opens a specific version.
  // --------
  //
  // Brings the versioned object as well as the index to the state
  // of the given state.
  //

  this.open = function(version) {
    throw new errors.SubstanceError("Not implemented.");
  };

  // Performs an incremental transformation.
  // --------
  //
  // The given state must be a direct neighbor of the current state.
  // For convenience a sequence of consecutive states can be given.
  //
  // Call this if you already know path between two states
  // or if you want to apply or revert a single change.
  //
  // Returns the change applied by the step.
  //

  this.step = function(next) {
    throw new errors.SubstanceError("Not implemented.");
  };

  this.forward = function(toward) {
    var state = this.versioned.getState();
    if (state === toward) return;

    var children = this.index.children[state];

    if (children.length === 0) return;

    var next;

    if (children.length === 1) {
      next = children[0];
    }
    else if (toward) {
      var path = this.index.shortestPath(state, toward);
      path.shift();
      next = path.shift();
    }
    else {
      next = children[children.length-1];
    }

    if (next) {
      return this.step(next);
    } else {
      return;
    }
  };

  this.rewind = function() {
    var current = this.index.get(this.versioned.getState());
    var previous;
    if (current.id === ROOT) return null;

    previous = current.parent;
    return this.step(previous);
  };

  // Create a commit that merges a history specified by its last commit.
  // --------
  //
  // The strategy specifies how the merge should be generated.
  //
  //  'mine':   reject the changes of the other branch
  //  'theirs': reject the changes of this branch
  //  'manual': compute a merge that leads to the given sequence.
  //
  // Returns the id of the new state.
  //

  this.merge = function(state, strategy, sequence) {
    throw new errors.SubstanceError("Not implemented.");
  };

  // Making this instance the chronicler of the given Versioned instance.
  // --------
  //

  this.manage = function(versioned) {
    this.versioned = versioned;
  };

  // Marks the current version.
  // --------
  //

  this.mark = function(name) {
    this.index.setRef(name, this.versioned.getState());
  };

  // Provides the id of a previously marked version.
  // --------
  //

  this.find = function(name) {
    this.index.getRef(name);
  };

  // Get the current version.
  // --------
  //

  this.getState = function() {
    return this.versioned.getState();
  };

  // Retrieve changes.
  // --------
  //
  // If no range is given a full path is returned.

  this.getChanges = function(start, end) {
    var changes = [];
    var path = this.path(start, end);

    _.each(path, function(id) {
      changes.push(this.index.get(id));
    }, this);

    return changes;
  };

};

Chronicle.prototype = new Chronicle.Prototype();

// only allow changes that have been checked via instant apply+revert
Chronicle.PEDANTIC_RECORD = 1 << 1;

// performs a reset for all imported changes
Chronicle.PEDANTIC_IMPORT = 1 << 2;

Chronicle.HYSTERICAL = Chronicle.PEDANTIC_RECORD | Chronicle.PEDANTIC_IMPORT;
Chronicle.DEFAULT_MODE = Chronicle.PEDANTIC_IMPORT;

// The factory method to create a Chronicle instance
// --------
// options:
//  store: a Substance Store used to persist the index
Chronicle.create = function(options) {
  throw new errors.SubstanceError("Not implemented.");
};

// A directed acyclic graph of Commit instances.
// ========
//
var Index = function() {
  this.__id__ = util.uuid();

  this.changes = {};
  this.refs = {};
  this.children = {};
  this.changes[ROOT] = ROOT_NODE;
  this.children[ROOT] = [];
};

Index.Prototype = function() {

  // Adds a change to the index.
  // --------
  // All parents must be registered first, otherwise throws an error.
  //

  this.add = function(change) {
    throw new errors.SubstanceError("Not implemented.");
  };

  // Removes a change from the index
  // --------
  // All children must be removed first, otherwise throws an error.
  //

  this.remove = function(id) {
    throw new errors.SubstanceError("Not implemented.");
  };

  // Checks if a given changeId has been added to the index.
  // --------
  //

  this.contains = function(changeId) {
    throw new errors.SubstanceError("Not implemented.");
  };

  // Retrieves a (shortest) path between two versions
  // --------
  //
  // If no end change is given it returns the path starting
  // from ROOT to the start change.
  // path() returns the path from ROOT to the current state.
  //

  this.path = function(start, end) {
    throw new errors.SubstanceError("Not implemented.");
  };

  // Retrieves a change by id
  // --------
  //

  this.get = function(id) {
    throw new errors.SubstanceError("Not implemented.");
  };

  // Provides all changes that are direct successors of this change.
  // --------
  //

  this.getChildren = function(id) {
    throw new errors.SubstanceError("Not implemented.");
  };

  // Lists the ids of all contained changes
  // --------
  //

  this.list = function() {
    throw new errors.SubstanceError("Not implemented.");
  };

  // Computes the difference betweend two changes
  // --------
  //
  // In contrast to `path` is a diff a special path that consists
  // of a sequence of reverts followed by a sequence of applies.
  //

  this.diff = function(start, end) {
    throw new errors.SubstanceError("Not implemented.");
  };

  // Sets a reference to look up a change via name.
  // ---------
  //

  this.setRef = function(name, id) {
    if (this.changes[id] === undefined) {
      throw new errors.ChronicleError("Unknown change: " + id);
    }
    this.refs[name] = id;
  };

  // Looks-up a change via name.
  // ---------
  //

  this.getRef = function(name) {
    return this.refs[name];
  };

  this.listRefs = function() {
    return Object.keys(this.refs);
  };

  // Imports all commits from another index
  // --------
  //
  // Note: this corresponds to a 'git fetch', which only adds commits without
  // applying any changes.
  //

  this.import = function(otherIndex) {
    throw new errors.SubstanceError("Not implemented.");
  };

};

Index.prototype = new Index.Prototype();

Index.INVALID = "INVALID";
Index.ROOT = ROOT_NODE;


Index.create = function() {
  throw new errors.SubstanceError("Not implemented.");
};

// A interface that must be implemented by objects that should be versioned.
var Versioned = function(chronicle) {
  this.chronicle = chronicle;
  this.state = ROOT;
  chronicle.manage(this);
};

Versioned.Prototype = function() {

  // Applies the given change.
  // --------
  //

  this.apply = function(change) {
    throw new errors.SubstanceError("Not implemented.");
  };

  // Reverts the given change.
  // --------
  //

  this.revert = function(change) {
    change = this.invert(change);
    this.apply(change);
  };

  // Inverts a given change
  // --------
  //

  this.invert = function(change) {
    throw new errors.SubstanceError("Not implemented.");
  };

  // Transforms two sibling changes.
  // --------
  //
  // This is the `transform` operator provided by Operational Transformation.
  //
  //       / - a            / - a - b' \
  //      o          ~ >   o             p
  //       \ - b            \ - b - a' /
  //
  // I.e., the result of applying `a - b'` must lead to the same result as
  // applying `b - a'`.
  //
  // options:
  //
  //  - check:    enables conflict checking. A MergeConflict is thrown as an error
  //              when a conflict is found during transformation.
  //  - inplace:  transforms the given instances a and b directly, without copying.
  //
  // returns: [a', b']

  this.transform = function(a, b, options) {
    throw new errors.SubstanceError("Not implemented.");
  };

  // Provides the current state.
  // --------
  //

  this.getState = function() {
    return this.state;
  };

  // Sets the state.
  // --------
  //
  // Note: this is necessary for implementing merges.
  //

  this.setState = function(state) {
    this.state = state;
  };

  // Resets the versioned object to a clean state.
  // --------
  //

  this.reset = function() {
    this.state = ROOT;
  };
};

Versioned.prototype = new Versioned.Prototype();

Chronicle.Change = Change;
Chronicle.Merge = Merge;
Chronicle.Transformed = Transformed;
Chronicle.Diff = Diff;
Chronicle.Index = Index;
Chronicle.Versioned = Versioned;
Chronicle.ROOT = ROOT;

Chronicle.mergeConflict = function(a, b) {
  var conflict = new errors.MergeConflict("Merge conflict: " + JSON.stringify(a) +" vs " + JSON.stringify(b));
  conflict.a = a;
  conflict.b = b;
  return conflict;
};

module.exports = Chronicle;

},{"substance-util":207,"underscore":212}],76:[function(require,module,exports){
"use strict";

// Imports
// ====

var _ = require('underscore');
var util = require('substance-util');
var errors = util.errors;
var Chronicle = require('./chronicle');

// Module
// ====

var ChronicleImpl = function(index, options) {
  Chronicle.call(this, index, options);
};

ChronicleImpl.Prototype = function() {

  var __private__ = new ChronicleImpl.__private__();
  var ROOT = Chronicle.Index.ROOT.id;

  this.uuid = util.uuid;
  this.internal_uuid = util.uuid;

  this.record = function(changeData) {
    // Sanity check: the change should have been applied already.
    // Reverting and applying should not fail.
    if ((this.__mode__ & Chronicle.PEDANTIC_RECORD) > 0) {
      this.versioned.revert(changeData);
      this.versioned.apply(changeData);
    }

    // 1. create a new change instance
    var head = this.versioned.getState();
    var id = this.uuid();
    var change = new Chronicle.Change(id, head, changeData);

    // 2. add change to index
    this.index.add(change);

    // 3. shift head
    this.versioned.setState(id);

    return id;
  };

  this.reset = function(id, index) {
    index = index || this.index;

    // the given id must be available
    if (!index.contains(id)) {
      throw new errors.ChronicleError("Invalid argument: unknown change "+id);
    }

    // 1. compute diff between current state and the given id
    var head = this.versioned.getState();
    var path = index.shortestPath(head, id);

    // 2. apply path
    __private__.applySequence.call(this, path, index);
  };

  this.open = this.reset;

  this.path = function(id1, id2) {
    if (!id2) {
      var path = this.index.shortestPath(ROOT, id1 || this.versioned.getState());
      path.shift();
      return path;
    } else {
      if (!id1) throw new errors.ChronicleError("Illegal argument: "+id1);
      return this.index.shortestPath(id1, id2);
    }
  };

  this.apply = function(sha) {
    if (_.isArray(sha)) {
      return __private__.applySequence.call(this, sha);
    } else {
      return __private__.applySequence.call(this, arguments);
    }
  };

  this.step = function(nextId) {
    var index = this.index;
    var originalState = this.versioned.getState();

    try {
      var current = index.get(originalState);

      // tolerate nop-transitions
      if (current.id === nextId) return null;

      var next = index.get(nextId);

      var op;
      if (current.parent === nextId) {
        op = this.versioned.invert(current.data);
      } else if (next.parent === current.id) {
        op = next.data;
      }
      else {
        throw new errors.ChronicleError("Invalid apply sequence: "+nextId+" is not parent or child of "+current.id);
      }

      this.versioned.apply(op);
      this.versioned.setState(nextId);
      return op;

    } catch(err) {
      this.reset(originalState, index);
      throw err;
    }
  };

  this.merge = function(id, strategy, options) {
    // the given id must exist
    if (!this.index.contains(id))
      throw new errors.ChronicleError("Invalid argument: unknown change "+id);

    if(arguments.length == 1) {
      strategy = "auto";
      options = {};
    }

    options = options || {};

    var head = this.versioned.getState();
    var diff = this.index.diff(head, id);

    // 1. check for simple cases

    // 1.1. don't do anything if the other merge is already merged
    if (!diff.hasApplies()) {
      return head;
    }

    // 1.2. check if the merge can be solved by simple applies (so called fast-forward)
    if (!diff.hasReverts() && !options.no_ff) {
      __private__.applyDiff.call(this, diff);
      return this.versioned.getState();
    }

    // 2. create a Merge node
    var change;

    // Strategies:

    // Mine
    if (strategy === "mine") {
      change = new Chronicle.Merge(this.uuid(), head, [head, id]);
    }

    // Theirs
    else if (strategy === "theirs") {
      change = new Chronicle.Merge(this.uuid(), id, [head, id]);
    }

    // Manual
    else if (strategy === "manual") {
      if (!options.sequence) throw new errors.ChronicleError("Invalid argument: sequence is missing for manual merge");
      var sequence = options.sequence;

      change = __private__.manualMerge.call(this, head, id, diff, sequence, options);
    }

    // Unsupported
    else {
      throw new errors.ChronicleError("Unsupported merge strategy: "+strategy);
    }

    // 2. add the change to the index
    this.index.add(change);

    // 3. reset state
    this.reset(change.id);

    return change.id;
  };


  this.import = function(otherIndex) {
    var newIds = this.index.import(otherIndex);
    // sanity check: see if all imported changes can be applied
    if ((this.__mode__ & Chronicle.PEDANTIC_IMPORT) > 0) __private__.importSanityCheck.call(this, newIds);
  };

};

ChronicleImpl.__private__ = function() {

  var __private__ = this;

  // Traversal operations
  // =======

  // a diff is a special kind of path which consists of
  // a sequence of reverts and a sequence of applies.
  this.applyDiff = function(diff, index) {

    index = index || this.index;

    if(!diff) return;

    var originalState = this.versioned.getState();

    // sanity check: don't allow to apply the diff on another change
    if (originalState !== diff.start())
      throw new errors.ChronicleError("Diff can not applied on to this state. Expected: "+diff.start()+", Actual: "+originalState);

    var err = null;
    var successfulReverts = [];
    var successfulApplies = [];
    try {
      var reverts = diff.reverts();
      var applies = diff.applies();

      var idx, id;
      // start at idx 1 as the first is the starting id
      for (idx = 0; idx < reverts.length; idx++) {
        id = reverts[idx];
        __private__.revertTo.call(this, id, index);
        successfulReverts.push(id);
      }
      for (idx = 0; idx < applies.length; idx++) {
        id = applies[idx];
        __private__.apply.call(this, id, index);
        successfulApplies.push(id);
      }
    } catch(_err) {
      err = _err;
    }

    // if the diff could not be applied, revert all changes that have been applied so far
    if (err && (successfulReverts.length > 0 || successfulApplies.length > 0)) {
      // idx shows to the change that has failed;
      var applied = Chronicle.Diff.create(diff.start(), successfulReverts, successfulApplies);
      var inverted = applied.inverted();
      try {
        __private__.applyDiff.call(this, inverted, index);
      } catch(_err) {
        // TODO: maybe we should do that always, instead of minimal rollback?
        console.log("Ohohhhh.... could not rollback partially applied diff.",
          "Without bugs and in HYSTERICAL mode this should not happen.",
          "Resetting to original state");
        this.versioned.reset();
        this.reset(originalState, index);
      }
    }

    if (err) throw err;
  };

  this.applySequence = function(seq, index) {
    index = index || this.index;

    var originalState = this.versioned.getState();

    try {
      var current = index.get(originalState);
      _.each(seq, function(id) {

        // tolerate nop-transitions
        if (current.id === id) return;

        var next = index.get(id);

        // revert
        if (current.parent === id) {
          __private__.revertTo.call(this, id, index);
        }
        // apply
        else if (next.parent === current.id) {
          __private__.apply.call(this, id, index);
        }
        else {
          throw new errors.ChronicleError("Invalid apply sequence: "+id+" is not parent or child of "+current.id);
        }
        current = next;

      }, this);
    } catch(err) {
      this.reset(originalState, index);
      throw err;
    }
  };

  // Performs a single revert step
  // --------

  this.revertTo = function(id, index) {
    index = index || this.index;

    var head = this.versioned.getState();
    var current = index.get(head);

    // sanity checks
    if (!current) throw new errors.ChangeError("Illegal state. 'head' is unknown: "+ head);
    if (current.parent !== id) throw new errors.ChangeError("Can not revert: change is not parent of current");

    // Note: Merge nodes do not have data
    if (current.data) this.versioned.revert(current.data);
    this.versioned.setState(id);
  };

  // Performs a single forward step
  // --------

  this.apply = function(id, index) {
    index = index || this.index;

    var change = index.get(id);

    // sanity check
    if (!change) throw new errors.ChangeError("Illegal argument. change is unknown: "+ id);

    if (change.data) this.versioned.apply(change.data);
    this.versioned.setState(id);
  };

  // Restructuring operations
  // =======

  // Eliminates a sequence of changes before a given change.
  // --------
  //
  // A new branch with transformed changes is created.
  //
  //      0 - a  - b  - c  - d
  //
  //    > c' = eliminate(c, [b,a])
  //
  //      0 - a  - b  - c  - d
  //      |
  //       \- c' - d'
  //
  // The sequence should be in descending order.
  //
  // Returns the id of the rebased change.
  //

  this.eliminate = function(start, del, mapping, index, selection) {
    if (!(index instanceof Chronicle.TmpIndex)) {
      throw new errors.ChronicleError("'eliminate' must be called on a TmpIndex instance");
    }

    var left = index.get(del);
    var right = index.get(start);
    var inverted, rebased;

    // attach the inversion of the first to the first node
    inverted = new Chronicle.Change(this.internal_uuid(), del, this.versioned.invert(left.data));
    index.add(inverted);

    // rebase onto the inverted change
    // Note: basicially this can fail due to broken dependencies of changes
    // However, we do not want to have any conflict management in this case
    // and fail with error instead
    rebased = __private__.rebase0.call(this, inverted.id, right.id, mapping, index, selection, true);

    // as we know that we have eliminated the effect by directly applying
    // a change and its inverse, it is ok to directly skip those two changes at all
    index.reconnect(rebased, left.parent);

    // continue with the transformed version
    right = index.get(rebased);

    return right.id;
  };

  // Performs a basic rebase operation.
  // --------
  //
  // The target and source must be siblings
  //
  //        0 - a
  //        |
  //         \- b - c
  //
  //    > b' = rebase0(a, b)
  //
  //        0 - a  - b' - c'
  //        |
  //         \- b - c
  //
  // The original changes remain.
  // A mapping is created to allow looking up rebased changes via their original ids.

  this.rebase0 = function(targetId, sourceId, mapping, index, selection, check) {
    index = index || this.index;

    var target = index.get(targetId);
    var source = index.get(sourceId);

    if (target.parent !== source.parent) {
      throw new errors.ChronicleError("Illegal arguments: principal rebase can only be applied on siblings.");
    }

    // recursively transform the sub-graph
    var queue = [[target.data, target.id, source]];

    var item;
    var a, b, b_i;
    var result = null;


    // keep merge nodes to update the mapped branches afterwards
    var merges = [];
    var idx;

    while(queue.length > 0) {
      item = queue.pop();

      a = item[0];
      targetId = item[1];
      source = item[2];
      b = source.data;

      var transformed;

      if (source instanceof Chronicle.Merge) {
        // no transformation necessary here
        // propagating the current transformation
        transformed = [a];
        // inserting the original branch ids here, which will be resolved to the transformed ids
        // afterwards, when we can be sure, that all other node have been transformed.
        b_i = new Chronicle.Merge(this.uuid(), targetId, source.branches);
        merges.push(b_i);
      } else {
        // perform the operational transformation
        // TODO: make checking configurable?
        transformed = this.versioned.transform(a, b, {check: check});

        // add a change the with the rebased/transformed operation
        var orig = (source instanceof Chronicle.Transformed) ? source.original : source.id;
        b_i = new Chronicle.Transformed(this.internal_uuid(), targetId, transformed[1], orig);

        // overwrite the mapping for the original
        mapping[orig] = b_i.id;
      }

      // record a mapping between old and new nodes
      mapping[source.id] = b_i.id;

      if (!result) result = b_i;
      index.add(b_i);

      // add children to iteration
      var children = index.getChildren(source.id);
      for (idx = 0; idx < children.length; idx++) {
        var child = index.get(children[idx]);

        // only rebase selected children if a selection is given
        if (selection) {
          var c = (child instanceof Chronicle.Transformed) ? child.original : child.id;
          if (!selection[c]) continue;
        }

        queue.unshift([transformed[0], b_i.id, child]);
      }
    }

    // resolve the transformed branch ids in all occurred merge nodes.
    for (idx = 0; idx < merges.length; idx++) {
      var m = merges[idx];
      var mapped_branches = [];
      for (var idx2 = 0; idx2 < m.branches.length; idx2++) {
        mapped_branches.push(mapping[m.branches[idx2]]);
      }
      m.branches = mapped_branches;
    }

    return result.id;
  };

  // Merge implementations
  // =======

  // Creates a branch containing only the selected changes
  // --------
  // this is part of the merge
  this.eliminateToSelection = function(branch, sequence, mapping, index) {
    var tmp_index = new Chronicle.TmpIndex(index);

    var selection = _.intersection(branch, sequence);
    if (selection.length === 0) return null;

    var eliminations = _.difference(branch, sequence).reverse();
    if (eliminations.length === 0) return mapping[selection[0]];

    var idx1 = 0, idx2 = 0;
    var idx, id, del;
    var last = null;

    while (idx1 < branch.length && idx2 < eliminations.length) {
      id = branch[branch.length-1-idx1];
      del = eliminations[idx2];

      if (id === del) {
        // update the selected change
        if (last) {
          // TODO: filter propagations to nodes that are within the selection (or resolve to)
          last = __private__.eliminate.call(this, last, id, mapping, tmp_index, mapping);
        }
        idx1++; idx2++;
      } else {
        last = id;
        idx1++;
      }
    }

    // store the transformed selected changes to the parent index
    for (idx = 0; idx < selection.length; idx++) {
      id = selection[idx];
      tmp_index.save(mapping[id]);
    }

    return mapping[selection[0]];
  };

  this.manualMerge = function(head, id, diff, sequence, options) {

      if (sequence.length === 0) {
        throw new errors.ChronicleError("Nothing selected for merge.");
      }

      // accept only those selected which are actually part of the two branches
      var tmp = _.intersection(sequence, diff.sequence());
      if (tmp.length !== sequence.length) {
        throw new errors.ChronicleError("Illegal merge selection: contains changes that are not contained in the merged branches.");
      }

      // The given sequence is constructed introducing new (hidden) changes.
      // This is done in the following way:
      // 1. Creating clean versions of the two branches by eliminating all changes that are not selected
      // 2. TODO Re-order the eliminated versions
      // 3. Zip-merge the temporary branches into the selected one

      var tmp_index = new Chronicle.TmpIndex(this.index);

      // Preparation / Elimination
      // ........

      var mine = diff.mine();
      var theirs = diff.theirs();

      var mapping = _.object(sequence, sequence);
      __private__.eliminateToSelection.call(this, mine, sequence, mapping, tmp_index);
      __private__.eliminateToSelection.call(this, theirs, sequence, mapping, tmp_index);

      // 2. Re-order?
      // TODO: implement this if desired

      // Merge
      // ........

      mine = _.intersection(mine, sequence);
      theirs = _.intersection(theirs, sequence);

      for (var idx = 0; idx < sequence.length; idx++) {
        var nextId = sequence[idx];
        var a, b;

        if(mine.length === 0 || theirs.length === 0) {
          break;
        }

        if (mine[0] === nextId) {
          mine.shift();
          a = mapping[nextId];
          b = mapping[theirs[0]];
        } else if (theirs[0] === nextId) {
          theirs.shift();
          a = mapping[nextId];
          b = mapping[mine[0]];
        } else {
          throw new errors.ChronicleError("Reordering of commmits is not supported.");
        }
        __private__.rebase0.call(this, a, b, mapping, tmp_index, null, !options.force);
      }
      var lastId = mapping[_.last(sequence)];

      // Sanity check
      // ........

      // let's do a sanity check before we save the index changes
      try {
        this.reset(lastId, tmp_index);
      } catch (err) {
        this.reset(head, tmp_index);
        throw err;
      }

      // finally we can write the newly created changes into the parent index
      for (idx=0; idx<sequence.length; idx++) {
        tmp_index.save(mapping[sequence[idx]]);
      }

      return new Chronicle.Merge(this.uuid(), lastId, [head, id]);
  };

  this.importSanityCheck = function(newIds) {
    var head = this.versioned.getState();

    // This is definitely very hysterical: we try to reach
    // every provided change by resetting to it.
    // If this is possible we are sure that every change has been applied
    // and reverted at least once.
    // This is for sure not a minimalistic approach.
    var err = null;
    var idx;
    try {
      for (idx = 0; idx < newIds.length; idx++) {
        this.reset(newIds[idx]);
      }
    } catch (_err) {
      err = _err;
      console.log(err.stack);
    }
    // rollback to original state
    this.reset(head);

    if (err) {
      // remove the changes in reverse order to meet restrictions
      newIds.reverse();
      for (idx = 0; idx < newIds.length; idx++) {
        this.index.remove(newIds[idx]);
      }
      if (err) throw new errors.ChronicleError("Import did not pass sanity check: "+err.toString());
    }
  };

};
ChronicleImpl.Prototype.prototype = Chronicle.prototype;
ChronicleImpl.prototype = new ChronicleImpl.Prototype();

ChronicleImpl.create = function(options) {
  options = options || {};
  var index = Chronicle.Index.create(options);
  return new ChronicleImpl(index, options);
};

module.exports = ChronicleImpl;

},{"./chronicle":75,"substance-util":207,"underscore":212}],77:[function(require,module,exports){
var _ = require("underscore");
var Chronicle = require("./chronicle");

var DiffImpl = function(data) {
  this.data = data;
};

DiffImpl.Prototype = function() {

  this.reverts = function() {
    return this.data[1].slice(1, this.data[0]+1);
  };

  this.applies = function() {
    return this.data[1].slice(this.data[0]+1);
  };

  this.hasReverts = function() {
    return this.data[0]>0;
  };

  this.hasApplies = function() {
    return this.data[1].length-1-this.data[0] > 0;
  };

  this.start = function() {
    return this.data[1][0];
  };

  this.end = function() {
    return _.last(this.data[1]);
  };

  this.root = function() {
    return this.data[1][this.data[0]];
  };

  this.sequence = function() {
    return this.data[1].slice(0);
  };

  this.mine = function() {
    return this.data[1].slice(0, this.data[0]).reverse();
  };

  this.theirs = function() {
    return this.applies();
  };

  this.inverted = function() {
    return new DiffImpl([this.data[1].length-1-this.data[0], this.data[1].slice(0).reverse()]);
  };

  this.toJSON = function() {
    return {
      data: this.data
    };
  };
};

DiffImpl.Prototype.prototype = Chronicle.Diff.prototype;
DiffImpl.prototype = new DiffImpl.Prototype();

DiffImpl.create = function(id, reverts, applies) {
  return new DiffImpl([reverts.length, [id].concat(reverts).concat(applies)]);
};

module.exports = DiffImpl;

},{"./chronicle":75,"underscore":212}],78:[function(require,module,exports){
"use strict";

// Imports
// ====

var _ = require('underscore');
var util = require('substance-util');
var errors = util.errors;
var Chronicle = require('./chronicle');

// Module
// ====

var IndexImpl = function() {
  Chronicle.Index.call(this);
};

IndexImpl.Prototype = function() {

  var __private__ = new IndexImpl.__private__();
  var ROOT = Chronicle.ROOT;

  this.add = function(change) {
    // making the change data read-only
    change.data = util.freeze(change.data);

    var id = change.id;

    // sanity check: parents must
    if (!change.parent) throw new errors.ChronicleError("Change does not have a parent.");

    if (!this.contains(change.parent))
      throw new errors.ChronicleError("Illegal change: parent is unknown - change=" + id + ", parent=" + change.parent);

    this.changes[id] = change;
    this.children[id] = [];

    if (!this.children[change.parent]) this.children[change.parent] = [];
    this.children[change.parent].push(id);
  };

  this.remove = function(id) {
    if (this.children[id].length > 0)
      throw new errors.ChronicleError("Can not remove: other changes depend on it.");

    var change = this.changes[id];

    delete this.changes[id];
    delete this.children[id];
    this.children[change.parent] = _.without(this.children[change.parent], id);
  };

  this.contains = function(id) {
    return !!this.changes[id];
  };

  this.get = function(id) {
    return this.changes[id];
  };

  this.list = function() {
    return _.keys(this.changes);
  };

  this.getChildren = function(id) {
    return this.children[id];
  };

  this.diff = function(start, end) {

    // takes the path from both ends to the root
    // and finds the first common change

    var path1 = __private__.getPathToRoot.call(this, start);
    var path2 = __private__.getPathToRoot.call(this, end);

    var reverts = [];
    var applies = [];

    // create a lookup table for changes contained in the second path
    var tmp = {},
        id, idx;
    for (idx=0; idx < path2.length; idx++) {
      tmp[path2[idx]] = true;
    }

    // Traverses all changes from the first path until a common change is found
    // These changes constitute the reverting part
    for (idx=0; idx < path1.length; idx++) {
      id = path1[idx];
      // The first change is not included in the revert list
      // The common root
      if(idx > 0) reverts.push(id);
      if(tmp[id]) break;
    }

    var root = id;

    // Traverses the second path to the common change
    // These changes constitute the apply part
    for (idx=0; idx < path2.length; idx++) {
      id = path2[idx];
      if (id === root || id === ROOT) break;
      // Note: we are traversing from head to root
      // the applies need to be in reverse order
      applies.unshift(id);
    }

    return Chronicle.Diff.create(start, reverts, applies);
  };

  // Computes the shortest path from start to end (without start)
  // --------
  //

  this.shortestPath = function(start, end) {

    // trivial cases
    if (start === end) return [];
    if (end === ROOT) return __private__.getPathToRoot.call(this, start).slice(1);
    if (start === ROOT) return __private__.getPathToRoot.call(this, end).reverse().slice(1);

    // performs a BFS for end.
    var visited = {};
    var queue = [[start, start]];
    var item, origin, pos, current,
        idx, id, children;

    // Note: it is important to

    while(queue.length > 0) {
      item = queue.shift();
      origin = item[0];
      pos = item[1];
      current = this.get(pos);

      if (!visited[pos]) {
        // store the origin to be able to reconstruct the path later
        visited[pos] = origin;

        if (pos === end) {
          // reconstruct the path
          var path = [];
          var tmp;
          while (pos !== start) {
            path.unshift(pos);
            tmp = visited[pos];
            visited[pos] = null;
            pos = tmp;
            if (!pos) throw new errors.SubstanceError("Illegal state: bug in implementation of Index.shortestPath.");
          }
          return path;
        }

        // TODO: we could optimize this a bit if we would check
        // if a parent or a child are the searched node and stop
        // instead of iterating .

        // adding unvisited parent
        if (!visited[current.parent]) queue.push([pos, current.parent]);

        // and all unvisited children
        children = this.getChildren(pos);

        for (idx = 0; idx < children.length; idx++) {
          id = children[idx];
          if(!visited[id]) queue.push([pos, id]);
        }
      }
    }

    throw new errors.SubstanceError("Illegal state: no path found.");
  };

  this.import = function(otherIndex) {
    // 1. index difference (only ids)
    var newIds = _.difference(otherIndex.list(), this.list());
    if (newIds.length === 0) return;

    // 2. compute correct order
    // Note: changes have to added according to their dependencies.
    // I.e., a change can only be added after all parents have been added.
    // OTOH, changes have to be removed in reverse order.
    var order = __private__.computeDependencyOrder.call(this, otherIndex, newIds);

    // now they are topologically sorted
    newIds.sort(function(a,b){ return (order[a] - order[b]); });

    // 2. add changes to the index
    for (var idx = 0; idx < newIds.length; idx++) {
      this.add(otherIndex.get(newIds[idx]));
    }

    return newIds;
  };

};

IndexImpl.__private__ = function() {

  var ROOT = Chronicle.ROOT;

  this.getPathToRoot = function(id) {
    var result = [];

    if (id === ROOT) return result;

    var current = this.get(id);
    if(!current) throw new errors.ChronicleError("Unknown change: "+id);

    var parent;
    while(true) {
      result.push(current.id);
      if(current.id === ROOT) break;

      parent = current.parent;
      current = this.get(parent);
    }

    return result;
  };

  // Import helpers
  // =======

  // computes an order on a set of changes
  // so that they can be added to the index,
  // without violating the integrity of the index at any time.
  this.computeDependencyOrder = function(other, newIds) {
    var order = {};

    function _order(id) {
      if (order[id]) return order[id];
      if (id === ROOT) return 0;

      var change = other.get(id);
      var o = _order(change.parent) + 1;
      order[id] = o;

      return o;
    }

    for (var idx = 0; idx < newIds.length; idx++) {
      _order(newIds[idx]);
    }

    return order;
  };

};

IndexImpl.Prototype.prototype = Chronicle.Index.prototype;
IndexImpl.prototype = new IndexImpl.Prototype();



// Extensions
// --------

var makePersistent = function(index, store) {

  index.store = store;
  index.__changes__ = store.hash("changes");
  index.__refs__ = store.hash("refs");

  // Initialize the index with the content loaded from the store

  // Trick: let the changes hash mimic an Index (duck-type)
  // and use Index.import
  index.__changes__.list = index.__changes__.keys;

  // Overrides
  // --------

  var __add__ = index.add;
  index.add = function(change) {
    __add__.call(this, change);
    this.__changes__.set(change.id, change);
  };

  var __remove__ = index.remove;
  index.remove = function(id) {
    __remove__.call(this, id);
    this.__changes__.delete(id);
  };

  var __setRef__ = index.setRef;
  index.setRef = function(name, id) {
    __setRef__.call(this, name, id);
    this.__refs__.set(name, id);
  };

  // Extensions
  // --------

  index.load = function() {
    this.import(this.__changes__);

    _.each(this.__refs__.keys(), function(ref) {
      this.setRef(ref, this.__refs__.get(ref));
    }, this);
  };

  // load automatically?
  index.load();
};

// Export
// ========

IndexImpl.create = function(options) {
  options = options || {};
  var index = new IndexImpl();

  if (options.store) {
    makePersistent(index, options.store);
  }

  return index;
};

module.exports = IndexImpl;

},{"./chronicle":75,"substance-util":207,"underscore":212}],79:[function(require,module,exports){
"use strict";

var util = require('substance-util');
var Chronicle = require('./chronicle');
var TextOperation = require('substance-operator').TextOperation;

var TextOperationAdapter = function(chronicle, doc) {
  Chronicle.Versioned.call(this, chronicle);
  this.doc = doc;
};

TextOperationAdapter.Prototype = function() {

  var __super__ = util.prototype(this);

  this.apply = function(change) {
    this.doc.setText(change.apply(this.doc.getText()));
  };

  this.invert = function(change) {
    return change.invert();
  };

  this.transform = function(a, b, options) {
    return TextOperation.transform(a, b, options);
  };

  this.reset = function() {
    __super__.reset.call(this);
    this.doc.setText("");
  };

};

TextOperationAdapter.Prototype.prototype = Chronicle.Versioned.prototype;
TextOperationAdapter.prototype = new TextOperationAdapter.Prototype();

module.exports = TextOperationAdapter;

},{"./chronicle":75,"substance-operator":175,"substance-util":207}],80:[function(require,module,exports){
var _ = require("underscore");
var util = require("substance-util");
var errors = util.errors;
var IndexImpl = require("./index_impl");


var TmpIndex = function(index) {
  IndexImpl.call(this);
  this.index = index;
};

TmpIndex.Prototype = function() {

  var __super__ = util.prototype(this);

  this.get = function(id) {
    if (__super__.contains.call(this, id)) {
      return __super__.get.call(this, id);
    }
    return this.index.get(id);
  };

  this.contains = function(id) {
    return __super__.contains.call(this, id) || this.index.contains(id);
  };

  this.getChildren = function(id) {
    var result = __super__.getChildren.call(this, id) || [];
    if (this.index.contains(id)) {
      result = result.concat(this.index.getChildren(id));
    }
    return result;
  };

  this.list = function() {
    return __super__.list.call(this).concat(this.index.list());
  };

  this.save = function(id, recurse) {
    if (recurse) {
      var queue = [id];
      var nextId, next;
      while(queue.length > 0) {
        nextId = queue.pop();
        next = this.changes[nextId];

        if (this.changes[nextId]) this.index.add(next);

        for (var idx=0; idx < next.children; idx++) {
          queue.unshift(next.children[idx]);
        }
      }
    } else {
      if (this.changes[id]) this.index.add(this.changes[id]);
    }
  };

  this.reconnect = function(id, newParentId) {
    if (!this.changes[id])
      throw new errors.ChronicleError("Change does not exist to this index.");

    var change = this.get(id);

    if (!this.contains(newParentId)) {
      throw new errors.ChronicleError("Illegal change: parent is unknown parent=" + newParentId);
    }

    if (!this.children[change.parent]) this.children[change.parent] = [];
    this.children[change.parent] = _.without(this.children[change.parent], change.id);

    change.parent = newParentId;

    if (!this.children[change.parent]) this.children[change.parent] = [];
    this.children[change.parent].push(id);
  };
};
TmpIndex.Prototype.prototype = IndexImpl.prototype;
TmpIndex.prototype = new TmpIndex.Prototype();

module.exports = TmpIndex;

},{"./index_impl":78,"substance-util":207,"underscore":212}],81:[function(require,module,exports){
"use strict";


// Import
// ========

var _ = require('underscore');
var util = require('substance-util');
var errors = util.errors;
var Test = require('substance-test');
var assert = Test.assert;
var registerTest = Test.registerTest;
var Chronicle = require('../index');
var ChronicleTest = require("./chronicle_test");


// Test
// ========

var ROOT = Chronicle.ROOT;

// Index structure:
//
// ROOT - 01 - 02 - 03 - 04
//    |              |
//    |                - 05 - 06
//      - 07 - 08

var C1 = new Chronicle.Change("01", ROOT, "bla");
var OP = function(op, val, id, parent) {
  var data = { op: op, val: val };
  return new Chronicle.Change(id, parent, data);
};
var PLUS = function(id, parents) {
  return OP("plus", 1, id, parents);
};

var Basics = function() {
  ChronicleTest.call(this);

  // deactivate the default fixture
  // for testing basic behavior
  this.default_fixture = this.fixture;

  this.fixture = function() {};

  this.actions = [

    "Index: add", function() {
      this.index.add(C1);
      assert.isTrue(this.index.contains(C1.id));

      // should reject
      assert.exception(errors.ChronicleError, function() {
        this.index.add(PLUS("bla", "doesnotexist"));
      }, this);
    },

    "Index: get", function() {
      var c = this.index.get(C1.id);
      assert.isEqual(C1.id, c.id);
      assert.isEqual(C1.data, c.data);
    },

    "Index: list", function() {
      assert.isArrayEqual([ROOT, C1.id], this.index.list());
    },

    "Every Ref should reference an existing change", function() {
      assert.exception(errors.ChronicleError, function() {
        this.index.setRef("FAIL", "balla");
      }, this);
    },

    "Record", function() {
      var id = this.next_uuid();
      this.chronicle.record({op: "plus", val: 1});
      assert.isTrue(this.index.contains(id));
    },

    "Should not record failing changes", function() {
      var id = this.next_uuid();
      assert.exception(function() {
        // this fails due to division by 0
        this.chronicle.record({op: "div", val: 0});
      }, this);
      assert.isFalse(this.index.contains(id));
    },

    "Import", function() {
      var other = Chronicle.Index.create();
      other.add(PLUS("1", ROOT));
      other.add(PLUS("2", "1"));
      other.add(PLUS("3", "2"));
      other.add(PLUS("4", ROOT));
      this.chronicle.import(other);

      for (var idx=1; idx<5; idx++) {
        assert.isTrue(this.index.contains(""+idx));
      }
    },

    "Reject Imports with Failing changes", function() {
      this.setup();

      var other = Chronicle.Index.create();
      other.add(PLUS("1", ROOT));
      other.add(OP("div", 0, "2", "1"));
      other.add(PLUS("3", "2"));

      assert.exception(errors.ChronicleError, function() {
        this.chronicle.import(other);
      }, this);
    },

    "Load default fixture", function() {
      this.setup();
      this.default_fixture();
    },

    "Reset", function() {
      this.comp.reset();

      var seq = ["07", "05", "04", ROOT, "06", "08", "03", "01", "02"];
      _.each(seq, function(id) {
        this.chronicle.open(id);
        assert.isEqual(this.RESULTS[id], this.comp.result);
        assert.isEqual(id, this.comp.getState());
      }, this);
    },

    "Transition: simple forward", function() {

      this.chronicle.open(ROOT);
      this.chronicle.apply("01", "02", "03");
      assert.isEqual("03", this.comp.getState());
      assert.isEqual(this.RESULTS["03"], this.comp.result);

    },

    "Transition: simple revert", function() {

      this.chronicle.open("02");
      this.chronicle.apply("01");
      assert.isEqual("01", this.comp.getState());
      assert.isEqual(this.RESULTS["01"], this.comp.result);

    },

    "Transition: revert and apply", function() {

      this.chronicle.open("04");
      this.chronicle.apply("03", "05");
      assert.isEqual("05", this.comp.getState());
      assert.isEqual(this.RESULTS["05"], this.comp.result);

    },

    "Transition: across ROOT", function() {

      this.chronicle.open("01");
      this.chronicle.apply(ROOT, "07");
      assert.isEqual("07", this.comp.getState());
      assert.isEqual(this.RESULTS["07"], this.comp.result);

    },

    // TODO: add some smoke tests to check robustness against wrong usage

  ];
};
Basics.prototype = ChronicleTest.prototype;

registerTest(['Substance.Chronicle', 'Basics'], new Basics());

},{"../index":73,"./chronicle_test":87,"substance-test":198,"substance-util":207,"underscore":212}],82:[function(require,module,exports){
"use strict";

// Import
// ========

var Test = require('substance-test');
var assert = Test.assert;
var registerTest = Test.registerTest;
var Chronicle = require('../index');
var ChronicleTest = require("./chronicle_test");


// Test
// ========

var ROOT = Chronicle.Index.ROOT.id;

var Diff = function() {

  ChronicleTest.call(this);

  this.actions = [

    "Diff (01 -> 02)", function() {
      // only applies
      var start = "01", end = "02";

      var diff = this.index.diff(start, end);
      var sp = this.index.shortestPath(start, end);

      assert.isArrayEqual([start, end], diff.sequence());
      assert.isEqual(0, diff.reverts().length);
      assert.isArrayEqual([end], diff.applies());
      assert.isArrayEqual(diff.sequence().slice(1), sp);
    },

    "Diff (02 -> 01)", function() {
      // only reverts
      var start = "02", end = "01";

      var diff = this.index.diff(start, end);
      var sp = this.index.shortestPath(start, end);

      assert.isArrayEqual([start, end], diff.sequence());
      assert.isEqual(0, diff.applies().length);
      assert.isArrayEqual([end], diff.reverts());
      assert.isArrayEqual(diff.sequence().slice(1), sp);
    },

    "Diff to ROOT (01 -> ROOT)", function() {

      var start = "01", end = "ROOT";

      var diff = this.index.diff("01", ROOT);
      var sp = this.index.shortestPath(start, end);

      assert.isArrayEqual([start, end], diff.sequence());
      assert.isEqual(0, diff.applies().length);
      assert.isArrayEqual([end], diff.reverts());
      assert.isArrayEqual(diff.sequence().slice(1), sp);
    },

    "Diff from ROOT (ROOT -> 08)", function() {

      var start = "ROOT", end = "08";

      var diff = this.index.diff(start, end);
      var sp = this.index.shortestPath(start, end);

      assert.isArrayEqual([ROOT, "07", "08"], diff.sequence());
      assert.isArrayEqual([], diff.reverts());
      assert.isArrayEqual(["07", "08"], diff.applies());
      assert.isArrayEqual(diff.sequence().slice(1), sp);

    },

    "No Diff (02 -> 02)", function() {
      var start = "02", end = "02";
      var diff = this.index.diff(start, end);
      var sp = this.index.shortestPath(start, end);

      assert.isArrayEqual(["02"], diff.sequence());
      assert.isArrayEqual([], diff.reverts());
      assert.isArrayEqual([], diff.applies());
      assert.isArrayEqual(diff.sequence().slice(1), sp);
    },

    "Diff with reverts and applies (04 -> 05)", function() {
      // mixed: 04 -> 03 -> 05
      var start = "04", end = "05";
      var diff = this.index.diff(start, end);
      var sp = this.index.shortestPath(start, end);

      assert.isArrayEqual(["04", "03", "05"], diff.sequence());
      assert.isArrayEqual(["03"], diff.reverts());
      assert.isArrayEqual(["05"], diff.applies());
      assert.isArrayEqual(diff.sequence().slice(1), sp);
    },

    "Diff across ROOT (07 -> 01)", function() {

      var start = "07", end = "01";
      var diff = this.index.diff(start, end);
      var sp = this.index.shortestPath(start, end);

      assert.isArrayEqual(["07", ROOT, "01"], diff.sequence());
      assert.isArrayEqual([ROOT], diff.reverts());
      assert.isArrayEqual(["01"], diff.applies());
      assert.isArrayEqual(diff.sequence().slice(1), sp);
    }
  ];
};
Diff.prototype = ChronicleTest.prototype;

registerTest(['Substance.Chronicle', 'Diff'], new Diff());

},{"../index":73,"./chronicle_test":87,"substance-test":198}],83:[function(require,module,exports){
"use strict";

// Import
// ========

var Test = require('substance-test');
var assert = Test.assert;
var registerTest = Test.registerTest;
var Chronicle = require('../index');
var ChronicleTest = require("./chronicle_test");


// Test
// ========

var ROOT = Chronicle.Index.ROOT.id;

// Index structure:
//
// ROOT - 01 - 02 - 03 - 04
//    |              |
//    |                - 05 - 06
//      - 07 - 08

// 01: + 5
// 02: - 3
// 03: * 3
// 04: / 2
// 05: + 1
// 06: + 2
// 07: - 1
// 08: - 2

var Merge = function() {

  ChronicleTest.call(this);

  this.actions = [

    "Merge 01 into 02 (nothing to be done)", function() {
      this.chronicle.open("02");
      var count = this.index.list().length;
      this.chronicle.merge("01");
      // no additional change should have been applied
      assert.isEqual(count, this.index.list().length);
    },

    "Merge 02 into 01 (fast-forward, no extra change)", function() {
      this.chronicle.open("01");
      var count = this.index.list().length;
      this.chronicle.merge("02");
      // no additional change should have been applied
      assert.isEqual(count, this.index.list().length);
      assert.isEqual("02", this.comp.getState());
    },

    "Merge 08 into 02 by rejecting theirs", function() {
      this.chronicle.open("02");
      this.M1 = this.chronicle.merge("08", "mine");
      // a new change should have been created
      assert.isTrue(this.index.contains(this.M1));
      assert.isEqual(this.M1, this.comp.getState());

      this.chronicle.open(ROOT);
      this.chronicle.open(this.M1);

      // the value should be the same as that of 02
      assert.isEqual(this.M1, this.comp.getState());
      assert.isEqual(this.RESULTS["02"], this.comp.result);
    },

    "Merge 08 into 02 by rejecting mine", function() {
      this.chronicle.open("02");
      this.M2 = this.chronicle.merge("08", "theirs");
      // a new change should have been created
      assert.isTrue(this.index.contains(this.M2));
      assert.isEqual(this.M2, this.comp.getState());

      this.chronicle.open(ROOT);
      this.chronicle.open(this.M2);

      // the value should be the same as that of 02
      assert.isEqual(this.M2, this.comp.getState());
      assert.isEqual(this.RESULTS["08"], this.comp.result);
    },

    "Traversal across merge (reverting the merge)", function() {
      this.chronicle.open(this.M1);
      for (var idx=0; idx < 2; idx++) {
        this.op(idx);
      }
      this.chronicle.open("08");
      assert.isEqual("08", this.comp.getState());
      assert.isEqual(this.RESULTS["08"], this.comp.result);
    },

    "Manual merging", function() {
      this.chronicle.open("04");
      // to compare the result apply "06" manually
      this.op(5);
      var expected = this.comp.result;

      this.chronicle.open("04");
      this.M3 = this.chronicle.merge("06", "manual", {sequence: ["04", "06"]});
      assert.isTrue(this.index.contains(this.M3));
      assert.isEqual(this.M3, this.comp.getState());

      assert.isEqual(expected, this.comp.result);
    },

    "Manual Merge - theirs after mine", function() {
      this.chronicle.open("02");
      this.M4 = this.chronicle.merge("08", "manual", {sequence: ["01", "02", "07", "08"]});
      assert.isTrue(this.index.contains(this.M4));
      assert.isEqual(-1, this.comp.result);
    },

    "Traversal across manual merge", function() {
      this.chronicle.open(this.M3);
      this.chronicle.open("05");
      assert.isEqual("05", this.comp.getState());
      assert.isEqual(this.RESULTS["05"], this.comp.result);
    },
  ];
};
Merge.prototype = ChronicleTest.prototype;

registerTest(['Substance.Chronicle', 'Merge'], new Merge());

},{"../index":73,"./chronicle_test":87,"substance-test":198}],84:[function(require,module,exports){
"use strict";

// Import
// ========

var util = require('substance-util');
var errors = util.errors;
var Test = require('substance-test');
var assert = Test.assert;
var registerTest = Test.registerTest;
var Chronicle = require('../index');
var TextOperation = require('substance-operator').TextOperation;


// Test
// ========

var TEXT1 = "Lorem amet";
var TEXT2 = "Lorem ipsum amet";
var TEXT3 = "Lorem ipsum dolor amet";
var TEXT4 = "Lorem ipsum dolor sit amet";
var TEXT5 = "Lorem sit amet";
var TEXT_M1 = "Lorem ipsum sit amet";

var OP1 = TextOperation.Insert(0, "Lorem amet");
var OP2 = TextOperation.Insert(5, " ipsum");
var OP3 = TextOperation.Insert(12, "dolor ");
var OP4 = TextOperation.Insert(18, "sit ");

var OP5_1 = TextOperation.Insert(5, " sit");
var OP5_2 = TextOperation.Insert(6, "sit ");

// Index:
//
// ROOT - 1 - 2  - 3 - 4
//        |    \
//        |      ---
//        |          \
//        |            M1
//        |          /
//        |---- 5_2
//        |
//         ---- 5_1 (fails when merged with 2)


var TestDocument;

var ChronicledTextTest = function() {

  var ID_IDX = 1;

  this.uuid = function() {
    return ""+ID_IDX++;
  };

  this.setup = function() {
    this.chronicle = Chronicle.create({mode: Chronicle.HYSTERICAL});
    this.index = this.chronicle.index;

    ID_IDX = 1;
    this.chronicle.uuid = this.uuid;

    this.document = new TestDocument(this.chronicle);
    this.fixture();
  };

  this.fixture = function() {
    this.ID1 = this.document.apply(OP1);
    this.ID2 = this.document.apply(OP2);
    this.ID3 = this.document.apply(OP3);
    this.ID4 = this.document.apply(OP4);
    this.chronicle.open(this.ID1);
    this.ID5_1 = this.document.apply(OP5_1);
    this.chronicle.open(this.ID1);
    this.ID5_2 = this.document.apply(OP5_2);
    this.chronicle.open("ROOT");
  };

  this.actions = [
    "Basic checkout", function() {
      this.chronicle.open(this.ID4);
      assert.isEqual(TEXT4, this.document.getText());

      this.chronicle.open(this.ID1);
      assert.isEqual(TEXT1, this.document.getText());

      this.chronicle.open(this.ID5_1);
      assert.isEqual(TEXT5, this.document.getText());

      this.chronicle.open(this.ID3);
      assert.isEqual(TEXT3, this.document.getText());

      this.chronicle.open(this.ID2);
      assert.isEqual(TEXT2, this.document.getText());
    },

    "Merge (simple)", function() {
      this.chronicle.open(this.ID2);
      // This should fail due to a conflict
      assert.exception(errors.MergeConflict, function() {
        this.chronicle.merge(this.ID5_1, "manual", {sequence: [this.ID2, this.ID5_1]});
      }, this);

      // This should be ok
      this.M1 = this.chronicle.merge(this.ID5_2, "manual", {sequence: [this.ID2, this.ID5_2]});
      this.chronicle.open(this.M1);
      assert.isEqual(TEXT_M1, this.document.getText());
    },

  ];

};

TestDocument = function(chronicle) {
  this.text = "";
  this.chronicle = chronicle;
  chronicle.manage(new Chronicle.TextOperationAdapter(chronicle, this));

  this.setText = function(text) {
    this.text = text;
  };

  this.getText = function() {
    return this.text;
  };

  this.apply = function(op) {
    this.text = op.apply(this.text);
    return this.chronicle.record(op);
  };

};

registerTest(['Substance.Chronicle', 'Text Operation'], new ChronicledTextTest());

},{"../index":73,"substance-operator":175,"substance-test":198,"substance-util":207}],85:[function(require,module,exports){
"use strict";

// Import
// ========

var Test = require('substance-test');
var assert = Test.assert;
var registerTest = Test.registerTest;
var Chronicle = require('../index');
var Operator = require('substance-operator');
var ArrayOperation = Operator.ArrayOperation;


// Test
// =======

// Index:
//
// ROOT - 1  -  2  -  3  -  4  -  5
//        |                 \
//        |                   M1 (1,2,6,4)
//        |---  6  ---------/

var OP_1 = ArrayOperation.Insert(0, 1);
var OP_2 = ArrayOperation.Insert(1, 3);
var OP_3 = ArrayOperation.Insert(1, 2);
var OP_4 = ArrayOperation.Move(0, 2);
var OP_5 = ArrayOperation.Delete(1, 3);
var OP_6 = ArrayOperation.Insert(1, 4);

var ARR_1 = [1];
var ARR_2 = [1,3];
var ARR_3 = [1,2,3];
var ARR_4 = [2,3,1];
var ARR_5 = [2,1];
//var ARR_6 = [1,4];

var ARR_M1 = [3,4,1];

var ChronicledArrayTest = function() {

  var ID_IDX = 1;

  this.uuid = function() {
    return ""+ID_IDX++;
  };

  this.apply = function(op) {
    this.adapter.apply(op);
    return this.chronicle.record(op);
  };

  this.fixture = function() {
    this.ID1 = this.apply(OP_1);
    this.ID2 = this.apply(OP_2);
    this.ID3 = this.apply(OP_3);
    this.ID4 = this.apply(OP_4);
    this.ID5 = this.apply(OP_5);
    this.chronicle.reset(this.ID1);
    this.ID6 = this.apply(OP_6);
    this.chronicle.reset("ROOT");
  };

  this.setup = function() {
    this.chronicle = Chronicle.create({mode: Chronicle.HYSTERICAL});
    this.index = this.chronicle.index;

    ID_IDX = 1;
    this.chronicle.uuid = this.uuid;

    this.array = [];
    this.adapter = new Chronicle.ArrayOperationAdapter(this.chronicle, this.array);

    this.fixture();
  };


  this.actions = [

    "Basic checkout", function() {
      this.chronicle.open(this.ID4);
      assert.isArrayEqual(ARR_4, this.array);

      this.chronicle.open(this.ID1);
      assert.isArrayEqual(ARR_1, this.array);

      this.chronicle.open(this.ID5);
      assert.isArrayEqual(ARR_5, this.array);

      this.chronicle.open(this.ID3);
      assert.isArrayEqual(ARR_3, this.array);

      this.chronicle.open(this.ID2);
      assert.isArrayEqual(ARR_2, this.array);
    },

    "Manual merge", function() {
      this.chronicle.open(this.ID4);
      // Note: the sequence 2 - 6 - 4
      this.ID_M1 = this.chronicle.merge(this.ID6, "manual",
        {
          sequence: [this.ID2, this.ID6, this.ID4],
          force: true
        }
      );

      this.chronicle.open("ROOT");
      this.chronicle.open(this.ID_M1);
      assert.isArrayEqual(ARR_M1, this.array);
    },

  ];

};

registerTest(['Substance.Chronicle', 'Array Operation'], new ChronicledArrayTest());

},{"../index":73,"substance-operator":175,"substance-test":198}],86:[function(require,module,exports){
"use strict";

// Import
// ========

var Test = require('substance-test');
var assert = Test.assert;
var registerTest = Test.registerTest;
var Chronicle = require('../index');
var MemoryStore = require('substance-store').MemoryStore;
var Change = Chronicle.Change;


// Test
// ========

function PersistentIndexTest() {

  this.setup = function() {
    this.store = new MemoryStore();
    this.chronicle = Chronicle.create({store: this.store});
    this.index = this.chronicle.index;
    this.changes = this.index.__changes__;
    this.refs = this.index.__refs__;
  };

  this.actions = [

    "Add should store change", function() {
      this.index.add(new Change(1, "ROOT", {val: 1}));
      this.index.add(new Change(2, 1, {val: 2}));
      this.index.add(new Change(3, 2, {val: 3}));
      this.index.add(new Change(4, 1, {val: 4}));

      var keys = this.changes.keys().slice(0);
      assert.isArrayEqual([1, 2, 3, 4], keys.sort());

      for (var idx = 1; idx <= 4; idx++) {
        var c = this.changes.get(idx);
        assert.isDeepEqual({val: idx}, c.data);
      }
    },

    "Persistent refs", function() {
      this.index.setRef("/remote/origin/master", 1);
      this.index.setRef("master:HEAD", 2);
      this.index.setRef("master:LAST", 3);
      this.index.setRef("other", 4);

      assert.isEqual(1, this.refs.get("/remote/origin/master"));
      assert.isEqual(2, this.refs.get("master:HEAD"));
      assert.isEqual(3, this.refs.get("master:LAST"));
      assert.isEqual(4, this.refs.get("other"));
    },

    "Remove change", function() {
      this.index.add(new Change(5, 1, {val: 5}));
      assert.isDefined(this.changes.get(5));
      this.index.remove(5);
      assert.isUndefined(this.changes.get(5));
    },

    "Import from store", function() {
      var index2 = Chronicle.Index.create({store: this.store});

      assert.isArrayEqual(["1","2","3","4","ROOT"], index2.list().sort());
      assert.isArrayEqual(["/remote/origin/master", "master:HEAD", "master:LAST", "other"], index2.listRefs().sort());
    },

  ];
}

registerTest(['Substance.Chronicle', 'Persistent Index'], new PersistentIndexTest());

},{"../index":73,"substance-store":188,"substance-test":198}],87:[function(require,module,exports){
"use strict";

// Import
// =========

var _ = require('underscore');
var Chronicle = require('../index');
var Calculator = require('./example');


// Test
// =========

var __ID__ = 0;
var __OP__ = 1;
var __VAL__ = 2;
var __RESULT__ = 3;

var ROOT = Chronicle.ROOT;

// Index structure:
//
// ROOT - 01 - 02 - 03 - 04
//    |              |
//    |                - 05 - 06
//      - 07 - 08

var INDEX = [
  ["01", "plus", 5, 5], // = 5
  ["02", "minus", 3, 2], // = 2
  ["03", "times", 3, 6], // = 6
  ["04", "div", 2, 3], // = 3
  ["05", "plus", 1, 7], // = 7 // applied on 03
  ["06", "plus", 2, 9], // = 9
  ["07", "minus", 1, -1], // = -1 // applied on __ROOT__
  ["08", "minus", 2, -3], // = -3
];

//function ID(i) {return INDEX[i][__ID__];}
function OP(i) {return INDEX[i][__OP__];}
function VAL(i) {return INDEX[i][__VAL__];}

var ID_IDX = 1;

var ChronicleTest = function() {

  this.RESULTS = _.reduce(INDEX, function(memo, e) {
    memo[e[__ID__]] = e[__RESULT__]; return memo;
  }, {});
  this.RESULTS[ROOT] = 0;

  function _uuid(idx) {
    return (idx < 10) ? "0"+idx : ""+idx;
  }

  this.uuid = function() {
    return _uuid(ID_IDX++);
  };

  this.next_uuid = function() {
    return _uuid(ID_IDX);
  };

  this.op = function(idx) {
    this.comp[OP(idx)](VAL(idx));
  };

  this.setup = function() {
    ID_IDX = 1;
    this.chronicle = Chronicle.create({mode: Chronicle.HYSTERICAL});
    this.index = this.chronicle.index;
    this.comp = new Calculator.ChronicleAdapter(this.chronicle);
    this.chronicle.uuid = this.uuid;

    this.fixture();
  };

  this.fixture = function() {
    // Attention: these call will automatically increment the UUIDs
    var idx;
    for (idx=0; idx < 4; idx++) {
      this.comp[OP(idx)](VAL(idx));
    }
    this.chronicle.reset("03");
    for (idx=4; idx < 6; idx++) {
      this.comp[OP(idx)](VAL(idx));
    }
    this.chronicle.reset(ROOT);
    for (idx=6; idx < 8; idx++) {
      this.comp[OP(idx)](VAL(idx));
    }
    this.comp.reset();
  };

};

// Export
// ====

module.exports = ChronicleTest;

},{"../index":73,"./example":88,"underscore":212}],88:[function(require,module,exports){
"use strict";

// Import
// =========

var _ = require('underscore');
var Chronicle = require('../index');
var util = require('substance-util');

// Module
// ====

var Calculator = function() {
  this.result = 0;
};

Calculator.prototype = {

  plus: function(val) {
    this.result += val;
  },

  minus: function(val) {
    this.result -= val;
  },

  times: function(val) {
    this.result *= val;
  },

  div: function(val) {
    if(val < 10E-8) throw new Error("Value too small.");

    this.result /= val;
  }
};

var ChronicleAdapter = function(chronicle) {
  Calculator.call(this);
  Chronicle.Versioned.call(this, chronicle);
};

ChronicleAdapter.Prototype = function() {

  var __super__ = util.prototype(this);

  var inverse = {
    plus:   "minus",
    minus:  "plus",
    times:  "div",
    div:  "times"
  };

  function adapt(name) {
    return function(val) {
      __super__[name].call(this, val);
      this.chronicle.record({
        op: name,
        val: val
      });
    };
  }

  this.plus = adapt("plus");
  this.minus = adapt("minus");
  this.div = adapt("div");

  this.times = function(val) {
    var orig = this.result;
    __super__.times.call(this, val);
    var rec = {
      op: "times",
      val: val
    };
    // to preserve invertibility we have to store the old value
    // in this case
    if(val < 10E-8) {
      rec.orig = orig;
    }
    this.chronicle.record(rec);
  };

  this.transform = function(a, b) {
    // all changes are independent
    return [a,b];
  };

  this.apply = function(change) {
    // do not call the recording version
    __super__[change.op].call(this, change.val);
  };

  // override this, as it is easier done directly
  this.revert = function(change) {
    if (change.orig) this.result = change.orig;
    else __super__[inverse[change.op]].call(this, change.val);
  };

  this.invert = function(change) {
    var inverted = {};
    inverted.op = inverse[change.op];
    if (change.orig) {
      inverted.val = change.orig;
      inverted.orig = change.val;
    } else {
      inverted.val = change.val;
    }
    return inverted;
  };

  this.reset = function() {
    __super__.reset.call(this);
    this.result = 0;
  };

};

ChronicleAdapter.Prototype.prototype = _.extend({}, Calculator.prototype, Chronicle.Versioned.prototype);
ChronicleAdapter.prototype = new ChronicleAdapter.Prototype();
Calculator.ChronicleAdapter = ChronicleAdapter;

// Export
// ====

module.exports = Calculator;

},{"../index":73,"substance-util":207,"underscore":212}],89:[function(require,module,exports){
require("./001-basics");
require("./002-diff");
require("./003-merge");
require("./004-text");
require("./005-array");
require("./006-persistent-index");

},{"./001-basics":81,"./002-diff":82,"./003-merge":83,"./004-text":84,"./005-array":85,"./006-persistent-index":86}],90:[function(require,module,exports){
"use strict";

module.exports = {
  Keyboard: require("./src/keyboard"),
  Mousetrap: require("./src/mousetrap")
};

},{"./src/keyboard":92,"./src/mousetrap":93}],91:[function(require,module,exports){
/*global define:false */
/**
 * Copyright 2013 Craig Campbell
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * Mousetrap is a simple keyboard shortcut library for Javascript with
 * no external dependencies
 *
 * @version 1.4.4
 * @url craig.is/killing/mice
 */
(function() {

    /**
     * mapping of special keycodes to their corresponding keys
     *
     * everything in this dictionary cannot use keypress events
     * so it has to be here to map to the correct keycodes for
     * keyup/keydown events
     *
     * @type {Object}
     */
    var _MAP = {
            8: 'backspace',
            9: 'tab',
            13: 'enter',
            16: 'shift',
            17: 'ctrl',
            18: 'alt',
            20: 'capslock',
            27: 'esc',
            32: 'space',
            33: 'pageup',
            34: 'pagedown',
            35: 'end',
            36: 'home',
            37: 'left',
            38: 'up',
            39: 'right',
            40: 'down',
            45: 'ins',
            46: 'del',
            91: 'meta',
            93: 'meta',
            224: 'meta'
        },

        /**
         * mapping for special characters so they can support
         *
         * this dictionary is only used incase you want to bind a
         * keyup or keydown event to one of these keys
         *
         * @type {Object}
         */
        _KEYCODE_MAP = {
            106: '*',
            107: '+',
            109: '-',
            110: '.',
            111 : '/',
            186: ';',
            187: '=',
            188: ',',
            189: '-',
            190: '.',
            191: '/',
            192: '`',
            219: '[',
            220: '\\',
            221: ']',
            222: '\''
        },

        /**
         * this is a mapping of keys that require shift on a US keypad
         * back to the non shift equivelents
         *
         * this is so you can use keyup events with these keys
         *
         * note that this will only work reliably on US keyboards
         *
         * @type {Object}
         */
        _SHIFT_MAP = {
            '~': '`',
            '!': '1',
            '@': '2',
            '#': '3',
            '$': '4',
            '%': '5',
            '^': '6',
            '&': '7',
            '*': '8',
            '(': '9',
            ')': '0',
            '_': '-',
            '+': '=',
            ':': ';',
            '\"': '\'',
            '<': ',',
            '>': '.',
            '?': '/',
            '|': '\\'
        },

        /**
         * this is a list of special strings you can use to map
         * to modifier keys when you specify your keyboard shortcuts
         *
         * @type {Object}
         */
        _SPECIAL_ALIASES = {
            'option': 'alt',
            'command': 'meta',
            'return': 'enter',
            'escape': 'esc',
            'mod': /Mac|iPod|iPhone|iPad/.test(navigator.platform) ? 'meta' : 'ctrl'
        },

        /**
         * variable to store the flipped version of _MAP from above
         * needed to check if we should use keypress or not when no action
         * is specified
         *
         * @type {Object|undefined}
         */
        _REVERSE_MAP,

        /**
         * a list of all the callbacks setup via Mousetrap.bind()
         *
         * @type {Object}
         */
        _callbacks = {},

        /**
         * direct map of string combinations to callbacks used for trigger()
         *
         * @type {Object}
         */
        _directMap = {},

        /**
         * keeps track of what level each sequence is at since multiple
         * sequences can start out with the same sequence
         *
         * @type {Object}
         */
        _sequenceLevels = {},

        /**
         * variable to store the setTimeout call
         *
         * @type {null|number}
         */
        _resetTimer,

        /**
         * temporary state where we will ignore the next keyup
         *
         * @type {boolean|string}
         */
        _ignoreNextKeyup = false,

        /**
         * temporary state where we will ignore the next keypress
         *
         * @type {boolean}
         */
        _ignoreNextKeypress = false,

        /**
         * are we currently inside of a sequence?
         * type of action ("keyup" or "keydown" or "keypress") or false
         *
         * @type {boolean|string}
         */
        _nextExpectedAction = false;

    /**
     * loop through the f keys, f1 to f19 and add them to the map
     * programatically
     */
    for (var i = 1; i < 20; ++i) {
        _MAP[111 + i] = 'f' + i;
    }

    /**
     * loop through to map numbers on the numeric keypad
     */
    for (i = 0; i <= 9; ++i) {
        _MAP[i + 96] = i;
    }

    /**
     * cross browser add event method
     *
     * @param {Element|HTMLDocument} object
     * @param {string} type
     * @param {Function} callback
     * @returns void
     */
    function _addEvent(object, type, callback) {
        if (object.addEventListener) {
            object.addEventListener(type, callback, false);
            return;
        }

        object.attachEvent('on' + type, callback);
    }

    /**
     * takes the event and returns the key character
     *
     * @param {Event} e
     * @return {string}
     */
    function _characterFromEvent(e) {

        // for keypress events we should return the character as is
        if (e.type == 'keypress') {
            var character = String.fromCharCode(e.which);

            // if the shift key is not pressed then it is safe to assume
            // that we want the character to be lowercase.  this means if
            // you accidentally have caps lock on then your key bindings
            // will continue to work
            //
            // the only side effect that might not be desired is if you
            // bind something like 'A' cause you want to trigger an
            // event when capital A is pressed caps lock will no longer
            // trigger the event.  shift+a will though.
            if (!e.shiftKey) {
                character = character.toLowerCase();
            }

            return character;
        }

        // for non keypress events the special maps are needed
        if (_MAP[e.which]) {
            return _MAP[e.which];
        }

        if (_KEYCODE_MAP[e.which]) {
            return _KEYCODE_MAP[e.which];
        }

        // if it is not in the special map

        // with keydown and keyup events the character seems to always
        // come in as an uppercase character whether you are pressing shift
        // or not.  we should make sure it is always lowercase for comparisons
        return String.fromCharCode(e.which).toLowerCase();
    }

    /**
     * checks if two arrays are equal
     *
     * @param {Array} modifiers1
     * @param {Array} modifiers2
     * @returns {boolean}
     */
    function _modifiersMatch(modifiers1, modifiers2) {
        return modifiers1.sort().join(',') === modifiers2.sort().join(',');
    }

    /**
     * resets all sequence counters except for the ones passed in
     *
     * @param {Object} doNotReset
     * @returns void
     */
    function _resetSequences(doNotReset) {
        doNotReset = doNotReset || {};

        var activeSequences = false,
            key;

        for (key in _sequenceLevels) {
            if (doNotReset[key]) {
                activeSequences = true;
                continue;
            }
            _sequenceLevels[key] = 0;
        }

        if (!activeSequences) {
            _nextExpectedAction = false;
        }
    }

    /**
     * finds all callbacks that match based on the keycode, modifiers,
     * and action
     *
     * @param {string} character
     * @param {Array} modifiers
     * @param {Event|Object} e
     * @param {string=} sequenceName - name of the sequence we are looking for
     * @param {string=} combination
     * @param {number=} level
     * @returns {Array}
     */
    function _getMatches(character, modifiers, e, sequenceName, combination, level) {
        var i,
            callback,
            matches = [],
            action = e.type;

        // if there are no events related to this keycode
        if (!_callbacks[character]) {
            return [];
        }

        // if a modifier key is coming up on its own we should allow it
        if (action == 'keyup' && _isModifier(character)) {
            modifiers = [character];
        }

        // loop through all callbacks for the key that was pressed
        // and see if any of them match
        for (i = 0; i < _callbacks[character].length; ++i) {
            callback = _callbacks[character][i];

            // if a sequence name is not specified, but this is a sequence at
            // the wrong level then move onto the next match
            if (!sequenceName && callback.seq && _sequenceLevels[callback.seq] != callback.level) {
                continue;
            }

            // if the action we are looking for doesn't match the action we got
            // then we should keep going
            if (action != callback.action) {
                continue;
            }

            // if this is a keypress event and the meta key and control key
            // are not pressed that means that we need to only look at the
            // character, otherwise check the modifiers as well
            //
            // chrome will not fire a keypress if meta or control is down
            // safari will fire a keypress if meta or meta+shift is down
            // firefox will fire a keypress if meta or control is down
            if ((action == 'keypress' && !e.metaKey && !e.ctrlKey) || _modifiersMatch(modifiers, callback.modifiers)) {

                // when you bind a combination or sequence a second time it
                // should overwrite the first one.  if a sequenceName or
                // combination is specified in this call it does just that
                //
                // @todo make deleting its own method?
                var deleteCombo = !sequenceName && callback.combo == combination;
                var deleteSequence = sequenceName && callback.seq == sequenceName && callback.level == level;
                if (deleteCombo || deleteSequence) {
                    _callbacks[character].splice(i, 1);
                }

                matches.push(callback);
            }
        }

        return matches;
    }

    /**
     * takes a key event and figures out what the modifiers are
     *
     * @param {Event} e
     * @returns {Array}
     */
    function _eventModifiers(e) {
        var modifiers = [];

        if (e.shiftKey) {
            modifiers.push('shift');
        }

        if (e.altKey) {
            modifiers.push('alt');
        }

        if (e.ctrlKey) {
            modifiers.push('ctrl');
        }

        if (e.metaKey) {
            modifiers.push('meta');
        }

        return modifiers;
    }

    /**
     * actually calls the callback function
     *
     * if your callback function returns false this will use the jquery
     * convention - prevent default and stop propogation on the event
     *
     * @param {Function} callback
     * @param {Event} e
     * @returns void
     */
    function _fireCallback(callback, e, combo) {

        // if this event should not happen stop here
        if (Mousetrap.stopCallback(e, e.target || e.srcElement, combo)) {
            return;
        }

        if (callback(e, combo) === false) {
            if (e.preventDefault) {
                e.preventDefault();
            }

            if (e.stopPropagation) {
                e.stopPropagation();
            }

            e.returnValue = false;
            e.cancelBubble = true;
        }
    }

    /**
     * handles a character key event
     *
     * @param {string} character
     * @param {Array} modifiers
     * @param {Event} e
     * @returns void
     */
    function _handleKey(character, modifiers, e) {
        var callbacks = _getMatches(character, modifiers, e),
            i,
            doNotReset = {},
            maxLevel = 0,
            processedSequenceCallback = false;

        // Calculate the maxLevel for sequences so we can only execute the longest callback sequence
        for (i = 0; i < callbacks.length; ++i) {
            if (callbacks[i].seq) {
                maxLevel = Math.max(maxLevel, callbacks[i].level);
            }
        }

        // loop through matching callbacks for this key event
        for (i = 0; i < callbacks.length; ++i) {

            // fire for all sequence callbacks
            // this is because if for example you have multiple sequences
            // bound such as "g i" and "g t" they both need to fire the
            // callback for matching g cause otherwise you can only ever
            // match the first one
            if (callbacks[i].seq) {

                // only fire callbacks for the maxLevel to prevent
                // subsequences from also firing
                //
                // for example 'a option b' should not cause 'option b' to fire
                // even though 'option b' is part of the other sequence
                //
                // any sequences that do not match here will be discarded
                // below by the _resetSequences call
                if (callbacks[i].level != maxLevel) {
                    continue;
                }

                processedSequenceCallback = true;

                // keep a list of which sequences were matches for later
                doNotReset[callbacks[i].seq] = 1;
                _fireCallback(callbacks[i].callback, e, callbacks[i].combo);
                continue;

            } else if (Mousetrap.TRIGGER_PREFIX_COMBOS) {
                // HACK: Mousetrap does not trigger 'prefixes'
                _fireCallback(callbacks[i].callback, e, callbacks[i].combo);
            } else {
                // if there were no sequence matches but we are still here
                // that means this is a regular match so we should fire that
                if (!processedSequenceCallback) {
                    _fireCallback(callbacks[i].callback, e, callbacks[i].combo);
                }
            }
        }

        // if the key you pressed matches the type of sequence without
        // being a modifier (ie "keyup" or "keypress") then we should
        // reset all sequences that were not matched by this event
        //
        // this is so, for example, if you have the sequence "h a t" and you
        // type "h e a r t" it does not match.  in this case the "e" will
        // cause the sequence to reset
        //
        // modifier keys are ignored because you can have a sequence
        // that contains modifiers such as "enter ctrl+space" and in most
        // cases the modifier key will be pressed before the next key
        //
        // also if you have a sequence such as "ctrl+b a" then pressing the
        // "b" key will trigger a "keypress" and a "keydown"
        //
        // the "keydown" is expected when there is a modifier, but the
        // "keypress" ends up matching the _nextExpectedAction since it occurs
        // after and that causes the sequence to reset
        //
        // we ignore keypresses in a sequence that directly follow a keydown
        // for the same character
        var ignoreThisKeypress = e.type == 'keypress' && _ignoreNextKeypress;
        if (e.type == _nextExpectedAction && !_isModifier(character) && !ignoreThisKeypress) {
            _resetSequences(doNotReset);
        }

        _ignoreNextKeypress = processedSequenceCallback && e.type == 'keydown';

        // provide information about if there have callbacks detected
        // E.g., this is used to trigger a default key handler in case of no others did match
        return callbacks.length > 0;
    }

    /**
     * handles a keydown event
     *
     * @param {Event} e
     * @returns void
     */
    function _handleKeyEvent(e) {

        // normalize e.which for key events
        // @see http://stackoverflow.com/questions/4285627/javascript-keycode-vs-charcode-utter-confusion
        if (typeof e.which !== 'number') {
            e.which = e.keyCode;
        }

        var character = _characterFromEvent(e);

        // no character found then stop
        if (!character) {
            return;
        }

        // need to use === for the character check because the character can be 0
        if (e.type == 'keyup' && _ignoreNextKeyup === character) {
            _ignoreNextKeyup = false;
            return;
        }

        Mousetrap.handleKey(character, _eventModifiers(e), e);
    }

    /**
     * determines if the keycode specified is a modifier key or not
     *
     * @param {string} key
     * @returns {boolean}
     */
    function _isModifier(key) {
        return key == 'shift' || key == 'ctrl' || key == 'alt' || key == 'meta';
    }

    /**
     * called to set a 1 second timeout on the specified sequence
     *
     * this is so after each key press in the sequence you have 1 second
     * to press the next key before you have to start over
     *
     * @returns void
     */
    function _resetSequenceTimer() {
        clearTimeout(_resetTimer);
        _resetTimer = setTimeout(_resetSequences, 1000);
    }

    /**
     * reverses the map lookup so that we can look for specific keys
     * to see what can and can't use keypress
     *
     * @return {Object}
     */
    function _getReverseMap() {
        if (!_REVERSE_MAP) {
            _REVERSE_MAP = {};
            for (var key in _MAP) {

                // pull out the numeric keypad from here cause keypress should
                // be able to detect the keys from the character
                if (key > 95 && key < 112) {
                    continue;
                }

                if (_MAP.hasOwnProperty(key)) {
                    _REVERSE_MAP[_MAP[key]] = key;
                }
            }
        }
        return _REVERSE_MAP;
    }

    /**
     * picks the best action based on the key combination
     *
     * @param {string} key - character for key
     * @param {Array} modifiers
     * @param {string=} action passed in
     */
    function _pickBestAction(key, modifiers, action) {

        // if no action was picked in we should try to pick the one
        // that we think would work best for this key
        if (!action) {
            action = _getReverseMap()[key] ? 'keydown' : 'keypress';
        }

        // modifier keys don't work as expected with keypress,
        // switch to keydown
        if (action == 'keypress' && modifiers.length) {
            action = 'keydown';
        }

        return action;
    }

    /**
     * binds a key sequence to an event
     *
     * @param {string} combo - combo specified in bind call
     * @param {Array} keys
     * @param {Function} callback
     * @param {string=} action
     * @returns void
     */
    function _bindSequence(combo, keys, callback, action) {

        // start off by adding a sequence level record for this combination
        // and setting the level to 0
        _sequenceLevels[combo] = 0;

        /**
         * callback to increase the sequence level for this sequence and reset
         * all other sequences that were active
         *
         * @param {string} nextAction
         * @returns {Function}
         */
        function _increaseSequence(nextAction) {
            return function() {
                _nextExpectedAction = nextAction;
                ++_sequenceLevels[combo];
                _resetSequenceTimer();
            };
        }

        /**
         * wraps the specified callback inside of another function in order
         * to reset all sequence counters as soon as this sequence is done
         *
         * @param {Event} e
         * @returns void
         */
        function _callbackAndReset(e) {
            _fireCallback(callback, e, combo);

            // we should ignore the next key up if the action is key down
            // or keypress.  this is so if you finish a sequence and
            // release the key the final key will not trigger a keyup
            if (action !== 'keyup') {
                _ignoreNextKeyup = _characterFromEvent(e);
            }

            // weird race condition if a sequence ends with the key
            // another sequence begins with
            setTimeout(_resetSequences, 10);
        }

        // loop through keys one at a time and bind the appropriate callback
        // function.  for any key leading up to the final one it should
        // increase the sequence. after the final, it should reset all sequences
        //
        // if an action is specified in the original bind call then that will
        // be used throughout.  otherwise we will pass the action that the
        // next key in the sequence should match.  this allows a sequence
        // to mix and match keypress and keydown events depending on which
        // ones are better suited to the key provided
        for (var i = 0; i < keys.length; ++i) {
            var isFinal = i + 1 === keys.length;
            var wrappedCallback = isFinal ? _callbackAndReset : _increaseSequence(action || _getKeyInfo(keys[i + 1]).action);
            _bindSingle(keys[i], wrappedCallback, action, combo, i);
        }
    }

    /**
     * Converts from a string key combination to an array
     *
     * @param  {string} combination like "command+shift+l"
     * @return {Array}
     */
    function _keysFromString(combination) {
        if (combination === '+') {
            return ['+'];
        }

        return combination.split('+');
    }

    /**
     * Gets info for a specific key combination
     *
     * @param  {string} combination key combination ("command+s" or "a" or "*")
     * @param  {string=} action
     * @returns {Object}
     */
    function _getKeyInfo(combination, action) {
        var keys,
            key,
            i,
            modifiers = [];

        // take the keys from this pattern and figure out what the actual
        // pattern is all about
        keys = _keysFromString(combination);

        for (i = 0; i < keys.length; ++i) {
            key = keys[i];

            // normalize key names
            if (_SPECIAL_ALIASES[key]) {
                key = _SPECIAL_ALIASES[key];
            }

            // if this is not a keypress event then we should
            // be smart about using shift keys
            // this will only work for US keyboards however
            if (action && action != 'keypress' && _SHIFT_MAP[key]) {
                key = _SHIFT_MAP[key];
                modifiers.push('shift');
            }

            // if this key is a modifier then add it to the list of modifiers
            if (_isModifier(key)) {
                modifiers.push(key);
            }
        }

        // depending on what the key combination is
        // we will try to pick the best event for it
        action = _pickBestAction(key, modifiers, action);

        return {
            key: key,
            modifiers: modifiers,
            action: action
        };
    }

    /**
     * binds a single keyboard combination
     *
     * @param {string} combination
     * @param {Function} callback
     * @param {string=} action
     * @param {string=} sequenceName - name of sequence if part of sequence
     * @param {number=} level - what part of the sequence the command is
     * @returns void
     */
    function _bindSingle(combination, callback, action, sequenceName, level) {

        // store a direct mapped reference for use with Mousetrap.trigger
        _directMap[combination + ':' + action] = callback;

        // make sure multiple spaces in a row become a single space
        combination = combination.replace(/\s+/g, ' ');

        var sequence = combination.split(' '),
            info;

        // if this pattern is a sequence of keys then run through this method
        // to reprocess each pattern one key at a time
        if (sequence.length > 1) {
            _bindSequence(combination, sequence, callback, action);
            return;
        }

        info = _getKeyInfo(combination, action);

        // make sure to initialize array if this is the first time
        // a callback is added for this key
        _callbacks[info.key] = _callbacks[info.key] || [];

        // remove an existing match if there is one
        _getMatches(info.key, info.modifiers, {type: info.action}, sequenceName, combination, level);

        // add this call back to the array
        // if it is a sequence put it at the beginning
        // if not put it at the end
        //
        // this is important because the way these are processed expects
        // the sequence ones to come first
        _callbacks[info.key][sequenceName ? 'unshift' : 'push']({
            callback: callback,
            modifiers: info.modifiers,
            action: info.action,
            seq: sequenceName,
            level: level,
            combo: combination
        });
    }

    /**
     * binds multiple combinations to the same callback
     *
     * @param {Array} combinations
     * @param {Function} callback
     * @param {string|undefined} action
     * @returns void
     */
    function _bindMultiple(combinations, callback, action) {
        for (var i = 0; i < combinations.length; ++i) {
            _bindSingle(combinations[i], callback, action);
        }
    }

    // start!
    _addEvent(document, 'keypress', _handleKeyEvent);
    _addEvent(document, 'keydown', _handleKeyEvent);
    _addEvent(document, 'keyup', _handleKeyEvent);

    var Mousetrap = {

        /**
         * binds an event to mousetrap
         *
         * can be a single key, a combination of keys separated with +,
         * an array of keys, or a sequence of keys separated by spaces
         *
         * be sure to list the modifier keys first to make sure that the
         * correct key ends up getting bound (the last key in the pattern)
         *
         * @param {string|Array} keys
         * @param {Function} callback
         * @param {string=} action - 'keypress', 'keydown', or 'keyup'
         * @returns void
         */
        bind: function(keys, callback, action) {
            keys = keys instanceof Array ? keys : [keys];
            _bindMultiple(keys, callback, action);
            return this;
        },

        /**
         * unbinds an event to mousetrap
         *
         * the unbinding sets the callback function of the specified key combo
         * to an empty function and deletes the corresponding key in the
         * _directMap dict.
         *
         * TODO: actually remove this from the _callbacks dictionary instead
         * of binding an empty function
         *
         * the keycombo+action has to be exactly the same as
         * it was defined in the bind method
         *
         * @param {string|Array} keys
         * @param {string} action
         * @returns void
         */
        unbind: function(keys, action) {
            return Mousetrap.bind(keys, function() {}, action);
        },

        /**
         * triggers an event that has already been bound
         *
         * @param {string} keys
         * @param {string=} action
         * @returns void
         */
        trigger: function(keys, action) {
            if (_directMap[keys + ':' + action]) {
                _directMap[keys + ':' + action]({}, keys);
            }
            return this;
        },

        /**
         * resets the library back to its initial state.  this is useful
         * if you want to clear out the current keyboard shortcuts and bind
         * new ones - for example if you switch to another page
         *
         * @returns void
         */
        reset: function() {
            _callbacks = {};
            _directMap = {};
            return this;
        },

       /**
        * should we stop this event before firing off callbacks
        *
        * @param {Event} e
        * @param {Element} element
        * @return {boolean}
        */
        stopCallback: function(e, element) {

            // if the element has the class "mousetrap" then no need to stop
            if ((' ' + element.className + ' ').indexOf(' mousetrap ') > -1) {
                return false;
            }

            // stop for input, select, and textarea
            return element.tagName == 'INPUT' || element.tagName == 'SELECT' || element.tagName == 'TEXTAREA' || (element.contentEditable && element.contentEditable == 'true');
        },

        /**
         * exposes _handleKey publicly so it can be overwritten by extensions
         */
        handleKey: _handleKey,

        /**
         * Trigger callbacks for combos even when they are part of sequnence.
         */
         TRIGGER_PREFIX_COMBOS: false
    };

    // expose mousetrap to the global object
    window.Mousetrap = Mousetrap;

    // expose mousetrap as an AMD module
    if (typeof define === 'function' && define.amd) {
        define(Mousetrap);
    }
}) ();

},{}],92:[function(require,module,exports){
"use strict";

require("../lib/mousetrap");
var Mousetrap = window.Mousetrap;

var Keyboard = function(mainControl) {
  this.__bindings = {};
  this.__mainControl = mainControl;
  this.__controls = [];
  this.__defaultHandler = null;
};

Keyboard.Prototype = function() {

  // keep the original key handler for delegation
  var __handleKey = Mousetrap.handleKey;

  function __getContext(self, pathStr) {
    var path = pathStr.split(".");
    var context = self.__bindings;

    // prepare the hierarchical data structure
    for (var i = 0; i < path.length; i++) {
      var c = path[i];
      context.contexts = context.contexts || {};
      context.contexts[c] = context.contexts[c] || {};
      context = context.contexts[c];
    }

    return context;
  }

  function __registerBindings(self, definition) {
    var context = __getContext(self, definition.context);
    // add the commands into the given context
    context.commands = context.commands || [];
    context.commands = context.commands.concat(definition.commands);
  }

  function __createCallback(control, commandSpec) {
    var obj = control;
    if (commandSpec.scope) {
      obj = control[commandSpec.scope];
    }
    // default is preventing the default
    var preventDefault = (commandSpec.preventDefault !== "false");

    return function(e) {
      obj[commandSpec.command].apply(obj, commandSpec.args);
      if (preventDefault) e.preventDefault();
    };
  }

  function __bind(control, commands) {
    if (commands === undefined) return;

    for (var i = 0; i < commands.length; i++) {
      var command = commands[i];
      Mousetrap.bind(command.keys, __createCallback(control, command));
    }
  }

  function __injectDefaultHandler(defaultHandlers) {
    if (!defaultHandlers || defaultHandlers.length === 0) return;

    var handleKey = function(character, modifiers, e) {
      if (__handleKey(character, modifiers, e)) return;

      for (var i = defaultHandlers.length - 1; i >= 0; i--) {
        var item = defaultHandlers[i];

        // the handler function must return a command specification that
        // will be interpreted by the associated controller
        var cmd = item.handler(character, modifiers, e);

        // if the handler does not take care of the event
        // cmd should be falsy
        if (cmd) {
          var control = item.control;
          var command = cmd.command;
          var args = cmd.args;
          control[command].apply(control, args);

          // we prevent the default behaviour and also bubbling through
          // eventual parent default handlers.
          //e.preventDefault();
          return;
        }
      }
    };

    Mousetrap.handleKey = handleKey;
  }

  function __createBindings(self) {
    // TODO: would be great to have Mousetrap more modular and create several immutable
    // versions which would be switched here
    Mousetrap.reset();
    Mousetrap.handleKey = __handleKey;
    var defaultHandlers = [];

    function processBinding(context, control, bindings) {
      __bind(control, bindings.commands);
      if (bindings.default !== undefined) {
        defaultHandlers.push({
          context: context,
          control: control,
          handler: bindings.default
        });
      }
    }

    // TODO build active key mappings from registered bindings
    var controls = self.__controls;
    var bindings = self.__bindings;
    var context = "";
    var control = self.__mainControl;

    processBinding(context, control, bindings);

    for (var i = 0; i < controls.length; i++) {
      context = controls[i][0];
      control = controls[i][1];

      if (bindings.contexts === undefined || bindings.contexts[context] === undefined) {
        break;
      }

      bindings = bindings.contexts[context];
      processBinding(context, control, bindings);
    }

    __injectDefaultHandler(defaultHandlers);
  }

  // Registers bindings declared in the definition.
  // --------
  //

  this.registerBindings = function(definition) {
    console.log("Keyboard.registerBindings: definition=", definition);
    for (var i = 0; i < definition.length; i++) {
      var def = definition[i];
      __registerBindings(this, def);
    }
    this.stateChanged();
  };

  this.setDefaultHandler = function(contextStr, handler) {
    var context = __getContext(this, contextStr);
    context.default = handler;
  };

  // Updates the keyboard bindings after application state changes.
  // --------
  //

  this.stateChanged = function() {
    // controllers are structured in hierarchical contexts
    // having one controller taking responsibility for each context.
    this.__controls = this.__mainControl.getActiveControllers();
    __createBindings(this);
  };

  // Enters a subcontext using a given controller.
  // --------
  //
  // Use this to add finer grained sub-states. The sub-context will be kept
  // until `exit(context)` is called or the application state is changed.

  this.enter = function(context, control) {
    this.__controls.push([context, control]);
    __createBindings(this);
  };

  // Exits a previously entered subcontext.
  // --------
  //

  this.exit = function(context) {
    var pos = -1;
    for (var i = this.__controls.length - 1; i >= 0; i--) {
      if (this.__controls[i][0] === context) {
        pos = i;
        break;
      }
    }
    if (pos < 0) {
      throw new Error("Unknown context: " + context, ", expected one of: " + JSON.stringify(this.__contexts));
    }
    this.__controls = this.__controls.slice(0, pos);
    __createBindings(this);
  };

  // Supported flags:
  // TRIGGER_PREFIX_COMBOS: trigger combos that are already part of other sequences (default: false)
  this.set = function(prop, value) {
    Mousetrap[prop] = value;
  };

};
Keyboard.prototype = new Keyboard.Prototype();

module.exports = Keyboard;

},{"../lib/mousetrap":91}],93:[function(require,module,exports){
"use strict";

/**
 * mapping of special keycodes to their corresponding keys
 *
 * everything in this dictionary cannot use keypress events
 * so it has to be here to map to the correct keycodes for
 * keyup/keydown events
 *
 * @type {Object}
 */
var _MAP = {
    8: 'backspace',
    9: 'tab',
    13: 'enter',
    16: 'shift',
    17: 'ctrl',
    18: 'alt',
    20: 'capslock',
    27: 'esc',
    32: 'space',
    33: 'pageup',
    34: 'pagedown',
    35: 'end',
    36: 'home',
    37: 'left',
    38: 'up',
    39: 'right',
    40: 'down',
    45: 'ins',
    46: 'del',
    91: 'meta',
    93: 'meta',
    224: 'meta'
};

/**
 * mapping for special characters so they can support
 *
 * this dictionary is only used incase you want to bind a
 * keyup or keydown event to one of these keys
 *
 * @type {Object}
 */
var _KEYCODE_MAP = {
    106: '*',
    107: '+',
    109: '-',
    110: '.',
    111 : '/',
    186: ';',
    187: '=',
    188: ',',
    189: '-',
    190: '.',
    191: '/',
    192: '`',
    219: '[',
    220: '\\',
    221: ']',
    222: '\''
};

/**
 * this is a mapping of keys that require shift on a US keypad
 * back to the non shift equivelents
 *
 * this is so you can use keyup events with these keys
 *
 * note that this will only work reliably on US keyboards
 *
 * @type {Object}
 */
var _SHIFT_MAP = {
    '~': '`',
    '!': '1',
    '@': '2',
    '#': '3',
    '$': '4',
    '%': '5',
    '^': '6',
    '&': '7',
    '*': '8',
    '(': '9',
    ')': '0',
    '_': '-',
    '+': '=',
    ':': ';',
    '\"': '\'',
    '<': ',',
    '>': '.',
    '?': '/',
    '|': '\\'
};

/**
 * this is a list of special strings you can use to map
 * to modifier keys when you specify your keyboard shortcuts
 *
 * @type {Object}
 */
var _SPECIAL_ALIASES = {
    'option': 'alt',
    'command': 'meta',
    'return': 'enter',
    'escape': 'esc',
    'mod': /Mac|iPod|iPhone|iPad/.test(navigator.platform) ? 'meta' : 'ctrl'
};

/**
 * loop through the f keys, f1 to f19 and add them to the map
 * programatically
 */
for (var i = 1; i < 20; ++i) {
    _MAP[111 + i] = 'f' + i;
}

/**
 * loop through to map numbers on the numeric keypad
 */
for (i = 0; i <= 9; ++i) {
    _MAP[i + 96] = i;
}

/**
 * cross browser add event method
 *
 * @param {Element|HTMLDocument} object
 * @param {string} type
 * @param {Function} callback
 * @returns void
 */
function _attachListener(object, type, callback) {
    if (object.addEventListener) {
        object.addEventListener(type, callback, false);
    } else {
        object.attachEvent('on' + type, callback);
    }
}

function _detachListener(object, type, callback) {
    if (object.removeEventListener) {
        object.removeEventListener(type, callback, false);
    } else {
        object.detachEvent('on' + type, callback);
    }
}

/**
 * takes the event and returns the key character
 *
 * @param {Event} e
 * @return {string}
 */
function _characterFromEvent(e) {

    // for keypress events we should return the character as is
    if (e.type == 'keypress') {
        var character = String.fromCharCode(e.which);

        // if the shift key is not pressed then it is safe to assume
        // that we want the character to be lowercase.  this means if
        // you accidentally have caps lock on then your key bindings
        // will continue to work
        //
        // the only side effect that might not be desired is if you
        // bind something like 'A' cause you want to trigger an
        // event when capital A is pressed caps lock will no longer
        // trigger the event.  shift+a will though.
        if (!e.shiftKey) {
            character = character.toLowerCase();
        }

        return character;
    }

    // for non keypress events the special maps are needed
    if (_MAP[e.which]) {
        return _MAP[e.which];
    }

    if (_KEYCODE_MAP[e.which]) {
        return _KEYCODE_MAP[e.which];
    }

    // if it is not in the special map

    // with keydown and keyup events the character seems to always
    // come in as an uppercase character whether you are pressing shift
    // or not.  we should make sure it is always lowercase for comparisons
    return String.fromCharCode(e.which).toLowerCase();
}

/**
 * checks if two arrays are equal
 *
 * @param {Array} modifiers1
 * @param {Array} modifiers2
 * @returns {boolean}
 */
function _modifiersMatch(modifiers1, modifiers2) {
    return modifiers1.sort().join(',') === modifiers2.sort().join(',');
}

/**
 * takes a key event and figures out what the modifiers are
 *
 * @param {Event} e
 * @returns {Array}
 */
function _eventModifiers(e) {
    var modifiers = [];

    if (e.shiftKey) {
        modifiers.push('shift');
    }

    if (e.altKey) {
        modifiers.push('alt');
    }

    if (e.ctrlKey) {
        modifiers.push('ctrl');
    }

    if (e.metaKey) {
        modifiers.push('meta');
    }

    return modifiers;
}

/**
 * determines if the keycode specified is a modifier key or not
 *
 * @param {string} key
 * @returns {boolean}
 */
function _isModifier(key) {
    return key == 'shift' || key == 'ctrl' || key == 'alt' || key == 'meta';
}

/**
 * Converts from a string key combination to an array
 *
 * @param  {string} combination like "command+shift+l"
 * @return {Array}
 */
function _keysFromString(combination) {
    if (combination === '+') {
        return ['+'];
    }

    return combination.split('+');
}

var Mousetrap = function() {
    /**
     * variable to store the flipped version of _MAP from above
     * needed to check if we should use keypress or not when no action
     * is specified
     *
     * @type {Object|undefined}
     */
    this._REVERSE_MAP = {};

    /**
     * a list of all the callbacks setup via Mousetrap.bind()
     *
     * @type {Object}
     */
    this._callbacks = {};

    /**
     * direct map of string combinations to callbacks used for trigger()
     *
     * @type {Object}
     */
    this._directMap = {};

    /**
     * keeps track of what level each sequence is at since multiple
     * sequences can start out with the same sequence
     *
     * @type {Object}
     */
    this._sequenceLevels = {};

    /**
     * variable to store the setTimeout call
     *
     * @type {null|number}
     */
    this._resetTimer = null;

    /**
     * temporary state where we will ignore the next keyup
     *
     * @type {boolean|string}
     */
    this._ignoreNextKeyup = false;

    /**
     * temporary state where we will ignore the next keypress
     *
     * @type {boolean}
     */
    this._ignoreNextKeypress = false;

    /**
     * are we currently inside of a sequence?
     * type of action ("keyup" or "keydown" or "keypress") or false
     *
     * @type {boolean|string}
     */
    this._nextExpectedAction = false;

    this._handler = this._handleKeyEvent.bind(this);
};

Mousetrap.Prototype = function() {

    /**
     * resets all sequence counters except for the ones passed in
     *
     * @param {Object} doNotReset
     * @returns void
     */
    function _resetSequences(doNotReset) {
        doNotReset = doNotReset || {};

        var activeSequences = false,
            key;

        for (key in this._sequenceLevels) {
            if (doNotReset[key]) {
                activeSequences = true;
                continue;
            }
            this._sequenceLevels[key] = 0;
        }

        if (!activeSequences) {
            this._nextExpectedAction = false;
        }
    }

    /**
     * finds all callbacks that match based on the keycode, modifiers,
     * and action
     *
     * @param {string} character
     * @param {Array} modifiers
     * @param {Event|Object} e
     * @param {string=} sequenceName - name of the sequence we are looking for
     * @param {string=} combination
     * @param {number=} level
     * @returns {Array}
     */
    function _getMatches(character, modifiers, e, sequenceName, combination, level) {
        var i,
            callback,
            matches = [],
            action = e.type;

        // if there are no events related to this keycode
        if (!this._callbacks[character]) {
            return [];
        }

        // if a modifier key is coming up on its own we should allow it
        if (action == 'keyup' && _isModifier(character)) {
            modifiers = [character];
        }

        // loop through all callbacks for the key that was pressed
        // and see if any of them match
        for (i = 0; i < this._callbacks[character].length; ++i) {
            callback = this._callbacks[character][i];

            // if a sequence name is not specified, but this is a sequence at
            // the wrong level then move onto the next match
            if (!sequenceName && callback.seq && this._sequenceLevels[callback.seq] != callback.level) {
                continue;
            }

            // if the action we are looking for doesn't match the action we got
            // then we should keep going
            if (action != callback.action) {
                continue;
            }

            // if this is a keypress event and the meta key and control key
            // are not pressed that means that we need to only look at the
            // character, otherwise check the modifiers as well
            //
            // chrome will not fire a keypress if meta or control is down
            // safari will fire a keypress if meta or meta+shift is down
            // firefox will fire a keypress if meta or control is down
            if ((action == 'keypress' && !e.metaKey && !e.ctrlKey) || _modifiersMatch(modifiers, callback.modifiers)) {

                // when you bind a combination or sequence a second time it
                // should overwrite the first one.  if a sequenceName or
                // combination is specified in this call it does just that
                //
                // @todo make deleting its own method?
                var deleteCombo = !sequenceName && callback.combo == combination;
                var deleteSequence = sequenceName && callback.seq == sequenceName && callback.level == level;
                if (deleteCombo || deleteSequence) {
                    this._callbacks[character].splice(i, 1);
                }

                matches.push(callback);
            }
        }

        return matches;
    }

    /**
     * actually calls the callback function
     *
     * if your callback function returns false this will use the jquery
     * convention - prevent default and stop propogation on the event
     *
     * @param {Function} callback
     * @param {Event} e
     * @returns void
     */
    function _fireCallback(callback, e, combo) {

        // if this event should not happen stop here
        if (this.NOT_IN_EDITABLES && this.stopCallback(e, e.target || e.srcElement, combo)) {
             return;
        }

        if (callback.call(this, e, combo) === false) {
            if (e.preventDefault) {
                e.preventDefault();
            }

            if (e.stopPropagation) {
                e.stopPropagation();
            }

            e.returnValue = false;
            e.cancelBubble = true;
        }
    }

    /**
     * handles a character key event
     *
     * @param {string} character
     * @param {Array} modifiers
     * @param {Event} e
     * @returns void
     */
    this.handleKey = function (character, modifiers, e) {
        var callbacks = _getMatches.call(this, character, modifiers, e),
            i,
            doNotReset = {},
            maxLevel = 0,
            processedSequenceCallback = false;

        // Calculate the maxLevel for sequences so we can only execute the longest callback sequence
        for (i = 0; i < callbacks.length; ++i) {
            if (callbacks[i].seq) {
                maxLevel = Math.max(maxLevel, callbacks[i].level);
            }
        }

        // loop through matching callbacks for this key event
        for (i = 0; i < callbacks.length; ++i) {

            // fire for all sequence callbacks
            // this is because if for example you have multiple sequences
            // bound such as "g i" and "g t" they both need to fire the
            // callback for matching g cause otherwise you can only ever
            // match the first one
            if (callbacks[i].seq) {

                // only fire callbacks for the maxLevel to prevent
                // subsequences from also firing
                //
                // for example 'a option b' should not cause 'option b' to fire
                // even though 'option b' is part of the other sequence
                //
                // any sequences that do not match here will be discarded
                // below by the _resetSequences call
                if (callbacks[i].level != maxLevel) {
                    continue;
                }

                processedSequenceCallback = true;

                // keep a list of which sequences were matches for later
                doNotReset[callbacks[i].seq] = 1;
                _fireCallback.call(this, callbacks[i].callback, e, callbacks[i].combo);
                continue;

            } else if (Mousetrap.TRIGGER_PREFIX_COMBOS) {
                // HACK: Mousetrap does not trigger 'prefixes'
                _fireCallback.call(this, callbacks[i].callback, e, callbacks[i].combo);
            } else {
                // if there were no sequence matches but we are still here
                // that means this is a regular match so we should fire that
                if (!processedSequenceCallback) {
                    _fireCallback.call(this, callbacks[i].callback, e, callbacks[i].combo);
                }
            }
        }

        // if the key you pressed matches the type of sequence without
        // being a modifier (ie "keyup" or "keypress") then we should
        // reset all sequences that were not matched by this event
        //
        // this is so, for example, if you have the sequence "h a t" and you
        // type "h e a r t" it does not match.  in this case the "e" will
        // cause the sequence to reset
        //
        // modifier keys are ignored because you can have a sequence
        // that contains modifiers such as "enter ctrl+space" and in most
        // cases the modifier key will be pressed before the next key
        //
        // also if you have a sequence such as "ctrl+b a" then pressing the
        // "b" key will trigger a "keypress" and a "keydown"
        //
        // the "keydown" is expected when there is a modifier, but the
        // "keypress" ends up matching the _nextExpectedAction since it occurs
        // after and that causes the sequence to reset
        //
        // we ignore keypresses in a sequence that directly follow a keydown
        // for the same character
        var ignoreThisKeypress = e.type == 'keypress' && this._ignoreNextKeypress;
        if (e.type == this._nextExpectedAction && !_isModifier(character) && !ignoreThisKeypress) {
            _resetSequences.call(this, doNotReset);
        }

        this._ignoreNextKeypress = processedSequenceCallback && e.type == 'keydown';

        // provide information about if there have callbacks detected
        // E.g., this is used to trigger a default key handler in case of no others did match
        return callbacks.length > 0;
    };

    /**
     * handles a keydown event
     *
     * @param {Event} e
     * @returns void
     */
    this._handleKeyEvent = function(e) {

        // normalize e.which for key events
        // @see http://stackoverflow.com/questions/4285627/javascript-keycode-vs-charcode-utter-confusion
        if (typeof e.which !== 'number') {
            e.which = e.keyCode;
        }

        var character = _characterFromEvent(e);

        // no character found then stop
        if (!character) {
            return;
        }

        // need to use === for the character check because the character can be 0
        if (e.type == 'keyup' && this._ignoreNextKeyup === character) {
            this._ignoreNextKeyup = false;
            return;
        }

        this.handleKey(character, _eventModifiers(e), e);
    };

    /**
     * Gets info for a specific key combination
     *
     * @param  {string} combination key combination ("command+s" or "a" or "*")
     * @param  {string=} action
     * @returns {Object}
     */
    function _getKeyInfo(combination, action) {
        var keys,
            key,
            i,
            modifiers = [];

        // take the keys from this pattern and figure out what the actual
        // pattern is all about
        keys = _keysFromString(combination);

        for (i = 0; i < keys.length; ++i) {
            key = keys[i];

            // normalize key names
            if (_SPECIAL_ALIASES[key]) {
                key = _SPECIAL_ALIASES[key];
            }

            // if this is not a keypress event then we should
            // be smart about using shift keys
            // this will only work for US keyboards however
            if (action && action != 'keypress' && _SHIFT_MAP[key]) {
                key = _SHIFT_MAP[key];
                modifiers.push('shift');
            }

            // if this key is a modifier then add it to the list of modifiers
            if (_isModifier(key)) {
                modifiers.push(key);
            }
        }

        // depending on what the key combination is
        // we will try to pick the best event for it
        action = _pickBestAction.call(this, key, modifiers, action);

        return {
            key: key,
            modifiers: modifiers,
            action: action
        };
    }

    /**
     * binds a single keyboard combination
     *
     * @param {string} combination
     * @param {Function} callback
     * @param {string=} action
     * @param {string=} sequenceName - name of sequence if part of sequence
     * @param {number=} level - what part of the sequence the command is
     * @returns void
     */
    function _bindSingle(combination, callback, action, sequenceName, level) {

        // store a direct mapped reference for use with Mousetrap.trigger
        this._directMap[combination + ':' + action] = callback;

        // make sure multiple spaces in a row become a single space
        combination = combination.replace(/\s+/g, ' ');

        var sequence = combination.split(' '),
            info;

        // if this pattern is a sequence of keys then run through this method
        // to reprocess each pattern one key at a time
        if (sequence.length > 1) {
            _bindSequence.call(this, combination, sequence, callback, action);
            return;
        }

        info = _getKeyInfo.call(this, combination, action);

        // make sure to initialize array if this is the first time
        // a callback is added for this key
        this._callbacks[info.key] = this._callbacks[info.key] || [];

        // remove an existing match if there is one
        _getMatches.call(this, info.key, info.modifiers, {type: info.action}, sequenceName, combination, level);

        // add this call back to the array
        // if it is a sequence put it at the beginning
        // if not put it at the end
        //
        // this is important because the way these are processed expects
        // the sequence ones to come first
        this._callbacks[info.key][sequenceName ? 'unshift' : 'push']({
            callback: callback,
            modifiers: info.modifiers,
            action: info.action,
            seq: sequenceName,
            level: level,
            combo: combination
        });
    }

    /**
     * binds multiple combinations to the same callback
     *
     * @param {Array} combinations
     * @param {Function} callback
     * @param {string|undefined} action
     * @returns void
     */
    function _bindMultiple(combinations, callback, action) {
        for (var i = 0; i < combinations.length; ++i) {
            _bindSingle.call(this, combinations[i], callback, action);
        }
    }


    /**
     * called to set a 1 second timeout on the specified sequence
     *
     * this is so after each key press in the sequence you have 1 second
     * to press the next key before you have to start over
     *
     * @returns void
     */
    function _resetSequenceTimer() {
        clearTimeout(this._resetTimer);
        this._resetTimer = setTimeout(_resetSequences.bind(this), 1000);
    }

    /**
     * reverses the map lookup so that we can look for specific keys
     * to see what can and can't use keypress
     *
     * @return {Object}
     */
    function _getReverseMap() {
        if (!this._REVERSE_MAP) {
            this._REVERSE_MAP = {};
            for (var key in _MAP) {

                // pull out the numeric keypad from here cause keypress should
                // be able to detect the keys from the character
                if (key > 95 && key < 112) {
                    continue;
                }

                if (_MAP.hasOwnProperty(key)) {
                    this._REVERSE_MAP[_MAP[key]] = key;
                }
            }
        }
        return this._REVERSE_MAP;
    }

    /**
     * picks the best action based on the key combination
     *
     * @param {string} key - character for key
     * @param {Array} modifiers
     * @param {string=} action passed in
     */
    function _pickBestAction(key, modifiers, action) {

        // if no action was picked in we should try to pick the one
        // that we think would work best for this key
        if (!action) {
            action = _getReverseMap.call(this)[key] ? 'keydown' : 'keypress';
        }

        // modifier keys don't work as expected with keypress,
        // switch to keydown
        if (action == 'keypress' && modifiers.length) {
            action = 'keydown';
        }

        return action;
    }

    /**
     * binds a key sequence to an event
     *
     * @param {string} combo - combo specified in bind call
     * @param {Array} keys
     * @param {Function} callback
     * @param {string=} action
     * @returns void
     */
    function _bindSequence(combo, keys, callback, action) {

        var that = this;

        // start off by adding a sequence level record for this combination
        // and setting the level to 0
        this._sequenceLevels[combo] = 0;

        /**
         * callback to increase the sequence level for this sequence and reset
         * all other sequences that were active
         *
         * @param {string} nextAction
         * @returns {Function}
         */
        function _increaseSequence(nextAction) {
            return function() {
                that._nextExpectedAction = nextAction;
                ++that._sequenceLevels[combo];
                _resetSequenceTimer.call(that);
            };
        }

        /**
         * wraps the specified callback inside of another function in order
         * to reset all sequence counters as soon as this sequence is done
         *
         * @param {Event} e
         * @returns void
         */
        function _callbackAndReset(e) {
            _fireCallback.call(this, callback, e, combo);

            // we should ignore the next key up if the action is key down
            // or keypress.  this is so if you finish a sequence and
            // release the key the final key will not trigger a keyup
            if (action !== 'keyup') {
                this._ignoreNextKeyup = _characterFromEvent(e);
            }

            // weird race condition if a sequence ends with the key
            // another sequence begins with
            setTimeout(_resetSequences.bind(this), 10);
        }

        // loop through keys one at a time and bind the appropriate callback
        // function.  for any key leading up to the final one it should
        // increase the sequence. after the final, it should reset all sequences
        //
        // if an action is specified in the original bind call then that will
        // be used throughout.  otherwise we will pass the action that the
        // next key in the sequence should match.  this allows a sequence
        // to mix and match keypress and keydown events depending on which
        // ones are better suited to the key provided
        for (var i = 0; i < keys.length; ++i) {
            var isFinal = i + 1 === keys.length;
            var wrappedCallback = isFinal ? _callbackAndReset : _increaseSequence.call(this, action || _getKeyInfo(keys[i + 1]).action);
            _bindSingle.call(this, keys[i], wrappedCallback, action, combo, i);
        }
    }

    /**
     * binds an event to mousetrap
     *
     * can be a single key, a combination of keys separated with +,
     * an array of keys, or a sequence of keys separated by spaces
     *
     * be sure to list the modifier keys first to make sure that the
     * correct key ends up getting bound (the last key in the pattern)
     *
     * @param {string|Array} keys
     * @param {Function} callback
     * @param {string=} action - 'keypress', 'keydown', or 'keyup'
     * @returns void
     */
    this.bind = function(keys, callback, action) {
        keys = keys instanceof Array ? keys : [keys];
        _bindMultiple.call(this, keys, callback, action);
        return this;
    };

    /**
     * unbinds an event to mousetrap
     *
     * the unbinding sets the callback function of the specified key combo
     * to an empty function and deletes the corresponding key in the
     * _directMap dict.
     *
     * TODO: actually remove this from the _callbacks dictionary instead
     * of binding an empty function
     *
     * the keycombo+action has to be exactly the same as
     * it was defined in the bind method
     *
     * @param {string|Array} keys
     * @param {string} action
     * @returns void
     */
    this.unbind = function(keys, action) {
        return this.bind(keys, function() {}, action);
    };

    /**
     * triggers an event that has already been bound
     *
     * @param {string} keys
     * @param {string=} action
     * @returns void
     */
    this.trigger = function(keys, action) {
        if (this._directMap[keys + ':' + action]) {
            this._directMap[keys + ':' + action].call(this, {}, keys);
        }
        return this;
    };

    /**
     * resets the library back to its initial state.  this is useful
     * if you want to clear out the current keyboard shortcuts and bind
     * new ones - for example if you switch to another page
     *
     * @returns void
     */
    this.reset = function() {
        this._callbacks = {};
        this._directMap = {};
        return this;
    };

   /**
    * should we stop this event before firing off callbacks
    *
    * @param {Event} e
    * @param {Element} element
    * @return {boolean}
    */
    this.stopCallback = function(e, element) {

        // if the element has the class "mousetrap" then no need to stop
        if ((' ' + element.className + ' ').indexOf(' mousetrap ') > -1) {
            return false;
        }

        // stop for input, select, and textarea
        return element.tagName == 'INPUT' || element.tagName == 'SELECT' || element.tagName == 'TEXTAREA' || (element.contentEditable && element.contentEditable == 'true');
    };

    this.connect = function(el) {
        this._el = el;

        _attachListener(this._el, 'keypress', this._handler);
        _attachListener(this._el, 'keydown', this._handler);
        _attachListener(this._el, 'keyup', this._handler);
    };

    this.disconnect = function() {

        _detachListener(this._el, 'keypress', this._handler);
        _detachListener(this._el, 'keydown', this._handler);
        _detachListener(this._el, 'keyup', this._handler);
    };

    /**
     * Trigger callbacks for combos even when they are part of sequnence.
     */
     this.TRIGGER_PREFIX_COMBOS = false;
     this.NOT_IN_EDITABLES = false;
};

Mousetrap.prototype = new Mousetrap.Prototype();

module.exports = Mousetrap;

},{}],94:[function(require,module,exports){
"use strict";

var Data = {};

// Current version of the library. Keep in sync with `package.json`.
Data.VERSION = '0.8.0';

Data.Graph = require('./src/graph');

module.exports = Data;

},{"./src/graph":96}],95:[function(require,module,exports){
"use strict";

var Chronicle = require('substance-chronicle');
var Operator = require('substance-operator');

var ChronicleAdapter = function(graph) {
  this.graph = graph;
  this.graph.state = "ROOT";
};

ChronicleAdapter.Prototype = function() {

  this.apply = function(op) {
    // Note: we call the Graph.apply intentionally, as the chronicled change
    // should be an ObjectOperation
    //console.log("ChronicleAdapter.apply, op=", op);
    this.graph.__apply__(op);
    this.graph.updated_at = new Date(op.timestamp);
  };

  this.invert = function(change) {
    return Operator.ObjectOperation.fromJSON(change).invert();
  };

  this.transform = function(a, b, options) {
    return Operator.ObjectOperation.transform(a, b, options);
  };

  this.reset = function() {
    this.graph.reset();
  };

  this.getState = function() {
    return this.graph.state;
  };

  this.setState = function(state) {
    this.graph.state = state;
  };
};

ChronicleAdapter.Prototype.prototype = Chronicle.Versioned.prototype;
ChronicleAdapter.prototype = new ChronicleAdapter.Prototype();

module.exports = ChronicleAdapter;

},{"substance-chronicle":73,"substance-operator":175}],96:[function(require,module,exports){
//     (c) 2013 Michael Aufreiter, Oliver Buchtala
//     Data.js is freely distributable under the MIT license.
//     Portions of Data.js are inspired or borrowed from Underscore.js,
//     Backbone.js and Google's Visualization API.
//     For all details and documentation:
//     http://github.com/michael/data

"use strict";

var _ = require('underscore');
var util = require('substance-util');
var errors = util.errors;

var Schema = require('./schema');
var Property = require('./property');

var Chronicle = require('substance-chronicle');
var Operator = require('substance-operator');

var PersistenceAdapter = require('./persistence_adapter');
var ChronicleAdapter = require('./chronicle_adapter');
var Index = require('./graph_index');

var GraphError = errors.define("GraphError");

// Data types registry
// -------------------
// Available data types for graph properties.

var VALUE_TYPES = [
  'object',
  'array',
  'string',
  'number',
  'boolean',
  'date'
];


// Check if composite type is in types registry.
// The actual type of a composite type is the first entry
// I.e., ["array", "string"] is an array in first place.
var isValueType = function (type) {
  if (_.isArray(type)) {
    type = type[0];
  }
  return VALUE_TYPES.indexOf(type) >= 0;
};

// Graph
// =====

// A `Graph` can be used for representing arbitrary complex object
// graphs. Relations between objects are expressed through links that
// point to referred objects. Graphs can be traversed in various ways.
// See the testsuite for usage.
//
// Need to be documented:
// @options (mode,seed,chronicle,store,load,graph)
var Graph = function(schema, options) {
  options = options || {};

  // Initialization
  this.schema = new Schema(schema);

  // Check if provided seed conforms to the given schema
  // Only when schema has an id and seed is provided

  if (this.schema.id && options.seed && options.seed.schema) {
    if (!_.isEqual(options.seed.schema, [this.schema.id, this.schema.version])) {
      throw new GraphError([
        "Graph does not conform to schema. Expected: ",
        this.schema.id+"@"+this.schema.version,
        " Actual: ",
        options.seed.schema[0]+"@"+options.seed.schema[1]
      ].join(''));
    }
  }

  this.objectAdapter = new Graph.ObjectAdapter(this);

  this.nodes = {};
  this.indexes = {};

  this.__mode__ = options.mode || Graph.DEFAULT_MODE;
  this.__seed__ = options.seed;

  // Note: don't init automatically after making persistent
  // as this would delete the persistet graph.
  // Instead, the application has to call `graph.load()` if the store is supposed to
  // contain a persisted graph
  this.isVersioned = !!options.chronicle;
  this.isPersistent = !!options.store;

  // Make chronicle graph
  if (this.isVersioned) {
    this.chronicle = options.chronicle;
    this.chronicle.manage(new Graph.ChronicleAdapter(this));
  }

  // Make persistent graph
  if (this.isPersistent) {
    var nodes = options.store.hash("nodes");
    this.__store__ = options.store;
    this.__nodes__ = nodes;

    if (this.isVersioned) {
      this.__version__ = options.store.hash("__version__");
    }

    this.objectAdapter = new PersistenceAdapter(this.objectAdapter, nodes);
  }

  if (options.load) {
    this.load();
  } else {
    this.init();
  }

  // Populate graph
  if (options.graph) this.merge(options.graph);
};

Graph.Prototype = function() {

  var _private = new Graph.Private();

  // Graph manipulation API
  // ======================

  // Add a new node
  // --------------
  // Adds a new node to the graph
  // Only properties that are specified in the schema are taken:
  //     var node = {
  //       id: "apple",
  //       type: "fruit",
  //       name: "My Apple",
  //       color: "red",
  //       val: { size: "big" }
  //     };
  // Create new node:
  //     Data.Graph.create(node);
  // Note: graph create operation should reject creation of duplicate nodes.


  _.extend(this, util.Events);

  this.create = function(node) {
    var op = Operator.ObjectOperation.Create([node.id], node);
    return this.apply(op);
  };

  // Remove a node
  // -------------
  // Removes a node with given id and key (optional):
  //     Data.Graph.delete(this.graph.get('apple'));
  this.delete = function(id) {
    var node = this.get(id);
    if (node === undefined) {
      throw new GraphError("Could not resolve a node with id "+ id);
    }

    // in case that the returned node is a rich object
    // there should be a serialization method
    if (node.toJSON) {
      node = node.toJSON();
    }

    var op = Operator.ObjectOperation.Delete([id], node);
    return this.apply(op);
  };

  // Update the property
  // -------------------
  //
  // Updates the property with a given operation.
  // Note: the diff has to be given as an appropriate operation.
  // E.g., for string properties diff would be Operator.TextOperation,
  // for arrays it would be Operator.ArrayOperation, etc.
  // For example Substance.Operator:
  //   Data.Graph.create({
  //     id: "fruit_2",
  //     type: "fruit",
  //     name: "Blueberry",
  //     val: { form: { kind: "bar", color: "blue" }, size: "small" },
  //   })
  //   var valueUpdate = Operator.TextOperation.fromOT("bar", [1, -1, "e", 1, "ry"]);
  //   var propertyUpdate = Operator.ObjectOperation.Update(["form", "kind"], valueUpdate);
  //   var nodeUpdate = Data.Graph.update(["fruit_2", "val"], propertyUpdate);
  // Let's get it now:
  //   var blueberry = this.graph.get("fruit_2");
  //   console.log(blueberry.val.form.kind);
  //   = > 'berry'

  this.update = function(path, diff) {
    var prop = this.resolve(path);
    if (!prop) {
      throw new GraphError("Could not resolve property with path "+JSON.stringify(path));
    }

    if (_.isArray(diff)) {
      if (prop.baseType === "string") {
        diff = Operator.TextOperation.fromSequence(prop.get(), diff);
      } else if (prop.baseType === "array") {
        diff = Operator.ArrayOperation.create(prop.get(), diff);
      } else {
        throw new GraphError("There is no convenient notation supported for this type: " + prop.baseType);
      }
    }

    if (!diff) {
      // if the diff turns out to be empty there will be no operation.
      return;
    }

    var op = Operator.ObjectOperation.Update(path, diff, prop.baseType);
    return this.apply(op);
  };

  // Set the property
  // ----------------
  //
  // Sets the property to a given value:
  // Data.Graph.set(["fruit_2", "val", "size"], "too small");
  // Let's see what happened with node:
  //     var blueberry = this.graph.get("fruit_2");
  //     console.log(blueberry.val.size);
  //     = > 'too small'

  this.set = function(path, newValue) {
    var prop = this.resolve(path);
    if (!prop) {
      throw new GraphError("Could not resolve property with path "+JSON.stringify(path));
    }
    var oldValue = prop.get();
    var op = Operator.ObjectOperation.Set(path, oldValue, newValue);
    return this.apply(op);
  };

  // Pure graph manipulation
  // -----------------------
  //
  // Only applies the graph operation without triggering e.g., the chronicle.

  this.__apply__ = function(_op) {
    //console.log("Graph.__apply__", op);

    // Note: we apply compounds eagerly... i.e., all listeners will be updated after
    // each atomic change.

    Operator.Helpers.each(_op, function(op) {
      op.apply(this.objectAdapter);
      this.updated_at = new Date();

      this._internalUpdates(op);

      _.each(this.indexes, function(index) {
        // Treating indexes as first class listeners for graph changes
        index.onGraphChange(op);
      }, this);

      // And all regular listeners in second line
      this.trigger('operation:applied', op, this);
    }, this);

  };

  this._internalUpdates = function(op) {
    // Treating indexes as first class listeners for graph changes
    Operator.Helpers.each(op, function(_op) {
      _.each(this.indexes, function(index) {
        index.onGraphChange(_op);
      }, this);
    }, this);
  };

  // Apply a command
  // ---------------
  //
  // Applies a graph command
  // All commands call this function internally to apply an operation to the graph

  this.apply = function(op) {

    this.__apply__(op);

    // do not record changes during initialization
    if (!this.__is_initializing__ && this.isVersioned) {
      op.timestamp = new Date();
      this.chronicle.record(util.clone(op));
    }

    return op;
  };

  // Get the node [property]
  // -----------------------
  //
  // Gets specified graph node using id:
  //  var apple = this.graph.get("apple");
  //  console.log(apple);
  //  =>
  //  {
  //    id: "apple",
  //    type: "fruit",
  //    name: "My Apple",
  //    color: "red",
  //    val: { size: "big" }
  //  }
  // or get node's property:
  //  var apple = this.graph.get(["apple","color"]);
  //  console.log(apple);
  //  => 'red'

  this.get = function(path) {
    if (!_.isArray(path) && !_.isString(path)) {
      throw new GraphError("Invalid argument path. Must be String or Array");
    }

    if (arguments.length > 1) path = _.toArray(arguments);
    if (_.isString(path)) return this.nodes[path];

    var prop = this.resolve(path);
    return prop.get();
  };

  // Query graph data
  // ----------------
  //
  // Perform smart querying on graph
  //     graph.create({
  //       id: "apple-tree",
  //       type: "tree",
  //       name: "Apple tree"
  //     });
  //     var apple = this.graph.get("apple");
  //     apple.set({["apple","tree"], "apple-tree"});
  // let's perform query:
  //     var result = graph.query(["apple", "tree"]);
  //     console.log(result);
  //     => [{id: "apple-tree", type: "tree", name: "Apple tree"}]

  this.query = function(path) {
    var prop = this.resolve(path);

    var type = prop.type;
    var baseType = prop.baseType;
    var val = prop.get();

    // resolve referenced nodes in array types
    if (baseType === "array") {
      return _private.queryArray.call(this, val, type);
    } else if (!isValueType(baseType)) {
      return this.get(val);
    } else {
      return val;
    }
  };

  // Serialize current state
  // -----------------------
  //
  // Convert current graph state to JSON object

  this.toJSON = function() {
    return {
      id: this.id,
      schema: [this.schema.id, this.schema.version],
      nodes: util.deepclone(this.nodes)
    };
  };

  // Check node existing
  // -------------------
  //
  // Checks if a node with given id exists
  //     this.graph.contains("apple");
  //     => true
  //     this.graph.contains("orange");
  //     => false

  this.contains = function(id) {
    return (!!this.nodes[id]);
  };

  // Resolve a property
  // ------------------
  // Resolves a property with a given path

  this.resolve = function(path) {
    return new Property(this, path);
  };

  // Reset to initial state
  // ----------------------
  // Resets the graph to its initial state.
  // Note: This clears all nodes and calls `init()` which may seed the graph.

  this.reset = function() {
    if (this.isPersistent) {
      if (this.__nodes__) this.__nodes__.clear();
    }

    this.init();

    if (this.isVersioned) {
      this.state = Chronicle.ROOT;
    }

    this.trigger("graph:reset");
  };

  // Graph initialization.
  this.init = function() {
    this.__is_initializing__ = true;

    if (this.__seed__) {
      this.nodes = util.clone(this.__seed__.nodes);
    } else {
      this.nodes = {};
    }

    _.each(this.indexes, function(index) {
      index.reset();
    });

    if (this.isPersistent) {
      _.each(this.nodes, function(node, id) {
        this.__nodes__.set(id, node);
      }, this);
    }

    delete this.__is_initializing__;
  };

  // Merge graphs
  // ------------
  //
  // Merges this graph with another graph:
  //     var folks = new Data.Graph(folks_schema);
  //     var persons = new Data.Graph(persons_schema);
  //     folks.create({
  //       name: 'Bart',
  //       surname: 'Simpson',
  //       type: 'cartoon-actor',
  //       century: 'XXI',
  //       citizen: 'U.S.'
  //     });
  //     persons.create({
  //       name: 'Alexander',
  //       surname: 'Pushkin',
  //       type: 'poet',
  //       century: '19',
  //       citizen: 'Russia'
  //     });
  //     persons.create({
  //       name: 'Pelem Grenwill',
  //       surname: 'Woodhouse',
  //       type: 'poet',
  //       century: '19',
  //       citizen: 'Russia'
  //     });
  //     var merged = persons.merge(folks);
  //     merged.toJSON();
  //     => {
  //       nodes: [
  //         {
  //           name: 'Alexander',
  //           surname: 'Pushkin',
  //           type: 'poet',
  //           century: '19',
  //           citizen: 'Russia'
  //         },
  //         {
  //           name: 'Pelem Grenwill',
  //           surname: 'Woodhouse',
  //           type: 'poet',
  //           century: '19',
  //           citizen: 'Russia'
  //         },
  //         {
  //           name: 'Bart',
  //           surname: 'Simpson',
  //           type: 'cartoon-actor',
  //           century: 'XXI',
  //           citizen: 'U.S.'
  //         }
  //       ]
  //     }

  this.merge = function(graph) {
    _.each(graph.nodes, function(n) {
      this.create(n);
    }, this);

    return this;
  };

  // View Traversal
  // --------------

  this.traverse = function(view) {
    return _.map(this.getView(view), function(node) {
      return this.get(node);
    }, this);
  };

  // Graph loading.
  // ----------
  //
  // Note: currently this must be called explicitely by the app

  this.load = function() {

    if (!this.isPersistent) {
      console.log("Graph is not persistent.");
      return;
    }

    this.__is_initializing__ = true;

    this.nodes = {};
    this.indexes = {};

    // import persistet nodes
    var keys = this.__nodes__.keys();
    for (var idx = 0; idx < keys.length; idx++) {
      _private.create.call(this, this.__nodes__.get(keys[idx]));
    }

    if (this.isVersioned) {
      this.state = this.__version__.get("state") || "ROOT";
    }

    delete this.__is_initializing__;

    return this;
  };

  // A helper to apply co-transformations
  // --------
  //
  // The provided adapter must conform to the interface:
  //
  //    {
  //      create: function(node) {},
  //      delete: function(node) {},
  //      update: function(node, property, newValue, oldValue) {},
  //    }
  //

  this.cotransform = function(adapter, op) {
    if (op.type === "create") {
      adapter.create(op.val);
    }
    else if (op.type === "delete") {
      adapter.delete(op.val);
    }
    // type = 'update' or 'set'
    else {

      var prop = this.resolve(op.path);
      var value = prop.get();

      var oldValue;

      // Attention: this happens when updates and deletions are within one compound
      // The operation gets applied, finally the node is deleted.
      // Listeners are triggered afterwards, so they can not rely on the node being there
      // anymore.
      // However, this is not a problem. We can ignore this update as there will come
      // a deletion anyways.
      if (value === undefined) {
        return;
      }

      if (op.type === "set") {
        oldValue = op.original;
      } else {
        oldValue = op.diff.invert().apply(_.clone(value));
      }

      adapter.update(prop.node, prop.key, value, oldValue);
    }
  };

  this.addIndex = function(name, options) {
    if (this.indexes[name]) {
      throw new GraphError("Index with name " + name + "already exists.");
    }
    var index = new Index(this, options);
    this.indexes[name] = index;

    return index;
  };

  this.removeIndex = function(name) {
    delete this.indexes[name];
  };
};

// Index Modes
// ----------

Graph.STRICT_INDEXING = 1 << 1;
Graph.DEFAULT_MODE = Graph.STRICT_INDEXING;


// Private Graph implementation
// ============================

Graph.Private = function() {

  var _private = this;

  // Node construction
  // -----------------
  //
  // Safely constructs a new node based on type information
  // Node needs to have a valid type
  // All properties that are not registered, are dropped
  // All properties that don't have a value are replaced using default values for type

  this.createNode = function (schema, node) {
    if (!node.id || !node.type) {
      throw new GraphError("Can not create Node: 'id' and 'type' are mandatory.");
    }

    var type = schema.type(node.type);
    if (!type) {
      throw new GraphError("Type '"+node.type+"' not found in the schema");
    }

    var properties = schema.properties(node.type);
    var freshNode = { type: node.type, id: node.id };

    // Start constructing the fresh node
    _.each(properties, function(p, key) {
      // Find property base type
      var baseType = schema.propertyBaseType(node.type, key);

      // Assign user defined property value or use default value for baseType
      var val = (node[key] !== undefined) ? node[key] : schema.defaultValue(baseType);
      freshNode[key] = util.deepclone(val);
    });

    return freshNode;
  };

  // Create a new node
  // -----------------
  // Safely constructs a new node
  // Checks for node duplication
  // Adds new node to indexes
  this.create = function(node) {
    var newNode = _private.createNode(this.schema, node);
    if (this.contains(newNode.id)) {
      throw new GraphError("Node already exists: " + newNode.id);
    }
    this.nodes[newNode.id] = newNode;
    this.trigger("node:created", newNode);
    return this;
  };

  // Remove a node
  // -----------
  // Deletes node by id, referenced nodes remain untouched
  // Removes node from indexes
  this.delete = function(node) {
    delete this.nodes[node.id];
    this.trigger("node:deleted", node.id);
  };

  this.set = function(path, value) {
    var property = this.resolve(path);
    var oldValue = util.deepclone(property.get());
    property.set(value);
    this.trigger("property:set", path, oldValue, value);
  };

  var _triggerPropertyUpdate = function(path, diff) {
    Operator.Helpers.each(diff, function(op) {
      this.trigger('property:updated', path, op, this);
    }, this);
  };

  this.update = function(path, value, diff) {
    var property = this.resolve(path);
    property.set(value);
    _triggerPropertyUpdate.call(this, path, diff);
  };

  this.queryArray = function(arr, type) {
    if (!_.isArray(type)) {
      throw new GraphError("Illegal argument: array types must be specified as ['array'(, 'array')*, <type>]");
    }
    var result, idx;
    if (type[1] === "array") {
      result = [];
      for (idx = 0; idx < arr.length; idx++) {
        result.push(_private.queryArray.call(this, arr[idx], type.slice(1)));
      }
    } else if (!isValueType(type[1])) {
      result = [];
      for (idx = 0; idx < arr.length; idx++) {
        result.push(this.get(arr[idx]));
      }
    } else {
      result = arr;
    }
    return result;
  };

};

Graph.prototype = new Graph.Prototype();

// ObjectOperation Adapter
// ========
//
// This adapter delegates object changes as supported by Operator.ObjectOperation
// to graph methods

Graph.ObjectAdapter = function(graph) {
  this.graph = graph;
};

Graph.ObjectAdapter.Prototype = function() {
  var impl = new Graph.Private();

  this.get = function(path) {
    var prop = this.graph.resolve(path);
    return prop.get();
  };

  this.create = function(__, value) {
    // Note: only nodes (top-level) can be created
    impl.create.call(this.graph, value);
  };

  this.set = function(path, value) {
    impl.set.call(this.graph, path, value);
  };

  this.update = function(path, value, diff) {
    impl.update.call(this.graph, path, value, diff);
  };

  this.delete = function(__, value) {
    // Note: only nodes (top-level) can be deleted
    impl.delete.call(this.graph, value);
  };

  this.inplace = function() { return false; };
};

Graph.ObjectAdapter.Prototype.prototype = Operator.ObjectOperation.Object.prototype;
Graph.ObjectAdapter.prototype = new Graph.ObjectAdapter.Prototype();

Graph.Schema = Schema;
Graph.Property = Property;

Graph.PersistenceAdapter = PersistenceAdapter;
Graph.ChronicleAdapter = ChronicleAdapter;
Graph.Index = Index;

// Exports
// ========

module.exports = Graph;

},{"./chronicle_adapter":95,"./graph_index":97,"./persistence_adapter":98,"./property":99,"./schema":100,"substance-chronicle":73,"substance-operator":175,"substance-util":207,"underscore":212}],97:[function(require,module,exports){
var _ = require("underscore");
var util = require("substance-util");

// Creates an index for the document applying a given node filter function
// and grouping using a given key function
// --------
//
// - document: a document instance
// - filter: a function that takes a node and returns true if the node should be indexed
// - key: a function that provides a path for scoped indexing (default: returns empty path)
//

var Index = function(graph, options) {
  options = options || {};

  this.graph = graph;

  this.nodes = {};
  this.scopes = {};

  if (options.filter) {
    this.filter = options.filter;
  } else if (options.types) {
    this.filter = Index.typeFilter(graph.schema, options.types);
  }

  if (options.property) {
    this.property = options.property;
  }

  this.createIndex();
};

Index.Prototype = function() {

  // Resolves a sub-hierarchy of the index via a given path
  // --------
  //

  var _resolve = function(path) {
    var index = this;
    if (path !== null) {
      for (var i = 0; i < path.length; i++) {
        var id = path[i];
        index.scopes[id] = index.scopes[id] || { nodes: {}, scopes: {} };
        index = index.scopes[id];
      }
    }
    return index;
  };

  var _getKey = function(node) {
    if (!this.property) return null;
    var key = node[this.property] ? node[this.property] : null;
    if (_.isString(key)) key = [key];
    return key;
  };

  // Accumulates all indexed children of the given (sub-)index
  var _collect = function(index) {
    var result = _.extend({}, index.nodes);
    _.each(index.scopes, function(child, name) {
      if (name !== "nodes") {
        _.extend(result, _collect(child));
      }
    });
    return result;
  };

  var _add = function(key, node) {
    var index = _resolve.call(this, key);
    index.nodes[node.id] = node.id;
  };

  var _remove = function(key, node) {
    var index = _resolve.call(this, key);
    delete index.nodes[node.id];
  };

  // Keeps the index up-to-date when the graph changes.
  // --------
  //

  this.onGraphChange = function(op) {

    var self = this;

    var adapter = {
      create: function(node) {
        if (!self.filter || self.filter(node)) {
          var key = _getKey.call(self, node);
          _add.call(self, key, node);
        }
      },
      delete: function(node) {
        if (!self.filter || self.filter(node)) {
          var key = _getKey.call(self, node);
          _remove.call(self, key, node);
        }
      },
      update: function(node, property, newValue, oldValue) {
        if ((self.property === property) && (!self.filter || self.filter(node))) {
          var key = oldValue;
          if (_.isString(key)) key = [key];
          _remove.call(self, key, node);
          key = newValue;
          if (_.isString(key)) key = [key];
          _add.call(self, key, node);
        }
      }
    };

    this.graph.cotransform(adapter, op);
  };

  // Initializes the index
  // --------
  //

  this.createIndex = function() {
    this.reset();

    var nodes = this.graph.nodes;
    _.each(nodes, function(node) {
      if (!this.filter || this.filter(node)) {
        var key = _getKey.call(this, node);
        _add.call(this, key, node);
      }
    }, this);
  };

  // Collects all indexed nodes using a given path for scoping
  // --------
  //

  this.get = function(path) {
    if (arguments.length === 0) {
      path = null;
    } else if (_.isString(path)) {
      path = [path];
    }

    var index = _resolve.call(this, path);
    var result;

    // EXPERIMENTAL: do we need the ability to retrieve indexed elements non-recursively
    // for now...
    // if so... we would need an paramater to prevent recursion
    // E.g.:
    //     if (shallow) {
    //       result = index.nodes;
    //     }
    result = _collect(index);

    _.each(result, function(id) {
      result[id] = this.graph.get(id);
    }, this);

    return result;
  };

  this.reset = function() {
    this.nodes = {};
    this.scopes = {};
  };

  this.dispose = function() {
    this.stopListening();
  };
};

Index.prototype = _.extend(new Index.Prototype(), util.Events.Listener);

Index.typeFilter = function(schema, types) {
  return function(node) {
    var typeChain = schema.typeChain(node.type);
    for (var i = 0; i < types.length; i++) {
      if (typeChain.indexOf(types[i]) >= 0) {
        return true;
      }
    }
    return false;
  };
};

module.exports = Index;

},{"substance-util":207,"underscore":212}],98:[function(require,module,exports){
"use strict";

var Operator = require('substance-operator');

var PersistenceAdapter = function(delegate, nodes) {
  this.delegate = delegate;
  this.nodes = nodes;
};

PersistenceAdapter.Prototype = function() {

  this.get = function(path) {
    return this.delegate.get(path);
  };

  this.create = function(__, value) {
    this.delegate.create(__, value);
    this.nodes.set(value.id, value);
  };

  this.set = function(path, value) {
    this.delegate.set(path, value);
    // TODO: is it ok to store the value as node???
    var nodeId = path[0];
    var updated = this.delegate.get([nodeId]);
    this.nodes.set(nodeId, updated);
  };

  this.delete = function(__, value) {
    this.delegate.delete(__, value);
    this.nodes.delete(value.id);
  };

  this.inplace = function() {
    return false;
  };
};
PersistenceAdapter.Prototype.prototype = Operator.ObjectOperation.Object.prototype;
PersistenceAdapter.prototype = new PersistenceAdapter.Prototype();

module.exports = PersistenceAdapter;

},{"substance-operator":175}],99:[function(require,module,exports){
"use strict";

var _ = require("underscore");

var Property = function(graph, path) {
  if (!path) {
    throw new Error("Illegal argument: path is null/undefined.");
  }

  this.graph = graph;
  this.schema = graph.schema;

  _.extend(this, this.resolve(path));
};

Property.Prototype = function() {

  this.resolve = function(path) {
    var node = this.graph;
    var parent = node;
    var type = "graph";

    var key;
    var value;

    var idx = 0;
    for (; idx < path.length; idx++) {

      // TODO: check if the property references a node type
      if (type === "graph" || this.schema.types[type] !== undefined) {
        // remember the last node type
        parent = this.graph.get(path[idx]);

        if (parent === undefined) {
          //throw new Error("Key error: could not find element for path " + JSON.stringify(path));
          return undefined;
        }

        node = parent;
        type = this.schema.properties(parent.type);
        value = node;
        key = undefined;
      } else {
        if (parent === undefined) {
          //throw new Error("Key error: could not find element for path " + JSON.stringify(path));
          return undefined;
        }
        key = path[idx];
        var propName = path[idx];
        type = type[propName];
        value = parent[key];

        if (idx < path.length-1) {
          parent = parent[propName];
        }
      }
    }

    return {
      node: node,
      parent: parent,
      type: type,
      key: key,
      value: value
    };

  };

  this.get = function() {
    if (this.key !== undefined) {
      return this.parent[this.key];
    } else {
      return this.node;
    }
  };

  this.set = function(value) {
    if (this.key !== undefined) {
      this.parent[this.key] = this.schema.parseValue(this.baseType, value);
    } else {
      throw new Error("'set' is only supported for node properties.");
    }
  };

};
Property.prototype = new Property.Prototype();
Object.defineProperties(Property.prototype, {
  baseType: {
    get: function() {
      if (_.isArray(this.type)) return this.type[0];
      else return this.type;
    }
  },
  path: {
    get: function() {
      return [this.node.id, this.key];
    }
  }
});

module.exports = Property;

},{"underscore":212}],100:[function(require,module,exports){
"use strict";

var _ = require("underscore");
var util = require("substance-util");


// Data.Schema
// ========
//
// Provides a schema inspection API

var Schema = function(schema) {
  _.extend(this, schema);
};

Schema.Prototype = function() {

  // Return Default value for a given type
  // --------
  //

  this.defaultValue = function(valueType) {
    if (valueType === "object") return {};
    if (valueType === "array") return [];
    if (valueType === "string") return "";
    if (valueType === "number") return 0;
    if (valueType === "boolean") return false;
    if (valueType === "date") return new Date();

    return null;
    // throw new Error("Unknown value type: " + valueType);
  };

  // Return type object for a given type id
  // --------
  //

  this.parseValue = function(valueType, value) {
    if (value === null) {
      return value;
    }

    if (_.isString(value)) {
      if (valueType === "object") return JSON.parse(value);
      if (valueType === "array") return JSON.parse(value);
      if (valueType === "string") return value;
      if (valueType === "number") return parseInt(value, 10);
      if (valueType === "boolean") {
        if (value === "true") return true;
        else if (value === "false") return false;
        else throw new Error("Can not parse boolean value from: " + value);
      }
      if (valueType === "date") return new Date(value);

      // all other types must be string compatible ??
      return value;

    } else {
      if (valueType === 'array') {
        if (!_.isArray(value)) {
          throw new Error("Illegal value type: expected array.");
        }
        value = util.deepclone(value);
      }
      else if (valueType === 'string') {
        if (!_.isString(value)) {
          throw new Error("Illegal value type: expected string.");
        }
      }
      else if (valueType === 'object') {
        if (!_.isObject(value)) {
          throw new Error("Illegal value type: expected object.");
        }
        value = util.deepclone(value);
      }
      else if (valueType === 'number') {
        if (!_.isNumber(value)) {
          throw new Error("Illegal value type: expected number.");
        }
      }
      else if (valueType === 'boolean') {
        if (!_.isBoolean(value)) {
          throw new Error("Illegal value type: expected boolean.");
        }
      }
      else if (valueType === 'date') {
        value = new Date(value);
      }
      else {
        throw new Error("Unsupported value type: " + valueType);
      }
      return value;
    }
  };

  // Return type object for a given type id
  // --------
  //

  this.type = function(typeId) {
    return this.types[typeId];
  };

  // For a given type id return the type hierarchy
  // --------
  //
  // => ["base_type", "specific_type"]

  this.typeChain = function(typeId) {
    var type = this.types[typeId];
    if (!type) {
      throw new Error('Type ' + typeId + ' not found in schema');
    }

    var chain = (type.parent) ? this.typeChain(type.parent) : [];
    chain.push(typeId);
    return chain;
  };

  this.isInstanceOf = function(type, parentType) {
    var typeChain = this.typeChain(type);
    if (typeChain && typeChain.indexOf(parentType) >= 0) {
      return true;
    } else {
      return false;
    }
  };

  // Provides the top-most parent type of a given type.
  // --------
  //

  this.baseType = function(typeId) {
    return this.typeChain(typeId)[0];
  };

  // Return all properties for a given type
  // --------
  //

  this.properties = function(type) {
    type = _.isObject(type) ? type : this.type(type);
    var result = (type.parent) ? this.properties(type.parent) : {};
    _.extend(result, type.properties);
    return result;
  };

  // Returns the full type for a given property
  // --------
  //
  // => ["array", "string"]

  this.propertyType = function(type, property) {
    var properties = this.properties(type);
    var propertyType = properties[property];
    if (!propertyType) throw new Error("Property not found for" + type +'.'+property);
    return _.isArray(propertyType) ? propertyType : [propertyType];
  };

  // Returns the base type for a given property
  // --------
  //
  //  ["string"] => "string"
  //  ["array", "string"] => "array"

  this.propertyBaseType = function(type, property) {
    return this.propertyType(type, property)[0];
  };
};

Schema.prototype = new Schema.Prototype();

module.exports = Schema;

},{"substance-util":207,"underscore":212}],101:[function(require,module,exports){
"use strict";

// Import
// ========

var _    = require('underscore');
var Test = require('substance-test');
var assert = Test.assert;
var registerTest = Test.registerTest;
var util = require('substance-util');

var Operator = require('substance-operator');
var Data = require('../index');
var Chronicle = require('substance-chronicle');


// Test
// ========

var test = {};

var SCHEMA = {
  "views": {
    // Stores order for content nodes
    "content": {
    }
  },

  // static indexes
  "indexes": {
    // all comments are now indexed by node association
    "comments": {
      "type": "comment",
      "properties": ["node"]
    },
    // All comments are now indexed by node
    "annotations": {
      "type": "annotation", // alternatively [type1, type2]
      "properties": ["node"]
    }
  },

  "types": {
    // Specific type for substance documents, holding all content elements
    "content": {
      "properties": {

      }
    },
    "text": {
      "parent": "content",
      "properties": {
        "content": "string"
      }
    },

    "document": {
      "properties": {
        "views": "array"
      }
    },

    "view": {
      "properties": {
        "nodes": "array"
      }
    },

    "code": {
      "parent": "content",
      "properties": {
        "content": "string"
      }
    },
    "image": {
      "parent": "content",
      "properties": {
        "large": "string",
        "medium": "string",
        "caption": "string"
      }
    },
    "heading": {
      // TODO: this has been duplicate
      // "parent": "node",
      "properties": {
        "content": "string",
        "level": "number"
      },
      "parent": "content"
    },
    // Annotations
    "annotation": {
      "properties": {
        "node": "node",
        "pos": "object"
      }
    },
    "strong": {
      "properties": {
        "node": "string", // should be type:node
        "pos": "object"
      },
      "parent": "annotation"
    },
    "emphasis": {
      "properties": {
        "node": "string", // should be type:node
        "pos": "object"
      },
      "parent": "annotation"
    },
    "inline-code": {
      "parent": "annotation",
      "properties": {
        "node": "string", // should be type:node
        "pos": "object"
      }
    },
    "link": {
      "parent": "annotation",
      "properties": {
        "node": "string", // should be type:node
        "pos": "object",
        "url": "string"
      }
    },
    "idea": {
      "parent": "annotation",
      "properties": {
        "node": "string", // should be type:node
        "pos": "object",
        "url": "string"
      }
    },
    "error": {
      "parent": "annotation",
      "properties": {
        "node": "string", // should be type:node
        "pos": "object",
        "url": "string",
      }
    },
    "question": {
      "parent": "annotation",
      "properties": {
        "node": "string", // should be type:node
        "pos": "object",
        "url": "string"
      }
    },
    // Comments
    "comment": {
      "properties": {
        "content": "string",
        "node": "node"
      }
    }
  }
};


var OP1 = Operator.ObjectOperation.Create(["document"], { "id": "document", "type": "document", "views": ["content", "figures"]});
var OP2 = Operator.ObjectOperation.Create(["content"], { "id": "content", "type": "view", "nodes": []} );
var OP3 = Operator.ObjectOperation.Create(["h1"], { "id": "h1", "type": "heading", "content": "Heading 1" } );
var OP4 = Operator.ObjectOperation.Update(["content", "nodes"], Operator.ArrayOperation.Insert(0, "h1"));
var OP5 = Operator.ObjectOperation.Create(["text1"], { "id": "text1", "type": "text", "content": "This is text1." } );
var OP6 = Operator.ObjectOperation.Update(["content", "nodes"], Operator.ArrayOperation.Insert(1, "text1") );
var OP7 = Operator.ObjectOperation.Update(["content", "nodes"], Operator.ArrayOperation.Move(1, 0) );
var OP8 = Operator.ObjectOperation.Create(["text2"], { "id": "text2", "type": "text", "content": "This is text2." } );
var OP9 = Operator.ObjectOperation.Update(["content", "nodes"], Operator.ArrayOperation.Insert(1, "text2") );

// Graph:
//
//  ROOT -    1 -   2 -   3 -   4 -   5 -   6 -   7
//                              |                   \
//                              |                     M1 (5,6,8,9,7)
//                              |                   /
//                              | -   8 -   9 -    -
//
//
//

test.setup = function() {
  this.graph = new Data.Graph(SCHEMA, {chronicle: Chronicle.create()});
  this.chronicle = this.graph.chronicle;
  this.index = this.chronicle.index;
  this.adapter = this.graph.chronicle.versioned;

  this.ID = ["ROOT"];
  this.M = ["ROOT"];

  var self = this;
  this.CHECKS = {"ROOT": function() {
    assert.isTrue(_.isEmpty(self.graph.nodes));
  }};
  this.chronicle.uuid = util.uuidGen("");

};

test.actions = [

  "Creation", function() {
    var check;
    var self = this;

    this.CHECKS["ROOT"]();

    this.graph.apply(OP1);
    this.ID.push(this.chronicle.getState());
    this.CHECKS[_.last(this.ID)] = check = function() {
      assert.isArrayEqual(["content", "figures"], self.graph.get("document").views);
    };
    check();

    this.graph.apply(OP2);
    this.ID.push(this.chronicle.getState());
    this.CHECKS[_.last(this.ID)] = check = function() {
      assert.isArrayEqual([], self.graph.get("content").nodes);
    };
    check();

    this.graph.apply(OP3);
    this.ID.push(this.chronicle.getState());
    this.CHECKS[_.last(this.ID)] = check = function() {
      assert.isEqual("Heading 1", self.graph.get("h1").content);
    };
    check();

    this.graph.apply(OP4);
    this.ID.push(this.chronicle.getState());
    this.CHECKS[_.last(this.ID)] = check = function() {
      assert.isArrayEqual(["h1"], self.graph.get("content").nodes);
    };
    check();

    this.graph.apply(OP5);
    this.ID.push(this.chronicle.getState());
    this.CHECKS[_.last(this.ID)] = check = function() {
      assert.isEqual("This is text1.", self.graph.get("text1").content);
    };
    check();

    this.graph.apply(OP6);
    this.ID.push(this.chronicle.getState());
    this.CHECKS[_.last(this.ID)] = check = function() {
      assert.isArrayEqual(["h1", "text1"], self.graph.get("content").nodes);
    };
    check();

    this.graph.apply(OP7);
    this.ID.push(this.chronicle.getState());
    this.CHECKS[_.last(this.ID)] = check = function() {
      assert.isArrayEqual(["text1", "h1"], self.graph.get("content").nodes);
    };
    check();
  },

  "Random checkout", function() {
    this.graph.reset();

    var sequence = ["1", "7", "5", "4", "3", "2", "6"];

    _.each(sequence, function(id) {
      this.chronicle.open(id);
      this.CHECKS[id].call(this);
    }, this);
  },

  "Merge", function() {
    this.chronicle.open(this.ID[4]);
    this.graph.apply(OP8);
    this.ID.push(this.chronicle.getState());
    this.graph.apply(OP9);
    this.ID.push(this.chronicle.getState());

    this.chronicle.open(this.ID[7]);
    var mergeOptions = {
      sequence: [this.ID[5], this.ID[6], this.ID[8], this.ID[9], this.ID[7]],
      force: true
    };
    this.chronicle.merge(this.ID[9], "manual", mergeOptions);
    this.M.push(this.chronicle.getState());

    assert.isArrayEqual(["text1", "h1", "text2"], this.graph.get("content").nodes);
  },

];

registerTest(['Substance.Data', 'Versioned Graph'], test);

},{"../index":94,"substance-chronicle":73,"substance-operator":175,"substance-test":198,"substance-util":207,"underscore":212}],102:[function(require,module,exports){
"use strict";

// Import
// ========

var Test = require('substance-test');
var assert = Test.assert;
var registerTest = Test.registerTest;

var Operator = require('substance-operator');
var Data = require('../index');
var MemoryStore = require('substance-store').MemoryStore;


// Test
// ========

var test = {};

var SCHEMA = {
  indexes : {
    "all": {
      "type": "node",
    },
    "foos": {
      "type": "foo",
    },
    "bars": {
      "type": "bar",
    },
    "by_category": {
      "type": "node",
      "properties": ["category"]
    }
  },
  types: {
    node: {
      properties: {
        category: "string"
      }
    },
    foo: {
      parent: "node"
    },
    bar: {
      parent: "node"
    }
  }
};

test.setup = function() {
  this.store = new MemoryStore();
  this.graph = new Data.Graph(SCHEMA, {store: this.store});
  this.nodes = this.graph.__nodes__;
};

var NODE1 = {
  id: "the_foo",
  type: "foo",
  category: "bla"
};
var NODE2 = {
  id: "the_bar",
  type: "bar",
  category: "blupp"
};

test.actions = [
  "Created node should be persisted", function() {
    this.graph.create(NODE1);
    this.graph.create(NODE2);

    var actual = this.nodes.get(NODE1.id);
    assert.isDeepEqual(NODE1, actual);

    actual = this.nodes.get(NODE2.id);
    assert.isDeepEqual(NODE2, actual);
  },

  "Deleted node should be removed from store", function() {
    this.graph.delete(NODE1.id);

    var actual = this.nodes.get(NODE1.id);
    assert.isUndefined(actual);
  },

  "Update: property updates should be persisted", function() {
    this.graph.update([NODE2.id, "category"], Operator.TextOperation.fromOT("blupp", [2, -3, "a"]));

    var actual = this.nodes.get(NODE2.id);
    assert.isEqual("bla", actual.category);
  },

  "Set: property updates should be persisted", function() {
    this.graph.set([NODE2.id, "category"], "blupp");

    var actual = this.nodes.get(NODE2.id);
    assert.isEqual("blupp", actual.category);
  },

  "Import: persisted graph should be restored", function() {
    var graph = new Data.Graph(SCHEMA, {store: this.store}).load();
    var actual = graph.get(NODE2.id);
    assert.isDeepEqual(NODE2, actual);
  }
];

registerTest(['Substance.Data', 'Persistent Graph'], test);

},{"../index":94,"substance-operator":175,"substance-store":188,"substance-test":198}],103:[function(require,module,exports){
"use strict";

// Import
// ========

var _ = require('underscore');
var util = require('substance-util');
var Test = require('substance-test');
var assert = Test.assert;
var registerTest = Test.registerTest;
var Data = require('../index');
var Operator = require('substance-operator');


var SCHEMA = {
  types: {
    node: {
      properties: {
        val: ["string"],
        arr: ["array", "string"]
      }
    }
  }
};

// Test
// ========

var GraphEventsTest = function() {

  this.setup = function() {
    this.graph = new Data.Graph(SCHEMA);
    this.schema = this.graph.schema;

    this.graph.create({
      id: "foo",
      type: "node",
      val: "foo",
      arr: ["bla","blupp"]
    });
  };

  function _listener() {
    var call_me = function() {
      call_me.called++;
      call_me.args = arguments;
    };
    call_me.called = 0;
    call_me.args = undefined;

    return call_me;
  }

  this.actions = [

    "Notification on Node Creation", function() {
      this.setup();

      var listener = _listener();

      this.listenTo(this.graph, "node:created", listener);

      var node = {
        id: "001",
        type: "node",
        val: "0",
        arr: ["1","2"]
      };
      this.graph.create(node);

      assert.isEqual(1, listener.called);
      assert.isObjectEqual(node, listener.args[0]);

      this.stopListening();
    },

    "Notification on Node Deletion", function() {
      this.setup();

      var listener = _listener();
      this.listenTo(this.graph, "node:deleted", listener);

      this.graph.delete("foo");

      assert.isEqual(1, listener.called);
      assert.isEqual("foo", listener.args[0]);

      this.stopListening();
    },

    "Notification on Property Set", function() {
      this.setup();

      var listener = _listener();
      this.listenTo(this.graph, "property:set", listener);

      this.graph.set(["foo", "val"], "bar");

      assert.isEqual(1, listener.called);
      assert.isDeepEqual([["foo", "val"], "foo", "bar"], _.toArray(listener.args));

      this.stopListening();
    },

    "Notification on Property Update", function() {
      this.setup();

      var listener = _listener();
      this.listenTo(this.graph, "property:updated", listener);

      // Attention: these are actuall two atomic operations: Delete + Insert
      // Thus the listener is called twice
      this.graph.update(["foo", "val"], [-3, "bla"]);

      assert.isEqual(2, listener.called);
      assert.isArrayEqual(["foo", "val"],listener.args[0]);
      assert.isTrue(listener.args[1] instanceof Operator.Operation);

      this.stopListening();
    },

    "Notification with Compounds", function() {
      this.setup();

      var set_listener = _listener();
      var update_listener = _listener();

      this.listenTo(this.graph, "property:set", set_listener);
      this.listenTo(this.graph, "property:updated", update_listener);

      var ops = [
        Operator.ObjectOperation.Set(["foo", "val"], "foo", "bar"),
        Operator.ObjectOperation.Update(["foo", "val"], Operator.TextOperation.Insert(0, "bla")),
      ];
      var compound = Operator.ObjectOperation.Compound(ops);

      this.graph.apply(compound);

      assert.isEqual(1, set_listener.called);
      assert.isEqual(1, update_listener.called);

      this.stopListening();
    },

    "Generic Operation Notification", function() {
      this.setup();

      var listener = _listener();
      this.listenTo(this.graph, "operation:applied", listener);

      this.graph.set(["foo", "val"], "bar");

      assert.isEqual(1, listener.called);
      assert.isTrue(listener.args[0] instanceof Operator.Operation);

      this.stopListening();
    },

    "Generic Operation Notification with Compounds", function() {
      this.setup();

      var listener = _listener();
      this.listenTo(this.graph, "operation:applied", listener);

      var ops = [
        Operator.ObjectOperation.Set(["foo", "val"], "foo", "bar"),
        Operator.ObjectOperation.Update(["foo", "val"], Operator.TextOperation.Insert(0, "bla")),
      ];
      var compound = Operator.ObjectOperation.Compound(ops);

      this.graph.apply(compound);

      assert.isEqual(2, listener.called);

      this.stopListening();
    }

  ];
};

_.extend(GraphEventsTest.prototype, util.Events.Listener);


registerTest(['Substance.Data', 'Graph Events'], new GraphEventsTest());

},{"../index":94,"substance-operator":175,"substance-test":198,"substance-util":207,"underscore":212}],104:[function(require,module,exports){
"use strict";

// Import
// ========

var _    = require('underscore');
var Test = require('substance-test');
var assert = Test.assert;
var registerTest = Test.registerTest;
var Data = require('../index');
var Chronicle = require("substance-chronicle");


// Test
// ========

var SCHEMA = {
  id: "test_schema",
  version: "1.0.0",
  types: {
    node: {
      properties: {
        category: "string"
      }
    },
    foo: {
      parent: "node"
    },
    bar: {
      parent: "node"
    }
  }
};

var GraphIndexTest = function() {

  this.setup = function() {
    this.graph = new Data.Graph(SCHEMA, {chronicle: Chronicle.create({mode: Chronicle.HYSTERICAL})});
    this.schema = this.graph.schema;
    this.all = this.graph.addIndex("all", {
      types: ["foo", "bar"]
    });
    this.foos = this.graph.addIndex( "foos", {
      types: ["foo"]
    });
    this.bars = this.graph.addIndex( "bars", {
      types: ["bar"]
    });
    this.byCategory = this.graph.addIndex( "by_category", {
      types: ["foo", "bar"],
      property: "category"
    });
  };

  function getIds(arr) {
    return _.map(arr, function(n) { return n.id; }).sort();
  }

  this.actions = [

    "Created nodes should be added to indexes", function() {
      var node = {
        id: "foo1",
        type: "foo",
        category: "bla"
      };
      this.graph.create(node);

      node = {
        id: "bar1",
        type: "bar",
        category: "blupp"
      };
      this.graph.create(node);

      var all = getIds(this.all.get());
      assert.isArrayEqual(["bar1", "foo1"], all);

      var foos = getIds(this.foos.get());
      assert.isArrayEqual(["foo1"], foos);

      var bars = getIds(this.bars.get());
      assert.isArrayEqual(["bar1"], bars);

      var by_bla = getIds(this.byCategory.get("bla"));
      assert.isArrayEqual(["foo1"], by_bla);

      var by_blupp = getIds(this.byCategory.get("blupp"));
      assert.isArrayEqual(["bar1"], by_blupp);
    },

    "Deleted nodes should be removed from indexes", function() {
      this.graph.delete("foo1");

      var all = getIds(this.all.get());
      assert.isArrayEqual(["bar1"], all);

      var foos = getIds(this.foos.get());
      assert.isArrayEqual([], foos);

      var bars = getIds(this.bars.get());
      assert.isArrayEqual(["bar1"], bars);

      var by_bla = getIds(this.byCategory.get("bla"));
      assert.isArrayEqual([], by_bla);

      var by_blupp = getIds(this.byCategory.get("blupp"));
      assert.isArrayEqual(["bar1"], by_blupp);
    },

    "Updates of indexed properties should update indexes", function() {
      this.graph.set(["bar1", "category"], "bla");

      var all = getIds(this.all.get());
      assert.isArrayEqual(["bar1"], all);

      var foos = getIds(this.foos.get());
      assert.isArrayEqual([], foos);

      var bars = getIds(this.bars.get());
      assert.isArrayEqual(["bar1"], bars);

      var by_bla = getIds(this.byCategory.get("bla"));
      assert.isArrayEqual(["bar1"], by_bla);

      var by_blupp = getIds(this.byCategory.get("blupp"));
      assert.isArrayEqual([], by_blupp);
    },

    "Be smart about missing properties on nodes", function() {
      // Missing the category property
      var node = {
        id: "foo2",
        type: "foo"
      };
      this.graph.create(node);

      // Index remains untouched
      var by_bla = getIds(this.byCategory.get("bla"));
      assert.isArrayEqual(["bar1"], by_bla);
      var by_blupp = getIds(this.byCategory.get("blupp"));
      assert.isArrayEqual([], by_blupp);
    }
  ];
};

registerTest(['Substance.Data', 'Graph Indexes'], new GraphIndexTest());

},{"../index":94,"substance-chronicle":73,"substance-test":198,"underscore":212}],105:[function(require,module,exports){
"use strict";

// Import
// ========

var _    = require('underscore');
var Test = require('substance-test');
var assert = Test.assert;
var registerTest = Test.registerTest;
var Operator = require('substance-operator');
var Data = require('../index');


// Test
// ========

var SCHEMA = {
  id: "test_schema",
  version: "1.0.0",
  types: {
    node: {
      properties: {
        name: "string",
      }
    },
    strings: {
      parent: "node",
      properties: {
        val: ["string"],
        arr: ["array", "string"]
      }
    },
    numbers: {
      parent: "node",
      properties: {
        val: ["number"],
        arr: ["array", "number"]
      }
    },
    booleans: {
      parent: "node",
      properties: {
        val: ["boolean"],
        arr: ["array", "boolean"]
      }
    },
    dates: {
      parent: "node",
      properties: {
        val: ["date"],
        arr: ["array", "date"]
      }
    },
    custom: {
      parent: "node",
      properties: {
        val: ["object"],
      }
    },
    item: {},
    linked_item: {
      parent: "item",
      properties: {
        next: "item"
      }
    },
    collection: {
      properties: {
        items: ["array", "item"]
      }
    },
    table: {
      properties: {
        items: ["array", "array", "item"]
      }
    }
  },
};

function getIds(arr) {
  return _.map(arr, function(n) { return n.id; });
}

var GraphManipulationTest = function() {

  this.setup = function() {
    this.graph = new Data.Graph(SCHEMA);
    this.schema = this.graph.schema;

    this.graph.create({
      id: "the_strings",
      type: "strings",
      name: "Strings",
      val: "foo",
      arr: ["bla","blupp"]
    });

    this.graph.create({
      id: "the_numbers",
      type: "numbers",
      name: "Numbers",
      val: 11,
      arr: [1,2,3]
    });

    this.graph.create({
      id: "the_booleans",
      type: "booleans",
      name: "Booleans",
      val: true,
      arr: [false, true]
    });

    this.graph.create({
      id: "the_dates",
      type: "dates",
      name: "Dates",
      val: new Date(1000),
      arr: [new Date(1000),new Date(2000)]
    });

    this.graph.create({
      id: "the_custom",
      type: "custom",
      name: "Custom",
      val: { a: { foo: "bar"}, bla: "blupp" },
    });

    this.graph.create({id: "i1", type: "linked_item", next: null});
    this.graph.create({id: "i2", type: "linked_item", next: "i1"});
    this.graph.create({id: "i3", type: "linked_item", next: "i2"});
    this.graph.create({id: "c1", type: "collection", items: ["i1", "i3"]});
    this.graph.create({id: "t1", type: "table", items: [["i1", "i3"], ["i2", "i3"]]});

  };

  this.actions = [

    "Node creation.", function() {
      var node = {
        id: "n1",
        type: "numbers",
        name: "Numbers 1",
        foo: "bar",
        val: 11,
        arr: [1,2,3]
      };
      this.graph.create(node);

      // the node should be accessible via id now
      var newNode = this.graph.get(node.id);
      assert.isDefined(newNode);

      assert.isEqual(node.name, newNode.name);
      assert.isEqual(node.val, newNode.val);
      assert.isArrayEqual(node.arr, newNode.arr);

      // the node is newly created
      node.bla = "blupp";
      assert.isUndefined(newNode.bla);

      // ... and values are deeply cloned
      node.arr.push(4);
      assert.isFalse(_.isEqual(node.arr, newNode.arr));

      // only properties that are specified in the schema should be copied
      assert.isUndefined(newNode.foo);
    },

    "Node creation: 'id' and 'type' are mandatory", function() {
      assert.exception(function() {
        this.graph.create({});
      }, this);
    },

    "Node creation: 'type' must be defined in schema", function() {
      var node = {id: "aaa", type: "unknown_type"};
      assert.exception(function() {
        this.graph.create(node);
      }, this);
    },

    "Node creation: should use default values for incomplete data", function() {
      var node = {
        id: "n2",
        type: "numbers",
      };
      this.graph.create(node);

      var newNode = this.graph.get(node.id);

      assert.isEqual("", newNode.name);
      assert.isEqual(0, newNode.val);
      assert.isArrayEqual([], newNode.arr);
    },

    "Node deletion", function() {
      var id = "n1";
      this.graph.delete(id);
      assert.isUndefined(this.graph.get(id));
    },

    "Node creation: should reject duplicate creations", function() {
      var node = {
        id: "n2",
        type: "numbers",
      };
      assert.exception(function() {
        this.graph.create(node);
        this.graph.create(node);
      }, this);
    },

    "Reset fixture", function() {
      this.setup();
    },

    "Update 'object'", function() {
      // Maybe it would be helpful to have some convenience mechanism
      // to create node property updates more easily

      var valueUpdate = Operator.TextOperation.fromOT("bar", [1, -1, "e", 1, "ry"]);
      var propertyUpdate = Operator.ObjectOperation.Update(["a", "foo"], valueUpdate);
      this.graph.update(["the_custom", "val"], propertyUpdate);

      var custom = this.graph.get("the_custom");
      assert.isEqual("berry", custom.val.a.foo);
    },

    "Update 'array'", function() {
      this.graph.update(["the_numbers", "arr"], ["+", 3, 4]);

      var numbers = this.graph.get("the_numbers");
      assert.isArrayEqual([1,2,3,4], numbers.arr);
    },

    "Update 'string'", function() {
      this.graph.update(["the_strings", "val"], [3, "tball"]);

      var strings = this.graph.get("the_strings");
      assert.isEqual("football", strings.val);
    },

    "Update 'number'", function() {
      this.graph.set(["the_numbers", "val"], 42);

      var numbers = this.graph.get("the_numbers");
      assert.isEqual(42, numbers.val);
    },

    "Update 'boolean'", function() {
      this.graph.set(["the_booleans", "val"], false);

      var booleans = this.graph.get("the_booleans");
      assert.isEqual(false, booleans.val);
    },

    "Update 'date'", function() {
      var date = new Date(1111);
      this.graph.set(["the_dates", "val"], date);

      var dates = this.graph.get("the_dates");
      assert.isEqual(date.getTime(), dates.val.getTime());
    },

    "Query: resolve referenced nodes", function() {
      var path = ["i2", "next"];
      var val = this.graph.get(path);
      assert.isEqual("i1", val);

      var node = this.graph.query(path);
      assert.isEqual("i1", node.id);
    },

    "Query: resolve arrays of references", function() {
      var path = ["c1", "items"];
      var val = this.graph.get(path);
      assert.isArrayEqual(["i1", "i3"], val);

      var nodes = this.graph.query(path);
      var ids = getIds(nodes);
      assert.isArrayEqual(["i1", "i3"], ids);

      path = ["t1", "items"];
      nodes = this.graph.query(path);
      ids = [getIds(nodes[0]), getIds(nodes[1])];
      assert.isDeepEqual([["i1", "i3"], ["i2", "i3"]], ids);
    }
  ];
};

registerTest(['Substance.Data', 'Graph Manipulation'], new GraphManipulationTest());

},{"../index":94,"substance-operator":175,"substance-test":198,"underscore":212}],106:[function(require,module,exports){
require("./schema_test");
require("./graph_manipulation_test");
require("./graph_index_test");
require("./002-versioned-graph");
require("./003-persistent-graph");
require("./004-graph-events");

},{"./002-versioned-graph":101,"./003-persistent-graph":102,"./004-graph-events":103,"./graph_index_test":104,"./graph_manipulation_test":105,"./schema_test":107}],107:[function(require,module,exports){
"use strict";

// Import
// ========

var _    = require('underscore');
var Test = require('substance-test');
var assert = Test.assert;
var registerTest = Test.registerTest;
var Data = require('../index');


// Test
// ========

var SCHEMA = {
  id: "schema-1",
  version: "1.0.0",
  types: {
    elem: {
      properties: {
        obj: "object",
        arr: "array",
        str: "string",
        num: "number",
        flag: "boolean",
        time: "date",
      }
    },
    node: {
      properties: {
        name: "string",
      }
    },
    numbers: {
      parent: "node",
      properties: {
        val: ["number"],
        arr: ["array", "number"]
      }
    },
  }
};

var SchemaTest = function() {

  this.setup = function() {
    this.graph = new Data.Graph(SCHEMA);
    this.schema = this.graph.schema;
  };

  this.actions = [

    "Schema.defaultValue()", function() {

      assert.isDeepEqual({}, this.schema.defaultValue("object"));
      assert.isArrayEqual([], this.schema.defaultValue("array"));
      assert.isEqual("", this.schema.defaultValue("string"));
      assert.isEqual(0, this.schema.defaultValue("number"));
      assert.isEqual(false, this.schema.defaultValue("boolean"));
      // can only check if a default date is given
      assert.isDefined(this.schema.defaultValue("date"));
    },

    "Schema.parseValue()", function() {
      assert.isDeepEqual({a: "bla"}, this.schema.parseValue("object", '{"a": "bla"}'));
      assert.isArrayEqual([1,2,3], this.schema.parseValue("array", '[1,2,3]'));
      assert.isEqual("bla", this.schema.parseValue("string", 'bla'));
      assert.isEqual(42, this.schema.parseValue("number", '42'));
      assert.isEqual(true, this.schema.parseValue("boolean", 'true'));
      var expected = new Date(Date.now());
      var parsedDate = this.schema.parseValue("date", expected.toISOString());
      assert.isEqual(expected.getTime(), parsedDate.getTime());
    },

    "Schema.properties()", function() {
      var props = this.schema.properties("elem");

      assert.isDeepEqual(SCHEMA.types.elem.properties, props);
      // props should be a copy
      props["ooooh"] = "aaaaahh";
      assert.isFalse(_.isEqual(SCHEMA.types.elem.properties, props));
    },

    "Inheritance - type chain", function() {
      var chain = this.schema.typeChain("numbers");
      assert.isArrayEqual(["node", "numbers"], chain);
    },

    "Inheritance - properties", function() {
      var expected = _.extend({}, SCHEMA.types.node.properties, SCHEMA.types.numbers.properties);
      var actual = this.schema.properties("numbers");
      assert.isDeepEqual(expected, actual);
    },

    "Composite types", function() {
      var expected = ["array", "number"];
      var actual = this.schema.propertyType("numbers", "arr");
      assert.isArrayEqual(expected, actual);
    }
  ];
};

registerTest(['Substance.Data', 'Schema'], new SchemaTest());

},{"../index":94,"substance-test":198,"underscore":212}],108:[function(require,module,exports){
"use strict";

var _ = require("underscore");

var Document = require('./src/document');
Document.Annotator = require('./src/annotator');
Document.Container = require('./src/container');
Document.Cursor = require('./src/cursor');
Document.Selection = require('./src/selection');
Document.Controller = require('./src/controller');

Document.Node = require('./src/node');
Document.Composite = require('./src/composite');
// TODO: this should also be moved to 'substance-nodes'
// However, currently there is too much useful in it that is also necessary for the test-suite
// Maybe, we should extract such things into helper functions so that it is easier to
// create custom text based, annotatable nodes.
Document.TextNode = require('./src/text_node');

// Compatibility
Document.Writer = require('./src/controller');

module.exports = Document;

},{"./src/annotator":109,"./src/composite":111,"./src/container":112,"./src/controller":113,"./src/cursor":114,"./src/document":115,"./src/node":116,"./src/selection":117,"./src/text_node":118,"underscore":212}],109:[function(require,module,exports){
"use strict";

// Import
// ========

var _ = require("underscore");
var util = require("substance-util");
var Data = require("substance-data");
var Document = require("./document");
var Selection = require("./selection");
var DocumentError = Document.DocumentError;
var Operator = require("substance-operator");

// Module
// ========

// A class that manages a document's annotations.
// --------
//

var Annotator = function(doc, options) {
  options = options || {};

  this.document = doc;

  // register for co-transformations to keep annotations up2date.
  this.document.on("operation:applied", this.handleOperation, this);

  // defines groups of annotations that will be mutually exclusive
  this.group = {
    "emphasis": "style",
    "strong": "style",
    "link": "style",
    "question": "marker",
    "idea": "marker",
    "error": "marker"
  };


  this.expansion = {
    "emphasis": {
      left: Annotator.isOnNodeStart,
    },
    "strong": {
      left: Annotator.isOnNodeStart,
    }
  };

  this.splittable = ["emphasis", "strong"];

  this._index = Annotator.createIndex(doc);

  this.withTransformation = options.withTransformation;
};

Annotator.Prototype = function() {

  var _getRanges = function(self, sel) {
    var nodes = sel.getNodes();
    var ranges = {};

    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      var range = [0,null];

      // in the first node search only in the trailing part
      if (i === 0) {
        range[0] = sel.startChar();
      }

      // in the last node search only in the leading part
      if (i === nodes.length-1) {
        range[1] = sel.endChar();
      }

      ranges[node.id] = range;
    }

    return ranges;
  };

  // Creates a new annotation
  // --------
  //

  var _create = function(self, path, type, range, data) {
    var annotation = {
      "id": util.uuid(),
      "type": type,
      "path": path,
      "range": range
    };

    if (data) _.extend(annotation, data);
    return self.create(annotation);
  };

  // Deletes an annotation
  // --------
  //
  var _delete = function(self, annotation) {
    self.document.delete(annotation.id);
  };

  var _update = function(self, annotation, newRange) {
    self.document.apply(Operator.ObjectOperation.Set([annotation.id, "range"], annotation.range, newRange));
  };

  // TODO: extract range overlap checking logic into a dedicated Range class
  var _filterByNodeAndRange = function(view, nodeId, range) {
    var annotations = this._index.get(nodeId);

    if (range) {
      var sStart = range[0];
      var sEnd = range[1];

      var filtered = {};

      // Note: this treats all annotations as if they were inclusive (left+right)
      // TODO: maybe we should apply the same rules as for Transformations?
      _.each(annotations, function(a) {
        var aStart = a.range[0];
        var aEnd = a.range[1];

        var overlap = (aEnd >= sStart);

        // Note: it is allowed to give only omit the end part
        if (sEnd) {
          overlap &= aStart <= sEnd;
        }

        if (overlap) {
          filtered[a.id] = a;
        }
      });
      annotations = filtered;
    }

    return annotations;
  };


  // Truncates an existing annotation
  // --------
  // Deletes an annotation that has a collapsed range after truncation.
  // If the annotation is splittable and the given range is an inner segment,
  // the first will be truncated and a second one will be created to annotate the tail.
  // If the annotation is not splittable it will be deleted.

  var _truncate = function(self, annotation, range) {
    var s1 = annotation.range[0];
    var s2 = range[0];
    var e1 = annotation.range[1];
    var e2 = range[1];

    var newRange;

    // truncate all = delete
    if (s1 >= s2 && e1 <= e2) {
      _delete(self, annotation);

    // truncate the head
    } else if (s1 >= s2  && e1 > e2) {
      newRange = [e2, e1];
      _update(self, annotation, newRange);
    }

    // truncate the tail
    else if (s1 < s2 && e1 <= e2) {
      newRange = [s1, s2];
      _update(self, annotation, newRange);
    }
    // from the middle: split or delete
    else {
      if (self.isSplittable(annotation.type)) {
        newRange = [s1, s2];
        _update(self, annotation, newRange);

        var tailRange = [e2, e1];
        _create(self, annotation.path, annotation.type, tailRange);

      } else {
        _delete(self, annotation);
      }
    }
  };

  // Takes care of updating annotations whenever an graph operation is applied.
  // --------
  // Triggers new events dedicated to annotation changes.
  this.handleOperation = function(op) {

    // TODO: it would be great to have some API to retrieve reflection information for an object operation.

    var typeChain, annotations, annotation;

    if (op.type === "delete" || op.type === "create") {

      typeChain = this.document.schema.typeChain(op.val.type);

      // handle creation or deletion of annotations
      if (typeChain.indexOf("annotation") >= 0) {
        annotation = op.val;
        this.triggerLater("annotation:changed", op.type, annotation);
      }
      // handle deletion of other nodes, i.e., remove associated annotations
      else if (op.type === "delete") {
        annotations = this._index.get(op.path);
        _.each(annotations, function(a) {
          _delete(this, a);
        }, this);
      }
    }

    else if (op.type === "update" || op.type === "set") {

      var node = this.document.get(op.path[0]);

      // FIXME: due to the use of Compunds and the rather late fired property change events
      // it happens, that there arrive atomic operations with the original node being deleted already
      // or should we tolerate this?
      if (node === undefined) {
        return;
      }

      typeChain = this.document.schema.typeChain(node.type);

      if (typeChain.indexOf("annotation") >= 0) {
        // for now we only are interested range updates
        if (op.path[1] !== "range") return;

        this.triggerLater("annotation:changed", "update", node);

      }

      // It turns out that it is not enough to co-transform annotations.
      // E.g., when text gets deleted and the operation is undone
      // the annotation could not be reconstructed.
      // So we have to trigger annotation updates explicitely
      else if (this.withTransformation) {
        this.transform(op);
      }
    }
  };

  this.create = function(annotation) {
    this.document.create(annotation);
    return annotation;
  };

  // Updates all annotations according to a given operation.
  // --------
  //
  // The provided operation is an ObjectOperation which has been applied
  // to the document already.

  // TODO: this needs to be rethought.
  // On the one hand, we need explicit changes to be able to undo e.g. deletions.
  // OTOH, such co-transforms would then be applied twice... i.e., during simulation
  // co-transformation but when applying the simulation we would not want to have them anymore.
  // Also not when redoing changes (as they would be contained in the change).

  var _transform = function(op, annotation) {
        // only apply the transformation on annotations with the same property
    // Note: currently we only have annotations on the `content` property of nodes
    if (!_.isEqual(annotation.path, op.path)) return;

    if (op.type === "update") {
      // Note: these are implicit transformations, i.e., not triggered via annotation controls
      var expandLeft = false;
      var expandRight = false;

      var expandSpec = this.expansion[annotation.type];
      if (expandSpec) {
        if (expandSpec.left) expandLeft =  expandSpec.left(annotation);
        if (expandSpec.right) expandRight = expandSpec.right(annotation);
      }

      var newRange = util.clone(annotation.range);
      var changed = Operator.TextOperation.Range.transform(newRange, op.diff, expandLeft, expandRight);
      if (changed) {
        if (newRange[0] === newRange[1]) {
          _delete(this, annotation);
        } else {
          this.document.set([annotation.id, "range"], newRange);
        }
      }
    }
    // if somebody has reset the property we must delete the annotation
    else if (op.type === "delete" || op.type === "set") {
      _delete(this, annotation);
    }
  };

  this.transform = function(op) {
    var annotations = this._index.get(op.path);
    _.each(annotations, function(a) {
      _transform.call(this, op, a);
    }, this);
  };

  this.paste = function(annotations, newNodeId, offset) {

    for (var i = 0; i < annotations.length; i++) {
      var annotation = annotations[i];
      if (newNodeId !== undefined) {
        annotation.path = _.clone(annotation.path);
        annotation.path[0] = newNodeId;
      }
      if (offset !== undefined) {
        annotation.range[0] += offset;
        annotation.range[1] += offset;
      }
      this.create(annotation);
    }
  };

  // Copy annotations in the given selection.
  // --------
  // This is the pendant to the writer's copy method.
  // Partially selected annotations may not get copied depending on the
  // annotation type, for others, new annotation fragments would be created.

  this.copy = function(selection) {

    var ranges = _getRanges(this, selection);

    // get all affected annotations
    var annotations = this.getAnnotations({selection: selection});
    var result = [];

    _.each(annotations, function(annotation) {

      // TODO: determine if an annotation would be split by the given selection.
      var range = ranges[annotation.path[0]];
      var isPartial = (range[0] > annotation.range[0] || range[1] < annotation.range[1]);

      var newAnnotation;
      if (isPartial) {
        // for the others create a new fragment (depending on type) and truncate the original
        if (this.isSplittable(annotation.type)) {
          newAnnotation = util.clone(annotation);
          // make the range relative to the selection
          newAnnotation.id = util.uuid();
          newAnnotation.range = [Math.max(0, annotation.range[0] - range[0]), annotation.range[1] - range[0]];
          result.push(newAnnotation);
        }
      } else {
        // add totally included ones
        // TODO: need more control over uuid generation
        newAnnotation = util.clone(annotation);
        newAnnotation.id = util.uuid();
        newAnnotation.range = [newAnnotation.range[0] - range[0], newAnnotation.range[1] - range[0]];
        result.push(newAnnotation);
      }

    }, this);

    return result;
  };

  // Retrieve annotations
  // --------
  // The selection can be filtered via
  //
  // - node + range : a node id and (optionally) a given range (only if node is given)
  // - selection: a selection of type `{start: [nodePos, charPos], end: [nodePos, charPos]}`
  // - filter: a custom filter of type `function(annotation) -> boolean`
  //

  this.getAnnotations = function(options) {
    options = options || {};
    if (!options.view) options.view = "content";

    var doc = this.document;

    var annotations = {};

    if (options.node) {
      annotations = _filterByNodeAndRange.call(this, options.view, options.node, options.range);
    }

    else if (options.selection) {
      var sel = options.selection;
      var ranges = sel.getRanges();

      for (var i = 0; i < ranges.length; i++) {
        // Note: pushing an array and do flattening afterwards
        var range = ranges[i];
        _.extend(annotations, _filterByNodeAndRange.call(this, options.view, range.node.id, [range.start, range.end]));
      }

    } else {
      _.each(doc.nodes, function(node) {
        var baseType = doc.schema.baseType(node.type);
        if(baseType === 'annotation') {
          annotations[node.id] = node;
        }
      });
    }

    if (options.filter) {
      var filtered = {};
      _.each(annotations, function(a) {
        if(options.filter(a)) {
          filtered[a.id] = a;
        }
      });
      annotations = filtered;
    }

    return annotations;
  };

  // Returns true if two annotation types are mutually exclusive
  // ---------
  // Currently there is a built-in mechanism which considers two annotations
  // exclusive if they belong to the same group.
  //

  this.isExclusive = function(type1, type2) {
    return this.group[type1] === this.group[type2];
  };

  // Tell if an annotation can be split or should be truncated only.
  // --------
  //
  // E.g. when cutting a selection or inserting a new node existing annotations
  // may be affected. In some cases (e.g., `emphasis` or `strong`) it is wanted
  // that a new annotation of the same type is created for the cut fragment.

  this.isSplittable = function(type) {
    return this.splittable.indexOf(type) >= 0;
  };

  // Creates an annotation for the current selection of given type
  // --------
  //
  // This action may involve more complex co-actions:
  //
  // - toggle delete one or more annotations
  // - truncate one or more annotations
  //
  // TODO: make aware of views (currently "content" is hard-coded)

  this.annotate = function(selection, type, data) {
    var sel = selection.range();
    var node = selection.cursor.node;

    if (sel.start[0] !== sel.end[0]) throw new DocumentError('Multi-node annotations are not supported.');

    var range = [sel.start[1], sel.end[1]];
    var annotations = this.getAnnotations({node: node.id, range: range});

    if (selection.isCollapsed()) {
      // Note: creating annotations without selection is not supported yet
      // TODO: discuss

      // toggle annotations of same type
      _.each(annotations, function(a) {
        if (a.type === type) {
          _delete(this, a);
        }
      }, this);

    } else {

      // truncate all existing annotations of the same type (or group)
      var toggled = false;
      _.each(annotations, function(a) {
        if (this.isExclusive(type, a.type)) {
          _truncate(this, a, range);
          if (type === a.type) toggled = true;
        }
      }, this);

      // create a new annotation
      if (!toggled) {
        return _create(this, [node.id, "content"], type, range, data);
      }
    }
  };
};

Annotator.Prototype.prototype = util.Events;
Annotator.prototype = new Annotator.Prototype();

Annotator.isOnNodeStart = function(a) {
  return a.range[0] === 0;
};

Annotator.isTrue = function() {
  return true;
};

// Creates a shared index for annotations on a given document.
// --------
//

Annotator.createIndex = function(doc) {
  if (doc.indexes["annotations"] === undefined) {
    var options = {
      types: ["annotation"],
      property: "path"
    };
    var index = doc.addIndex("annotations", options);
    index.ENABLE_LOGGING = true;
    doc.indexes["annotations"] = index;
  }
  return doc.indexes["annotations"];
};

// This is a sweep algorithm wich uses a set of ENTER/EXIT entries
// to manage a stack of active elements.
// Whenever a new element is entered it will be appended to its parent element.
// The stack is ordered by the annotation types.
//
// Examples:
//
// - simple case:
//
//       [top] -> ENTER(idea1) -> [top, idea1]
//
//   Creates a new 'idea' element and appends it to 'top'
//
// - stacked ENTER:
//
//       [top, idea1] -> ENTER(bold1) -> [top, idea1, bold1]
//
//   Creates a new 'bold' element and appends it to 'idea1'
//
// - simple EXIT:
//
//       [top, idea1] -> EXIT(idea1) -> [top]
//
//   Removes 'idea1' from stack.
//
// - reordering ENTER:
//
//       [top, bold1] -> ENTER(idea1) -> [top, idea1, bold1]
//
//   Inserts 'idea1' at 2nd position, creates a new 'bold1', and appends itself to 'top'
//
// - reordering EXIT
//
//       [top, idea1, bold1] -> EXIT(idea1)) -> [top, bold1]
//
//   Removes 'idea1' from stack and creates a new 'bold1'
//
var _levels = {
  idea: 1,
  question: 1,
  error: 1,
  link: 1,
  strong: 2,
  emphasis: 2,
  code: 2,
  subscript: 2,
  superscript: 2,
  underline: 2,
  cross_reference: 1,
  figure_reference: 1,
  person_reference: 1,
  citation_reference: 1
};

var ENTER = 1;
var EXIT = -1;

var Fragmenter = function(options) {
  this.levels = options.levels || _levels;
};

Fragmenter.Prototype = function() {

  // Orders sweep events according to following precedences:
  //
  // 1. pos
  // 2. EXIT < ENTER
  // 3. if both ENTER: ascending level
  // 4. if both EXIT: descending level

  var _compare = function(a, b) {
    if (a.pos < b.pos) return -1;
    if (a.pos > b.pos) return 1;

    if (a.mode < b.mode) return -1;
    if (a.mode > b.mode) return 1;

    if (a.mode === ENTER) {
      if (a.level < b.level) return -1;
      if (a.level > b.level) return 1;
    }

    if (a.mode === EXIT) {
      if (a.level > b.level) return -1;
      if (a.level < b.level) return 1;
    }

    return 0;
  };

  var extractEntries = function(annotations) {
    var entries = [];
    _.each(annotations, function(a) {
      var l = this.levels[a.type];

      // ignore annotations that are not registered
      if (l === undefined) {
        return;
      }

      entries.push({ pos : a.range[0], mode: ENTER, level: l, id: a.id, type: a.type });
      entries.push({ pos : a.range[1], mode: EXIT, level: l, id: a.id, type: a.type });
    }, this);
    return entries;
  };

  this.onText = function(/*context, text*/) {};

  // should return the created user context
  this.onEnter = function(/*entry, parentContext*/) {
    return null;
  };

  this.enter = function(entry, parentContext) {
    return this.onEnter(entry, parentContext);
  };

  this.createText = function(context, text) {
    this.onText(context, text);
  };

  this.start = function(rootContext, text, annotations) {
    var entries = extractEntries.call(this, annotations);
    entries.sort(_compare.bind(this));

    var stack = [{context: rootContext, entry: null}];

    var pos = 0;

    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];

      // in any case we add the last text to the current element
      this.createText(stack[stack.length-1].context, text.substring(pos, entry.pos));

      pos = entry.pos;
      var level = 1;

      var idx;

      if (entry.mode === ENTER) {
        // find the correct position and insert an entry
        for (; level < stack.length; level++) {
          if (entry.level < stack[level].entry.level) {
            break;
          }
        }
        stack.splice(level, 0, {entry: entry});
      }
      else if (entry.mode === EXIT) {
        // find the according entry and remove it from the stack
        for (; level < stack.length; level++) {
          if (stack[level].entry.id === entry.id) {
            break;
          }
        }
        stack.splice(level, 1);
      }

      // create new elements for all lower entries
      for (idx = level; idx < stack.length; idx++) {
        stack[idx].context = this.enter(stack[idx].entry, stack[idx-1].context);
      }
    }

    // Finally append a trailing text node
    this.createText(rootContext, text.substring(pos));
  };

};
Fragmenter.prototype = new Fragmenter.Prototype();

Annotator.Fragmenter = Fragmenter;

// Export
// ========

module.exports = Annotator;

},{"./document":115,"./selection":117,"substance-data":94,"substance-operator":175,"substance-util":207,"underscore":212}],110:[function(require,module,exports){
"use strict";

var _ = require("underscore");
var util = require("substance-util");

// Document.Clipboard
// ================
//

var Clipboard = function() {
  // Start with an empty document
  // this.content = new Document({id: "clipboard"});
};


Clipboard.Prototype = function() {

  // Get contents from clipboard
  // --------
  // 

  this.setContent = function(content) {
    this.content = content;
  };

  // Get contents from clipboard
  // --------
  // 
  // Depending on the timestamp 

  this.getContent = function() {
    return this.content;
  };
};


Clipboard.Prototype.prototype = util.Events;
Clipboard.prototype = new Clipboard.Prototype();

// Export
// ========

module.exports = Clipboard;

},{"substance-util":207,"underscore":212}],111:[function(require,module,exports){
var DocumentNode = require("./node");

var Composite = function(node, doc) {
  DocumentNode.call(this, node, doc);
};


// Type definition
// -----------------
//

Composite.type = {
  "id": "composite",
  "parent": "content",
  "properties": {
  }
};


// This is used for the auto-generated docs
// -----------------
//

Composite.description = {
  "name": "Composite",
  "remarks": [
    "A file reference to an external resource.",
  ],
  "properties": {
  }
};

// Example File
// -----------------
//

Composite.example = {
  "no_example": "yet"
};



Composite.Prototype = function() {

  this.getLength = function() {
    throw new Error("Composite.getLength() is abstract.");
  };

  // Provides the ids of all referenced sub-nodes.
  // -------
  //

  this.getNodes = function() {
    throw new Error("Composite.getNodes() is abstract.");
  };

  // Tells if this composite is can be changed with respect to its children
  // --------
  //

  this.isMutable = function() {
    return false;
  };

  this.insertOperation = function(/*charPos, text*/) {
    return null;
  };

  this.deleteOperation = function(/*startChar, endChar*/) {
    return null;
  };

  // Inserts reference(s) at the given position
  // --------
  //

  this.insertChild = function(/*doc, pos, nodeId*/) {
    throw new Error("This composite is immutable.");
  };

  // Removes a reference from this composite.
  // --------

  this.deleteChild = function(/*doc, nodeId*/) {
    throw new Error("This composite is immutable.");
  };

  // Provides the index of the affected node.
  // --------
  //

  this.getChangePosition = function(op) {
    return 0;
  };

};

Composite.Prototype.prototype = DocumentNode.prototype;
Composite.prototype = new Composite.Prototype();

module.exports = Composite;

},{"./node":116}],112:[function(require,module,exports){
"use strict";

var _ = require("underscore");
var util = require("substance-util");
var Composite = require("./composite");

var Container = function(document, view) {
  this.document = document;
  this.view = view;

  this.treeView = [];
  this.listView = [];

  this.__parents = {};
  this.__composites = {};

  this.rebuild();
};

Container.Prototype = function() {

  var _each = function(iterator, context) {
    var queue = [];
    var i;

    for (i = this.treeView.length - 1; i >= 0; i--) {
      queue.unshift({
        id: this.treeView[i],
        parent: null
      });
    }

    var item, node;
    while(queue.length > 0) {
      item = queue.shift();
      node = this.document.get(item.id);
      if (node instanceof Composite) {
        var children = node.getNodes();
        for (i = children.length - 1; i >= 0; i--) {
          queue.unshift({
            id: children[i],
            parent: node.id,
          });
        }
      }
      iterator.call(context, node, item.parent);
    }
  };

  this.rebuild = function() {

    // clear the list view
    this.treeView.splice(0, this.treeView.length);
    this.listView.splice(0, this.listView.length);

    this.treeView = _.clone(this.view.nodes);
    for (var i = 0; i < this.view.length; i++) {
      this.treeView.push(this.view[i]);
    }

    this.__parents = {};
    this.__composites = {};
    _each.call(this, function(node, parent) {
      if (node instanceof Composite) {
        this.__parents[node.id] = parent;
        this.__composites[parent] = parent;
      } else {
        this.listView.push(node.id);
        if (this.__parents[node.id]) {
          throw new Error("Nodes must be unique in one view.");
        }
        this.__parents[node.id] = parent;
        this.__composites[parent] = parent;
      }
    }, this);
  };

  this.getTopLevelNodes = function() {
    return _.map(this.treeView, function(id) {
      return this.document.get(id);
    }, this);
  };

  this.getNodes = function(idsOnly) {
    var nodeIds = this.listView;
    if (idsOnly) {
      return _.clone(nodeIds);
    }
    else {
      var result = [];
      for (var i = 0; i < nodeIds.length; i++) {
        result.push(this.document.get(nodeIds[i]));
      }
      return result;
    }
  };

  this.getPosition = function(nodeId) {
    var nodeIds = this.listView;
    return nodeIds.indexOf(nodeId);
  };

  this.getNodeFromPosition = function(pos) {
    var nodeIds = this.listView;
    var id = nodeIds[pos];
    if (id !== undefined) {
      return this.document.get(id);
    } else {
      return null;
    }
  };

  this.getParent = function(nodeId) {
    return this.__parents[nodeId];
  };

  // Get top level parent of given nodeId
  this.getRoot = function(nodeId) {
    var parent = nodeId;

    // Always use top level element for referenceing the node
    while (parent) {
      nodeId = parent;
      parent = this.getParent(nodeId);
    }
    return nodeId;
  };

  this.update = function(op) {
    var path = op.path;
    var needRebuild = (path[0] === this.view.id ||  this.__composites[path[0]] !== undefined);
    if (needRebuild) this.rebuild();
  };

  this.getLength = function() {
    return this.listView.length;
  };

  // Returns true if there is another node after a given position.
  // --------
  //

  this.hasSuccessor = function(nodePos) {
    var l = this.getLength();
    return nodePos < l - 1;
  };

  // Returns true if given view and node pos has a predecessor
  // --------
  //

  this.hasPredecessor = function(nodePos) {
    return nodePos > 0;
  };

  // Get predecessor node for a given view and node id
  // --------
  //

  this.getPredecessor = function(id) {
    var pos = this.getPosition(id);
    if (pos <= 0) return null;
    return this.getNodeFromPosition(pos-1);
  };

  // Get successor node for a given view and node id
  // --------
  //

  this.getSuccessor = function(id) {
    var pos = this.getPosition(id);
    if (pos >= this.getLength() - 1) return null;
    return this.getNodeFromPosition(pos+1);
  };

  this.firstChild = function(node) {
    if (node instanceof Composite) {
      var first = this.document.get(node.getNodes()[0]);
      return this.firstChild(first);
    } else {
      return node;
    }
  };

  this.lastChild = function(node) {
    if (node instanceof Composite) {
      var last = this.document.get(_.last(node.getNodes()));
      return this.lastChild(last);
    } else {
      return node;
    }
  };

  // Provides a document position which addresses begin of a given node
  // --------
  //

  this.before = function(node) {
    var child = this.firstChild(node);
    var nodePos = this.getPosition(child.id);
    return [nodePos, 0];
  };

  // Provides a document position which addresses the end of a given node
  // --------
  //

  this.after = function(node) {
    var child = this.lastChild(node);
    var nodePos = this.getPosition(child.id);
    var charPos = child.getLength();
    return [nodePos, charPos];
  };

};

Container.prototype = _.extend(new Container.Prototype(), util.Events.Listener);

Object.defineProperties(Container.prototype, {
  "id": {
    get: function() { return this.view.id; }
  },
  "type": {
    get: function() { return this.view.type; }
  },
  "nodes": {
    get: function() { return this.view.nodes; },
    set: function(val) { this.view.nodes = val; }
  }
});

module.exports = Container;

},{"./composite":111,"substance-util":207,"underscore":212}],113:[function(require,module,exports){
"use strict";

var _ = require("underscore");
var util = require("substance-util");
var Operator = require('substance-operator');
var Selection = require("./selection");
var Annotator = require("./annotator");
var Clipboard = require("./clipboard");
var Composite = require('./composite');

// Document.Controller
// -----------------
//
// Provides means for editing and viewing a Substance.Document. It introduces
// a Selection API in order to move a cursor through the document, support
// copy and paste, etc.
//
// Note: it is quite intentional not to expose the full Substance.Document interface
//       to force us to explicitely take care of model adaptations.
//
// Example usage:
//
//     var doc = new Substance.Document();
//     var editor = new Substance.Document.Controller(doc);
//     var editor.insert("Hello World");

var Controller = function(document, options) {
  options = options || {};
  this.view = options.view || 'content';

  this.__document = document;

  this.chronicle = document.chronicle;
  this.annotator = new Annotator(document);

  this.container = document.get(this.view);
  this.selection = new Selection(this.container);
  this.clipboard = new Clipboard();

  // TODO: this needs serious re-thinking...
  // On the one hand, we wan be able to set the cursor after undo or redo.
  // OTOH, we do not want to update the selection on each micro operation.
  // Probably, the best would be to do that explicitely in all cases (also undo/redo)...
  // this.listenTo(document, 'operation:applied', this.updateSelection);
};

Controller.Prototype = function() {

  // Document Facette
  // --------

  this.getNodes = function(idsOnly) {
    return this.container.getNodes(idsOnly);
  };

  this.getContainer = function() {
    return this.container;
  };

  // Given a node id, get position in the document
  // --------
  //

  this.getPosition = function(id, flat) {
    return this.container.getPosition(id, flat);
  };

  this.getNodeFromPosition = function(nodePos) {
    return this.container.getNodeFromPosition(nodePos);
  };

  // See Annotator
  // --------
  //

  this.getAnnotations = function(options) {
    options = options || {};
    options.view = this.view;
    return this.annotator.getAnnotations(options);
  };

  // Delete current selection
  // --------
  //

  this.delete = function(direction) {

    var session = this.startManipulation();
    // var doc = session.doc;
    var sel = session.sel;
    var container = sel.container;

    if (sel.isNull()) return;

    if (sel.isCollapsed()) {
      sel.expand(direction, "char");
    }

    session.deleteSelection();
    session.save();

    if (container.getLength() === 0) {
      this.selection.clear();
    } else {
      // HACK: if the selection is in an invalid state
      // select the previous char (happens when last node is deleted)
      var N = container.listView.length;
      if (sel.cursor.nodePos >= N) {
        var l = container.getNodeFromPosition(N-1).getLength();
        this.selection.set([N-1, l]);
      } else {
        sel.collapse("left");
        this.selection.set(sel);
      }
    }

  };

  // Copy current selection
  // --------
  //

  this.copy = function() {
    console.log("I am sorry. Currently disabled.");
  };


  // Cut current selection from document
  // --------
  //
  // Returns cutted content as a new Substance.Document

  this.cut = function() {
    this.copy();
    this.delete();
  };

  // Paste content from clipboard at current position
  // --------
  //

  this.paste = function() {
    console.log("I am sorry. Currently disabled.");
  };

  // Split
  // --------
  //

  // TODO: pick a better name
  this.modifyNode = function(type, data) {
    this.breakNode();
  };

  this.breakNode = function() {
    if (this.selection.isNull()) {
      console.log("Can not write, as no position has been selected.");
      return;
    }

    var session = this.startManipulation();
    var doc = session.doc;
    var sel = session.sel;
    var container = sel.container;

    if (!sel.isCollapsed()) {
      session.deleteSelection();
    }

    var node = sel.getNodes()[0];
    var nodePos = sel.start[0];
    var charPos = sel.start[1];

    if (node.isBreakable()) {
      var parentId = container.getParent(node.id);

      var newNode;

      if (parentId) {
        var parent = doc.get(parentId);
        if (parent.isBreakable()) {
          var children = parent.getNodes();
          newNode = parent.break(doc, node.id, charPos);
        } else {
          console.log("Node type '"+parent.type+"' is not splittable.");
        }
      } else {
        newNode = node.break(doc, charPos);
        var insertPos = container.treeView.indexOf(node.id)+1;
        doc.show(this.view, newNode.id, insertPos);
      }
    }

    if (newNode) {
      var pos = container.before(newNode);
      sel.set(pos);
    }

    session.save();
    this.selection.set(sel);
  };

  // Based on current selection, insert new node
  // --------
  //

  this.insertNode = function(type, data) {
    console.log("I am sorry. Currently disabled.", type, data);
  };

  // Creates an annotation based on the current position
  // --------
  //

  this.annotate = function(type, data) {
    return this.annotator.annotate(this.selection, type, data);
  };


  this.startManipulation = function() {
    var doc = this.__document.startSimulation();
    new Annotator(doc, {withTransformation: true});
    var sel = new Selection(doc.get(this.view), this.selection);
    return new Controller.ManipulationSession(doc, sel);
  };

  // Inserts text at the current position
  // --------
  //

  this.write = function(text) {
    if (this.selection.isNull()) {
      console.log("Can not write, as no position has been selected.");
      return;
    }

    var session = this.startManipulation();
    var doc = session.doc;
    var sel = session.sel;

    if (!sel.isCollapsed()) {
      session.deleteSelection();
    }

    var node = sel.getNodes()[0];
    var nodePos = sel.start[0];
    var charPos = sel.start[1];

    // TODO: future. This only works for text nodes....

    var update = node.insertOperation(charPos, text);
    if (update) doc.apply(update);

    session.save();
    this.selection.set([nodePos, charPos+text.length]);
  };

  // Delegate getter
  this.get = function() {
    return this.__document.get.apply(this.__document, arguments);
  };

  this.on = function() {
    return this.__document.on.apply(this.__document, arguments);
  };

  this.off = function() {
    return this.__document.off.apply(this.__document, arguments);
  };

  var _updateSelection = function(op) {

    // TODO: this needs a different approach.
    // With compounds, the atomic operation do not directly represent a natural behaviour
    // I.e., the last operation applied does not represent the position which is
    // desired for updating the cursor
    // Probably, we need to handle that behavior rather manually knowing
    // about possible compound types...
    // Maybe we could use the `alias` field of compound operations to leave helpful information...
    // However, we post-pone this task as it is rather cosmetic

    if (!op) return;

    var view = this.view;
    var doc = this.__document;
    var container = this.container;

    function getUpdatedPostion(op) {

      // We need the last update which is relevant to positioning...
      // 1. Update of the content of leaf nodes: ask node for an updated position
      // 2. Update of a reference in a composite node:
      // TODO: fixme. This does not work with deletions.

      // changes to views or containers are always updates or sets
      // as they are properties
      if (op.type !== "update" && op.type !== "set") return;

      // handle changes to the view of nodes
      var node = doc.get(op.path[0]);

      if (!node) {
        console.log("Hmmm... this.should not happen, though.");
        return;
      }

      var nodePos = -1;
      var charPos = -1;

      if (node instanceof Composite) {
        // TODO: there is no good concept yet
      } else if (node.getChangePosition) {
        nodePos = container.getPosition(node.id);
        charPos = node.getChangePosition(op);
      }

      if (nodePos >= 0 && charPos >= 0) {
        return [nodePos, charPos];
      }
    }


    // TODO: actually, this is not yet an appropriate approach to update the cursor position
    // for compounds.
    Operator.Helpers.each(op, function(_op) {
      var pos = getUpdatedPostion(_op);
      if (pos) {
        this.selection.set(pos);
        // breaking the iteration
        return false;
      }
    }, this, "reverse");

  };

  this.undo = function() {
    var op = this.chronicle.rewind();
    _updateSelection.call(this, op);
  };

  this.redo = function() {
    var op = this.chronicle.forward();
    _updateSelection.call(this, op);
  };

};

// Inherit the prototype of Substance.Document which extends util.Events
Controller.prototype = _.extend(new Controller.Prototype(), util.Events.Listener);

// Property accessors for convenient access of primary properties
Object.defineProperties(Controller.prototype, {
  id: {
    get: function() {
      return this.__document.id;
    },
    set: function() { throw "immutable property"; }
  },
  nodeTypes: {
    get: function() {
      return this.__document.nodeTypes;
    },
    set: function() { throw "immutable property"; }
  },
  title: {
    get: function() {
      return this.__document.get('document').title;
    },
    set: function() { throw "immutable property"; }
  },
  updated_at: {
    get: function() {
      return this.__document.get('document').updated_at;
    },
    set: function() { throw "immutable property"; }
  },
  creator: {
    get: function() {
      return this.__document.get('document').creator;
    },
    set: function() { throw "immutable property"; }
  }
});

var ManipulationSession = function(doc, sel) {
  this.doc = doc;
  this.sel = sel;
  this.container = sel.container;
  this.viewId = this.container.view.id;
};

ManipulationSession.Prototype = function() {

  this.save = function() {
    this.doc.save();
  };

  // Joins two succeeding nodes
  // --------
  //

  this.join = function(id1, id2) {
    // TODO: check if node2 is successor of node1

    var doc = this.doc;
    var container = this.container;

    var node1 = doc.get(id1);
    var node2 = doc.get(id2);

    var parentId1 = container.getParent(id1);
    var parentId2 = container.getParent(id2);
    var parent1 = (parentId1) ? doc.get(parentId1) : null;

    // Note: assuming that mutable composites allow joins (e.g., lists), others do not (e.g., figures)
    if (!node1.canJoin(node2) || (parent1 && !parent1.isMutable())) {
      return false;
    }

    node1.join(doc, node2);
    this.deleteNode(node2.id);

    // Note: the previous call might have eliminated the second composite node
    var parent2 = (parentId2) ? doc.get(parentId2) : null;

    // Join composites if this is allowed
    // Note: this is experimental...
    //  currently, this is only used with two succeeding lists
    // .. and not if we join an element of the parent into the child...
    // ... wooo hacky...
    if (parent1 && parent2 &&
      parent1.id !== parent2.id && parent1.canJoin(parent2) &&
      container.getParent(parentId1) !== parentId2) {

      var children1 = parent1.getNodes();
      var children2 = parent2.getNodes();
      var pos = children1.indexOf(id1) + 1;

      // only join if we are at the end of the first composite
      if (pos === children1.length) {
        this.deleteNode(parent2.id);
        for (var i = 0; i < children2.length; i++) {
          parent1.insertChild(doc, pos+i, children2[i]);
        }
      }
    }

    return true;
  };

  // Deletes a node with given id and also takes care of removing it from its parent.
  // --------
  //

  this.deleteNode = function(nodeId) {
    var doc = this.doc;
    var parentId = this.container.getParent(nodeId);
    var parent = (parentId) ? doc.get(parentId) : null;

    if (!parentId) {
      doc.hide(this.viewId, nodeId);
      doc.delete(nodeId);
    }
    else {
      parent.deleteChild(doc, nodeId);
      if (parent.getLength() === 0) {
        this.deleteNode(parent.id);
      }
    }
  };

  this.deleteSelection = function() {

    var self = this;
    var doc = this.doc;
    var sel = this.sel;
    var container = sel.container;
    var ranges = sel.getRanges();
    var tryJoin = (ranges.length > 1 && !ranges[0].isFull() && !_.last(ranges).isFull());

    // Note: this implementation is unfortunately not so easy...
    // Have chosen a recursion approach to achieve an efficient
    // opportunistic top-down deletion algorithm.
    // It is top-down by that it starts deletion from the top-most
    // node that is fully selected.
    // For efficiency, using a 'visited' map to keep track which nodes have been processed already.

    var i = 0;
    var rangeMap = {};
    for (i = 0; i < ranges.length; i++) {
      rangeMap[ranges[i].node.id] = ranges[i];
    }

    var visited = {};

    // Deletes all children nodes and then removes the given composite itself.
    //
    // Note: this gets only called for the top-most composite which are fully selected.
    //
    function deleteComposite(composite) {
      var queue = _.clone(composite.getNodes());
      self.deleteNode(composite.id);
      while(queue.length > 0) {
        var id = queue.shift();
        doc.delete(id);
        visited[id] = true;
      }
      visited[composite.id] = true;
    }

    // Recursive call that finds the top-most fully selected composite
    //

    function processComposite(node) {
      if (visited[node.id] === undefined) {

        var first = container.firstChild(node);
        var firstRange = rangeMap[first.id];
        var last = container.lastChild(node);
        var lastRange = rangeMap[last.id];

        // If the first and the last range is full then this node is selected fully
        // In that case we check the parent recursively
        // and eventually delete nodes

        if (firstRange && lastRange && firstRange.isFull() && lastRange.isFull()) {
          var parentId = container.getParent(node.id);
          if (parentId) {
            processComposite(doc.get(parentId));
          }
          if (!visited[parentId]) {
            deleteComposite(node);
          }
        } else {
          visited[node.id] = false;
        }
      }
      return visited[node.id];
    }


    for (i = 0; i < ranges.length; i++) {
      var r = ranges[i];
      var node = r.node;
      if (visited[node.id]) continue;

      if (r.isFull()) {
        // If there is a parent composite node,
        // do the top-down deletion
        var parentId = container.getParent(node.id);
        if (parentId) {
          processComposite(doc.get(parentId));
        }
        // otherwise, or if the parent was not fully selected
        // delete the node regularly
        if (!visited[parentId]) {
          // TODO: need to check if the node is allowed to be empty
          if (r.node.getLength() === 0) {
            this.deleteNode(node.id);
          } else {
            // FIXME: annotations have to be removed first otherwise
            // the operations are in wrong order and the inverted operation
            // creates annotations before the content is available.
            // This should be done in the text node...
            // We should extract that from the Annotator into helper functions
            // ... and probably get rid of the Annotator soon...
            var op = r.node.deleteOperation(r.start, r.end);
            if (op && !op.isNOP()) {
              doc.apply(op);
            }
            // HACK: delete fully selected nodes after the first range
            if (i > 0) {
              this.deleteNode(node.id);
            }
          }
        }
      }
      // for partial deletions ask the node for an (incremental) operation
      else {
        var op = r.node.deleteOperation(r.start, r.end);
        if (op && !op.isNOP()) {
          doc.apply(op);
        }
      }
    }

    // TODO: Maybe we want to return whether the join has been rejected or not
    if (tryJoin) {
      this.join(ranges[0].node.id, ranges[ranges.length-1].node.id);
    }
  };
};

ManipulationSession.prototype = new ManipulationSession.Prototype();

Controller.ManipulationSession = ManipulationSession;

module.exports = Controller;

},{"./annotator":109,"./clipboard":110,"./composite":111,"./selection":117,"substance-operator":175,"substance-util":207,"underscore":212}],114:[function(require,module,exports){
var _ = require("underscore");
var SRegExp = require("substance-regexp");
var util = require("substance-util");
var errors = util.errors;

var CursorError = errors.define("CursorError");

// Document.Selection.Cursor
// ================
//
// Hi, I'm an iterator, just so you know.

var Cursor = function(container, nodePos, charPos, view) {
  this.container = container;
  this.view = view || 'content';

  this.nodePos = nodePos;
  this.charPos = charPos;

  if (nodePos !== null && !_.isNumber(nodePos)) {
    throw new CursorError("Illegal argument: expected nodePos as number");
  }

  if (charPos !== null && !_.isNumber(charPos)) {
    throw new CursorError("Illegal argument: expected charPos as number");
  }
};


Cursor.Prototype = function() {

  this.copy = function() {
    return new Cursor(this.container, this.nodePos, this.charPos, this.view);
  };

  this.isValid = function() {
    if (this.nodePos === null || this.charPos === null) return false;
    if (this.nodePos < 0 || this.charPos < 0) return false;

    var node = this.container.getNodeFromPosition(this.nodePos);

    if (!node) return false;
    if (this.charPos >= node.getLength()) return false;

    return true;
  };

  this.isRightBound = function() {
    return this.charPos === this.node.getLength();
  };

  this.isLeftBound = function() {
    return this.charPos === 0;
  };

  this.isEndOfDocument = function() {
    return this.isRightBound() && this.nodePos === this.container.getLength()-1;
  };

  this.isBeginOfDocument = function() {
    return this.isLeftBound() && this.nodePos === 0;
  };

  // Return previous node boundary for a given node/character position
  // --------
  //

  this.prevNode = function() {
    if (!this.isLeftBound()) {
      this.charPos = 0;
    } else if (this.nodePos > 0) {
      this.nodePos -= 1;
      this.charPos = this.node.length;
    }
  };

  // Return next node boundary for a given node/character position
  // --------
  //

  this.nextNode = function() {
    if (!this.isRightBound()) {
      this.charPos = this.node.length;
    } else if (this.nodePos < this.container.getLength()-1) {
      this.nodePos += 1;
      this.charPos = 0;
    }
  };

  // Return previous occuring word for a given node/character position
  // --------
  //

  this.prevWord = function() {
    if (!this.node) throw new CursorError('Invalid node position');

    // Cursor is at first position -> move to prev paragraph if there is any
    if (this.isLeftBound()) {
      this.prevChar();
    } else if (this.node.prevWord) {
      this.charPos = this.node.prevWord(this.charPos);
    } else {
      return this.prevChar();
    }
  };

  // Return next occuring word for a given node/character position
  // --------
  //

  this.nextWord = function() {
    if (!this.node) throw new CursorError('Invalid node position');

    // Cursor is a last position -> move to next paragraph if there is any
    if (this.isRightBound()) {
      this.nextChar();
    } else if (this.node.nextWord) {
      this.charPos = this.node.nextWord(this.charPos);
    } else {
      this.nextChar();
    }
  };

  // Return next char, for a given node/character position
  // --------
  //
  // Useful when navigating over paragraph boundaries

  this.nextChar = function() {
    if (!this.node) throw new CursorError('Invalid node position');

    // Last char in paragraph
    if (this.isRightBound()) {
      if (this.nodePos < this.container.getLength()-1) {
        this.nodePos += 1;
        this.charPos = 0;
      }
    } else {
      this.charPos += 1;
    }
  };


  // Return next char, for a given node/character position
  // --------
  //
  // Useful when navigating over paragraph boundaries

  this.prevChar = function() {
    if (!this.node) throw new CursorError('Invalid node position');
    if (this.charPos<0) throw new CursorError('Invalid char position');

    if (this.isLeftBound()) {
      if (this.nodePos > 0) {
        this.nodePos -= 1;
        this.charPos = this.node.getLength();
      }
    } else {
      this.charPos -= 1;
    }
  };

  // Move
  // --------
  //
  // Useful helper to find char,word and node boundaries
  //
  //     find('right', 'char');
  //     find('left', 'word');
  //     find('left', 'node');

  this.move = function(direction, granularity) {
    if (direction === "left") {
      if (granularity === "word") {
        this.prevWord();
      } else if (granularity === "char") {
        this.prevChar();
      } else if (granularity === "node") {
        this.prevNode();
      }
    } else {
      if (granularity === "word") {
        this.nextWord();
      } else if (granularity === "char") {
        this.nextChar();
      } else if (granularity === "node") {
        this.nextNode();
      }
    }
  };

  this.set = function(nodePos, charPos) {
    this.nodePos = nodePos;
    this.charPos = charPos;

    if (nodePos !== null && !_.isNumber(nodePos)) {
      throw new CursorError("Illegal argument: expected nodePos as number");
    }

    if (charPos !== null && !_.isNumber(charPos)) {
      throw new CursorError("Illegal argument: expected charPos as number");
    }

    if (nodePos !== null) {
      if(!_.isNumber(nodePos)) {
        throw new CursorError("Illegal argument: expected nodePos as number");
      }
      var n = this.container.getLength();
      if (nodePos < 0 || nodePos >= n) {
        throw new CursorError("Invalid node position: " + nodePos);
      }
      var node = this.container.getNodeFromPosition(nodePos);
      var l = node.getLength();
      if (charPos < 0 || charPos > l) {
        throw new CursorError("Invalid char position: " + charPos);
      }
    }
  };

  this.position = function() {
    return [this.nodePos, this.charPos];
  };
};

Cursor.prototype = new Cursor.Prototype();

Object.defineProperties(Cursor.prototype, {
  node: {
    get: function() {
      return this.container.getNodeFromPosition(this.nodePos);
    }
  }
});

module.exports = Cursor;

},{"substance-regexp":186,"substance-util":207,"underscore":212}],115:[function(require,module,exports){
"use strict";

// Substance.Document 0.5.0
// (c) 2010-2013 Michael Aufreiter
// Substance.Document may be freely distributed under the MIT license.
// For all details and documentation:
// http://interior.substance.io/modules/document.html


// Import
// ========

var _ = require("underscore");
var util = require("substance-util");
var errors = util.errors;
var Data = require("substance-data");
var Operator = require("substance-operator");
var Chronicle = require("substance-chronicle");
var Container = require("./container");

// Module
// ========

var DocumentError = errors.define("DocumentError");


// Document
// --------
//
// A generic model for representing and transforming digital documents

var Document = function(options) {
  Data.Graph.call(this, options.schema, options);

  this.containers = {};
};

// Default Document Schema
// --------

Document.schema = {
  // Static indexes
  "indexes": {
  },

  "types": {
    // Specific type for substance documents, holding all content elements
    "content": {
      "properties": {
      }
    },

    "view": {
      "properties": {
        "nodes": ["array", "content"]
      }
    }
  }
};


Document.Prototype = function() {
  var __super__ = util.prototype(this);

  this.__apply__ = function(op) {
    var result = __super__.__apply__.call(this, op, "silent");

    // book-keeping of Container instances
    Operator.Helpers.each(op, function(_op) {
      // TODO: this can probably be optimized...
      if (_op.type === "set" || _op.type === "update") {
        _.each(this.containers, function(container) {
          container.update(_op);
        }, this);
      }
    }, this);

    return result;
  };


  this.getIndex = function(name) {
    return this.indexes[name];
  };

  this.getSchema = function() {
    return this.schema;
  };


  this.create = function(node) {
    __super__.create.call(this, node);
    return this.get(node.id);
  };

  // Delegates to Graph.get but wraps the result in the particular node constructor
  // --------
  //

  this.get = function(path) {
    var node = __super__.get.call(this, path);

    if (!node) return node;

    // Wrap all views in Container instances
    if (node.type === "view") {
      if (!this.containers[node.id]) {
        this.containers[node.id] = new Container(this, node);
      }
      return this.containers[node.id];
    }

    // Wrap all nodes in an appropriate Node instance
    else {
      var nodeSpec = this.nodeTypes[node.type];
      var NodeType = (nodeSpec !== undefined) ? nodeSpec.Model : null;
      if (NodeType && !(node instanceof NodeType)) {
        node = new NodeType(node, this);
        this.nodes[node.id] = node;
      }

      return node;
    }
  };

  // Serialize to JSON
  // --------
  //
  // The command is converted into a sequence of graph commands

  this.toJSON = function() {
    var res = __super__.toJSON.call(this);
    res.id = this.id;
    return res;
  };

  // Hide elements from provided view
  // --------
  //

  this.hide = function(viewId, nodes) {
    var view = this.get(viewId);

    if (!view) {
      throw new DocumentError("Invalid view id: "+ viewId);
    }

    if (_.isString(nodes)) {
      nodes = [nodes];
    }

    var indexes = [];
    _.each(nodes, function(n) {
      var i = view.nodes.indexOf(n);
      if (i>=0) indexes.push(i);
    }, this);

    if (indexes.length === 0) return;

    indexes = indexes.sort().reverse();
    indexes = _.uniq(indexes);

    var ops = _.map(indexes, function(index) {
      return Operator.ArrayOperation.Delete(index, view.nodes[index]);
    });

    var op = Operator.ObjectOperation.Update([viewId, "nodes"], Operator.ArrayOperation.Compound(ops));

    return this.apply(op);
  };

  // Adds nodes to a view
  // --------
  //

  this.show = function(viewId, nodes, target) {
    if (target === undefined) target = -1;

    var view = this.get(viewId);
    if (!view) {
      throw new DocumentError("Invalid view id: " + viewId);
    }

    if (_.isString(nodes)) {
      nodes = [nodes];
    }

    var l = view.nodes.length;

    // target index can be given as negative number (as known from python/ruby)
    target = Math.min(target, l);
    if (target<0) target = Math.max(0, l+target+1);

    var ops = [];
    for (var idx = 0; idx < nodes.length; idx++) {
      var nodeId = nodes[idx];
      if (this.nodes[nodeId] === undefined) {
        throw new DocumentError("Invalid node id: " + nodeId);
      }
      ops.push(Operator.ArrayOperation.Insert(target + idx, nodeId));
    }

    if (ops.length > 0) {
      var update = Operator.ObjectOperation.Update([viewId, "nodes"], Operator.ArrayOperation.Compound(ops));
      return this.apply(update);
    }
  };

  // Start simulation, which conforms to a transaction (think databases)
  // --------
  //

// Deactivated this as it does not work and breaks everything
/*
  this.startSimulation = function() {

    var parent = this;

    var doc = _.extend({}, this);
    doc._events = [];
    doc.objectAdapter = new Data.Graph.ObjectAdapter(doc);

    // remember the original state
    var initialState = this.chronicle.getState();

    // create a temporary chronicle index
    doc.chronicle = _.extend({}, this.chronicle);
    doc.chronicle.manage(new Data.Graph.ChronicleAdapter(doc));
    doc.chronicle.index = new Chronicle.TmpIndex(this.chronicle.index);

    // inject a recording apply method
    var ops = [];
    var __apply__ = this.apply;
    doc.apply = function(op) {
      op = __apply__.call(this, op);
      ops.push(op);
      return op;
    };

    doc.save = function() {
      var _ops = [];
      for (var i = 0; i < ops.length; i++) {
        if (ops[i].type !== "compound") {
          _ops.push(ops[i]);
        } else {
          _ops = _ops.concat(ops[i].ops);
        }
      }
      var compound = Operator.ObjectOperation.Compound(_ops);
      this.chronicle.reset(initialState);

      parent.apply(compound);
    };

    return doc;
  };
*/

  // Start simulation, which conforms to a transaction (think databases)
  // --------
  //

  this.startSimulation = function() {
    // TODO: this should be implemented in a more cleaner and efficient way.
    // Though, for now and sake of simplicity done by creating a copy
    var self = this;
    var simulation = this.fromSnapshot(this.toJSON());
    var ops = [];
    simulation.ops = ops;

    var __apply__ = simulation.apply;

    simulation.apply = function(op) {
      ops.push(op);
      op = __apply__.call(simulation, op);
      return op;
    };

    simulation.save = function() {
      var _ops = [];
      for (var i = 0; i < ops.length; i++) {
        if (ops[i].type !== "compound") {
          _ops.push(ops[i]);
        } else {
          _ops = _ops.concat(ops[i].ops);
        }
      }

      if (_ops.length === 0) {
        // nothing has been recorded
        return;
      }

      var compound = Operator.ObjectOperation.Compound(_ops);
      self.apply(compound);
      // console.log("Saved simulated ops", self);
    };

    return simulation;
  };

  this.fromSnapshot = function(data, options) {
    return Document.fromSnapshot(data, options);
  };

  this.uuid = function(type) {
    return type + "_" + util.uuid();
  };
};

Document.Prototype.prototype = Data.Graph.prototype;
Document.prototype = new Document.Prototype();

Document.fromSnapshot = function(data, options) {
  options = options || {};
  options.seed = data;
  return new Document(options);
};


Document.DocumentError = DocumentError;

// Export
// ========

module.exports = Document;

},{"./container":112,"substance-chronicle":73,"substance-data":94,"substance-operator":175,"substance-util":207,"underscore":212}],116:[function(require,module,exports){
"use strict";

var _ = require("underscore");

// Substance.Node
// -----------------

var Node = function(node, document) {
  this.document = document;
  this.properties = node;
};

// Type definition
// --------
//

Node.type = {
  "parent": "content",
  "properties": {
  }
};

// Define node behavior
// --------
// These properties define the default behavior of a node, e.g., used when manipulating the document.
// Sub-types override these settings
// Note: it is quite experimental, and we will consolidate them soon.

Node.properties = {
  abstract: true,
  immutable: true,
  mergeableWith: [],
  preventEmpty: true,
  allowedAnnotations: []
};

Node.Prototype = function() {

  this.toJSON = function() {
    return _.clone(this.properties);
  };

  // Provides the number of characters contained by this node.
  // --------
  // We use characters as a general concept, i.e., they do not
  // necessarily map to real characters.
  // Basically it is used for navigation and positioning.

  this.getLength = function() {
    throw new Error("Node.getLength() is abstract.");
  };

  // Provides how a cursor would change by an operation
  // --------
  //

  this.getChangePosition = function(op) {
    throw new Error("Node.getCharPosition() is abstract.");
  };

  // Provides an operation that can be used to insert
  // text at the given position.
  // --------
  //

  this.insertOperation = function(charPos, text) {
    throw new Error("Node.insertOperation() is abstract.");
  };

  // Provides an operation that can be used to delete a given range.
  // --------
  //

  this.deleteOperation = function(startChar, endChar) {
    throw new Error("Node.deleteOperation() is abstract.");
  };

  // Note: this API is rather experimental
  // It is used to dynamically control the behavior for modifications
  // e.g., via an editor

  // Can this node be joined with another one?
  // --------

  this.canJoin = function(other) {
    return false;
  };

  // Appends the content of another node
  // --------

  this.join = function(other) {
    throw new Error("Node.join() is abstract.");
  };

  // Can a 'hard-break' be applied to this node?
  // --------

  this.isBreakable = function() {
    return false;
  };

  // Breaks this node at a given position
  // --------

  this.break = function(doc, pos) {
    throw new Error("Node.split() is abstract.");
  };

  this.getAnnotations = function() {
    return this.document.getIndex("annotations").get(this.properties.id);
  };
};

Node.prototype = new Node.Prototype();
Node.prototype.constructor = Node;

Node.defineProperties = function(NodePrototype, properties, readonly) {
  _.each(properties, function(name) {
    var spec = {
      get: function() {
        return this.properties[name];
      }
    }
    if (!readonly) {
      spec["set"] = function(val) {
        this.properties[name] = val;
        return this;
      }
    }
    Object.defineProperty(NodePrototype, name, spec);
  });
};

Node.defineProperties(Node.prototype, ["id", "type"]);

module.exports = Node;

},{"underscore":212}],117:[function(require,module,exports){
"use strict";

var _ = require("underscore");
var util = require("substance-util");
var errors = util.errors;
var Cursor = require("./cursor");

var SelectionError = errors.define("SelectionError");

// Document.Selection
// ================
//
// A selection refers to a sub-fragment of a Substance.Document. It holds
// start/end positions for node and character offsets as well as a direction.
//
//     {
//       start: [NODE_POS, CHAR_POS]
//       end: [NODE_POS, CHAR_POS]
//       direction: "left"|"right"
//     }
//
// NODE_POS: Node offset in the document (0 = first node)
// CHAR_POS: Character offset within a textnode (0 = first char)
//
// Example
// --------
//
// Consider a document `doc` consisting of 3 paragraphs.
//
//           0 1 2 3 4 5 6
//     -------------------
//     P0  | a b c d e f g
//     -------------------
//     P1: | h i j k l m n
//     -------------------
//     P2: | o p q r s t u
//
//
// Create a selection operating on that document.
//     var sel = new Substance.Document.Selection(container);
//
//     sel.set({
//       start: [0, 4],
//       end: [1, 2],
//       direction: "right"
//     });
//
// This call results in the following selection:
//
//           0 1 2 3 4 5 6
//     -------------------
//     P0  | a b c d > > >
//     -------------------
//     P1: | > > > k l m n
//     -------------------
//     P2: | o p q r s t u
//

var Selection = function(container, selection) {
  this.container = container;

  this.start = null;
  this.__cursor = new Cursor(container, null, null);

  if (selection) this.set(selection);
};

Selection.Prototype = function() {

  // Get node from position in contnet view
  // --------
  //

  this.__node = function(pos) {
    return this.container.getNodeFromPosition(pos);
  };


  this.copy = function() {
    var copy = new Selection(this.container);
    if (!this.isNull()) copy.set(this);
    return copy;
  };


  // Set selection
  // --------
  //
  // sel: an instanceof Selection
  //      or a document range `{start: [nodePos, charPos], end: [nodePos, charPos]}`
  //      or a document position `[nodePos, charPos]`

  this.set = function(sel) {
    var cursor = this.__cursor;

    if (sel instanceof Selection) {
      this.start = _.clone(sel.start);
      cursor.set(sel.__cursor.nodePos, sel.__cursor.charPos);
    } else if (_.isArray(sel)) {
      this.start = _.clone(sel);
      cursor.set(sel[0], sel[1]);
    } else {
      this.start = _.clone(sel.start);
      cursor.set(sel.end[0], sel.end[1]);
    }
    var start = this.start;

    // being hysterical about the integrity of selections
    var n = this.container.getLength();
    if (start[0] < 0 || start[0] >= n) {
      throw new SelectionError("Invalid node position: " + start[0]);
    }
    var l = this.__node(start[0]).getLength();
    if (start[1] < 0 || start[1] > l) {
      throw new SelectionError("Invalid char position: " + start[1]);
    }

    this.trigger('selection:changed', this.range());
    return this;
  };

  this.clear = function() {
    this.start = null;
    this.__cursor.set(null, null);
    this.trigger('selection:changed', null);
  };

  this.range = function() {
    if (this.isNull()) return null;

    var pos1 = this.start;
    var pos2 = this.__cursor.position();

    if (this.isReverse()) {
      return {
        start: pos2,
        end: pos1
      };
    } else {
      return {
        start: pos1,
        end: pos2
      };
    }
  };

  this.isReverse = function() {
    var cursor = this.__cursor;
    return (cursor.nodePos < this.start[0]) || (cursor.nodePos === this.start[0] && cursor.charPos < this.start[1]);
  };

  // Set cursor to position
  // --------
  //
  // Convenience for placing the single cusor where start=end

  this.setCursor = function(pos) {
    this.__cursor.set(pos[0], pos[1]);
    this.start = pos;
    return this;
  };

  // Get the selection's  cursor
  // --------
  //

  this.getCursor = function() {
    return this.__cursor.copy();
  };

  this.getCursorPosition = function() {
    return [this.__cursor.nodePos, this.__cursor.charPos];
  };

  // Fully selects a the node with the given id
  // --------
  //

  this.selectNode = function(nodeId) {
    var nodePos = this.container.getPosition(nodeId);
    if (nodePos < 0) {
      throw new SelectionError("Node is not visible: " + nodeId);
    }
    var node = this.container.getNodeFromPosition(nodePos);
    this.set({
      start: [nodePos, 0],
      end: [nodePos, node.getLength()]
    });
  };

  // Get predecessor node of a given node pos
  // --------
  //

  this.getPredecessor = function() {
    var nodePos = this.isReverse() ? this.__cursor.nodePos: this.start[0];
    if (nodePos === 0) return null;
    return this.__node(nodePos-1);
  };

  // Get successor node of a given node pos
  // --------
  //

  this.getSuccessor = function() {
    var nodePos = this.isReverse() ? this.start[0] : this.__cursor.nodePos;
    return this.__node(nodePos+1);
  };

  // Check if the given position has a successor
  // --------
  //

  // TODO: is this really necessary? ~> document.hasPredecessor
  this.hasPredecessor = function(nodePos) {
    return nodePos > 0;
  };

  // Check if the given node has a successor
  // --------
  //

  // TODO: is this really necessary? ~> document.hasSuccessor
  this.hasSuccessor = function(nodePos) {
    var l = this.container.getLength();
    return nodePos < l-1;
  };


  // Collapses the selection into a given direction
  // --------
  //

  this.collapse = function(direction) {
    if (direction !== "right" && direction !== "left" && direction !== "start" && direction !== "cursor") {
      throw new SelectionError("Invalid direction: " + direction);
    }

    if (this.isCollapsed() || this.isNull()) return;

    if (direction === "start") {
      this.__cursor.set(this.start[0], this.start[1]);

    } else if (direction === "cursor") {
      this.start[0] = this.__cursor.nodePos;
      this.start[1] = this.__cursor.charPos;

    } else {
      var range = this.range();

      if (this.isReverse()) {
        if (direction === 'left') {
          this.start = range.start;
        } else {
          this.__cursor.set(range.end[0], range.end[1]);
        }
      } else {
        if (direction === 'left') {
          this.__cursor.set(range.start[0], range.start[1]);
        } else {
          this.start = range.end;
        }
      }
    }

    this.trigger('selection:changed', this.range());
  };

  // move selection to position
  // --------
  //
  // Convenience for placing the single cusor where start=end

  this.move = function(direction, granularity) {

    // moving an expanded selection by char collapses the selection
    // and sets the cursor to the boundary of the direction
    if (!this.isCollapsed() && granularity === "char") {
      this.collapse(direction);
    }
    // otherwise the cursor gets moved (together with start)
    else {
      this.__cursor.move(direction, granularity);
      this.start = this.__cursor.position();
    }

    this.trigger('selection:changed', this.range());
  };

  // Expand current selection
  // ---------
  //
  // Selections keep the direction as a state
  // They can either be right-bound or left-bound
  //

  this.expand = function(direction, granularity) {
    // expanding is done by moving the cursor
    this.__cursor.move(direction, granularity);

    this.trigger('selection:changed', this.range());
  };

  // JSON serialization
  // --------
  //

  this.toJSON = function() {
    return this.range();
  };

  // For a given document return the selected nodes
  // --------
  //

  this.getNodes = function() {
    var allNodes = this.container.getNodes();
    if (this.isNull()) return [];
    var range = this.range();

    return allNodes.slice(range.start[0], range.end[0]+1);
  };

  // Derives Range objects for the selection
  // --------
  //

  this.getRanges = function() {
    var ranges = [];

    var sel = this.range();

    for (var i = sel.start[0]; i <= sel.end[0]; i++) {
      var startChar = 0;
      var endChar = null;

      // in the first node search only in the trailing part
      if (i === sel.start[0]) {
        startChar = sel.start[1];
      }

      // in the last node search only in the leading part
      if (i === sel.end[0]) {
        endChar = sel.end[1];
      }

      if (!_.isNumber(endChar)) {
        var node = this.__node(i);
        endChar = node.getLength();
      }
      ranges.push(new Selection.Range(this, i, startChar, endChar));
    }
    return ranges;
  };

  // Returns start node offset
  // --------
  //

  this.startNode = function() {
    return this.isReverse() ? this.__cursor.nodePos : this.start[0];
  };

  // Returns end node offset
  // --------
  //

  this.endNode = function() {
    return this.isReverse() ? this.start[0] : this.__cursor.nodePos;
  };


  // Returns start node offset
  // --------
  //

  this.startChar = function() {
    return this.isReverse() ? this.__cursor.charPos : this.start[1];
  };

  // Returns end node offset
  // --------
  //

  this.endChar = function() {
    return this.isReverse() ? this.start[1] : this.__cursor.charPos;
  };


  // No selection
  // --------
  //
  // Returns true if there's just a single cursor not a selection spanning
  // over 1+ characters

  this.isNull = function() {
    return this.start === null;
  };


  // Collapsed
  // --------
  //
  // Returns true if there's just a single cursor not a selection spanning
  // over 1+ characters

  this.isCollapsed = function() {
    return this.start[0] === this.__cursor.nodePos && this.start[1] === this.__cursor.charPos;
  };


  // Multinode
  // --------
  //
  // Returns true if the selection refers to multiple nodes

  this.hasMultipleNodes = function() {
    return !this.isNull() && (this.startNode() !== this.endNode());
  };

};

Selection.Prototype.prototype = util.Events;
Selection.prototype = new Selection.Prototype();

Object.defineProperties(Selection.prototype, {
  cursor: {
    get: function() {
      return this.__cursor.copy();
    },
    set: function() { throw "immutable property"; }
  }
});

// Document.Selection.Range
// ================
//
// A Document.Selection consists of 1..n Ranges
// Each range belongs to a node in the document
// This allows us to ask the range about the selected text
// or ask if it's partially selected or not
// For example if an image is fully selected we can just delete it

var Range = function(selection, nodePos, start, end) {
  this.selection = selection;
  // The node pos within the document which can range
  // between selection.startNode() and selection.endNode()
  this.nodePos = nodePos;
  this.node = selection.__node(nodePos);
  this.start = start;
  this.end = end;
};

Range.Prototype = function() {

  // Returns true if the range denotes the first range in a selection
  // --------
  //

  this.isFirst = function() {
    return this.nodePos === this.selection.startNode();
  };

  // Returns true if the range denotes the last range in a selection
  // --------
  //

  this.isLast = function() {
    return this.nodePos === this.selection.endNode();
  };

  // Returns true if the range denotes the last range in a selection
  // --------
  //

  this.hasPredecessor = function() {
    return !this.isFirst();
  };

  // Returns true if the range denotes the last range in a selection
  // --------
  //

  this.hasSuccessor = function() {
    return !this.isLast();
  };

  // Returns true if the range is fully enclosed by both a preceding and successing range
  // --------
  //

  this.isEnclosed = function() {
    return this.hasPredecessor() && this.hasSuccessor();
  };

  // Returns true if the range includes the last character of a node
  // --------
  //

  this.isRightBound = function() {
    return this.end === this.node.getLength();
  };

  // Returns true if the range includes the first character of a node
  // --------
  //

  this.isLeftBound = function() {
    return this.start === 0;
  };

  // Returns the length of the range which corresponds to the number of chars contained
  // --------
  //

  this.length = function() {
    return this.end - this.start;
  };

  // Returns the range's content
  // --------
  //

  this.content = function() {
    // TODO: rethink. such ranges will only work for for text nodes
    return this.node.content.slice(this.start, this.end);
  };

  // Returns true if all chars are selected
  // --------
  //

  this.isFull = function() {
    return this.isLeftBound() && this.isRightBound();
  };

  // Returns true if the range includes the first character of a node
  // --------
  //

  this.isPartial = function() {
    return !this.isFull();
  };

};

Range.prototype = new Range.Prototype();

Selection.Range = Range;
Selection.SelectionError = SelectionError;

// Export
// ========

module.exports = Selection;

},{"./cursor":114,"substance-util":207,"underscore":212}],118:[function(require,module,exports){
"use strict";

var _ = require("underscore");
var Operator = require('substance-operator');
var SRegExp = require("substance-regexp");
var ObjectOperation = Operator.ObjectOperation;
var TextOperation = Operator.TextOperation;
var DocumentNode = require("./node");

// Substance.Text
// -----------------
//

var Text = function(node, document) {
  DocumentNode.call(this, node, document);
};


Text.type = {
  "id": "text",
  "parent": "content",
  "properties": {
    "source_id": "Text element source id",
    "content": "string"
  }
};


// This is used for the auto-generated docs
// -----------------
//

Text.description = {
  "name": "Text",
  "remarks": [
    "A simple text fragement that can be annotated. Usually text nodes are combined in a paragraph.",
  ],
  "properties": {
    "content": "Content",
  }
};


// Example Paragraph
// -----------------
//

Text.example = {
  "type": "paragraph",
  "id": "paragraph_1",
  "content": "Lorem ipsum dolor sit amet, adipiscing elit.",
};


Text.Prototype = function() {

  this.getChangePosition = function(op) {
    if (op.path[1] === "content") {
      var lastChange = Operator.Helpers.last(op.diff);
      if (lastChange.isInsert()) {
        return lastChange.pos+lastChange.length();
      } else if (lastChange.isDelete()) {
        return lastChange.pos;
      }
    }
    return -1;
  };

  this.getLength = function() {
    return this.properties.content.length;
  };

  this.insertOperation = function(charPos, text) {
    return ObjectOperation.Update([this.properties.id, "content"],
      TextOperation.Insert(charPos, text));
  };

  this.deleteOperation = function(startChar, endChar) {
    var content = this.properties.content;
    return ObjectOperation.Update([this.properties.id, "content"],
      TextOperation.Delete(startChar, content.substring(startChar, endChar)),
      "string");
  };

  this.prevWord = function(charPos) {

    var content = this.properties.content;

    // Matches all word boundaries in a string
    var wordBounds = new SRegExp(/\b\w/g).match(content);
    var prevBounds = _.select(wordBounds, function(m) {
      return m.index < charPos;
    }, this);

    // happens if there is some leading non word stuff
    if (prevBounds.length === 0) {
      return 0;
    } else {
      return _.last(prevBounds).index;
    }
  };

  this.nextWord = function(charPos) {
    var content = this.properties.content;

    // Matches all word boundaries in a string
    var wordBounds = new SRegExp(/\w\b/g).match(content.substring(charPos));

    // at the end there might be trailing stuff which is not detected as word boundary
    if (wordBounds.length === 0) {
      return content.length;
    }
    // before, there should be some boundaries
    else {
      var nextBound = wordBounds[0];
      return charPos + nextBound.index + 1;
    }
  };

  this.canJoin = function(other) {
    return (other instanceof Text);
  };

  this.join = function(doc, other) {
    var pos = this.properties.content.length;
    var text = other.content;

    doc.update([this.id, "content"], [pos, text]);
    var annotations = doc.indexes["annotations"].get(other.id);

    _.each(annotations, function(anno) {
      doc.set([anno.id, "path"], [this.properties.id, "content"]);
      doc.set([anno.id, "range"], [anno.range[0]+pos, anno.range[1]+pos]);
    }, this);
  };

  this.isBreakable = function() {
    return true;
  };

  this.break = function(doc, pos) {
    var tail = this.properties.content.substring(pos);

    // 1. Create a new node containing the tail content
    var newNode = this.toJSON();
    // letting the textish node override the type of the new node
    // e.g., a 'heading' breaks into a 'paragraph'
    newNode.type = this.splitInto ? this.splitInto : this.properties.type;
    newNode.id = doc.uuid(this.properties.type);
    newNode.content = tail;
    doc.create(newNode);

    // 2. Move all annotations
    var annotations = doc.indexes["annotations"].get(this.properties.id);
    _.each(annotations, function(annotation) {
      if (annotation.range[0] >= pos) {
        doc.set([annotation.id, "path"], [newNode.id, "content"]);
        doc.set([annotation.id, "range"], [annotation.range[0]-pos, annotation.range[1]-pos]);
      }
    });

    // 3. Trim this node's content;
    doc.update([this.properties.id, "content"], TextOperation.Delete(pos, tail))

    // return the new node
    return newNode;
  };

};

Text.Prototype.prototype = DocumentNode.prototype;
Text.prototype = new Text.Prototype();
Text.prototype.constructor = Text;

DocumentNode.defineProperties(Text.prototype, ["content"]);

module.exports = Text;

},{"./node":116,"substance-operator":175,"substance-regexp":186,"underscore":212}],119:[function(require,module,exports){
var Test = require('substance-test');
var assert = Test.assert;
var registerTest = Test.registerTest;
var TestDocument = require('./test_document');
var Document = require("../index");
var Container = require("../src/container");
var Chronicle = require("substance-chronicle");

var DOC = {
  "nodes": {
    "h1": {
      "id": "h1",
      "type": "heading",
      "content": "Part 1",
      "level": 1
    },
    "p1": {
      "id": "p1",
      "type": "paragraph",
      "content": "The quick brown fox jumps over the lazy dog."
    },
    "l1": {
      "id": "l1",
      "type": "list",
      "items": ["p10", "p11", "p12"],
    },
    "p10": {
      "id": "p10",
      "type": "paragraph",
      "content": "List item 1."
    },
    "p11": {
      "id": "p11",
      "type": "paragraph",
      "content": "List item 2."
    },
    "p12": {
      "id": "p12",
      "type": "paragraph",
      "content": "List item 3."
    },
    "p2": {
      "id": "p2",
      "type": "paragraph",
      "content": "  Pack my box with five dozen liquor jugs."
    },
    "h2": {
      "id": "h2",
      "type": "heading",
      "content": "Part 2",
      "level": 1
    },
    "p3": {
      "id": "p3",
      "type": "paragraph",
      "content": "Fix problem quickly with galvanized jets."
    },
    "f1": {
      "id": "f1",
      "type": "figure",
      "image": "i1",
      "caption": "p13"
    },
    "i1": {
      "id": "i1",
      "type": "image",
      "url": "https://github-camo.global.ssl.fastly.net/e0a00dc1e48a3c136441721dfe70a8bf67719e2b/687474703a2f2f662e636c2e6c792f6974656d732f334d326a306a326e31733042304f3259337032682f696c2d6c656f6e652d69636f6e2e706e67"
    },
    "p13": {
      "id": "p13",
      "type": "paragraph",
      "content": "The Substance Icon."
    },
    "p4": {
      "id": "p4",
      "type": "paragraph",
      "content": "Heavy boxes perform quick waltzes and jigs."
    },
    "content": {
      "id": "content",
      "type": "view",
      "nodes": ["h1", "p1", "l1", "p2", "h2", "p3", "f1", "p4"]
    },
    "p20": {
      "id": "p20",
      "type": "paragraph",
      "content": "Some other content."
    },
  }
};

var ContainerTest = function () {

  this.setup = function() {
    this.doc = new TestDocument({seed: DOC, chronicle: Chronicle.create({mode: Chronicle.HYSTERICAL})});
    this.container = this.doc.get("content");
  };

  this.actions = [
    "Access nodes in the flattened view", function() {
      var nodes = this.container.getNodes("idsOnly");
      assert.isArrayEqual(["h1", "p1", "p10", "p11", "p12", "p2", "h2", "p3", "i1", "p13", "p4"], nodes);
    },

    "Get parent of nested node", function() {
      var parent = this.container.getParent("p10");
      assert.isEqual("l1", parent);
    },

    "Parent of top-level nodes is null", function() {
      var parent = this.container.getParent("p1");
      assert.isEqual(null, parent);
    },

    "Update the view when adding a node to a composite", function() {
      this.setup();
      this.doc.update(["l1", "items"], ["+", 3, "p20"]);
      var nodes = this.container.getNodes("idsOnly");
      assert.isArrayEqual(["h1", "p1", "p10", "p11", "p12", "p20", "p2", "h2", "p3", "i1", "p13", "p4"], nodes);
    },

    "Update the view when removing a node from a composite", function() {
      this.setup();
      this.doc.update(["l1", "items"], ["-", 2, "p12"]);
      var nodes = this.container.getNodes("idsOnly");
      assert.isArrayEqual(["h1", "p1", "p10", "p11", "p2", "h2", "p3", "i1", "p13", "p4"], nodes);
    },

    "Update the view when changing a reference in a composite", function() {
      this.setup();
      this.doc.set(["f1", "caption"], "p20");
      var nodes = this.container.getNodes("idsOnly");
      assert.isArrayEqual(["h1", "p1", "p10", "p11", "p12", "p2", "h2", "p3", "i1", "p20", "p4"], nodes);
    },

    "Update the view when changing a top-level composite", function() {
      this.setup();
      this.doc.update(["content", "nodes"], ["-", 2, "l1"]);
      var nodes = this.container.getNodes("idsOnly");
      assert.isArrayEqual(["h1", "p1", "p2", "h2", "p3", "i1", "p13", "p4"], nodes);
    },

    "Child nodes can only be referenced once", function() {
      this.setup();
      // Note: "p13" is already used as caption in 'f1'
      assert.exception(function() {
        this.doc.update(["l1", "items"], ["+", 3, "p13"]);
      }, this);
    },
  ];
};

registerTest(['Substance.Document', 'Container'], new ContainerTest());

},{"../index":108,"../src/container":112,"./test_document":124,"substance-chronicle":73,"substance-test":198}],120:[function(require,module,exports){
"use strict";

var _ = require("underscore");
var util = require("substance-util");
var Test = require('substance-test');
var assert = Test.assert;
var registerTest = Test.registerTest;
var TestDocument = require("./test_document");
var DocumentController = require("../src/controller");
var Chronicle = require("substance-chronicle");

var FIXTURES = {};

var DocumentManipulationTest = function () {

  this.setup = function() {
  };

  this.fixture = function(name) {
    var data = FIXTURES[name];
    this.doc = new TestDocument({seed: data, chronicle: Chronicle.create({mode: Chronicle.HYSTERICAL })});
    this.controller = new DocumentController(this.doc);
    this.container = this.controller.container;
    this.manipulator = new DocumentController.ManipulationSession(this.doc, this.controller.selection);
    return data;
  };

  this.actions = [
/*
    "Join two paragraphs", function() {
      var fixture = this.fixture("two_paragraphs");

      var success = this.manipulator.join("p1", "p2");
      assert.isTrue(success);

      var p1 = this.doc.get("p1");
      var expectedContent = fixture.nodes["p1"].content + fixture.nodes["p2"].content;

      assert.isEqual(expectedContent, p1.content);
      assert.isUndefined(this.doc.get("p2"));
      assert.isArrayEqual(["p1"], this.container.getNodes("idsOnly"));
    },

    "Reject join of incompatible nodes", function() {
      this.fixture("paragraph_and_image");

      var success = this.manipulator.join("p1", "i1");

      assert.isFalse(success);
      assert.isArrayEqual(["p1", "i1"], this.container.getNodes("idsOnly"));
    },

    "Nested nodes: join two list items", function() {
      var fixture = this.fixture("list");

      var success = this.manipulator.join("p1", "p2");
      assert.isTrue(success);

      var p1 = this.doc.get("p1");
      var l1 = this.doc.get("l1");

      var expectedContent = fixture.nodes["p1"].content + fixture.nodes["p2"].content;

      assert.isEqual(expectedContent, p1.content);
      assert.isUndefined(this.doc.get("p2"));
      assert.isArrayEqual(["p1", "p3"], l1.items);
    },

    "Embedded Nested Nodes: join paragraph with list item", function() {
      var fixture = this.fixture("embedded_list");

      var success = this.manipulator.join("p1", "p2");
      assert.isTrue(success);

      var p1 = this.doc.get("p1");
      var l1 = this.doc.get("l1");

      var expectedContent = fixture.nodes["p1"].content + fixture.nodes["p2"].content;
      assert.isEqual(expectedContent, p1.content);
      assert.isUndefined(this.doc.get("p2"));
      assert.isArrayEqual(["p3", "p4"], l1.items);
    },

    "Embedded Nested Nodes: join last list item with paragraph", function() {
      var fixture = this.fixture("embedded_list");

      var success = this.manipulator.join("p4", "p5");
      assert.isTrue(success);

      var p4 = this.doc.get("p4");

      var expectedContent = fixture.nodes["p4"].content + fixture.nodes["p5"].content;
      assert.isEqual(expectedContent, p4.content);
      assert.isUndefined(this.doc.get("p5"));
      assert.isArrayEqual(["p1", "l1"], this.container.treeView);
    },

    "Embedded Nested Nodes: can not join with a figure caption", function() {
      this.fixture("embedded_figure");

      var success = this.manipulator.join("p2", "p3");
      assert.isFalse(success);

      assert.isArrayEqual(["p1", "f1", "p3"], this.container.treeView);
    },

    "Join two lists", function() {
      var fixture = this.fixture("two_lists");

      var success = this.manipulator.join("p2", "p3");
      assert.isTrue(success);

      var l1 = this.doc.get("l1");
      var p2 = this.doc.get("p2");

      var expectedContent = fixture.nodes["p2"].content + fixture.nodes["p3"].content;
      assert.isEqual(expectedContent, p2.content);
      assert.isUndefined(this.doc.get("p3"));
      assert.isArrayEqual(["p1", "p2", "p4"], l1.items);
      assert.isArrayEqual(["l1"], this.container.treeView);
    },

    "Joins in multiply nested nodes: nested lists", function() {
      var fixture = this.fixture("nested_lists");

      var success = this.manipulator.join("p1", "p2");
      assert.isTrue(success);

      var l1 = this.doc.get("l1");
      var l2 = this.doc.get("l2");
      var p1 = this.doc.get("p1");

      var expectedContent = fixture.nodes["p1"].content + fixture.nodes["p2"].content;
      assert.isEqual(expectedContent, p1.content);
      assert.isUndefined(this.doc.get("p2"));
      assert.isArrayEqual(["p1", "l2", "p4"], l1.items);
      assert.isArrayEqual(["p3"], l2.items);
      assert.isArrayEqual(["l1"], this.container.treeView);
    },

    "Delete partially (single paragraph)", function() {
      this.fixture("single_paragraph");

      this.controller.selection.set({start: [0, 2], end: [0, 4]});
      this.controller.delete();

      var p1 = this.doc.get("p1");
      var expected = "Heo";
      assert.isEqual(expected, p1.content);
    },

    "Delete full node (single paragraph)", function() {
      this.fixture("single_paragraph");

      this.controller.selection.set({start: [0, 0], end: [0, 5]});
      this.controller.delete();

      assert.isUndefined(this.doc.get("p1"));
      assert.isArrayEqual([], this.container.getNodes("idsOnly"));
    },

    "Delete across two paragraphs", function() {
      this.fixture("two_paragraphs");

      this.controller.selection.set({start: [0, 4], end: [1, 1]});
      this.controller.delete();

      var p1 = this.doc.get("p1");
      var expected = "Hellorld";

      assert.isEqual(expected, p1.content);
    },

    "Delete multi-nodes, fully", function() {
      this.fixture("two_paragraphs");

      this.controller.selection.set({start: [0, 0], end: [1, 5]});
      this.controller.delete();

      assert.isArrayEqual([], this.container.getNodes("idsOnly"));
    },

    "Delete, but don't join an image", function() {
      this.fixture("paragraph_and_image");

      this.controller.selection.set({start: [0, 4], end: [1, 0]});
      this.controller.delete();

      assert.isArrayEqual(["p1", "i1"], this.container.getNodes("idsOnly"));
    },

    "Delete a list item", function() {
      this.fixture("list");

      this.controller.selection.set({start: [0, 0], end: [1, 0]});
      this.controller.delete();

      var l1 = this.doc.get("l1");
      assert.isArrayEqual(["p2", "p3"], l1.items);
    },

    "Deleting in list with join of items", function() {
      this.fixture("list");

      this.controller.selection.set({start: [0, 2], end: [1, 1]});
      this.controller.delete();

      var l1 = this.doc.get("l1");
      var p1 = this.doc.get("p1");
      assert.isArrayEqual(["p1", "p3"], l1.items);
      assert.isEqual("Tiac", p1.content);
    },

    "Delete a list", function() {
      this.fixture("list");

      this.controller.selection.set({start: [0, 0], end: [2, 3]});
      this.controller.delete();

      assert.isUndefined(this.doc.get("l1"));
      assert.isArrayEqual([], this.container.treeView);
    },

    "Partially delete a paragraph and a succeeding list item", function() {
      this.fixture("embedded_list");

      this.controller.selection.set({start: [0, 3], end: [1, 2]});
      this.controller.delete();

      var l1 = this.doc.get("l1");
      var p1 = this.doc.get("p1");

      assert.isEqual("Helc", p1.content);
      assert.isUndefined(this.doc.get("p2"));
      assert.isArrayEqual(["p3", "p4"], l1.items);
    },

    "Partially delete a list and a succeeding paragraph", function() {
      this.fixture("embedded_list");

      this.controller.selection.set({start: [3, 2], end: [4, 3]});
      this.controller.delete();

      var p4 = this.doc.get("p4");

      assert.isEqual("Told", p4.content);
      assert.isUndefined(this.doc.get("p5"));
      assert.isArrayEqual(["p1", "l1"], this.container.treeView);
    },

    "Deleting a Figure's image leaves a null reference", function() {
      this.fixture("figure");

      this.controller.selection.set({start: [0, 0], end: [0, 1]});
      this.controller.delete();

      var f1 = this.doc.get("f1");
      assert.isUndefined(this.doc.get("i1"));
      assert.isNull(f1.image);
    },

    "Deleting a Figure's caption empties the caption (but does not delete it)", function() {
      this.fixture("figure");

      this.controller.selection.set({start: [1, 0], end: [1, 7]});
      this.controller.delete();

      var p1 = this.doc.get("p1");
      assert.isEqual("", p1.content);
    },

    "Delete a Figure", function() {
      this.fixture("figure");

      this.controller.selection.set({start: [0, 0], end: [1, 7]});
      this.controller.delete();

      assert.isUndefined(this.doc.get("f1"));
      assert.isArrayEqual([], this.container.treeView);
    },

    "Delete before a Figures'image without merging", function() {
      this.fixture("embedded_figure");

      this.controller.selection.set({start: [0, 3], end: [1, 0]});
      this.controller.delete();

      var p1 = this.doc.get("p1");

      assert.isEqual("Hel", p1.content);
      assert.isArrayEqual(["p1", "f1", "p3"], this.container.treeView);
    },

    "Delete at a Figure's caption without join with next", function() {
      this.fixture("embedded_figure");

      this.controller.selection.set({start: [2, 3], end: [3, 2]});
      this.controller.delete();

      var p2 = this.doc.get("p2");
      var p3 = this.doc.get("p3");

      assert.isDefined(p3);
      assert.isEqual("Cap", p2.content);
      assert.isEqual("rld", p3.content);
      assert.isArrayEqual(["p1", "f1", "p3"], this.container.treeView);
    },

    "Delete accross list boundaries (join lists)", function() {
      this.fixture("two_lists");

      this.controller.selection.set({start: [1, 2], end: [2, 2]});
      this.controller.delete();

      var p2 = this.doc.get("p2");

      assert.isUndefined(this.doc.get("p3"));
      assert.isEqual("Item 3", p2.content);
      assert.isArrayEqual(["l1"], this.container.treeView);
    },

    "Delete in nested lists", function() {
      this.fixture("nested_lists");

      this.controller.selection.set({start: [0, 2], end: [1, 2]});
      this.controller.delete();

      var p1 = this.doc.get("p1");
      var l1 = this.doc.get("l1");
      var l2 = this.doc.get("l2");

      assert.isUndefined(this.doc.get("p2"));
      assert.isEqual("Item 2", p1.content);
      assert.isArrayEqual(["p1", "l2", "p4"], l1.items);
      assert.isArrayEqual(["p3"], l2.items);
    },

    "Delete in nested lists: from parent into child list", function() {
      this.fixture("nested_lists");

      this.controller.selection.set({start: [2, 6], end: [3, 0]});
      this.controller.delete();

      var p3 = this.doc.get("p3");
      var l1 = this.doc.get("l1");
      var l2 = this.doc.get("l2");

      assert.isUndefined(this.doc.get("p4"));
      assert.isDefined(this.doc.get("l1"));
      assert.isDefined(this.doc.get("l2"));
      assert.isEqual("Item 3Item 4", p3.content);
      assert.isArrayEqual(["p1", "l2"], l1.items);
      assert.isArrayEqual(["p2", "p3"], l2.items);
    },

    "Delete a nested list", function() {
      this.fixture("nested_lists_2");

      this.controller.selection.set({start: [0, 6], end: [1, 0]});
      this.controller.delete();

      var p1 = this.doc.get("p1");
      var l1 = this.doc.get("l1");

      assert.isDefined(this.doc.get("l1"));
      assert.isUndefined(this.doc.get("l2"));
      assert.isEqual("Item 1Item 2", p1.content);
      assert.isArrayEqual(["p1"], l1.items);
    },

    */

    "Break a paragraph", function() {
      this.fixture("two_paragraphs");

      this.controller.selection.set([0, 3]);
      this.controller.breakNode();

      var nodes = this.container.getNodes();

      assert.isEqual("Hel", nodes[0].content);
      assert.isEqual("lo", nodes[1].content);
      assert.isEqual("World", nodes[2].content);
    },

    "Figures are not breakable", function() {
      this.fixture("figure");

      this.controller.selection.set([1, 3]);
      this.controller.breakNode();

      var nodeIds = this.container.getNodes("idsOnly");

      assert.isArrayEqual(["i1", "p1"], nodeIds);
    },

    "Breaking a list creates a new list item", function() {
      this.fixture("list");

      this.controller.selection.set([1, 1]);
      this.controller.breakNode();

      var nodes = this.container.getNodes();

      assert.isEqual("Tic", nodes[0].content);
      assert.isEqual("T", nodes[1].content);
      assert.isEqual("ac", nodes[2].content);
      assert.isEqual("Toe", nodes[3].content);
    },
  ];

};

var SUBSTANCE_ICON_URL = "https://github-camo.global.ssl.fastly.net/e0a00dc1e48a3c136441721dfe70a8bf67719e2b/687474703a2f2f662e636c2e6c792f6974656d732f334d326a306a326e31733042304f3259337032682f696c2d6c656f6e652d69636f6e2e706e67";

FIXTURES["single_paragraph"] = {
  nodes: {
    "p1": {
      id: "p1",
      type: "paragraph",
      content: "Hello"
    },
    "content": {
      "id": "content",
      "type": "view",
      "nodes": ["p1"]
    }
  }
};

FIXTURES["two_paragraphs"] = {
  nodes: {
    "p1": {
      id: "p1",
      type: "paragraph",
      content: "Hello"
    },
    "p2": {
      id: "p2",
      type: "paragraph",
      content: "World"
    },
    "content": {
      "id": "content",
      "type": "view",
      "nodes": ["p1", "p2"]
    }
  }
};

FIXTURES["paragraph_and_image"] = {
  nodes: {
    "p1": {
      id: "p1",
      type: "paragraph",
      content: "Hello"
    },
    "i1": {
      id: "i1",
      type: "image",
      url: SUBSTANCE_ICON_URL
    },
    "content": {
      "id": "content",
      "type": "view",
      "nodes": ["p1", "i1"]
    }
  }
};

FIXTURES["list"] = {
  nodes: {
    "p1": {
      id: "p1",
      type: "paragraph",
      content: "Tic"
    },
    "p2": {
      id: "p2",
      type: "paragraph",
      content: "Tac"
    },
    "p3": {
      id: "p3",
      type: "paragraph",
      content: "Toe"
    },
    "l1": {
      id: "l1",
      type: "list",
      items: ["p1", "p2", "p3"]
    },
    "content": {
      "id": "content",
      "type": "view",
      "nodes": ["l1"]
    }
  }
};

FIXTURES["figure"] = {
  nodes: {
    "i1": {
      id: "i1",
      type: "image",
      url: SUBSTANCE_ICON_URL
    },
    "p1": {
      id: "p1",
      type: "paragraph",
      content: "Caption"
    },
    "f1": {
      id: "f1",
      type: "figure",
      image: "i1",
      caption: "p1"
    },
    "content": {
      "id": "content",
      "type": "view",
      "nodes": ["f1"]
    }
  }
};

FIXTURES["embedded_list"] = {
  nodes: {
    "p1": {
      id: "p1",
      type: "paragraph",
      content: "Hello"
    },
    "p2": {
      id: "p2",
      type: "paragraph",
      content: "Tic"
    },
    "p3": {
      id: "p3",
      type: "paragraph",
      content: "Tac"
    },
    "p4": {
      id: "p4",
      type: "paragraph",
      content: "Toe"
    },
    "l1": {
      id: "l1",
      type: "list",
      items: ["p2", "p3", "p4"]
    },
    "p5": {
      id: "p5",
      type: "paragraph",
      content: "World"
    },
    "content": {
      "id": "content",
      "type": "view",
      "nodes": ["p1", "l1", "p5"]
    }
  }
};

FIXTURES["embedded_figure"] = {
  nodes: {
    "p1": {
      id: "p1",
      type: "paragraph",
      content: "Hello"
    },
    "i1": {
      id: "i1",
      type: "image",
      url: SUBSTANCE_ICON_URL
    },
    "p2": {
      id: "p2",
      type: "paragraph",
      content: "Caption"
    },
    "f1": {
      id: "f1",
      type: "figure",
      image: "i1",
      caption: "p2"
    },
    "p3": {
      id: "p3",
      type: "paragraph",
      content: "World"
    },
    "content": {
      "id": "content",
      "type": "view",
      "nodes": ["p1", "f1", "p3"]
    }
  }
};

FIXTURES["two_lists"] = {
  nodes: {
    "p1": {
      id: "p1",
      type: "paragraph",
      content: "Item 1"
    },
    "p2": {
      id: "p2",
      type: "paragraph",
      content: "Item 2"
    },
    "p3": {
      id: "p3",
      type: "paragraph",
      content: "Item 3"
    },
    "p4": {
      id: "p4",
      type: "paragraph",
      content: "Item 4"
    },
    "l1": {
      id: "l1",
      type: "list",
      items: ["p1", "p2"]
    },
    "l2": {
      id: "l2",
      type: "list",
      items: ["p3", "p4"]
    },
    "content": {
      "id": "content",
      "type": "view",
      "nodes": ["l1", "l2"]
    }
  }
};

FIXTURES["nested_lists"] = {
  nodes: {
    "p1": {
      id: "p1",
      type: "paragraph",
      content: "Item 1"
    },
    "p2": {
      id: "p2",
      type: "paragraph",
      content: "Item 2"
    },
    "p3": {
      id: "p3",
      type: "paragraph",
      content: "Item 3"
    },
    "p4": {
      id: "p4",
      type: "paragraph",
      content: "Item 4"
    },
    "l2": {
      id: "l2",
      type: "list",
      items: ["p2", "p3"]
    },
    "l1": {
      id: "l1",
      type: "list",
      items: ["p1", "l2", "p4"]
    },
    "content": {
      "id": "content",
      "type": "view",
      "nodes": ["l1"]
    }
  }
};

FIXTURES["nested_lists_2"] = {
  nodes: {
    "p1": {
      id: "p1",
      type: "paragraph",
      content: "Item 1"
    },
    "p2": {
      id: "p2",
      type: "paragraph",
      content: "Item 2"
    },
    "l2": {
      id: "l2",
      type: "list",
      items: ["p2"]
    },
    "l1": {
      id: "l1",
      type: "list",
      items: ["p1", "l2"]
    },
    "content": {
      "id": "content",
      "type": "view",
      "nodes": ["l1"]
    }
  }
};

_.each(FIXTURES, function(fixture) {
  util.freeze(fixture);
});

registerTest(['Substance.Document', 'Manipulation'], new DocumentManipulationTest());

},{"../src/controller":113,"./test_document":124,"substance-chronicle":73,"substance-test":198,"substance-util":207,"underscore":212}],121:[function(require,module,exports){
module.exports={
  "nodes": {
    "h1": {
      "id": "h1",
      "type": "heading",
      "content": "Part 1",
      "level": 1
    },
    "p1": {
      "id": "p1",
      "type": "paragraph",
      "content": "The quick brown fox jumps over the lazy dog."
    },
    "p2": {
      "id": "p2",
      "type": "paragraph",
      "content": "  Pack my box with five dozen liquor jugs."
    },
    "h2": {
      "id": "h2",
      "type": "heading",
      "content": "Part 2",
      "level": 1
    },
    "p3": {
      "id": "p3",
      "type": "paragraph",
      "content": "Fix problem quickly with galvanized jets."
    },
    "p4": {
      "id": "p4",
      "type": "paragraph",
      "content": "Heavy boxes perform quick waltzes and jigs."
    },
    "content": {
      "id": "content",
      "type": "view",
      "nodes": ["h1", "p1", "p2", "h2", "p3", "p4"]
    }
  }
}

},{}],122:[function(require,module,exports){
"use strict";

// Document Tests
// ---------------

//require("./document_test");

require("./document_manipulation_test");

// Container Tests
// --------

require("./container_test");

// Selection Tests
// ---------------

require("./selection_test");


// Writer Tests
// ---------------


// Actual tests
// require("./writer/content_deletion");

// require("./writer/content_deletion");
// require("./writer/annotation_business");


},{"./container_test":119,"./document_manipulation_test":120,"./selection_test":123}],123:[function(require,module,exports){
"use strict";

// Import
// ========

var Test = require('substance-test');
var assert = Test.assert;
var registerTest = Test.registerTest;
var TestDocument = require('./test_document');
var Document = require("../index");
var Container = Document.Container;
var Selection = Document.Selection;

// Test
// ========

var SelectionTest = function() {


  this.setup = function() {
    this.fixture();
  };

  this.fixture = function() {
    var seed = require("./fixture.json");
    this.doc = new TestDocument({seed: seed});
    this.container = this.doc.get("content");
    this.sel = new Selection(this.container);
  };

  this.actions = [

    "Empty Selection 'isNull' and has no valid Cursor", function() {
      assert.isTrue(this.sel.isNull());
      var cursor = this.sel.getCursor();
      assert.isFalse(cursor.isValid());
    },

    "Setting a range in the first node", function() {
      this.sel.set({start: [0,0], end: [0,3]});
      assert.isFalse(this.sel.isCollapsed());
      assert.isEqual(0, this.sel.startNode());
      assert.isEqual(0, this.sel.startChar());
      assert.isEqual(0, this.sel.endNode());
      assert.isEqual(3, this.sel.endChar());
      assert.isFalse(this.sel.isCollapsed());
    },

    "set() should reject invalid positions", function() {
      assert.exception(Selection.SelectionError, function() {
        this.sel.set({start: [-1,0], end: [0,3]});
      }, this);
      assert.exception(Selection.SelectionError, function() {
        this.sel.set({start: [2000,0], end: [0,3]});
      }, this);
      assert.exception(Selection.SelectionError, function() {
        this.sel.set({start: [0,0], end: [-1,3]});
      }, this);
      assert.exception(Selection.SelectionError, function() {
        this.sel.set({start: [0,0], end: [2000,3]});
      }, this);

      // Note: char positions are checked by Cursor and this behavior should be tested there.
    },

    "setCursor() should collapse the selection", function() {
      this.sel.setCursor([0, 1]);
      assert.isTrue(this.sel.isCollapsed());
    },

    "Setting a reversed range", function() {
      this.sel.set({start: [0,3], end: [0,0]});
      assert.isTrue(this.sel.isReverse());
    },

    "range() always provides a selection in ascending order", function() {
      var expected = {start: [0,0], end: [0,3]};
      this.sel.set({start: [0,0], end: [0,3]});
      assert.isObjectEqual(expected, this.sel.range());

      this.sel.set({start: [0,3], end: [0,0]});
      assert.isObjectEqual(expected, this.sel.range());
    },

    "range() should return null for invalid selections", function() {
      var sel = new Selection(this.container);
      assert.isNull(sel.range());
    },

    "clear() should invalidate the selection", function() {
      var sel = this.sel;
      sel.set({start: [0,0], end: [0,3]});
      sel.clear();
      assert.isTrue(sel.isNull());
    },

    "selectNode() should span a range over the whole content of a node", function() {
      this.sel.selectNode("h1");
      var l = this.doc.get("h1").content.length;
      assert.isObjectEqual({start: [0,0], end: [0, l]}, this.sel.range());
    },

    "selectNode() should reject invalid node ids", function() {
      assert.exception(Selection.SelectionError, function() {
        this.sel.selectNode("bla");
      }, this);
    },

    "selectNode() should reject selecting invisible nodes", function() {
      this.doc.hide("content", "p1");
      assert.exception(Selection.SelectionError, function() {
        this.sel.selectNode("p1");
      }, this);
    },

    "collapse(): [0->3], right -> 3", function() {
      var sel = this.sel;
      sel.set({start: [0,0], end: [0,3]});
      sel.collapse("right");

      assert.isTrue(sel.isCollapsed());
      assert.isObjectEqual({start: [0,3], end: [0,3]}, sel.range());
    },

    "collapse(): [0->3], left -> 0", function() {
      var sel = this.sel;
      sel.set({start: [0,0], end: [0,3]});
      sel.collapse("left");

      assert.isTrue(sel.isCollapsed());
      assert.isObjectEqual({start: [0,0], end: [0,0]}, sel.range());
    },

    "collapse(): [0<-3], right -> 3", function() {
      var sel = this.sel;
      sel.set({start: [0,0], end: [0,3]});
      sel.collapse("right");

      assert.isTrue(sel.isCollapsed());
      assert.isObjectEqual({start: [0,3], end: [0,3]}, sel.range());
    },

    "collapse(): [0<-3], left -> 0", function() {
      var sel = this.sel;
      sel.set({start: [0,0], end: [0,3]});
      sel.collapse("left");

      assert.isTrue(sel.isCollapsed());
      assert.isObjectEqual({start: [0,0], end: [0,0]}, sel.range());
    },

    "collapse() should reject invalid direction name", function() {
      assert.exception(Selection.SelectionError, function() {
        this.sel.collapse("blupp");
      }, this);
    },

    "hasMultipleNodes()", function() {
      var sel = new Selection(this.container);
      // null selection should return false
      assert.isFalse(sel.hasMultipleNodes());

      sel.set({start: [0,0], end: [0,3]});
      assert.isFalse(sel.hasMultipleNodes());

      sel.set({start: [0,0], end: [1,3]});
      assert.isTrue(sel.hasMultipleNodes());
    },

/*
  this.move = function(direction, granularity) {

    // moving an expanded selection by char collapses the selection
    // and sets the cursor to the boundary of the direction
    if (!this.isCollapsed() && granularity === "char") {
      this.collapse(direction);
    }
    // otherwise the cursor gets moved (together with start)
    else {
      this.__cursor.move(direction, granularity);
      this.start = this.__cursor.position();
    }

    this.trigger('selection:changed', this.range());
  };

*/
    "move('right', 'char')", function() {
      this.fixture();
      var sel = this.sel;
      sel.setCursor([0,0]);
      sel.move('right', 'char');
      assert.isObjectEqual({start: [0,1], end: [0,1]}, sel.range());
    },

    "move('right', 'char') at end of node should move to next", function() {
      var sel = this.sel;
      var node = this.container.getNodeFromPosition(0);
      var l = node.content.length;
      sel.setCursor([0,l]);
      sel.move('right', 'char');
      assert.isObjectEqual({start: [1,0], end: [1,0]}, sel.range());
    },

    "move('right', 'char') at end of document should do nothing", function() {
      var sel = this.sel;
      var nodePos = 5;
      var node = this.container.getNodeFromPosition(nodePos);
      var l = node.content.length;
      var pos = [nodePos,l];
      sel.setCursor(pos);
      sel.move('right', 'char');
      assert.isObjectEqual({start: pos, end: pos}, sel.range());
    },

    "move('left', 'char')", function() {
      this.fixture();
      var sel = this.sel;
      sel.setCursor([0,3]);
      sel.move('left', 'char');
      assert.isObjectEqual({start: [0,2], end: [0,2]}, sel.range());
    },

    "move('left', 'char') at begin of node should move to previous", function() {
      var sel = this.sel;
      var node = this.container.getNodeFromPosition(0);
      var l = node.content.length;
      sel.setCursor([1,0]);
      sel.move('left', 'char');
      assert.isObjectEqual({start: [0,l], end: [0,l]}, sel.range());
    },

    "move('left', 'char') at begin of document should do nothing", function() {
      var sel = this.sel;
      var pos = [0,0];
      sel.setCursor(pos);
      sel.move('left', 'char');
      assert.isObjectEqual({start: pos, end: pos}, sel.range());
    },


    "move('right', 'char') with selected range should collapse to the right boundary", function() {
      var sel = this.sel;
      sel.set({start: [0,0], end: [0,3]});
      sel.move('right', 'char');
      assert.isObjectEqual({start: [0,3], end: [0,3]}, sel.range());
    },

    "move('left', 'char') with selected range should collapse to the left boundary", function() {
      var sel = this.sel;
      sel.set({start: [0,0], end: [0,3]});
      sel.move('left', 'char');
      assert.isObjectEqual({start: [0,0], end: [0,0]}, sel.range());
    },

    "move('right', 'word')", function() {
      // "The quick brown fox jumps over the lazy dog."
      var sel = this.sel;
      sel.setCursor([1,1]); // after 'T' in 'The'
      var expected = [1,3]; // after 'e' in 'The'
      sel.move('right', 'word');
      assert.isObjectEqual({start: expected, end: expected}, sel.range());
    },

    "move('right', 'word') should step to node boundary (e.g, '.' at the end)", function() {
      // "The quick brown fox jumps over the lazy dog."
      var sel = this.sel;
      sel.setCursor([1,42]); // before '.'
      var expected = [1, 43]; // after '.'
      sel.move('right', 'word');
      assert.isObjectEqual({start: expected, end: expected}, sel.range());
    },

    "move('left', 'word')", function() {
      // "The quick brown fox jumps over the lazy dog."
      var sel = this.sel;
      sel.setCursor([1,7]); // before 'c' of 'quick'
      var expected = [1,4]; // before 'q' of 'quick'
      sel.move('left', 'word');
      assert.isObjectEqual({start: expected, end: expected}, sel.range());
    },

    "move('left', 'word') should skip leading non-word characters (e.g., whitespaces)", function() {
      // "  Pack my box with five dozen liquor jugs."
      var sel = this.sel;
      sel.setCursor([2,2]); // before 'P' of 'Pack'
      var expected = [2,0]; // at begin of line
      sel.move('left', 'word');
      assert.isObjectEqual({start: expected, end: expected}, sel.range());
    },

    // Note: expand is not tested in greater detail as it delegates to move
    "expand('right', 'word')", function() {
      // "The quick brown fox jumps over the lazy dog."
      var sel = this.sel;
      sel.setCursor([1,1]); // after 'T' in 'The'
      var expected = [1,3]; // after 'e' in 'The'
      sel.expand('right', 'word');
      assert.isObjectEqual({start: [1,1], end: expected}, sel.range());
    },

    // Note: expand is not tested in greater detail as it delegates to move
    "expand('left', 'word') with change of direction", function() {
      // "The quick brown fox jumps over the lazy dog."
      var sel = this.sel;
      sel.set({
        start: [1,6],  // after 'u' in 'quick'
        end: [1,9] // after 'k' in 'quick'
      });
      sel.expand('left', 'word');
      assert.isObjectEqual({start: [1,4], end: [1,6]}, sel.range());
      assert.isTrue(sel.isReverse());
    },

    "getNodes()", function() {
      var sel = this.sel;
      sel.set({
        start: [1,0],
        end: [3,6]
      });
      var expected = [this.doc.get("p1"), this.doc.get("p2"), this.doc.get("h2")];
      var actual = sel.getNodes();
      assert.isArrayEqual(expected, actual);
    },

    // TODO: test ranges more thoroughly
    "getRanges()", function() {
      var sel = this.sel;
      sel.set({
        start: [1,1],
        end: [3,6]
      });
      var ranges = sel.getRanges();
      assert.isObjectEqual(this.doc.get("p1"), ranges[0].node);
      assert.isObjectEqual(this.doc.get("p2"), ranges[1].node);
      assert.isObjectEqual(this.doc.get("h2"), ranges[2].node);
    },

    "Range.isPartial()/isFull()", function() {
      var sel = this.sel;
      sel.set({
        start: [1,1],
        end: [3,2]
      });
      var ranges = sel.getRanges();
      assert.isTrue(ranges[0].isPartial());
      assert.isTrue(ranges[1].isFull());
      assert.isTrue(ranges[2].isPartial());
    },

  ];
};

// General aid for the writertest
SelectionTest.Prototype = function() {
  // helpers go here
};

SelectionTest.prototype = new SelectionTest.Prototype();


registerTest(['Substance.Document', 'Selection'], new SelectionTest());

},{"../index":108,"./fixture.json":121,"./test_document":124,"substance-test":198}],124:[function(require,module,exports){
"use strict";

var _ = require("underscore");
var util = require("substance-util");
var Document = require("../index");
var TextNode = Document.TextNode;

// setting a default splitInto property:

var Paragraph = function(node, doc) {
  TextNode.call(this, node, doc);
};
Paragraph.Prototype = function() {};
Paragraph.Prototype.prototype = TextNode.prototype;
Paragraph.prototype = new Paragraph.Prototype();

var Heading = function(node, doc) {
  TextNode.call(this, node, doc);
};
Heading.Prototype = function() {
  this.splitInto = "paragraph";
}
Heading.Prototype.prototype = TextNode.prototype;
Heading.prototype = new Heading.Prototype();

var ImageNode = function(node, doc) {
  Document.Node.call(this, node, doc);
};
ImageNode.Prototype = function() {
  this.getLength = function() {
    return 1;
  };
  this.deleteOperation = function() {
    return null;
  };
};
ImageNode.Prototype.prototype = Document.Node.prototype;
ImageNode.prototype = new ImageNode.Prototype();
Document.Node.defineProperties(ImageNode.prototype, ["url"]);

var List = function(node, doc) {
  Document.Composite.call(this, node, doc);
};
List.Prototype = function() {
  this.getLength = function() {
    return this.properties.items.length;
  };
  this.getNodes = function() {
    return _.clone(this.properties.items);
  };
  this.isMutable = function() {
    return true;
  };
  this.insertChild = function(doc, pos, nodeId) {
    doc.update([this.id, "items"], ["+", pos, nodeId]);
  };
  this.deleteChild = function(doc, nodeId) {
    var pos = this.items.indexOf(nodeId);
    doc.update([this.id, "items"], ["-", pos, nodeId]);
    doc.delete(nodeId);
  };
  this.canJoin = function(other) {
    return (other.type === "list");
  };
  this.isBreakable = function() {
    return true;
  };
  this.break = function(doc, childId, charPos) {
    var childPos = this.properties.items.indexOf(childId);
    if (childPos < 0) {
      throw new Error("Unknown child " + childId);
    }
    var child = doc.get(childId);
    var newNode = child.break(doc, charPos);
    doc.update([this.id, "items"], ["+", childPos+1, newNode.id]);
    return newNode;
  };
};
List.Prototype.prototype = Document.Composite.prototype;
List.prototype = new List.Prototype();
Document.Node.defineProperties(List.prototype, ["items"]);

var Figure = function(node, doc) {
  Document.Composite.call(this, node, doc);
};
Figure.Prototype = function() {
  this.getLength = function() {
    return 2;
  };
  this.getNodes = function() {
    var result = [];
    // TODO: we should allow an empty image (e.g., for boot strapping)
    if (this.properties.image) result.push(this.properties.image);
    if (this.properties.caption) result.push(this.properties.caption);
    return result;
  };
  this.deleteChild = function(doc, nodeId) {
    if (nodeId === this.image) {
      doc.set([this.id, "image"], null);
      doc.delete(nodeId);
    } else if (nodeId === this.caption) {
      doc.set([this.caption, "content"], "");
    }
  }
};
Figure.Prototype.prototype = Document.Composite.prototype;
Figure.prototype = new Figure.Prototype();
Document.Node.defineProperties(Figure.prototype, ["image", "caption"]);

var Schema = util.clone(Document.schema);
_.extend(Schema.types, {
  "document": {
    "properties": {
      "views": ["array", "view"],
      "guid": "string",
      "creator": "string",
      "title": "string",
      "abstract": "string"
    }
  },
  "node": {
    "parent": "content",
    "properties": {}
  },
  "composite": {
    "parent": "node",
    "properties": {
      "nodes": ["array", "node"]
    }
  },
  "paragraph": {
    "parent": "node",
    "properties": {
      "content": "string"
    }
  },
  "heading": {
    "parent": "node",
    "properties": {
      "content": "string",
      "level": "number"
    }
  },
  "image": {
    "parent": "node",
    "properties": {
      "url": "string"
    }
  },
  "list": {
    "parent": "composite",
    "properties": {
      "items": ["array", "paragraph"]
    }
  },
  "figure": {
    "parent": "composite",
    "properties": {
      "image": "image",
      "caption": "paragraph"
    }
  },
  "annotation": {
    "properties": {
      "path": ["array", "string"], // -> e.g. ["text_1", "content"]
      "range": "object"
    }
  },
  "strong": {
    "parent": "annotation",
    "properties": {
    }
  },
  "idea": {
    "parent": "annotation",
    "properties": {
    }
  },
});

var nodeTypes = {
  "paragraph": { Model: Paragraph },
  "heading": { Model: Heading },
  "image": { Model: ImageNode },
  "list": { Model: List },
  "figure": { Model: Figure }
};

var TestDocument = function(options) {
  options = options || {};

  options.schema = util.deepclone(Schema);

  if (options.seed === undefined) {
    options.seed = TestDocument.Seed;
  }

  // Call parent constructor
  // --------

  Document.call(this, options);

  this.nodeTypes = nodeTypes;
};

TestDocument.Prototype = function() {
  this.fromSnapshot = function(data, options) {
    options = options || {};
    options.seed = data;
    return new TestDocument(options);
  };
};
TestDocument.Prototype.prototype = Document.prototype;
TestDocument.prototype = new TestDocument.Prototype();

TestDocument.Schema = Schema;

TestDocument.Seed = {
  nodes : {
    document: {
      id: "document",
      type: "document",
      views: ["content"],
    },
    content: {
      id: "content",
      type: "view",
      nodes: []
    }
  }
};

TestDocument.Paragraph = Paragraph;
TestDocument.Heading = Heading;

module.exports = TestDocument;

},{"../index":108,"substance-util":207,"underscore":212}],125:[function(require,module,exports){
"use strict";

var Library = require("./src/library");
Library.Controller = require("./src/library_controller");
Library.View = require("./src/library_view");
Library.Collection = {};
Library.Collection.Controller = require("./src/collection_controller");
Library.Collection.View = require("./src/collection_view");

module.exports = Library;

},{"./src/collection_controller":127,"./src/collection_view":128,"./src/library":129,"./src/library_controller":130,"./src/library_view":131}],126:[function(require,module,exports){
"use strict";

var _ = require("underscore");

// Substance.Library.Collection
// -----------------

var Collection = function(node, library) {
  this.library = library;
  this.properties = node;
};


Collection.Prototype = function() {

};

Collection.prototype = new Collection.Prototype();
Collection.prototype.constructor = Collection;


// Add convenience accessors for attributes
// --------
// 

Object.defineProperties(Collection.prototype, {
  id: {
    get: function() {
      return this.properties.id;
    }
  },
  name: {
    get: function() {
      return this.properties.name;
    },
    set: function() {
      throw "collection.name is immutable";
    }
  },
  updated_at: {
    get: function() {
      return this.properties.updated_at;
    },
    set: function() {
      throw "collection.updated_at is immutable";
    }
  },
  description: {
    get: function() {
      return this.properties.description;
    },
    set: function() {
      throw "collection.description is immutable";
    }
  },
  image: {
    get: function() {
      return this.properties.image;
    },
    set: function() {
      throw "collection.image is immutable";
    }
  },
  records: {
    get: function() {
      return _.map(this.properties.records, function(recordId) {
        return this.library.get(recordId);
      }, this);
    },
    set: function() {
      throw "collection.records is immutable";
    }
  }
});

module.exports = Collection;
},{"underscore":212}],127:[function(require,module,exports){
"use strict";

var _ = require("underscore");
var Controller = require("substance-application").Controller;
var CollectionView = require("./collection_view");
var util = require("substance-util");


// Substance.Library.Controller
// -----------------
//

var CollectionController = function(collection, state) {
  this.collection = collection;
  this.state = state;
  Controller.call(this);
};


CollectionController.Prototype = function() {

  this.createView = function() {
    var view = new CollectionView(this);
    return view;
  };

  this.getActiveControllers = function() {
    return [];
  };
};


// Exports
// --------

CollectionController.Prototype.prototype = Controller.prototype;
CollectionController.prototype = new CollectionController.Prototype();
_.extend(CollectionController.prototype, util.Events);

module.exports = CollectionController;

},{"./collection_view":128,"substance-application":61,"substance-util":207,"underscore":212}],128:[function(require,module,exports){
"use strict";

var _ = require("underscore");
var util = require('substance-util');
var html = util.html;
var View = require("substance-application").View;
var $$ = require("substance-application").$$;


// Substance.Collection.View
// ==========================================================================
//
// The Substance Collection display

var CollectionView = function(collectionCtrl) {
  View.call(this);

  this.$el.addClass('collection-view');
  this.collectionCtrl = collectionCtrl;
};

CollectionView.Prototype = function() {

  // Rendering
  // --------
  //
  // .collection-view
  //   .records
  //     .title
  //     .authors

  this.render = function() {

    // Render the collection
    var collection = this.collectionCtrl.collection;
    var records = collection.records;

    // Collection metadata
    // ----------

    this.el.appendChild($$('.collection', {
      children: [
        $$('.name', {text: collection.name}),
        $$('.description', {text: collection.description}),
        $$('img.teaser', {src: collection.image})
      ]
    }));


    // Collection records
    // ----------

    var recordsEl = $$('.records');

    // Sort by published_on date
    records = _.sortBy(records, function(record){ 
      return record.published_on;
    });

    // Flip the array
    records.reverse();

    _.each(records, function(record) {
      var children = [];
      var dateStr;

      // Publish date (if available)
      // ----------

      if (record.published_on) {
        children.push($$('.date', {
          text: new Date(record.published_on).toDateString()
        }));
      }

      // Title
      // ----------

      children.push($$('a.title', {
        href: "#"+collection.id+"/"+record.id,
        text: record.title 
      }));

      // Authors
      // ----------

      children.push($$('.authors', { 
        html: record.authors.join(', ')
      }));

      recordsEl.appendChild($$('.record', {
        children: children
      }));

    }, this);

    this.el.appendChild(recordsEl);
    return this;
  };

  this.dispose = function() {
    this.stopListening();
  };
};

CollectionView.Prototype.prototype = View.prototype;
CollectionView.prototype = new CollectionView.Prototype();

module.exports = CollectionView;

},{"substance-application":61,"substance-util":207,"underscore":212}],129:[function(require,module,exports){
"use strict";

var _ = require("underscore");
var util = require("substance-util");
var Data = require("substance-data");
var Collection = require("./collection");
var Chronicle = require("substance-chronicle");

// Library Schema
// --------

var SCHEMA = {
  "id": "substance-library",
  "version": "0.1.0",
  "types": {
    "library": {
      "properties": {
        "name": "string",
        "collections": ["array", "collection"]
      }
    },

    // A collection contains a number of records
    "collection": {
      "properties": {
        "name": "string",
        "description": "string",
        "updated_at": "date",
        "image": "string",
        "documents": ["array", "record"]
      }
    },

    // Usually references a substance document, but we'd like to keep this generic
    "record": {
      "properties": {
        "title": "string",
        "authors": ["array", "string"],
        "published_on": "date",
        "url": "string"
      }
    }
  }
};


// Substance.Library
// -----------------

var Library = function(options) {

  // Call parent constructor
  // --------

  Data.Graph.call(this, SCHEMA, options);

  // Seed the doc
  // --------

  if (options.seed === undefined) {
    this.create({
      id: "library",
      type: "library",
      guid: options.id, // external global document id
      creator: options.creator,
      created_at: options.created_at,
    });
  }
};


Library.Prototype = function() {

  // Get Collection by id
  // --------
  // 
  // Returns a Library.Collection object

  this.getCollection = function(collectionId) {
    var collection = this.get(collectionId);
    return new Collection(collection, this);
  };

  // Get Document by id
  // --------
  // 
  // It reads the corresponding document record and tries to fetch the article from the URL provided
  // TODO: Get rid of lens-article dependency here

  this.loadDocument = function(docId, cb) {
    
    var record = this.get(docId);
    var doc;
    console.log('LOADING DOC from: ', record.url);
    // check schema
    $.getJSON(record.url, function(data) {

      if (data.schema && data.schema[0] === "lens-article") {
        console.log('lens article');
        var Article = require("lens-article");
        doc = Article.fromSnapshot(data);
      } else {
        console.log('substance article');
        var Article = require("substance-article");
        doc = Article.fromSnapshot(data);
      }
      
      cb(null, doc);
    });
  };
};


Library.Prototype.prototype = Data.Graph.prototype;
Library.prototype = new Library.Prototype();
Library.prototype.constructor = Library;


// Add convenience accessors for built in document attributes
// --------
// 

Object.defineProperties(Library.prototype, {
  id: {
    get: function() {
      return this.get("library").guid;
    },
    set: function() {
      throw "library.id is immutable";
    }
  },

  name: {
    get: function() {
      return this.get("library").name;
    }
  },

  collections: {
    get: function() {
      return _.map(this.get("library").collections, function(collectionId) {
        return new Collection(this.get(collectionId), this);
      }, this);
    }
  }
});

module.exports = Library;

},{"./collection":126,"lens-article":5,"substance-article":69,"substance-chronicle":73,"substance-data":94,"substance-util":207,"underscore":212}],130:[function(require,module,exports){
"use strict";

var _ = require("underscore");
var Controller = require("substance-application").Controller;
var LibraryView = require("./library_view");
var util = require("substance-util");


// Substance.Library.Controller
// -----------------
//

var LibraryController = function(library, state) {
  this.library = library; 

  this.state = state;

  Controller.call(this);
  
  // Create library view
  this.view = new LibraryView(this);
};


LibraryController.Prototype = function() {

  this.createView = function() {
    var view = new LibraryView(this);
    return view;
  };

  // Transitions
  // ==================================

  this.getActiveControllers = function() {
    return [];
  };
};


// Exports
// --------

LibraryController.Prototype.prototype = Controller.prototype;
LibraryController.prototype = new LibraryController.Prototype();
_.extend(LibraryController.prototype, util.Events);


module.exports = LibraryController;

},{"./library_view":131,"substance-application":61,"substance-util":207,"underscore":212}],131:[function(require,module,exports){
"use strict";

var _ = require("underscore");
var util = require('substance-util');
var html = util.html;
var View = require("substance-application").View;
var CollectionView = require("./collection_view");
var $$ = require("substance-application").$$;

// Substance.Library.View
// ==========================================================================
//
// The Substance Document Editor

var LibraryView = function(libraryCtrl) {
  View.call(this);

  this.$el.addClass('library-view');
  this.libraryCtrl = libraryCtrl;
};

LibraryView.Prototype = function() {

  // Rendering
  // --------
  //
  // .collection-toggles
  //    .toggle-collection
  // .collection

  this.render = function() {
    var collections = this.libraryCtrl.library.collections;

    // Sort by published_on date
    collections = _.sortBy(collections, function(c) {
      return c.updated_at;
    });

    // Flip the array
    collections.reverse();

    var collectionToggles = $$('.collections', {
      children: _.map(collections, function(c) {
        return $$('div', {
          id: "collection_"+c.id,
          class: "collection",
          
          children: [
            $$('a.name', {href: "#"+c.id, text: c.name}),
            $$('.description', {text: c.description}),
            $$('img.teaser', {src: c.image}),
            $$('.count', {text: c.records.length + " documents"})
          ]
        });
      })
    });

    this.el.appendChild(collectionToggles);
    return this;
  };


  this.dispose = function() {
    this.stopListening();
  };
};

LibraryView.Prototype.prototype = View.prototype;
LibraryView.prototype = new LibraryView.Prototype();

module.exports = LibraryView;

},{"./collection_view":128,"substance-application":61,"substance-util":207,"underscore":212}],132:[function(require,module,exports){
"use strict";

module.exports = {
  "node": require("./src/node"),
  "composite": require("./src/composite"),
  "text": require("./src/text"),
  "paragraph": require("./src/paragraph"),
  "heading": require("./src/heading"),
  "list": require("./src/list"),
  "codeblock": require("./src/codeblock"),
  "webresource": require("./src/web_resource"),
  "image": require("./src/image"),
  "formula": require("./src/formula"),
  "table": require("./src/table"),
  "figure": require("./src/figure"),
  "collaborator": require("./src/collaborator"),
  "cover": require("./src/cover")
};

},{"./src/codeblock":135,"./src/collaborator":138,"./src/composite":141,"./src/cover":144,"./src/figure":147,"./src/formula":150,"./src/heading":153,"./src/image":156,"./src/list":157,"./src/node":160,"./src/paragraph":163,"./src/table":166,"./src/text":169,"./src/web_resource":172}],133:[function(require,module,exports){
"use strict";

var Text = require("../text/text_node");

var Codeblock = function(node, document) {
  Text.call(this, node, document);
};

// Type definition
// --------

Codeblock.type = {
  "id": "codeblock",
  "parent": "content",
  "properties": {
    "source_id": "string",
    "content": "string"
  }
};

Codeblock.config = {
  "zoomable": true
};

// This is used for the auto-generated docs
// -----------------
//

Codeblock.description = {
  "name": "Codeblock",
  "remarks": [
    "Text in a codeblock is displayed in a fixed-width font, and it preserves both spaces and line breaks"
  ],
  "properties": {
    "content": "Content",
  }
};


// Example Formula
// -----------------
//

Codeblock.example = {
  "type": "codeblock",
  "id": "codeblock_1",
  "content": "var text = \"Sun\";\nvar op1 = Operator.TextOperation.Delete(2, \"n\");\ntext = op2.apply(op1.apply(text));\nconsole.log(text);",
};

Codeblock.Prototype = function() {};

Codeblock.Prototype.prototype = Text.prototype;
Codeblock.prototype = new Codeblock.Prototype();
Codeblock.prototype.constructor = Codeblock;

module.exports = Codeblock;


},{"../text/text_node":170}],134:[function(require,module,exports){
"use strict";

var TextView = require('../text/text_view');

// Substance.Codeblock.View
// ==========================================================================

var CodeblockView = function(node) {
  TextView.call(this, node);

  this.$el.addClass('content-node codeblock');
};

CodeblockView.Prototype = function() {};

CodeblockView.Prototype.prototype = TextView.prototype;
CodeblockView.prototype = new CodeblockView.Prototype();

module.exports = CodeblockView;

},{"../text/text_view":171}],135:[function(require,module,exports){
"use strict";

module.exports = {
  Model: require("./codeblock"),
  View: require("./codeblock_view")
};

},{"./codeblock":133,"./codeblock_view":134}],136:[function(require,module,exports){
var _ = require('underscore');
var Node = require('substance-document').Node;

// Substance.Collaborator
// -----------------
//

var Collaborator = function(node, doc) {
  Node.call(this, node, doc);
};


// Type definition
// -----------------
//

Collaborator.type = {
  "id": "collaborator",
  "parent": "content",
  "properties": {
    "source_id": "string",
    "name": "string", // full author name
    "role": "string",
    "organization": "string",
    "image": "string", // optional
    "email": "string",
    "contribution": "string"
  }
};

// This is used for the auto-generated docs
// -----------------
//

Collaborator.description = {
  "name": "Collaborator",
  "remarks": [
    "Describes an article collaborator such as an author or editor.",
  ],
  "properties": {
    "name": "Full name.",
  }
};

// Example Video
// -----------------
//

Collaborator.example = {
  "id": "collaborator_1",
  "type": "collaborator",
  "role": "author",
  "name": "John Doe",
  "image": "http://john.com/doe.png",
  "email": "a@b.com",
  "contribution": "Revising the article, data cleanup"
};


Collaborator.Prototype = function() {
  this.getAffiliations = function() {
    return _.map(this.properties.affiliations, function(affId) {
      return this.document.get(affId);
    }, this);
  }
};

Collaborator.Prototype.prototype = Node.prototype;
Collaborator.prototype = new Collaborator.Prototype();
Collaborator.prototype.constructor = Collaborator;


// Generate getters
// --------

var getters = {};

var getters = {
  header: {
    get: function() {
      return this.properties.name;
    }
  }
};

_.each(Collaborator.type.properties, function(prop, key) {
  getters[key] = {
    get: function() {
      return this.properties[key];
    }
  };
});


Object.defineProperties(Collaborator.prototype, getters);
module.exports = Collaborator;

},{"substance-document":108,"underscore":212}],137:[function(require,module,exports){
"use strict";

var _ = require("underscore");
var util = require("substance-util");
var html = util.html;
var NodeView = require("../node").View;
var $$ = require("substance-application").$$;

// Substance.Collaborator.View
// ==========================================================================

var CollaboratorView = function(node) {
  NodeView.call(this, node);

  this.$el.attr({id: node.id});
  this.$el.addClass("content-node collaborator");
};

CollaboratorView.Prototype = function() {

  // Render it
  // --------
  //

  this.render = function() {
    NodeView.prototype.render.call(this);

    // Image
    // -------

    if (this.node.image) {
      this.content.appendChild($$('.image', {
        children: [$$('img', {src: this.node.image})]
      }));
    }

    // Organization
    // -------

    // this.content.appendChild($$('.label', {text: 'Organization'}));
    if (this.node.organization) {
      this.content.appendChild($$('.organization', {text: this.node.organization}));  
    }
    

    // Contribution
    // -------

    if (this.node.contribution) {
      this.content.appendChild($$('.label', {text: 'Contribution'}));
      this.content.appendChild($$('.contribution', {text: this.node.contribution}));
    }


    // Email
    // -------

    if (this.node.email) {
      this.content.appendChild($$('.label', {text: 'Email'}));
      this.content.appendChild($$('.email', {
        children: [$$('a', {href: "mailto:"+ this.node.email, text: this.node.email})]
      }));
    }



    return this;
  };

};

CollaboratorView.Prototype.prototype = NodeView.prototype;
CollaboratorView.prototype = new CollaboratorView.Prototype();

module.exports = CollaboratorView;

},{"../node":160,"substance-application":61,"substance-util":207,"underscore":212}],138:[function(require,module,exports){
"use strict";

module.exports = {
  Model: require("./collaborator"),
  View: require("./collaborator_view")
};

},{"./collaborator":136,"./collaborator_view":137}],139:[function(require,module,exports){
"use strict";

// Note: we leave the Composite in `substance-document` as it is an essential part of the API.
var Document = require("substance-document");
module.exports = Document.Composite;

},{"substance-document":108}],140:[function(require,module,exports){
"use strict";

var NodeView = require("../node").View;

// Substance.Image.View
// ==========================================================================

var CompositeView = function(node, viewFactory) {
  NodeView.call(this, node, viewFactory);

  this.$el.addClass(node.type);
  this.$el.attr('id', this.node.id);

  this.childrenViews = [];
};

CompositeView.Prototype = function() {

  // Rendering
  // =============================
  //

  // Render Markup
  // --------
  //

  this.render = function() {
    this.content = document.createElement("DIV");
    this.content.classList.add("content");

    var i;

    // dispose existing children views if called multiple times
    for (i = 0; i < this.childrenViews.length; i++) {
      this.childrenViews[i].dispose();
    }

    // create children views
    var children = this.node.getNodes();
    for (i = 0; i < children.length; i++) {
      var child = this.node.document.get(children[i]);
      var childView = this.viewFactory.createView(child);
      this.content.appendChild(childView.render().el);
      this.childrenViews.push(childView);
    }

    this.el.appendChild(this.content);
    return this;
  };

  this.dispose = function() {
    NodeView.prototype.dispose.call(this);

    for (var i = 0; i < this.childrenViews.length; i++) {
      this.childrenViews[i].dispose();
    }
  };

  this.delete = function() {
  };

  this.getCharPosition = function(/*el, offset*/) {
    return 0;
  };

  this.getDOMPosition = function() {
    var content = this.$('.content')[0];
    var range = document.createRange();
    range.setStartBefore(content.childNodes[0]);
    return range;
  };
};

CompositeView.Prototype.prototype = NodeView.prototype;
CompositeView.prototype = new CompositeView.Prototype();

module.exports = CompositeView;

},{"../node":160}],141:[function(require,module,exports){
"use strict";

module.exports = {
  Model: require("./composite"),
  View: require("./composite_view")
};

},{"./composite":139,"./composite_view":140}],142:[function(require,module,exports){
var _ = require('underscore');
var DocumentNode = require('../node/node');

// Lens.Cover
// -----------------
//

var Cover = function(node, doc) {
  DocumentNode.call(this, node, doc);
};

// Type definition
// -----------------
//

Cover.type = {
  "id": "cover",
  "parent": "content",
  "properties": {
    "source_id": "string",
    "authors": ["array", "person_reference"],
    "image": "string"
  }
};


// This is used for the auto-generated docs
// -----------------
//

Cover.description = {
  "name": "Cover",
  "remarks": [
    "Virtual view on the title and authors of the paper."
  ],
  "properties": {
    "authors": "An array of references to collaborators"
  }
};

// Example Cover
// -----------------
//

Cover.example = {
  "id": "cover",
  "type": "cover",
  "authors": ["collaborator_reference_1", "collaborator_reference_2"]
};

Cover.Prototype = function() {
  this.getAuthorRefs = function() {
    return _.map(this.properties.authors, function(id) {
      return this.document.get(id);
    }, this);
  };
};

Cover.Prototype.prototype = DocumentNode.prototype;
Cover.prototype = new Cover.Prototype();
Cover.prototype.constructor = Cover;

// Generate getters
// --------

Object.defineProperties(Cover.prototype, {
  title: {
    get: function() {
      return this.document.title;
    }
  },
  authors: {
    // Expand author id's to corresponding person nodes
    get: function() {
      return this.properties.authors;
    }
  },
  image: {
    get: function() {
      return this.properties.image;
    }
  }
});

module.exports = Cover;

},{"../node/node":161,"underscore":212}],143:[function(require,module,exports){
"use strict";

var _ = require("underscore");
var NodeView = require("../node/node_view");
var $$ = require("substance-application").$$;

// Lens.Cover.View
// ==========================================================================

var CoverView = function(node, viewFactory) {
  NodeView.call(this, node, viewFactory);

  this.$el.attr({id: node.id});
  this.$el.addClass("content-node cover");
};


CoverView.Prototype = function() {

  this.render = function() {
    NodeView.prototype.render.call(this);
    var node = this.node;

    this.content.appendChild($$('.title', {text: node.title }));

    var authorRefs = this.node.getAuthorRefs();
    if (authorRefs) {
      var authorsEl = document.createElement("DIV");
      authorsEl.classList.add("authors");
      var authorRefEl;
      for (var i = 0; i < authorRefs.length; i++) {
        var ref = authorRefs[i];
        var author = this.node.document.get(ref.target);
        authorRefEl = document.createElement("SPAN");
        // TODO: use data-* attribute to store the referenced collaborator node
        authorRefEl.setAttribute("id", ref.id);
        authorRefEl.classList.add("annotation", "person_reference");
        authorRefEl.innerHTML = author.name;
        authorsEl.appendChild(authorRefEl);
      }
      this.content.appendChild(authorsEl);
    }

    if (this.node.image) {
      this.el.style.backgroundImage = "url('"+this.node.image+"')"
    }

    return this;
  };
};

CoverView.Prototype.prototype = NodeView.prototype;
CoverView.prototype = new CoverView.Prototype();

module.exports = CoverView;

},{"../node/node_view":162,"substance-application":61,"underscore":212}],144:[function(require,module,exports){
arguments[4][21][0].apply(exports,arguments)
},{"./cover":142,"./cover_view":143}],145:[function(require,module,exports){
"use strict";

var Document = require("substance-document");

var Figure = function(node, document) {
  Document.Composite.call(this, node, document);
};

Figure.type = {
  "parent": "content",
  "properties": {
    "url": "string",
    "label": "string",
    "caption": "paragraph"
  }
};

Figure.Prototype = function() {

  this.insertOperation = function(startChar, text) {
    return null;
  };

  this.deleteOperation = function(startChar, endChar) {
    return null;
  };

  this.hasCaption = function() {
    return (!!this.properties.caption);
  };

  this.getNodes = function() {
    var nodes = [];
    if (this.properties.caption) nodes.push(this.properties.caption);
    return nodes;
  };

  this.getCaption = function() {
    if (this.properties.caption) return this.document.get(this.properties.caption);
  };
};

Figure.Prototype.prototype = Document.Composite.prototype;
Figure.prototype = new Figure.Prototype();
Figure.prototype.constructor = Figure;

// a factory method to create nodes more conveniently
// Supported
//  - id: unique id
//  - url: a relative path or a web URL
//  - caption: a string used as caption
Figure.create = function(data) {

  var result = {};

  var figId = data.id;
  var figure = {
    id: figId,
    type: "figure",
    label: data.label,
    url: data.url
  };

  if (data.caption) {
    var captionId = "caption_" + data.id;
    var caption = {
      id: captionId,
      type: "text",
      content: data.caption
    };
    result[captionId] = caption;
    figure.caption = captionId;
  }

  result[figId] = figure;
  return result;
};

Document.Node.defineProperties(Figure.prototype, ["url", "caption"]);

Object.defineProperties(Figure.prototype, {
  // Used as a resource header
  header: {
    get: function() { return this.properties.label; }
  }
});

module.exports = Figure;

},{"substance-document":108}],146:[function(require,module,exports){
"use strict";

var CompositeView = require("../composite").View;
var $$ = require ("substance-application").$$;

// Substance.Figure.View
// ==========================================================================

var FigureView = function(node, viewFactory) {
  CompositeView.call(this, node, viewFactory);
};

FigureView.Prototype = function() {

  // Rendering
  // =============================
  //

  this.render = function() {
    this.el.innerHTML = "";
    this.content = $$('div.content');

    // Add graphic (img element)
    var imgEl = $$('.image-wrapper', {
      children: [ $$("img", {src: this.node.url}) ]
    });

    this.content.appendChild(imgEl);

    var i;
    // dispose existing children views if called multiple times
    for (i = 0; i < this.childrenViews.length; i++) {
      this.childrenViews[i].dispose();
    }

    var caption = this.node.getCaption();
    if (caption) {
      var captionView = this.viewFactory.createView(caption);
      var captionEl = captionView.render().el;
      this.content.appendChild(captionEl);
      this.childrenViews.push(captionView);
    }

    this.el.appendChild(this.content);
    return this;
  };
};

FigureView.Prototype.prototype = CompositeView.prototype;
FigureView.prototype = new FigureView.Prototype();

module.exports = FigureView;

},{"../composite":141,"substance-application":61}],147:[function(require,module,exports){
arguments[4][24][0].apply(exports,arguments)
},{"./figure":145,"./figure_view":146}],148:[function(require,module,exports){
var _ = require('underscore');
var Node = require('substance-document').Node;

// Formula
// -----------------
//

var Formula = function(node) {
  Node.call(this, node);
};

// Type definition
// -----------------
//

Formula.type = {
  "id": "formula",
  "parent": "content",
  "properties": {
    "source_id": "string",
    "label": "string",
    "data": "string",
    "format": "string", // MathML, LaTeX, image
    "inline": "boolean"
  }
};


// This is used for the auto-generated docs
// -----------------
//

Formula.description = {
  "name": "Formula",
  "remarks": [
    "Can either be expressed in MathML format or using an image url"
  ],
  "properties": {
    "label": "Formula label (4)",
    "data": "Formula data, either MathML or image url",
    "format": "Can either be `mathml` or `image`"
  }
};


// Example Formula
// -----------------
//

Formula.example = {
  "type": "formula",
  "id": "formula_eqn1",
  "label": "(1)",
  "content": "<mml:mrow>...</mml:mrow>",
  "format": "mathml"
};

Formula.Prototype = function() {
  this.inline = false;
};

Formula.Prototype.prototype = Node.prototype;
Formula.prototype = new Formula.Prototype();
Formula.prototype.constuctor = new Formula;


// Generate getters
// --------

var getters = {};

_.each(Formula.type.properties, function(prop, key) {
  getters[key] = {
    get: function() {
      return this.properties[key];
    }
  };
});

Object.defineProperties(Formula.prototype, getters);

module.exports = Formula;

},{"substance-document":108,"underscore":212}],149:[function(require,module,exports){
"use strict";

var NodeView = require('../node').View;

// FormulaView
// ===========

var FormulaView = function(node) {
  NodeView.call(this, node);

  this.$el.attr({id: node.id});
  this.$el.addClass('content-node formula');
  if (this.node.inline) {
    this.$el.addClass('inline');
  }
};

FormulaView.Prototype = function() {

  // Render the formula
  // --------
    
  this.render = function() {

    var format = this.node.format;
    switch (format) {
    case "mathml":
      this.$el.html(this.node.data);

      // This makes the UI freeze when many formulas are in the document.
      // MathJax.Hub.Queue(["Typeset", MathJax.Hub, this.el]);
      break;
    case "image":
      this.$el.append('<img src="'+this.node.url+'"/>');
      break;
    case "latex":
      if (this.node.inline) {
        this.$el.html("\\("+this.node.data+"\\)");
      } else {
        this.$el.html("\\["+this.node.data+"\\]");
      }

      // This makes the UI freeze when many formulas are in the document.
      // MathJax.Hub.Queue(["Typeset", MathJax.Hub, this.el]);
      break;
    default:
      console.error("Unknown formula format:", format);
    }

    // Add label to block formula
    // --------
    if (this.node.label) {
      this.$el.append($('<div class="label">').html(this.node.label));
    }


    return this;
  };
};

FormulaView.Prototype.prototype = NodeView.prototype;
FormulaView.prototype = new FormulaView.Prototype();

module.exports = FormulaView;

},{"../node":160}],150:[function(require,module,exports){
"use strict";

module.exports = {
  Model: require('./formula'),
  View: require('./formula_view')
};

},{"./formula":148,"./formula_view":149}],151:[function(require,module,exports){
"use strict";

var DocumentNode = require("substance-document").Node;
var Text = require("../text/text_node");

var Heading = function(node, document) {
  Text.call(this, node, document);
};

// Type definition
// -----------------
//

Heading.type = {
  "id": "heading",
  "parent": "content",
  "properties": {
    "source_id": "string",
    "content": "string",
    "level": "number"
  }
};

// Example Heading
// -----------------
//

Heading.example = {
  "type": "heading",
  "id": "heading_1",
  "content": "Introduction",
  "level": 1
};

// This is used for the auto-generated docs
// -----------------
//


Heading.description = {
  "name": "Heading",
  "remarks": [
    "Denotes a section or sub section in your article."
  ],
  "properties": {
    "content": "Heading content",
    "level": "Heading level. Ranges from 1..4"
  }
};

Heading.Prototype = function() {
  this.splitInto = 'paragraph';
};

Heading.Prototype.prototype = Text.prototype;
Heading.prototype = new Heading.Prototype();
Heading.prototype.constructor = Heading;

DocumentNode.defineProperties(Heading.prototype, ["level"]);

module.exports = Heading;

},{"../text/text_node":170,"substance-document":108}],152:[function(require,module,exports){
"use strict";

var TextView = require('../text/text_view');

// Substance.Heading.View
// ==========================================================================

var HeadingView = function(node) {
  TextView.call(this, node);

  this.$el.addClass('heading');
  this.$el.addClass('level-'+this.node.level);

};

HeadingView.Prototype = function() {};

HeadingView.Prototype.prototype = TextView.prototype;
HeadingView.prototype = new HeadingView.Prototype();

module.exports = HeadingView;

},{"../text/text_view":171}],153:[function(require,module,exports){
"use strict";

module.exports = {
  Model: require("./heading"),
  View: require("./heading_view")
};

},{"./heading":151,"./heading_view":152}],154:[function(require,module,exports){
"use strict";

var DocumentNode = require("substance-document").Node;
var WebResource = require("../web_resource/web_resource");

var ImageNode = function(node, document) {
  WebResource.call(this, node, document);
};

// Type definition
// -----------------
//

ImageNode.type = {
  "id": "image",
  "parent": "webresource",
  "properties": {
    "source_id": "string"
  }
};

// Example Image
// -----------------
//

ImageNode.example = {
  "type": "image",
  "id": "image_1",
  "url": "http://elife.elifesciences.org/content/elife/1/e00311/F3.medium.gif"
};

// This is used for the auto-generated docs
// -----------------
//


ImageNode.description = {
  "name": "Image",
  "remarks": [
    "Represents a web-resource for an image."
  ],
  "properties": {}
};

ImageNode.Prototype = function() {};

ImageNode.Prototype.prototype = WebResource.prototype;
ImageNode.prototype = new ImageNode.Prototype();
ImageNode.prototype.constructor = ImageNode;

module.exports = ImageNode;

},{"../web_resource/web_resource":173,"substance-document":108}],155:[function(require,module,exports){
"use strict";

var NodeView = require("../node").View;

// Substance.Image.View
// ==========================================================================

var ImageView = function(node, viewFactory) {
  NodeView.call(this, node, viewFactory);

  this.$el.addClass('image');
  this.$el.attr('id', this.node.id);
};

ImageView.Prototype = function() {

  // Rendering
  // =============================
  //

  var _indexOf = Array.prototype.indexOf;

  // Render Markup
  // --------
  //
  // div.content
  //   div.img-char
  //     .img

  this.render = function() {

    var content = document.createElement('div');
    content.className = 'content';

    var imgChar = document.createElement('div');
    imgChar.className = 'image-char';
    this._imgChar = imgChar;

    var img = document.createElement('img');
    img.src = this.node.url;
    img.alt = "alt text";
    img.title = "alt text";
    imgChar.appendChild(img);

    content.appendChild(imgChar);

    // Add content
    this.el.appendChild(content);

    this._imgPos = _indexOf.call(imgChar.childNodes, img);

    return this;
  };

  this.delete = function(pos, length) {
    var content = this.$('.content')[0];
    var spans = content.childNodes;
    for (var i = length - 1; i >= 0; i--) {
      content.removeChild(spans[pos+i]);
    }
  };

  this.getCharPosition = function(el, offset) {
    // TODO: is there a more general approach? this is kind of manually coded.

    if (el === this._imgChar) {
      return (offset > this._imgPos) ? 1 : 0;
    }

    console.log("Errhhh..");

  };

  this.getDOMPosition = function(charPos) {
    var content = this.$('.content')[0];
    var range = document.createRange();
    if (charPos === 0) {
      range.setStartBefore(content.childNodes[0]);
    } else {
      range.setStartAfter(content.childNodes[0]);
    }
    return range;
  };
};

ImageView.Prototype.prototype = NodeView.prototype;
ImageView.prototype = new ImageView.Prototype();

module.exports = ImageView;

},{"../node":160}],156:[function(require,module,exports){
"use strict";

module.exports = {
  Model: require("./image"),
  View: require("./image_view")
};

},{"./image":154,"./image_view":155}],157:[function(require,module,exports){
"use strict";

module.exports = {
  Model: require("./list"),
  View: require("./list_view")
};

},{"./list":158,"./list_view":159}],158:[function(require,module,exports){
"use strict";

var _ = require("underscore");
var Document = require("substance-document");
var DocumentNode = Document.Node;
var Composite = Document.Composite;

var List = function(node, document) {
  Composite.call(this, node, document);
};

List.type = {
  "id": "list",
  "parent": "content",
  "properties": {
    "source_id": "string",
    "items": ["array", "paragraph"],
    "ordered": "boolean"
  }
};


// This is used for the auto-generated docs
// -----------------
//

List.description = {
  "name": "List",
  "remarks": [
    "Lists can either be numbered or bullet lists"
  ],
  "properties": {
    "ordered": "Specifies wheter the list is ordered or not",
    "items": "An array of paragraph references",
  }
};


// Example Formula
// -----------------
//

List.example = {
  "type": "list",
  "id": "list_1",
  "items ": [
    "paragraph_listitem_1",
    "paragraph_listitem_2",
  ]
};

List.Prototype = function() {

  this.getLength = function() {
    return this.properties.items.length;
  };

  this.getNodes = function() {
    return _.clone(this.items);
  };

  this.getItems = function() {
    return _.map(this.properties.items, function(id) {
      return this.document.get(id);
    }, this);
  };

  this.getChangePosition = function(op) {
    if (op.path[1] === "items") {

      if (op.type === "update") {
        var diff = op.diff;
        if (diff.isInsert()) {
          return op.diff.pos+1;
        }
        else if (diff.isDelete()) {
          return op.diff.pos;
        }
        else if (diff.isMove()) {
          return op.diff.target;
        }
      }
      else if (op.type === "set") {
        return this.properties.items.length-1;
      }
    }

    return -1;
  };

  this.isMutable = function() {
    return true;
  };

  this.insertChild = function(doc, pos, nodeId) {
    doc.update([this.id, "items"], ["+", pos, nodeId]);
  };

  this.deleteChild = function(doc, nodeId) {
    var pos = this.items.indexOf(nodeId);
    doc.update([this.id, "items"], ["-", pos, nodeId]);
    doc.delete(nodeId);
  };

  this.canJoin = function(other) {
    return (other.type === "list");
  };

  this.isBreakable = function() {
    return true;
  };

  this.break = function(doc, childId, charPos) {
    var childPos = this.properties.items.indexOf(childId);
    if (childPos < 0) {
      throw new Error("Unknown child " + childId);
    }
    var child = doc.get(childId);
    var newNode = child.break(doc, charPos);
    doc.update([this.id, "items"], ["+", childPos+1, newNode.id]);
    return newNode;
  };

};

List.Prototype.prototype = Composite.prototype;
List.prototype = new List.Prototype();
List.prototype.constructor = List;

DocumentNode.defineProperties(List.prototype, ["items", "ordered"]);

module.exports = List;

},{"substance-document":108,"underscore":212}],159:[function(require,module,exports){
"use strict";

var CompositeView = require("../composite/composite_view");
var List = require("./list");

// Substance.Image.View
// ==========================================================================

var ListView = function(node, viewFactory) {
  CompositeView.call(this, node, viewFactory);
};

ListView.whoami = "SubstanceListView";


ListView.Prototype = function() {

  // Rendering
  // =============================
  //

  this.render = function() {
    this.el.innerHTML = "";

    var ltype = (this.node.ordered) ? "OL" : "UL";
    this.content = document.createElement(ltype);
    this.content.classList.add("content");

    var i;

    // dispose existing children views if called multiple times
    for (i = 0; i < this.childrenViews.length; i++) {
      this.childrenViews[i].dispose();
    }

    // create children views
    var children = this.node.getNodes();
    for (i = 0; i < children.length; i++) {
      var child = this.node.document.get(children[i]);
      var childView = this.viewFactory.createView(child);

      var listEl;
      if (child instanceof List) {
        listEl = childView.render().el;
      } else {
        listEl = document.createElement("LI");
        listEl.appendChild(childView.render().el);
      }
      this.content.appendChild(listEl);
      this.childrenViews.push(childView);
    }

    this.el.appendChild(this.content);
    return this;
  };

  this.onNodeUpdate = function(op) {
    if (op.path[0] === this.node.id && op.path[1] === "items") {
      this.render();
    }
  };
};

ListView.Prototype.prototype = CompositeView.prototype;
ListView.prototype = new ListView.Prototype();

module.exports = ListView;

},{"../composite/composite_view":140,"./list":158}],160:[function(require,module,exports){
"use strict";

module.exports = {
  Model: require("./node"),
  View: require("./node_view")
};

},{"./node":161,"./node_view":162}],161:[function(require,module,exports){
"use strict";

// Note: we leave the Node in `substance-document` as it is an essential part of the API.
var Document = require("substance-document");
module.exports = Document.Node;

},{"substance-document":108}],162:[function(require,module,exports){
var View = require("substance-application").View;

// Substance.Node.View
// -----------------

var NodeView = function(node, viewFactory) {
  View.call(this);

  this.node = node;
  this.viewFactory = viewFactory;

  this.$el.addClass('content-node');
  this.$el.attr('id', this.node.id);
};

NodeView.Prototype = function() {

  // Rendering
  // --------
  //

  this.render = function() {
    this.content = document.createElement("DIV");
    this.content.classList.add("content");
    this.el.appendChild(this.content);
    return this;
  };

  this.dispose = function() {
    this.stopListening();
  };

  // Retrieves the corresponding character position for the given DOM position.
  // --------
  //

  this.getCharPosition = function(/*el, offset*/) {
    throw new Error("NodeView.getCharPosition() is abstract.");
  };

  // Retrieves the corresponding DOM position for a given character.
  // --------
  //

  this.getDOMPosition = function(/*charPos*/) {
    throw new Error("NodeView.getDOMPosition() is abstract.");
  };

  // A general graph update listener that dispatches
  // to `this.onNodeUpdate(op)`
  // --------
  //

  this.onGraphUpdate = function(op) {
    if(op.path[0] === this.node.id && (op.type === "update" || op.type === "set") ) {
      this.onNodeUpdate(op);
    }
  };

  // Callback to get noticed about updates applied to the underlying node.
  // --------
  //

  this.onNodeUpdate = function(/*op*/) {
    // do nothing by default
  };
};

NodeView.Prototype.prototype = View.prototype;
NodeView.prototype = new NodeView.Prototype();

module.exports = NodeView;

},{"substance-application":61}],163:[function(require,module,exports){
"use strict";

module.exports = {
  Model: require("./paragraph"),
  View: require("./paragraph_view")
};

},{"./paragraph":164,"./paragraph_view":165}],164:[function(require,module,exports){
"use strict";

var _ = require("underscore");
var Document = require("substance-document");
var DocumentNode = Document.Node;
var Composite = Document.Composite;


var Paragraph = function(node, document) {
  Composite.call(this, node, document);
};

Paragraph.type = {
  "id": "paragraph",
  "parent": "content",
  "properties": {
    "children": ["array", "content"]
  }
};

// This is used for the auto-generated docs
// -----------------
//

Paragraph.description = {
  "name": "Paragraph",
  "remarks": [
    "A Paragraph can have inline elements such as images."
  ],
  "properties": {
    "children": "An array of content node references",
  }
};

// Example
// -------
//

Paragraph.example = {
  "type": "paragraph",
  "id": "paragraph_1",
  "children ": [
    "text_1",
    "image_1",
    "text_2"
  ]
};

Paragraph.Prototype = function() {

  this.getLength = function() {
    return this.properties.children.length;
  };

  this.getNodes = function() {
    return _.clone(this.properties.children);
  };

  this.getChildren = function() {
    return _.map(this.properties.children, function(id) {
      return this.document.get(id);
    }, this);
  };

  this.getChangePosition = function(op) {
    if (op.path[1] === "children") {

      if (op.type === "update") {
        var diff = op.diff;
        if (diff.isInsert()) {
          return op.diff.pos+1;
        }
        else if (diff.isDelete()) {
          return op.diff.pos;
        }
        else if (diff.isMove()) {
          return op.diff.target;
        }
      }
      else if (op.type === "set") {
        return this.properties.children.length-1;
      }
    }

    return -1;
  };

  this.isMutable = function() {
    return true;
  };

  this.insertChild = function(doc, pos, nodeId) {
    doc.update([this.id, "children"], ["+", pos, nodeId]);
  };

  this.deleteChild = function(doc, nodeId) {
    var pos = this.children.indexOf(nodeId);
    doc.update([this.id, "children"], ["-", pos, nodeId]);
    doc.delete(nodeId);
  };

  this.canJoin = function(other) {
    return (other.type === "paragraph");
  };

  this.isBreakable = function() {
    return true;
  };

  this.break = function(doc, childId, charPos) {
    var childPos = this.properties.children.indexOf(childId);
    if (childPos < 0) {
      throw new Error("Unknown child " + childId);
    }
    var child = doc.get(childId);
    var newNode = child.break(doc, charPos);
    doc.update([this.id, "children"], ["+", childPos+1, newNode.id]);
    return newNode;
  };

};

Paragraph.Prototype.prototype = Composite.prototype;
Paragraph.prototype = new Paragraph.Prototype();
Paragraph.prototype.constructor = Paragraph;

DocumentNode.defineProperties(Paragraph.prototype, ["children"]);

module.exports = Paragraph;

},{"substance-document":108,"underscore":212}],165:[function(require,module,exports){
"use strict";

var CompositeView = require("../composite/composite_view");

// Substance.Image.View
// ==========================================================================

var ParagraphView = function(node, viewFactory) {
  CompositeView.call(this, node, viewFactory);
};

ParagraphView.Prototype = function() {

  this.onNodeUpdate = function(op) {
    if (op.path[0] === this.node.id && op.path[1] === "children") {
      this.render();
    }
  };
};

ParagraphView.Prototype.prototype = CompositeView.prototype;
ParagraphView.prototype = new ParagraphView.Prototype();

module.exports = ParagraphView;

},{"../composite/composite_view":140}],166:[function(require,module,exports){
"use strict";

module.exports = {
  Model: require("./table"),
  View: require("./table_view")
};

},{"./table":167,"./table_view":168}],167:[function(require,module,exports){
"use strict";

var Document = require("substance-document");
var _ = require("underscore");
var DocumentNode = Document.Node;
var Composite = Document.Composite;

var Table = function(node, document) {
  Composite.call(this, node, document);
};

Table.type = {
  "id": "table",
  "parent": "content",
  "properties": {
    "label": "string",
    "source_id": "string",
    "headers": ["array", "content"],
    "cells": ["array", "array", "content"],
    "caption": "content"
  }
};


// This is used for the auto-generated docs
// -----------------
//

Table.description = {
  "name": "Table",
  "remarks": [],
  "properties": {
    "items": "An array of references which contain the content of each cell",
  }
};


// Example Formula
// -----------------
//

Table.example = {
  "type": "table",
  "id": "table_1",
  "headers": ["text_1", "text_2"],
  "cells": [
    ["cell_1_1", "cell_1_2"],
    ["cell_2_1", "cell_2_2"]
  ]
};

Table.Prototype = function() {

  this.getLength = function() {
    var l = 0;
    l += this.properties.headers.length;
    for (var row = 0; row < this.properties.cells.length; row++) {
      var tableRow = this.properties.cells[row];
      l += tableRow.length;
    }
    if (this.properties.caption) {
      l += 1;
    }

    return l;
  };

  this.getNodes = function() {
    var ids = [];
    for (var col = 0; col < this.properties.headers.length; col++) {
      ids.push(this.properties.headers[col]);
    }
    for (var row = 0; row < this.properties.cells.length; row++) {
      var tableRow = this.properties.cells[row];
      ids = ids.concat(tableRow);
    }
    if (this.properties.caption) {
      ids.push(this.properties.caption);
    }
    return ids;
  };

  this.getHeaders = function() {
    return _.map(this.properties.headers, function(id) {
      return this.document.get(id);
    }, this);
  };

  this.getCells = function() {
    var children = [];
    for (var i = 0; i < this.properties.cells.length; i++) {
      var rowIds = this.properties.cells[i];
      var row = [];
      for (var j = 0; j < rowIds.length; j++) {
        row.push(this.document.get(rowIds[j]));
      }
      children.push(row);
    }
    return children;
  };

  this.getCaption = function() {
    var caption;
    if (this.properties.caption) {
      caption = this.document.get(this.properties.caption);
    }
    return caption;
  };

  this.getChangePosition = function(/*op*/) {
    // TODO: map to the corresponding cell
    return -1;
  };

  this.isMutable = function() {
    return false;
  };

  this.canJoin = function(/*other*/) {
    return false;
  };

  this.isBreakable = function() {
    return false;
  };

};

Table.Prototype.prototype = Composite.prototype;
Table.prototype = new Table.Prototype();
Table.prototype.constructor = Table;

Table.create = function(data) {
 var result = {};

  var tableId = data.id;
  var table = {
    id: tableId,
    type: "table",
    label: data.label,
    headers: [],
    cells: []
  };

  var id, node;
  if (data.headers) {
    for (var i = 0; i < data.headers.length; i++) {
      var h = data.headers[i];
      id = "th_" + i + "_" + tableId;
      node = {
        id: id,
        type: "text",
        content: h
      };
      result[id] = node;
      table.headers.push(id);
    }
  }

  for (var row = 0; row < data.cells.length; row++) {
    var rowData = data.cells[row];
    var tableRow = [];
    for (var col = 0; col < rowData.length; col++) {
      var cell = rowData[col];
      id = "td_" + "_" + row + "_" + col + "_" + tableId;
      node = {
        id: id,
        type: "text",
        content: cell
      };
      result[id] = node;
      tableRow.push(id);
    }
    table.cells.push(tableRow);
  }

  if (data.caption) {
    id = "caption_"+ tableId;
    node = {
      id: id,
      type: "text",
      content: data.caption
    };
    result[id] = node;
    table.caption = id;
  }

  result[table.id] = table;

  return result;
};

DocumentNode.defineProperties(Table.prototype, ["headers", "cells", "caption"]);

Object.defineProperties(Table.prototype, {
  // Used as a resource header
  header: {
    get: function() { return this.properties.label; }
  }
});

module.exports = Table;

},{"substance-document":108,"underscore":212}],168:[function(require,module,exports){
"use strict";

var CompositeView = require("../composite/composite_view");
var _ = require("underscore");

// TableView
// =========

var TableView = function(node, viewFactory) {
  CompositeView.call(this, node, viewFactory);
};

TableView.Prototype = function() {

  this.render = function() {
    this.el.innerHTML = "";
    this.content = document.createElement("div");
    this.content.classList.add("content");

    // dispose existing children views if called multiple times
    for (var i = 0; i < this.childrenViews.length; i++) {
      this.childrenViews[i].dispose();
    }

    var tableEl = document.createElement("table");

    // table header
    var cellNode, cellView;
    var tableHeaders = this.node.getHeaders();
    var thead = document.createElement("thead");
    if (tableHeaders.length > 0) {
      var rowEl = document.createElement("tr");
      for (var i = 0; i < tableHeaders.length; i++) {
        cellNode = tableHeaders[i];
        cellView = this.viewFactory.createView(cellNode);
        var cellEl = document.createElement("th");
        cellEl.appendChild(cellView.render().el);
        rowEl.appendChild(cellEl);

        this.childrenViews.push(cellView);
      };
      thead.appendChild(rowEl);
    }
    tableEl.appendChild(thead);

    // table rows
    var tableCells = this.node.getCells();
    var tbody = document.createElement("tbody");
    for (var row = 0; row < tableCells.length; row++) {
      var tableRow = tableCells[row];

      var rowEl = document.createElement("tr");
      for (var col = 0; col < tableRow.length; col++) {
        cellNode = tableRow[col];
        cellView = this.viewFactory.createView(cellNode);
        var cellEl = document.createElement("td");
        cellEl.appendChild(cellView.render().el);
        rowEl.appendChild(cellEl);

        this.childrenViews.push(cellView);
      }
      tbody.appendChild(rowEl);
    }
    tableEl.appendChild(tbody);

    this.content.appendChild(tableEl);

    // table caption
    if (this.node.caption) {
      var caption = this.node.getCaption();
      var captionView = this.viewFactory.createView(caption);
      var captionEl = captionView.render().el;
      captionEl.classList.add("caption");
      this.content.appendChild(captionEl);
      this.childrenViews.push(captionView);
    }

    this.el.appendChild(this.content);

    return this;
  };

  this.onNodeUpdate = function(op) {
    if (op.path[0] === this.node.id) {
      if (op.path[1] === "headers" || op.path[1] === "cells") {
        this.render();
      }
    }
  };
};

TableView.Prototype.prototype = CompositeView.prototype;
TableView.prototype = new TableView.Prototype();
TableView.prototype.constructor = TableView;

module.exports = TableView;

},{"../composite/composite_view":140,"underscore":212}],169:[function(require,module,exports){
"use strict";

module.exports = {
  Model: require("./text_node"),
  View: require("./text_view")
};

},{"./text_node":170,"./text_view":171}],170:[function(require,module,exports){
"use strict";

// Note: for now, we have left the Text node implementation in substance-document
// as it is by the test-suite there, too.
// Later, we will try to extract helper methods, that makes it easier
// to implement custom textish nodes with annotation support.
var Document = require("substance-document");
module.exports = Document.TextNode;

},{"substance-document":108}],171:[function(require,module,exports){
var NodeView = require('../node/node_view');
var Document = require("substance-document");
var Annotator = Document.Annotator;
var $$ = require("substance-application").$$;

// Substance.Text.View
// -----------------
//
// Manipulation interface shared by all textish types (paragraphs, headings)
// This behavior can overriden by the concrete node types

var LAST_CHAR_HACK = false;

var TextView = function(node) {
  NodeView.call(this, node);

  this.$el.addClass('content-node text');
  this.$el.attr('id', this.node.id);

  this._annotations = {};
};

TextView.Prototype = function() {

  // Rendering
  // =============================
  //

  this.render = function(enhancer) {
    NodeView.prototype.render.call(this, enhancer);

    this.renderContent();
    return this;
  };


  this.dispose = function() {
    NodeView.prototype.dispose.call(this);
    console.log('disposing paragraph view');
  };

  this.renderContent = function() {
    this.content.innerHTML = "";

    this._annotations = this.node.getAnnotations();
    this.renderWithAnnotations(this._annotations);
  };

  this.insert = function(pos, str) {
    var range = this.getDOMPosition(pos);
    var textNode = range.startContainer;
    var offset = range.startOffset;
    var text = textNode.textContent;
    text = text.substring(0, offset) + str + text.substring(offset);
    textNode.textContent = text;
  };

  this.delete = function(pos, length) {
    var range = this.getDOMPosition(pos);
    var textNode = range.startContainer;
    var offset = range.startOffset;
    var text = textNode.textContent;
    text = text.substring(0, offset) + text.substring(offset+length);
    textNode.textContent = text;
  };

  this.onNodeUpdate = function(op) {
    if (op.path[1] === "content") {
      console.log("Updating text view: ", op);
      if (op.type === "update") {
        var update = op.diff;
        if (update.isInsert()) {
          this.insert(update.pos, update.str);
        } else if (update.isDelete()) {
          this.delete(update.pos, update.str.length);
        }
      } else if (op.type === "set") {
        this.renderContent();
      }
    }
  };

  this.onGraphUpdate = function(op) {
    NodeView.prototype.onGraphUpdate.call(this, op);

    var doc = this.node.document;
    var schema = doc.getSchema();

    var node;
    if (op.type !== "delete") {
      node = doc.get(op.path[0]);
    } else {
      node = op.val;
    }
    if (schema.isInstanceOf(node.type, "annotation")) {
      var rerender = false;
      if (node.path[0] === this.node.id) {
        rerender = true;
      } else if (op.type === "set" && op.path[1] === "path" && op.original[0] === this.node.id) {
        rerender = true;
      }

      if (rerender) {
        console.log("Rerendering TextView due to annotation update", op);
        this.renderContent();
      }
    }
  };

  this.getCharPosition = function(el, offset) {
    // TODO: this is maybe too naive
    // lookup the given element and compute a
    // the corresponding char position in the plain document
    var range = document.createRange();
    range.setStart(this.content.childNodes[0], 0);
    range.setEnd(el, offset);
    var str = range.toString();
    var charPos = Math.min(this.node.content.length, str.length);

    // console.log("Requested char pos: ", charPos, this.node.content[charPos]);

    return charPos;
  };

  // Returns the corresponding DOM element position for the given character
  // --------
  //
  // A DOM position is specified by a tuple of element and offset.
  // In the case of text nodes it is a TEXT element.

  this.getDOMPosition = function(charPos) {
    if (this.content === undefined) {
      throw new Error("Not rendered yet.");
    }

    var range = document.createRange();

    if (this.node.content.length === 0) {
      range.setStart(this.content.childNodes[0], 0);
      return range;
    }

    // otherwise look for the containing node in DFS order
    // TODO: this could be optimized using some indexing or caching?
    var stack = [this.content];
    while(stack.length > 0) {
      var el = stack.pop();
      if (el.nodeType === Node.TEXT_NODE) {
        var text = el;
        if (text.length >= charPos) {
          range.setStart(el, charPos);
          return range;
        } else {
          charPos -= text.length;
        }
      } else if (el.childNodes.length > 0) {
        // push in reverse order to have a left bound DFS
        for (var i = el.childNodes.length - 1; i >= 0; i--) {
          stack.push(el.childNodes[i]);
        }
      }
    }

    console.log("Bug-Alarm: the model and the view are out of sync.");
    console.log("The model as "+charPos+" more characters");
    console.log("Returning the last available position... but please fix me. Anyone?");

    var children = this.content.childNodes;
    var last = children[children.length-1];
    range.setStart(last, last.length);

    return range;
  };

  this.createAnnotationElement = function(entry) {
    var el;
    if (entry.type === "link") {
      el = $$('a.annotation.'+entry.type, {
        id: entry.id,
        href: this.node.document.get(entry.id).url // "http://zive.at"
      });
    } else {
      el = $$('span.annotation.'+entry.type, {
        id: entry.id
      });
    }

    return el;
  };

  this.renderWithAnnotations = function(annotations) {
    var that = this;
    var text = this.node.content;
    var fragment = document.createDocumentFragment();

    // this splits the text and annotations into smaller pieces
    // which is necessary to generate proper HTML.
    var fragmenter = new Annotator.Fragmenter(fragment, text, annotations);

    fragmenter.onText = function(context, text) {
      context.appendChild(document.createTextNode(text));
    };

    fragmenter.onEnter = function(entry, parentContext) {
      var el = that.createAnnotationElement(entry);
      parentContext.appendChild(el);
      return el;
    };

    // this calls onText and onEnter in turns...
    fragmenter.start(fragment, text, annotations);

    // EXPERIMENTAL HACK:
    // append a trailing white-space to improve the browser's behaviour with softbreaks at the end
    // of a node.
    if (LAST_CHAR_HACK) {
      fragment.appendChild(document.createTextNode(" "));
    }

    // set the content
    this.content.innerHTML = "";
    this.content.appendChild(fragment);
  };

  // Free the memory
  // --------

  this.dispose = function() {
    this.stopListening();
  };
};

TextView.Prototype.prototype = NodeView.prototype;
TextView.prototype = new TextView.Prototype();

module.exports = TextView;

},{"../node/node_view":162,"substance-application":61,"substance-document":108}],172:[function(require,module,exports){
"use strict";

module.exports = {
  Model: require("./web_resource"),
  View: require("./web_resource_view")
};

},{"./web_resource":173,"./web_resource_view":174}],173:[function(require,module,exports){
"use strict";

var DocumentNode = require("substance-document").Node;

var WebResource = function(node, doc) {
  DocumentNode.call(this, node, doc);
};

WebResource.type = {
  "id": "webresource",
  "parent": "content",
  "properties": {
    "source_id": "string",
    "url": "string"
  }
};

WebResource.description = {
  "name": "WebResource",
  "description": "A resource which can be accessed via URL",
  "remarks": [
    "This element is a parent for several other nodes such as Image."
  ],
  "properties": {
    "url": "URL to a resource",
  }
};


WebResource.example = {
  "type": "webresource",
  "id": "webresource_3",
  "url": "http://elife.elifesciences.org/content/elife/1/e00311/F3.medium.gif"
};

WebResource.Prototype = function() {};

WebResource.Prototype.prototype = DocumentNode.prototype;
WebResource.prototype = new WebResource.Prototype();
WebResource.prototype.constructor = WebResource;

DocumentNode.defineProperties(WebResource.prototype, ["url"]);

module.exports = WebResource;

},{"substance-document":108}],174:[function(require,module,exports){
"use strict";

module.exports = require("../node").View;

},{"../node":160}],175:[function(require,module,exports){
"use strict";

module.exports = {
  Operation: require('./src/operation'),
  Compound: require('./src/compound'),
  ArrayOperation: require('./src/array_operation'),
  TextOperation: require('./src/text_operation'),
  ObjectOperation: require('./src/object_operation'),
  Helpers: require('./src/operation_helpers')
};

},{"./src/array_operation":176,"./src/compound":177,"./src/object_operation":178,"./src/operation":179,"./src/operation_helpers":180,"./src/text_operation":181}],176:[function(require,module,exports){
"use strict";

// Import
// ========

var _ = require('underscore');
var util   = require('substance-util');
var errors = util.errors;
var Operation = require('./operation');
var Compound = require('./compound');

var NOP = "NOP";
var DEL = "delete";
var INS = "insert";
var MOV = 'move';

// ArrayOperations can be used to describe changes to arrays by operations.
// ========
//
// Insertions
// --------
//
// An insertion is specified by
//    {
//      type: '+',
//      val:  <value>,
//      pos:  <position>
//    }
// or shorter:
//    ['+', <value>, <position>]
//
//
// Deletions
// --------
//
// A deletion is in the same way as Insertions but with '-' as type.
//
//    ['-', <value>, <position>]
//
// The value must be specified too as otherwise the operation would not be invertible.
//
var Move;

var ArrayOperation = function(options) {

  if (options.type === undefined) {
    throw new errors.OperationError("Illegal argument: insufficient data.");
  }

  // Insert: '+', Delete: '-', Move: '>>'
  this.type = options.type;

  if (this.type === NOP) return;

  // the position where to apply the operation
  this.pos = options.pos;

  // the string to delete or insert
  this.val = options.val;

  // Move operations have a target position
  this.target = options.target;

  // sanity checks
  if(this.type !== NOP && this.type !== INS && this.type !== DEL && this.type !== MOV) {
    throw new errors.OperationError("Illegal type.");
  }

  if (this.type === INS || this.type === DEL) {
    if (this.pos === undefined || this.val === undefined) {
      throw new errors.OperationError("Illegal argument: insufficient data.");
    }
    if (!_.isNumber(this.pos) && this.pos < 0) {
      throw new errors.OperationError("Illegal argument: expecting positive number as pos.");
    }
  } else if (this.type === MOV) {
    if (this.pos === undefined || this.target === undefined) {
      throw new errors.OperationError("Illegal argument: insufficient data.");
    }
    if (!_.isNumber(this.pos) && this.pos < 0) {
      throw new errors.OperationError("Illegal argument: expecting positive number as pos.");
    }
    if (!_.isNumber(this.target) && this.target < 0) {
      throw new errors.OperationError("Illegal argument: expecting positive number as target.");
    }
  }
};

ArrayOperation.fromJSON = function(data) {
  if (_.isArray(data)) {
    if (data[0] === MOV) {
      return new Move(data[1], data[2]);
    } else {
      return new ArrayOperation(data);
    }
  }
  if (data.type === MOV) {
    return Move.fromJSON(data);
  } else if (data.type === Compound.TYPE) {
    var ops = [];
    for (var idx = 0; idx < data.ops.length; idx ++) {
      ops.push(ArrayOperation.fromJSON(data.ops[idx]));
    }
    return ArrayOperation.Compound(ops);
  }
  else  {
    return new ArrayOperation(data);
  }
};

ArrayOperation.Prototype = function() {

  this.clone = function() {
    return new ArrayOperation(this);
  };

  this.apply = function(array) {

    if (this.type === NOP) {
      return array;
    }

    var adapter = (array instanceof ArrayOperation.ArrayAdapter) ? array : new ArrayOperation.ArrayAdapter(array);

    // Insert
    if (this.type === INS) {
      adapter.insert(this.pos, this.val);
    }
    // Delete
    else if (this.type === DEL) {
      adapter.delete(this.pos, this.val);
    }
    else {
      throw new errors.OperationError("Illegal state.");
    }
    return array;
  };

  this.invert = function() {
    var data = this.toJSON();

    if (this.type === INS) data.type = DEL;
    else if (this.type === DEL) data.type = INS;
    else if (this.type === NOP) data.type = NOP;
    else {
      throw new errors.OperationError("Illegal state.");
    }

    return new ArrayOperation(data);
  };

  this.hasConflict = function(other) {
    return ArrayOperation.hasConflict(this, other);
  };

  this.toJSON = function() {
    var result = {
      type: this.type,
    };

    if (this.type === NOP) return result;

    result.pos = this.pos;
    result.val = this.val;

    return result;
  };

  this.isInsert = function() {
    return this.type === INS;
  };

  this.isDelete = function() {
    return this.type === DEL;
  };

  this.isNOP = function() {
    return this.type === NOP;
  };

  this.isMove = function() {
    return this.type === MOV;
  };

};
ArrayOperation.Prototype.prototype = Operation.prototype;
ArrayOperation.prototype = new ArrayOperation.Prototype();

var _NOP = 0;
var _DEL = 1;
var _INS = 2;
var _MOV = 4;

var CODE = {};
CODE[NOP] = _NOP;
CODE[DEL] = _DEL;
CODE[INS] = _INS;
CODE[MOV] = _MOV;

var _hasConflict = [];

_hasConflict[_DEL | _DEL] = function(a,b) {
  return a.pos === b.pos;
};

_hasConflict[_DEL | _INS] = function() {
  return false;
};

_hasConflict[_INS | _INS] = function(a,b) {
  return a.pos === b.pos;
};

/*
  As we provide Move as quasi atomic operation we have to look at it conflict potential.

  A move is realized as composite of Delete and Insert.

  M / I: ( -> I / I conflict)

    m.s < i && m.t == i-1
    else i && m.t == i

  M / D: ( -> D / D conflict)

    m.s === d

  M / M:

    1. M/D conflict
    2. M/I conflict
*/

var hasConflict = function(a, b) {
  if (a.type === NOP || b.type === NOP) return false;
  var caseId = CODE[a.type] | CODE[b.type];

  if (_hasConflict[caseId]) {
    return _hasConflict[caseId](a,b);
  } else {
    return false;
  }
};

var transform0;

function transform_insert_insert(a, b, first) {

  if (a.pos === b.pos) {
    if (first) {
      b.pos += 1;
    } else {
      a.pos += 1;
    }
  }
  // a before b
  else if (a.pos < b.pos) {
    b.pos += 1;
  }

  // a after b
  else  {
    a.pos += 1;
  }

}

function transform_delete_delete(a, b) {

  // turn the second of two concurrent deletes into a NOP
  if (a.pos === b.pos) {
    b.type = NOP;
    a.type = NOP;
    return;
  }

  if (a.pos < b.pos) {
    b.pos -= 1;
  } else {
    a.pos -= 1;
  }

}

function transform_insert_delete(a, b) {

  // reduce to a normalized case
  if (a.type === DEL) {
    var tmp = a;
    a = b;
    b = tmp;
  }

  if (a.pos <= b.pos) {
    b.pos += 1;
  } else {
    a.pos -= 1;
  }

}

function transform_move(a, b, check, first) {
  if (a.type !== MOV) return transform_move(b, a, check, !first);

  var del = {type: DEL, pos: a.pos};
  var ins = {type: INS, pos: a.target};

  var options = {inplace: true, check:check};

  if (b.type === DEL && a.pos === b.pos) {
    a.type = NOP;
    b.pos = a.target;

  } else if (b.type === MOV && a.pos === b.pos) {
    if (first) {
      b.pos = a.target;
      a.type = NOP;
    } else {
      a.pos = b.target;
      b.type = NOP;
    }
  } else {

    if (first) {
      transform0(del, b, options);
      transform0(ins, b, options);
    } else {
      transform0(b, del, options);
      transform0(b, ins, options);
    }

    a.pos = del.pos;
    a.target = ins.pos;

  }
}

transform0 = function(a, b, options) {

  options = options || {};

  if (options.check && hasConflict(a, b)) {
    throw Operation.conflict(a, b);
  }

  if (!options.inplace) {
    a = util.clone(a);
    b = util.clone(b);
  }

  if (a.type === NOP || b.type === NOP)  {
    // nothing to transform
  }
  else if (a.type === INS && b.type === INS)  {
    transform_insert_insert(a, b, true);
  }
  else if (a.type === DEL && b.type === DEL) {
    transform_delete_delete(a, b, true);
  }
  else if (a.type === MOV || b.type === MOV) {
    transform_move(a, b, options.check, true);
  }
  else {
    transform_insert_delete(a, b, true);
  }

  return [a, b];
};

var __apply__ = function(op, array) {
  if (_.isArray(op)) {
    if (op[0] === MOV) {
      op = new Move(op[1], op[2]);
    } else {
      op = new ArrayOperation(op);
    }
  } else if (!(op instanceof ArrayOperation)) {
    op = ArrayOperation.fromJSON(op);
  }
  return op.apply(array);
};

ArrayOperation.transform = Compound.createTransform(transform0);
ArrayOperation.hasConflict = hasConflict;

ArrayOperation.perform = __apply__;
// DEPRECATED: use ArrayOperation.perform
ArrayOperation.apply = __apply__;

// Note: this is implemented manually, to avoid the value parameter
// necessary for Insert and Delete
var Move = function(source, target) {

  this.type = MOV;
  this.pos = source;
  this.target = target;

  if (!_.isNumber(this.pos) || !_.isNumber(this.target) || this.pos < 0 || this.target < 0) {
    throw new errors.OperationError("Illegal argument");
  }
};

Move.Prototype = function() {

  this.clone = function() {
    return new Move(this.pos, this.target);
  };

  this.apply = function(array) {
    if (this.type === NOP) return array;

    var adapter = (array instanceof ArrayOperation.ArrayAdapter) ? array : new ArrayOperation.ArrayAdapter(array);

    var val = array[this.pos];
    adapter.move(val, this.pos, this.target);

    return array;
  };

  this.invert = function() {
    return new Move(this.target, this.pos);
  };

  this.toJSON = function() {
    return {
      type: MOV,
      pos: this.pos,
      target: this.target
    };
  };

};
Move.Prototype.prototype = ArrayOperation.prototype;
Move.prototype = new Move.Prototype();

Move.fromJSON = function(data) {
  return new Move(data.pos, data.target);
};


// classical LCSS, implemented inplace and using traceback trick
var lcss = function(arr1, arr2) {
  var i,j;
  var L = [0];

  for (i = 0; i < arr1.length; i++) {
    for (j = 0; j < arr2.length; j++) {
      L[j+1] = L[j+1] || 0;
      if (_.isEqual(arr1[i], arr2[j])) {
        L[j+1] = Math.max(L[j+1], L[j]+1);
      } else {
        L[j+1] = Math.max(L[j+1], L[j]);
      }
    }
  }

  var seq = [];
  for (j = arr2.length; j >= 0; j--) {
    if (L[j] > L[j-1]) {
      seq.unshift(arr2[j-1]);
    }
  }

  return seq;
};


// Factory methods
// -------
// Note: you should use these methods instead of manually define
// an operation. This is allows us to change the underlying implementation
// without breaking your code.


ArrayOperation.Insert = function(pos, val) {
  return new ArrayOperation({type:INS, pos: pos, val: val});
};

ArrayOperation.Delete = function(pos, val) {
  if (_.isArray(pos)) {
    pos = pos.indexOf(val);
  }
  if (pos < 0) return new ArrayOperation({type: NOP});
  return new ArrayOperation({type:DEL, pos: pos, val: val});
};

ArrayOperation.Move = function(pos1, pos2) {
  return new Move(pos1, pos2);
};

ArrayOperation.Push = function(arr, val) {
  var index = arr.length;
  return ArrayOperation.Insert(index, val);
};

ArrayOperation.Pop = function(arr) {
  // First we need to find a way to return values
  var index = arr.length-1;
  return ArrayOperation.Delete(index, arr[index]);
};


// Creates a compound operation that transforms the given oldArray
// into the new Array
ArrayOperation.Update = function(oldArray, newArray) {

  // 1. Compute longest common subsequence
  var seq = lcss(oldArray, newArray);

  // 2. Iterate through the three sequences and generate a sequence of
  //    retains, deletes, and inserts

  var a = seq;
  var b = oldArray;
  var c = newArray;
  var pos1, pos2, pos3;
  pos1 = 0;
  pos2 = 0;
  pos3 = 0;

  seq = [];

  while(pos2 < b.length || pos3 < c.length) {
    if (a[pos1] === b[pos2] && b[pos2] === c[pos3]) {
      pos1++; pos2++; pos3++;
      seq.push(1);
    } else if (a[pos1] === b[pos2]) {
      seq.push(['+', c[pos3++]]);
    } else {
      seq.push(['-', b[pos2++]]);
    }
  }

  // 3. Create a compound for the computed sequence

  return ArrayOperation.Sequence(seq);
};

ArrayOperation.Compound = function(ops) {
  // do not create a Compound if not necessary
  if (ops.length === 1) return ops[0];
  else return new Compound(ops);
};

// Convenience factory method to create an operation that clears the given array.
// --------
//

ArrayOperation.Clear = function(arr) {
  var ops = [];
  for (var idx = 0; idx < arr.length; idx++) {
    ops.push(ArrayOperation.Delete(0, arr[idx]));
  }
  return ArrayOperation.Compound(ops);
};



// Convenience factory method to create an incremental complex array update.
// --------
//
// Example:
//  Input:
//    [1,2,3,4,5,6,7]
//  Sequence:
//    [2, ['-', 3], 2, ['+', 8]]
//  Output:
//    [1,2,4,5,8,6,7]
//
// Syntax:
//
//  - positive Number: skip / retain
//  - tuple ['-', <val>]: delete element at current position
//  - tuple ['+', <val>]: insert element at current position

ArrayOperation.Sequence = function(seq) {
  var pos = 0;
  var ops = [];

  for (var idx = 0; idx < seq.length; idx++) {
    var s = seq[idx];

    if (_.isNumber(s) && s > 0) {
      pos += s;
    } else {
      if (s[0] === "+") {
        ops.push(ArrayOperation.Insert(pos, s[1]));
        pos+=1;
      } else if (s[0] === "-") {
        ops.push(ArrayOperation.Delete(pos, s[1]));
      } else {
        throw new errors.OperationError("Illegal operation.");
      }
    }
  }

  return new Compound(ops);
};

ArrayOperation.create = function(array, spec) {
  var type = spec[0];
  var val, pos;
  if (type === INS || type === "+") {
    pos = spec[1];
    val = spec[2];
    return ArrayOperation.Insert(pos, val);
  } else if (type === DEL || type === "-") {
    pos = spec[1];
    val = array[pos];
    return ArrayOperation.Delete(pos, val);
  } else if (type === MOV || type === ">>") {
    pos = spec[1];
    var target = spec[2];
    return ArrayOperation.Move(pos, target);
  } else {
    throw new errors.OperationError("Illegal specification.");
  }
};

var ArrayAdapter = function(arr) {
  this.array = arr;
};

ArrayAdapter.prototype = {
  insert: function(pos, val) {
    if (this.array.length < pos) {
      throw new errors.OperationError("Provided array is too small.");
    }
    this.array.splice(pos, 0, val);
  },

  delete: function(pos, val) {
    if (this.array.length < pos) {
      throw new errors.OperationError("Provided array is too small.");
    }
    if (this.array[pos] !== val) {
      throw new errors.OperationError("Unexpected value at position " + pos + ". Expected " + val + ", found " + this.array[pos]);
    }
    this.array.splice(pos, 1);
  },

  move: function(val, pos, to) {
    if (this.array.length < pos) {
      throw new errors.OperationError("Provided array is too small.");
    }
    this.array.splice(pos, 1);

    if (this.array.length < to) {
      throw new errors.OperationError("Provided array is too small.");
    }
    this.array.splice(to, 0, val);
  }
};
ArrayOperation.ArrayAdapter = ArrayAdapter;

ArrayOperation.NOP = NOP;
ArrayOperation.DELETE = DEL;
ArrayOperation.INSERT = INS;
ArrayOperation.MOVE = MOV;

// Export
// ========

module.exports = ArrayOperation;

},{"./compound":177,"./operation":179,"substance-util":207,"underscore":212}],177:[function(require,module,exports){
"use strict";

// Import
// ========

var _    = require('underscore');
var util   = require('substance-util');
var Operation = require('./operation');

// Module
// ========

var COMPOUND = "compound";

var Compound = function(ops) {
  this.type = COMPOUND;
  this.ops = ops;
  this.alias = undefined;

  if (!ops || ops.length === 0) {
    throw new Operation.OperationError("No operations given.");
  }
};

Compound.Prototype = function() {

  this.clone = function() {
    var ops = [];
    for (var idx = 0; idx < this.ops.length; idx++) {
      ops.push(util.clone(this.ops[idx]));
    }
    return new Compound(ops);
  };

  this.apply = function(obj) {
    for (var idx = 0; idx < this.ops.length; idx++) {
      obj = this.ops[idx].apply(obj);
    }
    return obj;
  };

  this.invert = function() {
    var ops = [];
    for (var idx = 0; idx < this.ops.length; idx++) {
      // reverse the order of the inverted atomic commands
      ops.unshift(this.ops[idx].invert());
    }

    return new Compound(ops);
  };

  this.toJSON = function() {
    var result = {
      type: COMPOUND,
      ops: this.ops,
    };
    if (this.alias) result.alias = this.alias;
    return result;
  };

};
Compound.Prototype.prototype = Operation.prototype;
Compound.prototype = new Compound.Prototype();

Compound.TYPE = COMPOUND;

// Transforms a compound and another given change inplace.
// --------
//

var compound_transform = function(a, b, first, check, transform0) {
  var idx;

  if (b.type === COMPOUND) {
    for (idx = 0; idx < b.ops.length; idx++) {
      compound_transform(a, b.ops[idx], first, check, transform0);
    }
  }

  else {
    for (idx = 0; idx < a.ops.length; idx++) {
      var _a, _b;
      if (first) {
        _a = a.ops[idx];
        _b = b;
      } else {
        _a = b;
        _b = a.ops[idx];
      }
      transform0(_a, _b, {inplace: true, check: check});
    }
  }
};

// A helper to create a transform method that supports Compounds.
// --------
//

Compound.createTransform = function(primitive_transform) {
  return function(a, b, options) {
    options = options || {};
    if(a.type === COMPOUND || b.type === COMPOUND) {
      if (!options.inplace) {
        a = util.clone(a);
        b = util.clone(b);
      }
      if (a.type === COMPOUND) {
        compound_transform(a, b, true, options.check, primitive_transform);
      } else if (b.type === COMPOUND) {
        compound_transform(b, a, false, options.check, primitive_transform);
      }
      return [a, b];
    } else {
      return primitive_transform(a, b, options);
    }

  };
};

// Export
// ========

module.exports = Compound;

},{"./operation":179,"substance-util":207,"underscore":212}],178:[function(require,module,exports){
"use strict";

// Import
// ========

var _ = require('underscore');
var util = require('substance-util');
var errors = util.errors;
var Operation = require('./operation');
var Compound = require('./compound');
var TextOperation = require('./text_operation');
var ArrayOperation = require('./array_operation');

var NOP = "NOP";
var CREATE = "create";
var DELETE = 'delete';
var UPDATE = 'update';
var SET = 'set';

var ObjectOperation = function(data) {

  this.type = data.type;
  this.path = data.path;

  if (this.type === CREATE || this.type === DELETE) {
    this.val = data.val;
  }

  // Updates can be given as value or as Operation (Text, Array)
  else if (this.type === UPDATE) {
    if (data.diff !== undefined) {
      this.diff = data.diff;
      this.propertyType = data.propertyType;
    } else {
      throw new errors.OperationError("Illegal argument: update by value or by diff must be provided");
    }
  }

  else if (this.type === SET) {
    this.val = data.val;
    this.original = data.original;
  }
};

ObjectOperation.fromJSON = function(data) {
  if (data.type === Compound.TYPE) {
    var ops = [];
    for (var idx = 0; idx < data.ops.length; idx++) {
      ops.push(ObjectOperation.fromJSON(data.ops[idx]));
    }
    return ObjectOperation.Compound(ops);

  } else {
    return new ObjectOperation(data);
  }
};

ObjectOperation.Prototype = function() {

  this.clone = function() {
    return new ObjectOperation(this);
  };

  this.isNOP = function() {
    if (this.type === NOP) return true;
    else if (this.type === UPDATE) return this.diff.isNOP();
  };

  this.apply = function(obj) {
    if (this.type === NOP) return obj;

    // Note: this allows to use a custom adapter implementation
    // to support other object like backends
    var adapter = (obj instanceof ObjectOperation.Object) ? obj : new ObjectOperation.Object(obj);

    if (this.type === CREATE) {
      // clone here as the operations value must not be changed
      adapter.create(this.path, util.clone(this.val));
      return obj;
    }

    var val = adapter.get(this.path);

    if (this.type === DELETE) {
      // TODO: maybe we could tolerate such deletes
      if (val === undefined) {
        throw new errors.OperationError("Property " + JSON.stringify(this.path) + " not found.");
      }
      adapter.delete(this.path, val);
    }

    else if (this.type === UPDATE) {
      if (this.propertyType === 'object') {
        val = ObjectOperation.apply(this.diff, val);
        if(!adapter.inplace()) adapter.update(this.path, val, this.diff);
      }
      else if (this.propertyType === 'array') {
        val = ArrayOperation.apply(this.diff, val);
        if(!adapter.inplace()) adapter.update(this.path, val, this.diff);
      }
      else if (this.propertyType === 'string') {
        val = TextOperation.apply(this.diff, val);
        adapter.update(this.path, val, this.diff);
      }
      else {
        throw new errors.OperationError("Unsupported type for operational update.");
      }
    }

    else if (this.type === SET) {
      // clone here as the operations value must not be changed
      adapter.set(this.path, util.clone(this.val));
    }

    else {
      throw new errors.OperationError("Illegal state.");
    }

    return obj;
  };

  this.invert = function() {

    if (this.type === NOP) {
      return { type: NOP };
    }

    var result = new ObjectOperation(this);

    if (this.type === CREATE) {
      result.type = DELETE;
    }

    else if (this.type === DELETE) {
      result.type = CREATE;
    }

    else if (this.type === UPDATE) {
      var invertedDiff;
      if (this.propertyType === 'string') {
        invertedDiff = TextOperation.fromJSON(this.diff).invert();
      } else if (this.propertyType === 'array') {
        invertedDiff = ArrayOperation.fromJSON(this.diff).invert();
      }
      result.diff = invertedDiff;
      result.propertyType = this.propertyType;
    }

    else if (this.type === SET) {
      result.val = this.original;
      result.original = this.val;
    }

    else {
      throw new errors.OperationError("Illegal state.");
    }

    return result;
  };

  this.hasConflict = function(other) {
    return ObjectOperation.hasConflict(this, other);
  };

  this.toJSON = function() {

    if (this.type === NOP) {
      return {
        type: NOP
      };
    }

    var data = {
      type: this.type,
      path: this.path,
    };

    if (this.type === CREATE || this.type === DELETE) {
      data.val = this.val;
    }

    else if (this.type === UPDATE) {
      data.diff = this.diff;
      data.propertyType = this.propertyType;
    }

    else if (this.type === SET) {
      data.val = this.val;
      data.original = this.original;
    }

    return data;
  };

};
ObjectOperation.Prototype.prototype = Operation.prototype;
ObjectOperation.prototype = new ObjectOperation.Prototype();

ObjectOperation.Object = function(obj) {
  this.obj = obj;
};

ObjectOperation.Object.Prototype = function() {

  function resolve(self, obj, path, create) {
    var item = obj;
    var idx = 0;
    for (; idx < path.length-1; idx++) {
      if (item === undefined) {
        throw new Error("Key error: could not find element for path " + JSON.stringify(self.path));
      }

      if (item[path[idx]] === undefined && create) {
        item[path[idx]] = {};
      }

      item = item[path[idx]];
    }
    return {parent: item, key: path[idx]};
  }

  this.get = function(path) {
    var item = resolve(this, this.obj, path);
    return item.parent[item.key];
  };

  this.create = function(path, value) {
    var item = resolve(this, this.obj, path, true);
    if (item.parent[item.key] !== undefined) {
      throw new errors.OperationError("Value already exists. path =" + JSON.stringify(path));
    }
    item.parent[item.key] = value;
  };

  // Note: in the default implementation we do not need the diff
  this.update = function(path, value, diff) {
    this.set(path, value);
  };

  this.set = function(path, value) {
    var item = resolve(this, this.obj, path);
    item.parent[item.key] = value;
  };

  this.delete = function(path) {
    var item = resolve(this, this.obj, path);
    delete item.parent[item.key];
  };

  this.inplace = function() {
    return true;
  };

};
ObjectOperation.Object.prototype = new ObjectOperation.Object.Prototype();


var hasConflict = function(a, b) {
  if (a.type === NOP || b.type === NOP) return false;

  return _.isEqual(a.path, b.path);
};

var transform_delete_delete = function(a, b) {
  // both operations have the same effect.
  // the transformed operations are turned into NOPs
  a.type = NOP;
  b.type = NOP;
};

var transform_create_create = function() {
  // TODO: maybe it would be possible to create an differntial update that transforms the one into the other
  // However, we fail for now.
  throw new errors.OperationError("Can not transform two concurring creates of the same property");
};

var transform_delete_create = function(a, b, flipped) {
  if (a.type !== DELETE) {
    return transform_delete_create(b, a, true);
  }

  if (!flipped) {
    a.type = NOP;
  } else {
    a.val = b.val;
    b.type = NOP;
  }
};

var transform_delete_update = function(a, b, flipped) {
  if (a.type !== DELETE) {
    return transform_delete_update(b, a, true);
  }

  var op;
  if (b.propertyType === 'string') {
    op = TextOperation.fromJSON(b.diff);
  } else if (b.propertyType === 'array') {
    op = ArrayOperation.fromJSON(b.diff);
  }

  // (DELETE, UPDATE) is transformed into (DELETE, CREATE)
  if (!flipped) {
    a.type = NOP;
    b.type = CREATE;
    b.val = op.apply(a.val);
  }
  // (UPDATE, DELETE): the delete is updated to delete the updated value
  else {
    a.val = op.apply(a.val);
    b.type = NOP;
  }

};

var transform_create_update = function() {
  // it is not possible to reasonably transform this.
  throw new errors.OperationError("Can not transform a concurring create and update of the same property");
};

var transform_update_update = function(a, b) {

  // Note: this is a conflict the user should know about

  var op_a, op_b, t;
  if (b.propertyType === 'string') {
    op_a = TextOperation.fromJSON(a.diff);
    op_b = TextOperation.fromJSON(b.diff);
    t = TextOperation.transform(op_a, op_b, {inplace: true});
  } else if (b.propertyType === 'array') {
    op_a = ArrayOperation.fromJSON(a.diff);
    op_b = ArrayOperation.fromJSON(b.diff);
    t = ArrayOperation.transform(op_a, op_b, {inplace: true});
  } else if (b.propertyType === 'object') {
    op_a = ObjectOperation.fromJSON(a.diff);
    op_b = ObjectOperation.fromJSON(b.diff);
    t = ObjectOperation.transform(op_a, op_b, {inplace: true});
  }

  a.diff = t[0];
  b.diff = t[1];
};

var transform_create_set = function(a, b, flipped) {
  if (a.type !== CREATE) return transform_create_set(b, a, true);

  if (!flipped) {
    a.type = NOP;
    b.original = a.val;
  } else {
    a.type = SET;
    a.original = b.val;
    b.type = NOP;
  }

};

var transform_delete_set = function(a, b, flipped) {
  if (a.type !== DELETE) return transform_delete_set(b, a, true);

  if (!flipped) {
    a.type = NOP;
    b.type = CREATE;
    b.original = undefined;
  } else {
    a.val = b.val;
    b.type = NOP;
  }

};

var transform_update_set = function() {
  throw new errors.OperationError("Can not transform update/set of the same property.");
};

var transform_set_set = function(a, b) {
  a.type = NOP;
  b.original = a.val;
};

var _NOP = 0;
var _CREATE = 1;
var _DELETE = 2;
var _UPDATE = 4;
var _SET = 8;

var CODE = {};
CODE[NOP] =_NOP;
CODE[CREATE] = _CREATE;
CODE[DELETE] = _DELETE;
CODE[UPDATE] = _UPDATE;
CODE[SET] = _SET;

var __transform__ = [];
__transform__[_DELETE | _DELETE] = transform_delete_delete;
__transform__[_DELETE | _CREATE] = transform_delete_create;
__transform__[_DELETE | _UPDATE] = transform_delete_update;
__transform__[_CREATE | _CREATE] = transform_create_create;
__transform__[_CREATE | _UPDATE] = transform_create_update;
__transform__[_UPDATE | _UPDATE] = transform_update_update;
__transform__[_CREATE | _SET   ] = transform_create_set;
__transform__[_DELETE | _SET   ] = transform_delete_set;
__transform__[_UPDATE | _SET   ] = transform_update_set;
__transform__[_SET    | _SET   ] = transform_set_set;

var transform = function(a, b, options) {

  options = options || {};

  var conflict = hasConflict(a, b);

  if (options.check && conflict) {
    throw Operation.conflict(a, b);
  }

  if (!options.inplace) {
    a = util.clone(a);
    b = util.clone(b);
  }

  // without conflict: a' = a, b' = b
  if (!conflict) {
    return [a, b];
  }

  __transform__[CODE[a.type] | CODE[b.type]](a,b);

  return [a, b];
};

ObjectOperation.transform = Compound.createTransform(transform);
ObjectOperation.hasConflict = hasConflict;

var __apply__ = function(op, obj) {
  if (!(op instanceof ObjectOperation)) {
    op = ObjectOperation.fromJSON(op);
  }
  return op.apply(obj);
};

// TODO: rename to "exec" or perform
ObjectOperation.apply = __apply__;

ObjectOperation.Create = function(path, val) {
  return new ObjectOperation({type: CREATE, path: path, val: val});
};

ObjectOperation.Delete = function(path, val) {
  return new ObjectOperation({type: DELETE, path: path, val: val});
};

function guessPropertyType(op) {

  if (op instanceof Compound) {
    return guessPropertyType(op.ops[0]);
  }
  if (op instanceof TextOperation) {
    return "string";
  }
  else if (op instanceof ArrayOperation) {
    return  "array";
  }
  else {
    return "other";
  }
}

ObjectOperation.Update = function(path, diff, propertyType) {
  propertyType = propertyType || guessPropertyType(diff);

  return new ObjectOperation({
    type: UPDATE,
    path: path,
    diff: diff,
    propertyType: propertyType
  });
};

ObjectOperation.Set = function(path, oldVal, newVal) {
  return new ObjectOperation({
    type: SET,
    path: path,
    val: newVal,
    original: oldVal
  });
};

ObjectOperation.Compound = function(ops) {
  if (ops.length === 0) return null;
  else return new Compound(ops);
};

// TODO: this can not deal with cyclic references
var __extend__ = function(obj, newVals, path, deletes, creates, updates) {
  var keys = Object.getOwnPropertyNames(newVals);

  for (var idx = 0; idx < keys.length; idx++) {
    var key = keys[idx];
    var p = path.concat(key);

    if (newVals[key] === undefined && obj[key] !== undefined) {
      deletes.push(ObjectOperation.Delete(p, obj[key]));

    } else if (_.isObject(newVals[key])) {

      // TODO: for now, the structure must be the same
      if (!_.isObject(obj[key])) {
        throw new errors.OperationError("Incompatible arguments: newVals must have same structure as obj.");
      }
      __extend__(obj[key], newVals[key], p, deletes, creates, updates);

    } else {
      if (obj[key] === undefined) {
        creates.push(ObjectOperation.Create(p, newVals[key]));
      } else {
        var oldVal = obj[key];
        var newVal = newVals[key];
        if (!_.isEqual(oldVal, newVal)) {
          updates.push(ObjectOperation.Set(p, oldVal, newVal));
        }
      }
    }
  }
};

ObjectOperation.Extend = function(obj, newVals) {
  var deletes = [];
  var creates = [];
  var updates = [];
  __extend__(obj, newVals, [], deletes, creates, updates);
  return ObjectOperation.Compound(deletes.concat(creates).concat(updates));
};

ObjectOperation.NOP = NOP;
ObjectOperation.CREATE = CREATE;
ObjectOperation.DELETE = DELETE;
ObjectOperation.UPDATE = UPDATE;
ObjectOperation.SET = SET;

// Export
// ========

module.exports = ObjectOperation;

},{"./array_operation":176,"./compound":177,"./operation":179,"./text_operation":181,"substance-util":207,"underscore":212}],179:[function(require,module,exports){
"use strict";

// Import
// ========

var util   = require('substance-util');
var errors   = util.errors;

var OperationError = errors.define("OperationError", -1);
var Conflict = errors.define("Conflict", -1);

var Operation = function() {};

Operation.Prototype = function() {

  this.clone = function() {
    throw new Error("Not implemented.");
  };

  this.apply = function() {
    throw new Error("Not implemented.");
  };

  this.invert = function() {
    throw new Error("Not implemented.");
  };

  this.hasConflict = function() {
    throw new Error("Not implemented.");
  };

};

Operation.prototype = new Operation.Prototype();

Operation.conflict = function(a, b) {
  var conflict = new errors.Conflict("Conflict: " + JSON.stringify(a) +" vs " + JSON.stringify(b));
  conflict.a = a;
  conflict.b = b;
  return conflict;
};

Operation.OperationError = OperationError;
Operation.Conflict = Conflict;

// Export
// ========

module.exports = Operation;

},{"substance-util":207}],180:[function(require,module,exports){
var Helpers = {};

Helpers.last = function(op) {
  if (op.type === "compound") {
    return op.ops[op.ops.length-1];
  }
  return op;
};

// Iterates all atomic operations contained in a given operation
// --------
//
// - op: an Operation instance
// - iterator: a `function(op)`
// - context: the `this` context for the iterator function
// - reverse: if present, the operations are iterated reversely

Helpers.each = function(op, iterator, context, reverse) {
  if (op.type === "compound") {
    var l = op.ops.length;
    for (var i = 0; i < l; i++) {
      var child = op.ops[i];
      if (reverse) {
        child = op.ops[l-i-1];
      }
      if (child.type === "compound") {
        if (Helpers.each(child, iterator, context, reverse) === false) {
          return false;
        }
      }
      else {
        if (iterator.call(context, child) === false) {
          return false;
        }
      }
    }
    return true;
  } else {
    return iterator.call(context, op);
  }
};

module.exports = Helpers;

},{}],181:[function(require,module,exports){
"use strict";

// Import
// ========

var _ = require('underscore');
var util = require('substance-util');
var errors = util.errors;
var Operation = require('./operation');
var Compound = require('./compound');


var INS = "+";
var DEL = "-";

var TextOperation = function(options) {

  // if this operation should be created using an array
  if (_.isArray(options)) {
    options = {
      type: options[0],
      pos: options[1],
      str: options[2]
    };
  }

  if (options.type === undefined || options.pos === undefined || options.str === undefined) {
    throw new errors.OperationError("Illegal argument: insufficient data.");
  }

  // '+' or '-'
  this.type = options.type;

  // the position where to apply the operation
  this.pos = options.pos;

  // the string to delete or insert
  this.str = options.str;

  // sanity checks
  if(!this.isInsert() && !this.isDelete()) {
    throw new errors.OperationError("Illegal type.");
  }
  if (!_.isString(this.str)) {
    throw new errors.OperationError("Illegal argument: expecting string.");
  }
  if (!_.isNumber(this.pos) && this.pos < 0) {
    throw new errors.OperationError("Illegal argument: expecting positive number as pos.");
  }
};

TextOperation.fromJSON = function(data) {

  if (data.type === Compound.TYPE) {
    var ops = [];
    for (var idx = 0; idx < data.ops.length; idx++) {
      ops.push(TextOperation.fromJSON(data.ops[idx]));
    }
    return TextOperation.Compound(ops);

  } else {
    return new TextOperation(data);
  }
};

TextOperation.Prototype = function() {

  this.clone = function() {
    return new TextOperation(this);
  };

  this.isNOP = function() {
    return this.type === "NOP" || this.str.length === 0;
  };

  this.isInsert = function() {
    return this.type === INS;
  };

  this.isDelete = function() {
    return this.type === DEL;
  };

  this.length = function() {
    return this.str.length;
  };

  this.apply = function(str) {
    if (this.isEmpty()) return str;

    var adapter = (str instanceof TextOperation.StringAdapter) ? str : new TextOperation.StringAdapter(str);

    if (this.type === INS) {
      adapter.insert(this.pos, this.str);
    }
    else if (this.type === DEL) {
      adapter.delete(this.pos, this.str.length);
    }
    else {
      throw new errors.OperationError("Illegal operation type: " + this.type);
    }

    return adapter.get();
  };

  this.invert = function() {
    var data = {
      type: this.isInsert() ? '-' : '+',
      pos: this.pos,
      str: this.str
    };
    return new TextOperation(data);
  };

  this.hasConflict = function(other) {
    return TextOperation.hasConflict(this, other);
  };

  this.isEmpty = function() {
    return this.str.length === 0;
  };

  this.toJSON = function() {
    return {
      type: this.type,
      pos: this.pos,
      str: this.str
    };
  };

};
TextOperation.Prototype.prototype = Operation.prototype;
TextOperation.prototype = new TextOperation.Prototype();

var hasConflict = function(a, b) {

  // Insert vs Insert:
  //
  // Insertions are conflicting iff their insert position is the same.

  if (a.type === INS && b.type === INS)  return (a.pos === b.pos);

  // Delete vs Delete:
  //
  // Deletions are conflicting if their ranges overlap.

  if (a.type === DEL && b.type === DEL) {
    // to have no conflict, either `a` should be after `b` or `b` after `a`, otherwise.
    return !(a.pos >= b.pos + b.str.length || b.pos >= a.pos + a.str.length);
  }

  // Delete vs Insert:
  //
  // A deletion and an insertion are conflicting if the insert position is within the deleted range.

  var del, ins;
  if (a.type === DEL) {
    del = a; ins = b;
  } else {
    del = b; ins = a;
  }

  return (ins.pos >= del.pos && ins.pos < del.pos + del.str.length);
};

// Transforms two Insertions
// --------

function transform_insert_insert(a, b, first) {

  if (a.pos === b.pos) {
    if (first) {
      b.pos += a.str.length;
    } else {
      a.pos += b.str.length;
    }
  }

  else if (a.pos < b.pos) {
    b.pos += a.str.length;
  }

  else {
    a.pos += b.str.length;
  }

}

// Transform two Deletions
// --------
//

function transform_delete_delete(a, b, first) {

  // reduce to a normalized case
  if (a.pos > b.pos) {
    return transform_delete_delete(b, a, !first);
  }

  if (a.pos === b.pos && a.str.length > b.str.length) {
    return transform_delete_delete(b, a, !first);
  }


  // take out overlapping parts
  if (b.pos < a.pos + a.str.length) {
    var s = b.pos - a.pos;
    var s1 = a.str.length - s;
    var s2 = s + b.str.length;

    a.str = a.str.slice(0, s) + a.str.slice(s2);
    b.str = b.str.slice(s1);
    b.pos -= s;
  } else {
    b.pos -= a.str.length;
  }

}

// Transform Insert and Deletion
// --------
//

function transform_insert_delete(a, b) {

  if (a.type === DEL) {
    return transform_insert_delete(b, a);
  }

  // we can assume, that a is an insertion and b is a deletion

  // a is before b
  if (a.pos <= b.pos) {
    b.pos += a.str.length;
  }

  // a is after b
  else if (a.pos >= b.pos + b.str.length) {
    a.pos -= b.str.length;
  }

  // Note: this is a conflict case the user should be noticed about
  // If applied still, the deletion takes precedence
  // a.pos > b.pos && <= b.pos + b.length()
  else {
    var s = a.pos - b.pos;
    b.str = b.str.slice(0, s) + a.str + b.str.slice(s);
    a.str = "";
  }

}

var transform0 = function(a, b, options) {

  options = options || {};

  if (options.check && hasConflict(a, b)) {
    throw Operation.conflict(a, b);
  }

  if (!options.inplace) {
    a = util.clone(a);
    b = util.clone(b);
  }

  if (a.type === INS && b.type === INS)  {
    transform_insert_insert(a, b, true);
  }
  else if (a.type === DEL && b.type === DEL) {
    transform_delete_delete(a, b, true);
  }
  else {
    transform_insert_delete(a,b);
  }

  return [a, b];
};

var __apply__ = function(op, array) {
  if (_.isArray(op)) {
    op = new TextOperation(op);
  }
  else if (!(op instanceof TextOperation)) {
    op = TextOperation.fromJSON(op);
  }
  return op.apply(array);
};

TextOperation.transform = Compound.createTransform(transform0);
TextOperation.apply = __apply__;

var StringAdapter = function(str) {
  this.str = str;
};
StringAdapter.prototype = {
  insert: function(pos, str) {
    if (this.str.length < pos) {
      throw new errors.OperationError("Provided string is too short.");
    }
    this.str = this.str.slice(0, pos) + str + this.str.slice(pos);
  },

  delete: function(pos, length) {
    if (this.str.length < pos + length) {
      throw new errors.OperationError("Provided string is too short.");
    }
    this.str = this.str.slice(0, pos) + this.str.slice(pos + length);
  },

  get: function() {
    return this.str;
  }
};

TextOperation.Insert = function(pos, str) {
  return new TextOperation(["+", pos, str]);
};

TextOperation.Delete = function(pos, str) {
  return new TextOperation(["-", pos, str]);
};

TextOperation.Compound = function(ops) {
  // do not create a Compound if not necessary
  if (ops.length === 1) return ops[0];
  else return new Compound(ops);
};

// Converts from a given a sequence in the format of Tim's lib
// which is an array of numbers and strings.
// 1. positive number: retain a number of characters
// 2. negative number: delete a string with the given length at the current position
// 3. string: insert the given string at the current position

TextOperation.fromOT = function(str, ops) {

  var atomicOps = []; // atomic ops

  // iterating through the sequence and bookkeeping the position
  // in the source and destination str
  var srcPos = 0,
      dstPos = 0;

  if (!_.isArray(ops)) {
    ops = _.toArray(arguments).slice(1);
  }

  _.each(ops, function(op) {
    if (_.isString(op)) { // insert chars
      atomicOps.push(TextOperation.Insert(dstPos, op));
      dstPos += op.length;
    } else if (op<0) { // delete n chars
      var n = -op;
      atomicOps.push(TextOperation.Delete(dstPos, str.slice(srcPos, srcPos+n)));
      srcPos += n;
    } else { // skip n chars
      srcPos += op;
      dstPos += op;
    }
  });

  if (atomicOps.length === 0) {
    return null;
  }

  return TextOperation.Compound(atomicOps);
};

TextOperation.fromSequence = TextOperation.fromOT;

// A helper class to model Text selections and to provide an easy way
// to bookkeep changes by other applied TextOperations
var Range = function(range) {
  if (_.isArray(range)) {
    this.start = range[0];
    this.length = range[1];
  } else {
    this.start = range.start;
    this.length = range.length;
  }
};

// Transforms a given range tuple (offset, length) in-place.
// --------
//

var range_transform = function(range, textOp, expandLeft, expandRight) {

  var changed = false;

  // handle compound operations
  if (textOp.type === Compound.TYPE) {
    for (var idx = 0; idx < textOp.ops.length; idx++) {
      var op = textOp.ops[idx];
      range_transform(range, op);
    }
    return;
  }


  var start, end;

  if (_.isArray(range)) {
    start = range[0];
    end = range[1];
  } else {
    start = range.start;
    end = start + range.length;
  }

  // Delete
  if (textOp.type === DEL) {
    var pos1 = textOp.pos;
    var pos2 = textOp.pos+textOp.str.length;

    if (pos1 <= start) {
      start -= Math.min(pos2-pos1, start-pos1);
      changed = true;
    }
    if (pos1 <= end) {
      end -= Math.min(pos2-pos1, end-pos1);
      changed = true;
    }

  } else if (textOp.type === INS) {
    var pos = textOp.pos;
    var l = textOp.str.length;

    if ( (pos < start) ||
         (pos === start && !expandLeft) ) {
      start += l;
      changed = true;
    }

    if ( (pos < end) ||
         (pos === end && expandRight) ) {
      end += l;
      changed = true;
    }
  }

  if (changed) {
    if (_.isArray(range)) {
      range[0] = start;
      range[1] = end;
    } else {
      range.start = start;
      range.length = end - start;
    }
  }

  return changed;
};

Range.Prototype = function() {

  this.clone = function() {
    return new Range(this);
  };

  this.toJSON = function() {
    var result = {
      start: this.start,
      length: this.length
    };
    // if (this.expand) result.expand = true;
    return result;
  };

  this.transform = function(textOp, expand) {
    return range_transform(this.range, textOp, expand);
  };

};
Range.prototype = new Range.Prototype();

Range.transform = function(range, op, expandLeft, expandRight) {
  return range_transform(range, op, expandLeft, expandRight);
};

Range.fromJSON = function(data) {
  return new Range(data);
};

TextOperation.StringAdapter = StringAdapter;
TextOperation.Range = Range;
TextOperation.INSERT = INS;
TextOperation.DELETE = DEL;

// Export
// ========

module.exports = TextOperation;

},{"./compound":177,"./operation":179,"substance-util":207,"underscore":212}],182:[function(require,module,exports){
"use strict";

var Test = require('substance-test');
var assert = Test.assert;
var registerTest = Test.registerTest;

var TextOperation = require("../index").TextOperation;

function testTransform(a, b, input, expected) {

  var t = TextOperation.transform(a, b);

  var s = t[1].apply(a.apply(input));
  assert.isEqual(expected, s);

  s = t[0].apply(b.apply(input));
  assert.isEqual(expected, s);

}

var TextOperationTest = function() {

  this.actions = [

    "Apply: Insert char at the string end", function() {
      var input = "Lorem ipsum";
      var expected = "Lorem ipsum.";
      var a = TextOperation.Insert(11, ".");
      assert.isEqual(expected, a.apply(input));
    },


    "Transformation: a=Insert, b=Insert, a before b", function() {

      var input = "Lorem ipsum";
      var expected = "Lorem bla ipsum blupp";
      var a = TextOperation.Insert(6, "bla ");
      var b = TextOperation.Insert(11, " blupp");

      // transformation should be symmetric in this case
      testTransform(a, b, input, expected);
      testTransform(b, a, input, expected);
    },

    "Transformation: a=Insert, b=Insert, same position", function() {
      // a before b
      var input = "Lorem ipsum";
      var expected = "Lorem bla blupp ipsum";
      var expected_2 = "Lorem blupp bla ipsum";
      var a = TextOperation.Insert(6, "bla ");
      var b = TextOperation.Insert(6, "blupp ");

      testTransform(a, b, input, expected);
      testTransform(b, a, input, expected_2);
    },

    "Transformation: a=Delete, b=Delete, a before b, no overlap", function() {

      var input = "Lorem ipsum dolor sit amet";
      var expected = "Lorem dolor amet";
      var a = TextOperation.Delete(6, "ipsum ");
      var b = TextOperation.Delete(18, "sit ");

      testTransform(a, b, input, expected);
      testTransform(b, a, input, expected);
    },

    "Transformation: a=Delete, b=Delete, with overlap", function() {

      var input = "Lorem ipsum dolor sit amet";
      var expected = "Lorem amet";
      var a = TextOperation.Delete(6, "ipsum dolor sit ");
      var b = TextOperation.Delete(12, "dolor ");

      testTransform(a, b, input, expected);
      testTransform(b, a, input, expected);
    },

    "Transformation: a=Delete, b=Delete, same position", function() {

      var input = "Lorem ipsum dolor sit amet";
      var expected = "Lorem amet";
      var a = TextOperation.Delete(6, "ipsum dolor ");
      var b = TextOperation.Delete(6, "ipsum dolor sit ");

      testTransform(a, b, input, expected);
      testTransform(b, a, input, expected);

    },

    "Transformation: a=Insert, b=Delete, a before b", function() {

      var input = "Lorem dolor sit amet";
      var expected = "Lorem ipsum dolor amet";
      var a = TextOperation.Insert(6, "ipsum ");
      var b = TextOperation.Delete(12, "sit ");

      testTransform(a, b, input, expected);
      testTransform(b, a, input, expected);

    },

    "Transformation: a=Insert, b=Delete, overlap", function() {

      var input = "Lorem dolor sit amet";
      var expected = "Lorem amet";
      var a = TextOperation.Insert(12, "ipsum ");
      var b = TextOperation.Delete(6, "dolor sit ");

      testTransform(a, b, input, expected);
      testTransform(b, a, input, expected);
    },

    "Compound: 'bla' - 'blapp' | 'blupp'", function() {
      var input = "bla";
      var expected1 = "blappupp";
      var expected2 = "bluppapp";
      var a = TextOperation.fromOT("bla", [2, -1, "app"]);
      var b = TextOperation.fromOT("bla", [2, -1, "upp"]);

      testTransform(a, b, input, expected1);
      testTransform(b, a, input, expected2);
    },

  ];

};

registerTest(['Substance.Operator', 'Text Operation'], new TextOperationTest());

},{"../index":175,"substance-test":198}],183:[function(require,module,exports){
"use strict";

var Test = require('substance-test');
var assert = Test.assert;
var operator = require('../index');
var registerTest = Test.registerTest;

var ArrayOperation = operator.ArrayOperation;

function testTransform(a, b, input, expected) {
  var t = ArrayOperation.transform(a, b);

  var output = ArrayOperation.perform(t[1], ArrayOperation.perform(a, input.slice(0)));
  assert.isArrayEqual(expected, output);

  output = ArrayOperation.perform(t[0], ArrayOperation.perform(b, input.slice(0)));
  assert.isArrayEqual(expected, output);

}

var ArrayOperationTest = function() {

  this.actions = [

    // All cases are tested canonically. No convenience. Completeness.

    // Insert-Insert Transformations
    // --------
    // Cases:
    //  1. `a < b`:   operations should not be affected
    //  2. `b < a`:   dito
    //  3. `a == b`:  result depends on preference (first applied)

    "Transformation: a=Insert, b=Insert (1,2), a < b and b < a", function() {
      var input = [1,3,5];
      var expected = [1,2,3,4,5];
      var a = ArrayOperation.Insert(1, 2);
      var b = ArrayOperation.Insert(2, 4);

      testTransform(a, b, input, expected);
      testTransform(b, a, input, expected);
    },

    // Example:
    //     A = [1,4], a = [+, 1, 2], b = [+, 1, 3]
    //     A  - a ->  [1, 2, 4]   - b' ->   [1,2,3,4]     => b'= [+, 2, 3], transform(a, b) = [a, b']
    //     A  - b ->  [1, 3, 4]   - a' ->   [1,3,2,4]     => a'= [+, 2, 2], transform(b, a) = [a', b]
    "Transformation: a=Insert, b=Insert (3), a == b", function() {
      var input = [1,4];
      var expected = [1,2,3,4];
      var expected_2 = [1,3,2,4];
      var a = ArrayOperation.Insert(1, 2);
      var b = ArrayOperation.Insert(1, 3);

      // in this case the transform is not symmetric
      testTransform(a, b, input, expected);
      testTransform(b, a, input, expected_2);
    },

    // Delete-Delete Transformations
    // --------
    // Cases:
    //  1. `a < b`:   operations should not be affected
    //  2. `b < a`:   dito
    //  3. `a == b`:  second operation should not have an effect;
    //                user should be noticed about conflict

    "Transformation: a=Delete, b=Delete (1,2), a < b and b < a", function() {
      var input = [1,2,3,4,5];
      var expected = [1,3,5];
      var a = ArrayOperation.Delete(1, 2);
      var b = ArrayOperation.Delete(3, 4);

      testTransform(a, b, input, expected);
      testTransform(b, a, input, expected);
    },

    "Transformation: a=Delete, b=Delete (3), a == b", function() {
      var input = [1,2,3];
      var expected = [1,3];
      var a = ArrayOperation.Delete(1, 2);
      var b = ArrayOperation.Delete(1, 2);

      testTransform(a, b, input, expected);
      testTransform(b, a, input, expected);
    },

    // Insert-Delete Transformations
    // --------
    // Cases: (a = insertion, b = deletion)
    //  1. `a < b`:   b must be shifted right
    //  2. `b < a`:   a must be shifted left
    //  3. `a == b`:  ???

    //     A = [1,3,4,5], a = [+, 1, 2], b = [-, 2, 4]
    //     A  - a ->  [1,2,3,4,5] - b' ->   [1,2,3,5]     => b'= [-, 3, 4]
    //     A  - b ->  [1,3,5]     - a' ->   [1,2,3,5]     => a'= [+, 1, 2] = a
    "Transformation: a=Insert, b=Delete (1), a < b", function() {
      var input = [1,3,4,5];
      var expected = [1,2,3,5];
      var a = ArrayOperation.Insert(1, 2);
      var b = ArrayOperation.Delete(2, 4);

      testTransform(a, b, input, expected);
      testTransform(b, a, input, expected);
    },

    //     A = [1,2,3,5], a = [+,3,4], b = [-,1,2]
    //     A  - a ->  [1,2,3,4,5] - b' ->   [1,3,4,5]     => b'= [-,1,2] = b
    //     A  - b ->  [1,3,5]     - a' ->   [1,3,4,5]     => a'= [+,2,4]
   "Transformation: a=Insert, b=Delete (2), b < a", function() {
      var input = [1,2,3,5];
      var expected = [1,3,4,5];
      var a = ArrayOperation.Insert(3, 4);
      var b = ArrayOperation.Delete(1, 2);

      testTransform(a, b, input, expected);
      testTransform(b, a, input, expected);
    },

    //     A = [1,2,3], a = [+,1,4], b = [-,1,2]
    //     A  - a ->  [1,4,2,3] - b' ->   [1,4,3]     => b'= [-,2,2]
    //     A  - b ->  [1,3]     - a' ->   [1,4,3]     => a'= [+,1,4] = a
    "Transformation: a=Insert, b=Delete (3), a == b", function() {
      var input = [1,2,3];
      var expected = [1,4,3];
      var a = ArrayOperation.Insert(1, 4);
      var b = ArrayOperation.Delete(1, 2);

      testTransform(a, b, input, expected);
      testTransform(b, a, input, expected);
    },

    "Transformation (conflict): a=Move, b=Insert, m.s > i && m.t == i", function() {
      var input = [1,3,4,5];
      var expected1 = [1,5,2,3,4];
      var expected2 = [1,2,5,3,4];
      var a = ArrayOperation.Move(3, 1);
      var b = ArrayOperation.Insert(1, 2);

      testTransform(a, b, input, expected1);
      testTransform(b, a, input, expected2);
    },

    "Transformation (conflict): a=Move, b=Insert, m.s < i && m.t == i-1", function() {
      var input = [1,2,3,5];
      var expected1 = [1,3,2,4,5];
      var expected2 = [1,3,4,2,5];
      var a = ArrayOperation.Move(1, 2);
      var b = ArrayOperation.Insert(3, 4);

      testTransform(a, b, input, expected1);
      testTransform(b, a, input, expected2);
    },

    "Transformation (conflict): a=Move, b=Delete, m.s == d", function() {
      var input = [1,2,3,4];
      var expected = [1,2,4];
      var a = ArrayOperation.Move(2, 0);
      var b = ArrayOperation.Delete(2, 3);

      testTransform(a, b, input, expected);
      testTransform(b, a, input, expected);
    },

    "Transformation (conflict): a=Move, b=Move, a.s == b.s", function() {
      var input = [1,2,3,4];
      var expected1 = [1,3,2,4];
      var expected2 = [2,1,3,4];
      var a = ArrayOperation.Move(1, 0);
      var b = ArrayOperation.Move(1, 2);

      testTransform(a, b, input, expected1);
      testTransform(b, a, input, expected2);
    },

    "Transformation (conflict): a=Move, b=Move, a.s < b.t && a.t == b.t-1", function() {
      var input = [1,2,3,4];
      var expected1 = [2,1,4,3];
      var expected2 = [2,4,1,3];
      var a = ArrayOperation.Move(0, 1);
      var b = ArrayOperation.Move(3, 2);

      testTransform(a, b, input, expected1);
      testTransform(b, a, input, expected2);
    },

    "Transformation (conflict): a=Move, b=Move, a.t == b.t", function() {
      var input = [1,2,3,4];
      var expected1 = [1,3,4,2];
      var expected2 = [1,4,3,2];
      var a = ArrayOperation.Move(2, 1);
      var b = ArrayOperation.Move(3, 1);

      testTransform(a, b, input, expected1);
      testTransform(b, a, input, expected2);
    },

    "Update: [1,2,3,4,5] -> [2,1,3,4]", function() {
      var input = [1,2,3,4,5];
      var expected = [2,1,3,4];

      var op = ArrayOperation.Update(input, expected);
      var output = op.apply(input);

      assert.isArrayEqual(expected, output);
    },

    "Update: [1,2,3,4,5] -> []", function() {
      var input = [1,2,3,4,5];
      var expected = [];

      var op = ArrayOperation.Update(input, expected);
      var output = op.apply(input);

      assert.isArrayEqual(expected, output);
    },

    "Update: [1,2,3,4,5] -> [5,4,3,2,1]", function() {
      var input = [1,2,3,4,5];
      var expected = [5,4,3,2,1];

      var op = ArrayOperation.Update(input, expected);
      var output = op.apply(input);

      assert.isArrayEqual(expected, output);
    },

    "Delete 3: [1,2,3,4,5] -> [1,2,4,5]", function() {
      var input = [1,2,3,4,5];
      var expected = [1,2,4,5];

      var op = ArrayOperation.Delete(input, 3);
      var output = op.apply(input);

      assert.isArrayEqual(expected, output);
    },

    "Pop: [1,2,3,4,5] -> [1,2,3,4]", function() {
      var input = [1,2,3,4,5];
      var expected = [1,2,3,4];

      var op = ArrayOperation.Pop(input);
      var output = op.apply(input);

      assert.isArrayEqual(expected, output);
    },

    "Push: [1,2,3,4] -> [1,2,3,4,6]", function() {
      var input = [1,2,3,4];
      var expected = [1,2,3,4,6];

      var op = ArrayOperation.Push(input, 6);
      var output = op.apply(input);

      assert.isArrayEqual(expected, output);
    }

  ];

};

registerTest(['Substance.Operator', 'Array Operation'], new ArrayOperationTest());

},{"../index":175,"substance-test":198}],184:[function(require,module,exports){
"use strict";

var Test = require('substance-test');
var assert = Test.assert;
var util = require('substance-util');
var errors = util.errors;
var operator = require('../index');
var registerTest = Test.registerTest;


var ObjectOperation = operator.ObjectOperation;
var TextOperation = operator.TextOperation;
var ArrayOperation = operator.ArrayOperation;

function testTransform(a, b, input, expected) {
  var t = ObjectOperation.transform(a, b);

  var output = ObjectOperation.apply(t[1], ObjectOperation.apply(a, util.clone(input)));
  assert.isDeepEqual(expected, output);

  output = ObjectOperation.apply(t[0], ObjectOperation.apply(b, util.clone(input)));
  assert.isDeepEqual(expected, output);
}

var ObjectOperationTest = function() {

  this.actions = [

    "Apply: create", function() {
      var path = ["a"];
      var val = "bla";
      var expected = {a: "bla"};
      var op = ObjectOperation.Create(path, val);

      var obj = {};
      op.apply(obj);

      assert.isDeepEqual(expected, obj);
    },

    "Apply: create (nested)", function() {
      var path = ["a", "b"];
      var val = "bla";
      var expected = {a: { b: "bla"} };
      var op = ObjectOperation.Create(path, val);

      var obj = {"a": {}};
      op.apply(obj);

      assert.isDeepEqual(expected, obj);
    },

    "Apply: delete", function() {
      var path = ["a"];
      var val = "bla";
      var op = ObjectOperation.Delete(path, val);
      var expected = {};

      var obj = {"a": "bla"};
      op.apply(obj);

      assert.isDeepEqual(expected, obj);
    },

    "Apply: delete (nested)", function() {
      var path = ["a", "b"];
      var val = "bla";
      var op = ObjectOperation.Delete(path, val);
      var expected = { a: {} };

      var obj = { a: { b: "bla"} };
      op.apply(obj);

      assert.isDeepEqual(expected, obj);
    },

    "Apply: delete (key error)", function() {
      var path = ["a", "b"];
      var val = "bla";
      var op = ObjectOperation.Delete(path, val);

      var obj = { a: { c: "bla"} };
      assert.exception(errors.ChronicleError, function() {
        op.apply(obj);
      });
    },

    "Apply: update (text)", function() {
      var path = ["a"];
      var op = ObjectOperation.Update(path, TextOperation.fromOT("bla", [2, -1, "upp"]));
      var expected = {a: "blupp"};

      var obj = {a: "bla"};
      op.apply(obj);

      assert.isDeepEqual(expected, obj);
    },

    "Apply: update (array)", function() {
      var path = ["a"];
      var val = [1,2,3,4,5];
      var op = ObjectOperation.Update(path, ArrayOperation.Sequence([2, ['-', 3], 2, ['+', 6]]));
      var expected = {a: [1,2,4,5,6]};

      var obj = {a: val.slice(0)};
      op.apply(obj);

      assert.isDeepEqual(expected, obj);
    },

    // Conflict cases
    "Transformation: create/create (conflict)", function() {
      var path = ["a"];
      var val1 = "bla";
      var val2 = "blupp";

      var a = ObjectOperation.Create(path, val1);
      var b = ObjectOperation.Create(path, val2);

      assert.isTrue(ObjectOperation.hasConflict(a, b));

      assert.exception(errors.ChronicleError, function() {
        ObjectOperation.transform(a, b);
      });
    },

    "Transformation: delete/delete (conflict)", function() {
      var path = ["a"];
      var val = "bla";
      var input = {"a": val};
      var expected = {};

      var a = ObjectOperation.Delete(path, val);
      var b = ObjectOperation.Delete(path, val);

      assert.isTrue(ObjectOperation.hasConflict(a, b));

      testTransform(a, b, input, expected);
      testTransform(b, a, input, expected);
    },

    "Transformation: delete/create (conflict)", function() {
      var path = ["a"];
      var a = ObjectOperation.Delete(path, "bla");
      var b = ObjectOperation.Create(path, "blupp");
      var expected1 = {a: "blupp"};
      var expected2 = {};
      var obj, t;

      assert.isTrue(ObjectOperation.hasConflict(a, b));

      // Note: this is a ill-posed case, as create will fail when the value already exists.

      t = ObjectOperation.transform(a, b);
      obj = t[1].apply(a.apply({a: "bla"}));
      assert.isDeepEqual(expected1, obj);
      obj = t[0].apply(b.apply({}));
      assert.isDeepEqual(expected1, obj);

      t = ObjectOperation.transform(b, a);
      obj = t[1].apply(b.apply({}));
      assert.isDeepEqual(expected2, obj);
      obj = t[0].apply(a.apply({a: "bla"}));
      assert.isDeepEqual(expected2, obj);

    },

    "Transformation: delete/update (conflict)", function() {
      var path = ["a"];
      var a = ObjectOperation.Delete(path, "bla");
      var b = ObjectOperation.Update(path, TextOperation.fromOT("bla", [2, -1, "upp"]));

      var input = {a : "bla"};
      var expected1 = {a: "blupp"};
      var expected2 = {};

      assert.isTrue(ObjectOperation.hasConflict(a, b));

      testTransform(a, b, input, expected1);
      testTransform(b, a, input, expected2);
    },

    "Transformation: create/update (conflict)", function() {
      var path = ["a"];
      var a = ObjectOperation.Create(path, "bla");
      var b = ObjectOperation.Update(path, TextOperation.fromOT("foo", [-3, "bar"]));

      assert.isTrue(ObjectOperation.hasConflict(a, b));
      assert.exception(errors.ChronicleError, function() {
        ObjectOperation.transform(a, b);
      });
    },

    "Transformation: update/update (conflict)", function() {
      var path = ["a"];
      var a = ObjectOperation.Update(path, TextOperation.fromOT("bla", [2, -1, "app"]));
      var b = ObjectOperation.Update(path, TextOperation.fromOT("bla", [2, -1, "upp"]));

      var input = {a : "bla"};
      var expected1 = {a: "blappupp"};
      var expected2 = {a: "bluppapp"};

      assert.isTrue(ObjectOperation.hasConflict(a, b));

      testTransform(a, b, input, expected1);
      testTransform(b, a, input, expected2);
    },

    "Transformation: delete/set (conflict)", function() {
      var path = ["a"];
      var a = ObjectOperation.Delete(path, "bla");
      var b = ObjectOperation.Set(path, "bla", "blupp");

      var input = {a : "bla"};
      var expected1 = {a: "blupp"};
      var expected2 = {};

      assert.isTrue(ObjectOperation.hasConflict(a, b));

      testTransform(a, b, input, expected1);
      testTransform(b, a, input, expected2);
    },

    "Transformation: create/set (conflict)", function() {
      var path = ["a"];
      var a = ObjectOperation.Create(path, "foo");
      var b = ObjectOperation.Set(path, "bla", "blupp");

      var expected1 = {a: "blupp"};
      var expected2 = {a: "foo"};

      assert.isTrue(ObjectOperation.hasConflict(a, b));

      var t = ObjectOperation.transform(a, b);
      var obj = t[1].apply(a.apply({}));
      assert.isDeepEqual(expected1, obj);
      obj = t[0].apply(b.apply({a: "bla"}));
      assert.isDeepEqual(expected1, obj);

      t = ObjectOperation.transform(b, a);
      obj = t[1].apply(b.apply({a: "bla"}));
      assert.isDeepEqual(expected2, obj);
      obj = t[0].apply(a.apply({}));
      assert.isDeepEqual(expected2, obj);
    },

    "Transformation: update/set (conflict)", function() {
      var path = ["a"];
      var a = ObjectOperation.Update(path, TextOperation.fromOT("bla", [2, -1, "upp"]));
      var b = ObjectOperation.Set(path, "bla", "blupp");

      assert.isTrue(ObjectOperation.hasConflict(a, b));

      assert.exception(errors.ChronicleError, function() {
        ObjectOperation.transform(a,b);
      });
    },

    "Transformation: set/set (conflict)", function() {
      var path = ["a"];
      var a = ObjectOperation.Set(path, "bla", "blapp");
      var b = ObjectOperation.Set(path, "bla", "blupp");

      var input = {a : "bla"};
      var expected1 = {a: "blupp"};
      var expected2 = {a: "blapp"};

      assert.isTrue(ObjectOperation.hasConflict(a, b));

      testTransform(a, b, input, expected1);
      testTransform(b, a, input, expected2);
    }

  ];

};

registerTest(['Substance.Operator', 'Object Operation'], new ObjectOperationTest());

},{"../index":175,"substance-test":198,"substance-util":207}],185:[function(require,module,exports){
"use strict";

require('./001-text-operation');
require('./002-array-operation');
require('./003-object-operation');

},{"./001-text-operation":182,"./002-array-operation":183,"./003-object-operation":184}],186:[function(require,module,exports){
"use strict";

module.exports = require("./src/regexp");

},{"./src/regexp":187}],187:[function(require,module,exports){
"use strict";

// Substanc.RegExp.Match
// ================
//
// Regular expressions in Javascript they way they should be.

var Match = function(match) {
  this.index = match.index;
  this.match = [];

  for (var i=0; i < match.length; i++) {
    this.match.push(match[i]);
  }
};

Match.Prototype = function() {

  // Returns the capture groups
  // --------
  //

  this.captures = function() {
    return this.match.slice(1);
  };

  // Serialize to string
  // --------
  //

  this.toString = function() {
    return this.match[0];
  };
};

Match.prototype = new Match.Prototype();

// Substance.RegExp
// ================
//

var RegExp = function(exp) {
  this.exp = exp;
};

RegExp.Prototype = function() {

  this.match = function(str) {
    if (str === undefined) throw new Error('No string given');
    
    if (!this.exp.global) {
      return this.exp.exec(str);
    } else {
      var matches = [];
      var match;
      // Reset the state of the expression
      this.exp.compile(this.exp);

      // Execute until last match has been found

      while ((match = this.exp.exec(str)) !== null) {
        matches.push(new Match(match));
      }
      return matches;
    }
  };
};

RegExp.prototype = new RegExp.Prototype();

RegExp.Match = Match;


// Export
// ========

module.exports = RegExp;

},{}],188:[function(require,module,exports){
"use strict";

var Store = require('./src/store');
Store.LocalStore = require('./src/local_store');
Store.MemoryStore = require('./src/memory_store');

module.exports = Store;

},{"./src/local_store":189,"./src/memory_store":190,"./src/store":191}],189:[function(require,module,exports){
"use strict";

// Import
// ========

var _ = require('underscore');
var util = require('substance-util');
var errors = util.errors;
var Store = require('./store');


// Module
// ========

var LocalStore = function(scope) {
  Store.call(this);
  this.scope = scope || "";
};

LocalStore.Prototype = function() {

  function clear(prefix) {
    var keys = [];
    var idx = 0;
    var key;
    while(true) {
      key = localStorage.key(idx++);
      if (!key) break;

      //console.log("Is prefix?", scope, key, key.indexOf(scope));
      if (key.indexOf(prefix) === 0) {
        keys.push(key);
      }
    }

    _.each(keys, function(key) {
      localStorage.removeItem(key);
    });
  }

  this.hash = function() {
    return this.sortedhash.apply(this, arguments);
  };

  this.sortedhash = function() {
    var key = Store.defaultHashKey(arguments, this.scope);
    return new LocalStore.Hash(key);
  };

  this.clear = function() {
    clear(this.scope);
  };

  this.subStore = function(path) {
    return new LocalStore(this.scope + ":" + path.join(":"));
  };

};

LocalStore.Prototype.prototype = Store.prototype;
LocalStore.prototype = new LocalStore.Prototype();

LocalStore.Hash = function(scope) {
  this.scope = scope;
};

LocalStore.Hash.prototype = _.extend(new Store.AbstractHash(), {

  scoped : function(key) {
    return this.scope+":"+key;
  },

  contains : function(key) {
    key = this.scoped(key);
    return localStorage.hasOwnProperty(key);
  },

  __get__ : function(key) {
    key = this.scoped(key);
    return JSON.parse(localStorage.getItem(key));
  },

  __set__ : function(key, value) {
    key = this.scoped(key);
    localStorage.setItem(key, JSON.stringify(value));
  },

  __delete__ : function(key) {
    key = this.scoped(key);
    localStorage.removeItem(key);
  }

});

// Export
// ========

module.exports = LocalStore;

},{"./store":191,"substance-util":207,"underscore":212}],190:[function(require,module,exports){
"use strict";

// Import
// ========

var _ = require('underscore');
var util = require('substance-util');
var errors = util.errors;
var Store = require('./store');

// Module
// ========

var MemoryStore = function(content) {
  Store.call(this);
  this.content = content || {};
};

MemoryStore.Prototype = function() {

  function resolve(obj, path) {
    _.each(path, function(scope) {
      obj[scope] = obj[scope] || {};
      obj = obj[scope];
    });
    return obj;
  }

  this.hash = function() {
    return this.sortedhash.apply(this, arguments);
  };

  this.sortedhash = function() {
    var obj = resolve(this.content, arguments);
    return new MemoryStore.Hash(obj);
  };

  this.clear = function() {
    this.content = {};
  };

  this.subStore = function(path) {
    var obj = resolve(this.content, path);
    return new MemoryStore(obj);
  };

};

MemoryStore.Prototype.prototype = Store.prototype;
MemoryStore.prototype = new MemoryStore.Prototype();

MemoryStore.Hash = function(obj) {
  if (!obj) throw new Error("Illegal argument.");
  this.obj = obj;
};

MemoryStore.Hash.prototype = _.extend(new Store.AbstractHash(), {

  contains : function(key) {
    return !!this.obj[key];
  },

  __get__ : function(key) {
    return this.obj[key];
  },

  __set__ : function(key, value) {
    this.obj[key] = util.deepclone(value);
  },

  __delete__ : function(key) {
    delete this.obj[key];
  }

});

// Export
// ========

module.exports = MemoryStore;

},{"./store":191,"substance-util":207,"underscore":212}],191:[function(require,module,exports){
"use strict";

// Import
// ========

var _ = require('underscore');
var util = require('substance-util');
var errors = util.errors;

// Module
// ========

var StoreError = errors.define('StoreError', -1);

var Store = function() {};

// Store: Public Interface
// ========
//

Store.Prototype = function() {

  // as this is abstract disable warnings about unused variables*/
  /*jshint unused:false*/

  // Returns a key value store for the given path.
  // --------
  //

  this.hash = function(path) {
    return this.sortedhash(path);
  };

  this.sortedhash = function(path) {
    throw "Called abstract method.";
  };

  // Clears the whole store
  // --------
  //
  this.clear = function() {
    throw "Called abstract method.";
  };

  // Create a store instance that is phyisically living in a sub-scope of
  // this store
  this.subStore = function(path) {
    throw "Called abstract method.";
  };

};

Store.prototype = new Store.Prototype();

// A helper class to adapt a javascript object to a unified hash interface
// used by the store.
// --------
// Note: the hash keeps the keys in order of changes. I.e., the last changed key will be last of keys()
//

Store.AbstractHash = function() {

  // as this is abstract disable warnings about unused variables*/
  /*jshint unused:false*/

  this.contains = function(key) {
    var keys = this.keys();
    if (!keys) return false;
    else return keys.indexOf(key) >= 0;
  };

  this.keys = function() {
    var keys = this.__get__("__keys__");
    if (!keys) {
      this.__set__("__keys__", []);
      keys = [];
    }
    return keys;
  };

  this.get = function(key) {
    if(!this.contains(key)) {
      //throw new StoreError("Unknown key:"+key);
      return undefined;
    }
    return this.__get__(key);
  };

  this.set = function(key, value) {
    if (!key) {
      throw new StoreError("Illegal key:"+key);
    }
    var keys = _.without(this.keys(), key);
    keys.push(key);
    this.__set__("__keys__", keys);
    this.__set__(key, value);
  };

  this.delete = function(key) {
    var keys = _.without(this.keys(), key);
    this.__set__("__keys__", keys);
    this.__delete__(key);
  };

  this.clear = function() {
    var keys = this.keys();
    _.each(keys, function(key) {
      this.__delete__(key);
    }, this);
    this.__set__("__keys__", []);
  };

  this.dump = function() {
    var keys = this.keys();
    var result = {};
    _.each(keys, function(key) {
      result[key] = this.__get__(key);
    }, this);
    return result;
  };

  // Trivial getter
  // --------
  // gets called by this.get()

  this.__get__ = function(key) {
    throw new Error("Not implemented");
  };

  // Trivial setter
  // --------
  // gets called by this.set()

  this.__set__ = function(key, value) {
    throw new Error("Not implemented");
  };

  this.__delete__ = function(key) {
    throw new Error("Not implemented");
  };

};

Store.defaultHashKey = function(args, scope) {
  var path = [];
  if (scope) path.push(scope);
  for (var idx=0; idx<args.length; idx++) {
    path.push(args[idx]);
  }
  return path.join(":");
};


// Export
// ========

module.exports = Store;


},{"substance-util":207,"underscore":212}],192:[function(require,module,exports){
"use strict";

require('./memory_store_test');
require('./local_store_test');

},{"./local_store_test":193,"./memory_store_test":194}],193:[function(require,module,exports){
var global=self;"use strict";

var LocalStore = require("../index").LocalStore;

var Test = require('substance-test');
var registerTest = Test.registerTest;
var StoreTest = require("./store_test");

var impl = {
  setup: function() {
    this.store = new LocalStore("test:localstore");
    this.store.clear();
  },
  actions: []
};

if (global.localStorage) {
  registerTest(["Substance.Store", "LocalStore"], new StoreTest(impl));
}

},{"../index":188,"./store_test":195,"substance-test":198}],194:[function(require,module,exports){
"use strict";

var Store = require("../index");
var Test = require('substance-test');
var registerTest = Test.registerTest;
var StoreTest = require("./store_test");

var impl = {
  setup: function() {
    this.store = new Store.MemoryStore();
  }
};

registerTest(["Substance.Store", "MemoryStore"], new StoreTest(impl));

},{"../index":188,"./store_test":195,"substance-test":198}],195:[function(require,module,exports){
"use strict";

var _ = require("underscore");
var Test = require("substance-test");
var assert = Test.assert;

function StoreTest(impl) {
  _.extend(this, impl);

  this.actions = [

    "Create Hash", function() {
      this.hash = this.store.hash("hash1");
      assert.isArrayEqual([], this.hash.keys());
    },

    "Set", function() {
      this.hash.set("foo", "bar");

      assert.isEqual("bar", this.hash.get("foo"));
      assert.isTrue(this.hash.contains("foo"));
      assert.isArrayEqual(["foo"], this.hash.keys());
    },

    "Delete", function() {
      this.hash.delete("foo");

      assert.isFalse(this.hash.contains("foo"));
      assert.isArrayEqual([], this.hash.keys());
      assert.isUndefined(this.hash.get("foo"));
    },

    "Clear", function() {
      this.hash.set("a", 1);
      this.hash.set("b", 2);
      this.hash.set("c", 3);

      this.hash.clear();
      assert.isArrayEqual([], this.hash.keys());
      assert.isUndefined(this.hash.get("a"));
      assert.isUndefined(this.hash.get("b"));
      assert.isUndefined(this.hash.get("c"));
    },
  ];
}

module.exports = StoreTest;

},{"substance-test":198,"underscore":212}],196:[function(require,module,exports){
"use strict";

var Surface = require("./src/surface");

module.exports = Surface;

},{"./src/surface":197}],197:[function(require,module,exports){
"use strict";

var _ = require("underscore");
var View = require("substance-application").View;
var util = require("substance-util");
var Commander = require("substance-commander");

// Substance.Surface
// ==========================================================================

var Surface = function(doc, options) {

  options = _.extend({
    editable: true
  }, options);

  View.call(this);
  var that = this;

  this.options = options;

  if (this.options.renderer) {
    this.renderer = this.options.renderer;
  } else {
    this.renderer = new doc.__document.constructor.Renderer(doc);
  }

  // Incoming events
  this.doc = doc;

  // Pull out the registered nodetypes on the written article
  this.nodeTypes = doc.__document.nodeTypes;

  this.listenTo(this.doc.selection,  "selection:changed", this.renderSelection);
  this.listenTo(this.doc.__document, "property:updated", this.onUpdateView);
  this.listenTo(this.doc.__document, "graph:reset", this.reset);

  // Start building the initial stuff
  this.build();

  this.$el.addClass('surface');

  // Shouldn't this be done outside?
  this.$el.addClass(this.doc.view);

  // The editable surface responds to selection changes

  if (options.editable) {

    this.el.setAttribute("contenteditable", "true");
    this.el.spellcheck = false;

    this.$el.mouseup(function(e) {
      this.ignoreNextSelection = true;
      this.updateSelection(e);
    }.bind(this));

    this.$el.delegate('img', 'click', function(e) {
      var $el = $(e.currentTarget).parent().parent().parent();
      var nodeId = $el.attr('id');
      that.doc.selection.selectNode(nodeId);
      return false;
    });

    this._dirt = [];

    this._onKeyDown = function() {
      this._dirtPossible = true;
    }.bind(this);

    this._onTextInput = function(e) {
      //console.log("textinput", e);
      this._dirtPossible = false;
      while (this._dirt.length > 0) {
        var dirt = this._dirt.shift();
        dirt[0].textContent = dirt[1];
      }
      this.doc.write(e.data);
      e.preventDefault();
    }.bind(this);

    var _manipulate = function(f, dontPrevent) {
      return function(e) {
        that._dirtPossible = false;
        setTimeout(f, 0);
        if (dontPrevent !== true) {
          e.preventDefault();
        }
      };
    };

    // TODO: many combinations which would probably be easy to handle
    // using the native event...
    this.keyboard = new Commander.Mousetrap();
    this.keyboard.bind([
        "up", "down", "left", "right",
        "shift+up", "shift+down", "shift+left", "shift+right",
        "ctrl+up", "ctrl+down", "ctrl+left", "ctrl+right",
        "ctrl+shift+up", "ctrl+shift+down", "ctrl+shift+left", "ctrl+shift+right",
        "alt+up", "alt+down", "alt+left", "alt+right"
      ], function() {
      // call this after the movement has been done by the contenteditable
      setTimeout(function() {
        that.ignoreNextSelection = true;
        that.updateSelection();
      }, 0);
    }, "keydown");

    this.keyboard.bind(["backspace"], _manipulate(function() {
      that.doc.delete("left");
    }), "keydown");

    this.keyboard.bind(["del"], _manipulate(function() {
      that.doc.delete("right");
    }), "keydown");

    this.keyboard.bind(["enter"], _manipulate(function() {
      that.doc.modifyNode();
    }), "keydown");

    this.keyboard.bind(["shift+enter"], _manipulate(function() {
      that.doc.write("\n");
    }), "keydown");

    this.keyboard.bind(["space"], _manipulate(function() {
      that.doc.write(" ");
    }), "keydown");

    this.keyboard.bind(["tab"], _manipulate(function() {
      that.doc.write("  ");
    }), "keydown");

    this.keyboard.bind(["ctrl+z"], _manipulate(function() {
      that.doc.undo();
    }), "keydown");

    this.keyboard.bind(["ctrl+shift+z"], _manipulate(function() {
      that.doc.redo();
    }), "keydown");

    this.makeEditable(this.el);
  }
};


Surface.Prototype = function() {

  // Private helpers
  // ---------------
  var _findNodeElement = function(node) {
    var current = node;
    while(current !== undefined) {
      if ($(current).is(".content-node")) {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  };

  this.makeEditable = function(el) {
    var that = this;

    el.addEventListener("keydown", this._onKeyDown);

    // TODO: cleanup... Firefix needs a different event...
    el.addEventListener("textInput", this._onTextInput, true);
    el.addEventListener("input", this._onTextInput, true);

    this._dirt = [];
    this._observer = new MutationObserver(function(mutations) {
      mutations.forEach(function(mutation) {
        if (that._dirtPossible) {
          that._dirt.push([mutation.target, mutation.oldValue]);
        }
      });
    });
    // configuration of the observer:
    var config = { subtree: true, characterData: true, characterDataOldValue: true };
    this._observer.observe(el, config);

    this.keyboard.connect(el);
  };

  // Read out current DOM selection and update selection in the model
  // ---------------

  this.updateSelection = function(/*e*/) {
    // console.log("Surface.updateSelection()");
    var wSel = window.getSelection();

    // HACK: sometimes it happens that the selection anchor node is undefined.
    // Try to understand and fix someday.
    if (wSel.anchorNode === null) {
      return;
    }

    // Set selection to the cursor if clicked on the cursor.
    if ($(wSel.anchorNode.parentElement).is(".cursor")) {
      this.doc.selection.collapse("cursor");
      return;
    }

    var wRange = wSel.getRangeAt(0);
    var wStartPos;
    var wEndPos;

    // Preparing information for EOL-HACK (see below).
    // The hack only needs to be applied of the mouse event is in a different 'line'
    // than the DOM Range provided by the browser
    //Surface.Hacks.prepareEndOfLineHack.call(this, e, wRange);

    // Note: there are three different cases:
    // 1. selection started at startContainer (regular)
    // 2. selection started at endContainer (reverse)
    // 3. selection done via double click (anchor in different to range boundaries)
    // In cases 1. + 3. the range is used as given, in case 2. reversed.

    wStartPos = [wRange.startContainer, wRange.startOffset];
    wEndPos = [wRange.endContainer, wRange.endOffset];

    if (wRange.endContainer === wSel.anchorNode && wRange.endOffset === wSel.anchorOffset) {
      var tmp = wStartPos;
      wStartPos = wEndPos;
      wEndPos = tmp;
    }

    var startNode = _findNodeElement.call(this, wStartPos[0]);
    var endNode = _findNodeElement.call(this, wEndPos[0]);

    var startNodeId = startNode.getAttribute("id");
    var startNodePos = this.doc.getPosition(startNodeId) ;
    var startCharPos = this.nodes[startNodeId].getCharPosition(wStartPos[0], wStartPos[1]);

    var endNodeId = endNode.getAttribute("id");
    var endNodePos = this.doc.getPosition(endNodeId);
    var endCharPos = this.nodes[endNodeId].getCharPosition(wEndPos[0], wEndPos[1]);

    // the selection range in Document.Selection coordinates
    var startPos = [startNodePos, startCharPos];
    var endPos = [endNodePos, endCharPos];

    this.doc.selection.set({start: startPos, end: endPos});
  };


  // Renders the current selection
  // --------
  //

  this.renderSelection = function() {

    if (this.ignoreNextSelection === true) {
      this.ignoreNextSelection = false;
      return;
    }

    if (this.doc.selection.isNull()) {
      this.$cursor.hide();
      return;
    }

    // Hide native selection in favor of our custom one
    var wSel = window.getSelection();

    var range = this.doc.selection.range();
    var startNode = this.doc.getNodeFromPosition(range.start[0]);
    var startNodeView = this.renderer.nodes[startNode.id];
    var wStartPos = startNodeView.getDOMPosition(range.start[1]);

    var endNode = this.doc.getNodeFromPosition(range.end[0]);
    var endNodeView = this.renderer.nodes[endNode.id];
    var wEndPos = endNodeView.getDOMPosition(range.end[1]);

    var wRange = document.createRange();
    wRange.setStart(wStartPos.startContainer, wStartPos.startOffset);
    wRange.setEnd(wEndPos.endContainer, wEndPos.endOffset);
    wSel.removeAllRanges();
    wSel.addRange(wRange);

  };

  // Setup
  // --------
  //

  this.build = function() {
    // var Renderer = this.options.renderer || this.doc.__document.constructor.Renderer;
    // var renderer = this.options.renderer:
    // Create a Renderer instance, which implicitly constructs all content node views.
    // this.renderer = new Renderer(this.doc);

    // Add some backward compatibility
    this.nodes = this.renderer.nodes;
  };

  // Render it
  // --------
  //
  // input.image-files
  // .controls
  // .nodes
  //   .content-node.paragraph
  //   .content-node.heading
  //   ...
  // .cursor

  this.render = function() {

    var fileInput = document.createElement('input');
    fileInput.className = "image-files";
    fileInput.setAttribute("type", "file");

    fileInput.setAttribute("name", "files[]");

    var controls = document.createElement('div');
    controls.className = "controls";
    var nodes = document.createElement('div');
    nodes.className = "nodes";

    var cursor = document.createElement('div');
    cursor.className = "cursor";

    this.el.appendChild(fileInput);
    this.el.appendChild(controls);
    this.el.appendChild(nodes);
    this.el.appendChild(cursor);

    // console.log("Surface.render()", "this.doc.getNodes()", nodes);

    // Actual content goes here
    // --------
    //
    // We get back a document fragment from the renderer

    nodes.appendChild(this.renderer.render());

    // TODO: fixme
    this.$('input.image-files').hide();
    this.$cursor = this.$('.cursor');
    this.$cursor.hide();

    // keep the nodes for later access
    this._nodesEl = nodes;

    return this;
  };

  this.reset = function() {
    _.each(this.nodes, function(nodeView) {
      nodeView.dispose();
    });
    this.build();
    this.render();
  };

  // Cleanup view before removing it
  // --------
  //

  this.dispose = function() {
    this.stopListening();
    _.each(this.nodes, function(n) {
      n.dispose();
    }, this);
  };

  // TODO: we could factor this out into something like a ContainerView?

  function insertOrAppend(container, pos, el) {
    var childs = container.childNodes;
    if (pos < childs.length) {
      var refNode = childs[pos];
      container.insertBefore(el, refNode);
    } else {
      container.appendChild(el);
    }
  }

  this.onUpdateView = function(path, diff) {
    if (path.length !== 2 || path[0] !== "content" || path[1] !== "nodes") return;

    var nodeId, node;
    var container = this._nodesEl;

    var children, el;

    if (diff.isInsert()) {
      // Create a view and insert render it into the nodes container element.
      nodeId = diff.val;
      node = this.doc.get(nodeId);
      // TODO: this will hopefully be solved in a clean way
      // when we have done the 'renderer' refactorings
      if (this.nodeTypes[node.type]) {
        var nodeView = this.renderer.createView(node);
        this.nodes[nodeId] = nodeView;
        el = nodeView.render().el;
        insertOrAppend(container, diff.pos, el);
      }
    }
    else if (diff.isDelete()) {
      // Dispose the view and remove its element from the nodes container
      nodeId = diff.val;
      if (this.nodes[nodeId]) {
        this.nodes[nodeId].dispose();
      }
      delete this.nodes[nodeId];
      children = container.children;
      container.removeChild(children[diff.pos]);
    }
    else if (diff.isMove()) {
      children = container.children;
      el = children[diff.pos];
      container.removeChild(el);
      insertOrAppend(container, diff.target, el);
    } else if (diff.type === "NOP") {
    } else {
      throw new Error("Illegal state.");
    }
  };
};

_.extend(Surface.Prototype, util.Events.Listener);

Surface.Prototype.prototype = View.prototype;
Surface.prototype = new Surface.Prototype();

module.exports = Surface;

},{"substance-application":61,"substance-commander":90,"substance-util":207,"underscore":212}],198:[function(require,module,exports){
"use strict";

var Test = require('./src/test');
Test.assert = require('./src/assert');
Test.Runner = require('./src/controllers/test_runner');
Test.MochaRunner = require('./src/controllers/mocha_test_runner');
Test.TestCenter = require('./src/views/test_center');
Test.TestReport = require('./src/views/test_report');

module.exports = Test;

},{"./src/assert":199,"./src/controllers/mocha_test_runner":200,"./src/controllers/test_runner":201,"./src/test":202,"./src/views/test_center":203,"./src/views/test_report":204}],199:[function(require,module,exports){
"use strict";

var _ = require('underscore');
var errors = require('substance-util').errors;

var assert = {};

assert.AssertionError = errors.define("AssertionError", -1);

var _assert = function(assertion, msg, cb) {
  if (!assertion) {
    var exc = new assert.AssertionError(msg);
    if (cb) cb(msg);
    throw exc;
  }
};

assert.fail = function(msg, cb) {
  var exc = new assert.AssertionError(msg);
  if (cb) cb(msg);
  throw exc;
};

assert.exception = function(clazz, func, that) {

  if (arguments.length == 1) {
    func = clazz;
    clazz = undefined;
    that = undefined;
  } else if (arguments.length == 2) {
    if (!_.isFunction(arguments[1])) {
      that = func;
      func = clazz;
      clazz = undefined;
    }
  }

  var thrown = false;
  var typeOk = clazz ? false : true;

  var err;
  try {
    func.call(that);
  } catch (_err) {
    err = _err;
    thrown = true;
    if (clazz && err instanceof clazz) typeOk = true;
  }
  if (thrown && typeOk) return;
  if(thrown) {
    console.log(err.toString());
    assert.fail("Assertion failed. Caught exception of wrong type in "+func.toString());
  }
  assert.fail("Assertion failed. Expected an exception in "+func.toString());
};

assert.equal = function(expected, actual, cb) {
  var msg = "Assertion failed. Expected="+expected+", actual="+actual;
  _assert(expected === actual, msg, cb);
};

assert.isEqual = assert.equal;

assert.isTrue = function(stmt, cb) {
  assert.equal(true, stmt, cb);
};

assert.isFalse = function(stmt, cb) {
  assert.equal(false, stmt, cb);
};

assert.isNull = function(obj, cb) {
  assert.equal(null, obj, cb);
};

assert.notNull = function(obj, cb) {
  _assert(null !== obj, "Assertion failed. Actual value is null.", cb);
};

assert.isDefined = function(obj, cb) {
  _assert(undefined !== obj, "Assertion failed. Actual value is undefined.", cb);
};

assert.isUndefined = function(obj, cb) {
  assert.equal(undefined, obj, cb);
};

assert.isArrayEqual = function(expected, actual) {
  var msg = "Assertion failed. Expected="+JSON.stringify(expected)+", actual="+JSON.stringify(actual);
  if (expected === actual) return;

  // false when only one is null or undefined
  if ((!expected || !actual) ||
    (expected.length !== actual.length)) assert.fail(msg);

  for (var idx=0; idx < expected.length; idx++) {
    if (expected[idx] !== actual[idx]) assert.fail(msg);
  }
};

assert.isDeepEqual = function(expected, actual) {
  var msg = "Assertion failed. Expected="+JSON.stringify(expected, null, 2)+"\n, actual="+JSON.stringify(actual, null, 2);
  if (_.isEqual(expected, actual)) return;
  else assert.fail(msg);
};

assert.isObjectEqual = assert.isDeepEqual;

module.exports = assert;

},{"substance-util":207,"underscore":212}],200:[function(require,module,exports){
"use strict";

var _ = require('underscore');
var util = require('substance-util');
var TestRunner = require('./test_runner')

var MochaTestRunner = function() {
  TestRunner.call(this);

  // runs a given substance test in vows
  var runTest = function(test) {
    describe(test.path.join("/"), function() {
      describe(test.name, function() {
        it("Setup", test.setup.bind(test));
        for (var idx = 0; idx < test.actions.length; idx++) {
          var action = test.actions[idx];
          it(action.label, action.func.bind(test));
        }
      });
    });
  };

  this.run = function() {
    _.each(this.tests, function(test) {
      runTest(test);
    }, this);
  };

};

module.exports = MochaTestRunner;

},{"./test_runner":201,"substance-util":207,"underscore":212}],201:[function(require,module,exports){
"use strict";

var _ = require('underscore');
var util = require('substance-util');
var Test = require('../test');

// Expands the actions into a unified format.
// --------
//
// For convenienve, tests maybe be declared in a simpler format.

var compileActions = function(testSpec) {

  // console.log("expand actions...");
  var actions = [];
  var action = null;

  function action_template() {
    return {
      'label': "unknown",
      'func': null
    };
  }

  function complete_action() {
     actions.push(action);
     action = action_template();
  }

  action = action_template();

  _.each(testSpec.actions, function(elem) {
    var objType = Object.prototype.toString.call(elem);
    // actions can be declared in a declarative way in as a sequence of
    // functions (=actions) separated by strings which are used
    // as labels or to specify the platform
    if(objType === '[object String]') {
      action.label = elem;
    }
    // alternatively, only the action body can be given
    else if (objType === '[object Function]') {
      action.func = elem;
      complete_action();
    }
    // and also a direct version as object
    else {
      if (elem.func) action.func = elem.func;
      if (elem.label) action.label = elem.label;
      complete_action();
    }
  });

  return actions;
};

// Substance.Test.Runner
// ================================================
//

var TestRunner = function() {
  this.tests = {};

  // Collects test reports
  this.reports = {};

  // Prepare test based on a test specification
  // --------
  //

  var createTest = function(testSpec) {
    var test = new Test();

    // add everything from the testSpec
    _.extend(test, testSpec);

    // name, path, and actions have to be normalized

    // the last entry of the path is taken as name
    test.name = _.last(testSpec.path);
    test.path = testSpec.path.slice(0, testSpec.path.length-1);

    // A list of actions which will be executed in turn.
    // In test specs actions can be defined in a sparse/sloppy way.
    // They get expanded to a unified format automatically.
    test.actions = compileActions(testSpec);

    return test;
  };


  // Prepare test based on a test specification
  // --------
  //

  this.loadTests = function() {
    _.each(Test.testSpecs, function(testSpec) {
      var test = createTest(testSpec);
      this.tests[test.id] = test;
    }, this);
  };

  // Get Test Suites
  // --------
  //

  this.getTestSuites = function() {
    var suites = {};

    _.each(this.tests, function(test) {
      var suiteName = test.path[0];

      suites[suiteName] = suites[suiteName] || {
        name: suiteName,
        tests: []
      };
      suites[suiteName].tests.push(test);
    });

    return suites;
  };

  // suiteName is optional
  // --------
  //
  // TODO: currently only supports one suiteName

  this.runSuite = function(suiteName, cb) {
    var that = this;
    var suites = this.getTestSuites();
    var suite = suites[suiteName];

    if (suite === undefined) {
      return cb("Unknown testsuite: "+suiteName);
    }

    var report = {
      "name": suiteName,
      "tests": [],
    };

    var funcs = _.map(suite.tests, function(t) {
      return function(data, cb) {
        t.run(function(err, testResult) {
          report.tests.push({
            "name": t.name,
            "actions": testResult
          });
          if (err) {
            report.error = err;
          }
          cb(err);
        });
      }
    });

    util.async.sequential({
      functions: funcs,
      stopOnError: false
    }, function(err) {
      // console.log('ERROR?', err);
      that.reports[suiteName] = report;
      that.trigger('report:ready', suiteName, report);
      cb(err, report);
    });
  };

  this.loadTests();
};

TestRunner.prototype = util.Events;

module.exports = TestRunner;

},{"../test":202,"substance-util":207,"underscore":212}],202:[function(require,module,exports){
"use strict";

var _    = require('underscore');
var util   = require('substance-util');

var Test = function() {};

Test.Prototype = function() {

  this.run = function(cb) {
    var self = this;

    var report = [];

    this.setDelay = function(millis) {
      this.delay = millis;
    };

    function setup(cb) {

      try {
        console.log("## Setup");
        // asynchronous actions
        if (self.setup.length === 0) {
          self.setup();
          cb(null);
        } else {
          self.setup(cb);
        }
      } catch(err) {
        console.log("Caught error during setup:", err);
        util.printStackTrace(err, 1);
        cb(err);
      }
    }

    function runActions(cb) {
      var options = {
        items: self.actions,
        stopOnError: false,
        iterator: function(action, cb) {
          var reportItem = {
            label: action.label,
            sourcecode: action.func.toString(),
            duration: 0
          };
          try {
            // console.log("## Action:", action.label);
            // asynchronous actions
            if (action.func.length === 0) {
              var start = Date.now();
              action.func.call(self);
              reportItem.duration = Date.now() - start;
              self.trigger('action:success', null, action);
              report.push(reportItem);

              if (self.delay !== undefined) {
                _.delay(cb, self.delay, null);
              } else {
                cb(null);
              }

            } else {
              var start = Date.now();
              action.func.call(self, function(err, data) {
                reportItem.duration = Date.now() - start;
                if (err) {
                  console.error(err.toString());
                  util.printStackTrace(err);
                  self.trigger('action:error', err, action);
                  reportItem.error = err;
                } else {
                  self.trigger('action:success', null, action);
                }
                report.push(reportItem);

                if (self.delay) {
                  _.delay(cb, self.delay, err, data);
                } else {
                  cb(err, data);
                }

              });
            }
          } catch(err) {
            console.error(err.name+":", err.message);
            util.printStackTrace(err);
            self.trigger('action:error', err, action);
            reportItem.error = err;
            report.push(reportItem);
            cb(err);
          }
        }
      };

      util.async.each(options, cb);
    }

    function finish(cb) {
      console.log("# Finished Test: ", self.name);
      cb(null);
    }

    console.log("# Test:", self.path.join("/"),"/", self.name);
    var options = {
      functions: [setup, runActions, finish],
      finally: function(err) {
        self.tearDown();
        cb(err, report);
      }
    };
    if (cb === undefined) {
      cb = function(err) {
        if (err) console.log(err, report);
      };
    }
    util.async.sequential(options, cb);
  };

  // a stub setup function called before running test action
  this.setup = function() {};

  this.tearDown = function() {};
};

Test.prototype = _.extend(new Test.Prototype(), util.Events);


// Global Test Registry
// --------
//
// Raw tests will be stored here.

Test.testSpecs = Test.testSpecs || {};

// Normalize path to get a proper id
// --------
//

var pathToId = function(path) {
  var id = path.join("_");
  id = id.replace(/[:@/()]/g, "").replace(/\s/g, "_");
  return id;
};

Test.registerTest = function(path, testSpec) {
  var id = pathToId(path);
  testSpec.id = id;
  testSpec.path = path;
  Test.testSpecs[id] = testSpec;
};


module.exports = Test;

},{"substance-util":207,"underscore":212}],203:[function(require,module,exports){
"use strict";

var Application = require("substance-application");
var util = require("substance-util");
var TestReport = require("./test_report");
var View = Application.View;
var html = util.html;
var _ = require("underscore");

// DOM Constructor

var $$ = Application.$$;



// Takes a data piece and renders the DOM necessary for the TestCenter
// ==========================================================================


var Renderer = function(data) {
  var fragment = document.createDocumentFragment();

  var testSuites = $$('.test-suites', {
    children: _.map(data.test_suites, function(ts) {
      return $$('a.test-suite.'+ts.name, {
        "sbs-click": "showReport("+ts.name+")",
        "href": "#tests/"+ts.name,
        "text": ts.name,
        "children": [ $$('.status') ]
      })
    })
  });

  fragment.appendChild(testSuites);
  fragment.appendChild($$('.test-report'));
  fragment.appendChild($$('.test-output'));
  return fragment;
};



// Substance.TestCenter
// ==========================================================================

var TestCenter = function(testRunner, options) {
  View.call(this);

  this.testRunner = testRunner;

  // Test reports are collected here
  this.reports = {};

  this.$el.addClass('test-center');

  this.testSuites = this.testRunner.getTestSuites();

  // Set requested report or use the first one
  this.currentReport = options.report || _.pluck(this.testSuites, 'name')[0];

  // For outgoing events
  this.listenTo(this.testRunner, 'report:ready', this.onReportReady);
};

TestCenter.Prototype = function() {

  // Show a particular report
  // --------
  //

  this.showReport = function(name) {
    var report = this.reports[name];
    var that = this;
    if (report) {
      this.currentReport = report;
      if (this.reportView) this.reportView.dispose();
      this.reportView = new TestReport(report);
      this.$('.test-report').html(this.reportView.render().el);

      // Set active flag
      this.$('.test-suite').removeClass('active');
      this.$('.test-suite.'+name).addClass('active');

    } else {
      this.currentReport = name;
      that.testRunner.runSuite(name, function(err, report) {
        if (err) console.log(err.stack);
      });
    }
  };

  // Received report
  // --------
  //

  this.onReportReady = function(suiteName, report) {
    this.reports[suiteName] = report;
    this.registerReport(report);

    if (this.currentReport === suiteName) {
      this.showReport(suiteName);
    }
  };

  // Registers a report
  // --------
  //
  // onReportReady

  this.registerReport = function(report) {
    this.$('.test-suite.'+report.name+' .status').addClass(report.error ? "error" : "success");
  };

  // Render it
  // --------
  //

  this.render = function() {
    this.el.appendChild(new Renderer({"test_suites": this.testSuites}));
    return this;
  };

  this.dispose = function() {
    this.stopListening();
  };
};

TestCenter.Prototype.prototype = View.prototype;
TestCenter.prototype = new TestCenter.Prototype();

module.exports = TestCenter;

},{"./test_report":204,"substance-application":61,"substance-util":207,"underscore":212}],204:[function(require,module,exports){
"use strict";

var app = require("substance-application");
var util = require("substance-util");
var View = app.View;
var Application = require("substance-application");
var html = util.html;
var _ = require("underscore");

var $$ = Application.$$;

var Renderer = function(data) {


  // A lil template helper
  // --------

  function actions(actions) {
    return _.map(actions, function(a, index) {

      var childs = [];

      if (a.error) {
        childs.push($$('.error-message', {text: a.error.message }));
        childs.push($$('.error-source', {children: [$$('pre', {text: a.sourcecode})]}));
        childs.push($$('.stack-trace', {children: [$$('pre', {text: a.error.stack})]}));
      }

      childs.push($$('.duration', {text: a.duration+" ms"}));

      // Return the container + content
      return $$('div.action.'+( a.error ? 'error' : 'success'), {
        text: [index, a.label].join(' '),
        children: childs
      });
    })
  }

  var tests = $$('.tests', {
    children: _.map(data.tests, function(test) {
      return $$('.test', {
        children: [
          $$('.div.name', { text: test.name }),
          $$('.actions', {
            children: actions(test.actions)
          })
        ]
      })
    })
  });

  var frag = document.createDocumentFragment();
  frag.appendChild($$('.border-right'));
  frag.appendChild($$('h2', {text: data.name}));
  frag.appendChild(tests);

  return frag;
}


// Substance.TestReport
// ==========================================================================

var TestReport = function(report) {
  View.call(this);
  this.report = report;
};

TestReport.Prototype = function() {

  // Render it
  // --------

  this.render = function() {
    this.el.appendChild(new Renderer(this.report));
    return this;
  };

  this.dispose = function() {
    this.stopListening();
  };
};

TestReport.Prototype.prototype = View.prototype;
TestReport.prototype = new TestReport.Prototype();

module.exports = TestReport;

},{"substance-application":61,"substance-util":207,"underscore":212}],205:[function(require,module,exports){
"use strict";

var TOC = require("./toc_view");

module.exports = TOC;
},{"./toc_view":206}],206:[function(require,module,exports){
"use strict";

var View = require("substance-application").View;
var $$ = require("substance-application").$$;
var Data = require("substance-data");
var Index = Data.Graph.Index;
var _ = require("underscore");

// Substance.TOC.View
// ==========================================================================

var TOCView = function(doc) {
  View.call(this);
  this.doc = doc;

  // Sniff into headings
  // --------
  // 

  this.headings = _.filter(this.doc.content.getNodes(), function(node) {
    return node.type === "heading";
  });

  this.$el.addClass("toc");
};

TOCView.Prototype = function() {

  // Renderer
  // --------

  this.render = function() {
    if (this.headings.length <= 2) return this;
    _.each(this.headings, function(heading) {
      this.el.appendChild($$('a.heading-ref.level-'+heading.level, {
        id: "toc_"+heading.id,
        text: heading.content,
        "sbs-click": "jumpToNode("+heading.id+")"
      }));
    }, this);

    return this;
  };

  // Renderer
  // --------
  // 

  this.setActiveNode = function(nodeId) {
    this.$('.heading-ref.active').removeClass('active');
    this.$('#toc_'+nodeId).addClass('active');
  };

};

TOCView.Prototype.prototype = View.prototype;
TOCView.prototype = new TOCView.Prototype();

module.exports = TOCView;

},{"substance-application":61,"substance-data":94,"underscore":212}],207:[function(require,module,exports){
"use strict";

var util = require("./src/util");

util.errors = require("./src/errors");
util.html = require("./src/html");
util.dom = require("./src/dom");

module.exports = util;

},{"./src/dom":208,"./src/errors":209,"./src/html":210,"./src/util":211}],208:[function(require,module,exports){
"use strict";

var _ = require("underscore");

// Helpers for working with the DOM

var dom = {};

dom.ChildNodeIterator = function(arg) {
  if(_.isArray(arg)) {
    this.nodes = arg;
  } else {
    this.nodes = arg.childNodes;
  }
  this.length = this.nodes.length;
  this.pos = -1;
};

dom.ChildNodeIterator.prototype = {
  hasNext: function() {
    return this.pos < this.length - 1;
  },

  next: function() {
    this.pos += 1;
    return this.nodes[this.pos];
  },

  back: function() {
    this.pos -= 1;
    return this;
  }
};

// Note: it is not safe regarding browser in-compatibilities
// to access el.children directly.
dom.getChildren = function(el) {
  if (el.children !== undefined) return el.children;
  var children = [];
  var child = el.firstElementChild;
  while (child) {
    children.push(child);
    child = child.nextElementSibling;
  }
  return children;
};

dom.getNodeType = function(el) {
  if (el.nodeType === Node.TEXT_NODE) {
    return "text";
  } else if (el.nodeType === Node.COMMENT_NODE) {
    return "comment";
  } else if (el.tagName) {
    return el.tagName.toLowerCase();
  } else {
    throw new Error("Unknown node type");
  }
};

module.exports = dom;

},{"underscore":212}],209:[function(require,module,exports){
"use strict";

// Imports
// ====

var _ = require('underscore');
var util = require('./util');

// Module
// ====

var errors = {};

errors.SubstanceError = function(name, code, message) {
  if (arguments.length == 1) {
    message = name;
    name = "SubstanceError";
    code = -1;
  }

  this.message = message;
  this.name = name;
  this.code = code;

  this.__stack = util.callstack(1);
};

errors.SubstanceError.Prototype = function() {

  this.toString = function() {
    return this.name+":"+this.message;
  };

  this.toJSON = function() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      stack: this.stack
    };
  };

  this.printStackTrace = function() {
    util.printStackTrace(this);
  };

};
errors.SubstanceError.prototype = new errors.SubstanceError.Prototype();

Object.defineProperty(errors.SubstanceError.prototype, "stack", {
  get: function() {
    var str = [];
    for (var idx = 0; idx < this.__stack.length; idx++) {
      var s = this.__stack[idx];
      str.push(s.file+":"+s.line+":"+s.col+" ("+s.func+")");
    }
    return str.join("\n");
  },
  set: function() { throw new Error("immutable.")}
});

errors.define = function(className, code) {
  if (code === undefined) code = -1;
  errors[className] = errors.SubstanceError.bind(null, className, code);
  errors[className].prototype = errors.SubstanceError.prototype;
  return errors[className];
};

module.exports = errors;

},{"./util":211,"underscore":212}],210:[function(require,module,exports){
"use strict";

var html = {};
var _ = require("underscore");

html.templates = {};

// html.compileTemplate = function(tplName) {
//   var rawTemplate = $('script[name='+tplName+']').html();
//   html.templates[tplName] = Handlebars.compile(rawTemplate);
// };

html.renderTemplate = function(tplName, data) {
  return html.templates[tplName](data);
};

// Handlebars.registerHelper('ifelse', function(cond, textIf, textElse) {
//   textIf = Handlebars.Utils.escapeExpression(textIf);
//   textElse  = Handlebars.Utils.escapeExpression(textElse);
//   return new Handlebars.SafeString(cond ? textIf : textElse);
// });

if (typeof window !== "undefined") {
  // A fake console to calm down some browsers.
  if (!window.console) {
    window.console = {
      log: function(msg) {
        // No-op
      }
    };
  }
}

// Render Underscore templates
html.tpl = function (tpl, ctx) {
  ctx = ctx || {};
  var source = $('script[name='+tpl+']').html();
  return _.template(source, ctx);
};

// Exports
// ====

module.exports = html;

},{"underscore":212}],211:[function(require,module,exports){
"use strict";

// Imports
// ====

var _ = require('underscore');

// Module
// ====

var util = {};

// UUID Generator
// -----------------

/*!
Math.uuid.js (v1.4)
http://www.broofa.com
mailto:robert@broofa.com

Copyright (c) 2010 Robert Kieffer
Dual licensed under the MIT and GPL licenses.
*/

util.uuid = function (prefix, len) {
  var chars = '0123456789abcdefghijklmnopqrstuvwxyz'.split(''),
      uuid = [],
      radix = 16,
      idx;
  len = len || 32;

  if (len) {
    // Compact form
    for (idx = 0; idx < len; idx++) uuid[idx] = chars[0 | Math.random()*radix];
  } else {
    // rfc4122, version 4 form
    var r;

    // rfc4122 requires these characters
    uuid[8] = uuid[13] = uuid[18] = uuid[23] = '-';
    uuid[14] = '4';

    // Fill in random data.  At i==19 set the high bits of clock sequence as
    // per rfc4122, sec. 4.1.5
    for (idx = 0; idx < 36; idx++) {
      if (!uuid[idx]) {
        r = 0 | Math.random()*16;
        uuid[idx] = chars[(idx == 19) ? (r & 0x3) | 0x8 : r];
      }
    }
  }
  return (prefix ? prefix : "") + uuid.join('');
};

// creates a uuid function that generates counting uuids
util.uuidGen = function(defaultPrefix) {
  var id = 1;
  defaultPrefix = (defaultPrefix !== undefined) ? defaultPrefix : "uuid_";
  return function(prefix) {
    prefix = prefix || defaultPrefix;
    return prefix+(id++);
  };
};


// Events
// ---------------

// Taken from Backbone.js
//
// A module that can be mixed in to *any object* in order to provide it with
// custom events. You may bind with `on` or remove with `off` callback
// functions to an event; `trigger`-ing an event fires all callbacks in
// succession.
//
//     var object = {};
//     _.extend(object, util.Events);
//     object.on('expand', function(){ alert('expanded'); });
//     object.trigger('expand');
//

// A difficult-to-believe, but optimized internal dispatch function for
// triggering events. Tries to keep the usual cases speedy (most internal
// Backbone events have 3 arguments).
var triggerEvents = function(events, args) {
  var ev, i = -1, l = events.length, a1 = args[0], a2 = args[1], a3 = args[2];
  switch (args.length) {
    case 0: while (++i < l) (ev = events[i]).callback.call(ev.ctx); return;
    case 1: while (++i < l) (ev = events[i]).callback.call(ev.ctx, a1); return;
    case 2: while (++i < l) (ev = events[i]).callback.call(ev.ctx, a1, a2); return;
    case 3: while (++i < l) (ev = events[i]).callback.call(ev.ctx, a1, a2, a3); return;
    default: while (++i < l) (ev = events[i]).callback.apply(ev.ctx, args);
  }
};

// Regular expression used to split event strings.
var eventSplitter = /\s+/;

// Implement fancy features of the Events API such as multiple event
// names `"change blur"` and jQuery-style event maps `{change: action}`
// in terms of the existing API.
var eventsApi = function(obj, action, name, rest) {
  if (!name) return true;

  // Handle event maps.
  if (typeof name === 'object') {
    for (var key in name) {
      obj[action].apply(obj, [key, name[key]].concat(rest));
    }
    return false;
  }

  // Handle space separated event names.
  if (eventSplitter.test(name)) {
    var names = name.split(eventSplitter);
    for (var i = 0, l = names.length; i < l; i++) {
      obj[action].apply(obj, [names[i]].concat(rest));
    }
    return false;
  }

  return true;
};

util.Events = {

  // Bind an event to a `callback` function. Passing `"all"` will bind
  // the callback to all events fired.
  on: function(name, callback, context) {
    if (!eventsApi(this, 'on', name, [callback, context]) || !callback) return this;
    this._events =  this._events || {};
    var events = this._events[name] || (this._events[name] = []);
    events.push({callback: callback, context: context, ctx: context || this});
    return this;
  },

  // Bind an event to only be triggered a single time. After the first time
  // the callback is invoked, it will be removed.
  once: function(name, callback, context) {
    if (!eventsApi(this, 'once', name, [callback, context]) || !callback) return this;
    var self = this;
    var once = _.once(function() {
      self.off(name, once);
      callback.apply(this, arguments);
    });
    once._callback = callback;
    return this.on(name, once, context);
  },

  // Remove one or many callbacks. If `context` is null, removes all
  // callbacks with that function. If `callback` is null, removes all
  // callbacks for the event. If `name` is null, removes all bound
  // callbacks for all events.
  off: function(name, callback, context) {
    var retain, ev, events, names, i, l, j, k;
    if (!this._events || !eventsApi(this, 'off', name, [callback, context])) return this;
    if (!name && !callback && !context) {
      this._events = {};
      return this;
    }

    names = name ? [name] : _.keys(this._events);
    for (i = 0, l = names.length; i < l; i++) {
      name = names[i];
      events = this._events[name];
      if (events) {
        this._events[name] = retain = [];
        if (callback || context) {
          for (j = 0, k = events.length; j < k; j++) {
            ev = events[j];
            if ((callback && callback !== ev.callback && callback !== ev.callback._callback) ||
                (context && context !== ev.context)) {
              retain.push(ev);
            }
          }
        }
        if (!retain.length) delete this._events[name];
      }
    }

    return this;
  },

  // Trigger one or many events, firing all bound callbacks. Callbacks are
  // passed the same arguments as `trigger` is, apart from the event name
  // (unless you're listening on `"all"`, which will cause your callback to
  // receive the true name of the event as the first argument).
  trigger: function(name) {
    if (!this._events) return this;
    var args = Array.prototype.slice.call(arguments, 1);
    if (!eventsApi(this, 'trigger', name, args)) return this;
    var events = this._events[name];
    var allEvents = this._events.all;
    if (events) triggerEvents(events, args);
    if (allEvents) triggerEvents(allEvents, arguments);
    return this;
  },

  triggerLater: function() {
    var self = this;
    var _arguments = arguments;
    setTimeout(function() {
      self.trigger.apply(self, _arguments);
    }, 0);
  },

  // Tell this object to stop listening to either specific events ... or
  // to every object it's currently listening to.
  stopListening: function(obj, name, callback) {
    var listeners = this._listeners;
    if (!listeners) return this;
    var deleteListener = !name && !callback;
    if (typeof name === 'object') callback = this;
    if (obj) (listeners = {})[obj._listenerId] = obj;
    for (var id in listeners) {
      listeners[id].off(name, callback, this);
      if (deleteListener) delete this._listeners[id];
    }
    return this;
  }

};

var listenMethods = {listenTo: 'on', listenToOnce: 'once'};

// Inversion-of-control versions of `on` and `once`. Tell *this* object to
// listen to an event in another object ... keeping track of what it's
// listening to.
_.each(listenMethods, function(implementation, method) {
  util.Events[method] = function(obj, name, callback) {
    var listeners = this._listeners || (this._listeners = {});
    var id = obj._listenerId || (obj._listenerId = _.uniqueId('l'));
    listeners[id] = obj;
    if (typeof name === 'object') callback = this;
    obj[implementation](name, callback, this);
    return this;
  };
});

// Aliases for backwards compatibility.
util.Events.bind   = util.Events.on;
util.Events.unbind = util.Events.off;

util.Events.Listener = {

  listenTo: function(obj, name, callback) {
    if (!_.isFunction(callback)) {
      throw new Error("Illegal argument: expecting function as callback, was: " + callback);
    }

    // initialize container for keeping handlers to unbind later
    this._handlers = this._handlers || [];

    obj.on(name, callback, this);

    this._handlers.push({
      unbind: function() {
        obj.off(name, callback);
      }
    });

    return this;
  },

  stopListening: function() {
    for (var i = 0; i < this._handlers.length; i++) {
      this._handlers[i].unbind();
    }
  }

};


var __once__ = _.once;

function callAsynchronousChain(options, cb) {
  var _finally = options.finally || function(err, data) { cb(err, data); };
  _finally = __once__(_finally);
  var data = options.data || {};
  var functions = options.functions;

  if (!_.isFunction(cb)) {
    return cb("Illegal arguments: a callback function must be provided");
  }

  var index = 0;
  var stopOnError = (options.stopOnError===undefined) ? true : options.stopOnError;
  var errors = [];

  function process(data) {
    var func = functions[index];

    // stop if no function is left
    if (!func) {
      if (errors.length > 0) {
        return _finally(new Error("Multiple errors occurred.", data));
      } else {
        return _finally(null, data);
      }
    }

    // A function that is used as call back for each function
    // which does the progression in the chain via recursion.
    // On errors the given callback will be called and recursion is stopped.
    var recursiveCallback = __once__(function(err, data) {
      // stop on error
      if (err) {
        if (stopOnError) {
          return _finally(err, null);
        } else {
          errors.push(err);
        }
      }

      index += 1;
      process(data);
    });

    // catch exceptions and propagat
    try {
      if (func.length === 1) {
        func(recursiveCallback);
      } else {
        func(data, recursiveCallback);
      }
    } catch (err) {
      console.log("util.async caught error:", err);
      util.printStackTrace(err);
      _finally(err);
    }
  }

  // start processing
  process(data);
}

// Async Control Flow for the Substance
// --------

// TODO: use util.async.sequential instead
util.async = {};

// Calls a given list of asynchronous functions sequentially
// -------------------
// options:
//    functions:  an array of functions of the form f(data,cb)
//    data:       data provided to the first function; optional
//    finally:    a function that will always be called at the end, also on errors; optional

util.async.sequential = function(options, cb) {
  // allow to call this with an array of functions instead of options
  if(_.isArray(options)) {
    options = { functions: options };
  }
  callAsynchronousChain(options, cb);
};

function asynchronousIterator(options) {
  return function(data, cb) {
    // retrieve items via selector if a selector function is given
    var items = options.selector ? options.selector(data) : options.items;
    var _finally = options.finally || function(err, data) { cb(err, data); };

    // don't do nothing if no items are given
    if (!items) return _finally(null, data);

    var isArray = _.isArray(items);

    if (options.before) {
      options.before(data);
    }

    var funcs = [];
    var iterator = options.iterator;

    // TODO: discuss convention for iterator function signatures.
    // trying to achieve a combination of underscore and node.js callback style
    function arrayFunction(item, index) {
      return function(data, cb) {
        if (iterator.length === 2) {
          iterator(item, cb);
        } else if (iterator.length === 3) {
          iterator(item, index, cb);
        } else {
          iterator(item, index, data, cb);
        }
      };
    }

    function objectFunction(value, key) {
      return function(data, cb) {
        if (iterator.length === 2) {
          iterator(value, cb);
        } else if (iterator.length === 3) {
          iterator(value, key, cb);
        } else {
          iterator(value, key, data, cb);
        }
      };
    }

    if (isArray) {
      for (var idx = 0; idx < items.length; idx++) {
        funcs.push(arrayFunction(items[idx], idx));
      }
    } else {
      for (var key in items) {
        funcs.push(objectFunction(items[key], key));
      }
    }

    //console.log("Iterator:", iterator, "Funcs:", funcs);
    var chainOptions = {
      functions: funcs,
      data: data,
      finally: _finally,
      stopOnError: options.stopOnError
    };
    callAsynchronousChain(chainOptions, cb);
  };
}

// Creates an each-iterator for util.async chains
// -----------
//
//     var func = util.async.each(items, function(item, [idx, [data,]] cb) { ... });
//     var func = util.async.each(options)
//
// options:
//    items:    the items to be iterated
//    selector: used to select items dynamically from the data provided by the previous function in the chain
//    before:   an extra function called before iteration
//    iterator: the iterator function (item, [idx, [data,]] cb)
//       with item: the iterated item,
//            data: the propagated data (optional)
//            cb:   the callback

// TODO: support only one version and add another function
util.async.iterator = function(options_or_items, iterator) {
  var options;
  if (arguments.length == 1) {
    options = options_or_items;
  } else {
    options = {
      items: options_or_items,
      iterator: iterator
    };
  }
  return asynchronousIterator(options);
};

util.async.each = function(options, cb) {
  // create the iterator and call instantly
  var f = asynchronousIterator(options);
  f(null, cb);
};

util.propagate = function(data, cb) {
  if(!_.isFunction(cb)) {
    throw "Illegal argument: provided callback is not a function";
  }
  return function(err) {
    if (err) return cb(err);
    cb(null, data);
  };
};

// shamelessly stolen from backbone.js:
// Helper function to correctly set up the prototype chain, for subclasses.
// Similar to `goog.inherits`, but uses a hash of prototype properties and
// class properties to be extended.
var ctor = function(){};
util.inherits = function(parent, protoProps, staticProps) {
  var child;

  // The constructor function for the new subclass is either defined by you
  // (the "constructor" property in your `extend` definition), or defaulted
  // by us to simply call the parent's constructor.
  if (protoProps && protoProps.hasOwnProperty('constructor')) {
    child = protoProps.constructor;
  } else {
    child = function(){ parent.apply(this, arguments); };
  }

  // Inherit class (static) properties from parent.
  _.extend(child, parent);

  // Set the prototype chain to inherit from `parent`, without calling
  // `parent`'s constructor function.
  ctor.prototype = parent.prototype;
  child.prototype = new ctor();

  // Add prototype properties (instance properties) to the subclass,
  // if supplied.
  if (protoProps) _.extend(child.prototype, protoProps);

  // Add static properties to the constructor function, if supplied.
  if (staticProps) _.extend(child, staticProps);

  // Correctly set child's `prototype.constructor`.
  child.prototype.constructor = child;

  // Set a convenience property in case the parent's prototype is needed later.
  child.__super__ = parent.prototype;

  return child;
};

// Util to read seed data from file system
// ----------

util.getJSON = function(resource, cb) {
  if (typeof exports !== 'undefined') {
    var fs = require('fs');
    var obj = JSON.parse(fs.readFileSync(resource, 'utf8'));
    cb(null, obj);
  } else {
    //console.log("util.getJSON", resource);
    $.getJSON(resource)
      .done(function(obj) { cb(null, obj); })
      .error(function(err) { cb(err, null); });
  }
};

util.prototype = function(that) {
  /*jshint proto: true*/ // supressing a warning about using deprecated __proto__.
  return Object.getPrototypeOf ? Object.getPrototypeOf(that) : that.__proto__;
};

util.inherit = function(Super, Self) {
  var super_proto = _.isFunction(Super) ? new Super() : Super;
  var proto;
  if (_.isFunction(Self)) {
    Self.prototype = super_proto;
    proto = new Self();
  } else {
    var TmpClass = function(){};
    TmpClass.prototype = super_proto;
    proto = _.extend(new TmpClass(), Self);
  }
  return proto;
};

util.pimpl = function(pimpl) {
  var Pimpl = function(self) {
    this.self = self;
  };
  Pimpl.prototype = pimpl;
  return function(self) { self = self || this; return new Pimpl(self); };
};

util.parseStackTrace = function(err) {
  var SAFARI_STACK_ELEM = /([^@]*)@(.*):(\d+)/;
  var CHROME_STACK_ELEM = /\s*at ([^(]*)[(](.*):(\d+):(\d+)[)]/;

  var idx;
  var stackTrace = err.stack.split('\n');

  // parse the stack trace: each line is a tuple (function, file, lineNumber)
  // Note: unfortunately this is interpreter specific
  // safari: "<function>@<file>:<lineNumber>"
  // chrome: "at <function>(<file>:<line>:<col>"

  var stack = [];
  for (idx = 0; idx < stackTrace.length; idx++) {
    var match = SAFARI_STACK_ELEM.exec(stackTrace[idx]);
    if (!match) match = CHROME_STACK_ELEM.exec(stackTrace[idx]);
    if (match) {
      var entry = {
        func: match[1],
        file: match[2],
        line: match[3],
        col: match[4] || 0
      };
      if (entry.func === "") entry.func = "<anonymous>";
      stack.push(entry);
    }
  }

  return stack;
};

util.callstack = function(k) {
  var err;
  try { throw new Error(); } catch (_err) { err = _err; }
  var stack = util.parseStackTrace(err);
  k = k || 0;
  return stack.splice(k+1);
};

util.stacktrace = function (err) {
  var stack = (arguments.length === 0) ? util.callstack().splice(1) : util.parseStackTrace(err);
  var str = [];
  _.each(stack, function(s) {
    str.push(s.file+":"+s.line+":"+s.col+" ("+s.func+")");
  });
  return str.join("\n");
};

util.printStackTrace = function(err, N) {
  if (!err.stack) return;

  var stack;

  // Substance errors have a nice stack already
  if (err.__stack !== undefined) {
    stack = err.__stack;
  }
  // built-in errors have the stack trace as one string
  else if (_.isString(err.stack)) {
    stack = util.parseStackTrace(err);
  }
  else return;

  N = N || stack.length;
  N = Math.min(N, stack.length);

  for (var idx = 0; idx < N; idx++) {
    var s = stack[idx];
    console.log(s.file+":"+s.line+":"+s.col, "("+s.func+")");
  }
};

// computes the difference of obj1 to obj2
util.diff = function(obj1, obj2) {
  var diff;
  if (_.isArray(obj1) && _.isArray(obj2)) {
    diff = _.difference(obj2, obj1);
    // return null in case of equality
    if (diff.length === 0) return null;
    else return diff;
  }
  if (_.isObject(obj1) && _.isObject(obj2)) {
    diff = {};
    _.each(Object.keys(obj2), function(key) {
      var d = util.diff(obj1[key], obj2[key]);
      if (d) diff[key] = d;
    });
    // return null in case of equality
    if (_.isEmpty(diff)) return null;
    else return diff;
  }
  if(obj1 !== obj2) return obj2;
};

// Deep-Clone a given object
// --------
// Note: this is currently done via JSON.parse(JSON.stringify(obj))
//       which is in fact not optimal, as it depends on `toJSON` implementation.
util.deepclone = function(obj) {
  return JSON.parse(JSON.stringify(obj));
};

// Clones a given object
// --------
// Calls obj's `clone` function if available,
// otherwise clones the obj using `util.deepclone()`.
util.clone = function(obj) {
  if (obj === null || obj === undefined) {
    return obj;
  }
  if (_.isFunction(obj.clone)) {
    return obj.clone();
  }
  return util.deepclone(obj);
};

util.freeze = function(obj) {
  var idx;
  if (_.isObject(obj)) {
    if (Object.isFrozen(obj)) return obj;

    var keys = Object.keys(obj);
    for (idx = 0; idx < keys.length; idx++) {
      var key = keys[idx];
      obj[key] = util.freeze(obj[key]);
    }
    return Object.freeze(obj);
  } else if (_.isArray(obj)) {
    var arr = obj;
    for (idx = 0; idx < arr.length; idx++) {
      arr[idx] = util.freeze(arr[idx]);
    }
    return Object.freeze(arr);
  } else {
    return obj; // Object.freeze(obj);
  }
};

util.later = function(f, context) {
  return function() {
    var _args = arguments;
    setTimeout(function() {
      f.apply(context, _args);
    }, 0);
  };
};


// Returns true if a string doesn't contain any real content

util.isEmpty = function(str) {
  return !str.match(/\w/);
};

// Export
// ====

module.exports = util;

},{"fs":216,"underscore":212}],212:[function(require,module,exports){
//     Underscore.js 1.5.2
//     http://underscorejs.org
//     (c) 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
//     Underscore may be freely distributed under the MIT license.

(function() {

  // Baseline setup
  // --------------

  // Establish the root object, `window` in the browser, or `exports` on the server.
  var root = this;

  // Save the previous value of the `_` variable.
  var previousUnderscore = root._;

  // Establish the object that gets returned to break out of a loop iteration.
  var breaker = {};

  // Save bytes in the minified (but not gzipped) version:
  var ArrayProto = Array.prototype, ObjProto = Object.prototype, FuncProto = Function.prototype;

  // Create quick reference variables for speed access to core prototypes.
  var
    push             = ArrayProto.push,
    slice            = ArrayProto.slice,
    concat           = ArrayProto.concat,
    toString         = ObjProto.toString,
    hasOwnProperty   = ObjProto.hasOwnProperty;

  // All **ECMAScript 5** native function implementations that we hope to use
  // are declared here.
  var
    nativeForEach      = ArrayProto.forEach,
    nativeMap          = ArrayProto.map,
    nativeReduce       = ArrayProto.reduce,
    nativeReduceRight  = ArrayProto.reduceRight,
    nativeFilter       = ArrayProto.filter,
    nativeEvery        = ArrayProto.every,
    nativeSome         = ArrayProto.some,
    nativeIndexOf      = ArrayProto.indexOf,
    nativeLastIndexOf  = ArrayProto.lastIndexOf,
    nativeIsArray      = Array.isArray,
    nativeKeys         = Object.keys,
    nativeBind         = FuncProto.bind;

  // Create a safe reference to the Underscore object for use below.
  var _ = function(obj) {
    if (obj instanceof _) return obj;
    if (!(this instanceof _)) return new _(obj);
    this._wrapped = obj;
  };

  // Export the Underscore object for **Node.js**, with
  // backwards-compatibility for the old `require()` API. If we're in
  // the browser, add `_` as a global object via a string identifier,
  // for Closure Compiler "advanced" mode.
  if (typeof exports !== 'undefined') {
    if (typeof module !== 'undefined' && module.exports) {
      exports = module.exports = _;
    }
    exports._ = _;
  } else {
    root._ = _;
  }

  // Current version.
  _.VERSION = '1.5.2';

  // Collection Functions
  // --------------------

  // The cornerstone, an `each` implementation, aka `forEach`.
  // Handles objects with the built-in `forEach`, arrays, and raw objects.
  // Delegates to **ECMAScript 5**'s native `forEach` if available.
  var each = _.each = _.forEach = function(obj, iterator, context) {
    if (obj == null) return;
    if (nativeForEach && obj.forEach === nativeForEach) {
      obj.forEach(iterator, context);
    } else if (obj.length === +obj.length) {
      for (var i = 0, length = obj.length; i < length; i++) {
        if (iterator.call(context, obj[i], i, obj) === breaker) return;
      }
    } else {
      var keys = _.keys(obj);
      for (var i = 0, length = keys.length; i < length; i++) {
        if (iterator.call(context, obj[keys[i]], keys[i], obj) === breaker) return;
      }
    }
  };

  // Return the results of applying the iterator to each element.
  // Delegates to **ECMAScript 5**'s native `map` if available.
  _.map = _.collect = function(obj, iterator, context) {
    var results = [];
    if (obj == null) return results;
    if (nativeMap && obj.map === nativeMap) return obj.map(iterator, context);
    each(obj, function(value, index, list) {
      results.push(iterator.call(context, value, index, list));
    });
    return results;
  };

  var reduceError = 'Reduce of empty array with no initial value';

  // **Reduce** builds up a single result from a list of values, aka `inject`,
  // or `foldl`. Delegates to **ECMAScript 5**'s native `reduce` if available.
  _.reduce = _.foldl = _.inject = function(obj, iterator, memo, context) {
    var initial = arguments.length > 2;
    if (obj == null) obj = [];
    if (nativeReduce && obj.reduce === nativeReduce) {
      if (context) iterator = _.bind(iterator, context);
      return initial ? obj.reduce(iterator, memo) : obj.reduce(iterator);
    }
    each(obj, function(value, index, list) {
      if (!initial) {
        memo = value;
        initial = true;
      } else {
        memo = iterator.call(context, memo, value, index, list);
      }
    });
    if (!initial) throw new TypeError(reduceError);
    return memo;
  };

  // The right-associative version of reduce, also known as `foldr`.
  // Delegates to **ECMAScript 5**'s native `reduceRight` if available.
  _.reduceRight = _.foldr = function(obj, iterator, memo, context) {
    var initial = arguments.length > 2;
    if (obj == null) obj = [];
    if (nativeReduceRight && obj.reduceRight === nativeReduceRight) {
      if (context) iterator = _.bind(iterator, context);
      return initial ? obj.reduceRight(iterator, memo) : obj.reduceRight(iterator);
    }
    var length = obj.length;
    if (length !== +length) {
      var keys = _.keys(obj);
      length = keys.length;
    }
    each(obj, function(value, index, list) {
      index = keys ? keys[--length] : --length;
      if (!initial) {
        memo = obj[index];
        initial = true;
      } else {
        memo = iterator.call(context, memo, obj[index], index, list);
      }
    });
    if (!initial) throw new TypeError(reduceError);
    return memo;
  };

  // Return the first value which passes a truth test. Aliased as `detect`.
  _.find = _.detect = function(obj, iterator, context) {
    var result;
    any(obj, function(value, index, list) {
      if (iterator.call(context, value, index, list)) {
        result = value;
        return true;
      }
    });
    return result;
  };

  // Return all the elements that pass a truth test.
  // Delegates to **ECMAScript 5**'s native `filter` if available.
  // Aliased as `select`.
  _.filter = _.select = function(obj, iterator, context) {
    var results = [];
    if (obj == null) return results;
    if (nativeFilter && obj.filter === nativeFilter) return obj.filter(iterator, context);
    each(obj, function(value, index, list) {
      if (iterator.call(context, value, index, list)) results.push(value);
    });
    return results;
  };

  // Return all the elements for which a truth test fails.
  _.reject = function(obj, iterator, context) {
    return _.filter(obj, function(value, index, list) {
      return !iterator.call(context, value, index, list);
    }, context);
  };

  // Determine whether all of the elements match a truth test.
  // Delegates to **ECMAScript 5**'s native `every` if available.
  // Aliased as `all`.
  _.every = _.all = function(obj, iterator, context) {
    iterator || (iterator = _.identity);
    var result = true;
    if (obj == null) return result;
    if (nativeEvery && obj.every === nativeEvery) return obj.every(iterator, context);
    each(obj, function(value, index, list) {
      if (!(result = result && iterator.call(context, value, index, list))) return breaker;
    });
    return !!result;
  };

  // Determine if at least one element in the object matches a truth test.
  // Delegates to **ECMAScript 5**'s native `some` if available.
  // Aliased as `any`.
  var any = _.some = _.any = function(obj, iterator, context) {
    iterator || (iterator = _.identity);
    var result = false;
    if (obj == null) return result;
    if (nativeSome && obj.some === nativeSome) return obj.some(iterator, context);
    each(obj, function(value, index, list) {
      if (result || (result = iterator.call(context, value, index, list))) return breaker;
    });
    return !!result;
  };

  // Determine if the array or object contains a given value (using `===`).
  // Aliased as `include`.
  _.contains = _.include = function(obj, target) {
    if (obj == null) return false;
    if (nativeIndexOf && obj.indexOf === nativeIndexOf) return obj.indexOf(target) != -1;
    return any(obj, function(value) {
      return value === target;
    });
  };

  // Invoke a method (with arguments) on every item in a collection.
  _.invoke = function(obj, method) {
    var args = slice.call(arguments, 2);
    var isFunc = _.isFunction(method);
    return _.map(obj, function(value) {
      return (isFunc ? method : value[method]).apply(value, args);
    });
  };

  // Convenience version of a common use case of `map`: fetching a property.
  _.pluck = function(obj, key) {
    return _.map(obj, function(value){ return value[key]; });
  };

  // Convenience version of a common use case of `filter`: selecting only objects
  // containing specific `key:value` pairs.
  _.where = function(obj, attrs, first) {
    if (_.isEmpty(attrs)) return first ? void 0 : [];
    return _[first ? 'find' : 'filter'](obj, function(value) {
      for (var key in attrs) {
        if (attrs[key] !== value[key]) return false;
      }
      return true;
    });
  };

  // Convenience version of a common use case of `find`: getting the first object
  // containing specific `key:value` pairs.
  _.findWhere = function(obj, attrs) {
    return _.where(obj, attrs, true);
  };

  // Return the maximum element or (element-based computation).
  // Can't optimize arrays of integers longer than 65,535 elements.
  // See [WebKit Bug 80797](https://bugs.webkit.org/show_bug.cgi?id=80797)
  _.max = function(obj, iterator, context) {
    if (!iterator && _.isArray(obj) && obj[0] === +obj[0] && obj.length < 65535) {
      return Math.max.apply(Math, obj);
    }
    if (!iterator && _.isEmpty(obj)) return -Infinity;
    var result = {computed : -Infinity, value: -Infinity};
    each(obj, function(value, index, list) {
      var computed = iterator ? iterator.call(context, value, index, list) : value;
      computed > result.computed && (result = {value : value, computed : computed});
    });
    return result.value;
  };

  // Return the minimum element (or element-based computation).
  _.min = function(obj, iterator, context) {
    if (!iterator && _.isArray(obj) && obj[0] === +obj[0] && obj.length < 65535) {
      return Math.min.apply(Math, obj);
    }
    if (!iterator && _.isEmpty(obj)) return Infinity;
    var result = {computed : Infinity, value: Infinity};
    each(obj, function(value, index, list) {
      var computed = iterator ? iterator.call(context, value, index, list) : value;
      computed < result.computed && (result = {value : value, computed : computed});
    });
    return result.value;
  };

  // Shuffle an array, using the modern version of the 
  // [Fisher-Yates shuffle](http://en.wikipedia.org/wiki/Fisher–Yates_shuffle).
  _.shuffle = function(obj) {
    var rand;
    var index = 0;
    var shuffled = [];
    each(obj, function(value) {
      rand = _.random(index++);
      shuffled[index - 1] = shuffled[rand];
      shuffled[rand] = value;
    });
    return shuffled;
  };

  // Sample **n** random values from an array.
  // If **n** is not specified, returns a single random element from the array.
  // The internal `guard` argument allows it to work with `map`.
  _.sample = function(obj, n, guard) {
    if (arguments.length < 2 || guard) {
      return obj[_.random(obj.length - 1)];
    }
    return _.shuffle(obj).slice(0, Math.max(0, n));
  };

  // An internal function to generate lookup iterators.
  var lookupIterator = function(value) {
    return _.isFunction(value) ? value : function(obj){ return obj[value]; };
  };

  // Sort the object's values by a criterion produced by an iterator.
  _.sortBy = function(obj, value, context) {
    var iterator = lookupIterator(value);
    return _.pluck(_.map(obj, function(value, index, list) {
      return {
        value: value,
        index: index,
        criteria: iterator.call(context, value, index, list)
      };
    }).sort(function(left, right) {
      var a = left.criteria;
      var b = right.criteria;
      if (a !== b) {
        if (a > b || a === void 0) return 1;
        if (a < b || b === void 0) return -1;
      }
      return left.index - right.index;
    }), 'value');
  };

  // An internal function used for aggregate "group by" operations.
  var group = function(behavior) {
    return function(obj, value, context) {
      var result = {};
      var iterator = value == null ? _.identity : lookupIterator(value);
      each(obj, function(value, index) {
        var key = iterator.call(context, value, index, obj);
        behavior(result, key, value);
      });
      return result;
    };
  };

  // Groups the object's values by a criterion. Pass either a string attribute
  // to group by, or a function that returns the criterion.
  _.groupBy = group(function(result, key, value) {
    (_.has(result, key) ? result[key] : (result[key] = [])).push(value);
  });

  // Indexes the object's values by a criterion, similar to `groupBy`, but for
  // when you know that your index values will be unique.
  _.indexBy = group(function(result, key, value) {
    result[key] = value;
  });

  // Counts instances of an object that group by a certain criterion. Pass
  // either a string attribute to count by, or a function that returns the
  // criterion.
  _.countBy = group(function(result, key) {
    _.has(result, key) ? result[key]++ : result[key] = 1;
  });

  // Use a comparator function to figure out the smallest index at which
  // an object should be inserted so as to maintain order. Uses binary search.
  _.sortedIndex = function(array, obj, iterator, context) {
    iterator = iterator == null ? _.identity : lookupIterator(iterator);
    var value = iterator.call(context, obj);
    var low = 0, high = array.length;
    while (low < high) {
      var mid = (low + high) >>> 1;
      iterator.call(context, array[mid]) < value ? low = mid + 1 : high = mid;
    }
    return low;
  };

  // Safely create a real, live array from anything iterable.
  _.toArray = function(obj) {
    if (!obj) return [];
    if (_.isArray(obj)) return slice.call(obj);
    if (obj.length === +obj.length) return _.map(obj, _.identity);
    return _.values(obj);
  };

  // Return the number of elements in an object.
  _.size = function(obj) {
    if (obj == null) return 0;
    return (obj.length === +obj.length) ? obj.length : _.keys(obj).length;
  };

  // Array Functions
  // ---------------

  // Get the first element of an array. Passing **n** will return the first N
  // values in the array. Aliased as `head` and `take`. The **guard** check
  // allows it to work with `_.map`.
  _.first = _.head = _.take = function(array, n, guard) {
    if (array == null) return void 0;
    return (n == null) || guard ? array[0] : slice.call(array, 0, n);
  };

  // Returns everything but the last entry of the array. Especially useful on
  // the arguments object. Passing **n** will return all the values in
  // the array, excluding the last N. The **guard** check allows it to work with
  // `_.map`.
  _.initial = function(array, n, guard) {
    return slice.call(array, 0, array.length - ((n == null) || guard ? 1 : n));
  };

  // Get the last element of an array. Passing **n** will return the last N
  // values in the array. The **guard** check allows it to work with `_.map`.
  _.last = function(array, n, guard) {
    if (array == null) return void 0;
    if ((n == null) || guard) {
      return array[array.length - 1];
    } else {
      return slice.call(array, Math.max(array.length - n, 0));
    }
  };

  // Returns everything but the first entry of the array. Aliased as `tail` and `drop`.
  // Especially useful on the arguments object. Passing an **n** will return
  // the rest N values in the array. The **guard**
  // check allows it to work with `_.map`.
  _.rest = _.tail = _.drop = function(array, n, guard) {
    return slice.call(array, (n == null) || guard ? 1 : n);
  };

  // Trim out all falsy values from an array.
  _.compact = function(array) {
    return _.filter(array, _.identity);
  };

  // Internal implementation of a recursive `flatten` function.
  var flatten = function(input, shallow, output) {
    if (shallow && _.every(input, _.isArray)) {
      return concat.apply(output, input);
    }
    each(input, function(value) {
      if (_.isArray(value) || _.isArguments(value)) {
        shallow ? push.apply(output, value) : flatten(value, shallow, output);
      } else {
        output.push(value);
      }
    });
    return output;
  };

  // Flatten out an array, either recursively (by default), or just one level.
  _.flatten = function(array, shallow) {
    return flatten(array, shallow, []);
  };

  // Return a version of the array that does not contain the specified value(s).
  _.without = function(array) {
    return _.difference(array, slice.call(arguments, 1));
  };

  // Produce a duplicate-free version of the array. If the array has already
  // been sorted, you have the option of using a faster algorithm.
  // Aliased as `unique`.
  _.uniq = _.unique = function(array, isSorted, iterator, context) {
    if (_.isFunction(isSorted)) {
      context = iterator;
      iterator = isSorted;
      isSorted = false;
    }
    var initial = iterator ? _.map(array, iterator, context) : array;
    var results = [];
    var seen = [];
    each(initial, function(value, index) {
      if (isSorted ? (!index || seen[seen.length - 1] !== value) : !_.contains(seen, value)) {
        seen.push(value);
        results.push(array[index]);
      }
    });
    return results;
  };

  // Produce an array that contains the union: each distinct element from all of
  // the passed-in arrays.
  _.union = function() {
    return _.uniq(_.flatten(arguments, true));
  };

  // Produce an array that contains every item shared between all the
  // passed-in arrays.
  _.intersection = function(array) {
    var rest = slice.call(arguments, 1);
    return _.filter(_.uniq(array), function(item) {
      return _.every(rest, function(other) {
        return _.indexOf(other, item) >= 0;
      });
    });
  };

  // Take the difference between one array and a number of other arrays.
  // Only the elements present in just the first array will remain.
  _.difference = function(array) {
    var rest = concat.apply(ArrayProto, slice.call(arguments, 1));
    return _.filter(array, function(value){ return !_.contains(rest, value); });
  };

  // Zip together multiple lists into a single array -- elements that share
  // an index go together.
  _.zip = function() {
    var length = _.max(_.pluck(arguments, "length").concat(0));
    var results = new Array(length);
    for (var i = 0; i < length; i++) {
      results[i] = _.pluck(arguments, '' + i);
    }
    return results;
  };

  // Converts lists into objects. Pass either a single array of `[key, value]`
  // pairs, or two parallel arrays of the same length -- one of keys, and one of
  // the corresponding values.
  _.object = function(list, values) {
    if (list == null) return {};
    var result = {};
    for (var i = 0, length = list.length; i < length; i++) {
      if (values) {
        result[list[i]] = values[i];
      } else {
        result[list[i][0]] = list[i][1];
      }
    }
    return result;
  };

  // If the browser doesn't supply us with indexOf (I'm looking at you, **MSIE**),
  // we need this function. Return the position of the first occurrence of an
  // item in an array, or -1 if the item is not included in the array.
  // Delegates to **ECMAScript 5**'s native `indexOf` if available.
  // If the array is large and already in sort order, pass `true`
  // for **isSorted** to use binary search.
  _.indexOf = function(array, item, isSorted) {
    if (array == null) return -1;
    var i = 0, length = array.length;
    if (isSorted) {
      if (typeof isSorted == 'number') {
        i = (isSorted < 0 ? Math.max(0, length + isSorted) : isSorted);
      } else {
        i = _.sortedIndex(array, item);
        return array[i] === item ? i : -1;
      }
    }
    if (nativeIndexOf && array.indexOf === nativeIndexOf) return array.indexOf(item, isSorted);
    for (; i < length; i++) if (array[i] === item) return i;
    return -1;
  };

  // Delegates to **ECMAScript 5**'s native `lastIndexOf` if available.
  _.lastIndexOf = function(array, item, from) {
    if (array == null) return -1;
    var hasIndex = from != null;
    if (nativeLastIndexOf && array.lastIndexOf === nativeLastIndexOf) {
      return hasIndex ? array.lastIndexOf(item, from) : array.lastIndexOf(item);
    }
    var i = (hasIndex ? from : array.length);
    while (i--) if (array[i] === item) return i;
    return -1;
  };

  // Generate an integer Array containing an arithmetic progression. A port of
  // the native Python `range()` function. See
  // [the Python documentation](http://docs.python.org/library/functions.html#range).
  _.range = function(start, stop, step) {
    if (arguments.length <= 1) {
      stop = start || 0;
      start = 0;
    }
    step = arguments[2] || 1;

    var length = Math.max(Math.ceil((stop - start) / step), 0);
    var idx = 0;
    var range = new Array(length);

    while(idx < length) {
      range[idx++] = start;
      start += step;
    }

    return range;
  };

  // Function (ahem) Functions
  // ------------------

  // Reusable constructor function for prototype setting.
  var ctor = function(){};

  // Create a function bound to a given object (assigning `this`, and arguments,
  // optionally). Delegates to **ECMAScript 5**'s native `Function.bind` if
  // available.
  _.bind = function(func, context) {
    var args, bound;
    if (nativeBind && func.bind === nativeBind) return nativeBind.apply(func, slice.call(arguments, 1));
    if (!_.isFunction(func)) throw new TypeError;
    args = slice.call(arguments, 2);
    return bound = function() {
      if (!(this instanceof bound)) return func.apply(context, args.concat(slice.call(arguments)));
      ctor.prototype = func.prototype;
      var self = new ctor;
      ctor.prototype = null;
      var result = func.apply(self, args.concat(slice.call(arguments)));
      if (Object(result) === result) return result;
      return self;
    };
  };

  // Partially apply a function by creating a version that has had some of its
  // arguments pre-filled, without changing its dynamic `this` context.
  _.partial = function(func) {
    var args = slice.call(arguments, 1);
    return function() {
      return func.apply(this, args.concat(slice.call(arguments)));
    };
  };

  // Bind all of an object's methods to that object. Useful for ensuring that
  // all callbacks defined on an object belong to it.
  _.bindAll = function(obj) {
    var funcs = slice.call(arguments, 1);
    if (funcs.length === 0) throw new Error("bindAll must be passed function names");
    each(funcs, function(f) { obj[f] = _.bind(obj[f], obj); });
    return obj;
  };

  // Memoize an expensive function by storing its results.
  _.memoize = function(func, hasher) {
    var memo = {};
    hasher || (hasher = _.identity);
    return function() {
      var key = hasher.apply(this, arguments);
      return _.has(memo, key) ? memo[key] : (memo[key] = func.apply(this, arguments));
    };
  };

  // Delays a function for the given number of milliseconds, and then calls
  // it with the arguments supplied.
  _.delay = function(func, wait) {
    var args = slice.call(arguments, 2);
    return setTimeout(function(){ return func.apply(null, args); }, wait);
  };

  // Defers a function, scheduling it to run after the current call stack has
  // cleared.
  _.defer = function(func) {
    return _.delay.apply(_, [func, 1].concat(slice.call(arguments, 1)));
  };

  // Returns a function, that, when invoked, will only be triggered at most once
  // during a given window of time. Normally, the throttled function will run
  // as much as it can, without ever going more than once per `wait` duration;
  // but if you'd like to disable the execution on the leading edge, pass
  // `{leading: false}`. To disable execution on the trailing edge, ditto.
  _.throttle = function(func, wait, options) {
    var context, args, result;
    var timeout = null;
    var previous = 0;
    options || (options = {});
    var later = function() {
      previous = options.leading === false ? 0 : new Date;
      timeout = null;
      result = func.apply(context, args);
    };
    return function() {
      var now = new Date;
      if (!previous && options.leading === false) previous = now;
      var remaining = wait - (now - previous);
      context = this;
      args = arguments;
      if (remaining <= 0) {
        clearTimeout(timeout);
        timeout = null;
        previous = now;
        result = func.apply(context, args);
      } else if (!timeout && options.trailing !== false) {
        timeout = setTimeout(later, remaining);
      }
      return result;
    };
  };

  // Returns a function, that, as long as it continues to be invoked, will not
  // be triggered. The function will be called after it stops being called for
  // N milliseconds. If `immediate` is passed, trigger the function on the
  // leading edge, instead of the trailing.
  _.debounce = function(func, wait, immediate) {
    var timeout, args, context, timestamp, result;
    return function() {
      context = this;
      args = arguments;
      timestamp = new Date();
      var later = function() {
        var last = (new Date()) - timestamp;
        if (last < wait) {
          timeout = setTimeout(later, wait - last);
        } else {
          timeout = null;
          if (!immediate) result = func.apply(context, args);
        }
      };
      var callNow = immediate && !timeout;
      if (!timeout) {
        timeout = setTimeout(later, wait);
      }
      if (callNow) result = func.apply(context, args);
      return result;
    };
  };

  // Returns a function that will be executed at most one time, no matter how
  // often you call it. Useful for lazy initialization.
  _.once = function(func) {
    var ran = false, memo;
    return function() {
      if (ran) return memo;
      ran = true;
      memo = func.apply(this, arguments);
      func = null;
      return memo;
    };
  };

  // Returns the first function passed as an argument to the second,
  // allowing you to adjust arguments, run code before and after, and
  // conditionally execute the original function.
  _.wrap = function(func, wrapper) {
    return function() {
      var args = [func];
      push.apply(args, arguments);
      return wrapper.apply(this, args);
    };
  };

  // Returns a function that is the composition of a list of functions, each
  // consuming the return value of the function that follows.
  _.compose = function() {
    var funcs = arguments;
    return function() {
      var args = arguments;
      for (var i = funcs.length - 1; i >= 0; i--) {
        args = [funcs[i].apply(this, args)];
      }
      return args[0];
    };
  };

  // Returns a function that will only be executed after being called N times.
  _.after = function(times, func) {
    return function() {
      if (--times < 1) {
        return func.apply(this, arguments);
      }
    };
  };

  // Object Functions
  // ----------------

  // Retrieve the names of an object's properties.
  // Delegates to **ECMAScript 5**'s native `Object.keys`
  _.keys = nativeKeys || function(obj) {
    if (obj !== Object(obj)) throw new TypeError('Invalid object');
    var keys = [];
    for (var key in obj) if (_.has(obj, key)) keys.push(key);
    return keys;
  };

  // Retrieve the values of an object's properties.
  _.values = function(obj) {
    var keys = _.keys(obj);
    var length = keys.length;
    var values = new Array(length);
    for (var i = 0; i < length; i++) {
      values[i] = obj[keys[i]];
    }
    return values;
  };

  // Convert an object into a list of `[key, value]` pairs.
  _.pairs = function(obj) {
    var keys = _.keys(obj);
    var length = keys.length;
    var pairs = new Array(length);
    for (var i = 0; i < length; i++) {
      pairs[i] = [keys[i], obj[keys[i]]];
    }
    return pairs;
  };

  // Invert the keys and values of an object. The values must be serializable.
  _.invert = function(obj) {
    var result = {};
    var keys = _.keys(obj);
    for (var i = 0, length = keys.length; i < length; i++) {
      result[obj[keys[i]]] = keys[i];
    }
    return result;
  };

  // Return a sorted list of the function names available on the object.
  // Aliased as `methods`
  _.functions = _.methods = function(obj) {
    var names = [];
    for (var key in obj) {
      if (_.isFunction(obj[key])) names.push(key);
    }
    return names.sort();
  };

  // Extend a given object with all the properties in passed-in object(s).
  _.extend = function(obj) {
    each(slice.call(arguments, 1), function(source) {
      if (source) {
        for (var prop in source) {
          obj[prop] = source[prop];
        }
      }
    });
    return obj;
  };

  // Return a copy of the object only containing the whitelisted properties.
  _.pick = function(obj) {
    var copy = {};
    var keys = concat.apply(ArrayProto, slice.call(arguments, 1));
    each(keys, function(key) {
      if (key in obj) copy[key] = obj[key];
    });
    return copy;
  };

   // Return a copy of the object without the blacklisted properties.
  _.omit = function(obj) {
    var copy = {};
    var keys = concat.apply(ArrayProto, slice.call(arguments, 1));
    for (var key in obj) {
      if (!_.contains(keys, key)) copy[key] = obj[key];
    }
    return copy;
  };

  // Fill in a given object with default properties.
  _.defaults = function(obj) {
    each(slice.call(arguments, 1), function(source) {
      if (source) {
        for (var prop in source) {
          if (obj[prop] === void 0) obj[prop] = source[prop];
        }
      }
    });
    return obj;
  };

  // Create a (shallow-cloned) duplicate of an object.
  _.clone = function(obj) {
    if (!_.isObject(obj)) return obj;
    return _.isArray(obj) ? obj.slice() : _.extend({}, obj);
  };

  // Invokes interceptor with the obj, and then returns obj.
  // The primary purpose of this method is to "tap into" a method chain, in
  // order to perform operations on intermediate results within the chain.
  _.tap = function(obj, interceptor) {
    interceptor(obj);
    return obj;
  };

  // Internal recursive comparison function for `isEqual`.
  var eq = function(a, b, aStack, bStack) {
    // Identical objects are equal. `0 === -0`, but they aren't identical.
    // See the [Harmony `egal` proposal](http://wiki.ecmascript.org/doku.php?id=harmony:egal).
    if (a === b) return a !== 0 || 1 / a == 1 / b;
    // A strict comparison is necessary because `null == undefined`.
    if (a == null || b == null) return a === b;
    // Unwrap any wrapped objects.
    if (a instanceof _) a = a._wrapped;
    if (b instanceof _) b = b._wrapped;
    // Compare `[[Class]]` names.
    var className = toString.call(a);
    if (className != toString.call(b)) return false;
    switch (className) {
      // Strings, numbers, dates, and booleans are compared by value.
      case '[object String]':
        // Primitives and their corresponding object wrappers are equivalent; thus, `"5"` is
        // equivalent to `new String("5")`.
        return a == String(b);
      case '[object Number]':
        // `NaN`s are equivalent, but non-reflexive. An `egal` comparison is performed for
        // other numeric values.
        return a != +a ? b != +b : (a == 0 ? 1 / a == 1 / b : a == +b);
      case '[object Date]':
      case '[object Boolean]':
        // Coerce dates and booleans to numeric primitive values. Dates are compared by their
        // millisecond representations. Note that invalid dates with millisecond representations
        // of `NaN` are not equivalent.
        return +a == +b;
      // RegExps are compared by their source patterns and flags.
      case '[object RegExp]':
        return a.source == b.source &&
               a.global == b.global &&
               a.multiline == b.multiline &&
               a.ignoreCase == b.ignoreCase;
    }
    if (typeof a != 'object' || typeof b != 'object') return false;
    // Assume equality for cyclic structures. The algorithm for detecting cyclic
    // structures is adapted from ES 5.1 section 15.12.3, abstract operation `JO`.
    var length = aStack.length;
    while (length--) {
      // Linear search. Performance is inversely proportional to the number of
      // unique nested structures.
      if (aStack[length] == a) return bStack[length] == b;
    }
    // Objects with different constructors are not equivalent, but `Object`s
    // from different frames are.
    var aCtor = a.constructor, bCtor = b.constructor;
    if (aCtor !== bCtor && !(_.isFunction(aCtor) && (aCtor instanceof aCtor) &&
                             _.isFunction(bCtor) && (bCtor instanceof bCtor))) {
      return false;
    }
    // Add the first object to the stack of traversed objects.
    aStack.push(a);
    bStack.push(b);
    var size = 0, result = true;
    // Recursively compare objects and arrays.
    if (className == '[object Array]') {
      // Compare array lengths to determine if a deep comparison is necessary.
      size = a.length;
      result = size == b.length;
      if (result) {
        // Deep compare the contents, ignoring non-numeric properties.
        while (size--) {
          if (!(result = eq(a[size], b[size], aStack, bStack))) break;
        }
      }
    } else {
      // Deep compare objects.
      for (var key in a) {
        if (_.has(a, key)) {
          // Count the expected number of properties.
          size++;
          // Deep compare each member.
          if (!(result = _.has(b, key) && eq(a[key], b[key], aStack, bStack))) break;
        }
      }
      // Ensure that both objects contain the same number of properties.
      if (result) {
        for (key in b) {
          if (_.has(b, key) && !(size--)) break;
        }
        result = !size;
      }
    }
    // Remove the first object from the stack of traversed objects.
    aStack.pop();
    bStack.pop();
    return result;
  };

  // Perform a deep comparison to check if two objects are equal.
  _.isEqual = function(a, b) {
    return eq(a, b, [], []);
  };

  // Is a given array, string, or object empty?
  // An "empty" object has no enumerable own-properties.
  _.isEmpty = function(obj) {
    if (obj == null) return true;
    if (_.isArray(obj) || _.isString(obj)) return obj.length === 0;
    for (var key in obj) if (_.has(obj, key)) return false;
    return true;
  };

  // Is a given value a DOM element?
  _.isElement = function(obj) {
    return !!(obj && obj.nodeType === 1);
  };

  // Is a given value an array?
  // Delegates to ECMA5's native Array.isArray
  _.isArray = nativeIsArray || function(obj) {
    return toString.call(obj) == '[object Array]';
  };

  // Is a given variable an object?
  _.isObject = function(obj) {
    return obj === Object(obj);
  };

  // Add some isType methods: isArguments, isFunction, isString, isNumber, isDate, isRegExp.
  each(['Arguments', 'Function', 'String', 'Number', 'Date', 'RegExp'], function(name) {
    _['is' + name] = function(obj) {
      return toString.call(obj) == '[object ' + name + ']';
    };
  });

  // Define a fallback version of the method in browsers (ahem, IE), where
  // there isn't any inspectable "Arguments" type.
  if (!_.isArguments(arguments)) {
    _.isArguments = function(obj) {
      return !!(obj && _.has(obj, 'callee'));
    };
  }

  // Optimize `isFunction` if appropriate.
  if (typeof (/./) !== 'function') {
    _.isFunction = function(obj) {
      return typeof obj === 'function';
    };
  }

  // Is a given object a finite number?
  _.isFinite = function(obj) {
    return isFinite(obj) && !isNaN(parseFloat(obj));
  };

  // Is the given value `NaN`? (NaN is the only number which does not equal itself).
  _.isNaN = function(obj) {
    return _.isNumber(obj) && obj != +obj;
  };

  // Is a given value a boolean?
  _.isBoolean = function(obj) {
    return obj === true || obj === false || toString.call(obj) == '[object Boolean]';
  };

  // Is a given value equal to null?
  _.isNull = function(obj) {
    return obj === null;
  };

  // Is a given variable undefined?
  _.isUndefined = function(obj) {
    return obj === void 0;
  };

  // Shortcut function for checking if an object has a given property directly
  // on itself (in other words, not on a prototype).
  _.has = function(obj, key) {
    return hasOwnProperty.call(obj, key);
  };

  // Utility Functions
  // -----------------

  // Run Underscore.js in *noConflict* mode, returning the `_` variable to its
  // previous owner. Returns a reference to the Underscore object.
  _.noConflict = function() {
    root._ = previousUnderscore;
    return this;
  };

  // Keep the identity function around for default iterators.
  _.identity = function(value) {
    return value;
  };

  // Run a function **n** times.
  _.times = function(n, iterator, context) {
    var accum = Array(Math.max(0, n));
    for (var i = 0; i < n; i++) accum[i] = iterator.call(context, i);
    return accum;
  };

  // Return a random integer between min and max (inclusive).
  _.random = function(min, max) {
    if (max == null) {
      max = min;
      min = 0;
    }
    return min + Math.floor(Math.random() * (max - min + 1));
  };

  // List of HTML entities for escaping.
  var entityMap = {
    escape: {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#x27;'
    }
  };
  entityMap.unescape = _.invert(entityMap.escape);

  // Regexes containing the keys and values listed immediately above.
  var entityRegexes = {
    escape:   new RegExp('[' + _.keys(entityMap.escape).join('') + ']', 'g'),
    unescape: new RegExp('(' + _.keys(entityMap.unescape).join('|') + ')', 'g')
  };

  // Functions for escaping and unescaping strings to/from HTML interpolation.
  _.each(['escape', 'unescape'], function(method) {
    _[method] = function(string) {
      if (string == null) return '';
      return ('' + string).replace(entityRegexes[method], function(match) {
        return entityMap[method][match];
      });
    };
  });

  // If the value of the named `property` is a function then invoke it with the
  // `object` as context; otherwise, return it.
  _.result = function(object, property) {
    if (object == null) return void 0;
    var value = object[property];
    return _.isFunction(value) ? value.call(object) : value;
  };

  // Add your own custom functions to the Underscore object.
  _.mixin = function(obj) {
    each(_.functions(obj), function(name) {
      var func = _[name] = obj[name];
      _.prototype[name] = function() {
        var args = [this._wrapped];
        push.apply(args, arguments);
        return result.call(this, func.apply(_, args));
      };
    });
  };

  // Generate a unique integer id (unique within the entire client session).
  // Useful for temporary DOM ids.
  var idCounter = 0;
  _.uniqueId = function(prefix) {
    var id = ++idCounter + '';
    return prefix ? prefix + id : id;
  };

  // By default, Underscore uses ERB-style template delimiters, change the
  // following template settings to use alternative delimiters.
  _.templateSettings = {
    evaluate    : /<%([\s\S]+?)%>/g,
    interpolate : /<%=([\s\S]+?)%>/g,
    escape      : /<%-([\s\S]+?)%>/g
  };

  // When customizing `templateSettings`, if you don't want to define an
  // interpolation, evaluation or escaping regex, we need one that is
  // guaranteed not to match.
  var noMatch = /(.)^/;

  // Certain characters need to be escaped so that they can be put into a
  // string literal.
  var escapes = {
    "'":      "'",
    '\\':     '\\',
    '\r':     'r',
    '\n':     'n',
    '\t':     't',
    '\u2028': 'u2028',
    '\u2029': 'u2029'
  };

  var escaper = /\\|'|\r|\n|\t|\u2028|\u2029/g;

  // JavaScript micro-templating, similar to John Resig's implementation.
  // Underscore templating handles arbitrary delimiters, preserves whitespace,
  // and correctly escapes quotes within interpolated code.
  _.template = function(text, data, settings) {
    var render;
    settings = _.defaults({}, settings, _.templateSettings);

    // Combine delimiters into one regular expression via alternation.
    var matcher = new RegExp([
      (settings.escape || noMatch).source,
      (settings.interpolate || noMatch).source,
      (settings.evaluate || noMatch).source
    ].join('|') + '|$', 'g');

    // Compile the template source, escaping string literals appropriately.
    var index = 0;
    var source = "__p+='";
    text.replace(matcher, function(match, escape, interpolate, evaluate, offset) {
      source += text.slice(index, offset)
        .replace(escaper, function(match) { return '\\' + escapes[match]; });

      if (escape) {
        source += "'+\n((__t=(" + escape + "))==null?'':_.escape(__t))+\n'";
      }
      if (interpolate) {
        source += "'+\n((__t=(" + interpolate + "))==null?'':__t)+\n'";
      }
      if (evaluate) {
        source += "';\n" + evaluate + "\n__p+='";
      }
      index = offset + match.length;
      return match;
    });
    source += "';\n";

    // If a variable is not specified, place data values in local scope.
    if (!settings.variable) source = 'with(obj||{}){\n' + source + '}\n';

    source = "var __t,__p='',__j=Array.prototype.join," +
      "print=function(){__p+=__j.call(arguments,'');};\n" +
      source + "return __p;\n";

    try {
      render = new Function(settings.variable || 'obj', '_', source);
    } catch (e) {
      e.source = source;
      throw e;
    }

    if (data) return render(data, _);
    var template = function(data) {
      return render.call(this, data, _);
    };

    // Provide the compiled function source as a convenience for precompilation.
    template.source = 'function(' + (settings.variable || 'obj') + '){\n' + source + '}';

    return template;
  };

  // Add a "chain" function, which will delegate to the wrapper.
  _.chain = function(obj) {
    return _(obj).chain();
  };

  // OOP
  // ---------------
  // If Underscore is called as a function, it returns a wrapped object that
  // can be used OO-style. This wrapper holds altered versions of all the
  // underscore functions. Wrapped objects may be chained.

  // Helper function to continue chaining intermediate results.
  var result = function(obj) {
    return this._chain ? _(obj).chain() : obj;
  };

  // Add all of the Underscore functions to the wrapper object.
  _.mixin(_);

  // Add all mutator Array functions to the wrapper.
  each(['pop', 'push', 'reverse', 'shift', 'sort', 'splice', 'unshift'], function(name) {
    var method = ArrayProto[name];
    _.prototype[name] = function() {
      var obj = this._wrapped;
      method.apply(obj, arguments);
      if ((name == 'shift' || name == 'splice') && obj.length === 0) delete obj[0];
      return result.call(this, obj);
    };
  });

  // Add all accessor Array functions to the wrapper.
  each(['concat', 'join', 'slice'], function(name) {
    var method = ArrayProto[name];
    _.prototype[name] = function() {
      return result.call(this, method.apply(this._wrapped, arguments));
    };
  });

  _.extend(_.prototype, {

    // Start chaining a wrapped Underscore object.
    chain: function() {
      this._chain = true;
      return this;
    },

    // Extracts the result from a wrapped and chained object.
    value: function() {
      return this._wrapped;
    }

  });

}).call(this);

},{}],213:[function(require,module,exports){
"use strict";

var _ = require("underscore");
var Application = require("substance-application");
var LensController = require("./lens_controller");
var Keyboard = require("substance-commander").Keyboard;
var util = require("substance-util");
var html = util.html;
var DEFAULT_CONFIG = require("../config/config.json");

// The Lens Application
// ========
//

var Lens = function(config) {
  config = config || DEFAULT_CONFIG;
  config.routes = require("../config/routes.json");
  Application.call(this, config);

  this.controller = new LensController(config);
};

Lens.Article = require("lens-article");
Lens.Reader = require("lens-reader");
Lens.Outline = require("lens-outline");

Lens.Prototype = function() {

  // Start listening to routes
  // --------

  this.render = function() {
    this.view = this.controller.createView();
    this.$el.html(this.view.render().el);
  }
};



Lens.Prototype.prototype = Application.prototype;
Lens.prototype = new Lens.Prototype();
Lens.prototype.constructor = Lens;

var Substance = {
  util: require("substance-util"),
  Test: require("substance-test"),
  Application: require("substance-application"),
  Commander: require("substance-commander"),
  Document: require("substance-document"),
  Operator: require("substance-operator"),
  Chronicle: require("substance-chronicle"),
  Data: require("substance-data"),
  RegExp: require("substance-regexp"),
  Surface: require("substance-surface")
};


// Register tests
// --------
// 

// require("lens-converter/tests");
require("substance-application/tests");
// require("substance-converter/tests");
require("substance-operator/tests");
require("substance-chronicle/tests");
require("substance-data/tests");
require("substance-document/tests");
// require("substance-article/tests");
require("substance-store/tests");
// require("substance-surface/tests");

Lens.Substance = Substance;

module.exports = Lens;
},{"../config/config.json":2,"../config/routes.json":3,"./lens_controller":214,"lens-article":5,"lens-outline":56,"lens-reader":58,"substance-application":61,"substance-application/tests":68,"substance-chronicle":73,"substance-chronicle/tests":89,"substance-commander":90,"substance-data":94,"substance-data/tests":106,"substance-document":108,"substance-document/tests":122,"substance-operator":175,"substance-operator/tests":185,"substance-regexp":186,"substance-store/tests":192,"substance-surface":196,"substance-test":198,"substance-util":207,"underscore":212}],214:[function(require,module,exports){
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
            var baseUrl = record.url.replace(/\/[^\/]*$/g, '/');
            var importer = new Converter.Importer();
            doc = importer.import(data, {
              baseURL: baseUrl
            });

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
},{"./lens_view":215,"lens-article":5,"lens-converter":49,"lens-reader":58,"substance-application":61,"substance-article":69,"substance-library":125,"substance-test":198,"substance-util":207,"underscore":212}],215:[function(require,module,exports){
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

},{"substance-application":61,"substance-test":198,"substance-util":207,"underscore":212}],216:[function(require,module,exports){
// nothing to see here... no file methods for the browser

},{}]},{},[1])
;