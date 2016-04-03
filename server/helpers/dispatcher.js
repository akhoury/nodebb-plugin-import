var EventEmitter2 = require('eventemitter2').EventEmitter2;

(function(module) {

    var on = function() {
        this._dispatcher.on.apply(this._dispatcher, arguments);
        return this;
    };

    var emit = function() {
        this._dispatcher.emit.apply(this._dispatcher, arguments);
        return this;
    };

    var once = function() {
        this._dispatcher.once.apply(this._dispatcher, arguments);
        return this;
    };

    var off = function() {
        this._dispatcher.off.apply(this._dispatcher, arguments);
        return this;
    };

    var removeAllListeners = function() {
      this._dispatcher.removeAllListeners();
    };

    module.exports = function(context) {
      ['on', 'off', 'emit', 'once', 'removeAllListeners'].forEach(function(fn) {
        if (context[fn]) {
          throw 'Dispatcher cannot extend ' + context;
        }
      });
      context._dispatcher = new EventEmitter2({
        wildcard: true
      });
      context.on = on.bind(context);
      context.emit = emit.bind(context);
      context.once = once.bind(context);
      context.off = off.bind(context);
      context.removeAllListeners = removeAllListeners.bind(context);
      return context;
    };

})(module);