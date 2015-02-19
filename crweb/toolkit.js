jQuery( function( $, undefined ) {
	var staticData = {};
	var userData = {};

	var staticDataFiles = [ 'station', 'train', 'trainLevel' ];
	var readStaticData = function( idx ) {
		if ( idx >= staticDataFiles.length ) {
			init();
		} else {
			var staticDataKey = staticDataFiles[idx];
			$.ajax( {
				url: 'http://misc.crutils.tk/crweb/static_data/callback/Static'
					+ staticDataKey.charAt(0).toUpperCase() + staticDataKey.slice(1) + '.js',
				dataType: 'jsonp',
				jsonp: false,
				jsonpCallback: 'callback',
			} ).done( function( data ) {
				staticData[staticDataKey] = data;
				readStaticData( idx + 1 );
			} );
		}
	};

	var init = function() {
		// Trains
		var trains = {};
		var trainsSelect = [];
		$.each( staticData.train, function() {
			trains[this[0]] = this;
			trainsSelect.push( {
				id: this[0],
				text: this[1]
			} );
		} );
		var trainNextId = 0;
		var trainTemplate = Handlebars.compile( $( '#train-template' ).html() );

		var trainLevels = {};
		var trainLevelAttribIdx = {
			speed: 2,
			distance: 1,
			weight: 3,
			battery: 4
		};
		$.each( staticData.trainLevel, function() {
			trainLevels[this[0]] = this;
		} );

		$( '#trains-new' ).prop( 'disabled', false ).click( function() {
			var trainId = trainNextId++;
			var trainHtml = trainTemplate( { id: trainId } );
			$( '#trains-container' ).append( trainHtml );
			var $train = $( '#train-' + trainId );

			// Train selector
			$train.find( '.train-select' ).select2( {
				data: trainsSelect
			} ).change( function() {
				var trainType = parseInt( $( this ).val() );
				var desc, img, pc, cc;

				if ( trainType > 0 ) {
					desc = trains[trainType][2];
					img = trains[trainType][10];
					stars = trains[trainType][3];
					pc = trains[trainType][8];
					cc = trains[trainType][9];

					$train.find( '.train-attrib-initial' )
						.addClass( 'train-attrib-ro' )
						.removeClass( 'form-control' )
						.prop( 'readOnly', true );
					$train.find( '.train-attrib-initial.train-attrib-speed').val( trains[trainType][5] );
					$train.find( '.train-attrib-initial.train-attrib-distance').val( trains[trainType][4] );
					$train.find( '.train-attrib-initial.train-attrib-weight').val( trains[trainType][6] );
					$train.find( '.train-attrib-initial.train-attrib-battery').val( trains[trainType][7] );
				} else {
					desc = '在下方输入此车的相关属性';
					img = '';
					stars = -trainType;
					pc = cc = -1;

					$train.find( '.train-attrib-initial' )
						.removeClass( 'train-attrib-ro' )
						.addClass( 'form-control' )
						.prop( 'readOnly', false );
				}

				$train.find( '.train-img' ).attr( 'src', '' );
				if ( img ) {
					$train.find( '.train-img' ).attr( 'src', 'http://misc.crutils.tk/crweb/train_image/' + img );
				}
				$train.find( '.train-info' ).html(
					new Array( stars + 1 ).join( '<span class="glyphicon glyphicon-star" aria-hidden=true></span>' )
					+ ' ' + stars + '星级火车'
				).append( pc >= 0 ? ' | <span class="glyphicon glyphicon-user" aria-hidden=true></span> ' + pc + '客运仓位' : ''
				).append( cc >= 0 ? ' | <span class="glyphicon glyphicon-briefcase" aria-hidden=true></span> ' + cc + '货运仓位' : '' );
				$train.find( '.train-desc' ).text( desc );
				$train.find( '.train-attrib-value' ).trigger( 'update' );
			} ).change();

			// Removal
			$train.find( '.train-delete' ).click( function() {
				$train.remove();
				$( '#route-train' ).on( 'update' );
			} );

			// Values
			$train.find( '.train-attrib-value' ).on( 'update', function() {
				var $this = $( this ), attrib = $this.data( 'attrib' );
				var initial = parseInt( $train.find( '.train-attrib-initial.train-attrib-' + attrib ).val() );
				var level = parseInt( $train.find( '.train-attrib-level.train-attrib-' + attrib ).val() );
				if ( isNaN( initial ) || isNaN( level ) || !trainLevels[level] ) {
					$this.val( '' );
				} else {
					var value = Math.floor( initial * trainLevels[level][trainLevelAttribIdx[attrib]] / 1000 );
					$this.val( value );
				}
				$( '#route-train' ).trigger( 'update' );
			} ).trigger( 'update' );
			$train.find( '.train-attrib-initial, .train-attrib-level' ).change( function() {
				$train.find( '.train-attrib-value.train-attrib-' + $( this ).data( 'attrib' ) ).trigger( 'update' );
			} );
		} );

		// Stations
		var stations = {};
		var $stationsBody = $( '#stations-table tbody' );
		var stationTemplate = Handlebars.compile( $( '#station-template' ).html() );
		$.each( staticData.station, function() {
			stations[this[0]] = this;
			$stationsBody.append( stationTemplate( {
				id: this[0],
				name: this[1],
				desc: this[2],
				stars: this[4],
				starArray: new Array( this[4] ),
				X: this[5],
				Y: this[6],
				pop: this[7],
				admin: this[9]
			} ) );
		} );
		$stationsBody.find( 'tr' ).click( function() {
			var $checkbox = $( this ).find( 'input[type=checkbox]' );
			$checkbox.prop( 'checked', !$checkbox.prop( 'checked' ) ).trigger( 'change' );
		} );
		$stationsBody.find( 'input[type=checkbox]' ).click( function( e ) {
			e.stopPropagation();
		} ).change( function() {
			var $this = $( this );
			if ( $this.prop( 'checked' ) ) {
				if ( !$( '#route-stations li[data-id=' + $this.data( 'id' ) + ']' ).length ) {
					$( '#route-stations' ).append(
						$( '<li/>' ).addClass( 'ui-state-default' )
							.attr( 'data-id', $this.data( 'id' ) )
							.text( stations[$this.data( 'id' )][1] )
							.draggable( {
								connectToSortable: '#route-waypoints',
								helper: 'clone',
								revert: 'invalid'
							} )
					);
				}
			} else {
				$( '#route-stations li[data-id=' + $this.data( 'id' ) + '],'
					+ '#route-waypoints li[data-id=' + $this.data( 'id' ) + ']' ).remove()
			}
		} );
		$( '#stations-select a' ).click( function( e ) {
			e.preventDefault();
			var $this = $( this );
			$stationsBody.find( 'input[type=checkbox][data-stars=' + $this.data( 'stars' ) + ']' )
				.prop( 'checked', $this.data( 'value' ) ).trigger( 'change' );
		} );

		// Route
		$( '#route-waypoints' ).sortable( {
			revert: true,
			placeholder: 'ui-state-highlight',
			items: '.ui-state-default'
		} ).droppable( { greedy: true } );
		$( 'body' ).droppable( {
			drop: function ( event, ui ) {
				if ( ui.draggable.parents( '#route-waypoints' ).length ) {
					ui.draggable.remove();
				}
			}
		} );

		$( '#route-train' ).on( 'update', function() {
			var $select = $( this );
			var val = $select.val();
			$select.empty();

			$( '.train-row' ).each( function() {
				var $this = $( this );

				var id = $this.data( 'id' );
				var type = parseInt( $this.find( '.train-select' ).val() ), typeText;
				if ( type < 0 ) {
					typeText = '自定义' + -type + '星级火车';
				} else {
					typeText = trains[type][1];
				}
				var speed = parseInt( $this.find( '.train-attrib-value.train-attrib-speed' ).val() );
				var distance = parseInt( $this.find( '.train-attrib-value.train-attrib-distance' ).val() );
				var weight = parseInt( $this.find( '.train-attrib-value.train-attrib-weight' ).val() );
				var battery = parseInt( $this.find( '.train-attrib-value.train-attrib-battery' ).val() );

				if ( isNaN( speed ) || isNaN( distance ) || isNaN( weight ) || isNaN( battery ) ) {
					return;
				}

				var text = typeText + ' | 速度：' + speed + ' | 距离：' + distance + ' | 重量：' + weight + ' | 电量：' + battery;
				$( '<option/>' ).attr( 'value', id ).text( text ).appendTo( $select );
			} );

			$select.val( val );
		} );

		var routeAlertTemplate = Handlebars.compile( $( '#route-alert-template' ).html() );
		var routeResultTemplate = Handlebars.compile( $( '#route-result-template' ).html() );
		$( '#route-calculate' ).prop( 'disabled', false ).click( function() {
			$( '#route-result' ).empty();
			var trainId = $( '#route-train' ).val();
			var $train = $( '#train-' + trainId );
			if ( $train.length === 0 ) {
				$( '#route-result' ).append( routeAlertTemplate( {
					type: 'danger',
					message: '请选择火车'
				} ) );
				return;
			}

			var type = parseInt( $train.find( '.train-select' ).val() );
			var speed = parseInt( $train.find( '.train-attrib-value.train-attrib-speed' ).val() );
			var distance = parseInt( $train.find( '.train-attrib-value.train-attrib-distance' ).val() );
			var weight = parseInt( $train.find( '.train-attrib-value.train-attrib-weight' ).val() );
			var battery = parseInt( $train.find( '.train-attrib-value.train-attrib-battery' ).val() );

			if ( isNaN( speed ) || isNaN( distance ) || isNaN( weight ) || isNaN( battery ) ) {
				$( '#route-result' ).append( routeAlertTemplate( {
					type: 'danger',
					message: '指定火车的数据没有填写完整'
				} ) );
				return;
			}
			var train = {
				speed: speed,
				distance: distance,
				weight: weight,
				battery: battery,
				stars: type < 0 ? -type : trains[type][3],
				loads: type < 0 ? -1 : ( trains[type][8] + trains[type][9] )
			};

			var useStations = $( '#stations-table input:checked' ).map( function() {
				return $( this ).data( 'id' );
			} ).get();

			var wayPoints = $( '#route-waypoints li.ui-state-default' ).map( function() {
				return $( this ).data( 'id' );
			} ).get();

			var calculated = calculate( train, stations, useStations, wayPoints, $( '#route-insert:checked' ).length > 0 );
			if ( calculated.ok ) {
				var pathStationsText = $.map( calculated.path, function( station ) {
					return stations[station][1];
				} );
				$( '#route-result' ).append( routeResultTemplate( {
					path: pathStationsText.join( ' - ' ),
					totalDistance: calculated.totalDistance
				} ) );
				$( '#route-path-transfer' ).click( function() {
					$( '#route-waypoints li.ui-state-default' ).remove();
					$.each( calculated.path, function() {
						$( '<li/>' ).addClass( 'ui-state-default' )
							.attr( 'data-id', this )
							.text( stations[this][1] )
							.appendTo( '#route-waypoints' );
					} );
				} );
			} else {
				$( '#route-result' ).append( routeAlertTemplate( {
					type: 'danger',
					message: calculated.message
				} ) );
				return;
			}
		} );
	};

	var distance = function( stations, station1, station2 ) {
		var x1 = stations[station1][5];
		var x2 = stations[station2][5];
		var y1 = stations[station1][6];
		var y2 = stations[station2][6];
		var x = x1 - x2, y = y1 - y2
		return Math.floor( Math.sqrt( x * x + y * y ) );
	};

	var annotatePath = function( stations, wayPoints ) {
		var result = [], prev = null, sum = 0;
		$.each( wayPoints, function() {
			if ( prev !== null ) {
				var dist = distance( stations, prev, this );
				result.push( dist );
				sum += dist;
			}
			prev = this;
		} );
		result.push( sum );
		return result;
	};

	var buildPath = function( train, stations, useStations, wayPoints ) {
		var map = {};
		$.each( useStations, function() {
			var i = this;
			if ( stations[i][4] < train.stars ) {
				return;
			}
			map[i] = {};

			$.each( useStations, function() {
				var j = this;

				if ( i === j ) {
					return;
				}

				if ( stations[j][4] < train.stars ) {
					return;
				}

				var dist = distance( stations, i, j );
				if ( dist > train.distance ) {
					return;
				}

				map[i][j] = dist;
			} );
		} );

		var graph = new Graph( map );
		var result = [], prev = null;

		$.each( wayPoints, function() {
			if ( result === null ) {
				return;
			}
			if ( prev !== null ) {
				var path = graph.findShortestPath( prev, this );
				if ( path === null ) {
					result = null;
				} else {
					result.pop();
					result = result.concat( path );
				}
			}
			prev = this;
		} );

		return result;
	};

	/**
	 * @param Object train { speed, distance, weight, battery, stars, load }
	 * @param Object stations the global station data object
	 * @param Array useStations
	 * @param Array wayPoints
	 * @param Boolean insert
	 * @return Object { ok, message }
	 */
	var calculate = function( train, stations, useStations, wayPoints, insert ) {
		// Sanity check
		if ( wayPoints.length < 2 ) {
			return {
				ok: false,
				message: '没有指定足够的车站'
			};
		}

		// Check whether the train can go to all specified stations.
		var result = null;
		$.each( wayPoints, function() {
			if ( stations[this][4] < train.stars ) {
				result = {
					ok: false,
					message: '此车无法到达所有指定的车站'
				};
			}
		} );
		if ( result ) {
			return result;
		}

		var path, totalDistance;
		if ( insert ) {
			// Build a path from given wayPoints.
			path = buildPath( train, stations, useStations, wayPoints );
			if ( path ) {
				totalDistance = annotatePath( stations, path ).pop();
			} else {
				return {
					ok: false,
					message: '由于距离限制，此车找不到可以行走的径路'
				};
			}
		} else {
			// Check whether the train can go across all gaps.
			var distances = annotatePath( stations, wayPoints );
			totalDistance = distances.pop();
			$.each( distances, function() {
				if ( this > train.distance ) {
					result = {
						ok: false,
						message: '由于距离限制，此车无法沿指定的径路行走'
					};
				}
			} );
			if ( result ) {
				return result;
			}
			path = wayPoints;
		}

		return {
			ok: true,
			path: path,
			totalDistance: totalDistance
		};
	};

	readStaticData( 0 );
} );
