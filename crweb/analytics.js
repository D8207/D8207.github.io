(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
(function (process){
var pcap_tcp_tracker = require( 'pcap/tcp_tracker' );
var pcap_decode = require( 'pcap/decode' );
var pcapp = require( 'pcap-parser' );
var FileReadStream = require('filestream/read');

var sendError = function( message ) {
	if ( process.title == 'browser' ) {
		postMessage( {
			ok: false,
			message: message
		} );
	} else {
		console.error( 'ERROR: ' + message );
		process.exit();
	}
};

var sendData = function( data ) {
	if ( process.title == 'browser' ) {
		postMessage( {
			ok: true,
			data: data
		} );
	} else {
		console.log( 'Data:' );
		console.log( data );
	}
};

var parsePcap = function( input, items ) {
	var parser = pcapp.parse( input );
	var tcp_tracker = new pcap_tcp_tracker.TCPTracker();

	parser.on( 'globalHeader', function( header ) {
		if ( header.linkLayerType != 1 ) {
			sendError( '不支持的网络类型：' + header.linkLayerType );
		}
	} );

	var userInfoData = {};

	var onUserInfoData = function( session, data ) {
		var length = data.readUInt8( 0x0 );
		// this length might be truncated -- do not trust it.
		if ( data.length < 0x5 ) {
			return;
		}

		var magic = data.readUInt16BE( 0x1 );
		if ( magic != 0x0109 ) {
			return;
		}

		var entryCount = data.readUInt16BE( 0x3 );
		var offset = 0x5;
		try {
			for ( var i = 0; i < entryCount; i++ ) {
				var userData = {
					updated: new Date( session.current_cap_time * 1000 )
				};

				userData.id = data.readUInt32BE( offset );
				offset += 4;

				var nameLength = data.readUInt16BE( offset );
				offset += 2;
				userData.name = data.toString( 'utf8', offset, offset + nameLength );
				offset += nameLength;

				var avatarLength = data.readUInt16BE( offset );
				offset += 2;
				userData.avatar = data.toString( 'utf8', offset, offset + avatarLength );
				offset += avatarLength;

				offset += 6; // unknown bytes; flags such as VIP?

				var keyLength = data.readUInt16BE( offset );
				offset += 2;
				userData.key = data.toString( 'utf8', offset, offset + keyLength );
				offset += keyLength;

				if ( !userInfoData[userData.id] ||
					userInfoData[userData.id].updated.getTime() < userData.updated.getTime()
				) {
					userInfoData[userData.id] = userData;
				}
			}
		} catch ( e ) {
			// the packet might be a segment
			if ( !( e instanceof RangeError ) ) {
				throw e;
			}
			throw e;
		}
	};

	var profitData = [];

	var onProfitData = function( session, data ) {
		var length = data.readUInt8( 0x0 );
		if ( length < 0x22 || data.length < 0x21 ) {
			return;
		}

		var magic = data.readUInt16BE( 0x1 );
		if ( magic != 0x0126 ) {
			return;
		}

		var date = new Date( session.current_cap_time * 1000 );
		var myProfit = data.readInt32BE( 0x9 );
		var opProfit = data.readInt32BE( 0x1d );
		profitData.push( [ date, myProfit, opProfit ] );
	};

	var garageData = [];

	var onGarageData = function( session, data ) {
		var length = data.readUInt8( 0x0 );
		if ( length < 0xe || data.length < 0xd ) {
			return;
		}

		var magic = data.readUInt16BE( 0x1 );
		if ( magic != 0x00f2 ) {
			return;
		}

		var userId = data.readUInt32BE( 0x5 );
		var userData = {
			user: userId,
			stationCount: data.readUInt16BE( 0x9 ),
			trainCount: data.readUInt16BE( 0xb ),
			trains: []
		};

		for ( var i = 0xd; i < data.length - 1; i += 2 ) {
			userData.trains.push( data.readUInt16BE( i ) );
		}

		garageData.push( userData );
	};

	var lootData = [];

	var onLootData = function( session, data ) {
		var length = data.readUInt8( 0x0 );
		if ( length < 0x8 || data.length < 0x7 ) {
			return;
		}

		var magic = data.readUInt16BE( 0x1 );
		if ( magic != 0x0107 ) {
			return;
		}

		var entryCount = data.readUInt16BE( 0x5 );
		var ENTRY_SIZE = 0xa;
		for ( var offset = 0x7;
			offset < Math.min( 0x7 + entryCount * ENTRY_SIZE, data.length - ENTRY_SIZE + 1 );
			offset += ENTRY_SIZE
		) {
			lootData.push( {
				user: data.readUInt32BE( offset ),
				rank: data.readUInt16BE( offset + 4 ),
				loot: data.readUInt32BE( offset + 6 )
			} );
		}
	};

	tcp_tracker.on( 'session', function( session ) {
		// TODO - filter out non-game sessions?

		// since we're listening from the middle of a session, send/recv may be reversed.
		if ( items == null || items.userInfo ) {
			session.on( 'data send', onUserInfoData );
			session.on( 'data recv', onUserInfoData );
		}
		if ( items == null || items.profit ) {
			session.on( 'data send', onProfitData );
			session.on( 'data recv', onProfitData );
		}
		if ( items == null || items.garage ) {
			session.on( 'data send', onGarageData );
			session.on( 'data recv', onGarageData );
		}
		if ( items == null || items.loot ) {
			session.on( 'data send', onLootData );
			session.on( 'data recv', onLootData );
		}
	} );

	parser.on( 'packet', function( packet ) {
		var pcapPacket = new pcap_decode.PcapPacket();
		pcapPacket.link_type = 'LINKTYPE_ETHERNET';
		pcapPacket.pcap_header = {
			tv_sec: packet.header.timestampSeconds,
			tv_usec: packet.header.timestampMicroseconds,
			caplen: packet.header.capturedLength,
			len: packet.header.originalLength
		};
		pcapPacket.payload = new pcap_decode.EthernetPacket().decode( packet.data, 0 );
		tcp_tracker.track_packet( pcapPacket );
	} );

	parser.on( 'end', function() {
		sendData( {
			userInfo: userInfoData,
			profit: profitData,
			garage: garageData,
			loot: lootData
		} );
	} );

	parser.on( 'error', function( e ) {
		sendError( e.message );
	} );
};

if ( process.title == 'browser' ) {
	onmessage = function( e ) {
		var stream = new FileReadStream( e.data.file );
		parsePcap( stream, e.data.items );
	};
} else {
	if ( process.argv.length < 3 ) {
		console.log( 'usage: ' + process.argv.join( ' ' ) + ' pcap_file' );
	} else {
		parsePcap( process.argv[2] );
	}
}

}).call(this,require('_process'))
},{"_process":40,"filestream/read":5,"pcap-parser":6,"pcap/decode":13,"pcap/tcp_tracker":29}],2:[function(require,module,exports){
if (typeof Object.create === 'function') {
  // implementation from standard node.js 'util' module
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    ctor.prototype = Object.create(superCtor.prototype, {
      constructor: {
        value: ctor,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
  };
} else {
  // old school shim for old browsers
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    var TempCtor = function () {}
    TempCtor.prototype = superCtor.prototype
    ctor.prototype = new TempCtor()
    ctor.prototype.constructor = ctor
  }
}

},{}],3:[function(require,module,exports){
(function (Buffer){
/**
 * Convert a typed array to a Buffer without a copy
 *
 * Author:   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
 * License:  MIT
 *
 * `npm install typedarray-to-buffer`
 */

var isTypedArray = require('is-typedarray').strict

module.exports = function (arr) {
  // If `Buffer` is the browser `buffer` module, and the browser supports typed arrays,
  // then avoid a copy. Otherwise, create a `Buffer` with a copy.
  var constructor = Buffer.TYPED_ARRAY_SUPPORT
    ? Buffer._augment
    : function (arr) { return new Buffer(arr) }

  if (arr instanceof Uint8Array) {
    return constructor(arr)
  } else if (arr instanceof ArrayBuffer) {
    return constructor(new Uint8Array(arr))
  } else if (isTypedArray(arr)) {
    // Use the typed array's underlying ArrayBuffer to back new Buffer. This respects
    // the "view" on the ArrayBuffer, i.e. byteOffset and byteLength. No copy.
    return constructor(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength))
  } else {
    // Unsupported type, just pass it through to the `Buffer` constructor.
    return new Buffer(arr)
  }
}

}).call(this,require("buffer").Buffer)
},{"buffer":33,"is-typedarray":4}],4:[function(require,module,exports){
module.exports      = isTypedArray
isTypedArray.strict = isStrictTypedArray
isTypedArray.loose  = isLooseTypedArray

var toString = Object.prototype.toString
var names = {
    '[object Int8Array]': true
  , '[object Int16Array]': true
  , '[object Int32Array]': true
  , '[object Uint8Array]': true
  , '[object Uint16Array]': true
  , '[object Uint32Array]': true
  , '[object Float32Array]': true
  , '[object Float64Array]': true
}

function isTypedArray(arr) {
  return (
       isStrictTypedArray(arr)
    || isLooseTypedArray(arr)
  )
}

function isStrictTypedArray(arr) {
  return (
       arr instanceof Int8Array
    || arr instanceof Int16Array
    || arr instanceof Int32Array
    || arr instanceof Uint8Array
    || arr instanceof Uint16Array
    || arr instanceof Uint32Array
    || arr instanceof Float32Array
    || arr instanceof Float64Array
  )
}

function isLooseTypedArray(arr) {
  return names[toString.call(arr)]
}

},{}],5:[function(require,module,exports){
var Readable = require('stream').Readable;
var inherits = require('inherits');
var reExtension = /^.*\.(\w+)$/;
var toBuffer = require('typedarray-to-buffer');

function FileReadStream(file, opts) {
  var readStream = this;
  if (! (this instanceof FileReadStream)) {
    return new FileReadStream(file, opts);
  }
  opts = opts || {};

  // inherit readable
  Readable.call(this, opts);

  // save the read offset
  this._offset = 0;
  this._eof = false;

  // create the reader
  this.reader = new FileReader();
  this.reader.onprogress = this._handleProgress.bind(this);
  this.reader.onload = this._handleLoad.bind(this);

  // generate the header blocks that we will send as part of the initial payload
  this._generateHeaderBlocks(file, opts, function(err, blocks) {
    // if we encountered an error, emit it
    if (err) {
      return readStream.emit('error', err);
    }

    readStream._headerBlocks = blocks || [];
    readStream.reader.readAsArrayBuffer(file);
  });
}

inherits(FileReadStream, Readable);
module.exports = FileReadStream;

FileReadStream.prototype._generateHeaderBlocks = function(file, opts, callback) {
  callback(null, []);
};

FileReadStream.prototype._read = function(bytes) {
  var stream = this;
  var reader = this.reader;

  function checkBytes() {
    var startOffset = stream._offset;
    var endOffset = stream._offset + bytes;
    var availableBytes = reader.result && reader.result.byteLength;
    var done = reader.readyState === 2 && endOffset > availableBytes;
    var chunk;

    // console.log('checking bytes available, need: ' + endOffset + ', got: ' + availableBytes);
    if (availableBytes && (done || availableBytes > endOffset)) {
      // get the data chunk
      chunk = toBuffer(new Uint8Array(
        reader.result,
        startOffset,
        Math.min(bytes, reader.result.byteLength - startOffset)
      ));

      // update the stream offset
      stream._offset = startOffset + chunk.length;

      // send the chunk
      // console.log('sending chunk, ended: ', chunk.length === 0);
      stream._eof = chunk.length === 0;
      return stream.push(chunk.length > 0 ? chunk : null);
    }

    stream.once('readable', checkBytes);
  }

  // push the header blocks out to the stream
  if (this._headerBlocks.length > 0) {
    return this.push(this._headerBlocks.shift());
  }

  checkBytes();
};

FileReadStream.prototype._handleLoad = function(evt) {
  this.emit('readable');
};

FileReadStream.prototype._handleProgress = function(evt) {
  this.emit('readable');
};

},{"inherits":2,"stream":52,"typedarray-to-buffer":3}],6:[function(require,module,exports){
(function (process,Buffer){
var util = require('util');
var events = require('events');
var fs = require('fs');

var GLOBAL_HEADER_LENGTH = 24; //bytes
var PACKET_HEADER_LENGTH = 16; //bytes

function onError(err) {
  this.emit('error', err);
}

function onEnd() {
  this.emit('end');
}

function onData(data) {
  if (this.errored) {
    return;
  }

  updateBuffer.call(this, data);
  while (this.state.call(this)) {}
}

function updateBuffer(data) {
  if (data === null || data === undefined) {
    return;
  }

  if (this.buffer === null) {
    this.buffer = data;
  } else {
    var extendedBuffer = new Buffer(this.buffer.length + data.length);
    this.buffer.copy(extendedBuffer);
    data.copy(extendedBuffer, this.buffer.length);
    this.buffer = extendedBuffer;
  }
}

function parseGlobalHeader() {
  var buffer = this.buffer;

  if (buffer.length >= GLOBAL_HEADER_LENGTH) {
    var magicNumber = buffer.toString('hex', 0, 4);

    // determine pcap endianness
    if (magicNumber == "a1b2c3d4") {
      this.endianness = "BE";
    } else if (magicNumber == "d4c3b2a1") {
      this.endianness = "LE";
    } else {
      this.errored = true;
      this.stream.pause();
      var msg = util.format('unknown magic number: %s', magicNumber);
      this.emit('error', new Error(msg));
      onEnd.call(this);
      return false;
    }

    var header = {
      magicNumber: buffer['readUInt32' + this.endianness](0, true),
      majorVersion: buffer['readUInt16' + this.endianness](4, true),
      minorVersion: buffer['readUInt16' + this.endianness](6, true),
      gmtOffset: buffer['readInt32' + this.endianness](8, true),
      timestampAccuracy: buffer['readUInt32' + this.endianness](12, true),
      snapshotLength: buffer['readUInt32' + this.endianness](16, true),
      linkLayerType: buffer['readUInt32' + this.endianness](20, true)
    };

    if (header.majorVersion != 2 && header.minorVersion != 4) {
      this.errored = true;
      this.stream.pause();
      var msg = util.format('unsupported version %d.%d. pcap-parser only parses libpcap file format 2.4', header.majorVersion, header.minorVersion);
      this.emit('error', new Error(msg));
      onEnd.call(this);
    } else {
      this.emit('globalHeader', header);
      this.buffer = buffer.slice(GLOBAL_HEADER_LENGTH);
      this.state = parsePacketHeader;
      return true;
    }
  }

  return false;
}

function parsePacketHeader() {
  var buffer = this.buffer;

  if (buffer.length >= PACKET_HEADER_LENGTH) {
    var header = {
      timestampSeconds: buffer['readUInt32' + this.endianness](0, true),
      timestampMicroseconds: buffer['readUInt32' + this.endianness](4, true),
      capturedLength: buffer['readUInt32' + this.endianness](8, true),
      originalLength: buffer['readUInt32' + this.endianness](12, true)
    };

    this.currentPacketHeader = header;
    this.emit('packetHeader', header);
    this.buffer = buffer.slice(PACKET_HEADER_LENGTH);
    this.state = parsePacketBody;
    return true;
  }

  return false;
}

function parsePacketBody() {
  var buffer = this.buffer;

  if (buffer.length >= this.currentPacketHeader.capturedLength) {
    var data = buffer.slice(0, this.currentPacketHeader.capturedLength);

    this.emit('packetData', data);
    this.emit('packet', {
      header: this.currentPacketHeader,
      data: data
    });

    this.buffer = buffer.slice(this.currentPacketHeader.capturedLength);
    this.state = parsePacketHeader;
    return true;
  }

  return false;
}

function Parser(input) {
  if (typeof(input) == 'string') {
    this.stream = fs.createReadStream(input);
  } else {
    // assume a ReadableStream
    this.stream = input;
  }

  this.stream.pause();
  this.stream.on('data', onData.bind(this));
  this.stream.on('error', onError.bind(this));
  this.stream.on('end', onEnd.bind(this));

  this.buffer = null;
  this.state = parseGlobalHeader;
  this.endianness = null;

  process.nextTick(this.stream.resume.bind(this.stream));
}
util.inherits(Parser, events.EventEmitter);

exports.parse = function (input) {
  return new Parser(input);
}

}).call(this,require('_process'),require("buffer").Buffer)
},{"_process":40,"buffer":33,"events":37,"fs":31,"util":55}],7:[function(require,module,exports){
var EthernetAddr = require("./ethernet_addr");
var IPv4Addr = require("./ipv4_addr");

function Arp() {
    this.htype = null;
    this.ptype = null;
    this.heln = null;
    this.plen = null;
    this.operation = null;
    this.sender_ha = null;
    this.sender_pa = null;
    this.target_ha = null;
    this.target_pa = null;
}

// http://en.wikipedia.org/wiki/Address_Resolution_Protocol
Arp.prototype.decode = function (raw_packet, offset) {
    this.htype = raw_packet.readUInt16BE(offset);
    this.ptype = raw_packet.readUInt16BE(offset + 2);
    this.hlen = raw_packet[offset + 4];
    this.plen = raw_packet[offset + 5];
    this.operation = raw_packet.readUInt16BE(offset + 6); // 6, 7
    if (this.hlen === 6 && this.plen === 4) { // ethernet + IPv4
        this.sender_ha = new EthernetAddr(raw_packet, offset + 8); // 8, 9, 10, 11, 12, 13
        this.sender_pa = new IPv4Addr(raw_packet, offset + 14); // 14, 15, 16, 17
        this.target_ha = new EthernetAddr(raw_packet, offset + 18); // 18, 19, 20, 21, 22, 23
        this.target_pa = new IPv4Addr(raw_packet, offset + 24); // 24, 25, 26, 27
    }
    // don't know how to decode more exotic ARP types yet, but please add them

    return this;
};

Arp.prototype.toString = function () {
    var ret = "";
    if (this.operation === 1) {
        ret += "request";
    } else if (this.operation === 2) {
        ret += "reply";
    } else {
        ret += "unknown";
    }

    if (this.sender_ha && this.sender_pa) {
        ret += " sender " + this.sender_ha + " " + this.sender_pa + " target " + this.target_ha +
            " " + this.target_pa;
    }

    return ret;
};

module.exports = Arp;

},{"./ethernet_addr":9,"./ipv4_addr":15}],8:[function(require,module,exports){
var IPv4Addr = require("./ipv4_addr");
var IPv6Addr = require("./ipv6_addr");

function DNSHeader(raw_packet, offset) {
    this.id = raw_packet.readUInt16BE(offset); // 0, 1
    this.qr = (raw_packet[offset + 2] & 128) >> 7;
    this.opcode = (raw_packet[offset + 2] & 120) >> 3;
    this.aa = (raw_packet[offset + 2] & 4) >> 2;
    this.tc = (raw_packet[offset + 2] & 2) >> 1;
    this.rd = raw_packet[offset + 2] & 1;
    this.ra = (raw_packet[offset + 3] & 128) >> 7;
    this.z = 0; // spec says this MUST always be 0
    this.rcode = raw_packet[offset + 3] & 15;
    this.qdcount = raw_packet.readUInt16BE(offset + 4); // 4, 5
    this.ancount = raw_packet.readUInt16BE(offset + 6); // 6, 7
    this.nscount = raw_packet.readUInt16BE(offset + 8); // 8, 9
    this.arcount = raw_packet.readUInt16BE(offset + 10); // 10, 11
}

DNSHeader.prototype.toString = function () {
    return "{" +
        " id:" + this.id +
        " qr:" + this.qr +
        " op:" + this.opcode +
        " aa:" + this.aa +
        " tc:" + this.tc +
        " rd:" + this.rd +
        " ra:" + this.ra +
        " rc:" + this.rcode +
        " qd:" + this.qdcount +
        " an:" + this.ancount +
        " ns:" + this.nscount +
        " ar:" + this.arcount +
        " }";
};

function DNS() {
    this.header = null;
    this.question = null;
    this.answer = null;
    this.authority = null;
    this.additional = null;

    // not part of DNS, but handy so we don't have to pass these around all over the place
    this.raw_packet = null;
    this.offset = null;
    this.packet_start = null;
    this.packet_len = null;
}

function DNSRRSet(count) {
    this.rrs = new Array(count);
}

DNSRRSet.prototype.toString = function () {
    return this.rrs.join(", ");
};

// http://tools.ietf.org/html/rfc1035
DNS.prototype.decode = function (raw_packet, offset, caplen) {
    this.raw_packet = raw_packet;
    this.packet_start = offset;
    this.offset = offset;
    this.packet_len = caplen;

    this.header = new DNSHeader(raw_packet, this.offset);
    this.offset += 12;

    this.question = this.decode_RRs(this.header.qdcount, true);
    this.answer = this.decode_RRs(this.header.ancount, false);
    this.authority = this.decode_RRs(this.header.nscount, false);
    this.additional = this.decode_RRs(this.header.arcount, false);

    return this;
};

DNS.prototype.decode_RRs = function (count, is_question) {
    if (count > 100) {
        throw new Error("Malformed DNS packet: too many RRs at offset " + this.offset);
    }

    var ret = new DNSRRSet(count);
    for (var i = 0; i < count; i++) {
        ret.rrs[i] = this.decode_RR(is_question);
    }
    return ret;
};

function DNSRR(is_question) {
    this.name = "";
    this.type = null;
    this.class = null;
    this.ttl = null;
    this.rdlength = null;
    this.rdata = null;
    this.is_question = is_question;
}

DNSRR.prototype.toString = function () {
    var ret = this.name + " ";
    if (this.is_question) {
        ret += qtype_to_string(this.type) + " " + qclass_to_string(this.class);
    } else {
        ret += type_to_string(this.type) + " " + class_to_string(this.class) + " " + this.ttl + " " + this.rdata;
    }
    return ret;
};

DNS.prototype.read_name = function () {
    var result = "";
    var len_or_ptr;
    var pointer_follows = 0;
    var pos = this.offset;

    while ((len_or_ptr = this.raw_packet[pos]) !== 0x00) {
        if ((len_or_ptr & 0xC0) === 0xC0) {
            // pointer is bottom 6 bits of current byte, plus all 8 bits of next byte
            pos = ((len_or_ptr & ~0xC0) << 8) | this.raw_packet[pos + 1];
            pointer_follows++;
            if (pointer_follows === 1) {
                this.offset += 2;
            }
            if (pointer_follows > 5) {
                throw new Error("invalid DNS RR: too many compression pointers found at offset " + pos);
            }
        } else {
            if (result.length > 0) {
                result += ".";
            }
            if (len_or_ptr > 63) {
                throw new Error("invalid DNS RR: length is too large at offset " + pos);
            }
            pos++;
            for (var i = pos; i < (pos + len_or_ptr) && i < this.packet_len ; i++) {
                if (i > this.packet_len) {
                    throw new Error("invalid DNS RR: read beyond end of packet at offset " + i);
                }
                var ch = this.raw_packet[i];
                result += String.fromCharCode(ch);
            }
            pos += len_or_ptr;

            if (pointer_follows === 0) {
                this.offset = pos;
            }
        }
    }

    if (pointer_follows === 0) {
        this.offset++;
    }

    return result;
};

DNS.prototype.decode_RR = function (is_question) {
    if (this.offset > this.packet_len) {
        throw new Error("Malformed DNS RR. Offset is beyond packet len (decode_RR) :" + this.offset + " packet_len:" + this.packet_len);
    }

    var rr = new DNSRR(is_question);

    rr.name = this.read_name();

    rr.type = this.raw_packet.readUInt16BE(this.offset);
    this.offset += 2;
    rr.class = this.raw_packet.readUInt16BE(this.offset);
    this.offset += 2;
    if (is_question) {
        return rr;
    }

    rr.ttl = this.raw_packet.readUInt32BE(this.offset);
    this.offset += 4;
    rr.rdlength = this.raw_packet.readUInt16BE(this.offset);
    this.offset += 2;

    if (rr.type === 1 && rr.class === 1 && rr.rdlength) { // A, IN
        rr.rdata = new IPv4Addr(this.raw_packet, this.offset);
    } else if (rr.type === 2 && rr.class === 1) { // NS, IN
        rr.rdata = this.read_name();
        this.offset -= rr.rdlength; // read_name moves offset
    } else if (rr.type === 28 && rr.class === 1 && rr.rdlength === 16) {
        rr.data = new IPv6Addr(this.raw_packet, this.offset);
    }
    // TODO - decode other rr types

    this.offset += rr.rdlength;

    return rr;
};

DNS.prototype.toString = function () {
    var ret = " DNS ";

    ret += this.header.toString();
    if (this.header.qdcount > 0) {
        ret += "\n  question:" + this.question.rrs[0];
    }
    if (this.header.ancount > 0) {
        ret += "\n  answer:" + this.answer;
    }
    if (this.header.nscount > 0) {
        ret += "\n  authority:" + this.authority;
    }
    if (this.header.arcount > 0) {
        ret += "\n  additional:" + this.additional;
    }

    return ret;
};

function type_to_string(type_num) {
    switch (type_num) {
    case 1:
        return "A";
    case 2:
        return "NS";
    case 3:
        return "MD";
    case 4:
        return "MF";
    case 5:
        return "CNAME";
    case 6:
        return "SOA";
    case 7:
        return "MB";
    case 8:
        return "MG";
    case 9:
        return "MR";
    case 10:
        return "NULL";
    case 11:
        return "WKS";
    case 12:
        return "PTR";
    case 13:
        return "HINFO";
    case 14:
        return "MINFO";
    case 15:
        return "MX";
    case 16:
        return "TXT";
    case 28:
        return "AAAA";
    default:
        return ("Unknown (" + type_num + ")");
    }
}

function qtype_to_string(qtype_num) {
    switch (qtype_num) {
    case 252:
        return "AXFR";
    case 253:
        return "MAILB";
    case 254:
        return "MAILA";
    case 255:
        return "*";
    default:
        return type_to_string(qtype_num);
    }
}

function class_to_string(class_num) {
    switch (class_num) {
    case 1:
        return "IN";
    case 2:
        return "CS";
    case 3:
        return "CH";
    case 4:
        return "HS";
    default:
        return "Unknown (" + class_num + ")";
    }
}

function qclass_to_string(qclass_num) {
    if (qclass_num === 255) {
        return "*";
    } else {
        return class_to_string(qclass_num);
    }
}

module.exports = DNS;

},{"./ipv4_addr":15,"./ipv6_addr":17}],9:[function(require,module,exports){
var util = require("../util");

function EthernetAddr(raw_packet, offset) {
	this.addr = new Array(6);
	this.addr[0] = raw_packet[offset];
	this.addr[1] = raw_packet[offset + 1];
	this.addr[2] = raw_packet[offset + 2];
	this.addr[3] = raw_packet[offset + 3];
	this.addr[4] = raw_packet[offset + 4];
	this.addr[5] = raw_packet[offset + 5];
}

EthernetAddr.prototype.toString = function () {
	return util.int8_to_hex[this.addr[0]] + ":" +
		util.int8_to_hex[this.addr[1]] + ":" +
		util.int8_to_hex[this.addr[2]] + ":" +
		util.int8_to_hex[this.addr[3]] + ":" +
		util.int8_to_hex[this.addr[4]] + ":" +
		util.int8_to_hex[this.addr[5]];
};

module.exports = EthernetAddr;

},{"../util":30}],10:[function(require,module,exports){
var EthernetAddr = require("./ethernet_addr");
var IPv4 = require("./ipv4");
var IPv6 = require("./ipv6");
var Arp = require("./arp");
var Vlan = require("./vlan");

function EthernetPacket() {
    this.dhost = null;
    this.shost = null;
    this.ethertype = null;
    this.vlan = null;
    this.payload = null;
}

EthernetPacket.prototype.decode = function (raw_packet, offset) {
    this.dhost = new EthernetAddr(raw_packet, offset);
    offset += 6;
    this.shost = new EthernetAddr(raw_packet, offset);
    offset += 6;
    this.ethertype = raw_packet.readUInt16BE(offset, true);
    offset += 2;

    if (this.ethertype === 0x8100) { // VLAN-tagged (802.1Q)
        this.vlan = new Vlan().decode(raw_packet, offset);
        offset += 2;

        // Update the ethertype
        this.ethertype = raw_packet.readUInt16BE(offset, true);
        offset += 2;
    }

    if (this.ethertype < 1536) {
        // this packet is actually some 802.3 type without an ethertype
        this.ethertype = 0;
    } else {
        // http://en.wikipedia.org/wiki/EtherType
        switch (this.ethertype) {
        case 0x800: // IPv4
            this.payload = new IPv4().decode(raw_packet, offset);
            break;
        case 0x806: // ARP
            this.payload = new Arp().decode(raw_packet, offset);
            break;
        case 0x86dd: // IPv6 - http://en.wikipedia.org/wiki/IPv6
            this.payload = new IPv6().decode(raw_packet, offset);
            break;
        case 0x88cc: // LLDP - http://en.wikipedia.org/wiki/Link_Layer_Discovery_Protocol
            this.payload = "need to implement LLDP";
            break;
        default:
            console.log("node_pcap: EthernetFrame() - Don't know how to decode ethertype " + this.ethertype);
        }
    }

    return this;
};

EthernetPacket.prototype.toString = function () {
    var ret = this.shost + " -> " + this.dhost;
    if (this.vlan) {
        ret += " vlan " + this.vlan;
    }
    switch (this.ethertype) {
    case 0x800:
        ret += " IPv4";
        break;
    case 0x806:
        ret += " ARP";
        break;
    case 0x86dd:
        ret += " IPv6";
        break;
    case 0x88cc:
        ret += " LLDP";
        break;
    default:
        ret += " ethertype " + this.ethertype;
    }
    return ret + " " + this.payload.toString();
};

module.exports = EthernetPacket;

},{"./arp":7,"./ethernet_addr":9,"./ipv4":14,"./ipv6":16,"./vlan":28}],11:[function(require,module,exports){
function ICMP() {
    this.type = null;
    this.code = null;
    this.checksum = null;
    this.id = null;
    this.sequence = null;
}

// http://en.wikipedia.org/wiki/Internet_Control_Message_Protocol
ICMP.prototype.decode = function (raw_packet, offset) {
    this.type = raw_packet[offset];
    this.code = raw_packet[offset + 1];
    this.checksum = raw_packet.readUInt16BE(offset + 2); // 2, 3
    this.id = raw_packet.readUInt16BE(offset + 4); // 4, 5
    this.sequence = raw_packet.readUInt16BE(offset + 6); // 6, 7

    return this;
};

ICMP.prototype.toString = function () {
    var ret = "";

    switch (this.type) {
    case 0:
        ret += "Echo Reply";
        break;
    case 1:
    case 2:
        ret += "Reserved";
        break;
    case 3: // destination unreachable
        switch (this.code) {
        case 0:
            ret += "Destination Network Unreachable";
            break;
        case 1:
            ret += "Destination Host Unreachable";
            break;
        case 2:
            ret += "Destination Protocol Unreachable";
            break;
        case 3:
            ret += "Destination Port Unreachable";
            break;
        case 4:
            ret += "Fragmentation required, and DF flag set";
            break;
        case 5:
            ret += "Source route failed";
            break;
        case 6:
            ret += "Destination network unknown";
            break;
        case 7:
            ret += "Destination host unknown";
            break;
        case 8:
            ret += "Source host isolated";
            break;
        case 9:
            ret += "Network administratively prohibited";
            break;
        case 10:
            ret += "Host administratively prohibited";
            break;
        case 11:
            ret += "Network unreachable for TOS";
            break;
        case 12:
            ret += "Host unreachable for TOS";
            break;
        case 13:
            ret += "Communication administratively prohibited";
            break;
        default:
            ret += "Destination Unreachable (unknown code " + this.code + ")";
        }
        break;
    case 4:
        ret += "Source Quench";
        break;
    case 5: // redirect
        switch (ret.code) {
        case 0:
            ret += "Redirect Network";
            break;
        case 1:
            ret += "Redirect Host";
            break;
        case 2:
            ret += "Redirect TOS and Network";
            break;
        case 3:
            ret += "Redirect TOS and Host";
            break;
        default:
            ret += "Redirect (unknown code " + ret.code + ")";
            break;
        }
        break;
    case 6:
        ret += "Alternate Host Address";
        break;
    case 7:
        ret += "Reserved";
        break;
    case 8:
        ret += "Echo Request";
        break;
    case 9:
        ret += "Router Advertisement";
        break;
    case 10:
        ret += "Router Solicitation";
        break;
    case 11:
        switch (this.code) {
        case 0:
            ret += "TTL expired in transit";
            break;
        case 1:
            ret += "Fragment reassembly time exceeded";
            break;
        default:
            ret += "Time Exceeded (unknown code " + this.code + ")";
        }
        break;
        // TODO - decode the rest of the well-known ICMP messages, even though they are deprecated
    default:
        ret += "type " + this.type + " code " + this.code;
    }

    // TODO - there are often more exciting things hiding in ICMP packets after the headers
    return ret;
};

module.exports = ICMP;

},{}],12:[function(require,module,exports){
function IGMP() {
    this.type = null;
    this.version = null;
    this.max_response_time = null;
    this.checksum = null;
    this.group_address = null;
}

var IPV4Addr = require("./ipv4_addr");

// http://en.wikipedia.org/wiki/Internet_Group_Management_Protocol
IGMP.prototype.decode = function (raw_packet, offset) {
    this.type = raw_packet[offset];
    this.max_response_time = raw_packet[offset + 1];
    this.checksum = raw_packet.readUInt16BE(offset + 2); // 2, 3
    this.group_address = new IPV4Addr(raw_packet, offset + 4); // 4, 5, 6, 7

    switch (this.type) {
    case 0x11:
        this.version = this.max_response_time > 0 ? 2 : 1;
        break;
    case 0x12:
        this.version = 1;
        break;
    case 0x16:
        this.version = 2;
        break;
    case 0x17:
        this.version = 2;
        break;
    case 0x22:
        this.version = 3;
        break;
    default:
        break;
    }

    return this;
};

IGMP.prototype.toString = function () {
    var ret;

    switch (this.type) {
    case 0x11:
        ret = "Membership Query";
        break;
    case 0x12:
        ret = "Membership Report";
        break;
    case 0x16:
        ret = "Membership Report";
        break;
    case 0x17:
        ret = "Leave Group";
        break;
    case 0x22:
        ret = "Membership Report";
        // TODO: Decode v3 message
        break;
    default:
        ret = "type " + this.type;
        break;
    }

    return ret;
};

module.exports = IGMP;

},{"./ipv4_addr":15}],13:[function(require,module,exports){
// convert binary capture data into objects with friendly names

exports.EthernetPacket = require("./ethernet_packet");
exports.IPv4Packet = require("./ipv4");
exports.IPv6Packet = require("./ipv6");
exports.ArpPacket = require("./arp");
exports.PcapPacket = require("./pcap_packet");
var PcapPacket = exports.PcapPacket;

function decode(packet) {
    return new PcapPacket().decode(packet);
}

exports.decode = decode;
exports.decode.packet = decode;

},{"./arp":7,"./ethernet_packet":10,"./ipv4":14,"./ipv6":16,"./pcap_packet":20}],14:[function(require,module,exports){
var ICMP = require("./icmp");
var IGMP = require("./igmp");
var TCP = require("./tcp");
var UDP = require("./udp");
var IPv6 = require("./ipv6");
var IPv4Addr = require("./ipv4_addr");

function IPFlags() {
    this.reserved = null;
    this.df = null;
    this.mf = null;
}

IPFlags.prototype.toString = function () {
    var ret = "[";
    if (this.reserved) {
        ret += "r";
    }
    if (this.df) {
        ret += "d";
    }
    if (this.mf) {
        ret += "m";
    }
    ret += "]";
    return ret;
};

function IPv4() {
    this.version = null;
    this.header_length = null;
    this.header_bytes = null; // not part of packet, but handy
    this.diffserv = null;
    this.total_length = null;
    this.identification = null;
    this.flags = new IPFlags();
    this.fragment_offset = null;
    this.ttl = null;
    this.protocol = null;
    this.header_checksum = null;
    this.saddr = null;
    this.daddr = null;
    this.protocol_name = null;
    this.payload = null;
}

// http://en.wikipedia.org/wiki/IPv4
IPv4.prototype.decode = function (raw_packet, offset) {
    var orig_offset = offset;

    this.version = (raw_packet[offset] & 240) >> 4; // first 4 bits
    this.header_length = raw_packet[offset] & 15; // second 4 bits
    this.header_bytes = this.header_length * 4;
    offset += 1;
    this.diffserv = raw_packet[offset];
    offset += 1;
    this.total_length = raw_packet.readUInt16BE(offset, true);
    offset += 2;
    this.identification = raw_packet.readUInt16BE(offset, true);
    offset += 2;
    this.flags.reserved = (raw_packet[offset] & 128) >> 7;
    this.flags.df = (raw_packet[offset] & 64) >> 6;
    this.flags.mf = (raw_packet[offset] & 32) >> 5;
    this.fragment_offset = ((raw_packet[offset] & 31) * 256) + raw_packet[offset + 1]; // 13-bits from 6, 7
    offset += 2;
    this.ttl = raw_packet[offset];
    offset += 1;
    this.protocol = raw_packet[offset];
    offset += 1;
    this.header_checksum = raw_packet.readUInt16BE(offset, true);
    offset += 2;
    this.saddr = new IPv4Addr(raw_packet, offset);
    offset += 4;
    this.daddr = new IPv4Addr(raw_packet, offset);
    offset += 4;

    // TODO - parse IP "options" if header_length > 5

    offset = orig_offset + (this.header_length * 4);

    switch (this.protocol) {
    case 1:
        this.payload = new ICMP();
        this.payload.decode(raw_packet, offset);
        break;
    case 2:
        this.payload = new IGMP().decode(raw_packet, offset);
        break;
    case 4:
        this.payload = new IPv4().decode(raw_packet, offset);
        break;
    case 6:
        this.payload = new TCP().decode(raw_packet, offset, this.total_length - this.header_bytes);
        break;
    case 17:
        this.payload = new UDP().decode(raw_packet, offset);
        break;
    case 41:
        this.payload = new IPv6().decode(raw_packet, offset);
        break;
    default:
        this.protocol_name = "Unknown";
    }

    return this;
};

IPv4.prototype.toString = function () {
    var ret = this.saddr + " -> " + this.daddr;
    var flags = this.flags.toString();
    if (flags.length > 2) {
        ret += " flags " + flags;
    }

    switch (this.protocol) {
    case 1:
        ret += " ICMP";
        break;
    case 2:
        ret += " IGMP";
        break;
    case 4:
        ret += " IPv4_in_IPv4"; // IPv4 encapsulation, RFC2003
        break;
    case 6:
        ret += " TCP";
        break;
    case 17:
        ret += " UDP";
        break;
    case 41:
        ret += " IPv6_in_IP4"; // IPv6 encapsulation, RFC2473
        break;
    default:
        ret += " proto " + this.protocol;
    }

    return ret + " " + this.payload;
};

module.exports = IPv4;

},{"./icmp":11,"./igmp":12,"./ipv4_addr":15,"./ipv6":16,"./tcp":26,"./udp":27}],15:[function(require,module,exports){
var map = require("../util").int8_to_dec;

function IPv4Addr(raw_packet, offset) {
	this.o1	= raw_packet[offset];
	this.o2	= raw_packet[offset + 1];
	this.o3	= raw_packet[offset + 2];
	this.o4	= raw_packet[offset + 3];
}

// Don't use Array.prototype.join here, because string concat is much faster
IPv4Addr.prototype.toString = function () {
    return map[this.o1] + "." + map[this.o2] + "." + map[this.o3] + "." + map[this.o4];
};

module.exports = IPv4Addr;

},{"../util":30}],16:[function(require,module,exports){
var ICMP = require("./icmp");
var IGMP = require("./igmp");
var TCP = require("./tcp");
var UDP = require("./udp");
var IPv4 = require("./ipv4");
var IPv6Addr = require("./ipv6_addr");

function IPv6Header() {

}

IPv6Header.prototype.decode = function (raw_packet, next_header, ip, offset) {
    switch (next_header) {
    case 1:
        ip.payload = new ICMP().decode(raw_packet, offset);
        break;
    case 2:
        ip.payload = new IGMP().decode(raw_packet, offset);
        break;
    case 4:
        ip.payload = new IPv4().decode(raw_packet, offset); // IPv4 encapsulation, RFC2003
        break;
    case 6:
        ip.payload = new TCP().decode(raw_packet, offset, ip);
        break;
    case 17:
        ip.payload = new UDP().decode(raw_packet, offset);
        break;
    case 41:
        ip.payload = new IPv6().decode(raw_packet, offset); // IPv6 encapsulation, RFC2473
        break;
    /* Please follow numbers and RFC in http://www.iana.org/assignments/ipv6-parameters/ipv6-parameters.xhtml#extension-header
     * Not all next protocols follow this rule (and we can have unsuported upper protocols here too).
     *  */
    case 0: //Hop-by-Hop
    case 60: //Destination Options
    case 43: //Routing
    case 135: //Mobility
    case 139: //Host Identity Protocol. //Discussion: rfc5201 support only No Next Header/trailing data, but future documents May do.
    case 140: //Shim6 Protocol
        new IPv6Header().decode(raw_packet, raw_packet[offset], ip, offset + 8*raw_packet[offset+1] + 8);
        break;
    case 51: //Authentication Header
        new IPv6Header().decode(raw_packet, raw_packet[offset], ip, offset + 4*raw_packet[offset+1] + 8);
        break;
    default:
        // 59 - No next Header, and unknowed upper layer protocols, do nothing.
    }
};

function IPv6() {

}

IPv6.prototype.decode = function (raw_packet, offset) {

    // http://en.wikipedia.org/wiki/IPv6
    this.version = (raw_packet[offset] & 240) >> 4; // first 4 bits
    this.traffic_class = ((raw_packet[offset] & 15) << 4) + ((raw_packet[offset+1] & 240) >> 4);
    this.flow_label = ((raw_packet[offset + 1] & 15) << 16) +
        (raw_packet[offset + 2] << 8) +
        raw_packet[offset + 3];
    this.payload_length = raw_packet.readUInt16BE(offset+4, true);
    this.total_length = this.payload_length + 40;
    this.next_header = raw_packet[offset+6];
    this.hop_limit = raw_packet[offset+7];
    this.saddr = new IPv6Addr().decode(raw_packet, offset+8);
    this.daddr = new IPv6Addr().decode(raw_packet, offset+24);
    this.header_bytes = 40;

    new IPv6Header().decode(raw_packet, this.next_header, this, offset+40);
    return this;
};

IPv6.prototype.toString = function () {
    var ret = this.saddr + " -> " + this.daddr;

    switch (this.next_header) {
    case 1:
        ret += " ICMP";
        break;
    case 2:
        ret += " IGMP";
        break;
    case 4:
        ret += " IPv4_in_IPv6"; // IPv4 encapsulation, RFC2003
        break;
    case 6:
        ret += " TCP";
        break;
    case 17:
        ret += " UDP";
        break;
    case 41:
        ret += " IPv6_in_IPv6"; // IPv6 encapsulation, RFC2473
        break;
    default:
        ret += " proto " + this.next_header;
    }

    return ret + " " + this.payload;
};

module.exports = IPv6;

},{"./icmp":11,"./igmp":12,"./ipv4":14,"./ipv6_addr":17,"./tcp":26,"./udp":27}],17:[function(require,module,exports){
var map = require("../util").int8_to_hex_nopad;

function IPv6Addr() {
    this.o1 = null;
    this.o2 = null;
    this.o3 = null;
    this.o4 = null;
    this.o5 = null;
    this.o6 = null;
    this.o7 = null;
    this.o8 = null;
}

IPv6Addr.prototype.decode = function (raw_packet, offset) {
    this.o1 = raw_packet.readUInt16LE[offset];
    this.o2 = raw_packet.readUInt16LE[offset + 2];
    this.o3 = raw_packet.readUInt16LE[offset + 4];
    this.o4 = raw_packet.readUInt16LE[offset + 6];
    this.o5 = raw_packet.readUInt16LE[offset + 8];
    this.o6 = raw_packet.readUInt16LE[offset + 10];
    this.o7 = raw_packet.readUInt16LE[offset + 12];
    this.o8 = raw_packet.readUInt16LE[offset + 14];

    return this;
};

function format(num) {
    var p1 = (num & 0xff00) >> 8;
    var p2 = num & 0x00ff;
    if (p1 === 0) {
        return map[p2];
    } else {
        return map[p1] + map[p2];
    }
}

IPv6Addr.prototype.toString = function () {
    return format(this.o1) + ":" + format(this.o2) + ":" + format(this.o3) + ":" + format(this.o4) + ":" +
        format(this.o5) + ":" + format(this.o6) + ":" + format(this.o7) + ":" + format(this.o8);
};

module.exports = IPv6Addr;

},{"../util":30}],18:[function(require,module,exports){
var IPv4 = require("./ipv4");

function LogicalLinkControl() {
    this.dsap = null;
    this.ssap = null;
    this.control_field = null;
    this.org_code = null;
    this.type = null;
}

LogicalLinkControl.prototype.decode = function (raw_packet, offset) {
    this.dsap = raw_packet[offset++];
    this.ssap = raw_packet[offset++];

    if (((this.dsap === 0xaa) && (this.ssap === 0xaa)) || ((this.dsap === 0x00) && (this.ssap === 0x00))) {
        this.control_field = raw_packet[offset++];
        this.org_code = [
            raw_packet[offset++],
            raw_packet[offset++],
            raw_packet[offset++]
        ];
        this.type = raw_packet.readUInt16BE(raw_packet, offset);
        offset += 2;

        switch (this.type) {
        case 0x0800: // IPv4
            this.payload = new IPv4().decode(raw_packet, offset);
            break;
        }
    } else {
        throw new Error("Unknown LLC types: DSAP: " + this.dsap + ", SSAP: " + this.ssap);
    }

    return this;
};

},{"./ipv4":14}],19:[function(require,module,exports){
var IPv4 = require("./ipv4");
var IPv6 = require("./ipv6");

function NullPacket() {
    this.pftype = null;
    this.payload = null;
}

// an oddity about nulltype is that it starts with a 4 byte header, but I can't find a
// way to tell which byte order is used.  The good news is that all address family
// values are 8 bits or less.
NullPacket.prototype.decode = function (raw_packet, offset) {
    if (raw_packet[offset] === 0 && raw_packet[offset + 1] === 0) { // must be one of the endians
        this.pftype = raw_packet[offset + 3];
    } else {                                          // and this is the other one
        this.pftype = raw_packet[offset];
    }

    if (this.pftype === 2) {         // AF_INET, at least on my Linux and OSX machines right now
        this.payload = new IPv4().decode(raw_packet, offset + 4);
    } else if (this.pftype === 30) { // AF_INET6, often
        this.payload = new IPv6().decode(raw_packet, offset + 4);
    } else {
        console.log("pcap.js: decode.nulltype() - Don't know how to decode protocol family " + this.pftype);
    }

    return this;
};

NullPacket.prototype.toString = function () {
    return this.pftype + " " + this.payload;
};

module.exports = NullPacket;

},{"./ipv4":14,"./ipv6":16}],20:[function(require,module,exports){
var EthernetPacket = require("./ethernet_packet");
var NullPacket = require("./null_packet");
var RawPacket = require("./raw_packet");
var RadioPacket = require("./radio_packet");
var SLLPacket = require("./sll_packet");

// Setting properties from the C++ side is very slow, so we send in a shared Buffer.
// The C++ side does this:
//   memcpy(session->header_data, &(pkthdr->ts.tv_sec), 4);
//   memcpy(session->header_data + 4, &(pkthdr->ts.tv_usec), 4);
//   memcpy(session->header_data + 8, &(pkthdr->caplen), 4);
//   memcpy(session->header_data + 12, &(pkthdr->len), 4);
// And here we unpack those 4 ints from the buffer.

function PcapHeader(raw_header) {
    this.tv_sec = raw_header.readUInt32LE(0, true);
    this.tv_usec = raw_header.readUInt32LE(4, true);
    this.caplen = raw_header.readUInt32LE(8, true);
    this.len = raw_header.readUInt32LE(12, true);
}

function PcapPacket() {
    this.link_type = null;
    this.pcap_header = null;
    this.payload = null;
}

PcapPacket.prototype.decode = function (packet_with_header) {
    this.link_type = packet_with_header.link_type;
    this.pcap_header = new PcapHeader(packet_with_header.header);

    var buf = packet_with_header.buf;

    switch (this.link_type) {
    case "LINKTYPE_ETHERNET":
        this.payload = new EthernetPacket().decode(buf, 0);
        break;
    case "LINKTYPE_NULL":
        this.payload = new NullPacket().decode(buf, 0);
        break;
    case "LINKTYPE_RAW":
        this.payload = new RawPacket().decode(buf, 0);
        break;
    case "LINKTYPE_IEEE802_11_RADIO":
        this.payload = new RadioPacket.decode(buf, 0);
        break;
    case "LINKTYPE_LINUX_SLL":
        this.payload = new SLLPacket().decode(buf, 0);
        break;
    default:
        console.log("node_pcap: PcapPacket.decode - Don't yet know how to decode link type " + this.link_type);
    }

    return this;
};

PcapPacket.prototype.toString = function () {
    return this.link_type + " " + this.payload;
};

module.exports = PcapPacket;

},{"./ethernet_packet":10,"./null_packet":19,"./radio_packet":22,"./raw_packet":23,"./sll_packet":25}],21:[function(require,module,exports){
var EthernetAddr = require('./ethernet_addr');
var LogicalLinkControl = require('./llc_packet');

function RadioFrame() {

}

RadioFrame.prototype.decode = function (raw_packet, offset) {
    var ret = {};

    ret.frameControl = raw_packet.readUInt16BE(offset, true);
    offset += 2;
    ret.type = (ret.frameControl >> 2) & 0x0003;
    ret.subType = (ret.frameControl >> 4) & 0x000f;
    ret.flags = (ret.frameControl >> 8) & 0xff;
    ret.duration = raw_packet.readUInt16BE(offset, true); offset += 2;
    ret.bssid = new EthernetAddr(raw_packet, offset); offset += 6;
    ret.shost = new EthernetAddr(raw_packet, offset); offset += 6;
    ret.dhost = new EthernetAddr(raw_packet, offset); offset += 6;
    ret.fragSeq = raw_packet.readUInt16BE(offset, true); offset += 2;

    var strength = raw_packet[22];
    ret.strength = -Math.abs(265 - strength);


    switch(ret.subType) {
        case 8: // QoS Data
            ret.qosPriority = raw_packet[offset++];
            ret.txop = raw_packet[offset++];
            break;
    }

    if (ret.type == 2 && ret.subType == 4) {
        // skip this is Null function (No data)
    } else if (ret.type == 2 && ret.subType == 12) {
        // skip this is QoS Null function (No data)
    } else if (ret.type == 2 && ret.subType == 7) {
        // skip this is CF-Ack/Poll
    } else if (ret.type == 2 && ret.subType == 6) {
        // skip this is CF-Poll (No data)
    } else if (ret.type == 2) { // data
        ret.llc = new LogicalLinkControl.decode(raw_packet, offset);
    }

    return ret;
};

module.exports = RadioFrame;

},{"./ethernet_addr":9,"./llc_packet":18}],22:[function(require,module,exports){
var RadioFrame = require('./radio_frame');

function RadioPacket() {

}

RadioPacket.prototype.decode = function (raw_packet, offset) {
    var ret = {};
    var original_offset = offset;

    ret.headerRevision = raw_packet[offset++];
    ret.headerPad = raw_packet[offset++];
    ret.headerLength = raw_packet.readUInt16BE(offset, true); offset += 2;

    offset = original_offset + ret.headerLength;

    ret.ieee802_11Frame = new RadioFrame().decode(raw_packet, offset);

    if(ret.ieee802_11Frame && ret.ieee802_11Frame.llc && ret.ieee802_11Frame.llc.ip) {
        ret.ip = ret.ieee802_11Frame.llc.ip;
        delete ret.ieee802_11Frame.llc.ip;
        ret.shost = ret.ieee802_11Frame.shost;
        delete ret.ieee802_11Frame.shost;
        ret.dhost = ret.ieee802_11Frame.dhost;
        delete ret.ieee802_11Frame.dhost;
    }

    return ret;
};

module.exports = RadioPacket;

},{"./radio_frame":21}],23:[function(require,module,exports){
var IPv4 = require("./ipv4");

function RawPacket() {
	this.payload = null;
}

RawPacket.prototype.decode = function (raw_packet, offset) {
	this.payload = new IPv4().decode(raw_packet, offset);
	return this;
};

module.exports = RawPacket;

},{"./ipv4":14}],24:[function(require,module,exports){
var util = require("../util");

function SLLAddr(raw_packet, offset, len) {
	this.addr = new Array(len);
    for (var i = 0; i < len; i++) {
    	this.addr[i] = raw_packet[offset + i];
    }
}

SLLAddr.prototype.toString = function () {
	var ret = "";
	for (var i = 0; i < this.addr.length - 1; i++) {
		ret += util.int8_to_hex[this.addr[i]] + ":";
	}
	ret += util.int8_to_hex[this.addr[i + 1]];
	return ret;
};

module.exports = SLLAddr;

},{"../util":30}],25:[function(require,module,exports){
// Synthetic Link Layer used by Linux to support the "any" pseudo device
// http://www.tcpdump.org/linktypes/LINKTYPE_LINUX_SLL.html

var SLLAddr = require("./sll_addr");
var IPv4 = require("./ipv4");
var IPv6 = require("./ipv6");
var Arp = require("./arp");

function SLLPacket () {
    this.packet_type = null;
    this.address_type = null;
    this.address_len = null;
    this.address = null;
    this.ethertype = null;
    this.payload = null;
}

SLLPacket.prototype.decode = function (raw_packet, offset) {
    this.packet_type = raw_packet.readUInt16BE(offset);
    offset += 2;
    this.address_type = raw_packet.readUInt16BE(offset);
    offset += 2;
    this.address_len = raw_packet.readUInt16BE(offset);
    offset += 2;
    this.address = new SLLAddr(raw_packet, offset, this.address_len);
    offset += 8; // address uses 8 bytes in frame, but only address_len bytes are significant
    this.ethertype = raw_packet.readUInt16BE(offset);
    offset += 2;

    if (this.ethertype < 1536) {
        // this packet is actually some 802.3 type without an ethertype
        this.ethertype = 0;
    } else {
        // http://en.wikipedia.org/wiki/EtherType
        switch (this.ethertype) {
        case 0x800: // IPv4
            this.payload = new IPv4().decode(raw_packet, offset);
            break;
        case 0x806: // ARP
            this.payload = new Arp().decode(raw_packet, offset);
            break;
        case 0x86dd: // IPv6 - http://en.wikipedia.org/wiki/IPv6
            this.payload = new IPv6().decode(raw_packet, offset);
            break;
        case 0x88cc: // LLDP - http://en.wikipedia.org/wiki/Link_Layer_Discovery_Protocol
            this.payload = "need to implement LLDP";
            break;
        default:
            console.log("node_pcap: SLLPacket() - Don't know how to decode ethertype " + this.ethertype);
        }
    }

    return this;
};

SLLPacket.prototype.toString = function () {
    var ret = "";

    switch (this.packet_type) {
    case 0:
        ret += "recv_us";
        break;
    case 1:
        ret += "broadcast";
        break;
    case 2:
        ret += "multicast";
        break;
    case 3:
        ret += "remote_remote";
        break;
    case 4:
        ret += "sent_us";
        break;
    }

    ret += " addrtype " + this.address_type;

    ret += " " + this.address;

    switch (this.ethertype) {
    case 0x800:
        ret += " IPv4";
        break;
    case 0x806:
        ret += " ARP";
        break;
    case 0x86dd:
        ret += " IPv6";
        break;
    case 0x88cc:
        ret += " LLDP";
        break;
    default:
        ret += " ethertype " + this.ethertype;
    }

    return ret + " " + this.payload.toString();
};

module.exports = SLLPacket;

},{"./arp":7,"./ipv4":14,"./ipv6":16,"./sll_addr":24}],26:[function(require,module,exports){

function TCPFlags() {
    this.cwr = null;
    this.ece = null;
    this.urg = null;
    this.ack = null;
    this.psh = null;
    this.rst = null;
    this.syn = null;
    this.fin = null;
}

TCPFlags.prototype.toString = function () {
    var ret = "[";

    if (this.cwr) {
        ret += "c";
    }
    if (this.ece) {
        ret += "e";
    }
    if (this.urg) {
        ret += "u";
    }
    if (this.ack) {
        ret += "a";
    }
    if (this.psh) {
        ret += "p";
    }
    if (this.rst) {
        ret += "r";
    }
    if (this.syn) {
        ret += "s";
    }
    if (this.fin) {
        ret += "f";
    }
    ret += "]";

    return ret;
};

function TCPOptions() {
    this.mss = null;
    this.window_scale = null;
    this.sack_ok = null;
    this.sack = null;
    this.timestamp = null;
    this.echo = null;
}

TCPOptions.prototype.decode = function (raw_packet, offset, len) {
    var end_offset = offset + len;

    while (offset < end_offset) {
        switch (raw_packet[offset]) {
        case 0: // end of options list
            offset = end_offset;
            break;
        case 1: // NOP / padding
            offset += 1;
            break;
        case 2:
            offset += 2;
            this.mss = raw_packet.readUInt16BE(offset);
            offset += 2;
            break;
        case 3:
            offset += 2;
            this.window_scale = raw_packet[offset];
            offset += 1;
            break;
        case 4:
            this.sack_ok = true;
            offset += 2;
            break;
        case 5:
            this.sack = [];
            offset += 1;
            switch (raw_packet[offset]) {
            case 10:
                offset += 1;
                this.sack.push([raw_packet.readUInt32BE(offset), raw_packet.readUInt32BE(offset + 4)]);
                offset += 8;
                break;
            case 18:
                offset += 1;
                this.sack.push([raw_packet.readUInt32BE(offset), raw_packet.readUInt32BE(offset + 4)]);
                offset += 8;
                this.sack.push([raw_packet.readUInt32BE(offset), raw_packet.readUInt32BE(offset + 4)]);
                offset += 8;
                break;
            case 26:
                offset += 1;
                this.sack.push([raw_packet.readUInt32BE(offset), raw_packet.readUInt32BE(offset + 4)]);
                offset += 8;
                this.sack.push([raw_packet.readUInt32BE(offset), raw_packet.readUInt32BE(offset + 4)]);
                offset += 8;
                this.sack.push([raw_packet.readUInt32BE(offset), raw_packet.readUInt32BE(offset + 4)]);
                offset += 8;
                break;
            case 34:
                offset += 1;
                this.sack.push([raw_packet.readUInt32BE(offset), raw_packet.readUInt32BE(offset + 4)]);
                offset += 8;
                this.sack.push([raw_packet.readUInt32BE(offset), raw_packet.readUInt32BE(offset + 4)]);
                offset += 8;
                this.sack.push([raw_packet.readUInt32BE(offset), raw_packet.readUInt32BE(offset + 4)]);
                offset += 8;
                this.sack.push([raw_packet.readUInt32BE(offset), raw_packet.readUInt32BE(offset + 4)]);
                offset += 8;
                break;
            default:
                console.log("Invalid TCP SACK option length " + raw_packet[offset + 1]);
                offset = end_offset;
            }
            break;
        case 8:
            offset += 2;
            this.timestamp = raw_packet.readUInt32BE(offset);
            offset += 4;
            this.echo = raw_packet.readUInt32BE(offset);
            offset += 4;
            break;
        default:
            throw new Error("Don't know how to process TCP option " + raw_packet[offset]);
        }
    }

    return this;
};

TCPOptions.prototype.toString = function () {
    var ret = "";
    if (this.mss !== null) {
        ret += "mss:" + this.mss + " ";
    }
    if (this.window_scale !== null) {
        ret += "scale:" + this.window_scale + "(" + Math.pow(2, (this.window_scale)) + ") ";
    }
    if (this.sack_ok !== null) {
        ret += "sack_ok" + " ";
    }
    if (this.sack !== null) {
        ret += "sack:" + this.sack.join(",") + " ";
    }

    if (ret.length === 0) {
        ret = ". ";
    }

    return "[" + ret.slice(0, -1) + "]";
};

function TCP() {
    this.sport          = null;
    this.dport          = null;
    this.seqno          = null;
    this.ackno          = null;
    this.data_offset    = null;
    this.header_bytes   = null; // not part of packet but handy
    this.reserved       = null;
    this.flags          = new TCPFlags();
    this.window_size    = null;
    this.checksum       = null;
    this.urgent_pointer = null;
    this.options        = null;
    this.data           = null;
    this.data_bytes     = null;
}

// If you get stuck trying to decode or understand the offset math, stick this block in to dump the contents:
// for (var i = orig_offset; i < orig_offset + len ; i++) {
//     console.log((i - orig_offset) + " / " + i + ": " + raw_packet[i] + " " + String.fromCharCode(raw_packet[i]));
// }

// http://en.wikipedia.org/wiki/Transmission_Control_Protocol
TCP.prototype.decode = function (raw_packet, offset, len) {
    var orig_offset = offset;

    this.sport          = raw_packet.readUInt16BE(offset, true); // 0, 1
    offset += 2;
    this.dport          = raw_packet.readUInt16BE(offset, true); // 2, 3
    offset += 2;
    this.seqno          = raw_packet.readUInt32BE(offset, true); // 4, 5, 6, 7
    offset += 4;
    this.ackno          = raw_packet.readUInt32BE(offset, true); // 8, 9, 10, 11
    offset += 4;
    this.data_offset    = (raw_packet[offset] & 0xf0) >> 4; // first 4 bits of 12
    if (this.data_offset < 5 || this.data_offset > 15) {
        throw new Error("invalid data_offset: " + this.data_offset);
    }
    this.header_bytes   = this.data_offset * 4; // convenience for using data_offset
    this.reserved       = raw_packet[offset] & 15; // second 4 bits of 12
    offset += 1;
    var all_flags = raw_packet[offset];
    this.flags.cwr      = (all_flags & 128) >> 7; // all flags packed into 13
    this.flags.ece      = (all_flags & 64) >> 6;
    this.flags.urg      = (all_flags & 32) >> 5;
    this.flags.ack      = (all_flags & 16) >> 4;
    this.flags.psh      = (all_flags & 8) >> 3;
    this.flags.rst      = (all_flags & 4) >> 2;
    this.flags.syn      = (all_flags & 2) >> 1;
    this.flags.fin      = all_flags & 1;
    offset += 1;
    this.window_size    = raw_packet.readUInt16BE(offset, true); // 14, 15
    offset += 2;
    this.checksum       = raw_packet.readUInt16BE(offset, true); // 16, 17
    offset += 2;
    this.urgent_pointer = raw_packet.readUInt16BE(offset, true); // 18, 19
    offset += 2;

    this.options = new TCPOptions();
    var options_len = this.header_bytes - (offset - orig_offset);
    if (options_len > 0) {
        this.options.decode(raw_packet, offset, options_len);
        offset += options_len;
    }

    this.data_bytes = len - this.header_bytes;
    if (this.data_bytes > 0) {
        // add a buffer slice pointing to the data area of this TCP packet.
        // Note that this does not make a copy, so ret.data is only valid for this current
        // trip through the capture loop.
        this.data = raw_packet.slice(offset, offset + this.data_bytes);
    }

    return this;
};

TCP.prototype.toString = function () {
    var ret = this.sport + "->" + this.dport + " seq " + this.seqno + " ack " + this.ackno + " flags " + this.flags + " " +
        "win " + this.window_size + " csum " + this.checksum;
    if (this.urgent_pointer) {
        ret += " urg " + this.urgent_pointer;
    }
    ret += " " + this.options.toString();
    ret += " len " + this.data_bytes;
    return ret;
};

// automatic protocol decode ends here.  Higher level protocols can be decoded by using payload.

module.exports = TCP;

},{}],27:[function(require,module,exports){
var DNS = require("./dns");

function UDP() {
    this.sport = null;
    this.dport = null;
    this.length = null;
    this.checksum = null;
    this.data = null;
}

// http://en.wikipedia.org/wiki/User_Datagram_Protocol
UDP.prototype.decode = function (raw_packet, offset) {
    this.sport = raw_packet.readUInt16BE(offset, true);
    offset += 2;
    this.dport = raw_packet.readUInt16BE(offset, true);
    offset += 2;
    this.length = raw_packet.readUInt16BE(offset, true);
    offset += 2;
    this.checksum = raw_packet.readUInt16BE(offset, true);
    offset += 2;

    this.data = raw_packet.slice(offset, offset + (this.length - 8));

    return this;
};

UDP.prototype.toString = function () {
    var ret = "UDP " + this.sport + "->" + this.dport + " len " + this.length;
    if (this.sport === 53 || this.dport === 53) {
        ret += (new DNS().decode(this.data, 0, this.data.length).toString());
    }
    return ret;
};

module.exports = UDP;

},{"./dns":8}],28:[function(require,module,exports){
function Vlan() {
	this.priority = null;
	this.canonical_format = null;
	this.id = null;
}

// http://en.wikipedia.org/wiki/IEEE_802.1Q
Vlan.prototype.decode = function (raw_packet, offset) {
    this.priority = (raw_packet[offset] & 0xE0) >> 5;
    this.canonical_format = (raw_packet[offset] & 0x10) >> 4;
    this.id = ((raw_packet[offset] & 0x0F) << 8) | raw_packet[offset + 1];

    return this;
};

Vlan.prototype.toString = function () {
	return this.priority + " " + this.canonical_format + " " + this.id;
};

module.exports = Vlan;

},{}],29:[function(require,module,exports){
var EventEmitter = require("events").EventEmitter;
var inherits = require("util").inherits;
var IPv4 = require("./decode/ipv4");
var TCP = require("./decode/tcp");

function TCPTracker() {
    this.sessions = {};
    EventEmitter.call(this);
}
inherits(TCPTracker, EventEmitter);

TCPTracker.prototype.track_packet = function (packet) {
    var ip, tcp, src, dst, key, session;

    if (packet.payload.payload instanceof IPv4 && packet.payload.payload.payload instanceof TCP) {
        ip  = packet.payload.payload;
        tcp = ip.payload;
        src = ip.saddr + ":" + tcp.sport;
        dst = ip.daddr + ":" + tcp.dport;

        if (src < dst) {
            key = src + "-" + dst;
        } else {
            key = dst + "-" + src;
        }

        var is_new = false;
        session = this.sessions[key];
        if (! session) {
            is_new = true;
            session = new TCPSession();
            this.sessions[key] = session;
        }

        session.track(packet);

        // need to track at least one packet before we emit this new session, otherwise nothing
        // will be initialized.
        if (is_new) {
            this.emit("session", session);
        }
    }
    // silently ignore any non IPv4 TCP packets
    // user should filter these out with their pcap filter, but oh well.
};

function TCPSession() {
    this.src = null;
    this.src_name = null; // from DNS
    this.dst = null;
    this.dst_name = null; // from DNS

    this.state = null;
    this.current_cap_time = null;

    this.syn_time = null;
    this.missed_syn = null;
    this.connect_time = null;

    this.send_isn = null;
    this.send_window_scale = null;
    this.send_packets = {}; // send_packets is indexed by the expected ackno: seqno + length
    this.send_acks = {};
    this.send_retrans = {};
    this.send_next_seq = null;
    this.send_acked_seq = null;
    this.send_bytes_ip = null;
    this.send_bytes_tcp = null;
    this.send_bytes_payload = 0;

    this.recv_isn = null;
    this.recv_window_scale = null;
    this.recv_packets = {};
    this.recv_acks = {};
    this.recv_retrans = {};
    this.recv_next_seq = null;
    this.recv_acked_seq = null;
    this.recv_bytes_ip = 0;
    this.recv_bytes_tcp = 0;
    this.recv_bytes_payload = 0;

    EventEmitter.call(this);
}
inherits(TCPSession, EventEmitter);

TCPSession.prototype.track = function (packet) {
    var ip  = packet.payload.payload;
    var tcp = ip.payload;
    var src = ip.saddr + ":" + tcp.sport;
    var dst = ip.daddr + ":" + tcp.dport;

    this.current_cap_time = packet.pcap_header.tv_sec + (packet.pcap_header.tv_usec / 1000000);

    if (this.state === null) {
        this.src = src; // the side the sent the first packet we saw
        this.src_name = src;
        this.dst = dst; // the side that the first packet we saw was sent to
        this.dst_name = dst;

        if (tcp.flags.syn && !tcp.flags.ack) { // initial SYN, best case
            this.state = "SYN_SENT";
        } else { // joining session already in progress
            this.missed_syn = true;
            this.connect_time = this.current_cap_time;
            this.state = "ESTAB";  // I mean, probably established, right? Unless it isn't.
        }

        this.syn_time = this.current_cap_time;
        this.send_isn = tcp.seqno;
        this.send_window_scale = tcp.options.window_scale || 1; // multipler, not bit shift value
        this.send_next_seq = tcp.seqno + 1;
        this.send_bytes_ip = ip.header_bytes;
        this.send_bytes_tcp = tcp.header_bytes;
    } else if (tcp.flags.syn && !tcp.flags.ack) {
        this.emit("syn retry", this);
    } else { // not a SYN, so run the state machine
        this[this.state](packet);
    }
};

TCPSession.prototype.SYN_SENT = function (packet) {
    var ip  = packet.payload.payload;
    var tcp = ip.payload;
    var src = ip.saddr + ":" + tcp.sport;

    if (src === this.dst && tcp.flags.syn && tcp.flags.ack) {
        this.recv_bytes_ip += ip.header_bytes;
        this.recv_bytes_tcp += tcp.header_bytes;
        this.recv_packets[tcp.seqno + 1] = this.current_cap_time;
        this.recv_acks[tcp.ackno] = this.current_cap_time;
        this.recv_isn = tcp.seqno;
        this.recv_window_scale = tcp.options.window_scale || 1;
        this.state = "SYN_RCVD";
    } else if (tcp.flags.rst) {
        this.state = "CLOSED";
        this.emit("reset", this, "recv"); // TODO - check which direction did the reset, probably recv
//    } else {
//        console.log("Didn't get SYN-ACK packet from dst while handshaking: " + util.inspect(tcp, false, 4));
    }
};

TCPSession.prototype.SYN_RCVD = function (packet) {
    var ip  = packet.payload.payload;
    var tcp = ip.payload;
    var src = ip.saddr + ":" + tcp.sport;

    if (src === this.src && tcp.flags.ack) { // TODO - make sure SYN flag isn't set, also match src and dst
        this.send_bytes_ip += ip.header_bytes;
        this.send_bytes_tcp += tcp.header_bytes;
        this.send_acks[tcp.ackno] = this.current_cap_time;
        this.connect_time = this.current_cap_time;
        this.emit("start", this);
        this.state = "ESTAB";
//    } else {
//        console.log("Didn't get ACK packet from src while handshaking: " + util.inspect(tcp, false, 4));
    }
};

// TODO - actually implement SACK decoding and tracking
// if (tcp.options.sack) {
//     console.log("SACK magic, handle this: " + util.inspect(tcp.options.sack));
//     console.log(util.inspect(ip, false, 5));
// }
// TODO - check for tcp.flags.rst and emit reset event

TCPSession.prototype.ESTAB = function (packet) {
    var ip  = packet.payload.payload;
    var tcp = ip.payload;
    var src = ip.saddr + ":" + tcp.sport;

    if (src === this.src) { // this packet came from the active opener / client
        this.send_bytes_ip += ip.header_bytes;
        this.send_bytes_tcp += tcp.header_bytes;
        if (tcp.data_bytes) {
            if (this.send_packets[tcp.seqno + tcp.data_bytes]) {
                this.emit("retransmit", this, "send", tcp.seqno + tcp.data_bytes);
                if (this.send_retrans[tcp.seqno + tcp.data_bytes]) {
                    this.send_retrans[tcp.seqno + tcp.data_bytes] += 1;
                } else {
                    this.send_retrans[tcp.seqno + tcp.data_bytes] = 1;
                }
            } else {
                this.emit("data send", this, tcp.data);
            }
            this.send_bytes_payload += tcp.data_bytes;
            this.send_packets[tcp.seqno + tcp.data_bytes] = this.current_cap_time;
        }
        if (this.recv_packets[tcp.ackno]) {
            this.send_acks[tcp.ackno] = this.current_cap_time;
        }
        // console.log("sending ACK for packet we didn't see received: " + tcp.ackno);
        if (tcp.flags.fin) {
            this.state = "FIN_WAIT";
        }
    } else if (src === this.dst) { // this packet came from the passive opener / server
        this.recv_bytes_ip += ip.header_bytes;
        this.recv_bytes_tcp += tcp.header_bytes;
        if (tcp.data_bytes) {
            if (this.recv_packets[tcp.seqno + tcp.data_bytes]) {
                this.emit("retransmit", this, "recv", tcp.seqno + tcp.data_bytes);
                if (this.recv_retrans[tcp.seqno + tcp.data_bytes]) {
                    this.recv_retrans[tcp.seqno + tcp.data_bytes] += 1;
                } else {
                    this.recv_retrans[tcp.seqno + tcp.data_bytes] = 1;
                }
            } else {
                this.emit("data recv", this, tcp.data);
            }
            this.recv_bytes_payload += tcp.data_bytes;
            this.recv_packets[tcp.seqno + tcp.data_bytes] = this.current_cap_time;
        }
        if (this.send_packets[tcp.ackno]) {
            this.recv_acks[tcp.ackno] = this.current_cap_time;
        }
        if (tcp.flags.fin) {
            this.state = "CLOSE_WAIT";
        }
    } else {
        console.log("non-matching packet in session: " + packet);
    }
};

// TODO - need to track half-closed data
TCPSession.prototype.FIN_WAIT = function (packet) {
    var ip  = packet.payload.payload;
    var tcp = ip.payload;
    var src = ip.saddr + ":" + tcp.sport;

    if (src === this.dst && tcp.flags.fin) {
        this.state = "CLOSING";
    }
};

// TODO - need to track half-closed data
TCPSession.prototype.CLOSE_WAIT = function (packet) {
    var ip  = packet.payload.payload;
    var tcp = ip.payload;
    var src = ip.saddr + ":" + tcp.sport;

    if (src === this.src && tcp.flags.fin) {
        this.state = "LAST_ACK";
    }
};

// TODO - need to track half-closed data
TCPSession.prototype.LAST_ACK = function (packet) {
    var ip  = packet.payload.payload;
    var tcp = ip.payload;
    var src = ip.saddr + ":" + tcp.sport;

    if (src === this.dst) {
        this.close_time = this.current_cap_time;
        this.state = "CLOSED";
        this.emit("end", this);
    }
};

// TODO - need to track half-closed data
TCPSession.prototype.CLOSING = function (packet) {
    var ip  = packet.payload.payload;
    var tcp = ip.payload;
    var src = ip.saddr + ":" + tcp.sport;

    if (src === this.src) {
        this.close_time = this.current_cap_time;
        this.state = "CLOSED";
        this.emit("end", this);
    }
};

// The states aren't quite right here.  All possible states of FIN and FIN/ACKs aren't handled.
// So some of the bytes of the session may not be properly accounted for.

TCPSession.prototype.CLOSED = function (packet) {
    // not sure what to do here. We are closed, so I guess bump some counters or something.
};

TCPSession.prototype.session_stats = function () {
    var send_acks = Object.keys(this.send_acks)
        .map(function (key) { return +key; })
        .sort(function (a, b) { return a > b; });
    var recv_acks = Object.keys(this.recv_acks)
        .map(function (key) { return +key; })
        .sort(function (a, b) { return a > b; });

    var total_time = this.close_time - this.syn_time;
    var stats = {};
    var self = this;

    stats.recv_times = {};
    send_acks.forEach(function (v) {
        if (self.recv_packets[v]) {
            stats.recv_times[v] = self.send_acks[v] - self.recv_packets[v];
        }
    });

    stats.send_times = {};
    recv_acks.forEach(function (v) {
        if (self.send_packets[v]) {
            stats.send_times[v] = self.recv_acks[v] - self.send_packets[v];
        }
    });

    stats.send_retrans = {};
    Object.keys(this.send_retrans).forEach(function (v) {
        stats.send_retrans[v] = self.send_retrans[v];
    });

    stats.recv_retrans = {};
    Object.keys(this.recv_retrans).forEach(function (v) {
        stats.recv_retrans[v] = self.recv_retrans[v];
    });

    stats.connect_duration = this.connect_time - this.syn_time;
    stats.total_time = total_time;
    stats.send_overhead = this.send_bytes_ip + this.send_bytes_tcp;
    stats.send_payload = this.send_bytes_payload;
    stats.send_total = stats.send_overhead + stats.send_payload;
    stats.recv_overhead = this.recv_bytes_ip + this.recv_bytes_tcp;
    stats.recv_payload = this.recv_bytes_payload;
    stats.recv_total = stats.recv_overhead + stats.recv_payload;

    return stats;
};

exports.TCPSession = TCPSession;
exports.TCPTracker = TCPTracker;

},{"./decode/ipv4":14,"./decode/tcp":26,"events":37,"util":55}],30:[function(require,module,exports){
function lpad(str, len) {
    while (str.length < len) {
        str = "0" + str;
    }
    return str;
}

exports.dump_bytes = function dump_bytes(raw_packet, offset) {
    for (var i = offset; i < raw_packet.pcap_header.caplen ; i += 1) {
        console.log(i + ": " + raw_packet[i]);
    }
};

var int8_to_hex = [];
var int8_to_hex_nopad = [];
var int8_to_dec = [];

for (var i = 0; i <= 255; i++) {
    int8_to_hex[i] = lpad(i.toString(16), 2);
    int8_to_hex_nopad[i] = i.toString(16);
    int8_to_dec[i] = i.toString();
}

exports.int8_to_dec = int8_to_dec;
exports.int8_to_hex = int8_to_hex;
exports.int8_to_hex_nopad = int8_to_hex_nopad;

},{}],31:[function(require,module,exports){

},{}],32:[function(require,module,exports){
arguments[4][31][0].apply(exports,arguments)
},{"dup":31}],33:[function(require,module,exports){
/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
 * @license  MIT
 */

var base64 = require('base64-js')
var ieee754 = require('ieee754')
var isArray = require('is-array')

exports.Buffer = Buffer
exports.SlowBuffer = SlowBuffer
exports.INSPECT_MAX_BYTES = 50
Buffer.poolSize = 8192 // not used by this implementation

var kMaxLength = 0x3fffffff
var rootParent = {}

/**
 * If `Buffer.TYPED_ARRAY_SUPPORT`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Use Object implementation (most compatible, even IE6)
 *
 * Browsers that support typed arrays are IE 10+, Firefox 4+, Chrome 7+, Safari 5.1+,
 * Opera 11.6+, iOS 4.2+.
 *
 * Note:
 *
 * - Implementation must support adding new properties to `Uint8Array` instances.
 *   Firefox 4-29 lacked support, fixed in Firefox 30+.
 *   See: https://bugzilla.mozilla.org/show_bug.cgi?id=695438.
 *
 *  - Chrome 9-10 is missing the `TypedArray.prototype.subarray` function.
 *
 *  - IE10 has a broken `TypedArray.prototype.subarray` function which returns arrays of
 *    incorrect length in some situations.
 *
 * We detect these buggy browsers and set `Buffer.TYPED_ARRAY_SUPPORT` to `false` so they will
 * get the Object implementation, which is slower but will work correctly.
 */
Buffer.TYPED_ARRAY_SUPPORT = (function () {
  try {
    var buf = new ArrayBuffer(0)
    var arr = new Uint8Array(buf)
    arr.foo = function () { return 42 }
    return arr.foo() === 42 && // typed array instances can be augmented
        typeof arr.subarray === 'function' && // chrome 9-10 lack `subarray`
        new Uint8Array(1).subarray(1, 1).byteLength === 0 // ie10 has broken `subarray`
  } catch (e) {
    return false
  }
})()

/**
 * Class: Buffer
 * =============
 *
 * The Buffer constructor returns instances of `Uint8Array` that are augmented
 * with function properties for all the node `Buffer` API functions. We use
 * `Uint8Array` so that square bracket notation works as expected -- it returns
 * a single octet.
 *
 * By augmenting the instances, we can avoid modifying the `Uint8Array`
 * prototype.
 */
function Buffer (subject, encoding, noZero) {
  if (!(this instanceof Buffer))
    return new Buffer(subject, encoding, noZero)

  var type = typeof subject

  // Find the length
  var length
  if (type === 'number') {
    length = +subject
  } else if (type === 'string') {
    length = Buffer.byteLength(subject, encoding)
  } else if (type === 'object' && subject !== null) { // assume object is array-like
    if (subject.type === 'Buffer' && isArray(subject.data))
      subject = subject.data
    length = +subject.length
  } else {
    throw new TypeError('must start with number, buffer, array or string')
  }

  if (length > kMaxLength)
    throw new RangeError('Attempt to allocate Buffer larger than maximum ' +
      'size: 0x' + kMaxLength.toString(16) + ' bytes')

  if (length < 0)
    length = 0
  else
    length >>>= 0 // Coerce to uint32.

  var self = this
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    // Preferred: Return an augmented `Uint8Array` instance for best performance
    /*eslint-disable consistent-this */
    self = Buffer._augment(new Uint8Array(length))
    /*eslint-enable consistent-this */
  } else {
    // Fallback: Return THIS instance of Buffer (created by `new`)
    self.length = length
    self._isBuffer = true
  }

  var i
  if (Buffer.TYPED_ARRAY_SUPPORT && typeof subject.byteLength === 'number') {
    // Speed optimization -- use set if we're copying from a typed array
    self._set(subject)
  } else if (isArrayish(subject)) {
    // Treat array-ish objects as a byte array
    if (Buffer.isBuffer(subject)) {
      for (i = 0; i < length; i++)
        self[i] = subject.readUInt8(i)
    } else {
      for (i = 0; i < length; i++)
        self[i] = ((subject[i] % 256) + 256) % 256
    }
  } else if (type === 'string') {
    self.write(subject, 0, encoding)
  } else if (type === 'number' && !Buffer.TYPED_ARRAY_SUPPORT && !noZero) {
    for (i = 0; i < length; i++) {
      self[i] = 0
    }
  }

  if (length > 0 && length <= Buffer.poolSize)
    self.parent = rootParent

  return self
}

function SlowBuffer (subject, encoding, noZero) {
  if (!(this instanceof SlowBuffer))
    return new SlowBuffer(subject, encoding, noZero)

  var buf = new Buffer(subject, encoding, noZero)
  delete buf.parent
  return buf
}

Buffer.isBuffer = function (b) {
  return !!(b != null && b._isBuffer)
}

Buffer.compare = function (a, b) {
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b))
    throw new TypeError('Arguments must be Buffers')

  if (a === b) return 0

  var x = a.length
  var y = b.length
  for (var i = 0, len = Math.min(x, y); i < len && a[i] === b[i]; i++) {}
  if (i !== len) {
    x = a[i]
    y = b[i]
  }
  if (x < y) return -1
  if (y < x) return 1
  return 0
}

