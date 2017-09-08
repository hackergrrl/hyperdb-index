var test = require('tape')
var hyperdb = require('hyperdb')
var ram = require('random-access-memory')
var index = require('..')

test('adder', function (t) {
  t.plan(4)

  var db = hyperdb(ram, { valueEncoding: 'json' })

  var idx = index(db, {
    processFn: process,
    getSnapshot: getSnapshot,
    setSnapshot: setSnapshot
  })

  var sum = 0
  var snapshot = null
  function getSnapshot (cb) { cb(null, snapshot) }
  function setSnapshot (s, cb) { snapshot = s; cb(null) }
  function process (kv, _, next) {
    if (typeof kv.value === 'number') sum += kv.value
    next()
  }

  var pending = 3
  db.put('/foo/bar', 17, done)
  db.put('/foo/baz', 12, done)
  db.put('/bax/12', 1, done)

  function done (err) {
    t.error(err)
    if (!--pending) {
      idx.ready(function () {
        t.equal(sum, 29)
      })
    }
  }
})
