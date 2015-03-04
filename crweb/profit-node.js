var pcapp = require( 'pcap-parser' );
var FileReadStream = require('filestream/read');

onmessage = function( e ) {
	var stream = new FileReadStream( e.data );
	var parser = pcapp.parse( stream );

	var data = [];

	parser.on( 'globalHeader', function( header ) {
		if ( header.linkLayerType != 1 ) {
			postMessage( {
				ok: false,
				message: '不支持的网络类型：' + header.linkLayerType
			} );
		}
	} );

	parser.on( 'packet', function( packet ) {
		if ( packet.data.readUInt16BE( 0x0c ) == 0x0800 // IPv4
			&& packet.data.readUInt8( 0x0e ) >> 4 == 0x4 // IPv4
			&& packet.data.readUInt8( 0x17 ) == 0x06 // TCP
			&& ( packet.data.readUInt8( 0x2f ) & 0x08 ) // TCP PSH
			&& packet.data.readUInt8( 0x36 ) == 0x2e // game packet type
		) {
			var myProfit = packet.data.readInt32BE( 0x3f );
			var opProfit = packet.data.readInt32BE( 0x53 );
			var date = new Date( packet.header.timestampSeconds * 1000 + packet.header.timestampMicroseconds / 1000 );
			data.push( [ date, myProfit, opProfit ] );
		}
	} );

	parser.on( 'end', function() {
		postMessage( {
			ok: true,
			data: data
		} );
	} );

	parser.on( 'error', function( e ) {
		postMessage( {
			ok: false,
			message: e.message
		} );
	} );
};
