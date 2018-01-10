var toBuffer = require('to-buffer')
var varint = require('varint')

module.exports = {
  serialize: headsToVersion,
  deserialize: versionToHeads
}

// Buffer -> [{key, seq}]
function versionToHeads (version) {
  var ptr = 0
  var heads = []

  if (!version || !version.length) return heads

  while (ptr < version.length) {
    var key = version.slice(ptr, ptr + 32)
    ptr += 32
    var seq = varint.decode(version, ptr)
    ptr += varint.decode.bytes
    heads.push({key: key, seq: seq})
  }

  return heads
}

// [{keq, seq}] -> Buffer
function headsToVersion (heads) {
  var bufAccum = []

  for (var i = 0; i < heads.length; i++) {
    bufAccum.push(heads[i].key)
    bufAccum.push(toBuffer(varint.encode(heads[i].seq)))
  }

  return Buffer.concat(bufAccum)
}