Buffer.isEncoding = function (encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'binary':
    case 'base64':
    case 'raw':
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return true
    default:
      return false
  }
}

Buffer.concat = function (list, totalLength) {
  if (!isArray(list)) throw new TypeError('Usage: Buffer.concat(list[, length])')

  if (list.length === 0) {
    return new Buffer(0)
  } else if (list.length === 1) {
    return list[0]
  }

  var i
  if (totalLength === undefined) {
    totalLength = 0
    for (i = 0; i < list.length; i++) {
      totalLength += list[i].length
    }
  }

  var buf = new Buffer(totalLength)
  var pos = 0
  for (i = 0; i < list.length; i++) {
    var item = list[i]
    item.copy(buf, pos)
    pos += item.length
  }
  return buf
}

Buffer.byteLength = function (str, encoding) {
  var ret
  str = str + ''
  switch (encoding || 'utf8') {
    case 'ascii':
    case 'binary':
    case 'raw':
      ret = str.length
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = str.length * 2
      break
    case 'hex':
      ret = str.length >>> 1
      break
    case 'utf8':
    case 'utf-8':
      ret = utf8ToBytes(str).length
      break
    case 'base64':
      ret = base64ToBytes(str).length
      break
    default:
      ret = str.length
  }
  return ret
}

