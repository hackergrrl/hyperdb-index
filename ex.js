var Index = require('.')
var hyperdb = require('hyperdb')
var ram = require('random-access-memory')
var GeoStore = require('grid-point-store')
var memdb = require('memdb')

var db = hyperdb(ram, { valueEncoding: 'json' })
var geo = GeoStore(memdb())

var now = null

var opts = {
  getSnapshot: function (cb) {
    cb(null, now)
  },
  setSnapshot: function (snapshot, cb) {
    now = snapshot
    cb(null)
  }
}

var index = Index(db, process, opts)

function process (cur, prev, next) {
  console.log('process', cur, prev)
  if (cur.value.type === 'node') {
    var v = cur.name.split('/')[cur.name.split('/').length - 1]
    geo.insert([cur.value.lat, cur.value.lon], v, next)
  } else {
    next(null)
  }
}

db.put('/nodes/123', { type: 'node', lat: 3, lon: -10 })

setTimeout(function () {
  geo.query([[-180, -85], [180, 85]], function (err, nodes) {
    console.log(nodes)
  })
}, 1000)

