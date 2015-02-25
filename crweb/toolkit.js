jQuery( function( $, undefined ) {
	var localStorage = window.localStorage || {};

	var dataset;
	var hash = location.hash;
	if ( /^#dataset=/.test( hash ) ) {
		dataset = hash.substring( 9 );
		localStorage.crwebDataset = dataset;
	} else {
		dataset = localStorage.crwebDataset || 'web';
	}

	var staticData = {};

	var staticDataFiles = [ 'station', 'train', 'trainLevel', 'part' ];
	var readStaticData = function( idx ) {
		if ( idx >= staticDataFiles.length ) {
			init();
		} else {
			var staticDataKey = staticDataFiles[idx];
			$.ajax( {
				url: cloudServer + '/crweb/static_data/' + dataset + '/callback/Static'
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
		var attribNames = [ 'speed', 'distance', 'weight', 'battery' ];
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
				$.each( attribNames, function() {
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
				$.each( attribNames, function() {
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
				$( '.train-list-select' ).trigger( 'do-update' );
			}
		};
		var inStationsBatch = false;
		var stationsUpdated = function() {
			if ( !inStationsBatch ) {
				localStorage.crwebToolkitStations = JSON.stringify( serializeStations() );
				$( '.station-list-select' ).trigger( 'do-update' );
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
		var makePathText = function( calculated ) {
			if ( calculated.path ) {
				return $.map( calculated.path, function( station, index ) {
					if ( index < calculated.path.length - 1 ) {
						return [ stations[station][1], calculated.distances[index] ];
					} else {
						return stations[station][1];
					}
				} ).join( ' - ' );
			} else {
				return null;
			}
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
					$train.find( '.train-img' ).attr( 'src', cloudServer + '/crweb/train_image/' + dataset + '/' + img );
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
		var stationsSelect = [], stationsSelectShort = [];
		var $stationsBody = $( '#stations-table tbody' );
		var stationTemplate = Handlebars.compile( $( '#station-template' ).html() );
		var stationCountryById = {
			0: '中国',
			1: '英国',
			2: '意大利',
			3: '印度',
			4: '伊朗',
			5: '伊拉克',
			6: '叙利亚',
			7: '匈牙利',
			8: '希腊',
			9: '西班牙',
			10: '乌兹别克斯坦',
			11: '乌克兰',
			12: '阿尔及利亚',
			13: '阿富汗',
			14: '埃及',
			15: '奥地利',
			16: '巴基斯坦',
			17: '波兰',
			18: '德国',
			19: '俄罗斯',
			20: '法国',
			21: '哈萨克斯坦',
			22: '荷兰',
			23: '利比亚',
			24: '罗马尼亚',
			25: '蒙古',
			26: '孟加拉国',
			27: '突尼西亚',
			28: '土耳其',
			29: '韩国',
			30: '日本',
			31: '朝鲜',
			32: '美国',
			33: '加拿大'
		};
		var stationTypeById = {
			0: '国内',
			1: '欧亚',
			2: '美洲'
		};
		$.each( staticData.station, function() {
			stations[this[0]] = this;
			stationsSelect.push( {
				id: this[0],
				text: this[1] + ' | ' + this[4] + '星'
			} );
			stationsSelectShort.push( {
				id: this[0],
				text: this[1]
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
				admin: station[9],
				country: stationCountryById[( station[8] || 'q_0' ).replace( 'q_', '' )],
				type: stationTypeById[station[10]]
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
			placeholder: '选择一个车站以加入列表',
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
		$( '#stations-country' ).select2( {
			data: $.map( stationCountryById, function( country, id ) {
				return {
					id: id,
					text: country
				};
			} )
		} );
		$( '#stations-vector-base, #stations-vector-ref' ).select2( {
			data: stationsSelectShort
		} );
		var stationsSelectedList = function() {
			var stars = parseInt( $( 'input[name=stations-stars]:checked' ).val() );
			var type = parseInt( $( 'input[name=stations-type]:checked' ).val() );
			var country = $( '#stations-country' ).val();
			var vectorBaseStation = $( '#stations-vector-base' ).val();
			var vectorRefStation = $( '#stations-vector-ref' ).val();
			var vectorDir = parseInt( $( '#stations-vector-dir' ).val() );
			var baseX = stations[vectorBaseStation][5];
			var baseY = stations[vectorBaseStation][6];
			var refX = stations[vectorRefStation][5];
			var refY = stations[vectorRefStation][6];
			var vectorX = refX - baseX, vectorY = refY - baseY;
			var selectedList = [];
			$.each( stations, function() {
				if ( stars > 0 && stars != this[4] ) {
					return;
				}
				if ( type >= 0 && type != this[10] ) {
					return;
				}
				if ( country !== '' && ( 'q_' + country ) !== ( this[8] || 'q_0' ) ) {
					return;
				}
				var stationX = this[5] - baseX, stationY = this[6] - baseY;
				var cross = stationX * vectorY - vectorX * stationY;
				if ( cross * vectorDir < 0 ) {
					return;
				}
				selectedList.push( this );
			} );
			return selectedList;
		};
		$( '#stations-select' ).prop( 'disabled', false ).click( function( e ) {
			e.preventDefault();
			var $this = $( this ), stars = $this.data( 'stars' );
			stationsBatchBegin();
			$.each( stationsSelectedList(), function() {
				stationsBodyInsert( this[0] );
			} );
			stationsBatchEnd();
		} );
		$( '#stations-unselect' ).prop( 'disabled', false ).click( function( e ) {
			e.preventDefault();
			stationsBatchBegin();
			$.each( stationsSelectedList(), function() {
				$( '#station-' + this[0] ).find( '.station-delete' ).trigger( 'click' );
			} );
			stationsBatchEnd();
		} );
		var useStations = function() {
			return $( '.station-row' ).map( function() {
				return $( this ).data( 'id' );
			} ).get();
		};

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

		var routeAlertTemplate = Handlebars.compile( $( '#route-alert-template' ).html() );
		var routeResultTemplate = Handlebars.compile( $( '#route-result-template' ).html() );
		$( '#route-calculate' ).prop( 'disabled', false ).click( function() {
			$( '#route-result' ).empty();
			var trainIds = $( '#route-train' ).val();
			if ( trainIds === null ) {
				$( '<div/>' ).addClass( 'row' ).append(
					routeAlertTemplate( {
						type: 'danger',
						message: '请选择火车'
					} )
				).appendTo( '#route-result' );
				return;
			}
			var trainCount = trainIds.length, trainRecv = 0;
			if ( trainCount > 1 ) {
				$( '<h3/>' ).text( '统计信息' ).appendTo( '#route-result' );
				var $summary = $( '<div/>' ).addClass( 'row' ).appendTo( '#route-result' );
				$summary.append( routeAlertTemplate( {
					type: 'info',
					message: '正在计算，请稍候'
				} ) );
			}
			var summaryGross = new Array( trainCount ), summaryNet = new Array( trainCount );
			var dailyGross = 0, dailyNet = 0;
			var trainTextById = {};
			var trainColorById = {};
			var drawPie = function( $dom, data, title ) {
				var pieData = [];
				$.each( data, function() {
					if ( !$.isArray( this ) ) {
						return;
					}
					pieData.push( {
						label: trainTextById[this[0]],
						value: this[1],
						color: trainColorById[this[0]]
					} );
				} );
				if ( pieData.length == 0 ) {
					return false;
				}
				return new d3pie( $dom.get( 0 ), {
					header: {
						title: {
							text: title
						}
					},
					size: {
						canvasWidth: $dom.width()
					},
					data: {
						content: pieData
					}
				} );
			};
			var showSummary = function() {
				if ( trainCount <= 1 ) {
					return;
				}
				$summary.empty();
				var $grossPie = $( '<div/>' ).addClass( 'col-md-12 text-center' ).appendTo( $summary );
				var $netPie = $( '<div/>' ).addClass( 'col-md-12 text-center' ).appendTo( $summary );
				if ( !drawPie( $grossPie, summaryGross, '全日收入' ) || !drawPie( $netPie, summaryNet, '全日利润' ) ) {
					$summary.html( routeAlertTemplate( {
						type: 'warning',
						message: '计算结果中没有数据'
					} ) );
				} else {
					$summary.append( Handlebars.compile( $( '#route-summary-template' ).html() )( {
						dailyGross: dailyGross,
						dailyNet: dailyNet
					} ) );
				}
			};
			$.each( trainIds, function() {
				var trainId = this, trainText = $( '#route-train option[value=' + trainId + ']' ).text();
				var trainColor = randomColor();
				$( '<h3/>' ).text( trainText ).css( 'color', trainColor ).appendTo( '#route-result' );
				var $result = $( '<div/>' ).addClass( 'row' ).appendTo( '#route-result' );
				var $train = $( '#train-' + trainId );

				var type = parseInt( $train.find( '.train-select' ).val() );
				var speed = parseInt( $train.find( '.train-attrib-value.train-attrib-speed' ).val() );
				var distance = parseInt( $train.find( '.train-attrib-value.train-attrib-distance' ).val() );
				var weight = parseInt( $train.find( '.train-attrib-value.train-attrib-weight' ).val() );
				var battery = parseInt( $train.find( '.train-attrib-value.train-attrib-battery' ).val() );

				// trainText is too long.
				if ( type < 0 ) {
					trainTextById[trainId] = '自定义' + -type + '星级火车';
				} else {
					trainTextById[trainId] = trains[type][1];
				}
				trainColorById[trainId] = trainColor;

				if ( isNaN( speed ) || isNaN( distance ) || isNaN( weight ) || isNaN( battery ) ) {
					$result.append( routeAlertTemplate( {
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

				var wayPoints = $( '#route-waypoints li.ui-state-default' ).map( function() {
					return $( this ).data( 'id' );
				} ).get();

				$result.append( routeAlertTemplate( {
					type: 'info',
					message: '正在计算，请稍候'
				} ) );

				var worker = new Worker( 'calculator.js' );
				worker.onmessage = function( e ) {
					worker.terminate();
					$result.empty();
					trainRecv++;
					var calculated = e.data;
					if ( calculated.ok ) {
						if ( train.loads >= 0 ) {
							summaryGross[trainId] = [ trainId, calculated.dailyGross ];
							dailyGross += calculated.dailyGross;
							summaryNet[trainId] = [ trainId, calculated.dailyNet ];
							dailyNet += calculated.dailyNet;
						}
						$result.append( routeResultTemplate( {
							hasLoads: train.loads >= 0,
							path: makePathText( calculated ),
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
						$result.find( '.route-path-transfer' ).click( function() {
							$( '#route-waypoints li.ui-state-default' ).remove();
							$.each( calculated.path, function() {
								$( '<li/>' ).addClass( 'ui-state-default' )
									.attr( 'data-id', this )
									.text( stations[this][1] )
									.appendTo( '#route-waypoints' );
							} );
						} );
					} else {
						$result.append( routeAlertTemplate( {
							type: 'danger',
							message: calculated.message
						} ) );
					}
					if ( trainRecv == trainCount ) {
						showSummary();
					}
				};
				worker.postMessage( [
					train, stations, useStations(), wayPoints,
					$( '#route-insert:checked' ).length > 0, parseInt( $( '#route-penalty' ).val() ) || 0
				] );
			} );
		} );

		$( '#route-insert' ).change( function() {
			$( '#route-penalty-group' ).toggle( $( this ).is( ':checked' ) );
		} );

		// Optimization
		var trainLevelChanceIdx = {
			speed: 6,
			distance: 6,
			weight: 6,
			battery: 6
		};
		var optimizationChanceTemplate = Handlebars.compile( $( '#optimization-chance-template' ).html() );
		var $optimizationChanceBody = $( '#optimization-chance-table tbody' );
		$.each( trainLevels, function() {
			$optimizationChanceBody.append( optimizationChanceTemplate( {
				level: this[0],
				speed: this[trainLevelChanceIdx.speed],
				distance: this[trainLevelChanceIdx.speed],
				weight: this[trainLevelChanceIdx.weight],
				battery: this[trainLevelChanceIdx.battery]
			} ) );
		} );
		$( '.station-list-select' ).on( 'do-update', function() {
			var $select = $( this );
			var val = $select.val();
			$select.empty();

			$( '.station-row' ).each( function() {
				var $this = $( this );

				var id = $this.data( 'id' );
				var station = stations[id];

				$( '<option/>' ).attr( 'value', id ).text(
					station[1] + ' | ' + station[4] + '星'
				).appendTo( $select );
			} );

			$select.val( val );
		} ).trigger( 'do-update' );
		var optimizationBaseTemplate = Handlebars.compile( $( '#optimization-base-template' ).html() );
		var optimizationTrain = function( group ) {
			if ( !group ) {
				group = 'value';
			}

			var trainId = $( '#optimization-train' ).val();
			var $train = $( '#train-' + trainId );
			if ( $train.length == 0 ) {
				return null;
			}

			var type = parseInt( $train.find( '.train-select' ).val() );
			if ( type < 0 ) {
				return null;
			}

			return {
				speed: parseInt( $train.find( '.train-attrib-' + group + '.train-attrib-speed' ).val() ),
				distance: parseInt( $train.find( '.train-attrib-' + group + '.train-attrib-distance' ).val() ),
				weight: parseInt( $train.find( '.train-attrib-' + group + '.train-attrib-weight' ).val() ),
				battery: parseInt( $train.find( '.train-attrib-' + group + '.train-attrib-battery' ).val() ),
				stars: trains[type][3],
				loads: trains[type][8] + trains[type][9]
			};
		};
		$( '#optimization-train' ).change( function() {
			var $result = $( '<div/>' ).addClass( 'row' ).appendTo( $( '#optimization-base' ).empty() );
			var train = optimizationTrain();
			if ( !train ) {
				return;
			}

			var worker = new Worker( 'calculator.js' );
			worker.onmessage = function( e ) {
				worker.terminate();
				var calculated = e.data;
				if ( calculated.ok ) {
					$result.html( optimizationBaseTemplate( {
						gross: calculated.totalGross,
						net: calculated.totalNet
					} ) );
				}
			};
			worker.postMessage( [ train, stations, [], [], false, 0 ] );
		} );
		$( '.optimization-slider' ).slider( {
			range: true,
			min: 1,
			max: 100,
			values: [ 0, 20 ],
			slide: function( event, ui ) {
				var $this = $( this ), $values = $( '#' + $this.attr( 'id' ) + '-values' );
				$values.text( ui.values[ 0 ] + ' - ' + ui.values[ 1 ] );
			}
		} );
		var optimizationAlertTemplate = Handlebars.compile( $( '#optimization-alert-template' ).html() );
		var optimizationResultTemplate = Handlebars.compile( $( '#optimization-result-template' ).html() );
		$( '#optimization-calculate' ).prop( 'disabled', false ).click( function() {
			$( '#optimization-result' ).empty();

			// Step 0, collect data
			var train = optimizationTrain();
			var initialTrain = optimizationTrain( 'initial' );
			var levelTrain = optimizationTrain( 'level' );
			var useStationsV = useStations();
			var fromStation = $( '#optimization-from' ).val();
			var toStation = $( '#optimization-to' ).val();
			var exprInput = $( '#optimization-expr' ).val();
			var penalty = parseInt( $( '#optimization-penalty' ).val() ) || 0;

			if ( !train || !stations[fromStation] || !stations[toStation] ) {
				$( '#optimization-result' ).append( optimizationAlertTemplate( {
					type: 'danger',
					message: '请选择火车和发到站'
				} ) );
				return;
			}

			var evalExpr = function( attribs, baseData, calculated, cost ) {
				with ( {
					速度: attribs.speed,
					速度等级: attribs.speedLevel,
					距离: attribs.distance,
					距离等级: attribs.distanceLevel,
					重量: attribs.weight,
					重量等级: attribs.weightLevel,
					电量: attribs.battery,
					电量等级: attribs.batteryLevel,
					基准收入: baseData.dailyGross,
					基准利润: baseData.dailyNet,
					收入: calculated.dailyGross,
					利润: calculated.dailyNet,
					单程里程: calculated.totalDistance,
					行车次数: calculated.dailyCount,
					剩余电量: calculated.dailyRemaining,
					点卷消耗: cost
				} ) {
					return eval( exprInput );
				}
			};

			var fakeAttribs = {
				speed: 1,
				speedLevel: 1,
				distance: 1,
				distanceLevel: 1,
				weight: 1,
				weightLevel: 1,
				battery: 1,
				batteryLevel: 1
			};

			var fakeCalculatorOutput = {
				ok: true,
				path: [1],
				distances: [],
				totalDistance: 1,
				runningTime: 1,
				batteryConsumed: 1,
				priceDistance: 1,
				priceCoins: 1,
				pricePoints: 1,
				costCoins: 1,
				totalGross: 1,
				totalNet: 1,
				dailyCount: 1,
				dailyRemaining: 1,
				dailyGross: 1,
				dailyNet: 1
			};

			try {
				evalExpr( fakeAttribs, fakeCalculatorOutput, fakeCalculatorOutput, 0 );
			} catch ( e ) {
				$( '#optimization-result' ).append( optimizationAlertTemplate( {
					type: 'danger',
					message: '公式错误：' + e.toString()
				} ) );
				return;
			}

			var speedMin = $( '#optimization-slider-speed' ).slider( 'values', 0 );
			var speedMax = $( '#optimization-slider-speed' ).slider( 'values', 1 );
			var distanceMin = $( '#optimization-slider-distance' ).slider( 'values', 0 );
			var distanceMax = $( '#optimization-slider-distance' ).slider( 'values', 1 );
			var weightMin = $( '#optimization-slider-weight' ).slider( 'values', 0 );
			var weightMax = $( '#optimization-slider-weight' ).slider( 'values', 1 );
			var batteryMin = $( '#optimization-slider-battery' ).slider( 'values', 0 );
			var batteryMax = $( '#optimization-slider-battery' ).slider( 'values', 1 );

			// It doesn't make sense to reduce distance, weight and battery
			distanceMin = Math.max( distanceMin, levelTrain.distance );
			distanceMax = Math.max( distanceMin, distanceMax )
			weightMin = Math.max( weightMin, levelTrain.weight );
			weightMax = Math.max( weightMin, weightMax )
			batteryMin = Math.max( batteryMin, levelTrain.battery );
			batteryMax = Math.max( batteryMin, batteryMax )

			$( '#optimization-result' ).append( optimizationAlertTemplate( {
				type: 'info',
				message: '正在计算，请稍候'
			} ) );

			// Step 1, calculate base data -- below everything else
			var baseData = null;

			// Step 2, calculate path for each distance level and omit equal values
			var paths = [], prevPathDistance = null;
			var worker = new Worker( 'calculator.js' );
			var calculateDistanceLevel = function( distanceLevel ) {
				if ( distanceLevel > distanceMax ) {
					worker.terminate();
					if ( paths.length == 0 ) {
						$( '#optimization-result' ).html( optimizationAlertTemplate( {
							type: 'danger',
							message: '此车初始距离过低，无法升级至可行走指定发到站的数值'
						} ) );
					} else {
						calculatePaths();
					}
					return;
				}
				var distance = Math.floor(
					trainLevels[distanceLevel][trainLevelAttribIdx.distance] * initialTrain.distance / 1000
				);
				worker.onmessage = function( e ) {
					var calculated = e.data;
					if ( calculated.ok && ( prevPathDistance === null
						|| calculated.totalDistance < prevPathDistance
					) ) {
						paths.push( {
							distanceLevel: distanceLevel,
							distance: distance,
							path: calculated.path,
							totalDistance: calculated.totalDistance,
							distances: calculated.distances
						} );
						prevPathDistance = calculated.totalDistance;
					}
					calculateDistanceLevel( distanceLevel + 1 );
				};
				worker.postMessage( [
					$.extend( {}, train, { distance: distance } ),
					stations, useStationsV,
					[ fromStation, toStation ], true, penalty
				] );
			};

			// Step 3, for each path, iterate over speed values. For each speed values, find battery "steps".
			// There won't be many paths I guess, so creating a worker for each path would be acceptable.
			var optimizationData = [];
			var calculatePaths = function() {
				var pathDone = 0;
				$.each( paths, function() {
					var path = this, worker = new Worker( 'calculator.js' );
					var speedValues = [];
					for ( var speedLevel = speedMin; speedLevel <= speedMax; speedLevel++ ) {
						var speed = Math.floor(
							trainLevels[speedLevel][trainLevelAttribIdx.speed] * initialTrain.speed / 1000
						), prevDailyCount = null, batteryLevels = [];
						for ( var batteryLevel = batteryMin; batteryLevel <= batteryMax; batteryLevel++ ) {
							var battery = Math.floor(
								trainLevels[batteryLevel][trainLevelAttribIdx.battery]
									* initialTrain.battery / 1000
							);
							var dailyCount = Math.floor( battery / Math.floor(
								Math.floor( path.totalDistance * 450 / speed )
							/ 60 ) );
							if ( prevDailyCount === null || dailyCount > prevDailyCount ) {
								batteryLevels.push( {
									batteryLevel: batteryLevel,
									battery: battery
								} );
								prevDailyCount = dailyCount;
							}
						}
						speedValues.push( {
							speedLevel: speedLevel,
							speed: speed,
							batteryLevels: batteryLevels
						} );
					}
					// Generate a list of level pairs to run
					var pairs = [];
					var distanceLevel = path.distanceLevel, distance = path.distance;
					$.each( speedValues, function() {
						var speedLevel = this.speedLevel, speed = this.speed;
						$.each( this.batteryLevels, function() {
							var batteryLevel = this.batteryLevel, battery = this.battery;
							for ( var weightLevel = weightMin; weightLevel <= weightMax; weightLevel++ ) {
								var weight = Math.floor(
									trainLevels[weightLevel][trainLevelAttribIdx.weight]
										* initialTrain.weight / 1000
								);
								pairs.push( {
									distanceLevel: distanceLevel,
									distance: distance,
									speedLevel: speedLevel,
									speed: speed,
									batteryLevel: batteryLevel,
									battery: battery,
									weightLevel: weightLevel,
									weight: weight
								} );
							}
						} );
					} );
					var pairIdx = -1;
					var nextPair = function() {
						if ( ++pairIdx == pairs.length ) {
							if ( ++pathDone == paths.length ) {
								calculateSummarize();
							}
							return;
						}
						var pair = pairs[pairIdx];
						worker.postMessage( [
							$.extend( {}, train, {
								speed: pair.speed,
								distance: pair.distance,
								weight: pair.weight,
								battery: pair.battery
							} ),
							stations, useStationsV,
							path.path, false, 0
						] );
					};
					worker.onmessage = function( e ) {
						var calculated = e.data;
						if ( calculated.ok ) {
							var grossRatio = calculated.dailyGross / baseData.dailyGross;
							var netRatio = calculated.dailyNet / baseData.dailyNet;
							var cost = estimateCost( pairs[pairIdx] );
							var func = null;
							try {
								func = evalExpr( pairs[pairIdx], baseData, calculated, cost );
							} catch ( e ) {
							}
							optimizationData.push( $.extend( {}, pairs[pairIdx], {
								calculated: calculated,
								grossRatio: grossRatio,
								netRatio: netRatio,
								cost: cost,
								func: func
							} ) );
						}
						nextPair();
					};
					nextPair();
				} );
			};

			// Step 4, summarize data
			var calculateSummarize = function() {
				optimizationData.sort( function( a, b ) {
					return b.func - a.func;
				} );
				optimizationData.splice( 100, Number.MAX_VALUE );
				$.each( optimizationData, function() {
					this.path = makePathText( this.calculated ) || '';
				} );
				$( '#optimization-result' ).html( optimizationResultTemplate( {
					data: optimizationData
				} ) );
			};

			// Helper: calculate level cost
			var levelCost = {
				speed: new Array( 102 ),
				distance: new Array( 102 ),
				weight: new Array( 102 ),
				battery: new Array( 102 )
			};
			var estimateCost = function( levels ) {
				var cost = 0;
				$.each( attribNames, function() {
					var curLevel = levels[this + 'Level'], trainLevel = levelTrain[this];
					if ( curLevel > trainLevel ) {
						cost += levelCost[this][curLevel] - levelCost[this][trainLevel];
					}
				} );
				return cost;
			};
			$.each( attribNames, function() {
				var accum = 0;
				levelCost[this][1] = 0;
				for ( var i = 1; i <= 100; i++ ) {
					accum += Math.floor( 4 * 10000 / ( $(
						'.optimization-chance-' + this + '.optimization-chance-level' + i
					).val() || 1 ) );
					levelCost[this][i + 1] = accum;
				}
			} );

			// Base data
			var worker = new Worker( 'calculator.js' );
			worker.onmessage = function( e ) {
				var calculated = e.data;
				if ( calculated.ok ) {
					baseData = calculated;
					calculateDistanceLevel( distanceMin );
				} else {
					// Why?
					$( '#optimization-result' ).html( optimizationAlertTemplate( {
						type: 'danger',
						message: calculated.message
					} ) );
				}
			};
			worker.postMessage( [ train, stations, [], [], false, 0 ] );
		} );

		// Shared
		$( '.train-list-select' ).on( 'do-update', function() {
			var $select = $( this );
			var val = $select.val();
			$select.empty();

			$( '.train-row' ).each( function() {
				var $this = $( this );

				var id = $this.data( 'id' );
				var type = parseInt( $this.find( '.train-select' ).val() ), typeText;
				if ( type < 0 ) {
					if ( $select.data( 'negative' ) ) {
						typeText = '自定义' + -type + '星级火车';
					} else {
						return;
					}
				} else {
					typeText = trains[type][1];
				}
				var speed = parseInt( $this.find( '.train-attrib-value.train-attrib-speed' ).val() );
				var distance = parseInt( $this.find( '.train-attrib-value.train-attrib-distance' ).val() );
				var weight = parseInt( $this.find( '.train-attrib-value.train-attrib-weight' ).val() );
				var battery = parseInt( $this.find( '.train-attrib-value.train-attrib-battery' ).val() );
				var speedLevel = parseInt( $this.find( '.train-attrib-level.train-attrib-speed' ).val() );
				var distanceLevel = parseInt( $this.find( '.train-attrib-level.train-attrib-distance' ).val() );
				var weightLevel = parseInt( $this.find( '.train-attrib-level.train-attrib-weight' ).val() );
				var batteryLevel = parseInt( $this.find( '.train-attrib-level.train-attrib-battery' ).val() );

				if ( isNaN( speed ) || isNaN( distance ) || isNaN( weight ) || isNaN( battery ) ) {
					return;
				}

				var text = typeText
					+ ' | ' + ( type < 0 ? -type : trains[type][3] ) + '星'
					+ ' | 速度（' + speedLevel + '级）' + speed
					+ ' | 距离（' + distanceLevel + '级）' + distance
					+ ' | 重量（' + weightLevel + '级）' + weight
					+ ' | 电量（' + batteryLevel + '级）' + battery;
				$( '<option/>' ).attr( 'value', id ).text( text ).appendTo( $select );
			} );

			$select.val( val ).trigger( 'change' );
			if ( $select.prop( 'multiple' ) ) {
				$select.attr( 'size', $select.find( 'option' ).length );
			}
		} ).trigger( 'do-update' );
	};

	readStaticData( 0 );
} );
