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
					$train.find( '.train-attrib-value' ).trigger( 'update' );
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
			} ).change();

			// Removal
			$train.find( '.train-delete' ).click( function() {
				$train.remove();
			} );

			// Values
			$train.find( '.train-attrib-value' ).on( 'update', function() {
				var $this = $( this ), attrib = $this.data( 'attrib' );
				var initial = parseInt( $train.find( '.train-attrib-initial.train-attrib-' + attrib ).val() );
				var level = parseInt( $train.find( '.train-attrib-level.train-attrib-' + attrib ).val() );
				if ( isNaN( initial ) || isNaN( level ) || !trainLevels[level] ) {
					$this.val( '' );
					return;
				}

				var value = Math.floor( initial * trainLevels[level][trainLevelAttribIdx[attrib]] / 1000 );
				$this.val( value );
			} ).trigger( 'update' );
			$train.find( '.train-attrib-initial, .train-attrib-level' ).change( function() {
				$train.find( '.train-attrib-value' ).trigger( 'update' );
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
			$checkbox.prop( 'checked', !$checkbox.prop( 'checked' ) );
		} );
		$stationsBody.find( 'input[type=checkbox]' ).click( function( e ) {
			e.stopPropagation();
		} );
		$( '#stations-select a' ).click( function( e ) {
			e.preventDefault();
			var $this = $( this );
			$stationsBody.find( 'input[type=checkbox][data-stars=' + $this.data( 'stars' ) + ']' )
				.prop( 'checked', $this.data( 'value' ) );
		} );
	};

	readStaticData( 0 );
} );
