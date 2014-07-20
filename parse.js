var Entities = require('html-entities').AllHtmlEntities;
var entities = new Entities();

// this is 2 extra parse functions that executes on the posts content and users signatures
// for you to customize if you need to do anything with them before importing into the NodeBB db
module.exports = {

    // this executes BEFORE the "convert" methods, i.e.  "bbcode-to-md" and "html-to-md"
    before: function( content ){
        content = content || '';

        // do whatever you want with the content, but remember to return it.

        // here's an example on to "decode" html entities if you need to
        // content = entities.decode(content); // this will convert "you&#39;re fat" to "you're fat"

        // leave that statement in
        return content;
    },

    // this executes AFTER the "convert" methods, i.e.  "bbcode-to-md" and "html-to-md"
    after: function( content ) {
        // do whatever you want with the content, but remember to return it.

        // leave that statement in
        return content;
    }
};