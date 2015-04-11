jQuery( function( $, undefined ) {
	var localStorage = window.localStorage || {};

	var dataset;
	var hash = location.hash;
	if ( /^#dataset=/.test( hash ) ) {
		dataset = hash.substring( 9 );
		localStorage.crwebToolkitDataset = dataset;
	} else {
		dataset = localStorage.crwebToolkitDataset || 'web';
	}
	document.title += ' - ' + dataset;
	ga( 'send', 'pageview', location.pathname + '#dataset=' + dataset );
	if ( localStorage.crwebToolkitTrains ) {
		localStorage.crwebToolkitTrains_web = localStorage.crwebToolkitTrains;
		delete localStorage.crwebToolkitTrains;
	}
	if ( localStorage.crwebToolkitStations ) {
		localStorage.crwebToolkitStations_web = localStorage.crwebToolkitStations;
		delete localStorage.crwebToolkitStations;
	}

	var staticData = {};
	var localData = {};

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
				cache: true,
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
		// Data
		var trains = {};
		var trainsSelect = [];
		$.each( staticData.train, function() {
			trains[this[0]] = this;
			trainsSelect.push( {
				id: this[0],
				text: this[1] + ' | ' + this[3] + '星'
			} );
		} );
		var stations = {};
		var stationsSelect = [], stationsSelectShort = [];
		var stationsTerminals = null;
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
				localStorage['crwebToolkitTrains_' + dataset] = JSON.stringify( serializeTrains() );
				$( '.train-list-select' ).trigger( 'do-update' );
				$( '#spike-container' ).trigger( 'do-update' );
			}
		};
		var inStationsBatch = false;
		var stationsUpdated = function() {
			if ( !inStationsBatch ) {
				localStorage['crwebToolkitStations_' + dataset] = JSON.stringify( serializeStations() );
				stationsTerminals = estimateTerminals( useStations() );
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
		var trainNameByType = function( type ) {
			if ( type < 0 ) {
				return '自定义' + -type + '星级火车';
			} else {
				return trains[type][1];
			}
		};
		var makeTrainText = function( trainId, allowNegative ) {
			var $train = $( '#train-' + trainId );

			var type = parseInt( $train.find( '.train-select' ).val() );
			if ( type < 0 && !allowNegative ) {
				return null;
			}
			var typeText = trainNameByType( type );

			var speed = parseInt( $train.find( '.train-attrib-value.train-attrib-speed' ).val() );
			var distance = parseInt( $train.find( '.train-attrib-value.train-attrib-distance' ).val() );
			var weight = parseInt( $train.find( '.train-attrib-value.train-attrib-weight' ).val() );
			var battery = parseInt( $train.find( '.train-attrib-value.train-attrib-battery' ).val() );
			var speedLevel = parseInt( $train.find( '.train-attrib-level.train-attrib-speed' ).val() );
			var distanceLevel = parseInt( $train.find( '.train-attrib-level.train-attrib-distance' ).val() );
			var weightLevel = parseInt( $train.find( '.train-attrib-level.train-attrib-weight' ).val() );
			var batteryLevel = parseInt( $train.find( '.train-attrib-level.train-attrib-battery' ).val() );

			if ( isNaN( speed ) || isNaN( distance ) || isNaN( weight ) || isNaN( battery ) ) {
				return null;
			}

			var text = typeText
				+ ' | ' + ( type < 0 ? -type : trains[type][3] ) + '星'
				+ ' | 速度（' + speedLevel + '级）' + speed
				+ ' | 距离（' + distanceLevel + '级）' + distance
				+ ' | 重量（' + weightLevel + '级）' + weight
				+ ' | 电量（' + batteryLevel + '级）' + battery;

			return text;
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
		var useStations = function() {
			return $( '.station-row' ).map( function() {
				return $( this ).data( 'id' );
			} ).get();
		};
		var estimateTerminals = function( usedStations ) {
			if ( usedStations.length < 2 ) {
				return [ null, null ];
			}
			var xSum = 0, ySum = 0;
			$.each( usedStations, function() {
				xSum += stations[this][5];
				ySum += stations[this][6];
			} );
			var xCtr = xSum / usedStations.length, yCtr = ySum / usedStations.length;
			var terminal1 = null, t1distSq = 0;
			$.each( usedStations, function() {
				var x = stations[this][5] - xCtr, y = stations[this][6] - yCtr;
				var distSq = x * x + y * y;
				if ( distSq >= t1distSq ) {
					terminal1 = this;
					t1distSq = distSq;
				}
			} );
			var t1x = stations[terminal1][5], t1y = stations[terminal1][6];
			var terminal2 = null, t2distSq = 0;
			$.each( usedStations, function() {
				var x = stations[this][5] - t1x, y = stations[this][6] - t1y;
				var distSq = x * x + y * y;
				if ( distSq >= t2distSq ) {
					terminal2 = this;
					t2distSq = distSq;
				}
			} );
			return [ parseInt( terminal1 ), parseInt( terminal2 ) ];
		};
		var getTrainImageUrl = function( img ) {
			if ( localData.trainImageRoot ) {
				return localData.trainImageRoot + img;
			} else {
				return cloudServer + '/crweb/train_image/' + dataset + '/' + img;
			}
		};
		// Trains
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
		var trainPartsAbbr = [ '车厢', '底盘', '车头', '图纸' ];
		$.each( staticData.part, function() {
			trainParts[this[0]] = this;
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
				var name = trainNameByType( trainType ), desc, img, pc, cc;

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

				$train.find( '.train-img' ).attr( 'src', '' ).attr( 'alt', '' );
				if ( img ) {
					$train.find( '.train-img' )
						.attr( 'src', getTrainImageUrl( img ) )
						.attr( 'alt', name );
				}
				$train.find( '.train-info' ).html(
					new Array( stars + 1 ).join( '<span class="glyphicon glyphicon-star" aria-hidden=true></span>' )
					+ ' ' + stars + '星级火车'
				).append( pc >= 0 ? ' | <span class="glyphicon glyphicon-user" aria-hidden=true></span> ' + pc + '客运仓位' : ''
				).append( cc >= 0 ? ' | <span class="glyphicon glyphicon-briefcase" aria-hidden=true></span> ' + cc + '货运仓位' : '' );
				if ( trainType > 0 ) {
					var trainPriceText = [], part;
					if ( trains[trainType][12] > 0 || trains[trainType][13] > 0) {
						var trainPriceAlt = [];
						if ( trains[trainType][12] > 0 ) {
							trainPriceAlt.push( trains[trainType][12] + '点券' );
						}
						if ( trains[trainType][13] > 0 ) {
							trainPriceAlt.push( trains[trainType][13] + localData.currencyName );
						}
						trainPriceText.push( '整车：' + trainPriceAlt.join( ' 或 ' ) );
					}
					$.each( [ 2, 0, 1, 3 ], function() {
						part = trainParts[trains[trainType][this + 26]];
						trainPriceText.push(
							'<dfn title="'
							+ part[1].replace( /&/g, '&amp;').replace( /"/g, '&quot;')
							+ '">'
							+ trainPartsAbbr[this]
							+ '</dfn>：'
							+ part[6]
							+ '点卷'
						);
					} );
					// 3 = drawing is the last part above
					trainPriceText.push( '启用：' + part[6] + '点卷' );
					trainPriceText.push( '组装：' + ( Math.floor( part[6] / 2 ) + 1 ) + '点卷' );
					trainPriceText.push( '<dfn title="速度 * 电量 * 仓位 / 启用点卷">评估值</dfn>：'
						+ Math.floor( trains[trainType][5] * trains[trainType][7] * (
							trains[trainType][8] + trains[trainType][9] ) / part[6] ) );
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
				var $diff = $train.find( '.train-attrib-diff.train-attrib-' + attrib );
				var initial = parseInt( $train.find( '.train-attrib-initial.train-attrib-' + attrib ).val() );
				var level = parseInt( $train.find( '.train-attrib-level.train-attrib-' + attrib ).val() );
				if ( isNaN( initial ) || isNaN( level ) || !trainLevels[level] ) {
					$this.val( '' );
					$diff.text( '' );
				} else {
					var value = Math.floor( initial * trainLevels[level][trainLevelAttribIdx[attrib]] / 1000 );
					$this.val( value );
					var diff = value - initial;
					var diffPercent = ( ( trainLevels[level][trainLevelAttribIdx[attrib]] - 1000 ) / 10 ).toFixed( 1 );
					if ( diff == 0 ) {
						$diff.text( '' );
					} else if ( diff < 0 ) {
						$diff.text( diff + ' / ' + diffPercent + '%' );
					} else {
						$diff.text( '+' + diff + ' / +' + diffPercent + '%' );
					}
				}
				trainsUpdated();
			} ).trigger( 'do-update' );
			$train.find( '.train-attrib-initial, .train-attrib-level' ).change( function() {
				$train.find( '.train-attrib-value.train-attrib-' + $( this ).data( 'attrib' ) ).trigger( 'do-update' );
			} );
		} );
		trainsBatchBegin();
		$.each( JSON.parse( localStorage['crwebToolkitTrains_' + dataset] || '[]' ), function() {
			var data = this, trainId = trainNextId;
			if ( !trains[data.type] ) {
				return;
			}
			$( '#trains-new' ).trigger( 'click' );
			var $train = $( '#train-' + trainId );
			unserializeTrain( data, $train );
		} );
		trainsBatchEnd();

		// Stations
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
		var stationPrice = function( station ) {
			var type = station[10], stars = station[4], pop = station[7];
			if ( type == 0 && stars < 3 ) {
				return 100 * pop + 1000;
			} else if ( type == 0 && stars == 3 ) {
				return 300 * pop + 3000;
			} else if ( type > 0 && stars < 3 ) {
				return 600 * pop + 6000;
			} else if ( type > 0 && stars == 3 ) {
				return 1800 * pop + 18000;
			}
		};
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
				type: stationTypeById[station[10]],
				price: stationPrice( station )
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
		$.each( JSON.parse( localStorage['crwebToolkitStations_' + dataset] || '[]' ), function() {
			if ( !stations[this] ) {
				return;
			}
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
			var userList = $.map( $( '#stations-list' ).val().split( ' ' ), function( v ) {
				return v || null;
			} );
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
				if ( userList.length > 0 && $.inArray( this[1], userList ) < 0 ) {
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
			var dailyGross = 0, dailyNet = 0, onewayCost = 0, totalPassengerLoads = 0, totalCargoLoads = 0, totalLoads = 0;
			var trainTextById = {};
			var trainColorById = {};
			var filterData = function( data ) {
				var ret = [];
				$.each( data, function() {
					if ( $.isArray( this ) ) {
						ret.push( this );
					}
				} );
				return ret;
			};
			var drawPie = function( $dom, data ) {
				return c3.generate( {
					bindto: $dom.get( 0 ),
					data: {
						columns: data,
						type: 'pie',
						colors: trainColorById,
						names: trainTextById,
						onclick: function( d ) {
							var $resultHeading = $( '#route-result-heading-train-' + d.id );
							$( 'html, body' ).animate( {
								scrollTop: $resultHeading.offset().top
							}, 1000 );
						}
					},
					legend: {
						hide: true
					}
				} );
			};
			var drawScatter = function( $dom, xLabel, xData, yLabel, yData, tooltipTitle, tooltipText ) {
				var mixedData = [], xs = {}, xDataMap = {};
				for ( var i = 0; i < Math.min( xData.length, yData.length ); i++ ) {
					mixedData.push( [ xData[i][0] + '_x', xData[i][1] ] );
					mixedData.push( yData[i] );
					xs[yData[i][0]] = xData[i][0] + '_x';
					xDataMap[xData[i][0]] = xData[i][1];
				}
				return c3.generate( {
					bindto: $dom.get( 0 ),
					data: {
						xs: xs,
						columns: mixedData,
						type: 'scatter',
						colors: trainColorById,
						names: trainTextById,
					},
					axis: {
						x: {
							label: xLabel,
							tick: {
								fit: false
							}
						},
						y: {
							label: yLabel,
							inner: true
						}
					},
					point: {
						r: 8
					},
					size: {
						width: $dom.width(),
						height: $dom.width() // Make it square
					},
					tooltip: {
						format: {
							title: function( d ) {
								return tooltipTitle;
							},
							value: function( value, ratio, id, index ) {
								return tooltipText( xDataMap[id], value );
							}
						}
					}
				} );
			};

			var showScatter = $( '#route-draw-scatter:checked' ).length > 0;
			var showPie = $( '#route-draw-pie:checked' ).length > 0;
			var showSummary = function() {
				if ( trainCount <= 1 ) {
					return;
				}
				$summary.empty();
				var summaryGrossF = filterData( summaryGross );
				var summaryNetF = filterData( summaryNet );
				if ( summaryGrossF.length == 0 || summaryNetF.length == 0 ) {
					$summary.html( routeAlertTemplate( {
						type: 'warning',
						message: '计算结果中没有数据'
					} ) );
					return;
				}
				if ( showScatter ) {
					var $scatter = $( '<div/>' ).appendTo(
						$( '<div/>' ).addClass( 'col-md-12 text-center' ).appendTo( $summary )
					);
					drawScatter( $scatter,
						'全日收入', summaryGrossF, '全日利润', summaryNetF, '全日收入和利润',
						function( gross, net ) {
							return '收入：' + gross + '；利润：' + net;
					} );
				}
				if ( showPie ) {
					var $grossPie = $( '<div/>' ).appendTo(
						$( '<div/>' ).addClass( 'col-md-12 text-center' ).append(
							$( '<h4/>' ).text( '全日收入' )
						).appendTo( $summary )
					);
					var $netPie = $( '<div/>' ).appendTo(
						$( '<div/>' ).addClass( 'col-md-12 text-center' ).append(
							$( '<h4/>' ).text( '全日利润' )
						).appendTo( $summary )
					);
					drawPie( $grossPie, summaryGrossF );
					drawPie( $netPie, summaryNetF );
				}
				$summary.append( Handlebars.compile( $( '#route-summary-template' ).html() )( {
					dailyGross: dailyGross,
					dailyNet: dailyNet,
					onewayCost: onewayCost,
					totalPassengerLoads: totalPassengerLoads,
					totalCargoLoads: totalCargoLoads,
					totalLoads: totalLoads
				} ) );
			};

			var useStationsV = useStations();
			var wayPoints = $( '#route-waypoints li.ui-state-default' ).map( function() {
				return $( this ).data( 'id' );
			} ).get();
			var coef = $( '#route-saturday:checked' ).length > 0 ? 1.2 : 1;
			var night = $( '#route-night:checked' ).length > 0;
			var insert = $( '#route-insert:checked' ).length > 0;
			var penalty = parseInt( $( '#route-penalty' ).val() ) || 0;
			var tasks = [], taskIdx = 0;
			$.each( trainIds, function() {
				var trainId = this, trainText = makeTrainText( trainId, true );
				var trainColor = randomColor();
				$( '<h3/>' ).attr( 'id', 'route-result-heading-train-' + trainId )
					.text( trainText ).css( 'color', trainColor ).appendTo( '#route-result' );
				var $result = $( '<div/>' ).addClass( 'row' ).appendTo( '#route-result' );
				var $train = $( '#train-' + trainId );

				var type = parseInt( $train.find( '.train-select' ).val() );
				var speed = parseInt( $train.find( '.train-attrib-value.train-attrib-speed' ).val() );
				var distance = parseInt( $train.find( '.train-attrib-value.train-attrib-distance' ).val() );
				var weight = parseInt( $train.find( '.train-attrib-value.train-attrib-weight' ).val() );
				var battery = parseInt( $train.find( '.train-attrib-value.train-attrib-battery' ).val() );

				// trainText is too long.
				trainTextById[trainId] = trainNameByType( type );
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

				$result.append( routeAlertTemplate( {
					type: 'info',
					message: '正在计算，请稍候'
				} ) );

				tasks.push( {
					onmessage: function( e ) {
						$result.empty();
						trainRecv++;
						var calculated = e.data;
						if ( calculated.ok ) {
							if ( train.loads >= 0 ) {
								summaryGross[trainId] = [ trainId, calculated.dailyGross ];
								dailyGross += calculated.dailyGross;
								summaryNet[trainId] = [ trainId, calculated.dailyNet ];
								dailyNet += calculated.dailyNet;
								onewayCost += calculated.costCoins;
								totalPassengerLoads += trains[type][8];
								totalCargoLoads += trains[type][9];
								totalLoads += train.loads;
							}
							var runningTimeReverseRef = new Date( localData.runningTimeReverse );
							var runningTimeReverse = new Date(
								runningTimeReverseRef.getTime() - calculated.runningTime * 1000
							);
							$result.append( routeResultTemplate( {
								hasLoads: train.loads >= 0,
								path: makePathText( calculated ),
								totalDistance: calculated.totalDistance,
								totalDistanceRatio: calculated.totalDistance / calculated.priceDistance,
								runningTime: calculated.runningTime,
								runningHours: Math.floor( calculated.runningTime / 3600 ),
								runningMinutes: Math.floor( calculated.runningTime / 60 ) % 60,
								runningSeconds: calculated.runningTime % 60,
								runningTimeReverseRef: runningTimeReverseRef.toTimeString(),
								runningTimeReverse: runningTimeReverse.toTimeString(),
								batteryConsumed: calculated.batteryConsumed,
								accelerationCost: calculated.accelerationCost,
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
					},
					message: [
						train, stations, useStationsV, wayPoints,
						insert, penalty, coef, night
					]
				} );
			} );

			$.each( new Array( 4 ), function( i ) { // 4 workers
				var worker = new Worker( 'calculator.js' );
				var fetchedTask = taskIdx++;
				var next = function() {
					if ( fetchedTask >= tasks.length ) {
						worker.terminate();
					} else {
						worker.postMessage( tasks[fetchedTask].message );
					}
				};
				worker.onmessage = function( e ) {
					tasks[fetchedTask].onmessage( e );
					fetchedTask = taskIdx++;
					next();
				};
				next();
			} );
		} );

		$( '#route-insert' ).change( function() {
			$( '#route-penalty-group' ).toggle( $( this ).is( ':checked' ) );
		} ).trigger( 'change' );
		$( '#route-train' ).change( function() {
			var val = $( this ).val();
			if ( val && val.length > 1 ) {
				$( '#route-draw-group' ).show();
			} else {
				$( '#route-draw-group' ).hide();
			}
		} ).trigger( 'change' );

		// Optimization
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
		if ( stationsTerminals[0] ) {
			$( '#optimization-from' ).val( stationsTerminals[0] ).change();
		}
		if ( stationsTerminals[1] ) {
			$( '#optimization-to' ).val( stationsTerminals[1] ).change();
		}
		$( '#optimization-expr-vars a' ).click( function( e ) {
			e.preventDefault();
			$( '#optimization-expr' ).selection( 'replace', {
				text: $( this ).text()
			} );
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
			var $result = $( '<div/>' ).appendTo( $( '#optimization-result' ).empty() );

			// Step 0, collect data
			var trainId = $( '#optimization-train' ).val();
			var train = optimizationTrain();
			var initialTrain = optimizationTrain( 'initial' );
			var levelTrain = optimizationTrain( 'level' );
			var useStationsV = useStations();
			var fromStation = $( '#optimization-from' ).val();
			var toStation = $( '#optimization-to' ).val();
			var exprInput = $( '#optimization-expr' ).val();
			var numRows = parseInt( $( '#optimization-numrows' ).val() );
			var night = $( '#optimization-night:checked' ).length > 0;
			var penalty = parseInt( $( '#optimization-penalty' ).val() ) || 0;

			if ( !train || !stations[fromStation] || !stations[toStation] ) {
				$result.append( optimizationAlertTemplate( {
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
					点卷消耗: cost.total,
					速度点卷消耗: cost.speed,
					距离点卷消耗: cost.distance,
					重量点卷消耗: cost.weight,
					电量点卷消耗: cost.battery,
					点券消耗: cost.total,
					速度点券消耗: cost.speed,
					距离点券消耗: cost.distance,
					重量点券消耗: cost.weight,
					电量点券消耗: cost.battery
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
				$result.append( optimizationAlertTemplate( {
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

			$result.append( optimizationAlertTemplate( {
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
						$result.html( optimizationAlertTemplate( {
							type: 'danger',
							message: '此车初始距离过低或星级过高，无法行走指定发到站'
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
							path.path, false, 0, 1, night
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
				if ( !isNaN( numRows ) ) {
					optimizationData.splice( numRows, Number.MAX_VALUE );
				}
				$.each( optimizationData, function() {
					this.path = makePathText( this.calculated ) || '';
				} );
				$result.html( optimizationResultTemplate( {
					data: optimizationData
				} ) ).find( '#optimization-result-table' ).on( 'click', '.optimization-transfer', function( e ) {
					var $row = $( this ).parents( '.optimization-result-row' );
					var $train = $( '#train-' + trainId );
					trainsBatchBegin();
					$train.find( '.train-attrib-level.train-attrib-speed' ).val( $row.data( 'speed' ) );
					$train.find( '.train-attrib-level.train-attrib-distance' ).val( $row.data( 'distance' ) );
					$train.find( '.train-attrib-level.train-attrib-weight' ).val( $row.data( 'weight' ) );
					$train.find( '.train-attrib-level.train-attrib-battery' ).val( $row.data( 'battery' ) );
					$train.find( '.train-attrib-value' ).trigger( 'do-update' );
					trainsBatchEnd();
				} );
			};

			// Helper: calculate level cost
			var levelCost = {
				speed: new Array( 102 ),
				distance: new Array( 102 ),
				weight: new Array( 102 ),
				battery: new Array( 102 )
			};
			var estimateCost = function( levels ) {
				var cost = {
					speed: 0,
					distance: 0,
					weight: 0,
					battery: 0,
					total: 0
				};
				$.each( attribNames, function() {
					var curLevel = levels[this + 'Level'], trainLevel = levelTrain[this];
					if ( curLevel > trainLevel ) {
						cost[this] = levelCost[this][curLevel] - levelCost[this][trainLevel];
						cost.total += cost[this];
					}
				} );
				return cost;
			};
			$.each( attribNames, function() {
				var accum = 0;
				levelCost[this][1] = 0;
				for ( var i = 1; i <= 100; i++ ) {
					accum += Math.floor( 4 * 10000 / trainLevels[i][train.stars + 4] );
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
					$result.html( optimizationAlertTemplate( {
						type: 'danger',
						message: calculated.message
					} ) );
				}
			};
			worker.postMessage( [ train, stations, [], [], false, 0 ] );
		} );

		// Spike
		var $spikeTemplate = $( '#spike-template' );
		var spikeTemplate = Handlebars.compile( $spikeTemplate.html() );
		$( '#spike-container' ).on( 'do-update', function( e ) {
			var $this = $( this );
			var hasTrain = {};
			var $prevSpike = $spikeTemplate;

			$( '.train-row' ).each( function() {
				var $train = $( this );

				var id = $train.data( 'id' );
				var type = parseInt( $train.find( '.train-select' ).val() );
				var text = makeTrainText( id, false );
				if ( !text ) {
					return;
				}
				hasTrain[id] = true;

				var $spike = $( '#spike-' + id );
				if ( $spike.length == 0 ) {
					$spike = $( spikeTemplate( {
						id: id
					} ) ).insertAfter( $prevSpike );

					$spike.find( '.spike-use' ).change( function( e ) {
						var isChecked = $( this ).is( ':checked' );
						$spike.find( '.spike-data' ).toggle( isChecked );
						if ( isChecked ) {
							// Make sure the list is correctly populated and resized
							$spike.find( '.station-list-select' ).trigger( 'do-update' );
						}
					} ).change();

					$spike.find( '.spike-copy' ).change( function( e ) {
						var $this = $( this );

						if ( $this.val() ) {
							var pieces = $this.val().split( '-' );
							if ( pieces.length == 4 ) {
								$spike.find( '.spike-depart' ).val( pieces[0] ).trigger( 'change' );
								$spike.find( '.spike-arrive' ).val( pieces[1] ).trigger( 'change' );
								$spike.find( '.spike-from' ).val( pieces[2] ).trigger( 'change' );
								$spike.find( '.spike-to' ).val( pieces[3] ).trigger( 'change' );
							}
							$this.val( '' );
						}
					} );

					$spike.find( '.station-list-select' ).change( function( e ) {
						var schemas = {};

						$( '.spike-row' ).each( function( e ) {
							var $this = $( this );
							var depart = $this.find( '.spike-depart' ).val();
							var arrive = $this.find( '.spike-arrive' ).val();
							var from = $this.find( '.spike-from' ).val();
							var to = $this.find( '.spike-to' ).val();

							if ( !depart || !arrive || !from || !to ) {
								return;
							}

							var key = depart + '-' + arrive + '-' + from + '-' + to;
							if ( schemas[key] ) {
								return
							}

							var text = '火车：' + stations[depart][1] + '→' + stations[arrive][1]
								+ ' | 客货：' + stations[from][1] + '→' + stations[to][1];
							schemas[key] = text;
						} );

						$( '.spike-copy' ).each( function( e ) {
							var $select = $( this );

							$select.empty();
							$( '<option/>' ).attr( 'value', '' ).text( '选择一个方案，或在下方填写' ).appendTo( $select );

							for ( var key in schemas ) {
								$( '<option/>' ).attr( 'value', key ).text( schemas[key] ).appendTo( $select );
							}
						} );
					} );
				}
				$prevSpike = $spike;

				$spike.find( '.spike-heading' ).text( text );

				var img = trains[type][10];
				var alt = trainNameByType( type );
				var $img = $spike.find( '.spike-img' );
				if ( img ) {
					var imgUrl = getTrainImageUrl( img );
					if ( imgUrl != $img.attr( 'src' ) ) {
						$img.attr( 'src', '' ).attr( 'alt', '' );
						$img.attr( 'src', imgUrl ).attr( 'alt', alt );
					}
				} else {
					$img.attr( 'src', '' ).attr( 'alt', '' );
				}
			} );

			$( '.spike-row' ).each( function() {
				var $this = $( this );
				if ( !hasTrain[$this.data( 'id' )] ) {
					$this.remove();
				}
			} );
		} ).trigger( 'do-update' );
		var spikeAlertTemplate = Handlebars.compile( $( '#spike-alert-template' ).html() );
		var spikeResultTemplate = Handlebars.compile( $( '#spike-result-template' ).html() );
		$( '#spike-calculate' ).prop( 'disabled', false ).click( function() {
			var $result = $( '#spike-result' ).empty();
			var spikes = [], errors = [];
			$( '.spike-row' ).each( function() {
				var $this = $( this );
				if ( $this.find( '.spike-use:checked' ).length == 0 ) {
					return;
				}
				var id = $this.data( 'id' );
				var heading = $this.find( '.spike-heading' ).text();
				var depart = $this.find( '.spike-depart' ).val();
				var arrive = $this.find( '.spike-arrive' ).val();
				var from = $this.find( '.spike-from' ).val();
				var to = $this.find( '.spike-to' ).val();

				if ( !depart || !arrive || !from || !to ) {
					errors.push( heading + '：请指定火车和客货的发到站，或取消使用该火车' );
					return;
				}

				if ( from == to ) {
					errors.push( heading + '：客货的始发站和终到站不能为同一站' );
					return;
				}

				if ( depart == to ) {
					errors.push( heading + '：无法将客货从其终到站运出' );
					return;
				}

				var path;
				if ( arrive == to ) {
					path = [ depart, arrive ];
				} else {
					path = [ depart, to, arrive ];
				}

				spikes.push( {
					id: id,
					text: heading,
					path: path,
					from: from,
					to: to
				} );
			} );
			if ( spikes.length == 0 ) {
				errors.push( '没有火车参与秒杀' );
			}
			if ( errors.length ) {
				$result.append( spikeAlertTemplate( {
					type: 'danger',
					messages: errors
				} ) );
				return;
			}

			$result.append( spikeAlertTemplate( {
				type: 'info',
				message: '正在计算，请稍候'
			} ) );

			var useStationsV = useStations();
			var coef = $( '#spike-saturday:checked' ).length > 0 ? 1.2 : 1;
			var penalty = parseInt( $( '#spike-penalty' ).val() ) || 0;
			var delay = ( parseInt( $( '#spike-delay' ).val() ) || 0 ) * 1000;
			var reverseRef = new Date( localData.runningTimeReverse ).getTime()
				- ( parseInt( $( '#spike-ahead' ).val() ) || 0 ) * 1000;

			var tasks = [], spikeResults = {}, taskIdx = 0, taskRecv = 0; // results keyed by train id

			$.each( spikes, function() {
				var spike = this;
				spikeResults[spike.id] = {
					text: spike.text
				};
				var $train = $( '#train-' + spike.id );

				// Incomplete trains don't appear in spikes
				var type = parseInt( $train.find( '.train-select' ).val() );
				var speed = parseInt( $train.find( '.train-attrib-value.train-attrib-speed' ).val() );
				var distance = parseInt( $train.find( '.train-attrib-value.train-attrib-distance' ).val() );
				var weight = parseInt( $train.find( '.train-attrib-value.train-attrib-weight' ).val() );
				var battery = parseInt( $train.find( '.train-attrib-value.train-attrib-battery' ).val() );

				var train = {
					speed: speed,
					distance: distance,
					weight: weight,
					battery: battery,
					stars: trains[type][3],
					loads: trains[type][8] + trains[type][9]
				};

				// Goods task:
				var goodsTrain = {
					speed: 1,
					distance: Number.MAX_VALUE,
					weight: 0,
					battery: Number.MAX_VALUE,
					stars: 1,
					loads: train.loads
				};
				var goodsPath = [ spike.from, spike.to ];
				tasks.push( {
					onmessage: function( e ) {
						spikeResults[spike.id].goods = e.data;
					},
					message: [
						goodsTrain, stations, goodsPath, goodsPath,
						false, 0, coef
					]
				} );

				// Train task:
				tasks.push( {
					onmessage: function( e ) {
						spikeResults[spike.id].train = e.data;
					},
					message: [
						train, stations, useStationsV, spike.path,
						true, penalty, coef
					]
				} );
			} );

			var showSpikeResults = function() {
				var errors = [], schedule = [];
				var totalCost = 0, totalGross = 0;
				$result.empty();
				for ( var spikeId in spikeResults ) {
					var spikeResult = spikeResults[spikeId];
					var spikeErrors = [];
					if ( !spikeResult.train.ok ) {
						spikeErrors.push( spikeResult.train.message );
					}
					if ( !spikeResult.goods.ok ) {
						// This shouldn't happen
						spikeErrors.push( spikeResult.goods.message );
					}
					if ( spikeErrors.length ) {
						errors.push( spikeResult.text + '：' + spikeErrors.join( '、' ) );
						continue;
					}

					totalCost += spikeResult.train.costCoins;
					totalGross += spikeResult.goods.totalGross;
					var reverse = reverseRef - spikeResult.train.runningTime * 1000;

					schedule.push( {
						depart: reverse,
						arrive: reverseRef,
						text: spikeResult.text,
						path: makePathText( spikeResult.train ),
						cost: spikeResult.train.costCoins
					} );
				}
				if ( schedule.length ) {
					schedule.sort( function( a, b ) {
						return a.depart - b.depart;
					} );
					for ( var i = schedule.length - 2; i >= 0; i-- ) {
						var gap = schedule[i + 1].depart - schedule[i].depart;
						if ( gap < delay ) {
							var diff = delay - gap;
							schedule[i].depart -= diff;
							schedule[i].arrive -= diff;
						}
					}
					var accumCost = 0;
					for ( var i = 0; i < schedule.length; i++ ) {
						accumCost += schedule[i].cost;
						schedule[i].accumCost = accumCost;
						schedule[i].departTime = new Date( schedule[i].depart ).toTimeString();
						schedule[i].arriveTime = new Date( schedule[i].arrive ).toTimeString();
					}
				} else {
					errors.push( '计算结果中没有数据' );
				}
				if ( errors.length ) {
					$result.append( spikeAlertTemplate( {
						type: schedule.length ? 'warning' : 'danger',
						messages: errors
					} ) );
				}
				if ( schedule.length ) {
					$result.append( spikeResultTemplate( {
						totalCost: totalCost,
						totalGross: totalGross,
						totalNet: totalGross - totalCost,
						schedule: schedule
					} ) );
				}
			};

			$.each( new Array( 4 ), function( i ) { // 4 workers
				var worker = new Worker( 'calculator.js' );
				var fetchedTask = taskIdx++;
				var next = function() {
					if ( fetchedTask >= tasks.length ) {
						worker.terminate();
					} else {
						worker.postMessage( tasks[fetchedTask].message );
					}
				};
				worker.onmessage = function( e ) {
					tasks[fetchedTask].onmessage( e );
					taskRecv++;
					if ( taskRecv == tasks.length ) {
						showSpikeResults();
					} else {
						fetchedTask = taskIdx++;
						next();
					}
				};
				next();
			} );
		} );

		// Dump
		var dumpCSV = function( jsArray, filename ) {
			var csv = Papa.unparse( jsArray );
			var blob = new Blob( [ csv ], { type: 'text/csv;charset=utf-8' } );
			saveAs( blob, filename );
		};
		var dumpItems = {
			all_trains: function() {
				var data = [
					[ '名称', '描述', '星级', '客运仓位', '货运仓位', '速度', '距离', '重量', '电量' ]
					.concat( localData.trainImageRoot ? [ '图片' ] : [] )
					.concat( [ '整车点卷', localData.currencyName + '价格', '车头点卷', '车厢点卷', '底盘点卷', '图纸点卷' ] )
				];
				$.each( trains, function() {
					data.push(
						[ this[1], this[2], this[3], this[8], this[9], this[5], this[4], this[6], this[7] ]
						.concat( localData.trainImageRoot ? [ this[10] ? localData.trainImageRoot + this[10] : '' ] : [] )
						.concat( [ this[12] || '', this[13] || '', trainParts[this[28]][6],
						trainParts[this[26]][6], trainParts[this[27]][6], trainParts[this[29]][6] ] )
					);
				} );
				return dumpCSV( data, 'all_trains.csv' );
			},
			all_stations: function() {
				var data = [
					[ '名称', '描述', '下辖', '星级', 'X坐标', 'Y坐标', '人口', '国家', '类型' ]
				];
				$.each( stations, function() {
					data.push( [
						this[1], this[2], this[9], this[4], this[5], this[6], this[7],
						stationCountryById[this[8] ? this[8].replace( 'q_', '' ) : 0],
						stationTypeById[this[10]]
					] );
				} );
				return dumpCSV( data, 'all_stations.csv' );
			},
			trains: function() {
				var data = [
					[ '名称', '速度', '速度等级', '距离', '距离等级', '重量', '重量等级', '电量', '电量等级' ]
				];
				$( '.train-row' ).each( function() {
					var $train = $( this );

					var type = parseInt( $train.find( '.train-select' ).val() );
					var name = trainNameByType( type );

					var speed = parseInt( $train.find( '.train-attrib-value.train-attrib-speed' ).val() );
					var distance = parseInt( $train.find( '.train-attrib-value.train-attrib-distance' ).val() );
					var weight = parseInt( $train.find( '.train-attrib-value.train-attrib-weight' ).val() );
					var battery = parseInt( $train.find( '.train-attrib-value.train-attrib-battery' ).val() );
					var speedLevel = parseInt( $train.find( '.train-attrib-level.train-attrib-speed' ).val() );
					var distanceLevel = parseInt( $train.find( '.train-attrib-level.train-attrib-distance' ).val() );
					var weightLevel = parseInt( $train.find( '.train-attrib-level.train-attrib-weight' ).val() );
					var batteryLevel = parseInt( $train.find( '.train-attrib-level.train-attrib-battery' ).val() );

					data.push( [
						name, speed, speedLevel, distance, distanceLevel, weight, weightLevel, battery, batteryLevel
					] );
				} );
				return dumpCSV( data, 'trains.csv' );
			}
		};
		$( '#dump-exec' ).prop( 'disabled', false ).click( function() {
			var item = $( '#dump-select' ).val();
			var exec = dumpItems[item];
			if ( $.isFunction( exec ) ) {
				exec();
			}
		} );

		// Analytics
		var analyticsAlertTemplate = Handlebars.compile( $( '#analytics-alert-template' ).html() );
		var analyticsPcapProgressTemplate = Handlebars.compile( $( '#analytics-pcap-progress-template' ).html() );
		var analyticsGarageTrainTemplate = Handlebars.compile( $( '#analytics-garage-train-template' ).html() );
		var analyticsLootTemplate = Handlebars.compile( $( '#analytics-loot-template' ).html() );
		$( '#analytics-exec' ).prop( 'disabled', false ).click( function() {
			var pcaps = $( '#analytics-pcap' ).prop( 'files' );
			var selects = $( '#analytics-select' ).val();
			var $result = $( '<div/>' ).appendTo( $( '#analytics-result' ).empty() );
			if ( pcaps.length == 0 || !selects ) {
				$result.append( analyticsAlertTemplate( {
					type: 'danger',
					message: '请选择文件和项目'
				} ) );
				return;
			}
			var items = {};
			$.each( selects, function() {
				items[this] = true;
			} );

			var $resultMessages = $( '<div/>' ).appendTo( $result );
			var $resultOutput = $( '<div/>' ).appendTo( $result );

			$resultOutput.append( analyticsAlertTemplate( {
				type: 'info',
				'class': 'analytics-executing',
				message: '正在分析，请稍候'
			} ) );
			var $analyticsExecutingExtra = $( '<span/>' ).appendTo( '.analytics-executing' )

			var safeLog = function( val ) {
				return val ? val / Math.abs( val ) * Math.sqrt( Math.sqrt( Math.abs( val ) ) ) : 0;
			};
			var safeExp = function( val ) {
				if ( val >= -1 && val <= 1 ) {
					return val;
				}
				return val ? val / Math.abs( val ) * Math.round( val * val * val * val ) : 0;
			};
			var drawProfit = function( $dom, data, userInfo ) {
				var myData = [ 'my' ], opData = [ 'op' ], dates = [ 'x' ], date = new Date();
				var myDataDiff = [ 'my-diff', null ], opDataDiff = [ 'op-diff', null ];
				var usersByDate = {};
				data.sort( function( a, b ) {
					return a.date.getTime() - b.date.getTime();
				} );
				$.each( data, function( idx ) {
					date = this.date;
					dates.push( date.getFullYear()
						+ '-' + ( date.getMonth() + 1 )
						+ '-' + date.getDate()
						+ ' ' + date.getHours()
						+ ':' + date.getMinutes()
						+ ':' + date.getSeconds()
					);
					myData.push( this.me.profit );
					opData.push( this.oppo.profit );
					if ( idx > 0 ) {
						myDataDiff.push( safeLog( this.me.profit - data[idx - 1].me.profit ) );
						opDataDiff.push( safeLog( this.oppo.profit - data[idx - 1].oppo.profit ) );
					}
					usersByDate[date.getTime() - ( date.getTime() % 1000 )] = {
						me: this.me.user,
						op: this.oppo.user
					};
				} );
				var tzOffset = -( date.getTimezoneOffset() / 60 );
				if ( tzOffset > 0 ) {
					tzOffset = '+' + tzOffset;
				} else if ( tzOffset == 0 ) {
					tzOffset = '';
				}
				return c3.generate( {
					bindto: $dom.get( 0 ),
					data: {
						x: 'x',
						xFormat: '%Y-%m-%d %H:%M:%S',
						columns: [ dates, myData, opData, myDataDiff, opDataDiff ],
						names: {
							'my': '我的收入',
							'op': '对手收入',
							'my-diff': '我的收入变化',
							'op-diff': '对手收入变化'
						},
						axes: {
							'my': 'y',
							'op': 'y',
							'my-diff': 'y2',
							'op-diff': 'y2'
						}
					},
					axis: {
						x: {
							label: 'UTC' + tzOffset,
							type: 'timeseries',
							tick: {
								fit: false,
								format: '%H:%M:%S'
							}
						},
						y: {
							inner: true
						},
						y2: {
							show: true,
							inner: true,
							tick: {
								values: [ 0 ]
							}
						}
					},
					tooltip: {
						format: {
							title: function( d ) {
								var me = usersByDate[d.getTime()].me;
								var op = usersByDate[d.getTime()].op;
								var meText = '公司' + me, opText = '公司' + op;
								if ( userInfo[me] ) {
									meText = '<img src="' + userInfo[me].avatar
											.replace( /&/g, '&amp;').replace( /"/g, '&quot;')
										+ '"> '
										+ $( '<span/>' ).text( userInfo[me].name ).html()
										+ '（' + meText + '）';
								}
								if ( userInfo[op] ) {
									opText = '<img src="' + userInfo[op].avatar
											.replace( /&/g, '&amp;').replace( /"/g, '&quot;')
										+ '"> '
										+ $( '<span/>' ).text( userInfo[op].name ).html()
										+ '（' + opText + '）';
								}
								return d.toString() + '<br>' + meText + ' - ' + opText;
							},
							value: function( value, ratio, id, index ) {
								if ( id == 'my-diff' || id == 'op-diff' ) {
									value = safeExp( value );
								}
								return value;
							}
						}
					}
				} );
			};

			var showGarage = function( $dom, data, userInfo ) {
				var $ul = $( '<ul/>' ).appendTo( $dom );
				$.each( data, function() {
					var userData = this;
					var userTrains = {};
					var userTrainList = [];
					$.each( userData.trains, function() {
						if ( userTrains[this] ) {
							userTrains[this] += 1;
						} else {
							userTrains[this] = 1;
						}
					} );
					$.each( userTrains, function( trainType, count ) {
						userTrainList.push( {
							name: trains[trainType] ? trains[trainType][1] : '（未知火车' + trainType + '）',
							count: count
						} );
					} );
					$( analyticsGarageTrainTemplate( $.extend( {}, userData, {
						userInfo: userInfo[userData.user],
						trainList: userTrainList
					} ) ) ).find( 'button' ).click( function( e ) {
						trainsBatchBegin();
						if ( $( this ).data( 'clear' ) ) {
							$( '.train-delete' ).trigger( 'click' );
						}
						$.each( userData.trains, function() {
							var train = trains[this];
							if ( !train ) {
								return;
							}
							var trainId = trainNextId;
							$( '#trains-new' ).trigger( 'click' );
							var $train = $( '#train-' + trainId );
							// train[0] is primitive but `this` is not.
							$train.find( '.train-select' ).val( train[0] ).trigger( 'change' );
						} );
						trainsBatchEnd();
					} ).end().appendTo( $ul );
				} );
			};

			var showLoot = function( $dom, data, userInfo ) {
				var hbData = {
					hasUserInfo: userInfo,
					data: []
				};
				$.each( data, function() {
					var userData = this;
					var userDataInfo = userInfo ? userInfo[userData.user] : null;
					hbData.data.push( {
						info: userDataInfo,
						data: userData
					} );
				} );
				hbData.data.sort( function( a, b ) {
					return a.data.rank - b.data.rank;
				} );
				$dom.append( analyticsLootTemplate( hbData ) );
			};

			var pcapCount = pcaps.length, pcapRecv = 0, data = {
				userInfo: {},
				profit: [],
				garage: [],
				loot: []
			}, dataArrays = [ 'profit', 'garage', 'loot' ];
			$.each( pcaps, function( pcapIdx ) {
				var worker = new Worker( 'analytics.js' );
				var file = this;
				var $pcapProgress = $( analyticsAlertTemplate( {
					type: 'info',
					'class': 'analytics-executing-pcap-' + pcapIdx,
					message: file.name + '进度：'
				} ) ).appendTo( $resultOutput );
				var $pcapProgressExtra = $( '<span/>' ).appendTo( '.analytics-executing-pcap-' + pcapIdx )
				worker.onmessage = function( e ) {
					if ( e.data.progress ) {
						$pcapProgressExtra.html( analyticsPcapProgressTemplate( e.data.progress ) );
						return;
					}
					if ( e.data.warning ) {
						$resultMessages.append( analyticsAlertTemplate( {
							type: 'warning',
							message: file.name + '：' + e.data.warning
						} ) );
						return;
					}
					$pcapProgress.remove();
					worker.terminate();
					pcapRecv++;
					if ( e.data.ok ) {
						if ( e.data.summary.crwebCount == 0 ) {
							$resultMessages.append( analyticsAlertTemplate( {
								type: 'warning',
								message: file.name + '中没有找到游戏数据流'
							} ) );
						}
						$.each( dataArrays, function() {
							if ( items[this] ) {
								data[this] = data[this].concat( e.data.data[this] );
							}
						} );
						$.each( e.data.data.userInfo, function( userId, userData ) {
							if ( !data.userInfo[userId] ||
								data.userInfo[userId].updated.getTime() < userData.updated.getTime()
							) {
								data.userInfo[userId] = userData;
							}
						} );
					} else {
						$resultMessages.append( analyticsAlertTemplate( {
							type: 'danger',
							message: file.name + '读取失败：' + e.data.message
						} ) );
					}
					$analyticsExecutingExtra.text( '（' + pcapRecv + ' / ' + pcapCount + '个文件已完成）' );
					if ( pcapCount == pcapRecv ) {
						$resultOutput.empty();
						if ( data.profit.length > 0 ) {
							drawProfit( $( '<div/>' ).appendTo( $resultOutput ), data.profit, data.userInfo );
						} else if ( items.profit ) {
							$resultOutput.append( analyticsAlertTemplate( {
								type: 'warning',
								message: '文件中没有找到可识别的天梯赛收入数据'
							} ) );
						}
						if ( data.garage.length > 0 ) {
							showGarage( $( '<div/>' ).appendTo( $resultOutput ), data.garage, data.userInfo );
						} else if ( items.garage ) {
							$resultOutput.append( analyticsAlertTemplate( {
								type: 'warning',
								message: '文件中没有找到可识别的车库数据'
							} ) );
						}
						if ( data.loot.length > 0 ) {
							showLoot( $( '<div/>' ).appendTo( $resultOutput ), data.loot,
								items.userInfo ? data.userInfo : null
							);
						} else if ( items.loot ) {
							$resultOutput.append( analyticsAlertTemplate( {
								type: 'warning',
								message: '文件中没有找到可识别的买路钱数据'
							} ) );
						}
					}
				};
				worker.postMessage( {
					file: file,
					items: items,
					server: localData.server
				} );
			} );
		} );

		// Shared
		$( 'body' ).on( 'do-update', '.train-list-select', function() {
			var $select = $( this );
			var val = $select.val();
			$select.empty();

			$( '.train-row' ).each( function() {
				var id = $( this ).data( 'id' );
				var text = makeTrainText( id, $select.data( 'negative' ) );
				if ( !text ) {
					return;
				}
				$( '<option/>' ).attr( 'value', id ).text( text ).appendTo( $select );
			} );

			$select.val( val ).trigger( 'change' );
			if ( $select.prop( 'multiple' ) ) {
				$select.attr( 'size', $select.find( 'option' ).length );
			}
		} ).find( '.train-list-select' ).trigger( 'do-update' );
		$( 'body' ).on( 'do-update', '.station-list-select', function() {
			var $select = $( this );
			var val = $select.val();
			try {
				$select.select2( 'destory' );
			} catch ( e ) {
				// before select2 gets initialized
			}
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
			$select.select2();
		} ).find( '.station-list-select' ).trigger( 'do-update' );

		if ( new Date().getDay() == 6 ) {
			$( '.saturday' ).prop( 'checked', true );
		}
	};

	$.getJSON( 'data/' + dataset + '.json', function( data ) {
		localData = data;
		readStaticData( 0 );
	} );
} );
