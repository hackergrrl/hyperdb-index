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

      var stream = self._db.createDiffStream(self._prefix, snapshot, { head: newSnapshot })

      var pending = {}
      stream.on('data', function (diff) {
        if (diff.type === 'del') pending[diff.name] = diff
        else if (diff.type === 'put' && pending[diff.name]) {
          missing++
          self._processFn(diff, pending[diff.name], function (err) {
            if (err) self.emit('error', err)
            if (!--missing) finish()
          })
        } else {
          missing++
          self._processFn(diff, null, function (err) {
            if (err) self.emit('error', err)
            if (!--missing) finish()
          })
        }
      })

      stream.on('end', function () {
        if (!--missing) finish()
      })

      function finish () {
        self._setSnapshot(newSnapshot, function (err) {
          if (err) self.emit('error', err)

          self._indexRunning = false
          if (self._indexPending) {
            self._indexPending = false
            process.nextTick(self._run.bind(self))
          } else {
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
