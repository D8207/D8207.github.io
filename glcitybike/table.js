jQuery( function( $, undefined ) {
	var updateData = function( lat, lng ) {
		console.log( 'Updating data using lat = ' + lat + ', lng = ' + lng );

		var time = new Date().getTime();

		$( '.num-image' ).each( function() {
			var $this = $( this );

			$this.attr( 'src',
				'http://218.93.33.59:85/map/guilinmap/ibikegif.asp?id='
				+ $this.data( 'id' ) + '&flag=' + $this.data( 'flag' )
				+ '&_=' + time
			);
		} );

		if ( lat === undefined || lng === undefined ) {
			return;
		}

		var latLon = new LatLon( lat, lng );

		$( '.dir-cell' ).each( function() {
			var $this = $( this );

			if ( $this.data( 'lat' ) == 0 && $this.data( 'lng' ) == 0 ) {
				return;
			}

			var cellLatLon = new LatLon( $this.data( 'lat' ), $this.data( 'lng' ) );
			var distance = latLon.distanceTo( cellLatLon );
			var bearing = latLon.bearingTo( cellLatLon );

			var cssTransform = 'rotate(' + bearing + 'deg)';
			$this.empty()
				.append( $( '<span/>' ).text( '↑' )
					.css( '-ms-transform', cssTransform )
					.css( '-webkit-transform', cssTransform )
					.css( 'transform', cssTransform )
					.css( 'display', 'inline-block' )
				).append( $( '<span/>' )
					.html(
						' <span class="sort-value">'
						+ Math.round( distance * 1000 )
						+ '</span> m'
					)
				);
		} );

		$( '#datatable' ).trigger( 'update' );
	};

	var getPosition = function( highAccuracy ) {
		navigator.geolocation.getCurrentPosition( function( position ) {
			var coords = position.coords;
			updateData( coords.latitude, coords.longitude );
			if ( !highAccuracy ) {
				getPosition( true );
			}
		}, function( error ) {
			alert( '无法获得当前位置 (' + error.code + '): ' + error.message );
		}, {
			enableHighAccuracy: highAccuracy
		} );
	};

	var data = window.ibike;

	$.each( data.station, function() {
		var station = this;

		if ( station.lat != 0 ) {
			station.lat -= 0.0031832143;
		}
		if ( station.lng != 0 ) {
			station.lng -= 0.0111871143;
		}

		$( '<tr/>' )
			.append( $( '<td/>' ).text( station.id ) )
			.append( $( '<td/>' ).append(
				$( '<a/>' )
					.attr( 'href', 'geo:' + station.lat + ',' + station.lng )
					.text( station.name )
			) )
			.append(
				$( '<td/>' )
					.addClass( 'dir-cell' )
					.data( 'lat', station.lat )
					.data( 'lng', station.lng )
					.text( '...' )
			)
			.append( $( '<td/>' ).append( $( '<img/>' ).addClass( 'num-image' )
				.data( 'id', station.id ).data( 'flag', 1 )
			) )
			.append( $( '<td/>' ).append( $( '<img/>' ).addClass( 'num-image' )
				.data( 'id', station.id ).data( 'flag', 2 )
			) )
			.append( $( '<td/>' ).text( station.address ) )
			.appendTo( '#datatable tbody' );
	} );

	$( '#datatable' ).tablesorter( {
		textExtraction: function( node ) {
			var $value = $( '.sort-value', node );
			if ( $value.length ) {
				return $value.text();
			} else {
				return $( node ).text();
			}
		}
	} );

	updateData();
	getPosition( false );
} );
