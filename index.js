var events = require('events')
var inherits = require('inherits')

module.exports = Index

function Index (db, processFn, opts) {
  if (!(this instanceof Index)) return new Index(opts)
  events.EventEmitter.call(this)

  if (!db) throw new Error('no argument "db" provided')
  if (!processFn) throw new Error('no argument "processFn" provided')

  opts.prefix = opts.prefix || '/'

  var self = this
  this._db = db
  this._prefix = opts.prefix
  this._processFn = processFn

  // TODO: some way to 'deactivate' the index; unwatch db
  db.watch(opts.prefix, function () {
    self._run()
  })

  // Initial kick-off
  self._run()
}
inherits(Index, events.EventEmitter)

Index.prototype._run = function () {
  var stream = this._db.createDiffStream(this._prefix)
  var pending = {}
  var self = this
  stream.on('data', function (diff) {
    if (diff.type === 'del') pending[diff.name] = diff
    else if (diff.type === 'put' && pending[diff.name]) {
      self._processFn(diff, pending[diff.name], function (err) {
        if (err) self.emit('error', err)
      })
    } else {
      self._processFn(diff, null, function (err) {
        if (err) self.emit('error', err)
      })
    }
  })
}

