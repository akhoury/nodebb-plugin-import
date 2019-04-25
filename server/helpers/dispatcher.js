const { EventEmitter2 } = require('eventemitter2');

(function (module) {
  const on = function () {
    this._dispatcher.on.apply(this._dispatcher, arguments);
    return this;
  };

  const emit = function () {
    this._dispatcher.emit.apply(this._dispatcher, arguments);
    return this;
  };

  const once = function () {
    this._dispatcher.once.apply(this._dispatcher, arguments);
    return this;
  };

  const off = function () {
    this._dispatcher.off.apply(this._dispatcher, arguments);
    return this;
  };

  const removeAllListeners = function () {
    this._dispatcher.removeAllListeners();
  };

  module.exports = function (context) {
    ['on', 'off', 'emit', 'once', 'removeAllListeners'].forEach((fn) => {
      if (context[fn]) {
        throw `Dispatcher cannot extend ${context}`;
      }
    });
    context._dispatcher = new EventEmitter2({
      wildcard: true,
    });
    context.on = on.bind(context);
    context.emit = emit.bind(context);
    context.once = once.bind(context);
    context.off = off.bind(context);
    context.removeAllListeners = removeAllListeners.bind(context);
    return context;
  };
}(module));
