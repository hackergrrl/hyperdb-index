var test = require('tape')
var hyperdb = require('hyperdb')
var ram = require('random-access-memory')
var index = require('..')

test('adder', function (t) {
  t.plan(4)

  var db = hyperdb(ram, { valueEncoding: 'json' })

  var sum = 0
  var snapshot = null

  var idx = index(db, {
    processFn: function (kv, _, next) {
      if (typeof kv.value === 'number') sum += kv.value
      next()
    },
    getSnapshot: function (cb) { cb(null, snapshot) },
    setSnapshot: function (s, cb) { snapshot = s; cb(null) }
  })

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

