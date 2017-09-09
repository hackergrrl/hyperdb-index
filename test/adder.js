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

      if(!--pending) done()
    },
    getSnapshot: function (cb) { cb(null, snapshot) },
    setSnapshot: function (s, cb) { snapshot = s; cb(null) }
  })

  var pending = 3
  db.put('/foo/bar', 17, function (err) { t.error(err) })
  db.put('/foo/baz', 12, function (err) { t.error(err) })
  db.put('/bax/12', 1, function (err) { t.error(err) })

  function done () {
    idx.ready(function () {
      t.equal(sum, 30)
    })
  }
})

test('adder /w slow snapshots', function (t) {
  t.plan(4)

  var db = hyperdb(ram, { valueEncoding: 'json' })

  var sum = 0
  var snapshot = null

  var idx = index(db, {
    processFn: function (kv, _, next) {
      if (typeof kv.value === 'number') sum += kv.value
      next()
    },
    getSnapshot: function (cb) { setTimeout(function () { cb(null, snapshot) }, 100) },
    setSnapshot: function (s, cb) { snapshot = s; setTimeout(cb, 500) }
  })

  var pending = 3
  db.put('/foo/bar', 17, done)
  db.put('/foo/baz', 12, done)
  db.put('/bax/12', 1, done)

  function done (err) {
    t.error(err)
    if (!--pending) {
      idx.ready(function () {
        t.equal(sum, 30)
      })
    }
  }
})

test('adder /w many concurrent PUTs', function (t) {
  t.plan(201)

  var db = hyperdb(ram, { valueEncoding: 'json' })

  var sum = 0
  var snapshot = null

  var idx = index(db, {
    processFn: function (kv, _, next) {
      if (typeof kv.value === 'number') sum += kv.value
      next()

      if(!--pending) done()
    },
    getSnapshot: function (cb) { cb(null, snapshot) },
    setSnapshot: function (s, cb) { snapshot = s; cb(null) }
  })

  var pending = 200
  var expectedSum = 0
  for (var i = 0; i < pending; i++) {
    var n = Math.floor(Math.random() * 10)
    expectedSum += n
    db.put('/number/' + i, n, function (err) { t.error(err) })
  }

  function done () {
    idx.ready(function () {
      t.equal(sum, expectedSum)
    })
  }
})

test('adder /w index made AFTER db population', function (t) {
  t.plan(201)

  var db = hyperdb(ram, { valueEncoding: 'json' })

  var sum = 0
  var snapshot = null

  var pending = 200
  var expectedSum = 0
  for (var i = 0; i < pending; i++) {
    var n = Math.floor(Math.random() * 10)
    expectedSum += n
    db.put('/number/' + i, n, function (err) {
      t.error(err)
      if (!--pending) done()
    })
  }

  function done () {
    var idx = index(db, {
      processFn: function (kv, _, next) {
        if (typeof kv.value === 'number') sum += kv.value
        next()
      },
      getSnapshot: function (cb) { cb(null, snapshot) },
      setSnapshot: function (s, cb) { snapshot = s; cb(null) }
    })
    idx.ready(function () {
      t.equal(sum, expectedSum)
    })
  }
})
