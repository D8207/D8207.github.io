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
		console.log( 'ERROR: ' + message );
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

var parsePcap = function( input ) {
	var parser = pcapp.parse( input );
	var tcp_tracker = new pcap_tcp_tracker.TCPTracker();

	var profitData = [];

	parser.on( 'globalHeader', function( header ) {
		if ( header.linkLayerType != 1 ) {
			sendError( '不支持的网络类型：' + header.linkLayerType );
		}
	} );

	var onData = function( session, data ) {
		if ( data.readUInt8( 0x0 ) != 0x2e ) {
			return;
		}

		var date = new Date( session.current_cap_time * 1000 );
		var myProfit = data.readInt32BE( 0x9 );
		var opProfit = data.readInt32BE( 0x1d );
		profitData.push( [ date, myProfit, opProfit ] );
	};

	tcp_tracker.on( 'session', function( session ) {
		// TODO - filter out non-game sessions?

		// since we're listening from the middle of a session, send/recv may be reversed.
		session.on( 'data send', onData );
		session.on( 'data recv', onData );
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
		sendData( profitData );
	} );

	parser.on( 'error', function( e ) {
		sendError( e.message );
	} );
};

if ( process.title == 'browser' ) {
	onmessage = function( e ) {
		var stream = new FileReadStream( e.data );
		parsePcap( stream );
	};
} else {
	if ( process.argv.length < 3 ) {
		console.log( 'usage: ' + process.argv.join( ' ' ) + ' pcap_file' );
	} else {
		parsePcap( process.argv[2] );
	}
}
