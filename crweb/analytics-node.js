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
		if ( !data || data.length < 0x4 ) {
			return;
		}

		var magic = data.readUInt16BE( 0x0 );
		if ( magic != 0x0109 ) {
			return;
		}

		var entryCount = data.readUInt16BE( 0x2 );
		var offset = 0x4;
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
		}
	};

	var profitData = [];

	var onProfitData = function( session, data ) {
		if ( !data || data.length < 0x20 ) {
			return;
		}

		var magic = data.readUInt16BE( 0x0 );
		if ( magic != 0x0126 ) {
			return;
		}

		profitData.push( {
			date: new Date( session.current_cap_time * 1000 ),
			me: {
				user: data.readUInt32BE( 0x4 ),
				profit: data.readInt32BE( 0x8 )
			},
			oppo: {
				user: data.readUInt32BE( 0x18 ),
				profit: data.readInt32BE( 0x1c )
			}
		} );
	};

	var garageData = [];

	var onGarageData = function( session, data ) {
		if ( !data || data.length < 0xc ) {
			return;
		}

		var magic = data.readUInt16BE( 0x0 );
		if ( magic != 0x00f2 // from loot list
			&& magic != 0x00ef // from friends
		) {
			return;
		}

		var userId = data.readUInt32BE( 0x4 );
		var userData = {
			user: userId,
			stationCount: data.readUInt16BE( 0x8 ),
			trainCount: data.readUInt16BE( 0xa ),
			trains: []
		};

		for ( var i = 0xc; i < data.length - 1; i += 2 ) {
			if ( userData.trains.length >= userData.trainCount ) {
				break;
			}
			userData.trains.push( data.readUInt16BE( i ) );
		}

		garageData.push( userData );
	};

	var lootData = [];

	var onLootData = function( session, data ) {
		if ( !data || data.length < 0x6 ) {
			return;
		}

		var magic = data.readUInt16BE( 0x0 );
		if ( magic != 0x0107 ) {
			return;
		}

		var entryCount = data.readUInt16BE( 0x4 );
		var ENTRY_SIZE = 0xa;
		for ( var offset = 0x6;
			offset < Math.min( 0x6 + entryCount * ENTRY_SIZE, data.length - ENTRY_SIZE + 1 );
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
		if ( session.missed_syn ) {
			return; // it's difficult to analyze segments correctly...
		}

		var policyHeader = new Buffer( 0xffff ), policyLength = 0, isCrweb = null;
		var send = { buffer: new Buffer( 0x1ffff ), length: 0 };
		var recv = { buffer: new Buffer( 0x1ffff ), length: 0 };
		var policyTail = '<policy-file-succeed/>', policyHost = '.app100679516.';

		var recycle = function() {
			policyHeader = null;
			send = recv = null;
		};

		var next = function( buffer, data ) {
			var packets = [];
			data.copy( buffer.buffer, buffer.length );
			buffer.length += data.length;
			while ( buffer.length >= 2 ) {
				var length = buffer.buffer.readUInt16BE( 0x0 );
				if ( length < 2 ) {
					sendError( '无效包长度：' + length );
					break;
				}
				if ( buffer.length < length ) {
					break;
				}
				var packet = new Buffer( length - 2 );
				buffer.buffer.copy( packet, 0, 2, length );
				packets.push( packet );
				buffer.buffer.copy( buffer.buffer, 0, length, buffer.length );
				buffer.length -= length;
			}
			return packets;
		};

		session.on( 'data send', function( session, data ) {
			if ( isCrweb === null ) {
				var copyLength = policyHeader.length - policyLength;
				if ( copyLength <= 0 ) {
					// policyHeader is full but still not confirmed as crweb
					isCrweb = false;
					return;
				}
				if ( copyLength > data.length ) {
					copyLength = data.length;
				}
				data.copy( policyHeader, policyLength, 0, copyLength );
				policyLength += copyLength;
				var policyText = policyHeader.toString( 'ascii', 0, policyLength );
				var policyTailIdx = policyText.indexOf( policyTail );
				if ( policyTailIdx > 0 ) {
					if ( policyHeader.toString( 'ascii', 0, policyTailIdx ).indexOf( policyHost ) >= 0 ) {
						isCrweb = true;
						data = data.slice( copyLength - ( policyLength - ( policyTailIdx + policyTail.length ) ) );
					} else {
						isCrweb = false;
						recycle();
						return;
					}
				}
			}
			if ( !isCrweb ) {
				return;
			}
			var packets = next( send, data );
		} );

		session.on( 'data recv', function( session, data ) {
			if ( !isCrweb ) { // null or false
				// crweb server doesn't send data before policy header is received
				isCrweb = false;
				recycle();
				return;
			}
			var packets = next( recv, data );
			packets.forEach( function( packet ) {
				if ( items == null || items.userInfo ) {
					onUserInfoData( session, packet );
				}
				if ( items == null || items.profit ) {
					onProfitData( session, packet );
				}
				if ( items == null || items.garage ) {
					onGarageData( session, packet );
				}
				if ( items == null || items.loot ) {
					onLootData( session, packet );
				}
			} );
		} );
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
