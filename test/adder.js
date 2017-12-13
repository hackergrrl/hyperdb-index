var test = require('tape')
var hyperdb = require('hyperdb')
var ram = require('random-access-memory')
var index = require('..')
var versions = require('../lib/version')

test('adder', function (t) {
  t.plan(6)

  var db = hyperdb(ram, { valueEncoding: 'json' })

  var sum = 0
  var version = null

  var idx = index(db, {
    processFn: function (node, next) {
      if (typeof node.value === 'number') sum += node.value
      next()

      if(!--pending) done()
    },
    getVersion: function (cb) { cb(null, version) },
    setVersion: function (s, cb) { version = s; cb(null) }
  })

  var pending = 3
  db.put('/foo/bar', 17, function (err) { t.error(err) })
  db.put('/foo/baz', 12, function (err) { t.error(err) })
  db.put('/bax/12', 1, function (err) { t.error(err) })

  function done () {
    idx.ready(function () {
      var finalVersion = versions.deserialize(version)
      t.equal(finalVersion.length, 1)
      t.equal(finalVersion[0].seq, 2)
      t.equal(sum, 30)
    })
  }
})

test('adder /w slow versions', function (t) {
  t.plan(4)

  var db = hyperdb(ram, { valueEncoding: 'json' })

  var sum = 0
  var version = null

  var idx = index(db, {
    processFn: function (node, next) {
      if (typeof node.value === 'number') sum += node.value
      next()
    },
    getVersion: function (cb) { setTimeout(function () { cb(null, version) }, 100) },
    setVersion: function (s, cb) { version = s; setTimeout(cb, 100) }
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
  var version = null

  var idx = index(db, {
    processFn: function (node, next) {
      if (typeof node.value === 'number') sum += node.value
      next()

      if(!--pending) done()
    },
    getVersion: function (cb) { cb(null, version) },
    setVersion: function (s, cb) { version = s; cb(null) }
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
  var version = null

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
      processFn: function (node, next) {
        if (typeof node.value === 'number') sum += node.value
        next()
      },
      getVersion: function (cb) { cb(null, version) },
      setVersion: function (s, cb) { version = s; cb(null) }
    })
    idx.ready(function () {
      t.equal(sum, expectedSum)
    })
  }
})

test('adder /w async storage', function (t) {
  t.plan(4)

  var db = hyperdb(ram, { valueEncoding: 'json' })

  var sum = 0
  var version = null

  function getSum (cb) {
    setTimeout(function () { cb(sum) }, Math.floor(Math.random() * 1000))
  }
  function setSum (newSum, cb) {
    setTimeout(function () {
      sum = newSum
      cb()
    }, Math.floor(Math.random() * 1000))
  }

  var idx = index(db, {
    processFn: function (node, next) {
      if (typeof node.value === 'number') {
        getSum(function (theSum) {
          theSum += node.value
          setSum(theSum, function () {
            next()
            if(!--pending) done()
          })
        })
      }
    },
    getVersion: function (cb) { cb(null, version) },
    setVersion: function (s, cb) { version = s; cb(null) }
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

test('adder /w async storage: ready', function (t) {
  t.plan(4)

  var db = hyperdb(ram, { valueEncoding: 'json' })

  var sum = 0
  var version = null

  function getSum (cb) {
    setTimeout(function () { cb(sum) }, Math.floor(Math.random() * 1000))
  }
  function setSum (newSum, cb) {
    setTimeout(function () {
      sum = newSum
      cb()
    }, Math.floor(Math.random() * 1000))
  }

  var idx = index(db, {
    processFn: function (node, next) {
      if (typeof node.value === 'number') {
        getSum(function (theSum) {
          theSum += node.value
          setSum(theSum, function () {
            next()
          })
        })
      }
    },
    getVersion: function (cb) { cb(null, version) },
    setVersion: function (s, cb) { version = s; cb(null) }
  })

  db.put('/foo/bar', 17, function (err) {
    t.error(err)
    db.put('/foo/baz', 12, function (err) {
      t.error(err)
      db.put('/bax/12', 1, function (err) {
        t.error(err)
        idx.ready(function () {
          getSum(function (theSum) {
            t.equals(theSum, 30)
          })
        })
      })
    })
  })
})
