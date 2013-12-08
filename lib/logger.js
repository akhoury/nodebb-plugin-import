module.exports = {
	init: function(level){
		this.l = level || "error"; // default is only errors, or if .log is forced
		this.p = "[import]"; // prefix
		this.d = this.l.indexOf("debug") >= 0;
		this.i = this.l.indexOf("info") >= 0;
		this.w = this.l.indexOf("warn") >= 0;
		this.e = this.l.indexOf("error") >= 0;
		//rules
		this.i = this.d || this.i;
		this.w = this.d || this.w;
		// basically always true
		this.e = this.d || this.e || this.i || this.w;

		if (!this.i)
			this.info = function(){};
		if (!this.w)
			this.warn = function(){};
		if (!this.d)
			this.debug = function(){};
		if (!this.e)
			this.error = function(){};

		return this;
	},
	log: function(s) {
		console.log(s);
	},
	error: function(s) {
		console.log(this.p + "[error] " + s);
	},
	warn: function(s) {
		console.log(this.p + "[warn] " + s);
	},
	info: function(s) {
		console.log(this.p + "[info] " + s);
	},
	debug: function(s) {
		console.log(this.p + "[debug] " + s);
	}
};