// pre-set for values that may exist in the future
Buffer.prototype.length = undefined
Buffer.prototype.parent = undefined

// toString(encoding, start=0, end=buffer.length)
Buffer.prototype.toString = function (encoding, start, end) {
  var loweredCase = false

  start = start >>> 0
  end = end === undefined || end === Infinity ? this.length : end >>> 0

  if (!encoding) encoding = 'utf8'
  if (start < 0) start = 0
  if (end > this.length) end = this.length
  if (end <= start) return ''

  while (true) {
    switch (encoding) {
      case 'hex':
        return hexSlice(this, start, end)

      case 'utf8':
      case 'utf-8':
        return utf8Slice(this, start, end)

      case 'ascii':
        return asciiSlice(this, start, end)

      case 'binary':
        return binarySlice(this, start, end)

      case 'base64':
        return base64Slice(this, start, end)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return utf16leSlice(this, start, end)

      default:
        if (loweredCase)
          throw new TypeError('Unknown encoding: ' + encoding)
        encoding = (encoding + '').toLowerCase()
        loweredCase = true
    }
  }
}

Buffer.prototype.equals = function (b) {
  if (!Buffer.isBuffer(b)) throw new TypeError('Argument must be a Buffer')
  if (this === b) return true
  return Buffer.compare(this, b) === 0
}

