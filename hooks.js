eejs = require("ep_etherpad-lite/node/eejs");

exports.eejsBlock_editbarMenuLeft = function (hook_name, args, cb) {
  args.content = args.content + eejs.require("ep_sketchspace_pdfbackground/templates/sketchSpaceEditbarButtons.ejs", {}, module);
  return cb();
}

exports.eejsBlock_styles = function (hook_name, args, cb) {
  args.content = args.content + eejs.require("ep_sketchspace_pdfbackground/templates/sketchSpaceStyles.ejs", {}, module);
  return cb();
}
