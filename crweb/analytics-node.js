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

		profitData.push( {
			date: new Date( session.current_cap_time * 1000 ),
			me: {
				user: data.readUInt32BE( 0x5 ),
				profit: data.readInt32BE( 0x9 )
			},
			oppo: {
				user: data.readUInt32BE( 0x19 ),
				profit: data.readInt32BE( 0x1d )
			}
		} );
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
