	 if($('#province').val()!='省份' && $('#prvcity_City').val()!='城市'){
		 passengerInfoAnswer["province"]=$('#province').val()+"/"+$('#prvcity_City').val();	 
	 }

     var qnum=questionMinNum;
     var size=0;
     while(qnum<=questionMaxNum){
    	qnum++;
    	if(qnum==103){//年龄段
    		continue;
    	}
    	size=$('input[name='+qnum+'][type=radio]:checked').size();
     	if(size>0){
     		questionRadioAnswer[qnum]=$('input[name='+qnum+'][type=radio]:checked').val();
 		}
    	
	 }

var executeSave = ( function() {
	
    	var paramNum=1;
 	    var mostFocus="";
 	    var mostNotFocus="";
 	    var compareStr="";
 	    
 	    var mostFocus2="";
	    //var mostNotFocus2="";
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
 	    	/*if( $('#notFocus_question'+paramNum).val()!="问题"){
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
 		    }*/
 	    	paramNum++;
 	    }
 	    
 	   if(mostFocus.length==0){
		    alert("请对问题55做出选择!");
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
	 		    alert("请对问题57做出选择!");
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
	  
	    
	    otherAnswer[55]=mostFocus2;
	    //otherAnswer[79]=mostNotFocus2;
	    
	    
	    otherAnswer[56]=mostSatisfild2;
	    otherAnswer[57]=mostNotSatisfild2;
	    
	    return true;
} )() && ( function() {
		var requiredNum=answer_required.split("_");
		var ansValid=false;
		$.each(requiredNum,function(n,value){
			if(value==""){
				ansValid=true;
				return true;
			}else{
				if(questionRadioAnswer[value]==null || questionRadioAnswer[value]=="" || questionRadioAnswer[value]=="undefined"){
					alert("请对问题"+value+"做出选择!");
				    return false;
				}else if(!ansValid && questionRadioAnswer[value]!="100"){
					ansValid=true;
				}
			}
			
		
		});
		if(!ansValid){
			alert("必选项不能都是[未关注]，请您重新选择!");
		    return false;
		}
		
		
		return true;
} )();