Buffer.prototype.inspect = function () {
  var str = ''
  var max = exports.INSPECT_MAX_BYTES
  if (this.length > 0) {
    str = this.toString('hex', 0, max).match(/.{2}/g).join(' ')
    if (this.length > max)
      str += ' ... '
  }
  return '<Buffer ' + str + '>'
}

Buffer.prototype.compare = function (b) {
  if (!Buffer.isBuffer(b)) throw new TypeError('Argument must be a Buffer')
  if (this === b) return 0
  return Buffer.compare(this, b)
}

// `get` will be removed in Node 0.13+
Buffer.prototype.get = function (offset) {
  console.log('.get() is deprecated. Access using array indexes instead.')
  return this.readUInt8(offset)
}

// `set` will be removed in Node 0.13+
Buffer.prototype.set = function (v, offset) {
  console.log('.set() is deprecated. Access using array indexes instead.')
  return this.writeUInt8(v, offset)
}

function hexWrite (buf, string, offset, length) {
  offset = Number(offset) || 0
  var remaining = buf.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }

  // must be an even number of digits
  var strLen = string.length
  if (strLen % 2 !== 0) throw new Error('Invalid hex string')

  if (length > strLen / 2) {
    length = strLen / 2
  }
  for (var i = 0; i < length; i++) {
    var byte = parseInt(string.substr(i * 2, 2), 16)
    if (isNaN(byte)) throw new Error('Invalid hex string')
    buf[offset + i] = byte
  }
  return i
}

function utf8Write (buf, string, offset, length) {
  var charsWritten = blitBuffer(utf8ToBytes(string, buf.length - offset), buf, offset, length)
  return charsWritten
}

function asciiWrite (buf, string, offset, length) {
  var charsWritten = blitBuffer(asciiToBytes(string), buf, offset, length)
  return charsWritten
}

function binaryWrite (buf, string, offset, length) {
  return asciiWrite(buf, string, offset, length)
}

function base64Write (buf, string, offset, length) {
  var charsWritten = blitBuffer(base64ToBytes(string), buf, offset, length)
  return charsWritten
}

function utf16leWrite (buf, string, offset, length) {
  var charsWritten = blitBuffer(utf16leToBytes(string, buf.length - offset), buf, offset, length)
  return charsWritten
}

Buffer.prototype.write = function (string, offset, length, encoding) {
  // Support both (string, offset, length, encoding)
  // and the legacy (string, encoding, offset, length)
  if (isFinite(offset)) {
    if (!isFinite(length)) {
      encoding = length
      length = undefined
    }
  } else {  // legacy
    var swap = encoding
    encoding = offset
    offset = length
    length = swap
  }

  offset = Number(offset) || 0

  if (length < 0 || offset < 0 || offset > this.length)
    throw new RangeError('attempt to write outside buffer bounds')

  var remaining = this.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }
  encoding = String(encoding || 'utf8').toLowerCase()

  var ret
  switch (encoding) {
    case 'hex':
      ret = hexWrite(this, string, offset, length)
      break
    case 'utf8':
    case 'utf-8':
      ret = utf8Write(this, string, offset, length)
      break
    case 'ascii':
      ret = asciiWrite(this, string, offset, length)
      break
    case 'binary':
      ret = binaryWrite(this, string, offset, length)
      break
    case 'base64':
      ret = base64Write(this, string, offset, length)
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = utf16leWrite(this, string, offset, length)
      break
    default:
      throw new TypeError('Unknown encoding: ' + encoding)
  }
  return ret
}

Buffer.prototype.toJSON = function () {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  }
}

function base64Slice (buf, start, end) {
  if (start === 0 && end === buf.length) {
    return base64.fromByteArray(buf)
  } else {
    return base64.fromByteArray(buf.slice(start, end))
  }
}

function utf8Slice (buf, start, end) {
  var res = ''
  var tmp = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    if (buf[i] <= 0x7F) {
      res += decodeUtf8Char(tmp) + String.fromCharCode(buf[i])
      tmp = ''
    } else {
      tmp += '%' + buf[i].toString(16)
    }
  }

  return res + decodeUtf8Char(tmp)
}

function asciiSlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    ret += String.fromCharCode(buf[i] & 0x7F)
  }
  return ret
}

function binarySlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    ret += String.fromCharCode(buf[i])
  }
  return ret
}

function hexSlice (buf, start, end) {
  var len = buf.length

  if (!start || start < 0) start = 0
  if (!end || end < 0 || end > len) end = len

  var out = ''
  for (var i = start; i < end; i++) {
    out += toHex(buf[i])
  }
  return out
}

function utf16leSlice (buf, start, end) {
  var bytes = buf.slice(start, end)
  var res = ''
  for (var i = 0; i < bytes.length; i += 2) {
    res += String.fromCharCode(bytes[i] + bytes[i + 1] * 256)
  }
  return res
}

Buffer.prototype.slice = function (start, end) {
  var len = this.length
  start = ~~start
  end = end === undefined ? len : ~~end

  if (start < 0) {
    start += len
    if (start < 0)
      start = 0
  } else if (start > len) {
    start = len
  }

  if (end < 0) {
    end += len
    if (end < 0)
      end = 0
  } else if (end > len) {
    end = len
  }

  if (end < start)
    end = start

  var newBuf
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    newBuf = Buffer._augment(this.subarray(start, end))
  } else {
    var sliceLen = end - start
    newBuf = new Buffer(sliceLen, undefined, true)
    for (var i = 0; i < sliceLen; i++) {
      newBuf[i] = this[i + start]
    }
  }

  if (newBuf.length)
    newBuf.parent = this.parent || this

  return newBuf
}

/*
 * Need to make sure that buffer isn't trying to write out of bounds.
 */
function checkOffset (offset, ext, length) {
  if ((offset % 1) !== 0 || offset < 0)
    throw new RangeError('offset is not uint')
  if (offset + ext > length)
    throw new RangeError('Trying to access beyond buffer length')
}

Buffer.prototype.readUIntLE = function (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert)
    checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100))
    val += this[offset + i] * mul

  return val
}

Buffer.prototype.readUIntBE = function (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert)
    checkOffset(offset, byteLength, this.length)

  var val = this[offset + --byteLength]
  var mul = 1
  while (byteLength > 0 && (mul *= 0x100))
    val += this[offset + --byteLength] * mul

  return val
}

Buffer.prototype.readUInt8 = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 1, this.length)
  return this[offset]
}

Buffer.prototype.readUInt16LE = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 2, this.length)
  return this[offset] | (this[offset + 1] << 8)
}

Buffer.prototype.readUInt16BE = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 2, this.length)
  return (this[offset] << 8) | this[offset + 1]
}

Buffer.prototype.readUInt32LE = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 4, this.length)

  return ((this[offset]) |
      (this[offset + 1] << 8) |
      (this[offset + 2] << 16)) +
      (this[offset + 3] * 0x1000000)
}

Buffer.prototype.readUInt32BE = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 4, this.length)

  return (this[offset] * 0x1000000) +
      ((this[offset + 1] << 16) |
      (this[offset + 2] << 8) |
      this[offset + 3])
}

Buffer.prototype.readIntLE = function (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert)
    checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100))
    val += this[offset + i] * mul
  mul *= 0x80

  if (val >= mul)
    val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readIntBE = function (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert)
    checkOffset(offset, byteLength, this.length)

  var i = byteLength
  var mul = 1
  var val = this[offset + --i]
  while (i > 0 && (mul *= 0x100))
    val += this[offset + --i] * mul
  mul *= 0x80

  if (val >= mul)
    val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readInt8 = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 1, this.length)
  if (!(this[offset] & 0x80))
    return (this[offset])
  return ((0xff - this[offset] + 1) * -1)
}

Buffer.prototype.readInt16LE = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 2, this.length)
  var val = this[offset] | (this[offset + 1] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt16BE = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 2, this.length)
  var val = this[offset + 1] | (this[offset] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt32LE = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 4, this.length)

  return (this[offset]) |
      (this[offset + 1] << 8) |
      (this[offset + 2] << 16) |
      (this[offset + 3] << 24)
}

Buffer.prototype.readInt32BE = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 4, this.length)

  return (this[offset] << 24) |
      (this[offset + 1] << 16) |
      (this[offset + 2] << 8) |
      (this[offset + 3])
}

Buffer.prototype.readFloatLE = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, true, 23, 4)
}

Buffer.prototype.readFloatBE = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, false, 23, 4)
}

Buffer.prototype.readDoubleLE = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, true, 52, 8)
}

Buffer.prototype.readDoubleBE = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, false, 52, 8)
}

function checkInt (buf, value, offset, ext, max, min) {
  if (!Buffer.isBuffer(buf)) throw new TypeError('buffer must be a Buffer instance')
  if (value > max || value < min) throw new RangeError('value is out of bounds')
  if (offset + ext > buf.length) throw new RangeError('index out of range')
}

Buffer.prototype.writeUIntLE = function (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert)
    checkInt(this, value, offset, byteLength, Math.pow(2, 8 * byteLength), 0)

  var mul = 1
  var i = 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100))
    this[offset + i] = (value / mul) >>> 0 & 0xFF

  return offset + byteLength
}

Buffer.prototype.writeUIntBE = function (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert)
    checkInt(this, value, offset, byteLength, Math.pow(2, 8 * byteLength), 0)

  var i = byteLength - 1
  var mul = 1
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100))
    this[offset + i] = (value / mul) >>> 0 & 0xFF

  return offset + byteLength
}

Buffer.prototype.writeUInt8 = function (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert)
    checkInt(this, value, offset, 1, 0xff, 0)
  if (!Buffer.TYPED_ARRAY_SUPPORT) value = Math.floor(value)
  this[offset] = value
  return offset + 1
}

function objectWriteUInt16 (buf, value, offset, littleEndian) {
  if (value < 0) value = 0xffff + value + 1
  for (var i = 0, j = Math.min(buf.length - offset, 2); i < j; i++) {
    buf[offset + i] = (value & (0xff << (8 * (littleEndian ? i : 1 - i)))) >>>
      (littleEndian ? i : 1 - i) * 8
  }
}

Buffer.prototype.writeUInt16LE = function (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert)
    checkInt(this, value, offset, 2, 0xffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = value
    this[offset + 1] = (value >>> 8)
  } else objectWriteUInt16(this, value, offset, true)
  return offset + 2
}

Buffer.prototype.writeUInt16BE = function (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert)
    checkInt(this, value, offset, 2, 0xffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 8)
    this[offset + 1] = value
  } else objectWriteUInt16(this, value, offset, false)
  return offset + 2
}

