var events = require('events')
var inherits = require('inherits')

module.exports = Index

function Index (db, processFn, opts) {
  if (!(this instanceof Index)) return new Index(db, processFn, opts)
  events.EventEmitter.call(this)

  if (!db) throw new Error('no argument "db" provided')
  if (!processFn) throw new Error('no argument "processFn" provided')
  if (typeof processFn !== 'function') throw new Error('no argument "processFn" provided')
  if (!opts.getSnapshot) throw new Error('no argument "opts.getSnapshot" provided')
  if (!opts.setSnapshot) throw new Error('no argument "opts.setSnapshot" provided')

  opts.prefix = opts.prefix || '/'

  var self = this
  this._db = db
  this._prefix = opts.prefix
  this._processFn = processFn
  this._getSnapshot = opts.getSnapshot
  this._setSnapshot = opts.setSnapshot

  var running = true

  // TODO: some way to 'deactivate' the index; unwatch db
  db.watch(opts.prefix, function () {
    if (running) return
    // TODO: logic to prevent a 'run' from being missed; should be queued
    self._run(function (err) {
      running = false
    })
  })

  // Initial kick-off
  this._run(function (err) {
    running = false
  })
}
inherits(Index, events.EventEmitter)

Index.prototype._run = function (cb) {
  var self = this

  this._db.snapshot(function (err, newSnapshot) {
    if (err) return self.emit('error', err)

    self._getSnapshot(function (err, snapshot) {
      if (err) return self.emit('error', err)

      var stream = self._db.createDiffStream(self._prefix, snapshot)

      var pending = {}
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

      stream.on('end', function () {
        self._setSnapshot(newSnapshot, cb)
      })
    })
  })
}

function noop () {}
