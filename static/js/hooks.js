var padeditor = require('ep_etherpad-lite/static/js/pad_editor').padeditor;

exports.sketchSpaceDesigner_designer_DesignerUI_startup = function (hook_name, args, cb) {
  dojo.require("sketchSpaceDesigner.designer.bbox");
  dojo.require("dojox.gfx.utils");
  dojo.require("dojox.gfx.matrix");

  dojo.declare("ep_sketchspace_pdfbackground.DesignerUIMenuAddTools", [dijit._Widget, dijit._Templated], {
    widgetsInTemplate: true,
    templateString: '<ul>' +
                    '  <li id="addImage" dojoAttachPoint="addImgButton">' +
                    '    <a title="Add image"><span class="buttonicon buttonicon-addimage"></span></a>' +
                    '  </<li>' +
                    '</ul>',
    startup: function () {
      this.inherited(arguments);

      if (typeof(AjaxUpload) != "undefined") {
        var info = {  
          action: '/fileUpload/',
          name: 'uploadfile',  
          onSubmit: function(file, ext){
          },  
          onComplete: function(file, response){
            var path = response.replace(/^\s+|\s+$/g, '').split("/");
            exports.addImg(path[path.length-1]);
          }
        };
        new AjaxUpload($(this.addImgButton), info);  
      }
    }
  });

  args.ui.addTools.addChild(new ep_sketchspace_pdfbackground.DesignerUIMenuAddTools());

  if (typeof(pad) != "undefined") {
    var info = {  
      action: '/fileUpload/',
      name: 'uploadfile',
      onSubmit: function(file, ext){
      //console.log('Starting...');
      },  
      onComplete: function(file, response){
        var path = response.replace(/^\s+|\s+$/g, '').split("/");
	var filename = path[path.length-1];

	dojo.xhrGet({
	  url: "/imageConvert/" + filename + "?action=getPages",
	  handleAs: "json",
	  load: function(data){
	    padeditor.ace.callWithAce(function (ace) {
	      for (var page = 0; page < data.pages; page++) {

		var imageId = sketchSpace.ace_insertImage(ace);
		var rep = ace.ace_getRep();
		ace.ace_performDocumentApplyAttributesToRange(rep.selStart, rep.selEnd, [["sketchSpaceImageObject:" + dojox.uuid.generateRandomUuid(), escape(dojo.toJson({parent:null, shape: {extType: "zimage", imageName: filename, page:page}}))]]);
		ace.ace_performSelectionChange(rep.selEnd, rep.selEnd, false);

	      }
	    }, "sketchSpace", true)
	  }
	});

      }
    }

    // FIXME:
    new AjaxUpload($('.sketchSpaceAddPdfImage'), info);  
    new AjaxUpload($('.sketchSpaceAddPdfImage span'), info);
  }


  cb();
}

exports.sketchspaceDeserializeShape_zimage = function (hook_name, args, cb) {
  var shape = exports.createImage(args.designer, args.parent, args.description.imageName, args.description.page);
  if (args.description.transform !== undefined)
    shape.setTransform(args.description.transform);
  return cb([shape]);
}

exports.sketchspaceSerializeShape_zimage = function (hook_name, args, cb) {
  var description = {extType: "zimage", imageName: args.shape.imageName, page:args.shape.page, transform:args.shape.getTransform()};
  return cb([description]);
}