function objectWriteUInt32 (buf, value, offset, littleEndian) {
  if (value < 0) value = 0xffffffff + value + 1
  for (var i = 0, j = Math.min(buf.length - offset, 4); i < j; i++) {
    buf[offset + i] = (value >>> (littleEndian ? i : 3 - i) * 8) & 0xff
  }
}

Buffer.prototype.writeUInt32LE = function (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert)
    checkInt(this, value, offset, 4, 0xffffffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset + 3] = (value >>> 24)
    this[offset + 2] = (value >>> 16)
    this[offset + 1] = (value >>> 8)
    this[offset] = value
  } else objectWriteUInt32(this, value, offset, true)
  return offset + 4
}

Buffer.prototype.writeUInt32BE = function (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert)
    checkInt(this, value, offset, 4, 0xffffffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 24)
    this[offset + 1] = (value >>> 16)
    this[offset + 2] = (value >>> 8)
    this[offset + 3] = value
  } else objectWriteUInt32(this, value, offset, false)
  return offset + 4
}

Buffer.prototype.writeIntLE = function (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    checkInt(this,
             value,
             offset,
             byteLength,
             Math.pow(2, 8 * byteLength - 1) - 1,
             -Math.pow(2, 8 * byteLength - 1))
  }

  var i = 0
  var mul = 1
  var sub = value < 0 ? 1 : 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100))
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF

  return offset + byteLength
}

Buffer.prototype.writeIntBE = function (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    checkInt(this,
             value,
             offset,
             byteLength,
             Math.pow(2, 8 * byteLength - 1) - 1,
             -Math.pow(2, 8 * byteLength - 1))
  }

  var i = byteLength - 1
  var mul = 1
  var sub = value < 0 ? 1 : 0
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100))
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF

  return offset + byteLength
}

Buffer.prototype.writeInt8 = function (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert)
    checkInt(this, value, offset, 1, 0x7f, -0x80)
  if (!Buffer.TYPED_ARRAY_SUPPORT) value = Math.floor(value)
  if (value < 0) value = 0xff + value + 1
  this[offset] = value
  return offset + 1
}

Buffer.prototype.writeInt16LE = function (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert)
    checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = value
    this[offset + 1] = (value >>> 8)
  } else objectWriteUInt16(this, value, offset, true)
  return offset + 2
}

Buffer.prototype.writeInt16BE = function (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert)
    checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 8)
    this[offset + 1] = value
  } else objectWriteUInt16(this, value, offset, false)
  return offset + 2
}

Buffer.prototype.writeInt32LE = function (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert)
    checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = value
    this[offset + 1] = (value >>> 8)
    this[offset + 2] = (value >>> 16)
    this[offset + 3] = (value >>> 24)
  } else objectWriteUInt32(this, value, offset, true)
  return offset + 4
}

Buffer.prototype.writeInt32BE = function (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert)
    checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  if (value < 0) value = 0xffffffff + value + 1
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 24)
    this[offset + 1] = (value >>> 16)
    this[offset + 2] = (value >>> 8)
    this[offset + 3] = value
  } else objectWriteUInt32(this, value, offset, false)
  return offset + 4
}

function checkIEEE754 (buf, value, offset, ext, max, min) {
  if (value > max || value < min) throw new RangeError('value is out of bounds')
  if (offset + ext > buf.length) throw new RangeError('index out of range')
  if (offset < 0) throw new RangeError('index out of range')
}

function writeFloat (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert)
    checkIEEE754(buf, value, offset, 4, 3.4028234663852886e+38, -3.4028234663852886e+38)
  ieee754.write(buf, value, offset, littleEndian, 23, 4)
  return offset + 4
}

Buffer.prototype.writeFloatLE = function (value, offset, noAssert) {
  return writeFloat(this, value, offset, true, noAssert)
}

Buffer.prototype.writeFloatBE = function (value, offset, noAssert) {
  return writeFloat(this, value, offset, false, noAssert)
}

function writeDouble (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert)
    checkIEEE754(buf, value, offset, 8, 1.7976931348623157E+308, -1.7976931348623157E+308)
  ieee754.write(buf, value, offset, littleEndian, 52, 8)
  return offset + 8
}

Buffer.prototype.writeDoubleLE = function (value, offset, noAssert) {
  return writeDouble(this, value, offset, true, noAssert)
}

Buffer.prototype.writeDoubleBE = function (value, offset, noAssert) {
  return writeDouble(this, value, offset, false, noAssert)
}

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function (target, target_start, start, end) {
  var self = this // source

  if (!start) start = 0
  if (!end && end !== 0) end = this.length
  if (target_start >= target.length) target_start = target.length
  if (!target_start) target_start = 0
  if (end > 0 && end < start) end = start

  // Copy 0 bytes; we're done
  if (end === start) return 0
  if (target.length === 0 || self.length === 0) return 0

  // Fatal error conditions
  if (target_start < 0)
    throw new RangeError('targetStart out of bounds')
  if (start < 0 || start >= self.length) throw new RangeError('sourceStart out of bounds')
  if (end < 0) throw new RangeError('sourceEnd out of bounds')

  // Are we oob?
  if (end > this.length)
    end = this.length
  if (target.length - target_start < end - start)
    end = target.length - target_start + start

  var len = end - start

  if (len < 1000 || !Buffer.TYPED_ARRAY_SUPPORT) {
    for (var i = 0; i < len; i++) {
      target[i + target_start] = this[i + start]
    }
  } else {
    target._set(this.subarray(start, start + len), target_start)
  }

  return len
}

// fill(value, start=0, end=buffer.length)
Buffer.prototype.fill = function (value, start, end) {
  if (!value) value = 0
  if (!start) start = 0
  if (!end) end = this.length

  if (end < start) throw new RangeError('end < start')

  // Fill 0 bytes; we're done
  if (end === start) return
  if (this.length === 0) return

  if (start < 0 || start >= this.length) throw new RangeError('start out of bounds')
  if (end < 0 || end > this.length) throw new RangeError('end out of bounds')

  var i
  if (typeof value === 'number') {
    for (i = start; i < end; i++) {
      this[i] = value
    }
  } else {
    var bytes = utf8ToBytes(value.toString())
    var len = bytes.length
    for (i = start; i < end; i++) {
      this[i] = bytes[i % len]
    }
  }

  return this
}

/**
 * Creates a new `ArrayBuffer` with the *copied* memory of the buffer instance.
 * Added in Node 0.12. Only available in browsers that support ArrayBuffer.
 */
Buffer.prototype.toArrayBuffer = function () {
  if (typeof Uint8Array !== 'undefined') {
    if (Buffer.TYPED_ARRAY_SUPPORT) {
      return (new Buffer(this)).buffer
    } else {
      var buf = new Uint8Array(this.length)
      for (var i = 0, len = buf.length; i < len; i += 1) {
        buf[i] = this[i]
      }
      return buf.buffer
    }
  } else {
    throw new TypeError('Buffer.toArrayBuffer not supported in this browser')
  }
}

// HELPER FUNCTIONS
// ================

var BP = Buffer.prototype

/**
 * Augment a Uint8Array *instance* (not the Uint8Array class!) with Buffer methods
 */
Buffer._augment = function (arr) {
  arr.constructor = Buffer
  arr._isBuffer = true

  // save reference to original Uint8Array get/set methods before overwriting
  arr._get = arr.get
  arr._set = arr.set

  // deprecated, will be removed in node 0.13+
  arr.get = BP.get
  arr.set = BP.set

  arr.write = BP.write
  arr.toString = BP.toString
  arr.toLocaleString = BP.toString
  arr.toJSON = BP.toJSON
  arr.equals = BP.equals
  arr.compare = BP.compare
  arr.copy = BP.copy
  arr.slice = BP.slice
  arr.readUIntLE = BP.readUIntLE
  arr.readUIntBE = BP.readUIntBE
  arr.readUInt8 = BP.readUInt8
  arr.readUInt16LE = BP.readUInt16LE
  arr.readUInt16BE = BP.readUInt16BE
  arr.readUInt32LE = BP.readUInt32LE
  arr.readUInt32BE = BP.readUInt32BE
  arr.readIntLE = BP.readIntLE
  arr.readIntBE = BP.readIntBE
  arr.readInt8 = BP.readInt8
  arr.readInt16LE = BP.readInt16LE
  arr.readInt16BE = BP.readInt16BE
  arr.readInt32LE = BP.readInt32LE
  arr.readInt32BE = BP.readInt32BE
  arr.readFloatLE = BP.readFloatLE
  arr.readFloatBE = BP.readFloatBE
  arr.readDoubleLE = BP.readDoubleLE
  arr.readDoubleBE = BP.readDoubleBE
  arr.writeUInt8 = BP.writeUInt8
  arr.writeUIntLE = BP.writeUIntLE
  arr.writeUIntBE = BP.writeUIntBE
  arr.writeUInt16LE = BP.writeUInt16LE
  arr.writeUInt16BE = BP.writeUInt16BE
  arr.writeUInt32LE = BP.writeUInt32LE
  arr.writeUInt32BE = BP.writeUInt32BE
  arr.writeIntLE = BP.writeIntLE
  arr.writeIntBE = BP.writeIntBE
  arr.writeInt8 = BP.writeInt8
  arr.writeInt16LE = BP.writeInt16LE
  arr.writeInt16BE = BP.writeInt16BE
  arr.writeInt32LE = BP.writeInt32LE
  arr.writeInt32BE = BP.writeInt32BE
  arr.writeFloatLE = BP.writeFloatLE
  arr.writeFloatBE = BP.writeFloatBE
  arr.writeDoubleLE = BP.writeDoubleLE
  arr.writeDoubleBE = BP.writeDoubleBE
  arr.fill = BP.fill
  arr.inspect = BP.inspect
  arr.toArrayBuffer = BP.toArrayBuffer

  return arr
}

var INVALID_BASE64_RE = /[^+\/0-9A-z\-]/g

function base64clean (str) {
  // Node strips out invalid characters like \n and \t from the string, base64-js does not
  str = stringtrim(str).replace(INVALID_BASE64_RE, '')
  // Node converts strings with length < 2 to ''
  if (str.length < 2) return ''
  // Node allows for non-padded base64 strings (missing trailing ===), base64-js does not
  while (str.length % 4 !== 0) {
    str = str + '='
  }
  return str
}

function stringtrim (str) {
  if (str.trim) return str.trim()
  return str.replace(/^\s+|\s+$/g, '')
}

function isArrayish (subject) {
  return isArray(subject) || Buffer.isBuffer(subject) ||
      subject && typeof subject === 'object' &&
      typeof subject.length === 'number'
}

function toHex (n) {
  if (n < 16) return '0' + n.toString(16)
  return n.toString(16)
}

function utf8ToBytes (string, units) {
  units = units || Infinity
  var codePoint
  var length = string.length
  var leadSurrogate = null
  var bytes = []
  var i = 0

  for (; i < length; i++) {
    codePoint = string.charCodeAt(i)

    // is surrogate component
    if (codePoint > 0xD7FF && codePoint < 0xE000) {
      // last char was a lead
      if (leadSurrogate) {
        // 2 leads in a row
        if (codePoint < 0xDC00) {
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          leadSurrogate = codePoint
          continue
        } else {
          // valid surrogate pair
          codePoint = leadSurrogate - 0xD800 << 10 | codePoint - 0xDC00 | 0x10000
          leadSurrogate = null
        }
      } else {
        // no lead yet

        if (codePoint > 0xDBFF) {
          // unexpected trail
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        } else if (i + 1 === length) {
          // unpaired lead
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        } else {
          // valid lead
          leadSurrogate = codePoint
          continue
        }
      }
    } else if (leadSurrogate) {
      // valid bmp char, but last char was a lead
      if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
      leadSurrogate = null
    }

    // encode utf8
    if (codePoint < 0x80) {
      if ((units -= 1) < 0) break
      bytes.push(codePoint)
    } else if (codePoint < 0x800) {
      if ((units -= 2) < 0) break
      bytes.push(
        codePoint >> 0x6 | 0xC0,
        codePoint & 0x3F | 0x80
      )
    } else if (codePoint < 0x10000) {
      if ((units -= 3) < 0) break
      bytes.push(
        codePoint >> 0xC | 0xE0,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      )
    } else if (codePoint < 0x200000) {
      if ((units -= 4) < 0) break
      bytes.push(
        codePoint >> 0x12 | 0xF0,
        codePoint >> 0xC & 0x3F | 0x80,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      )
    } else {
      throw new Error('Invalid code point')
    }
  }

  return bytes
}

function asciiToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF)
  }
  return byteArray
}

function utf16leToBytes (str, units) {
  var c, hi, lo
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    if ((units -= 2) < 0) break

    c = str.charCodeAt(i)
    hi = c >> 8
    lo = c % 256
    byteArray.push(lo)
    byteArray.push(hi)
  }

  return byteArray
}

function base64ToBytes (str) {
  return base64.toByteArray(base64clean(str))
}

function blitBuffer (src, dst, offset, length) {
  for (var i = 0; i < length; i++) {
    if ((i + offset >= dst.length) || (i >= src.length))
      break
    dst[i + offset] = src[i]
  }
  return i
}

function decodeUtf8Char (str) {
  try {
    return decodeURIComponent(str)
  } catch (err) {
    return String.fromCharCode(0xFFFD) // UTF 8 invalid char
  }
}

},{"base64-js":34,"ieee754":35,"is-array":36}],34:[function(require,module,exports){
var lookup = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

;(function (exports) {
	'use strict';

  var Arr = (typeof Uint8Array !== 'undefined')
    ? Uint8Array
    : Array

	var PLUS   = '+'.charCodeAt(0)
	var SLASH  = '/'.charCodeAt(0)
	var NUMBER = '0'.charCodeAt(0)
	var LOWER  = 'a'.charCodeAt(0)
	var UPPER  = 'A'.charCodeAt(0)
	var PLUS_URL_SAFE = '-'.charCodeAt(0)
	var SLASH_URL_SAFE = '_'.charCodeAt(0)

	function decode (elt) {
		var code = elt.charCodeAt(0)
		if (code === PLUS ||
		    code === PLUS_URL_SAFE)
			return 62 // '+'
		if (code === SLASH ||
		    code === SLASH_URL_SAFE)
			return 63 // '/'
		if (code < NUMBER)
			return -1 //no match
		if (code < NUMBER + 10)
			return code - NUMBER + 26 + 26
		if (code < UPPER + 26)
			return code - UPPER
		if (code < LOWER + 26)
			return code - LOWER + 26
	}

	function b64ToByteArray (b64) {
		var i, j, l, tmp, placeHolders, arr

		if (b64.length % 4 > 0) {
			throw new Error('Invalid string. Length must be a multiple of 4')
		}

		// the number of equal signs (place holders)
		// if there are two placeholders, than the two characters before it
		// represent one byte
		// if there is only one, then the three characters before it represent 2 bytes
		// this is just a cheap hack to not do indexOf twice
		var len = b64.length
		placeHolders = '=' === b64.charAt(len - 2) ? 2 : '=' === b64.charAt(len - 1) ? 1 : 0

		// base64 is 4/3 + up to two characters of the original data
		arr = new Arr(b64.length * 3 / 4 - placeHolders)

		// if there are placeholders, only get up to the last complete 4 chars
		l = placeHolders > 0 ? b64.length - 4 : b64.length

		var L = 0

		function push (v) {
			arr[L++] = v
		}

		for (i = 0, j = 0; i < l; i += 4, j += 3) {
			tmp = (decode(b64.charAt(i)) << 18) | (decode(b64.charAt(i + 1)) << 12) | (decode(b64.charAt(i + 2)) << 6) | decode(b64.charAt(i + 3))
			push((tmp & 0xFF0000) >> 16)
			push((tmp & 0xFF00) >> 8)
			push(tmp & 0xFF)
		}

		if (placeHolders === 2) {
			tmp = (decode(b64.charAt(i)) << 2) | (decode(b64.charAt(i + 1)) >> 4)
			push(tmp & 0xFF)
		} else if (placeHolders === 1) {
			tmp = (decode(b64.charAt(i)) << 10) | (decode(b64.charAt(i + 1)) << 4) | (decode(b64.charAt(i + 2)) >> 2)
			push((tmp >> 8) & 0xFF)
			push(tmp & 0xFF)
		}

		return arr
	}

	function uint8ToBase64 (uint8) {
		var i,
			extraBytes = uint8.length % 3, // if we have 1 byte left, pad 2 bytes
			output = "",
			temp, length

		function encode (num) {
			return lookup.charAt(num)
		}

		function tripletToBase64 (num) {
			return encode(num >> 18 & 0x3F) + encode(num >> 12 & 0x3F) + encode(num >> 6 & 0x3F) + encode(num & 0x3F)
		}

		// go through the array every three bytes, we'll deal with trailing stuff later
		for (i = 0, length = uint8.length - extraBytes; i < length; i += 3) {
			temp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2])
			output += tripletToBase64(temp)
		}

		// pad the end with zeros, but make sure to not forget the extra bytes
		switch (extraBytes) {
			case 1:
				temp = uint8[uint8.length - 1]
				output += encode(temp >> 2)
				output += encode((temp << 4) & 0x3F)
				output += '=='
				break
			case 2:
				temp = (uint8[uint8.length - 2] << 8) + (uint8[uint8.length - 1])
				output += encode(temp >> 10)
				output += encode((temp >> 4) & 0x3F)
				output += encode((temp << 2) & 0x3F)
				output += '='
				break
		}

		return output
	}

	exports.toByteArray = b64ToByteArray
	exports.fromByteArray = uint8ToBase64
}(typeof exports === 'undefined' ? (this.base64js = {}) : exports))

},{}],35:[function(require,module,exports){
exports.read = function(buffer, offset, isLE, mLen, nBytes) {
  var e, m,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      nBits = -7,
      i = isLE ? (nBytes - 1) : 0,
      d = isLE ? -1 : 1,
      s = buffer[offset + i];

  i += d;

  e = s & ((1 << (-nBits)) - 1);
  s >>= (-nBits);
  nBits += eLen;
  for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8);

  m = e & ((1 << (-nBits)) - 1);
  e >>= (-nBits);
  nBits += mLen;
  for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8);

  if (e === 0) {
    e = 1 - eBias;
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity);
  } else {
    m = m + Math.pow(2, mLen);
    e = e - eBias;
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen);
};

exports.write = function(buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0),
      i = isLE ? 0 : (nBytes - 1),
      d = isLE ? 1 : -1,
      s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0;

  value = Math.abs(value);

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0;
    e = eMax;
  } else {
    e = Math.floor(Math.log(value) / Math.LN2);
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--;
      c *= 2;
    }
    if (e + eBias >= 1) {
      value += rt / c;
    } else {
      value += rt * Math.pow(2, 1 - eBias);
    }
    if (value * c >= 2) {
      e++;
      c /= 2;
    }

    if (e + eBias >= eMax) {
      m = 0;
      e = eMax;
    } else if (e + eBias >= 1) {
      m = (value * c - 1) * Math.pow(2, mLen);
      e = e + eBias;
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
      e = 0;
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8);

  e = (e << mLen) | m;
  eLen += mLen;
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8);

  buffer[offset + i - d] |= s * 128;
};

},{}],36:[function(require,module,exports){

/**
 * isArray
 */

var isArray = Array.isArray;

/**
 * toString
 */

var str = Object.prototype.toString;

/**
 * Whether or not the given `val`
 * is an array.
 *
 * example:
 *
 *        isArray([]);
 *        // > true
 *        isArray(arguments);
 *        // > false
 *        isArray('');
 *        // > false
 *
 * @param {mixed} val
 * @return {bool}
 */

module.exports = isArray || function (val) {
  return !! val && '[object Array]' == str.call(val);
};

},{}],37:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

function EventEmitter() {
  this._events = this._events || {};
  this._maxListeners = this._maxListeners || undefined;
}
module.exports = EventEmitter;

// Backwards-compat with node 0.10.x
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.prototype._events = undefined;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
EventEmitter.defaultMaxListeners = 10;

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function(n) {
  if (!isNumber(n) || n < 0 || isNaN(n))
    throw TypeError('n must be a positive number');
  this._maxListeners = n;
  return this;
};

EventEmitter.prototype.emit = function(type) {
  var er, handler, len, args, i, listeners;

  if (!this._events)
    this._events = {};

  // If there is no 'error' event listener then throw.
  if (type === 'error') {
    if (!this._events.error ||
        (isObject(this._events.error) && !this._events.error.length)) {
      er = arguments[1];
      if (er instanceof Error) {
        throw er; // Unhandled 'error' event
      }
      throw TypeError('Uncaught, unspecified "error" event.');
    }
  }

  handler = this._events[type];

  if (isUndefined(handler))
    return false;

  if (isFunction(handler)) {
    switch (arguments.length) {
      // fast cases
      case 1:
        handler.call(this);
        break;
      case 2:
        handler.call(this, arguments[1]);
        break;
      case 3:
        handler.call(this, arguments[1], arguments[2]);
        break;
      // slower
      default:
        len = arguments.length;
        args = new Array(len - 1);
        for (i = 1; i < len; i++)
          args[i - 1] = arguments[i];
        handler.apply(this, args);
    }
  } else if (isObject(handler)) {
    len = arguments.length;
    args = new Array(len - 1);
    for (i = 1; i < len; i++)
      args[i - 1] = arguments[i];

    listeners = handler.slice();
    len = listeners.length;
    for (i = 0; i < len; i++)
      listeners[i].apply(this, args);
  }

  return true;
};

EventEmitter.prototype.addListener = function(type, listener) {
  var m;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events)
    this._events = {};

  // To avoid recursion in the case that type === "newListener"! Before
  // adding it to the listeners, first emit "newListener".
  if (this._events.newListener)
    this.emit('newListener', type,
              isFunction(listener.listener) ?
              listener.listener : listener);

  if (!this._events[type])
    // Optimize the case of one listener. Don't need the extra array object.
    this._events[type] = listener;
  else if (isObject(this._events[type]))
    // If we've already got an array, just append.
    this._events[type].push(listener);
  else
    // Adding the second element, need to change to array.
    this._events[type] = [this._events[type], listener];

  // Check for listener leak
  if (isObject(this._events[type]) && !this._events[type].warned) {
    var m;
    if (!isUndefined(this._maxListeners)) {
      m = this._maxListeners;
    } else {
      m = EventEmitter.defaultMaxListeners;
    }

    if (m && m > 0 && this._events[type].length > m) {
      this._events[type].warned = true;
      console.error('(node) warning: possible EventEmitter memory ' +
                    'leak detected. %d listeners added. ' +
                    'Use emitter.setMaxListeners() to increase limit.',
                    this._events[type].length);
      if (typeof console.trace === 'function') {
        // not supported in IE 10
        console.trace();
      }
    }
  }

  return this;
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.once = function(type, listener) {
  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  var fired = false;

  function g() {
    this.removeListener(type, g);

    if (!fired) {
      fired = true;
      listener.apply(this, arguments);
    }
  }

  g.listener = listener;
  this.on(type, g);

  return this;
};

// emits a 'removeListener' event iff the listener was removed
EventEmitter.prototype.removeListener = function(type, listener) {
  var list, position, length, i;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events || !this._events[type])
    return this;

  list = this._events[type];
  length = list.length;
  position = -1;

  if (list === listener ||
      (isFunction(list.listener) && list.listener === listener)) {
    delete this._events[type];
    if (this._events.removeListener)
      this.emit('removeListener', type, listener);

  } else if (isObject(list)) {
    for (i = length; i-- > 0;) {
      if (list[i] === listener ||
          (list[i].listener && list[i].listener === listener)) {
        position = i;
        break;
      }
    }

    if (position < 0)
      return this;

    if (list.length === 1) {
      list.length = 0;
      delete this._events[type];
    } else {
      list.splice(position, 1);
    }

    if (this._events.removeListener)
      this.emit('removeListener', type, listener);
  }

  return this;
};

