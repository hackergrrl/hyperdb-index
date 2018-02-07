var test = require('tape')
var hyperdb = require('hyperdb')
var ram = require('random-access-memory')
var index = require('..')
var versions = require('../lib/version')
var tmp = require('os').tmpdir
var rimraf = require('rimraf')
var path = require('path')

test('empty + ready called', function (t) {
  t.plan(1)

  var db = hyperdb(ram, { valueEncoding: 'json' })
  var version = null
  var idx = index(db, {
    processFn: function (node, next) {
      next()
    },
    getVersion: function (cb) { cb(null, version) },
    setVersion: function (s, cb) { version = s; cb(null) }
  })

  idx.ready(function () {
    t.ok(true)
  })
})

test('adder', function (t) {
  t.plan(6)

  var db = hyperdb(ram, { valueEncoding: 'json' })

  var sum = 0
  var version = null

  var idx = index(db, {
    processFn: function (node, next) {
      if (typeof node.value === 'number') sum += node.value
      next()

      if (!--pending) done()
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
  t.plan(6)

  var db = hyperdb(ram, { valueEncoding: 'json' })

  var sum = 0
  var version = null

  var idx = index(db, {
    processFn: function (node, next) {
      if (typeof node.value === 'number') sum += node.value
      next()
    },
    getVersion: function (cb) {
      setTimeout(function () { cb(null, version) }, 100)
    },
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
        var finalVersion = versions.deserialize(version)
        t.equal(finalVersion.length, 1)
        t.equal(finalVersion[0].seq, 2)
        t.equal(sum, 30)
      })
    }
  }
})

test('adder /w many concurrent PUTs', function (t) {
  t.plan(203)

  var db = hyperdb(ram, { valueEncoding: 'json' })

  var sum = 0
  var version = null

  var idx = index(db, {
    processFn: function (node, next) {
      if (typeof node.value === 'number') sum += node.value
      next()

      if (!--pending) done()
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
      var finalVersion = versions.deserialize(version)
      t.equal(finalVersion.length, 1)
      t.equal(finalVersion[0].seq, 199)
      t.equal(sum, expectedSum)
    })
  }
})

test('adder /w index made AFTER db population', function (t) {
  t.plan(203)

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
      var finalVersion = versions.deserialize(version)
      t.equal(finalVersion.length, 1)
      t.equal(finalVersion[0].seq, 199)
      t.equal(sum, expectedSum)
    })
  }
})

test('adder /w async storage', function (t) {
  t.plan(6)

  var db = hyperdb(ram, { valueEncoding: 'json' })

  var sum = 0
  var version = null

  function getSum (cb) {
    setTimeout(function () { cb(sum) }, Math.floor(Math.random() * 200))
  }
  function setSum (newSum, cb) {
    setTimeout(function () {
      sum = newSum
      cb()
    }, Math.floor(Math.random() * 200))
  }

  var idx = index(db, {
    processFn: function (node, next) {
      if (typeof node.value === 'number') {
        getSum(function (theSum) {
          theSum += node.value
          setSum(theSum, function () {
            next()
            if (!--pending) done()
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
      var finalVersion = versions.deserialize(version)
      t.equal(finalVersion.length, 1)
      t.equal(finalVersion[0].seq, 2)
      t.equal(sum, 30)
    })
  }
})

test('adder /w async storage: ready', function (t) {
  t.plan(6)

  var db = hyperdb(ram, { valueEncoding: 'json' })

  var sum = 0
  var version = null

  function getSum (cb) {
    setTimeout(function () { cb(sum) }, Math.floor(Math.random() * 100))
  }
  function setSum (newSum, cb) {
    setTimeout(function () {
      sum = newSum
      cb()
    }, Math.floor(Math.random() * 100))
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
            var finalVersion = versions.deserialize(version)
            t.equal(finalVersion.length, 1)
            t.equal(finalVersion[0].seq, 2)
            t.equals(theSum, 30)
          })
        })
      })
    })
  })
})

test('fs: adder', function (t) {
  t.plan(4)

  var id = String(Math.random()).substring(2)
  var dir = path.join(tmp(), 'hyperdb-index-test-' + id)
  var db = hyperdb(dir, { valueEncoding: 'json' })

  var sum = 0
  var version = null

  var idx = index(db, {
    processFn: function (node, next) {
      if (typeof node.value === 'number') sum += node.value
      next()
    },
    getVersion: function (cb) {
      setTimeout(function () { cb(null, version) }, 50)
    },
    setVersion: function (s, cb) {
      setTimeout(function () { version = s; cb(null) }, 50)
    }
  })

  var pending = 50
  var expectedSum = 0
  var batch = range(pending).map(function (_, n) {
    var value = n * 2 + 1
    expectedSum += value
    return {
      type: 'put',
      key: '/foo/' + n,
      value: value
    }
  })

  db.batch(batch, done)

  function done (err) {
    t.error(err)
    idx.ready(function () {
      var finalVersion = versions.deserialize(version)
      t.equal(finalVersion.length, 1)
      t.equal(sum, expectedSum, 'sum of all nodes is as expected')
      t.equal(finalVersion[0].seq, 49)
      rimraf.sync(dir)
    })
  }
})

test('adder + sync', function (t) {
  t.plan(12)

  createTwo(function (db1, db2) {
    var sum1 = 0
    var sum2 = 0
    var version1 = null
    var version2 = null

    var idx1 = index(db1, {
      processFn: function (node, next) {
        if (typeof node.value === 'number') sum1 += node.value
        next()

        if (!--pending) done()
      },
      getVersion: function (cb) { cb(null, version1) },
      setVersion: function (s, cb) { version1 = s; cb(null) }
    })

    var idx2 = index(db2, {
      processFn: function (node, next) {
        if (typeof node.value === 'number') sum2 += node.value
        next()

        if (!--pending) done()
      },
      getVersion: function (cb) { cb(null, version2) },
      setVersion: function (s, cb) { version2 = s; cb(null) }
    })

    var pending = 5
    db1.put('/foo/bar', 17, function (err) { t.error(err) })
    db1.put('/foo/baz', 12, function (err) { t.error(err) })
    db1.put('/bax/12', 1, function (err) { t.error(err) })
    db2.put('/bar/bee', 9, function (err) { t.error(err) })

    function done () {
      replicate(db1, db2, function () {
        idx1.ready(function () {
          idx2.ready(function () {
            var finalVersion = versions.deserialize(version1)
            t.equal(finalVersion.length, 2)
            t.equal(finalVersion[0].seq, 3)
            t.equal(finalVersion[1].seq, 0)
            t.equal(sum1, 39)

            finalVersion = versions.deserialize(version2)
            t.equal(finalVersion.length, 2)
            t.equal(finalVersion[0].seq, 3)
            t.equal(finalVersion[1].seq, 0)
            t.equal(sum2, 39)

            t.end()
          })
        })
      })
    }
  })
})

function range (n) {
  return (new Array(n)).fill(0)
}

function createTwo (cb) {
  var a = hyperdb(ram, {valueEncoding: 'json'})
  a.ready(function () {
    var b = hyperdb(ram, a.key, {valueEncoding: 'json'})
    b.ready(function () {
      a.authorize(b.local.key, function () {
        cb(a, b)
      })
    })
  })
}

function replicate (a, b, cb) {
  var stream = a.replicate()
  stream.pipe(b.replicate()).pipe(stream).on('end', cb)
}
