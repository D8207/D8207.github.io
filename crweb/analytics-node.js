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
			id: userId,
			stationCount: data.readUInt16BE( 0x9 ),
			trainCount: data.readUInt16BE( 0xb ),
			trains: []
		};

		for ( var i = 0xd; i < data.length - 1; i += 2 ) {
			userData.trains.push( data.readUInt16BE( i ) );
		}

		garageData.push( userData );
	};

	tcp_tracker.on( 'session', function( session ) {
		// TODO - filter out non-game sessions?

		// since we're listening from the middle of a session, send/recv may be reversed.
		if ( items == null || items.profit ) {
			session.on( 'data send', onProfitData );
			session.on( 'data recv', onProfitData );
		}
		if ( items == null || items.garage ) {
			session.on( 'data send', onGarageData );
			session.on( 'data recv', onGarageData );
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
			profit: profitData,
			garage: garageData
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