EventEmitter.prototype.removeAllListeners = function(type) {
  var key, listeners;

  if (!this._events)
    return this;

  // not listening for removeListener, no need to emit
  if (!this._events.removeListener) {
    if (arguments.length === 0)
      this._events = {};
    else if (this._events[type])
      delete this._events[type];
    return this;
  }

  // emit removeListener for all listeners on all events
  if (arguments.length === 0) {
    for (key in this._events) {
      if (key === 'removeListener') continue;
      this.removeAllListeners(key);
    }
    this.removeAllListeners('removeListener');
    this._events = {};
    return this;
  }

  listeners = this._events[type];

  if (isFunction(listeners)) {
    this.removeListener(type, listeners);
  } else {
    // LIFO order
    while (listeners.length)
      this.removeListener(type, listeners[listeners.length - 1]);
  }
  delete this._events[type];

  return this;
};

EventEmitter.prototype.listeners = function(type) {
  var ret;
  if (!this._events || !this._events[type])
    ret = [];
  else if (isFunction(this._events[type]))
    ret = [this._events[type]];
  else
    ret = this._events[type].slice();
  return ret;
};

EventEmitter.listenerCount = function(emitter, type) {
  var ret;
  if (!emitter._events || !emitter._events[type])
    ret = 0;
  else if (isFunction(emitter._events[type]))
    ret = 1;
  else
    ret = emitter._events[type].length;
  return ret;
};

function isFunction(arg) {
  return typeof arg === 'function';
}

function isNumber(arg) {
  return typeof arg === 'number';
}

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}

function isUndefined(arg) {
  return arg === void 0;
}

},{}],38:[function(require,module,exports){
arguments[4][2][0].apply(exports,arguments)
},{"dup":2}],39:[function(require,module,exports){
module.exports = Array.isArray || function (arr) {
  return Object.prototype.toString.call(arr) == '[object Array]';
};

},{}],40:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};
var queue = [];
var draining = false;

function drainQueue() {
    if (draining) {
        return;
    }
    draining = true;
    var currentQueue;
    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        var i = -1;
        while (++i < len) {
            currentQueue[i]();
        }
        len = queue.length;
    }
    draining = false;
}
process.nextTick = function (fun) {
    queue.push(fun);
    if (!draining) {
        setTimeout(drainQueue, 0);
    }
};

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };

},{}],41:[function(require,module,exports){
module.exports = require("./lib/_stream_duplex.js")

},{"./lib/_stream_duplex.js":42}],42:[function(require,module,exports){
(function (process){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// a duplex stream is just a stream that is both readable and writable.
// Since JS doesn't have multiple prototypal inheritance, this class
// prototypally inherits from Readable, and then parasitically from
// Writable.

module.exports = Duplex;

/*<replacement>*/
var objectKeys = Object.keys || function (obj) {
  var keys = [];
  for (var key in obj) keys.push(key);
  return keys;
}
/*</replacement>*/


/*<replacement>*/
var util = require('core-util-is');
util.inherits = require('inherits');
/*</replacement>*/

var Readable = require('./_stream_readable');
var Writable = require('./_stream_writable');

util.inherits(Duplex, Readable);

forEach(objectKeys(Writable.prototype), function(method) {
  if (!Duplex.prototype[method])
    Duplex.prototype[method] = Writable.prototype[method];
});

function Duplex(options) {
  if (!(this instanceof Duplex))
    return new Duplex(options);

  Readable.call(this, options);
  Writable.call(this, options);

  if (options && options.readable === false)
    this.readable = false;

  if (options && options.writable === false)
    this.writable = false;

  this.allowHalfOpen = true;
  if (options && options.allowHalfOpen === false)
    this.allowHalfOpen = false;

  this.once('end', onend);
}

// the no-half-open enforcer
function onend() {
  // if we allow half-open state, or if the writable side ended,
  // then we're ok.
  if (this.allowHalfOpen || this._writableState.ended)
    return;

  // no more data can be written.
  // But allow more writes to happen in this tick.
  process.nextTick(this.end.bind(this));
}

function forEach (xs, f) {
  for (var i = 0, l = xs.length; i < l; i++) {
    f(xs[i], i);
  }
}

}).call(this,require('_process'))
},{"./_stream_readable":44,"./_stream_writable":46,"_process":40,"core-util-is":47,"inherits":38}],43:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// a passthrough stream.
// basically just the most minimal sort of Transform stream.
// Every written chunk gets output as-is.

module.exports = PassThrough;

var Transform = require('./_stream_transform');

/*<replacement>*/
var util = require('core-util-is');
util.inherits = require('inherits');
/*</replacement>*/

util.inherits(PassThrough, Transform);

function PassThrough(options) {
  if (!(this instanceof PassThrough))
    return new PassThrough(options);

  Transform.call(this, options);
}

PassThrough.prototype._transform = function(chunk, encoding, cb) {
  cb(null, chunk);
};

},{"./_stream_transform":45,"core-util-is":47,"inherits":38}],44:[function(require,module,exports){
(function (process){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

module.exports = Readable;

/*<replacement>*/
var isArray = require('isarray');
/*</replacement>*/


/*<replacement>*/
var Buffer = require('buffer').Buffer;
/*</replacement>*/

Readable.ReadableState = ReadableState;

var EE = require('events').EventEmitter;

/*<replacement>*/
if (!EE.listenerCount) EE.listenerCount = function(emitter, type) {
  return emitter.listeners(type).length;
};
/*</replacement>*/

var Stream = require('stream');

/*<replacement>*/
var util = require('core-util-is');
util.inherits = require('inherits');
/*</replacement>*/

var StringDecoder;


/*<replacement>*/
var debug = require('util');
if (debug && debug.debuglog) {
  debug = debug.debuglog('stream');
} else {
  debug = function () {};
}
/*</replacement>*/


util.inherits(Readable, Stream);

function ReadableState(options, stream) {
  var Duplex = require('./_stream_duplex');

  options = options || {};

  // the point at which it stops calling _read() to fill the buffer
  // Note: 0 is a valid value, means "don't call _read preemptively ever"
  var hwm = options.highWaterMark;
  var defaultHwm = options.objectMode ? 16 : 16 * 1024;
  this.highWaterMark = (hwm || hwm === 0) ? hwm : defaultHwm;

  // cast to ints.
  this.highWaterMark = ~~this.highWaterMark;

  this.buffer = [];
  this.length = 0;
  this.pipes = null;
  this.pipesCount = 0;
  this.flowing = null;
  this.ended = false;
  this.endEmitted = false;
  this.reading = false;

  // a flag to be able to tell if the onwrite cb is called immediately,
  // or on a later tick.  We set this to true at first, because any
  // actions that shouldn't happen until "later" should generally also
  // not happen before the first write call.
  this.sync = true;

  // whenever we return null, then we set a flag to say
  // that we're awaiting a 'readable' event emission.
  this.needReadable = false;
  this.emittedReadable = false;
  this.readableListening = false;


  // object stream flag. Used to make read(n) ignore n and to
  // make all the buffer merging and length checks go away
  this.objectMode = !!options.objectMode;

  if (stream instanceof Duplex)
    this.objectMode = this.objectMode || !!options.readableObjectMode;

  // Crypto is kind of old and crusty.  Historically, its default string
  // encoding is 'binary' so we have to make this configurable.
  // Everything else in the universe uses 'utf8', though.
  this.defaultEncoding = options.defaultEncoding || 'utf8';

  // when piping, we only care about 'readable' events that happen
  // after read()ing all the bytes and not getting any pushback.
  this.ranOut = false;

  // the number of writers that are awaiting a drain event in .pipe()s
  this.awaitDrain = 0;

  // if true, a maybeReadMore has been scheduled
  this.readingMore = false;

  this.decoder = null;
  this.encoding = null;
  if (options.encoding) {
    if (!StringDecoder)
      StringDecoder = require('string_decoder/').StringDecoder;
    this.decoder = new StringDecoder(options.encoding);
    this.encoding = options.encoding;
  }
}

function Readable(options) {
  var Duplex = require('./_stream_duplex');

  if (!(this instanceof Readable))
    return new Readable(options);

  this._readableState = new ReadableState(options, this);

  // legacy
  this.readable = true;

  Stream.call(this);
}

// Manually shove something into the read() buffer.
// This returns true if the highWaterMark has not been hit yet,
// similar to how Writable.write() returns true if you should
// write() some more.
Readable.prototype.push = function(chunk, encoding) {
  var state = this._readableState;

  if (util.isString(chunk) && !state.objectMode) {
    encoding = encoding || state.defaultEncoding;
    if (encoding !== state.encoding) {
      chunk = new Buffer(chunk, encoding);
      encoding = '';
    }
  }

  return readableAddChunk(this, state, chunk, encoding, false);
};

// Unshift should *always* be something directly out of read()
Readable.prototype.unshift = function(chunk) {
  var state = this._readableState;
  return readableAddChunk(this, state, chunk, '', true);
};

function readableAddChunk(stream, state, chunk, encoding, addToFront) {
  var er = chunkInvalid(state, chunk);
  if (er) {
    stream.emit('error', er);
  } else if (util.isNullOrUndefined(chunk)) {
    state.reading = false;
    if (!state.ended)
      onEofChunk(stream, state);
  } else if (state.objectMode || chunk && chunk.length > 0) {
    if (state.ended && !addToFront) {
      var e = new Error('stream.push() after EOF');
      stream.emit('error', e);
    } else if (state.endEmitted && addToFront) {
      var e = new Error('stream.unshift() after end event');
      stream.emit('error', e);
    } else {
      if (state.decoder && !addToFront && !encoding)
        chunk = state.decoder.write(chunk);

      if (!addToFront)
        state.reading = false;

      // if we want the data now, just emit it.
      if (state.flowing && state.length === 0 && !state.sync) {
        stream.emit('data', chunk);
        stream.read(0);
      } else {
        // update the buffer info.
        state.length += state.objectMode ? 1 : chunk.length;
        if (addToFront)
          state.buffer.unshift(chunk);
        else
          state.buffer.push(chunk);

        if (state.needReadable)
          emitReadable(stream);
      }

      maybeReadMore(stream, state);
    }
  } else if (!addToFront) {
    state.reading = false;
  }

  return needMoreData(state);
}



// if it's past the high water mark, we can push in some more.
// Also, if we have no data yet, we can stand some
// more bytes.  This is to work around cases where hwm=0,
// such as the repl.  Also, if the push() triggered a
// readable event, and the user called read(largeNumber) such that
// needReadable was set, then we ought to push more, so that another
// 'readable' event will be triggered.
function needMoreData(state) {
  return !state.ended &&
         (state.needReadable ||
          state.length < state.highWaterMark ||
          state.length === 0);
}

// backwards compatibility.
Readable.prototype.setEncoding = function(enc) {
  if (!StringDecoder)
    StringDecoder = require('string_decoder/').StringDecoder;
  this._readableState.decoder = new StringDecoder(enc);
  this._readableState.encoding = enc;
  return this;
};

// Don't raise the hwm > 128MB
var MAX_HWM = 0x800000;
function roundUpToNextPowerOf2(n) {
  if (n >= MAX_HWM) {
    n = MAX_HWM;
  } else {
    // Get the next highest power of 2
    n--;
    for (var p = 1; p < 32; p <<= 1) n |= n >> p;
    n++;
  }
  return n;
}

function howMuchToRead(n, state) {
  if (state.length === 0 && state.ended)
    return 0;

  if (state.objectMode)
    return n === 0 ? 0 : 1;

  if (isNaN(n) || util.isNull(n)) {
    // only flow one buffer at a time
    if (state.flowing && state.buffer.length)
      return state.buffer[0].length;
    else
      return state.length;
  }

  if (n <= 0)
    return 0;

  // If we're asking for more than the target buffer level,
  // then raise the water mark.  Bump up to the next highest
  // power of 2, to prevent increasing it excessively in tiny
  // amounts.
  if (n > state.highWaterMark)
    state.highWaterMark = roundUpToNextPowerOf2(n);

  // don't have that much.  return null, unless we've ended.
  if (n > state.length) {
    if (!state.ended) {
      state.needReadable = true;
      return 0;
    } else
      return state.length;
  }

  return n;
}

// you can override either this method, or the async _read(n) below.
Readable.prototype.read = function(n) {
  debug('read', n);
  var state = this._readableState;
  var nOrig = n;

  if (!util.isNumber(n) || n > 0)
    state.emittedReadable = false;

  // if we're doing read(0) to trigger a readable event, but we
  // already have a bunch of data in the buffer, then just trigger
  // the 'readable' event and move on.
  if (n === 0 &&
      state.needReadable &&
      (state.length >= state.highWaterMark || state.ended)) {
    debug('read: emitReadable', state.length, state.ended);
    if (state.length === 0 && state.ended)
      endReadable(this);
    else
      emitReadable(this);
    return null;
  }

  n = howMuchToRead(n, state);

  // if we've ended, and we're now clear, then finish it up.
  if (n === 0 && state.ended) {
    if (state.length === 0)
      endReadable(this);
    return null;
  }

  // All the actual chunk generation logic needs to be
  // *below* the call to _read.  The reason is that in certain
  // synthetic stream cases, such as passthrough streams, _read
  // may be a completely synchronous operation which may change
  // the state of the read buffer, providing enough data when
  // before there was *not* enough.
  //
  // So, the steps are:
  // 1. Figure out what the state of things will be after we do
  // a read from the buffer.
  //
  // 2. If that resulting state will trigger a _read, then call _read.
  // Note that this may be asynchronous, or synchronous.  Yes, it is
  // deeply ugly to write APIs this way, but that still doesn't mean
  // that the Readable class should behave improperly, as streams are
  // designed to be sync/async agnostic.
  // Take note if the _read call is sync or async (ie, if the read call
  // has returned yet), so that we know whether or not it's safe to emit
  // 'readable' etc.
  //
  // 3. Actually pull the requested chunks out of the buffer and return.

  // if we need a readable event, then we need to do some reading.
  var doRead = state.needReadable;
  debug('need readable', doRead);

  // if we currently have less than the highWaterMark, then also read some
  if (state.length === 0 || state.length - n < state.highWaterMark) {
    doRead = true;
    debug('length less than watermark', doRead);
  }

  // however, if we've ended, then there's no point, and if we're already
  // reading, then it's unnecessary.
  if (state.ended || state.reading) {
    doRead = false;
    debug('reading or ended', doRead);
  }

  if (doRead) {
    debug('do read');
    state.reading = true;
    state.sync = true;
    // if the length is currently zero, then we *need* a readable event.
    if (state.length === 0)
      state.needReadable = true;
    // call internal read method
    this._read(state.highWaterMark);
    state.sync = false;
  }

  // If _read pushed data synchronously, then `reading` will be false,
  // and we need to re-evaluate how much data we can return to the user.
  if (doRead && !state.reading)
    n = howMuchToRead(nOrig, state);

  var ret;
  if (n > 0)
    ret = fromList(n, state);
  else
    ret = null;

  if (util.isNull(ret)) {
    state.needReadable = true;
    n = 0;
  }

  state.length -= n;

  // If we have nothing in the buffer, then we want to know
  // as soon as we *do* get something into the buffer.
  if (state.length === 0 && !state.ended)
    state.needReadable = true;

  // If we tried to read() past the EOF, then emit end on the next tick.
  if (nOrig !== n && state.ended && state.length === 0)
    endReadable(this);

  if (!util.isNull(ret))
    this.emit('data', ret);

  return ret;
};

function chunkInvalid(state, chunk) {
  var er = null;
  if (!util.isBuffer(chunk) &&
      !util.isString(chunk) &&
      !util.isNullOrUndefined(chunk) &&
      !state.objectMode) {
    er = new TypeError('Invalid non-string/buffer chunk');
  }
  return er;
}


function onEofChunk(stream, state) {
  if (state.decoder && !state.ended) {
    var chunk = state.decoder.end();
    if (chunk && chunk.length) {
      state.buffer.push(chunk);
      state.length += state.objectMode ? 1 : chunk.length;
    }
  }
  state.ended = true;

  // emit 'readable' now to make sure it gets picked up.
  emitReadable(stream);
}

// Don't emit readable right away in sync mode, because this can trigger
// another read() call => stack overflow.  This way, it might trigger
// a nextTick recursion warning, but that's not so bad.
function emitReadable(stream) {
  var state = stream._readableState;
  state.needReadable = false;
  if (!state.emittedReadable) {
    debug('emitReadable', state.flowing);
    state.emittedReadable = true;
    if (state.sync)
      process.nextTick(function() {
        emitReadable_(stream);
      });
    else
      emitReadable_(stream);
  }
}

function emitReadable_(stream) {
  debug('emit readable');
  stream.emit('readable');
  flow(stream);
}


// at this point, the user has presumably seen the 'readable' event,
// and called read() to consume some data.  that may have triggered
// in turn another _read(n) call, in which case reading = true if
// it's in progress.
// However, if we're not ended, or reading, and the length < hwm,
// then go ahead and try to read some more preemptively.
function maybeReadMore(stream, state) {
  if (!state.readingMore) {
    state.readingMore = true;
    process.nextTick(function() {
      maybeReadMore_(stream, state);
    });
  }
}

function maybeReadMore_(stream, state) {
  var len = state.length;
  while (!state.reading && !state.flowing && !state.ended &&
         state.length < state.highWaterMark) {
    debug('maybeReadMore read 0');
    stream.read(0);
    if (len === state.length)
      // didn't get any data, stop spinning.
      break;
    else
      len = state.length;
  }
  state.readingMore = false;
}

// abstract method.  to be overridden in specific implementation classes.
// call cb(er, data) where data is <= n in length.
// for virtual (non-string, non-buffer) streams, "length" is somewhat
// arbitrary, and perhaps not very meaningful.
Readable.prototype._read = function(n) {
  this.emit('error', new Error('not implemented'));
};

Readable.prototype.pipe = function(dest, pipeOpts) {
  var src = this;
  var state = this._readableState;

  switch (state.pipesCount) {
    case 0:
      state.pipes = dest;
      break;
    case 1:
      state.pipes = [state.pipes, dest];
      break;
    default:
      state.pipes.push(dest);
      break;
  }
  state.pipesCount += 1;
  debug('pipe count=%d opts=%j', state.pipesCount, pipeOpts);

  var doEnd = (!pipeOpts || pipeOpts.end !== false) &&
              dest !== process.stdout &&
              dest !== process.stderr;

  var endFn = doEnd ? onend : cleanup;
  if (state.endEmitted)
    process.nextTick(endFn);
  else
    src.once('end', endFn);

  dest.on('unpipe', onunpipe);
  function onunpipe(readable) {
    debug('onunpipe');
    if (readable === src) {
      cleanup();
    }
  }

  function onend() {
    debug('onend');
    dest.end();
  }

  // when the dest drains, it reduces the awaitDrain counter
  // on the source.  This would be more elegant with a .once()
  // handler in flow(), but adding and removing repeatedly is
  // too slow.
  var ondrain = pipeOnDrain(src);
  dest.on('drain', ondrain);

  function cleanup() {
    debug('cleanup');
    // cleanup event handlers once the pipe is broken
    dest.removeListener('close', onclose);
    dest.removeListener('finish', onfinish);
    dest.removeListener('drain', ondrain);
    dest.removeListener('error', onerror);
    dest.removeListener('unpipe', onunpipe);
    src.removeListener('end', onend);
    src.removeListener('end', cleanup);
    src.removeListener('data', ondata);

    // if the reader is waiting for a drain event from this
    // specific writer, then it would cause it to never start
    // flowing again.
    // So, if this is awaiting a drain, then we just call it now.
    // If we don't know, then assume that we are waiting for one.
    if (state.awaitDrain &&
        (!dest._writableState || dest._writableState.needDrain))
      ondrain();
  }

  src.on('data', ondata);
  function ondata(chunk) {
    debug('ondata');
    var ret = dest.write(chunk);
    if (false === ret) {
      debug('false write response, pause',
            src._readableState.awaitDrain);
      src._readableState.awaitDrain++;
      src.pause();
    }
  }

  // if the dest has an error, then stop piping into it.
  // however, don't suppress the throwing behavior for this.
  function onerror(er) {
    debug('onerror', er);
    unpipe();
    dest.removeListener('error', onerror);
    if (EE.listenerCount(dest, 'error') === 0)
      dest.emit('error', er);
  }
  // This is a brutally ugly hack to make sure that our error handler
  // is attached before any userland ones.  NEVER DO THIS.
  if (!dest._events || !dest._events.error)
    dest.on('error', onerror);
  else if (isArray(dest._events.error))
    dest._events.error.unshift(onerror);
  else
    dest._events.error = [onerror, dest._events.error];



  // Both close and finish should trigger unpipe, but only once.
  function onclose() {
    dest.removeListener('finish', onfinish);
    unpipe();
  }
  dest.once('close', onclose);
  function onfinish() {
    debug('onfinish');
    dest.removeListener('close', onclose);
    unpipe();
  }
  dest.once('finish', onfinish);

  function unpipe() {
    debug('unpipe');
    src.unpipe(dest);
  }

  // tell the dest that it's being piped to
  dest.emit('pipe', src);

  // start the flow if it hasn't been started already.
  if (!state.flowing) {
    debug('pipe resume');
    src.resume();
  }

  return dest;
};

function pipeOnDrain(src) {
  return function() {
    var state = src._readableState;
    debug('pipeOnDrain', state.awaitDrain);
    if (state.awaitDrain)
      state.awaitDrain--;
    if (state.awaitDrain === 0 && EE.listenerCount(src, 'data')) {
      state.flowing = true;
      flow(src);
    }
  };
}


Readable.prototype.unpipe = function(dest) {
  var state = this._readableState;

  // if we're not piping anywhere, then do nothing.
  if (state.pipesCount === 0)
    return this;

  // just one destination.  most common case.
  if (state.pipesCount === 1) {
    // passed in one, but it's not the right one.
    if (dest && dest !== state.pipes)
      return this;

    if (!dest)
      dest = state.pipes;

    // got a match.
    state.pipes = null;
    state.pipesCount = 0;
    state.flowing = false;
    if (dest)
      dest.emit('unpipe', this);
    return this;
  }

  // slow case. multiple pipe destinations.

  if (!dest) {
    // remove all.
    var dests = state.pipes;
    var len = state.pipesCount;
    state.pipes = null;
    state.pipesCount = 0;
    state.flowing = false;

    for (var i = 0; i < len; i++)
      dests[i].emit('unpipe', this);
    return this;
  }

  // try to find the right one.
  var i = indexOf(state.pipes, dest);
  if (i === -1)
    return this;

  state.pipes.splice(i, 1);
  state.pipesCount -= 1;
  if (state.pipesCount === 1)
    state.pipes = state.pipes[0];

  dest.emit('unpipe', this);

  return this;
};

// set up data events if they are asked for
// Ensure readable listeners eventually get something
Readable.prototype.on = function(ev, fn) {
  var res = Stream.prototype.on.call(this, ev, fn);

  // If listening to data, and it has not explicitly been paused,
  // then call resume to start the flow of data on the next tick.
  if (ev === 'data' && false !== this._readableState.flowing) {
    this.resume();
  }

  if (ev === 'readable' && this.readable) {
    var state = this._readableState;
    if (!state.readableListening) {
      state.readableListening = true;
      state.emittedReadable = false;
      state.needReadable = true;
      if (!state.reading) {
        var self = this;
        process.nextTick(function() {
          debug('readable nexttick read 0');
          self.read(0);
        });
      } else if (state.length) {
        emitReadable(this, state);
      }
    }
  }

  return res;
};
Readable.prototype.addListener = Readable.prototype.on;

// pause() and resume() are remnants of the legacy readable stream API
// If the user uses them, then switch into old mode.
Readable.prototype.resume = function() {
  var state = this._readableState;
  if (!state.flowing) {
    debug('resume');
    state.flowing = true;
    if (!state.reading) {
      debug('resume read 0');
      this.read(0);
    }
    resume(this, state);
  }
  return this;
};

function resume(stream, state) {
  if (!state.resumeScheduled) {
    state.resumeScheduled = true;
    process.nextTick(function() {
      resume_(stream, state);
    });
  }
}

function resume_(stream, state) {
  state.resumeScheduled = false;
  stream.emit('resume');
  flow(stream);
  if (state.flowing && !state.reading)
    stream.read(0);
}

Readable.prototype.pause = function() {
  debug('call pause flowing=%j', this._readableState.flowing);
  if (false !== this._readableState.flowing) {
    debug('pause');
    this._readableState.flowing = false;
    this.emit('pause');
  }
  return this;
};

function flow(stream) {
  var state = stream._readableState;
  debug('flow', state.flowing);
  if (state.flowing) {
    do {
      var chunk = stream.read();
    } while (null !== chunk && state.flowing);
  }
}

// wrap an old-style stream as the async data source.
// This is *not* part of the readable stream interface.
// It is an ugly unfortunate mess of history.
Readable.prototype.wrap = function(stream) {
  var state = this._readableState;
  var paused = false;

  var self = this;
  stream.on('end', function() {
    debug('wrapped end');
    if (state.decoder && !state.ended) {
      var chunk = state.decoder.end();
      if (chunk && chunk.length)
        self.push(chunk);
    }

    self.push(null);
  });

  stream.on('data', function(chunk) {
    debug('wrapped data');
    if (state.decoder)
      chunk = state.decoder.write(chunk);
    if (!chunk || !state.objectMode && !chunk.length)
      return;

    var ret = self.push(chunk);
    if (!ret) {
      paused = true;
      stream.pause();
    }
  });

  // proxy all the other methods.
  // important when wrapping filters and duplexes.
  for (var i in stream) {
    if (util.isFunction(stream[i]) && util.isUndefined(this[i])) {
      this[i] = function(method) { return function() {
        return stream[method].apply(stream, arguments);
      }}(i);
    }
  }

  // proxy certain important events.
  var events = ['error', 'close', 'destroy', 'pause', 'resume'];
  forEach(events, function(ev) {
    stream.on(ev, self.emit.bind(self, ev));
  });

  // when we try to consume some more bytes, simply unpause the
  // underlying stream.
  self._read = function(n) {
    debug('wrapped _read', n);
    if (paused) {
      paused = false;
      stream.resume();
    }
  };

  return self;
};



// exposed for testing purposes only.
Readable._fromList = fromList;

// Pluck off n bytes from an array of buffers.
// Length is the combined lengths of all the buffers in the list.
function fromList(n, state) {
  var list = state.buffer;
  var length = state.length;
  var stringMode = !!state.decoder;
  var objectMode = !!state.objectMode;
  var ret;

  // nothing in the list, definitely empty.
  if (list.length === 0)
    return null;

  if (length === 0)
    ret = null;
  else if (objectMode)
    ret = list.shift();
  else if (!n || n >= length) {
    // read it all, truncate the array.
    if (stringMode)
      ret = list.join('');
    else
      ret = Buffer.concat(list, length);
    list.length = 0;
  } else {
    // read just some of it.
    if (n < list[0].length) {
      // just take a part of the first list item.
      // slice is the same for buffers and strings.
      var buf = list[0];
      ret = buf.slice(0, n);
      list[0] = buf.slice(n);
    } else if (n === list[0].length) {
      // first list is a perfect match
      ret = list.shift();
    } else {
      // complex case.
      // we have enough to cover it, but it spans past the first buffer.
      if (stringMode)
        ret = '';
      else
        ret = new Buffer(n);

      var c = 0;
      for (var i = 0, l = list.length; i < l && c < n; i++) {
        var buf = list[0];
        var cpy = Math.min(n - c, buf.length);

        if (stringMode)
          ret += buf.slice(0, cpy);
        else
          buf.copy(ret, c, 0, cpy);

        if (cpy < buf.length)
          list[0] = buf.slice(cpy);
        else
          list.shift();

        c += cpy;
      }
    }
  }

  return ret;
}

function endReadable(stream) {
  var state = stream._readableState;

  // If we get here before consuming all the bytes, then that is a
  // bug in node.  Should never happen.
  if (state.length > 0)
    throw new Error('endReadable called on non-empty stream');

  if (!state.endEmitted) {
    state.ended = true;
    process.nextTick(function() {
      // Check that we didn't get one last unshift.
      if (!state.endEmitted && state.length === 0) {
        state.endEmitted = true;
        stream.readable = false;
        stream.emit('end');
      }
    });
  }
}

function forEach (xs, f) {
  for (var i = 0, l = xs.length; i < l; i++) {
    f(xs[i], i);
  }
}

function indexOf (xs, x) {
  for (var i = 0, l = xs.length; i < l; i++) {
    if (xs[i] === x) return i;
  }
  return -1;
}

}).call(this,require('_process'))
},{"./_stream_duplex":42,"_process":40,"buffer":33,"core-util-is":47,"events":37,"inherits":38,"isarray":39,"stream":52,"string_decoder/":53,"util":32}],45:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.


