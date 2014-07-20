var Entities = require('html-entities').AllHtmlEntities;
var entities = new Entities();



// this is an extra parse function that executes on the post content and user signature
// for you to customize if you need to do anything with them before importing into the NodeBB db
// however, this executes after the "convert" methods, i.e.  "bbcode-to-md" and "html-to-md"
module.exports = function( content ){
    content = content || '';

    // do whatever you want with the content, but remember to return it.

    // here's an example on to "decode" html entities if you need to
    // content = entities.decode(content); // this will convert "you&#39;re fat" to "you're fat"

    // leave that statement in
    return content;
};