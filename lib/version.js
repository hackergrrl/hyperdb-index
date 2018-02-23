module.exports = {
  serialize: serialize,
  deserialize: deserialize
}

function serialize (heads) {
  var buf = new Buffer(heads.length * 4)
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