// a transform stream is a readable/writable stream where you do
// something with the data.  Sometimes it's called a "filter",
// but that's not a great name for it, since that implies a thing where
// some bits pass through, and others are simply ignored.  (That would
// be a valid example of a transform, of course.)
//
// While the output is causally related to the input, it's not a
// necessarily symmetric or synchronous transformation.  For example,
// a zlib stream might take multiple plain-text writes(), and then
// emit a single compressed chunk some time in the future.
//
// Here's how this works:
//
// The Transform stream has all the aspects of the readable and writable
// stream classes.  When you write(chunk), that calls _write(chunk,cb)
// internally, and returns false if there's a lot of pending writes
// buffered up.  When you call read(), that calls _read(n) until
// there's enough pending readable data buffered up.
//
// In a transform stream, the written data is placed in a buffer.  When
// _read(n) is called, it transforms the queued up data, calling the
// buffered _write cb's as it consumes chunks.  If consuming a single
// written chunk would result in multiple output chunks, then the first
// outputted bit calls the readcb, and subsequent chunks just go into
// the read buffer, and will cause it to emit 'readable' if necessary.
//
// This way, back-pressure is actually determined by the reading side,
// since _read has to be called to start processing a new chunk.  However,
// a pathological inflate type of transform can cause excessive buffering
// here.  For example, imagine a stream where every byte of input is
// interpreted as an integer from 0-255, and then results in that many
// bytes of output.  Writing the 4 bytes {ff,ff,ff,ff} would result in
// 1kb of data being output.  In this case, you could write a very small
// amount of input, and end up with a very large amount of output.  In
// such a pathological inflating mechanism, there'd be no way to tell
// the system to stop doing the transform.  A single 4MB write could
// cause the system to run out of memory.
//
// However, even in such a pathological case, only a single written chunk
// would be consumed, and then the rest would wait (un-transformed) until
// the results of the previous transformed chunk were consumed.

module.exports = Transform;

var Duplex = require('./_stream_duplex');

/*<replacement>*/
var util = require('core-util-is');
util.inherits = require('inherits');
/*</replacement>*/

util.inherits(Transform, Duplex);


function TransformState(options, stream) {
  this.afterTransform = function(er, data) {
    return afterTransform(stream, er, data);
  };

  this.needTransform = false;
  this.transforming = false;
  this.writecb = null;
  this.writechunk = null;
}

function afterTransform(stream, er, data) {
  var ts = stream._transformState;
  ts.transforming = false;

  var cb = ts.writecb;

  if (!cb)
    return stream.emit('error', new Error('no writecb in Transform class'));

  ts.writechunk = null;
  ts.writecb = null;

  if (!util.isNullOrUndefined(data))
    stream.push(data);

  if (cb)
    cb(er);

  var rs = stream._readableState;
  rs.reading = false;
  if (rs.needReadable || rs.length < rs.highWaterMark) {
    stream._read(rs.highWaterMark);
  }
}


function Transform(options) {
  if (!(this instanceof Transform))
    return new Transform(options);

  Duplex.call(this, options);

  this._transformState = new TransformState(options, this);

  // when the writable side finishes, then flush out anything remaining.
  var stream = this;

  // start out asking for a readable event once data is transformed.
  this._readableState.needReadable = true;

  // we have implemented the _read method, and done the other things
  // that Readable wants before the first _read call, so unset the
  // sync guard flag.
  this._readableState.sync = false;

  this.once('prefinish', function() {
    if (util.isFunction(this._flush))
      this._flush(function(er) {
        done(stream, er);
      });
    else
      done(stream);
  });
}

Transform.prototype.push = function(chunk, encoding) {
  this._transformState.needTransform = false;
  return Duplex.prototype.push.call(this, chunk, encoding);
};

// This is the part where you do stuff!
// override this function in implementation classes.
// 'chunk' is an input chunk.
//
// Call `push(newChunk)` to pass along transformed output
// to the readable side.  You may call 'push' zero or more times.
//
// Call `cb(err)` when you are done with this chunk.  If you pass
// an error, then that'll put the hurt on the whole operation.  If you
// never call cb(), then you'll never get another chunk.
Transform.prototype._transform = function(chunk, encoding, cb) {
  throw new Error('not implemented');
};

Transform.prototype._write = function(chunk, encoding, cb) {
  var ts = this._transformState;
  ts.writecb = cb;
  ts.writechunk = chunk;
  ts.writeencoding = encoding;
  if (!ts.transforming) {
    var rs = this._readableState;
    if (ts.needTransform ||
        rs.needReadable ||
        rs.length < rs.highWaterMark)
      this._read(rs.highWaterMark);
  }
};

// Doesn't matter what the args are here.
// _transform does all the work.
// That we got here means that the readable side wants more data.
Transform.prototype._read = function(n) {
  var ts = this._transformState;

  if (!util.isNull(ts.writechunk) && ts.writecb && !ts.transforming) {
    ts.transforming = true;
    this._transform(ts.writechunk, ts.writeencoding, ts.afterTransform);
  } else {
    // mark that we need a transform, so that any data that comes in
    // will get processed, now that we've asked for it.
    ts.needTransform = true;
  }
};


function done(stream, er) {
  if (er)
    return stream.emit('error', er);

  // if there's nothing in the write buffer, then that means
  // that nothing more will ever be provided
  var ws = stream._writableState;
  var ts = stream._transformState;

  if (ws.length)
    throw new Error('calling transform done when ws.length != 0');

  if (ts.transforming)
    throw new Error('calling transform done when still transforming');

  return stream.push(null);
}

},{"./_stream_duplex":42,"core-util-is":47,"inherits":38}],46:[function(require,module,exports){
(function (process){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// A bit simpler than readable streams.
// Implement an async ._write(chunk, cb), and it'll handle all
// the drain event emission and buffering.

module.exports = Writable;

/*<replacement>*/
var Buffer = require('buffer').Buffer;
/*</replacement>*/

Writable.WritableState = WritableState;


/*<replacement>*/
var util = require('core-util-is');
util.inherits = require('inherits');
/*</replacement>*/

var Stream = require('stream');

util.inherits(Writable, Stream);

function WriteReq(chunk, encoding, cb) {
  this.chunk = chunk;
  this.encoding = encoding;
  this.callback = cb;
}

function WritableState(options, stream) {
  var Duplex = require('./_stream_duplex');

  options = options || {};

  // the point at which write() starts returning false
  // Note: 0 is a valid value, means that we always return false if
  // the entire buffer is not flushed immediately on write()
  var hwm = options.highWaterMark;
  var defaultHwm = options.objectMode ? 16 : 16 * 1024;
  this.highWaterMark = (hwm || hwm === 0) ? hwm : defaultHwm;

  // object stream flag to indicate whether or not this stream
  // contains buffers or objects.
  this.objectMode = !!options.objectMode;

  if (stream instanceof Duplex)
    this.objectMode = this.objectMode || !!options.writableObjectMode;

  // cast to ints.
  this.highWaterMark = ~~this.highWaterMark;

  this.needDrain = false;
  // at the start of calling end()
  this.ending = false;
  // when end() has been called, and returned
  this.ended = false;
  // when 'finish' is emitted
  this.finished = false;

  // should we decode strings into buffers before passing to _write?
  // this is here so that some node-core streams can optimize string
  // handling at a lower level.
  var noDecode = options.decodeStrings === false;
  this.decodeStrings = !noDecode;

  // Crypto is kind of old and crusty.  Historically, its default string
  // encoding is 'binary' so we have to make this configurable.
  // Everything else in the universe uses 'utf8', though.
  this.defaultEncoding = options.defaultEncoding || 'utf8';

  // not an actual buffer we keep track of, but a measurement
  // of how much we're waiting to get pushed to some underlying
  // socket or file.
  this.length = 0;

  // a flag to see when we're in the middle of a write.
  this.writing = false;

  // when true all writes will be buffered until .uncork() call
  this.corked = 0;

  // a flag to be able to tell if the onwrite cb is called immediately,
  // or on a later tick.  We set this to true at first, because any
  // actions that shouldn't happen until "later" should generally also
  // not happen before the first write call.
  this.sync = true;

  // a flag to know if we're processing previously buffered items, which
  // may call the _write() callback in the same tick, so that we don't
  // end up in an overlapped onwrite situation.
  this.bufferProcessing = false;

  // the callback that's passed to _write(chunk,cb)
  this.onwrite = function(er) {
    onwrite(stream, er);
  };

  // the callback that the user supplies to write(chunk,encoding,cb)
  this.writecb = null;

  // the amount that is being written when _write is called.
  this.writelen = 0;

  this.buffer = [];

  // number of pending user-supplied write callbacks
  // this must be 0 before 'finish' can be emitted
  this.pendingcb = 0;

  // emit prefinish if the only thing we're waiting for is _write cbs
  // This is relevant for synchronous Transform streams
  this.prefinished = false;

  // True if the error was already emitted and should not be thrown again
  this.errorEmitted = false;
}

function Writable(options) {
  var Duplex = require('./_stream_duplex');

  // Writable ctor is applied to Duplexes, though they're not
  // instanceof Writable, they're instanceof Readable.
  if (!(this instanceof Writable) && !(this instanceof Duplex))
    return new Writable(options);

  this._writableState = new WritableState(options, this);

  // legacy.
  this.writable = true;

  Stream.call(this);
}

// Otherwise people can pipe Writable streams, which is just wrong.
Writable.prototype.pipe = function() {
  this.emit('error', new Error('Cannot pipe. Not readable.'));
};


function writeAfterEnd(stream, state, cb) {
  var er = new Error('write after end');
  // TODO: defer error events consistently everywhere, not just the cb
  stream.emit('error', er);
  process.nextTick(function() {
    cb(er);
  });
}

// If we get something that is not a buffer, string, null, or undefined,
// and we're not in objectMode, then that's an error.
// Otherwise stream chunks are all considered to be of length=1, and the
// watermarks determine how many objects to keep in the buffer, rather than
// how many bytes or characters.
function validChunk(stream, state, chunk, cb) {
  var valid = true;
  if (!util.isBuffer(chunk) &&
      !util.isString(chunk) &&
      !util.isNullOrUndefined(chunk) &&
      !state.objectMode) {
    var er = new TypeError('Invalid non-string/buffer chunk');
    stream.emit('error', er);
    process.nextTick(function() {
      cb(er);
    });
    valid = false;
  }
  return valid;
}

Writable.prototype.write = function(chunk, encoding, cb) {
  var state = this._writableState;
  var ret = false;

  if (util.isFunction(encoding)) {
    cb = encoding;
    encoding = null;
  }

  if (util.isBuffer(chunk))
    encoding = 'buffer';
  else if (!encoding)
    encoding = state.defaultEncoding;

  if (!util.isFunction(cb))
    cb = function() {};

  if (state.ended)
    writeAfterEnd(this, state, cb);
  else if (validChunk(this, state, chunk, cb)) {
    state.pendingcb++;
    ret = writeOrBuffer(this, state, chunk, encoding, cb);
  }

  return ret;
};

Writable.prototype.cork = function() {
  var state = this._writableState;

  state.corked++;
};

Writable.prototype.uncork = function() {
  var state = this._writableState;

  if (state.corked) {
    state.corked--;

    if (!state.writing &&
        !state.corked &&
        !state.finished &&
        !state.bufferProcessing &&
        state.buffer.length)
      clearBuffer(this, state);
  }
};

function decodeChunk(state, chunk, encoding) {
  if (!state.objectMode &&
      state.decodeStrings !== false &&
      util.isString(chunk)) {
    chunk = new Buffer(chunk, encoding);
  }
  return chunk;
}

// if we're already writing something, then just put this
// in the queue, and wait our turn.  Otherwise, call _write
// If we return false, then we need a drain event, so set that flag.
function writeOrBuffer(stream, state, chunk, encoding, cb) {
  chunk = decodeChunk(state, chunk, encoding);
  if (util.isBuffer(chunk))
    encoding = 'buffer';
  var len = state.objectMode ? 1 : chunk.length;

  state.length += len;

  var ret = state.length < state.highWaterMark;
  // we must ensure that previous needDrain will not be reset to false.
  if (!ret)
    state.needDrain = true;

  if (state.writing || state.corked)
    state.buffer.push(new WriteReq(chunk, encoding, cb));
  else
    doWrite(stream, state, false, len, chunk, encoding, cb);

  return ret;
}

function doWrite(stream, state, writev, len, chunk, encoding, cb) {
  state.writelen = len;
  state.writecb = cb;
  state.writing = true;
  state.sync = true;
  if (writev)
    stream._writev(chunk, state.onwrite);
  else
    stream._write(chunk, encoding, state.onwrite);
  state.sync = false;
}

function onwriteError(stream, state, sync, er, cb) {
  if (sync)
    process.nextTick(function() {
      state.pendingcb--;
      cb(er);
    });
  else {
    state.pendingcb--;
    cb(er);
  }

  stream._writableState.errorEmitted = true;
  stream.emit('error', er);
}

function onwriteStateUpdate(state) {
  state.writing = false;
  state.writecb = null;
  state.length -= state.writelen;
  state.writelen = 0;
}

function onwrite(stream, er) {
  var state = stream._writableState;
  var sync = state.sync;
  var cb = state.writecb;

  onwriteStateUpdate(state);

  if (er)
    onwriteError(stream, state, sync, er, cb);
  else {
    // Check if we're actually ready to finish, but don't emit yet
    var finished = needFinish(stream, state);

    if (!finished &&
        !state.corked &&
        !state.bufferProcessing &&
        state.buffer.length) {
      clearBuffer(stream, state);
    }

    if (sync) {
      process.nextTick(function() {
        afterWrite(stream, state, finished, cb);
      });
    } else {
      afterWrite(stream, state, finished, cb);
    }
  }
}

function afterWrite(stream, state, finished, cb) {
  if (!finished)
    onwriteDrain(stream, state);
  state.pendingcb--;
  cb();
  finishMaybe(stream, state);
}

// Must force callback to be called on nextTick, so that we don't
// emit 'drain' before the write() consumer gets the 'false' return
// value, and has a chance to attach a 'drain' listener.
function onwriteDrain(stream, state) {
  if (state.length === 0 && state.needDrain) {
    state.needDrain = false;
    stream.emit('drain');
  }
}


// if there's something in the buffer waiting, then process it
function clearBuffer(stream, state) {
  state.bufferProcessing = true;

  if (stream._writev && state.buffer.length > 1) {
    // Fast case, write everything using _writev()
    var cbs = [];
    for (var c = 0; c < state.buffer.length; c++)
      cbs.push(state.buffer[c].callback);

    // count the one we are adding, as well.
    // TODO(isaacs) clean this up
    state.pendingcb++;
    doWrite(stream, state, true, state.length, state.buffer, '', function(err) {
      for (var i = 0; i < cbs.length; i++) {
        state.pendingcb--;
        cbs[i](err);
      }
    });

    // Clear buffer
    state.buffer = [];
  } else {
    // Slow case, write chunks one-by-one
    for (var c = 0; c < state.buffer.length; c++) {
      var entry = state.buffer[c];
      var chunk = entry.chunk;
      var encoding = entry.encoding;
      var cb = entry.callback;
      var len = state.objectMode ? 1 : chunk.length;

      doWrite(stream, state, false, len, chunk, encoding, cb);

      // if we didn't call the onwrite immediately, then
      // it means that we need to wait until it does.
      // also, that means that the chunk and cb are currently
      // being processed, so move the buffer counter past them.
      if (state.writing) {
        c++;
        break;
      }
    }

    if (c < state.buffer.length)
      state.buffer = state.buffer.slice(c);
    else
      state.buffer.length = 0;
  }

  state.bufferProcessing = false;
}

Writable.prototype._write = function(chunk, encoding, cb) {
  cb(new Error('not implemented'));

};

Writable.prototype._writev = null;

Writable.prototype.end = function(chunk, encoding, cb) {
  var state = this._writableState;

  if (util.isFunction(chunk)) {
    cb = chunk;
    chunk = null;
    encoding = null;
  } else if (util.isFunction(encoding)) {
    cb = encoding;
    encoding = null;
  }

  if (!util.isNullOrUndefined(chunk))
    this.write(chunk, encoding);

  // .end() fully uncorks
  if (state.corked) {
    state.corked = 1;
    this.uncork();
  }

  // ignore unnecessary end() calls.
  if (!state.ending && !state.finished)
    endWritable(this, state, cb);
};


function needFinish(stream, state) {
  return (state.ending &&
          state.length === 0 &&
          !state.finished &&
          !state.writing);
}

function prefinish(stream, state) {
  if (!state.prefinished) {
    state.prefinished = true;
    stream.emit('prefinish');
  }
}

function finishMaybe(stream, state) {
  var need = needFinish(stream, state);
  if (need) {
    if (state.pendingcb === 0) {
      prefinish(stream, state);
      state.finished = true;
      stream.emit('finish');
    } else
      prefinish(stream, state);
  }
  return need;
}

function endWritable(stream, state, cb) {
  state.ending = true;
  finishMaybe(stream, state);
  if (cb) {
    if (state.finished)
      process.nextTick(cb);
    else
      stream.once('finish', cb);
  }
  state.ended = true;
}

}).call(this,require('_process'))
},{"./_stream_duplex":42,"_process":40,"buffer":33,"core-util-is":47,"inherits":38,"stream":52}],47:[function(require,module,exports){
(function (Buffer){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// NOTE: These type checking functions intentionally don't use `instanceof`
// because it is fragile and can be easily faked with `Object.create()`.
function isArray(ar) {
  return Array.isArray(ar);
}
exports.isArray = isArray;

function isBoolean(arg) {
  return typeof arg === 'boolean';
}
exports.isBoolean = isBoolean;

function isNull(arg) {
  return arg === null;
}
exports.isNull = isNull;

function isNullOrUndefined(arg) {
  return arg == null;
}
exports.isNullOrUndefined = isNullOrUndefined;

function isNumber(arg) {
  return typeof arg === 'number';
}
exports.isNumber = isNumber;

function isString(arg) {
  return typeof arg === 'string';
}
exports.isString = isString;

function isSymbol(arg) {
  return typeof arg === 'symbol';
}
exports.isSymbol = isSymbol;

function isUndefined(arg) {
  return arg === void 0;
}
exports.isUndefined = isUndefined;

function isRegExp(re) {
  return isObject(re) && objectToString(re) === '[object RegExp]';
}
exports.isRegExp = isRegExp;

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}
exports.isObject = isObject;

function isDate(d) {
  return isObject(d) && objectToString(d) === '[object Date]';
}
exports.isDate = isDate;

function isError(e) {
  return isObject(e) &&
      (objectToString(e) === '[object Error]' || e instanceof Error);
}
exports.isError = isError;

function isFunction(arg) {
  return typeof arg === 'function';
}
exports.isFunction = isFunction;

function isPrimitive(arg) {
  return arg === null ||
         typeof arg === 'boolean' ||
         typeof arg === 'number' ||
         typeof arg === 'string' ||
         typeof arg === 'symbol' ||  // ES6 symbol
         typeof arg === 'undefined';
}
exports.isPrimitive = isPrimitive;

function isBuffer(arg) {
  return Buffer.isBuffer(arg);
}
exports.isBuffer = isBuffer;

function objectToString(o) {
  return Object.prototype.toString.call(o);
}
}).call(this,require("buffer").Buffer)
},{"buffer":33}],48:[function(require,module,exports){
module.exports = require("./lib/_stream_passthrough.js")

},{"./lib/_stream_passthrough.js":43}],49:[function(require,module,exports){
exports = module.exports = require('./lib/_stream_readable.js');
exports.Stream = require('stream');
exports.Readable = exports;
exports.Writable = require('./lib/_stream_writable.js');
exports.Duplex = require('./lib/_stream_duplex.js');
exports.Transform = require('./lib/_stream_transform.js');
exports.PassThrough = require('./lib/_stream_passthrough.js');

},{"./lib/_stream_duplex.js":42,"./lib/_stream_passthrough.js":43,"./lib/_stream_readable.js":44,"./lib/_stream_transform.js":45,"./lib/_stream_writable.js":46,"stream":52}],50:[function(require,module,exports){
module.exports = require("./lib/_stream_transform.js")

},{"./lib/_stream_transform.js":45}],51:[function(require,module,exports){
module.exports = require("./lib/_stream_writable.js")

},{"./lib/_stream_writable.js":46}],52:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

