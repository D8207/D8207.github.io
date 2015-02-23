jQuery( function( $, undefined ) {
	var staticData = {};
	var userData = {};

	var staticDataFiles = [ 'station', 'train', 'trainLevel', 'part' ];
	var readStaticData = function( idx ) {
		if ( idx >= staticDataFiles.length ) {
			init();
		} else {
			var staticDataKey = staticDataFiles[idx];
			$.ajax( {
				url: cloudServer + '/crweb/static_data/callback/Static'
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

	var localStorage = window.localStorage || {};

	var init = function() {
		// Utils
		var serializeTrain = function( $train ) {
			var data = {
				type: $train.find( '.train-select' ).val()
			};
			var attrib_rows = [ 'level' ];
			if ( data.type < 0 ) {
				attrib_rows.push( 'initial' );
			}
			$.each( attrib_rows, function() {
				var attrib_row = this;
				$.each( [ 'speed', 'distance', 'weight', 'battery' ], function() {
					var attrib = this;
					data['attrib_' + attrib_row + '_' + attrib ] =
						$train.find( '.train-attrib-' + attrib_row + '.train-attrib-' + attrib ).val();
				} );
			} );
			return data;
		};
		var unserializeTrain = function( data, $train ) {
			$train.find( '.train-select' ).val( data.type ).trigger( 'change' );
			var attrib_rows = [ 'level' ];
			if ( data.type < 0 ) {
				attrib_rows.push( 'initial' );
			}
			$.each( attrib_rows, function() {
				var attrib_row = this;
				$.each( [ 'speed', 'distance', 'weight', 'battery' ], function() {
					var attrib = this;
					$train.find( '.train-attrib-' + attrib_row + '.train-attrib-' + attrib ).val(
						data['attrib_' + attrib_row + '_' + attrib ] );
				} );
			} );
			$train.find( '.train-attrib-value' ).trigger( 'do-update' );
		};
		var serializeTrains = function() {
			return $( '.train-row' ).map( function() {
				return serializeTrain( $( this ) );
			} ).get();
		};
		var serializeStations = function() {
			return $( '.station-row' ).map( function() {
				return $( this ).data( 'id' );
			} ).get();
		};
		var inTrainsBatch = false;
		var trainsUpdated = function() {
			if ( !inTrainsBatch ) {
				localStorage.crwebToolkitTrains = JSON.stringify( serializeTrains() );
				$( '#route-train' ).trigger( 'do-update' );
			}
		};
		var inStationsBatch = false;
		var stationsUpdated = function() {
			if ( !inStationsBatch ) {
				localStorage.crwebToolkitStations = JSON.stringify( serializeStations() );
			}
		};
		var trainsBatchBegin = function() {
			inTrainsBatch = true;
		};
		var trainsBatchEnd = function() {
			inTrainsBatch = false;
			trainsUpdated();
		};
		var stationsBatchBegin = function() {
			inStationsBatch = true;
		};
		var stationsBatchEnd = function() {
			inStationsBatch = false;
			stationsUpdated();
		};
		// Trains
		var trains = {};
		var trainsSelect = [];
		$.each( staticData.train, function() {
			trains[this[0]] = this;
			trainsSelect.push( {
				id: this[0],
				text: this[1] + ' | ' + this[3] + '星'
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

		var trainParts = {};
		var trainPartsByTrains = {};
		var trainPartsAbbr = [ '车厢', '底盘', '车头', '图纸' ];
		$.each( staticData.part, function() {
			trainParts[this[0]] = this;
			if ( !trainPartsByTrains[this[3]] ) {
				trainPartsByTrains[this[3]] = {};
			}
			trainPartsByTrains[this[3]][this[2]] = this;
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
					$train.find( '.train-attrib-initial.train-attrib-speed' ).val( trains[trainType][5] );
					$train.find( '.train-attrib-initial.train-attrib-distance' ).val( trains[trainType][4] );
					$train.find( '.train-attrib-initial.train-attrib-weight' ).val( trains[trainType][6] );
					$train.find( '.train-attrib-initial.train-attrib-battery' ).val( trains[trainType][7] );
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
					$train.find( '.train-img' ).attr( 'src', cloudServer + '/crweb/train_image/' + img );
				}
				$train.find( '.train-info' ).html(
					new Array( stars + 1 ).join( '<span class="glyphicon glyphicon-star" aria-hidden=true></span>' )
					+ ' ' + stars + '星级火车'
				).append( pc >= 0 ? ' | <span class="glyphicon glyphicon-user" aria-hidden=true></span> ' + pc + '客运仓位' : ''
				).append( cc >= 0 ? ' | <span class="glyphicon glyphicon-briefcase" aria-hidden=true></span> ' + cc + '货运仓位' : '' );
				var trainPartsTrain = trainPartsByTrains[trainType];
				if ( trainPartsTrain ) {
					var trainPriceText = [];
					$.each( [ 2, 0, 1, 3 ], function() {
						if ( trainPartsTrain[this] ) {
							trainPriceText.push(
								'<span title="'
								+ trainPartsTrain[this][1].replace( /&/g, '&amp;').replace( /"/g, '&quot;')
								+ '">'
								+ trainPartsAbbr[this]
								+ '</span>：'
								+ trainPartsTrain[this][6]
								+ '点卷'
							);
						}
					} );
					if ( trainPartsTrain[3] !== undefined ) {
						trainPriceText.push( '启用：' + trainPartsTrain[3][6] + '点卷' );
						trainPriceText.push( '组装：' + ( Math.floor( trainPartsTrain[3][6] / 2 ) + 1 ) + '点卷' );
					}
					$train.find( '.train-price' ).html( trainPriceText.join( ' | ' ) ).show();
				} else {
					$train.find( '.train-price' ).hide();
				}
				$train.find( '.train-desc' ).text( desc );
				trainsBatchBegin();
				$train.find( '.train-attrib-value' ).trigger( 'do-update' );
				trainsBatchEnd();
			} ).change();

			// Duplication
			$train.find( '.train-duplicate' ).click( function() {
				var trainId = trainNextId;
				trainsBatchBegin();
				$( '#trains-new' ).trigger( 'click' );
				var $newTrain = $( '#train-' + trainId );
				unserializeTrain( serializeTrain( $train ), $newTrain );
				trainsBatchEnd();
			} );

			// Removal
			$train.find( '.train-delete' ).click( function() {
				$train.remove();
				trainsUpdated();
			} );

			// Values
			$train.find( '.train-attrib-value' ).on( 'do-update', function() {
				var $this = $( this ), attrib = $this.data( 'attrib' );
				var initial = parseInt( $train.find( '.train-attrib-initial.train-attrib-' + attrib ).val() );
				var level = parseInt( $train.find( '.train-attrib-level.train-attrib-' + attrib ).val() );
				if ( isNaN( initial ) || isNaN( level ) || !trainLevels[level] ) {
					$this.val( '' );
				} else {
					var value = Math.floor( initial * trainLevels[level][trainLevelAttribIdx[attrib]] / 1000 );
					$this.val( value );
				}
				trainsUpdated();
			} ).trigger( 'do-update' );
			$train.find( '.train-attrib-initial, .train-attrib-level' ).change( function() {
				$train.find( '.train-attrib-value.train-attrib-' + $( this ).data( 'attrib' ) ).trigger( 'do-update' );
			} );
		} );
		trainsBatchBegin();
		$.each( JSON.parse( localStorage.crwebToolkitTrains || '[]' ), function() {
			var data = this, trainId = trainNextId;
			$( '#trains-new' ).trigger( 'click' );
			var $train = $( '#train-' + trainId );
			unserializeTrain( data, $train );
		} );
		trainsBatchEnd();

		// Stations
		var stations = {};
		var stationsSelect = [];
		var $stationsBody = $( '#stations-table tbody' );
		var stationTemplate = Handlebars.compile( $( '#station-template' ).html() );
		$.each( staticData.station, function() {
			stations[this[0]] = this;
			stationsSelect.push( {
				id: this[0],
				text: this[1] + ' | ' + this[4] + '星'
			} );
		} );
		var stationsBodyInsert = function( id ) {
			if ( $stationsBody.find( '#station-' + id ).length > 0 ) {
				return;
			}
			var station = stations[id];
			$stationsBody.append( stationTemplate( {
				id: station[0],
				name: station[1],
				desc: station[2],
				stars: station[4],
				starArray: new Array( station[4] ),
				X: station[5],
				Y: station[6],
				pop: station[7],
				admin: station[9]
			} ) );
			$( '#route-stations' ).append(
				$( '<li/>' ).addClass( 'ui-state-default station-' + id )
					.attr( 'data-id', id )
					.text( station[1] )
					.draggable( {
						connectToSortable: '#route-waypoints',
						helper: 'clone',
						revert: 'invalid'
					} ).click( function() {
						$( this ).clone().appendTo( '#route-waypoints' );
					} )
			);
			stationsUpdated();
		};
		stationsBatchBegin();
		$.each( JSON.parse( localStorage.crwebToolkitStations || '[]' ), function() {
			stationsBodyInsert( this );
		} );
		stationsBatchEnd();
		$( '#stations-picker' ).select2( {
			placeholder: '选择一个车站',
			data: stationsSelect
		} ).change( function() {
			var $this = $( this ), val = $this.val();
			if ( val === null ) {
				return;
			}
			$this.val( null ).trigger( 'change' );
			stationsBodyInsert( val );
		} ).val( null ).trigger( 'change' );
		$stationsBody.on( 'click', '.station-delete', function() {
			var $row = $( this ).parents( '.station-row' );
			$( '#route-stations li.station-' + $row.data( 'id' ) + ','
				+ '#route-waypoints li.station-' + $row.data( 'id' ) ).remove()
			$row.remove();
			stationsUpdated();
		} );
		$( '#stations-select a' ).click( function( e ) {
			e.preventDefault();
			var $this = $( this ), stars = $this.data( 'stars' );
			stationsBatchBegin();
			$.each( stations, function() {
				if ( this[4] === stars ) {
					stationsBodyInsert( this[0] );
				}
			} );
			stationsBatchEnd();
		} );
		$( '#stations-unselect a' ).click( function( e ) {
			e.preventDefault();
			stationsBatchBegin();
			$( '.station-row.stars-' + $( this ).data( 'stars' ) ).find( '.station-delete' ).trigger( 'click' );
			stationsBatchEnd();
		} );

		// Route
		$( '#route-waypoints' ).sortable( {
			revert: true,
			placeholder: 'ui-state-highlight',
			items: '.ui-state-default'
		} ).on( 'click', 'li.ui-state-default', function() {
			$( this ).remove();
		} ).droppable( { greedy: true } );
		$( 'body' ).droppable( {
			drop: function ( event, ui ) {
				if ( ui.draggable.parents( '#route-waypoints' ).length ) {
					ui.draggable.remove();
				}
			}
		} );

		$( '#route-train' ).on( 'do-update', function() {
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

			var useStations = $( '.station-row' ).map( function() {
				return $( this ).data( 'id' );
			} ).get();

			var wayPoints = $( '#route-waypoints li.ui-state-default' ).map( function() {
				return $( this ).data( 'id' );
			} ).get();

			$( '#route-result' ).append( routeAlertTemplate( {
				type: 'info',
				message: '正在计算，请稍候'
			} ) );

			var worker = new Worker( 'calculator.js' );
			worker.postMessage( [
				train, stations, useStations, wayPoints,
				$( '#route-insert:checked' ).length > 0, parseInt( $( '#route-penalty' ).val() ) || 0
			] );
			worker.onmessage = function( e ) {
				$( '#route-result' ).empty();
				var calculated = e.data;
				if ( calculated.ok ) {
					var pathStationsText = $.map( calculated.path, function( station ) {
						return stations[station][1];
					} );
					$( '#route-result' ).append( routeResultTemplate( {
						hasLoads: train.loads >= 0,
						path: pathStationsText.join( ' - ' ),
						totalDistance: calculated.totalDistance,
						runningTime: calculated.runningTime,
						runningHours: Math.floor( calculated.runningTime / 3600 ),
						runningMinutes: Math.floor( calculated.runningTime / 60 ) % 60,
						runningSeconds: calculated.runningTime % 60,
						batteryConsumed: calculated.batteryConsumed,
						priceDistance: calculated.priceDistance,
						priceCoins: calculated.priceCoins,
						pricePoints: calculated.pricePoints,
						costCoins: calculated.costCoins,
						totalGross: calculated.totalGross,
						totalNet: calculated.totalNet,
						dailyCount: calculated.dailyCount,
						dailyRemaining: calculated.dailyRemaining,
						dailyGross: calculated.dailyGross,
						dailyNet: calculated.dailyNet
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
				}
				worker.terminate();
			};
		} );

		$( '#route-insert' ).change( function() {
			$( '#route-penalty-group' ).toggle( $( this ).is( ':checked' ) );
		} );
	};

	readStaticData( 0 );
} );
