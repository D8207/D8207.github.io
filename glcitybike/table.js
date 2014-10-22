jQuery( function( $, undefined ) {
	var console = window.console || {
		log: function() {}
	};

	var numbers = {};

	var updateNum = function() {
		$( '.num-container' ).trigger( 'reload-num' );
		$( '#datatable' ).trigger( 'update' );
		setTimeout( getNumbers, 60000 );
	};

	var getNumbers = function() {
		$.ajax( {
			dataType: 'script',
			// Will this data source be stable enough?
			url: 'http://ws.ibike668.com:81/WeiChat.php?myloc=110.2901685,25.2780122&e=1&k=ae5ec12e93b68f4fc20648ad95e04e96&d=10'
		} ).done( function() {
			var data = window.ibike;
			window.ibike = undefined;
			numbers = {};

			if ( data !== undefined && $.isArray( data.station ) ) {
				$.each( data.station, function() {
					if ( this.id !== undefined && this.capacity !== undefined && this.availbike !== undefined ) {
						numbers[this.id] = {
							bike: this.availbike,
							rack: this.capacity - this.availbike
						};
					}
				} );
			}

			updateNum();
		} ).fail( function() {
			numbers = {};

			updateNum();
		} );
	};

	var updateDir = function( lat, lng ) {
		console.log( 'Updating directions using lat = ' + lat + ', lng = ' + lng );

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
				.append( $( '<span/>' ).addClass( 'dir-arrow' ).text( '↑' )
					.css( '-ms-transform', cssTransform )
					.css( '-webkit-transform', cssTransform )
					.css( 'transform', cssTransform )
				).append( $( '<span/>' )
					.html(
						'&nbsp;<span class="sort-value">'
						+ Math.round( distance * 1000 )
						+ '</span>&nbsp;m'
					)
				);
		} );

		$( '#datatable' ).trigger( 'update' );
	};

	var getPositionUpdates = function() {
		navigator.geolocation.getCurrentPosition( function( position ) {
			var coords = position.coords;
			updateDir( coords.latitude, coords.longitude );
			setTimeout( getPositionUpdates, 60000 );
		}, function( error ) {
			setTimeout( getPositionUpdates, 60000 );
		}, {
			enableHighAccuracy: true
		} );
	};

	var getPosition = function( highAccuracy ) {
		if ( !navigator.geolocation ) {
			$( '.dir-cell' ).html( '<abbr title=当前浏览器不支持定位>✕</abbr>' );
			return;
		}
		navigator.geolocation.getCurrentPosition( function( position ) {
			var coords = position.coords;
			updateDir( coords.latitude, coords.longitude );
			if ( highAccuracy ) {
				setTimeout( getPositionUpdates, 60000 );
			} else {
				getPosition( true );
			}
		}, function( error ) {
			if ( highAccuracy ) {
				setTimeout( getPositionUpdates, 60000 );
			} else {
				alert( '无法获得当前位置 (' + error.code + '): ' + error.message );
			}
		}, {
			enableHighAccuracy: highAccuracy
		} );
	};

	var init = function( osmFix ) {
		var data = window.ibike;
		window.ibike = undefined;
		var isAndroid = navigator.userAgent.toLowerCase().indexOf( 'android' ) > -1;

		$.each( data.station, function() {
			var station = this;

			if ( osmFix[station.id] ) {
				console.log( 'Fixing station ' + station.id + ' using OSM data:' );
				console.log( osmFix[station.id] );

				$.extend( station, osmFix[station.id] );
			} else {
				if ( station.lat != 0 ) {
					station.lat -= 0.0031832143;
				}
				if ( station.lng != 0 ) {
					station.lng -= 0.0111871143;
				}
			}

			$( '<tr/>' )
				.append( $( '<td/>' ).text( station.id ) )
				.append( ( station.lat != 0 && station.lng != 0 ) ? $( '<td/>' ).append(
					$( '<a/>' )
						.attr( 'href', isAndroid ? ( 'geo:0,0?q=' + encodeURIComponent(
							station.lat + ',' + station.lng + '(' + station.name + ' - 桂林市公共自行车)'
						) ) : ( 'geo:' + station.lat + ',' + station.lng ) )
						.text( station.name )
				).append( ' ' ).append(
					$( '<a/>' )
						.attr( 'href', 'http://www.openstreetmap.org/?mlat='
							+ station.lat + '&mlon=' + station.lng + '#map=17/'
							+ station.lat + '/' + station.lng + '&layers=C'
						).append( $( '<img/>' ).attr( 'src',
							'http://wiki.openstreetmap.org/w/thumb.php?f=Public-images-osm_logo.svg&w=18'
						) ).click( function( e ) {
							e.preventDefault();
							open( $( this ).attr( 'href' ) );
						} )
				) : $( '<td/>' ).text( station.name ) )
				.append(
					$( '<td/>' )
						.addClass( 'dir-cell' )
						.data( 'lat', station.lat )
						.data( 'lng', station.lng )
						.text( '...' )
				)
				.append( $( '<td/>' ).append( $( '<span/>' ).addClass( 'num-container' )
					.data( 'id', station.id ).data( 'type', 'bike' ).text( '...' )
				) )
				.append( $( '<td/>' ).append( $( '<span/>' ).addClass( 'num-container' )
					.data( 'id', station.id ).data( 'type', 'rack' ).text( '...' )
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

		$( '.num-container' ).on( 'reload-num', function() {
			var $this = $( this );

			if ( numbers[$this.data( 'id' )] !== undefined
				&& numbers[$this.data( 'id' )][$this.data( 'type' )] !== undefined
			) {
				// We have the number ready
				$this.empty().text( numbers[$this.data( 'id' )][$this.data( 'type' )] );
			} else {
				// Use an image
				var $img = $( 'img', $this );
				if ( !$img.length ) {
					$img = $( '<img/>' ).appendTo( $this.empty() );
				}
				$img.attr( 'src',
					'http://218.93.33.59:85/map/guilinmap/ibikegif.asp?id='
					+ $this.data( 'id' ) + '&flag=' + (
						$this.data( 'type' ) == 'bike' ? '1' : /* rack */ '2'
					) + '&_=' + new Date().getTime()
				);
			}

		} ).on( 'click', function() {
			// This mainly works around broken images due to network failure
			$( this ).trigger( 'reload-num' );
		} );

		getNumbers();
		getPosition( false );
	};

	$.ajax( {
		dataType: 'xml',
		url: 'http://overpass-api.de/api/xapi?' + encodeURIComponent(
			'node[amenity=bicycle_rental][network=桂林市公共自行车]'
		)
	} ).done( function( osmData ) {
		console.log( 'OSM data fetched:' );
		console.log( osmData );

		var osmFix = {};

		$( 'node', osmData ).each( function() {
			var $node = $( this );
			var $ref = $( 'tag[k=ref]', $node );
			var lat = parseFloat( $node.attr( 'lat' ) ), lng = parseFloat( $node.attr( 'lon' ) );

			if ( $ref.length && lat && lng ) {
				osmFix[$ref.attr( 'v' )] = { lat: lat, lng: lng };
			}
		} );

		init( osmFix );
	} ).fail( function() {
		console.log( 'Cannot load OSM data' );

		init( {} );
	} );
} );
