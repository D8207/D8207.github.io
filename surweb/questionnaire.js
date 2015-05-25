---
---

if ( !window.station_names ) {
	if ( confirm(
		'无法从 kyfw.12306.cn 读取数据，这可能是由于 kyfw.12306.cn 的证书错误导致。\n\n'
		+ '请确认您可正常使用 kyfw.12306.cn 后再使用此工具。现在前往 kyfw.12306.cn 以检查？'
	) ) {
		location = '//kyfw.12306.cn/otn/';
	} else {
		window.station_names = '';
	}
}

jQuery( function( $, undefined ) {
	var console = window.console || {
		log: function() {}
	};

	var localStorage = window.localStorage || {};

	var initAnswers = false;
	var surwebAnswersKey = 'surwebAnswersV2';
	if ( !localStorage[surwebAnswersKey] ) {
		initAnswers = true;
	} else {
		try {
			var surwebAnswers = JSON.parse( localStorage[surwebAnswersKey] );

			if ( !$.isArray( surwebAnswers ) || surwebAnswers.length === 0 ) {
				initAnswers = true;
			}
		} catch ( e ) {
			initAnswers = true;
		}
	}

	if ( initAnswers ) {
		localStorage[surwebAnswersKey] = JSON.stringify( [
			{
				name: '（预置）',
				data: {"passengerInfoAnswer":{},"questionRadioAnswer":{"1":"004","3":"004","6":"004","12":"004","13":"004","14":"004","15":"004","16":"004","17":"004","18":"004","23":"004","24":"004","27":"004","28":"004","29":"004","31":"004","33":"004","34":"004","35":"004","38":"004","41":"004","46":"004","47":"004","48":"004","49":"004","50":"004","51":"004","52":"004","53":"004","54":"004"},"otherAnswer":{"55":"购票的方便程度/车站的引导信息/站台的等待秩序/","56":"","57":"列车内的温度/出站的旅客引导信息/列车正点到达情况/"}},
			}
		] );
	}

	var buildAnswerRadios = function( selected ) {
		var $answers = $( '#answers' ).empty();

		$.each( JSON.parse( localStorage[surwebAnswersKey] ), function( i ) {
			var $radio = $( '<input type=radio />' )
				.attr( 'name', 'answer' )
				.attr( 'value', i );

			var $label = $( '<label/>' )
				.addClass( 'btn btn-default' )
				.text( $.trim( this.name ) || '\u00A0' ) // nbsp
				.prepend( $radio )
				.appendTo( $answers );

			if ( i === selected ) {
				$radio.prop( 'checked', true );
				$label.addClass( 'active' );
			}
		} );
	};

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

		$( 'iframe[name=' + frame + ']' ).on( 'load', function( e ) {
			$( frames[frame].document.body ).empty().append( '正在载入……' );
			$( this ).off( 'load' );

			$form.appendTo( 'body' );
			$form[0].submit();
			$form.remove();
		} ).attr( 'src', 'about:blank' );
	};

	$( '#user-submit' ).click( function( e ) {
		submit( 'user-frame', '//kyfw.12306.cn/surweb/registAction.do?method=sendSm', [
			{ name: 'userName', value: $( '#userName' ).val() },
			{ name: 'oldUserName', value: '' }
		] );
		ga( 'send', 'event', 'surweb', 'submit', 'user' );
	} );

	$( '#code-submit' ).click( function( e ) {
		submit( 'code-frame', '//kyfw.12306.cn/surweb/registAction.do?method=checkVc', [
			{ name: 'userName', value: $( '#userName' ).val() },
			{ name: 'vc', value: $( '#code' ).val() },
			{ name: 'seq_no', value: $( '#sequence' ).val() }
		] );
		ga( 'send', 'event', 'surweb', 'submit', 'code' );
	} );

	buildAnswerRadios();

	$( '#answers-new' ).click( function( e ) {
		ga( 'send', 'event', 'surweb', 'answers', 'new' );
	} );

	$( '#answers-save' ).click( function( e ) {
		var passengerInfoAnswer = {};
		var questionRadioAnswer = {};
		var otherAnswer = {};
		var questionMinNum = 0;
		var questionMaxNum = 105;

		// 12306
		{% include surweb/answers-form.js %}
		// /12306

		if ( !executeSave ) {
			ga( 'send', 'event', 'surweb', 'answers', 'reject' );

			return;
		}

		var surwebAnswers = JSON.parse( localStorage[surwebAnswersKey] );
		var surwebAnswer = {
			name: $( '#answers-name' ).val(),
			data: {
				passengerInfoAnswer: passengerInfoAnswer,
				questionRadioAnswer: questionRadioAnswer,
				otherAnswer: otherAnswer
			}
		};

		surwebAnswers.push( surwebAnswer );
		localStorage[surwebAnswersKey] = JSON.stringify( surwebAnswers );

		$( '#answers-form' ).modal( 'hide' );
		buildAnswerRadios( surwebAnswers.length - 1 );

		ga( 'send', 'event', 'surweb', 'answers', 'save' );
	} );

	$( '#answers-delete' ).click( function( e ) {
		var index = $('input[name=answer]:checked').val();

		if ( index === undefined ) {
			return;
		}

		var surwebAnswers = JSON.parse( localStorage[surwebAnswersKey] );
		surwebAnswers.splice( parseInt( index ), 1 );
		localStorage[surwebAnswersKey] = JSON.stringify( surwebAnswers );

		buildAnswerRadios();

		ga( 'send', 'event', 'surweb', 'answers', 'delete' );
	} );

	var $date;
	if ( Modernizr.inputtypes.date ) {
		$date = $( '#date' );
	} else {
		$( "#date" ).datepicker( $.extend( {}, $.datepicker.regional[ 'zh-CN' ], {
			altField: '#actualDate',
			altFormat: 'yy-mm-dd'
		} ) );
		$date = $( '#actualDate' );
	}

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
			if ( term.charAt(0) === '-' ) {
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

						results.push( this );
					}
				} );
			} );

			response( results );
		}
	} ).each( function() {
		$( this ).autocomplete( 'instance' )._renderItem = function( ul, item ) {
			item.value = item.name;

			return $( '<li/>' )
				.append( $( '<div/>' ).text( item.name ) )
				.append( $( '<div/>' ).text( item.pinyin ) )
				.append( $( '<div/>' ).text( '-' + item.telecode ) )
				.appendTo( ul );
		};
	} ).add( '#train' ).keyup( function( e ) {
		var $this = $( this );

		var oldVal = $this.val();
		var newVal = oldVal.toUpperCase();
		if ( oldVal !== newVal ) {
			$this.val( newVal );
		}
	} );

	$( '#form-submit' ).click( function( e ) {
		var surwebAnswer = {};

		var index = $('input[name=answer]:checked').val();
		if ( index !== undefined ) {
			var surwebAnswers = JSON.parse( localStorage[surwebAnswersKey] );
			surwebAnswer = surwebAnswers[ parseInt( index ) ];
		}

		var data = {
			passengerInfoAnswer: {
				userName: $( '#userName' ).val(),
				datepicker: $date.val(),
				board_train_no: $( '#train' ).val(),
				board_station: stationNameCodeMap[ $( '#depart' ).val() ],
				down_station: stationNameCodeMap[ $( '#arrive' ).val() ]
			}
		};

		data = $.extend( true, {}, surwebAnswer.data, data );

		submit( 'form-frame', '//kyfw.12306.cn/surweb/questionnaireAction.do?method=submitQuest', [
			{ name: 'passengerInfoAnswer', value: obj2str( data.passengerInfoAnswer ) },
			{ name: 'questionRadioAnswer', value: obj2str( data.questionRadioAnswer ) },
			{ name: 'otherAnswer', value: obj2str( data.otherAnswer ) }
		] );
		ga( 'send', 'event', 'surweb', 'submit', 'form' );
	} );
} );
