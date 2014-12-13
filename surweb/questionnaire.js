jQuery( function( $, undefined ) {
	var console = window.console || {
		log: function() {}
	};

	var questionRadioAnswer = '{1:007,2:100,3:007,4:100,5:100,6:075,7:037,8:100,9:100,10:100,11:100,12:100,13:100,14:100,15:017,16:127,17:057,18:017,19:100,20:017,21:017,22:017,23:100,24:100,25:100,26:017,27:100,28:100,29:100,30:017,31:017,32:100,33:100,34:100,35:100,36:087,37:017,38:017,39:017,40:017,41:100,42:017,43:100,44:017,45:017,46:017,47:100,48:100,49:100,50:100,51:017,52:017,53:100,54:100,55:017,56:017,57:100,58:100,59:100,60:100,61:100,62:100,63:017,64:017,65:087,66:057,67:017,68:017,69:100,70:097,71:100,72:100,73:017,74:017,75:017,76:067,77:117,101:226,102:205,103:211,104:224,105:216}';
	var otherAnswer = '{78:购票的方便程度/车站的旅客引导信息/进站上车的过程/,79:,80:,81:列车内的温度/出站的通道/车票的价格/}';

	var submit = function( frame, url, postData ) {
		var $form = $( '<form/>' ).attr( 'action', url ).attr( 'target', frame );

		if ( postData ) {
			$form.attr( 'method', 'post' );

			$.each( postData, function() {
				$( '<input type=hidden />' )
					.attr( 'name', this.name )
					.attr( 'value', this.value )
					.appendTo( $form );
			} );
		}

		frames[frame].location = 'about:blank';
		setTimeout( function() { // "Error: Permission denied to access property 'document'" otherwise
			$( frames[frame].document.body ).empty().append( '正在载入……' );

			$form.appendTo( 'body' );
			$form[0].submit();
			$form.remove();
		}, 0 );
	};

	$( '#user-submit' ).click( function( e ) {
		submit( 'user-frame', '//dynamic.12306.cn/surweb/registAction.do?method=sendSm', [
			{ name: 'userName', value: $( '#userName' ).val() },
			{ name: 'oldUserName', value: '' }
		] );
		ga( 'send', 'event', 'surweb', 'submit', 'user' );
	} );

	$( '#code-submit' ).click( function( e ) {
		submit( 'code-frame', '//dynamic.12306.cn/surweb/registAction.do?method=checkVc', [
			{ name: 'userName', value: $( '#userName' ).val() },
			{ name: 'vc', value: $( '#code' ).val() },
			{ name: 'seq_no', value: $( '#sequence' ).val() }
		] );
		ga( 'send', 'event', 'surweb', 'submit', 'code' );
	} );

	$( "#date" ).datepicker( $.extend( {}, $.datepicker.regional[ 'zh-CN' ], {
		altField: '#actualDate',
		altFormat: 'yy-mm-dd'
	} ) );

	var stationNameCodeMap = {};
	var stations = [];

	$.each( station_names.split( '@' ), function() {
		if ( this.length === 0 ) {
			return;
		}

		var pieces = this.split( '|' );
		var pinyin = pieces[0].toUpperCase();
		var name = pieces[1];
		var telecode = pieces[2].toUpperCase();

		stations.push( {
			name: name,
			pinyin: pinyin,
			telecode: telecode
		} );

		stationNameCodeMap[name] = telecode;
	} );

	$( '#depart, #arrive' ).autocomplete( {
		source: function( request, response ) {
			var term = request.term;

			var fields;
			if ( term[0] === '-' ) {
				fields = [ 'telecode' ];
				term = term.substring( 1 );
			} else {
				fields = [ 'pinyin', 'name' ];
			}

			if ( term.length === 0 ) {
				response( [] );
				return;
			}

			var regex = new RegExp( '^' + $.ui.autocomplete.escapeRegex( term ), 'i' );

			var results = [];
			var matched = {};

			$.each( fields, function() {
				var field = this;

				$.each( stations, function() {
					if ( matched[this.telecode] ) {
						return;
					}

					if ( regex.test( this[field] ) ) {
						matched[this.telecode] = true;

						results.push( {
							label: this.name + ' | ' + this.pinyin + ' | -' + this.telecode,
							value: this.name
						} );
					}
				} );
			} );

			response( results );
		}
	} ).keyup( function( e ) {
		var $this = $( this );

		$this.val( $this.val().toUpperCase() );
	} );

	$( '#form-submit' ).click( function( e ) {
		submit( 'form-frame', '//dynamic.12306.cn/surweb/questionnaireAction.do?method=submitQuest', [
			{ name: 'passengerInfoAnswer', value: '{'
				+ 'userName:' + $( '#userName' ).val() + ','
				+ 'datepicker:' + $( '#actualDate' ).val() + ','
				+ 'board_train_no:' + $( '#train' ).val() + ','
				+ 'board_station:' + stationNameCodeMap[ $( '#depart' ).val() ] + ','
				+ 'down_station:' + stationNameCodeMap[ $( '#arrive' ).val() ]
			+ '}' },
			{ name: 'questionRadioAnswer', value: questionRadioAnswer },
			{ name: 'otherAnswer', value: otherAnswer }
		] );
		ga( 'send', 'event', 'surweb', 'submit', 'form' );
	} );
} );
