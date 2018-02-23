var events = require('events')
var inherits = require('inherits')
var through = require('through2')
var pump = require('pump')
var versions = require('./lib/version')

module.exports = Index

function Index (db, opts) {
  if (!(this instanceof Index)) return new Index(db, opts)
  opts = opts || {}

  if (!db) throw new Error('no argument "db" provided')
  if (!opts.processFn) throw new Error('no argument "processFn" provided')
  if (typeof opts.processFn !== 'function') throw new Error('no argument "processFn" provided')
  if (!opts.getVersion) throw new Error('no argument "opts.getVersion" provided')
  if (!opts.setVersion) throw new Error('no argument "opts.setVersion" provided')

  events.EventEmitter.call(this)

  opts.prefix = opts.prefix || '/'

  this._db = db
  this._prefix = opts.prefix
  this._processFn = opts.processFn
  this._getVersion = opts.getVersion
  this._setVersion = opts.setVersion
  this._lastIdxVersion = null

  this._indexRunning = true

  // Kick off the indexing
  this._run()
}
inherits(Index, events.EventEmitter)

Index.prototype._run = function () {
  var self = this

  // get the current head version
  this._getVersion(function (err, startVersion) {
    if (err) return self.emit('error', err)
    self._lastIdxVersion = startVersion
    var frontVersion = versions.serialize(getAllHeads(self._db))

    // If the hyperdb version matches what's in storage, the index is up to
    // date
    if (startVersion && frontVersion.equals(startVersion)) {
      self._indexRunning = false
      self.emit('ready')
    } else if (!frontVersion.length && !startVersion) {
      self._indexRunning = false
      self.emit('ready')
    }

    var heads = startVersion ? versions.deserialize(startVersion) : null

    var source = self._db.createHistoryStream({start: startVersion, live: true})
    var sink = through.obj(write)
    pump(source, sink, onDone)

    function write (node, _, next) {
      self._indexRunning = true

      self._processFn(node, function (err) {
        if (err) return next(err)

        // Incrementally update the current 'version' using this node
        heads = updateHeadsWithNode(heads || [], node)
        var latestVersion = versions.serialize(heads)
        self._setVersion(latestVersion, function (err) {
          if (err) return self.emit('error', err)
          self._lastIdxVersion = latestVersion
          var headVersion = versions.serialize(getAllHeads(self._db))
          if (latestVersion.equals(headVersion)) {
            self._indexRunning = false
            self.emit('ready')
          }
          next()
        })
      })
    }

    function onDone (err) {
      self.emit('error', err)
    }
  })
}

Index.prototype.ready = function (cb) {
  if (!this._indexRunning) {
    // XXX: this is a workaround because there is a time delay between when a
    // new node is added to hyperdb and when hyperdb#createHistoryStream
    // receives that node; so we need to check the stored version against the
    // db's version when the index claims to be finished indexing.

    // get the current head version
    var frontVersion = versions.serialize(getAllHeads(this._db))
    if (this._lastIdxVersion && frontVersion.equals(this._lastIdxVersion)) {
      process.nextTick(cb)
    } else if (!frontVersion.length && !this._lastIdxVersion) {
      process.nextTick(cb)
    } else {
      this.once('ready', cb)
    }
  } else {
    this.once('ready', cb)
  }
}

// [Number], Node -> [Number] <Mutate>
function updateHeadsWithNode (heads, node) {
  heads[node.feed] = node.seq + 1
  return heads
}

function getAllHeads (db) {
  var heads = []
  for (var i = 0; i < db._writers.length; i++) {
    heads[i] = db._writers[i].feed.length
  }
  return heads
}
