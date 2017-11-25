var events = require('events')
var inherits = require('inherits')
var through = require('through2')
var pump = require('pump')

module.exports = Index

function Index (db, opts) {
  if (!(this instanceof Index)) return new Index(db, opts)
  opts = opts || {}

  if (!db) throw new Error('no argument "db" provided')
  if (!opts.processFn) throw new Error('no argument "processFn" provided')
  if (typeof opts.processFn !== 'function') throw new Error('no argument "processFn" provided')
  if (!opts.getSnapshot) throw new Error('no argument "opts.getSnapshot" provided')
  if (!opts.setSnapshot) throw new Error('no argument "opts.setSnapshot" provided')

  events.EventEmitter.call(this)

  opts.prefix = opts.prefix || '/'

  var self = this
  this._db = db
  this._prefix = opts.prefix
  this._processFn = opts.processFn
  this._getSnapshot = opts.getSnapshot
  this._setSnapshot = opts.setSnapshot

  this._indexRunning = false
  this._indexPending = false

  // Initial indexing kick-off
  this._run()

  // TODO: some way to 'deactivate' the index; unwatch db
  db.watch(opts.prefix, function () {
    if (self._indexRunning) {
      self._indexPending = true
      return
    }
    self._run()
  })
}
inherits(Index, events.EventEmitter)

Index.prototype._run = function () {
  var self = this
  this._indexRunning = true

  var missing = 1

  this._db.snapshot(function (err, newSnapshot) {
    if (err) return self.emit('error', err)

    self._getSnapshot(function (err, snapshot) {
      if (err) return self.emit('error', err)

      var source = self._db.createDiffStream(self._prefix, snapshot, newSnapshot)
      var stream = through.obj(write)

      pump(source, stream, onProcessDone)

      var pending = {}
      function write (diff, enc, next) {
        if (diff.type === 'del') {
          pending[diff.name] = diff
          return
        }
        missing++

        var kv = { key: diff.name, value: diff.value }

        if (diff.type === 'put' && pending[diff.name]) {
          self._processFn(kv, pending[diff.name], function (err) {
            onProcessDone(err)
            next(err)
          })
        } else {
          self._processFn(kv, null, function (err) {
            onProcessDone(err)
            next(err)
          })
        }
      }

      function onProcessDone (err) {
        if (err) self.emit('error', err)
        if (!--missing) finish()
      }

      function finish () {
        self._setSnapshot(newSnapshot, function (err) {
          if (err) self.emit('error', err)

          if (self._indexPending) {
            self._indexRunning = true
            self._indexPending = false
            process.nextTick(self._run.bind(self))
          } else {
            self._indexRunning = false
            self.emit('ready')
          }
        })
      }
    })
  })
}

Index.prototype.ready = function (cb) {
  if (!this._indexRunning) process.nextTick(cb)
  else this.once('ready', cb)
}

function noop () {}