exports.createImage = function(designer, parent, imageName, page) {
  var image = parent.createGroup();
  image.extType = "zimage";
  image.background = undefined;
  image.currentDisplay = undefined;
  image.imageName = imageName;
  image.page = page ? page : 0;
  image.updateDisplay = function () {
    var image = this;
    if (image.background === undefined)
      image.background = dojox.gfx.utils.deserialize(image, {shape:{type:"rect", x:0, y:0, width:100, height:100}, fill:{r:196,g:196,b:196,a:1}});
    if (this.pointSize === undefined) {
      dojo.xhrGet({
        url: "/imageConvert/" + this.imageName + "?action=getSize&p=" + image.page,
        handleAs: "json",
        load: function(data){
          image.pointSize = data;
          image.updateDisplay();
        }
      });
    } else {
      var shape = image.background.getShape();
      shape.width = this.pointSize.w;
      shape.height = this.pointSize.h;
      image.background.setShape(shape);

      var objToScreenMatrix = this._getRealMatrix();
      var screenToObjMatrix = dojox.gfx.matrix.invert(objToScreenMatrix);

      var screenBboxOnObj = new sketchSpaceDesigner.designer.bbox.Bbox({x: 0, y: 0, width:designer.surface_size.width, height:designer.surface_size.height}).transform(screenToObjMatrix);
      var objBboxOnObj = new sketchSpaceDesigner.designer.bbox.Bbox({x: 0, y: 0, width:this.pointSize.w, height:this.pointSize.h});

      // Rounding here does not seem to work with all renderers :(
      var displayBboxOnObj = objBboxOnObj.copy().intersection(screenBboxOnObj); //.powround({x:2, y:2}, {x:8, y:8});
      var displayBboxOnScreen = displayBboxOnObj.copy().transform(objToScreenMatrix); //.powroundSize({x:2, y:2}, {x:8, y:8});

      //console.log("zoom: " + displayBboxOnObj.toString() + " @ " + displayBboxOnScreen.width + ":" + displayBboxOnScreen.height);

      // Make sure our offset and size is in the source image is in whole pixels (after scaling) as some renderers require this! 
      var objToPixelMatrix = dojox.gfx.matrix.scale(displayBboxOnScreen.width / displayBboxOnObj.width,
                                                    displayBboxOnScreen.height / displayBboxOnObj.height);
      var pixelToObjMatrix = dojox.gfx.matrix.invert(objToPixelMatrix);
      var displayBboxOnObjInScreenPixels = displayBboxOnObj.copy().transform(objToPixelMatrix).round({x:1, y:1});
      displayBboxOnObj = displayBboxOnObjInScreenPixels.copy().transform(pixelToObjMatrix);

//	console.log("Bbox: inPixels=" + displayBboxOnObjInScreenPixels + "; inPoints=" + displayBboxOnObj);

      if (isNaN(displayBboxOnObj.x) || isNaN(displayBboxOnObj.y) || isNaN(displayBboxOnObj.width) || isNaN(displayBboxOnObj.height) || isNaN(displayBboxOnScreen.width) || isNaN(displayBboxOnScreen.height) ||
          displayBboxOnObj.width < 1 || displayBboxOnObj.height < 1 || displayBboxOnScreen.width < 1 || displayBboxOnScreen.height < 1) {
        console.log("NaN: onObj=" + displayBboxOnObj + "; onScreen=" + displayBboxOnScreen);
        image.newShape = undefined;
        if (image.currentDisplay !== undefined)
          image.currentDisplay.removeShape();
        image.currentDisplay = undefined;
        return;
      }

      var newShape = {
        x:displayBboxOnObj.x,
        y:displayBboxOnObj.y,
        width:displayBboxOnObj.width,
        height:displayBboxOnObj.height,
        src: "/imageConvert/" + this.imageName +
          "?p=" + image.page +
          "&x=" + displayBboxOnObj.x +
          "&y=" + displayBboxOnObj.y +
          "&w=" + displayBboxOnObj.width +
          "&h=" + displayBboxOnObj.height +
          "&px=" + displayBboxOnObjInScreenPixels.x + 
          "&py=" + displayBboxOnObjInScreenPixels.y + 
          "&pw=" + displayBboxOnObjInScreenPixels.width +
          "&ph=" + displayBboxOnObjInScreenPixels.height
      };

      var oldShape = this.currentDisplay ? this.currentDisplay.getShape() : undefined;

      if (!oldShape || oldShape.src != newShape.src) {

        image.newShape = newShape;

        // Preload the image to the cache...
        dojo.xhrGet({
          url: newShape.src,
          load: function(data){
            /* Now when the image is in the cache, "load" the image */
            /* We've already zoomed more, forget about it... */
            if (image.newShape != newShape) return;
            var lastDisplay = this.currentDisplay;
            image.currentDisplay = image.createImage(newShape);
            if (lastDisplay) lastDisplay.removeShape();
          }
        });
      }
    }
  }
  image.updateDisplayLazy = function () {
    if (this.updateDisplayTimout !== undefined) return;
    var image = this;
    this.updateDisplayTimout = window.setTimeout(function () {
      image.updateDisplay();
      image.updateDisplayTimout = undefined;
    }, 1000);
  }
  image.getTransformedBoundingBox = function () {
    var objToScreenMatrix = this._getRealMatrix();
    return new sketchSpaceDesigner.designer.bbox.Bbox({x: 0, y: 0, width:this.pointSize.w, height:this.pointSize.h}).transform(objToScreenMatrix).corners();
  }

  image.updateDisplay();
  image.updateHandle = dojo.connect(designer, "viewUpdated", image, image.updateDisplayLazy);

  return image;
}

exports.addImg = function(imageName) {
  var shape = exports.createImage(sketchSpace.editorUi.editor, sketchSpace.editorUi.editor.surface_transform, imageName);
  sketchSpace.editorUi.editor.setShapeFillAndStroke(shape, sketchSpace.editorUi.editor.options);
  sketchSpace.editorUi.editor.registerObjectShape(shape);
  sketchSpace.editorUi.editor.saveShapeToStr(shape);
}
