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
			}
		};
		var inStationsBatch = false;
		var stationsUpdated = function() {
			if ( !inStationsBatch ) {
				localStorage['crwebToolkitStations_' + dataset] = JSON.stringify( serializeStations() );
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
		var trainNameByType = function( type ) {
			if ( type < 0 ) {
				return '自定义' + -type + '星级火车';
			} else {
				return trains[type][1];
			}
		};
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
						.attr( 'src', cloudServer + '/crweb/train_image/' + dataset + '/' + img )
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
							'<span title="'
							+ part[1].replace( /&/g, '&amp;').replace( /"/g, '&quot;')
							+ '">'
							+ trainPartsAbbr[this]
							+ '</span>：'
							+ part[6]
							+ '点卷'
						);
					} );
					// 3 = drawing is the last part above
					trainPriceText.push( '启用：' + part[6] + '点卷' );
					trainPriceText.push( '组装：' + ( Math.floor( part[6] / 2 ) + 1 ) + '点卷' );
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
			var dailyGross = 0, dailyNet = 0, onewayCost = 0;
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
					onewayCost: onewayCost
				} ) );
			};

			var wayPoints = $( '#route-waypoints li.ui-state-default' ).map( function() {
				return $( this ).data( 'id' );
			} ).get();
			var insert = $( '#route-insert:checked' ).length > 0;
			var penalty = parseInt( $( '#route-penalty' ).val() ) || 0;
			$.each( trainIds, function() {
				var trainId = this, trainText = $( '#route-train option[value=' + trainId + ']' ).text();
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
				if ( type < 0 ) {
					trainTextById[trainId] = trainNameByType( type );
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
							onewayCost += calculated.costCoins;
						}
						var runningTimeReverseRef = new Date( localData.runningTimeReverse );
						var runningTimeReverse = new Date(
							runningTimeReverseRef.getTime() - calculated.runningTime * 1000
						);
						$result.append( routeResultTemplate( {
							hasLoads: train.loads >= 0,
							path: makePathText( calculated ),
							totalDistance: calculated.totalDistance,
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
				};
				worker.postMessage( [
					train, stations, useStations(), wayPoints,
					insert, penalty
				] );
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
		$( '.station-list-select' ).on( 'do-update', function() {
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

		// Dump
		var dumpCSV = function( jsArray, filename ) {
			var csv = Papa.unparse( jsArray );
			var blob = new Blob( [ csv ], { type: 'text/csv;charset=utf-8' } );
			saveAs( blob, filename );
		};
		var dumpItems = {
			trains: function() {
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
				return dumpCSV( data, 'trains.csv' );
			},
			stations: function() {
				var data = [
					['名称', '描述', '下辖', '星级', 'X坐标', 'Y坐标', '人口', '国家', '类型' ]
				];
				$.each( stations, function() {
					data.push( [
						this[1], this[2], this[9], this[4], this[5], this[6], this[7],
						stationCountryById[this[8] ? this[8].replace( 'q_', '' ) : 0],
						stationTypeById[this[10]]
					] );
				} );
				return dumpCSV( data, 'stations.csv' );
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
		var analyticsProfitAlertTemplate = Handlebars.compile( $( '#analytics-profit-alert-template' ).html() );
		$( '#analytics-profit-exec' ).prop( 'disabled', false ).click( function() {
			var pcaps = $( '#analytics-profit-pcap' ).prop( 'files' );
			var $result = $( '<div/>' ).appendTo( $( '#analytics-profit-result' ).empty() );
			if ( pcaps.length == 0 ) {
				$result.append( analyticsProfitAlertTemplate( {
					type: 'danger',
					message: '请选择文件'
				} ) );
				return;
			}

			var $resultMessages = $( '<div/>' ).appendTo( $result );
			var $resultOutput = $( '<div/>' ).appendTo( $result );

			$resultOutput.append( analyticsProfitAlertTemplate( {
				type: 'info',
				message: '正在分析，请稍候'
			} ) );

			var drawProfit = function( $dom, data ) {
				var myData = [ 'my' ], opData = [ 'op' ], dates = [ 'x' ], date = new Date();
				$.each( data, function() {
					date = this[0];
					dates.push( date.getFullYear()
						+ '-' + ( date.getMonth() + 1 )
						+ '-' + date.getDate()
						+ ' ' + date.getHours()
						+ ':' + date.getMinutes()
						+ ':' + date.getSeconds()
					);
					myData.push( this[1] );
					opData.push( this[2] );
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
						columns: [ dates, myData, opData ],
						names: {
							'my': '我的收入',
							'op': '对手收入'
						},
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
						}
					},
					tooltip: {
						format: {
							title: function( d ) {
								return d.toString();
							}
						}
					}
				} );
			};

			var pcapCount = pcaps.length, pcapRecv = 0, data = [];
			$.each( pcaps, function() {
				var worker = new Worker( 'profit.js' );
				var file = this;
				worker.onmessage = function( e ) {
					worker.terminate();
					pcapRecv++;
					if ( e.data.ok ) {
						data = data.concat( e.data.data );
					} else {
						$resultMessages.append( analyticsProfitAlertTemplate( {
							type: 'danger',
							message: file.name + '读取失败：' + e.data.message,
						} ) );
					}
					if ( pcapCount == pcapRecv ) {
						$resultOutput.empty();
						if ( data.length > 0 ) {
							drawProfit( $resultOutput, data );
						} else {
							$resultOutput.append( analyticsProfitAlertTemplate( {
								type: 'warning',
								message: '文件中没有找到可识别的数据',
							} ) );
						}
					}
				};
				worker.postMessage( file );
			} );
		} );

		// Shared
		$( '.train-list-select' ).on( 'do-update', function() {
			var $select = $( this );
			var val = $select.val();
			$select.empty();

			$( '.train-row' ).each( function() {
				var $this = $( this );

				var id = $this.data( 'id' );
				var type = parseInt( $this.find( '.train-select' ).val() );
				if ( type < 0 && !$select.data( 'negative' ) ) {
					return;
				}
				var typeText = trainNameByType( type );
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

	$.getJSON( 'data/' + dataset + '.json', function( data ) {
		localData = data;
		readStaticData( 0 );
	} );
} );
