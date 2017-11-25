# hyperdb-index

> Build an incremental index over a [hyperdb][hyperdb].

## Usage

Let's build an index that tracks all `node`s in a [spatial point
store](https://github.com/noffle/grid-point-store), for fast bounding box
queries:

```js
var index = require('hyperdb-index')
var hyperdb = require('hyperdb')
var ram = require('random-access-memory')
var GeoStore = require('grid-point-store')
var memdb = require('memdb')

//------------------------------------------------------------------------------

var db = hyperdb(ram, { valueEncoding: 'json' })
var geo = GeoStore(memdb())

var idx = index(db, {
  processFn: processFn,
  getSnapshot: getSnapshot,
  setSnapshot: setSnapshot
})

var pending = 0
for (var i = 0; i < 5; i++) {
  pending++
  db.put('/nodes/' + i, { type: 'node', lat: i, lon: -i*2 }, function () {
    if (!--pending) query()
  })
}

function query () {
  idx.ready(function () {
    geo.query([[-10, -10], [10, 10]], function (err, nodes) {
      console.log('query', nodes)
    })
  })
}

//------------------------------------------------------------------------------

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
    var v = parseInt(cur.name.split('/')[cur.name.split('/').length - 1])
    console.log('process', cur.value)
    geo.insert([cur.value.lat, cur.value.lon], v, next)
  } else {
    next(null)
  }
}
```

outputs

```
process { type: 'node', lat: 0, lon: 0 }
process { type: 'node', lat: 4, lon: -8 }
process { type: 'node', lat: 3, lon: -6 }
process { type: 'node', lat: 1, lon: -2 }
process { type: 'node', lat: 2, lon: -4 }
query [ { lat: 4, lon: -8, value: 4 },
  { lat: 3, lon: -6, value: 3 },
  { lat: 2, lon: -4, value: 2 },
  { lat: 1, lon: -2, value: 1 },
  { lat: 0, lon: 0, value: 0 } ]
```

So here `hyperdb-index` is acting like a bridge between the raw point data in
`hyperdb` and the much more efficient point storage module `grid-point-store`.

## API

```js
var index = require('hyperdb-index')
```

### var idx = index(db, opts)

Create a new index. `db` is a [hyperdb][hyperdb] instance.

It is the module consumer's responsibility to store the indexer's snapshot of
what entry it's indexed `db` up to. The module consumer controls this by
implementing the functions `opts.getSnapshot` and `opts.setSnapshot` (see
below).

Valid `opts` include:

- `opts.processFn` (required): a function to be called to process a new entry in
  `db`. The expected function signature is `function (kv, oldKv, next)`, where
  `kv` is of the form `{ key: '...', value: {} }`, `oldKv` is its previous value
  (`null` if none), and `next` is a callback to call when processing of that
  key-value pair is complete.
- `opts.getSnapshot` (required): a function that will be called to retrieve the
  current snapshot of the [hyperdb][hyperdb]. It has the signature `function
  (cb)` and expects a [hyperdb snapshot
  object](https://github.com/mafintosh/hyperdb/#dbsnapshotcb).
- `opts.setSnapshot` (required): a function that will be called to store the
  current snapshot of the hyperdb. It has the signature `function (snapshot,
  cb)`. Call `cb` once you've stored the snapshot object.
- `opts.prefix` (optional): a key prefix to index. If not given, the root key
  `'/'` is assumed.

### idx.ready(cb)

Registers the callback `cb` to fire when the indexes have "caught up" to the
latest known change in the hyperdb. The `cb` function fires exactly once. You
may call `idx.ready()` multiple times with different functions.

## Install

With [npm](https://npmjs.org/) installed, run

```
$ npm install hyperdb-index
```

## See Also

- [hyperlog-index](https://github.com/substack/hyperlog-index)

## License

ISC

[hyperdb]: https://github.com/mafintosh/hyperdb
