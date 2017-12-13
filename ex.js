var Index = require('.')
var hyperdb = require('hyperdb')
var ram = require('random-access-memory')
var GeoStore = require('grid-point-store')
var memdb = require('memdb')

// ------------------------------------------------------------------------------

var db = hyperdb(ram, { valueEncoding: 'json' })
var geo = GeoStore(memdb())

var index = Index(db, {
  processFn: processFn,
  getSnapshot: getSnapshot,
  setSnapshot: setSnapshot
})

var pending = 0
for (var i = 0; i < 5; i++) {
  pending++
  db.put('/nodes/' + i, { type: 'node', lat: i, lon: -i * 2 }, function () {
    if (!--pending) query()
  })
}

function query () {
  index.ready(function () {
    geo.query([[-10, -10], [10, 10]], function (err, nodes) {
      if (err) throw err
      console.log('query res', nodes)
    })
  })
}

// ------------------------------------------------------------------------------

var now = null
function getSnapshot (cb) {
  cb(null, now)
}
function setSnapshot (snapshot, cb) {
  now = snapshot
  cb(null)
}
function processFn (cur, prev, next) {
  if (cur.value.type === 'node') {
    var v = parseInt(cur.key.split('/')[cur.key.split('/').length - 1])
    console.log('process', cur.value)
    geo.insert([cur.value.lat, cur.value.lon], v, next)
  } else {
    next(null)
  }
}