module.exports = Stream;

var EE = require('events').EventEmitter;
var inherits = require('inherits');

inherits(Stream, EE);
Stream.Readable = require('readable-stream/readable.js');
Stream.Writable = require('readable-stream/writable.js');
Stream.Duplex = require('readable-stream/duplex.js');
Stream.Transform = require('readable-stream/transform.js');
Stream.PassThrough = require('readable-stream/passthrough.js');

// Backwards-compat with node 0.4.x
Stream.Stream = Stream;



// old-style streams.  Note that the pipe method (the only relevant
// part of this class) is overridden in the Readable class.

function Stream() {
  EE.call(this);
}

Stream.prototype.pipe = function(dest, options) {
  var source = this;

  function ondata(chunk) {
    if (dest.writable) {
      if (false === dest.write(chunk) && source.pause) {
        source.pause();
      }
    }
  }

  source.on('data', ondata);

  function ondrain() {
    if (source.readable && source.resume) {
      source.resume();
    }
  }

  dest.on('drain', ondrain);

  // If the 'end' option is not supplied, dest.end() will be called when
  // source gets the 'end' or 'close' events.  Only dest.end() once.
  if (!dest._isStdio && (!options || options.end !== false)) {
    source.on('end', onend);
    source.on('close', onclose);
  }

  var didOnEnd = false;
  function onend() {
    if (didOnEnd) return;
    didOnEnd = true;

    dest.end();
  }


  function onclose() {
    if (didOnEnd) return;
    didOnEnd = true;

    if (typeof dest.destroy === 'function') dest.destroy();
  }

  // don't leave dangling pipes when there are errors.
  function onerror(er) {
    cleanup();
    if (EE.listenerCount(this, 'error') === 0) {
      throw er; // Unhandled stream error in pipe.
    }
  }

  source.on('error', onerror);
  dest.on('error', onerror);

  // remove all the event listeners that were added.
  function cleanup() {
    source.removeListener('data', ondata);
    dest.removeListener('drain', ondrain);

    source.removeListener('end', onend);
    source.removeListener('close', onclose);

    source.removeListener('error', onerror);
    dest.removeListener('error', onerror);

    source.removeListener('end', cleanup);
    source.removeListener('close', cleanup);

    dest.removeListener('close', cleanup);
  }

  source.on('end', cleanup);
  source.on('close', cleanup);

  dest.on('close', cleanup);

  dest.emit('pipe', source);

  // Allow for unix-like usage: A.pipe(B).pipe(C)
  return dest;
};

},{"events":37,"inherits":38,"readable-stream/duplex.js":41,"readable-stream/passthrough.js":48,"readable-stream/readable.js":49,"readable-stream/transform.js":50,"readable-stream/writable.js":51}],53:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var Buffer = require('buffer').Buffer;

var isBufferEncoding = Buffer.isEncoding
  || function(encoding) {
       switch (encoding && encoding.toLowerCase()) {
         case 'hex': case 'utf8': case 'utf-8': case 'ascii': case 'binary': case 'base64': case 'ucs2': case 'ucs-2': case 'utf16le': case 'utf-16le': case 'raw': return true;
         default: return false;
       }
     }


function assertEncoding(encoding) {
  if (encoding && !isBufferEncoding(encoding)) {
    throw new Error('Unknown encoding: ' + encoding);
  }
}

// StringDecoder provides an interface for efficiently splitting a series of
// buffers into a series of JS strings without breaking apart multi-byte
// characters. CESU-8 is handled as part of the UTF-8 encoding.
//
// @TODO Handling all encodings inside a single object makes it very difficult
// to reason about this code, so it should be split up in the future.
// @TODO There should be a utf8-strict encoding that rejects invalid UTF-8 code
// points as used by CESU-8.
var StringDecoder = exports.StringDecoder = function(encoding) {
  this.encoding = (encoding || 'utf8').toLowerCase().replace(/[-_]/, '');
  assertEncoding(encoding);
  switch (this.encoding) {
    case 'utf8':
      // CESU-8 represents each of Surrogate Pair by 3-bytes
      this.surrogateSize = 3;
      break;
    case 'ucs2':
    case 'utf16le':
      // UTF-16 represents each of Surrogate Pair by 2-bytes
      this.surrogateSize = 2;
      this.detectIncompleteChar = utf16DetectIncompleteChar;
      break;
    case 'base64':
      // Base-64 stores 3 bytes in 4 chars, and pads the remainder.
      this.surrogateSize = 3;
      this.detectIncompleteChar = base64DetectIncompleteChar;
      break;
    default:
      this.write = passThroughWrite;
      return;
  }

  // Enough space to store all bytes of a single character. UTF-8 needs 4
  // bytes, but CESU-8 may require up to 6 (3 bytes per surrogate).
  this.charBuffer = new Buffer(6);
  // Number of bytes received for the current incomplete multi-byte character.
  this.charReceived = 0;
  // Number of bytes expected for the current incomplete multi-byte character.
  this.charLength = 0;
};


// write decodes the given buffer and returns it as JS string that is
// guaranteed to not contain any partial multi-byte characters. Any partial
// character found at the end of the buffer is buffered up, and will be
// returned when calling write again with the remaining bytes.
//
// Note: Converting a Buffer containing an orphan surrogate to a String
// currently works, but converting a String to a Buffer (via `new Buffer`, or
// Buffer#write) will replace incomplete surrogates with the unicode
// replacement character. See https://codereview.chromium.org/121173009/ .
StringDecoder.prototype.write = function(buffer) {
  var charStr = '';
  // if our last write ended with an incomplete multibyte character
  while (this.charLength) {
    // determine how many remaining bytes this buffer has to offer for this char
    var available = (buffer.length >= this.charLength - this.charReceived) ?
        this.charLength - this.charReceived :
        buffer.length;

    // add the new bytes to the char buffer
    buffer.copy(this.charBuffer, this.charReceived, 0, available);
    this.charReceived += available;

    if (this.charReceived < this.charLength) {
      // still not enough chars in this buffer? wait for more ...
      return '';
    }

    // remove bytes belonging to the current character from the buffer
    buffer = buffer.slice(available, buffer.length);

    // get the character that was split
    charStr = this.charBuffer.slice(0, this.charLength).toString(this.encoding);

    // CESU-8: lead surrogate (D800-DBFF) is also the incomplete character
    var charCode = charStr.charCodeAt(charStr.length - 1);
    if (charCode >= 0xD800 && charCode <= 0xDBFF) {
      this.charLength += this.surrogateSize;
      charStr = '';
      continue;
    }
    this.charReceived = this.charLength = 0;

    // if there are no more bytes in this buffer, just emit our char
    if (buffer.length === 0) {
      return charStr;
    }
    break;
  }

  // determine and set charLength / charReceived
  this.detectIncompleteChar(buffer);

  var end = buffer.length;
  if (this.charLength) {
    // buffer the incomplete character bytes we got
    buffer.copy(this.charBuffer, 0, buffer.length - this.charReceived, end);
    end -= this.charReceived;
  }

  charStr += buffer.toString(this.encoding, 0, end);

  var end = charStr.length - 1;
  var charCode = charStr.charCodeAt(end);
  // CESU-8: lead surrogate (D800-DBFF) is also the incomplete character
  if (charCode >= 0xD800 && charCode <= 0xDBFF) {
    var size = this.surrogateSize;
    this.charLength += size;
    this.charReceived += size;
    this.charBuffer.copy(this.charBuffer, size, 0, size);
    buffer.copy(this.charBuffer, 0, 0, size);
    return charStr.substring(0, end);
  }

  // or just emit the charStr
  return charStr;
};

// detectIncompleteChar determines if there is an incomplete UTF-8 character at
// the end of the given buffer. If so, it sets this.charLength to the byte
// length that character, and sets this.charReceived to the number of bytes
// that are available for this character.
StringDecoder.prototype.detectIncompleteChar = function(buffer) {
  // determine how many bytes we have to check at the end of this buffer
  var i = (buffer.length >= 3) ? 3 : buffer.length;

  // Figure out if one of the last i bytes of our buffer announces an
  // incomplete char.
  for (; i > 0; i--) {
    var c = buffer[buffer.length - i];

    // See http://en.wikipedia.org/wiki/UTF-8#Description

    // 110XXXXX
    if (i == 1 && c >> 5 == 0x06) {
      this.charLength = 2;
      break;
    }

    // 1110XXXX
    if (i <= 2 && c >> 4 == 0x0E) {
      this.charLength = 3;
      break;
    }

    // 11110XXX
    if (i <= 3 && c >> 3 == 0x1E) {
      this.charLength = 4;
      break;
    }
  }
  this.charReceived = i;
};

StringDecoder.prototype.end = function(buffer) {
  var res = '';
  if (buffer && buffer.length)
    res = this.write(buffer);

  if (this.charReceived) {
    var cr = this.charReceived;
    var buf = this.charBuffer;
    var enc = this.encoding;
    res += buf.slice(0, cr).toString(enc);
  }

  return res;
};

function passThroughWrite(buffer) {
  return buffer.toString(this.encoding);
}

function utf16DetectIncompleteChar(buffer) {
  this.charReceived = buffer.length % 2;
  this.charLength = this.charReceived ? 2 : 0;
}

function base64DetectIncompleteChar(buffer) {
  this.charReceived = buffer.length % 3;
  this.charLength = this.charReceived ? 3 : 0;
}

},{"buffer":33}],54:[function(require,module,exports){
module.exports = function isBuffer(arg) {
  return arg && typeof arg === 'object'
    && typeof arg.copy === 'function'
    && typeof arg.fill === 'function'
    && typeof arg.readUInt8 === 'function';
}
},{}],55:[function(require,module,exports){
(function (process,global){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var formatRegExp = /%[sdj%]/g;
exports.format = function(f) {
  if (!isString(f)) {
    var objects = [];
    for (var i = 0; i < arguments.length; i++) {
      objects.push(inspect(arguments[i]));
    }
    return objects.join(' ');
  }

  var i = 1;
  var args = arguments;
  var len = args.length;
  var str = String(f).replace(formatRegExp, function(x) {
    if (x === '%%') return '%';
    if (i >= len) return x;
    switch (x) {
      case '%s': return String(args[i++]);
      case '%d': return Number(args[i++]);
      case '%j':
        try {
          return JSON.stringify(args[i++]);
        } catch (_) {
          return '[Circular]';
        }
      default:
        return x;
    }
  });
  for (var x = args[i]; i < len; x = args[++i]) {
    if (isNull(x) || !isObject(x)) {
      str += ' ' + x;
    } else {
      str += ' ' + inspect(x);
    }
  }
  return str;
};


// Mark that a method should not be used.
// Returns a modified function which warns once by default.
// If --no-deprecation is set, then it is a no-op.
exports.deprecate = function(fn, msg) {
  // Allow for deprecating things in the process of starting up.
  if (isUndefined(global.process)) {
    return function() {
      return exports.deprecate(fn, msg).apply(this, arguments);
    };
  }

  if (process.noDeprecation === true) {
    return fn;
  }

  var warned = false;
  function deprecated() {
    if (!warned) {
      if (process.throwDeprecation) {
        throw new Error(msg);
      } else if (process.traceDeprecation) {
        console.trace(msg);
      } else {
        console.error(msg);
      }
      warned = true;
    }
    return fn.apply(this, arguments);
  }

  return deprecated;
};


var debugs = {};
var debugEnviron;
exports.debuglog = function(set) {
  if (isUndefined(debugEnviron))
    debugEnviron = process.env.NODE_DEBUG || '';
  set = set.toUpperCase();
  if (!debugs[set]) {
    if (new RegExp('\\b' + set + '\\b', 'i').test(debugEnviron)) {
      var pid = process.pid;
      debugs[set] = function() {
        var msg = exports.format.apply(exports, arguments);
        console.error('%s %d: %s', set, pid, msg);
      };
    } else {
      debugs[set] = function() {};
    }
  }
  return debugs[set];
};


/**
 * Echos the value of a value. Trys to print the value out
 * in the best way possible given the different types.
 *
 * @param {Object} obj The object to print out.
 * @param {Object} opts Optional options object that alters the output.
 */
/* legacy: obj, showHidden, depth, colors*/
function inspect(obj, opts) {
  // default options
  var ctx = {
    seen: [],
    stylize: stylizeNoColor
  };
  // legacy...
  if (arguments.length >= 3) ctx.depth = arguments[2];
  if (arguments.length >= 4) ctx.colors = arguments[3];
  if (isBoolean(opts)) {
    // legacy...
    ctx.showHidden = opts;
  } else if (opts) {
    // got an "options" object
    exports._extend(ctx, opts);
  }
  // set default options
  if (isUndefined(ctx.showHidden)) ctx.showHidden = false;
  if (isUndefined(ctx.depth)) ctx.depth = 2;
  if (isUndefined(ctx.colors)) ctx.colors = false;
  if (isUndefined(ctx.customInspect)) ctx.customInspect = true;
  if (ctx.colors) ctx.stylize = stylizeWithColor;
  return formatValue(ctx, obj, ctx.depth);
}
exports.inspect = inspect;


// http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
inspect.colors = {
  'bold' : [1, 22],
  'italic' : [3, 23],
  'underline' : [4, 24],
  'inverse' : [7, 27],
  'white' : [37, 39],
  'grey' : [90, 39],
  'black' : [30, 39],
  'blue' : [34, 39],
  'cyan' : [36, 39],
  'green' : [32, 39],
  'magenta' : [35, 39],
  'red' : [31, 39],
  'yellow' : [33, 39]
};

// Don't use 'blue' not visible on cmd.exe
inspect.styles = {
  'special': 'cyan',
  'number': 'yellow',
  'boolean': 'yellow',
  'undefined': 'grey',
  'null': 'bold',
  'string': 'green',
  'date': 'magenta',
  // "name": intentionally not styling
  'regexp': 'red'
};


function stylizeWithColor(str, styleType) {
  var style = inspect.styles[styleType];

  if (style) {
    return '\u001b[' + inspect.colors[style][0] + 'm' + str +
           '\u001b[' + inspect.colors[style][1] + 'm';
  } else {
    return str;
  }
}


function stylizeNoColor(str, styleType) {
  return str;
}


function arrayToHash(array) {
  var hash = {};

  array.forEach(function(val, idx) {
    hash[val] = true;
  });

  return hash;
}


function formatValue(ctx, value, recurseTimes) {
  // Provide a hook for user-specified inspect functions.
  // Check that value is an object with an inspect function on it
  if (ctx.customInspect &&
      value &&
      isFunction(value.inspect) &&
      // Filter out the util module, it's inspect function is special
      value.inspect !== exports.inspect &&
      // Also filter out any prototype objects using the circular check.
      !(value.constructor && value.constructor.prototype === value)) {
    var ret = value.inspect(recurseTimes, ctx);
    if (!isString(ret)) {
      ret = formatValue(ctx, ret, recurseTimes);
    }
    return ret;
  }

  // Primitive types cannot have properties
  var primitive = formatPrimitive(ctx, value);
  if (primitive) {
    return primitive;
  }

  // Look up the keys of the object.
  var keys = Object.keys(value);
  var visibleKeys = arrayToHash(keys);

  if (ctx.showHidden) {
    keys = Object.getOwnPropertyNames(value);
  }

  // IE doesn't make error fields non-enumerable
  // http://msdn.microsoft.com/en-us/library/ie/dww52sbt(v=vs.94).aspx
  if (isError(value)
      && (keys.indexOf('message') >= 0 || keys.indexOf('description') >= 0)) {
    return formatError(value);
  }

  // Some type of object without properties can be shortcutted.
  if (keys.length === 0) {
    if (isFunction(value)) {
      var name = value.name ? ': ' + value.name : '';
      return ctx.stylize('[Function' + name + ']', 'special');
    }
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    }
    if (isDate(value)) {
      return ctx.stylize(Date.prototype.toString.call(value), 'date');
    }
    if (isError(value)) {
      return formatError(value);
    }
  }

  var base = '', array = false, braces = ['{', '}'];

  // Make Array say that they are Array
  if (isArray(value)) {
    array = true;
    braces = ['[', ']'];
  }

  // Make functions say that they are functions
  if (isFunction(value)) {
    var n = value.name ? ': ' + value.name : '';
    base = ' [Function' + n + ']';
  }

  // Make RegExps say that they are RegExps
  if (isRegExp(value)) {
    base = ' ' + RegExp.prototype.toString.call(value);
  }

  // Make dates with properties first say the date
  if (isDate(value)) {
    base = ' ' + Date.prototype.toUTCString.call(value);
  }

  // Make error with message first say the error
  if (isError(value)) {
    base = ' ' + formatError(value);
  }

  if (keys.length === 0 && (!array || value.length == 0)) {
    return braces[0] + base + braces[1];
  }

  if (recurseTimes < 0) {
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    } else {
      return ctx.stylize('[Object]', 'special');
    }
  }

  ctx.seen.push(value);

  var output;
  if (array) {
    output = formatArray(ctx, value, recurseTimes, visibleKeys, keys);
  } else {
    output = keys.map(function(key) {
      return formatProperty(ctx, value, recurseTimes, visibleKeys, key, array);
    });
  }

  ctx.seen.pop();

  return reduceToSingleString(output, base, braces);
}


function formatPrimitive(ctx, value) {
  if (isUndefined(value))
    return ctx.stylize('undefined', 'undefined');
  if (isString(value)) {
    var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
                                             .replace(/'/g, "\\'")
                                             .replace(/\\"/g, '"') + '\'';
    return ctx.stylize(simple, 'string');
  }
  if (isNumber(value))
    return ctx.stylize('' + value, 'number');
  if (isBoolean(value))
    return ctx.stylize('' + value, 'boolean');
  // For some reason typeof null is "object", so special case here.
  if (isNull(value))
    return ctx.stylize('null', 'null');
}


function formatError(value) {
  return '[' + Error.prototype.toString.call(value) + ']';
}


function formatArray(ctx, value, recurseTimes, visibleKeys, keys) {
  var output = [];
  for (var i = 0, l = value.length; i < l; ++i) {
    if (hasOwnProperty(value, String(i))) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          String(i), true));
    } else {
      output.push('');
    }
  }
  keys.forEach(function(key) {
    if (!key.match(/^\d+$/)) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          key, true));
    }
  });
  return output;
}


function formatProperty(ctx, value, recurseTimes, visibleKeys, key, array) {
  var name, str, desc;
  desc = Object.getOwnPropertyDescriptor(value, key) || { value: value[key] };
  if (desc.get) {
    if (desc.set) {
      str = ctx.stylize('[Getter/Setter]', 'special');
    } else {
      str = ctx.stylize('[Getter]', 'special');
    }
  } else {
    if (desc.set) {
      str = ctx.stylize('[Setter]', 'special');
    }
  }
  if (!hasOwnProperty(visibleKeys, key)) {
    name = '[' + key + ']';
  }
  if (!str) {
    if (ctx.seen.indexOf(desc.value) < 0) {
      if (isNull(recurseTimes)) {
        str = formatValue(ctx, desc.value, null);
      } else {
        str = formatValue(ctx, desc.value, recurseTimes - 1);
      }
      if (str.indexOf('\n') > -1) {
        if (array) {
          str = str.split('\n').map(function(line) {
            return '  ' + line;
          }).join('\n').substr(2);
        } else {
          str = '\n' + str.split('\n').map(function(line) {
            return '   ' + line;
          }).join('\n');
        }
      }
    } else {
      str = ctx.stylize('[Circular]', 'special');
    }
  }
  if (isUndefined(name)) {
    if (array && key.match(/^\d+$/)) {
      return str;
    }
    name = JSON.stringify('' + key);
    if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
      name = name.substr(1, name.length - 2);
      name = ctx.stylize(name, 'name');
    } else {
      name = name.replace(/'/g, "\\'")
                 .replace(/\\"/g, '"')
                 .replace(/(^"|"$)/g, "'");
      name = ctx.stylize(name, 'string');
    }
  }

  return name + ': ' + str;
}


function reduceToSingleString(output, base, braces) {
  var numLinesEst = 0;
  var length = output.reduce(function(prev, cur) {
    numLinesEst++;
    if (cur.indexOf('\n') >= 0) numLinesEst++;
    return prev + cur.replace(/\u001b\[\d\d?m/g, '').length + 1;
  }, 0);

  if (length > 60) {
    return braces[0] +
           (base === '' ? '' : base + '\n ') +
           ' ' +
           output.join(',\n  ') +
           ' ' +
           braces[1];
  }

  return braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
}


// NOTE: These type checking functions intentionally don't use `instanceof`
// because it is fragile and can be easily faked with `Object.create()`.
function isArray(ar) {
  return Array.isArray(ar);
}
exports.isArray = isArray;

function isBoolean(arg) {
  return typeof arg === 'boolean';
}
exports.isBoolean = isBoolean;

function isNull(arg) {
  return arg === null;
}
exports.isNull = isNull;

function isNullOrUndefined(arg) {
  return arg == null;
}
exports.isNullOrUndefined = isNullOrUndefined;

function isNumber(arg) {
  return typeof arg === 'number';
}
exports.isNumber = isNumber;

function isString(arg) {
  return typeof arg === 'string';
}
exports.isString = isString;

function isSymbol(arg) {
  return typeof arg === 'symbol';
}
exports.isSymbol = isSymbol;

function isUndefined(arg) {
  return arg === void 0;
}
exports.isUndefined = isUndefined;

function isRegExp(re) {
  return isObject(re) && objectToString(re) === '[object RegExp]';
}
exports.isRegExp = isRegExp;

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}
exports.isObject = isObject;

function isDate(d) {
  return isObject(d) && objectToString(d) === '[object Date]';
}
exports.isDate = isDate;

function isError(e) {
  return isObject(e) &&
      (objectToString(e) === '[object Error]' || e instanceof Error);
}
exports.isError = isError;

function isFunction(arg) {
  return typeof arg === 'function';
}
exports.isFunction = isFunction;

function isPrimitive(arg) {
  return arg === null ||
         typeof arg === 'boolean' ||
         typeof arg === 'number' ||
         typeof arg === 'string' ||
         typeof arg === 'symbol' ||  // ES6 symbol
         typeof arg === 'undefined';
}
exports.isPrimitive = isPrimitive;

exports.isBuffer = require('./support/isBuffer');

function objectToString(o) {
  return Object.prototype.toString.call(o);
}


function pad(n) {
  return n < 10 ? '0' + n.toString(10) : n.toString(10);
}


var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
              'Oct', 'Nov', 'Dec'];

// 26 Feb 16:19:34
function timestamp() {
  var d = new Date();
  var time = [pad(d.getHours()),
              pad(d.getMinutes()),
              pad(d.getSeconds())].join(':');
  return [d.getDate(), months[d.getMonth()], time].join(' ');
}


// log is just a thin wrapper to console.log that prepends a timestamp
exports.log = function() {
  console.log('%s - %s', timestamp(), exports.format.apply(exports, arguments));
};


/**
 * Inherit the prototype methods from one constructor into another.
 *
 * The Function.prototype.inherits from lang.js rewritten as a standalone
 * function (not on Function.prototype). NOTE: If this file is to be loaded
 * during bootstrapping this function needs to be rewritten using some native
 * functions as prototype setup using normal JavaScript does not work as
 * expected during bootstrapping (see mirror.js in r114903).
 *
 * @param {function} ctor Constructor function which needs to inherit the
 *     prototype.
 * @param {function} superCtor Constructor function to inherit prototype from.
 */
exports.inherits = require('inherits');

exports._extend = function(origin, add) {
  // Don't do anything if add isn't an object
  if (!add || !isObject(add)) return origin;

  var keys = Object.keys(add);
  var i = keys.length;
  while (i--) {
    origin[keys[i]] = add[keys[i]];
  }
  return origin;
};

function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

}).call(this,require('_process'),typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./support/isBuffer":54,"_process":40,"inherits":38}]},{},[1]);
