jQuery( function( $, undefined ) {
	var console = window.console || {
		log: function() {}
	};

	var localStorage = window.localStorage || {};

	var initAnswers = false;
	if ( !localStorage.surwebAnswers ) {
		initAnswers = true;
	} else {
		try {
			var surwebAnswers = JSON.parse( localStorage.surwebAnswers );

			if ( !$.isArray( surwebAnswers ) || surwebAnswers.length === 0 ) {
				initAnswers = true;
			}
		} catch ( e ) {
			initAnswers = true;
		}
	}

	if ( initAnswers ) {
		localStorage.surwebAnswers = JSON.stringify( [
			{
				name: '（预置）',
				province: null,
				questionRadioAnswer: '{1:007,2:100,3:007,4:100,5:100,6:075,7:037,8:100,9:100,10:100,11:100,12:100,13:100,14:100,15:017,16:127,17:057,18:017,19:100,20:017,21:017,22:017,23:100,24:100,25:100,26:017,27:100,28:100,29:100,30:017,31:017,32:100,33:100,34:100,35:100,36:087,37:017,38:017,39:017,40:017,41:100,42:017,43:100,44:017,45:017,46:017,47:100,48:100,49:100,50:100,51:017,52:017,53:100,54:100,55:017,56:017,57:100,58:100,59:100,60:100,61:100,62:100,63:017,64:017,65:087,66:057,67:017,68:017,69:100,70:097,71:100,72:100,73:017,74:017,75:017,76:067,77:117,101:226,102:205,103:211,104:224,105:216}',
				otherAnswer: '{78:购票的方便程度/车站的旅客引导信息/进站上车的过程/,79:,80:,81:列车内的温度/出站的通道/车票的价格/}'
			}
		] );
	}

	var buildAnswerRadios = function() {
		var $answers = $( '#answers' ).empty();

		$.each( JSON.parse( localStorage.surwebAnswers ), function( i ) {
			$( '<label/>' )
				.addClass( 'btn btn-default' )
				.text( this.name )
				.prepend(
					$( '<input type=radio />' )
						.attr( 'name', 'answer' )
						.attr( 'value', i )
				)
				.appendTo( $answers );
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

		frames[frame].location = 'about:blank';
		setTimeout( function() { // "Error: Permission denied to access property 'document'" otherwise
			$( frames[frame].document.body ).empty().append( '正在载入……' );

			$form.appendTo( 'body' );
			$form[0].submit();
			$form.remove();
		}, 0 );
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
		var passengerInfoAnswer = {};
		var questionRadioAnswer = {};
		var otherAnswer = {};
		var questionMinNum = 1;
		var questionMaxNum = 105;

		// 12306
	 if($('#province').val()!='省份' && $('#prvcity_City').val()!='城市'){
		 passengerInfoAnswer["province"]=$('#province').val()+"/"+$('#prvcity_City').val();	 
	 }

     var qnum=questionMinNum;
     var size=0;
     while(qnum<=questionMaxNum){
    	size=$('input[name='+qnum+'][type=radio]:checked').size();
     	if(size>0){
     		questionRadioAnswer[qnum]=$('input[name='+qnum+'][type=radio]:checked').val();
 		}
    	qnum++;
	 }

var executeSave = ( function() {
    	var paramNum=1;
 	    var mostFocus="";
 	    var mostNotFocus="";
 	    var compareStr="";
 	    
 	    var mostFocus2="";
	    var mostNotFocus2="";
	    var compareStr2="";
 	    while(paramNum<=3){
 	    	if( $('#focus_question'+paramNum).val()!="问题"){
 	    			compareStr="_"+$('#focus_question'+paramNum).val()+"_";
 	    			compareStr2=$('#focus_question'+paramNum).val();
 	    			if(mostFocus.length>1){
 	    				if(mostFocus.indexOf(compareStr)>=0){
 	    					alert("最关注的3个问题不能重复，请重新选择!");
 	    					 return false;
 	    				}else{
 	    					mostFocus+=compareStr+"/";
 	    					mostFocus2+=compareStr2+"/";
 	    				}
 	    			}else{
 	    				mostFocus+=compareStr+"/";
 	    				mostFocus2+=compareStr2+"/";
 	    			}
 	    			
 		    }
 	    	if( $('#notFocus_question'+paramNum).val()!="问题"){
 	    		compareStr="_"+$('#notFocus_question'+paramNum).val()+"_";
 	    		compareStr2=$('#notFocus_question'+paramNum).val();
 	    		if(mostNotFocus.length>1){
	    				if(mostNotFocus.indexOf(compareStr)>=0){
	    					alert("最不关注的3个问题不能重复，请重新选择!");
	    					return false;
	    				}else{
	    					mostNotFocus+=compareStr+"/";
	    					mostNotFocus2+=compareStr2+"/";
	    				}
	    		}else{
	    			mostNotFocus+=compareStr+"/";
	    			mostNotFocus2+=compareStr2+"/";
	    		}
 		    }
 	    	paramNum++;
 	    }
 	    
 	   if(mostFocus.length==0){
		    alert("请对问题78做出选择!");
			return false;
	   }else{
		   var mostFocusArray=new Array();
		   mostFocusArray=mostFocus.split("/");
		   if(mostFocusArray.length!=4){
			   alert("请选择您最关注的3个问题!");
			   return false;
		   }
	   }
 	    
 	    if(mostFocus.length>1){
 	    	 var showMsg=false;
 	    	 var mostFocusArray=mostFocus.split("/"); //最关注的3个问题必须都选
 	    	 if(mostNotFocus.length>1){
	 	    		var mostNotFocusArray=mostNotFocus.split("/");
	 	    		$.each(mostFocusArray,function(index,focus){
	 	    			$.each(mostNotFocusArray,function(index,notfocus){
	 	    				if(notfocus!=""){
	 	    					if(focus==notfocus){
	 	 	 	    				showMsg=true;
	 	 	 	    			 }
	 	 	 	    			 if(showMsg){
	 	 	 	    				 return false; //退出each
	 	 	 	    			 }
	 	    				}
	 	 	    			 
	 	 	    		});
	 	    			
	 	    			if(showMsg){
	 	    				return false;
	 	    			}
	 	    		});
	 	    	 }
	 	    	 
	 	        if(showMsg){
	 	        	alert("最关注问题和最不关注问题不能重复，请重新选择!");
				    return false;
	 	        }
 	    	
 	    }
 	    
 	    //最满意、不满意
 	    paramNum=1;
	    var mostSatisfild="";
	    var mostNotSatisfild="";
	    
	    var mostSatisfild2="";
	    var mostNotSatisfild2="";
	  
 	   while(paramNum<=3){
	    	if( $('#satisfild_question'+paramNum).val()!="问题"){
	    			compareStr="_"+$('#satisfild_question'+paramNum).val()+"_";
	    			compareStr2=$('#satisfild_question'+paramNum).val();
	    			if(mostSatisfild.length>1){
	    				if(mostSatisfild.indexOf(compareStr)>=0){
	    					alert("最满意的3个问题不能重复，请重新选择!");
	    					 return false;
	    				}else{
	    					mostSatisfild+=compareStr+"/";
	    					mostSatisfild2+=compareStr2+"/";
	    				}
	    			}else{
	    				mostSatisfild+=compareStr+"/";
	    				mostSatisfild2+=compareStr2+"/";
	    			}
	    			
		    }
	    	if( $('#notSatisfild_question'+paramNum).val()!="问题"){
	    		compareStr="_"+$('#notSatisfild_question'+paramNum).val()+"_";
	    		compareStr2=$('#notSatisfild_question'+paramNum).val();
	    		if(mostNotSatisfild.length>1){
	    				if(mostNotSatisfild.indexOf(compareStr)>=0){
	    					alert("最不满意的3个问题不能重复，请重新选择!");
	    					return false;
	    				}else{
	    					mostNotSatisfild+=compareStr+"/";
	    					mostNotSatisfild2+=compareStr2+"/";
	    				}
	    		}else{
	    			mostNotSatisfild+=compareStr+"/";
	    			mostNotSatisfild2+=compareStr2+"/";
	    		}
		    }
	    	paramNum++;
	    }
 	   
	 	  if(mostNotSatisfild.length==0){
	 		    alert("请对问题81做出选择!");
				return false;
	 	  }
	    if(mostSatisfild.length>1){
	    	 var showMsg=false;
	    	 var mostSatisfildArray=mostSatisfild.split("/");
	    	 
	    	 if(mostNotSatisfild.length>1){
	    		var mostNotSatisfildArray=mostNotSatisfild.split("/");
	    		$.each(mostSatisfildArray,function(index,satisfild){
	    			$.each(mostNotSatisfildArray,function(index,notSatisfild){
	    				if(notSatisfild!=""){
	    					if(satisfild==notSatisfild){
	 	 	    				showMsg=true;
	 	 	    			 }
	 	 	    			 if(showMsg){
	 	 	    				 return false; //退出each
	 	 	    			 }
	    				}
	 	    			 
	 	    		});
	    			
	    			if(showMsg){
	    				return false;
	    			}
	    		});
	    	 }
	    	 
	        if(showMsg){
	        	alert("最满意问题和最不满意问题不能重复，请重新选择!");
			    return false;
	        }
	    }
 	
 	    
 	    
	    
	    /*var qnum=questionMinNum;
	    while(qnum<=questionMaxNum){
	    	size=$('input[name='+qnum+'][type=radio]:checked').size();
	    	if(size>0){
	    		questionRadioAnswer[qnum]=$('input[name='+qnum+'][type=radio]:checked').val();
			}
	    	
	    	qnum++;
	    }*/
	    
	    //最关注，最不关注,以/分割
	  
	    
	    otherAnswer[78]=mostFocus2;
	    otherAnswer[79]=mostNotFocus2;
	    
	    
	    otherAnswer[80]=mostSatisfild2;
	    otherAnswer[81]=mostNotSatisfild2;
	    
	    return true;
} )();
		// /12306

		if ( !executeSave ) {
			return;
		}

		var surwebAnswers = JSON.parse( localStorage.surwebAnswers );
		var surwebAnswer = {
			name: $( '#answers-name' ).val(),
			province: passengerInfoAnswer.province,
			questionRadioAnswer: obj2str( questionRadioAnswer ),
			otherAnswer: obj2str( otherAnswer )
		};

		surwebAnswers.push( surwebAnswer );
		localStorage.surwebAnswers = JSON.stringify( surwebAnswers );

		$( '#answers-form' ).modal( 'hide' );
		buildAnswerRadios();
	} );

	$( '#answers-delete' ).click( function( e ) {
		var index = $('input[name=answer]:checked').val();

		if ( index === undefined ) {
			return;
		}

		var surwebAnswers = JSON.parse( localStorage.surwebAnswers );
		surwebAnswers.splice( parseInt( index ), 1 );
		localStorage.surwebAnswers = JSON.stringify( surwebAnswers );

		buildAnswerRadios();
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
	} ).keyup( function( e ) {
		var $this = $( this );

		$this.val( $this.val().toUpperCase() );
	} );

	$( '#form-submit' ).click( function( e ) {
		var surwebAnswer = {};

		var index = $('input[name=answer]:checked').val();
		if ( index !== undefined ) {
			var surwebAnswers = JSON.parse( localStorage.surwebAnswers );
			surwebAnswer = surwebAnswers[ parseInt( index ) ];
		}

		var passengerInfoAnswer = {
			userName: $( '#userName' ).val(),
			datepicker: $( '#actualDate' ).val(),
			board_train_no: $( '#train' ).val(),
			board_station: stationNameCodeMap[ $( '#depart' ).val() ],
			down_station: stationNameCodeMap[ $( '#arrive' ).val() ]
		};

		if ( surwebAnswer.province ) {
			passengerInfoAnswer.province = surwebAnswer.province;
		}

		submit( 'form-frame', '//kyfw.12306.cn/surweb/questionnaireAction.do?method=submitQuest', [
			{ name: 'passengerInfoAnswer', value: obj2str( passengerInfoAnswer ) },
			{ name: 'questionRadioAnswer', value: surwebAnswer.questionRadioAnswer },
			{ name: 'otherAnswer', value: surwebAnswer.otherAnswer }
		] );
		ga( 'send', 'event', 'surweb', 'submit', 'form' );
	} );
} );
