var toBuffer = require('to-buffer')
var varint = require('varint')

module.exports = {
  serialize: serialize,
  deserialize: deserialize,
  serializeHyperdb: serializeHyperdb
}

function serialize (heads) {
  heads = heads.filter(n => n > 0)
  var buf = Buffer.alloc(heads.length * 4)
  for (var i = 0; i < heads.length; i++) {
    buf.writeUInt32LE(heads[i], i * 4)
  }
  return buf
}

function deserialize (buf) {
  var heads = new Array(buf.length / 4)
  for (var i = 0; i < buf.length / 4; i++) {
    heads[i] = buf.readUInt32LE(i * 4)
  }
  return heads
}

// Serialize the heads into the version format hyperdb expects.
function serializeHyperdb (db, heads) {
  var bufAccum = []

  for (var i = 0; i < heads.length; i++) {
    bufAccum.push(db._writers[i].key)
    bufAccum.push(toBuffer(varint.encode(heads[i] - 1)))
  }

  return Buffer.concat(bufAccum)
}
