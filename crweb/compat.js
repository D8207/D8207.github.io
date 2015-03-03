if ( !Modernizr.inputtypes.number
	|| !Modernizr.localstorage
	|| !Modernizr.webworkers
	|| !Modernizr.inlinesvg
	|| !window.Blob
) {
	if ( !confirm( '您的浏览器不支持此工具使用的全部技术，是否继续尝试打开？' ) ) {
		location.href = 'https://whatbrowser.org/';
	}
}
