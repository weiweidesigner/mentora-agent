//#region \0rolldown/runtime.js
var e = Object.create, t = Object.defineProperty, n = Object.getOwnPropertyDescriptor, r = Object.getOwnPropertyNames, i = Object.getPrototypeOf, a = Object.prototype.hasOwnProperty, o = (e, t) => () => (t || (e((t = { exports: {} }).exports, t), e = null), t.exports), s = (e, i, o, s) => {
	if (i && typeof i == "object" || typeof i == "function") for (var c = r(i), l = 0, u = c.length, d; l < u; l++) d = c[l], !a.call(e, d) && d !== o && t(e, d, {
		get: ((e) => i[e]).bind(null, d),
		enumerable: !(s = n(i, d)) || s.enumerable
	});
	return e;
}, c = (n, r, o) => (o = n == null ? {} : e(i(n)), s(r || !n || !n.__esModule || !a.call(n, "default") ? t(o, "default", {
	value: n,
	enumerable: !0
}) : o, n)), l = /* @__PURE__ */ o(((e) => {
	var t = Symbol.for("react.transitional.element"), n = Symbol.for("react.portal"), r = Symbol.for("react.fragment"), i = Symbol.for("react.strict_mode"), a = Symbol.for("react.profiler"), o = Symbol.for("react.consumer"), s = Symbol.for("react.context"), c = Symbol.for("react.forward_ref"), l = Symbol.for("react.suspense"), u = Symbol.for("react.memo"), d = Symbol.for("react.lazy"), f = Symbol.for("react.activity"), p = Symbol.for("react.view_transition"), m = Symbol.iterator;
	function h(e) {
		return typeof e != "object" || !e ? null : (e = m && e[m] || e["@@iterator"], typeof e == "function" ? e : null);
	}
	var g = {
		isMounted: function() {
			return !1;
		},
		enqueueForceUpdate: function() {},
		enqueueReplaceState: function() {},
		enqueueSetState: function() {}
	}, _ = Object.assign, v = {};
	function y(e, t, n) {
		this.props = e, this.context = t, this.refs = v, this.updater = n || g;
	}
	y.prototype.isReactComponent = {}, y.prototype.setState = function(e, t) {
		if (typeof e != "object" && typeof e != "function" && e != null) throw Error("takes an object of state variables to update or a function which returns an object of state variables.");
		this.updater.enqueueSetState(this, e, t, "setState");
	}, y.prototype.forceUpdate = function(e) {
		this.updater.enqueueForceUpdate(this, e, "forceUpdate");
	};
	function b() {}
	b.prototype = y.prototype;
	function ee(e, t, n) {
		this.props = e, this.context = t, this.refs = v, this.updater = n || g;
	}
	var x = ee.prototype = new b();
	x.constructor = ee, _(x, y.prototype), x.isPureReactComponent = !0;
	var te = Array.isArray;
	function ne() {}
	var S = {
		H: null,
		A: null,
		T: null,
		S: null
	}, re = Object.prototype.hasOwnProperty;
	function C(e, n, r) {
		var i = r.ref;
		return {
			$$typeof: t,
			type: e,
			key: n,
			ref: i === void 0 ? null : i,
			props: r
		};
	}
	function ie(e, t) {
		return C(e.type, t, e.props);
	}
	function ae(e) {
		return typeof e == "object" && !!e && e.$$typeof === t;
	}
	function oe(e) {
		var t = {
			"=": "=0",
			":": "=2"
		};
		return "$" + e.replace(/[=:]/g, function(e) {
			return t[e];
		});
	}
	var w = /\/+/g;
	function se(e, t) {
		return typeof e == "object" && e && e.key != null ? oe("" + e.key) : t.toString(36);
	}
	function ce(e) {
		switch (e.status) {
			case "fulfilled": return e.value;
			case "rejected": throw e.reason;
			default: switch (typeof e.status == "string" ? e.then(ne, ne) : (e.status = "pending", e.then(function(t) {
				e.status === "pending" && (e.status = "fulfilled", e.value = t);
			}, function(t) {
				e.status === "pending" && (e.status = "rejected", e.reason = t);
			})), e.status) {
				case "fulfilled": return e.value;
				case "rejected": throw e.reason;
			}
		}
		throw e;
	}
	function le(e, r, i, a, o) {
		var s = typeof e;
		(s === "undefined" || s === "boolean") && (e = null);
		var c = !1;
		if (e === null) c = !0;
		else switch (s) {
			case "bigint":
			case "string":
			case "number":
				c = !0;
				break;
			case "object": switch (e.$$typeof) {
				case t:
				case n:
					c = !0;
					break;
				case d: return c = e._init, le(c(e._payload), r, i, a, o);
			}
		}
		if (c) return o = o(e), c = a === "" ? "." + se(e, 0) : a, te(o) ? (i = "", c != null && (i = c.replace(w, "$&/") + "/"), le(o, r, i, "", function(e) {
			return e;
		})) : o != null && (ae(o) && (o = ie(o, i + (o.key == null || e && e.key === o.key ? "" : ("" + o.key).replace(w, "$&/") + "/") + c)), r.push(o)), 1;
		c = 0;
		var l = a === "" ? "." : a + ":";
		if (te(e)) for (var u = 0; u < e.length; u++) a = e[u], s = l + se(a, u), c += le(a, r, i, s, o);
		else if (u = h(e), typeof u == "function") for (e = u.call(e), u = 0; !(a = e.next()).done;) a = a.value, s = l + se(a, u++), c += le(a, r, i, s, o);
		else if (s === "object") {
			if (typeof e.then == "function") return le(ce(e), r, i, a, o);
			throw r = String(e), Error("Objects are not valid as a React child (found: " + (r === "[object Object]" ? "object with keys {" + Object.keys(e).join(", ") + "}" : r) + "). If you meant to render a collection of children, use an array instead.");
		}
		return c;
	}
	function ue(e, t, n) {
		if (e == null) return e;
		var r = [], i = 0;
		return le(e, r, "", "", function(e) {
			return t.call(n, e, i++);
		}), r;
	}
	function T(e) {
		if (e._status === -1) {
			var t = e._result, n = t();
			n.then(function(t) {
				(e._status === 0 || e._status === -1) && (e._status = 1, e._result = t, n.status === void 0 && (n.status = "fulfilled", n.value = t));
			}, function(t) {
				(e._status === 0 || e._status === -1) && (e._status = 2, e._result = t, n.status === void 0 && (n.status = "rejected", n.reason = t));
			}), e._status === -1 && (e._status = 0, e._result = n);
		}
		if (e._status === 1) return e._result.default;
		throw e._result;
	}
	var de = typeof reportError == "function" ? reportError : function(e) {
		if (typeof window == "object" && typeof window.ErrorEvent == "function") {
			var t = new window.ErrorEvent("error", {
				bubbles: !0,
				cancelable: !0,
				message: typeof e == "object" && e && typeof e.message == "string" ? String(e.message) : String(e),
				error: e
			});
			if (!window.dispatchEvent(t)) return;
		} else if (typeof process == "object" && typeof process.emit == "function") {
			process.emit("uncaughtException", e);
			return;
		}
		console.error(e);
	};
	function fe(e) {
		var t = S.T, n = {};
		n.types = t === null ? null : t.types, S.T = n;
		try {
			var r = e(), i = S.S;
			i !== null && i(n, r), typeof r == "object" && r && typeof r.then == "function" && r.then(ne, de);
		} catch (e) {
			de(e);
		} finally {
			t !== null && n.types !== null && (t.types = n.types), S.T = t;
		}
	}
	function pe(e) {
		var t = S.T;
		if (t !== null) {
			var n = t.types;
			n === null ? t.types = [e] : n.indexOf(e) === -1 && n.push(e);
		} else fe(pe.bind(null, e));
	}
	var me = {
		map: ue,
		forEach: function(e, t, n) {
			ue(e, function() {
				t.apply(this, arguments);
			}, n);
		},
		count: function(e) {
			var t = 0;
			return ue(e, function() {
				t++;
			}), t;
		},
		toArray: function(e) {
			return ue(e, function(e) {
				return e;
			}) || [];
		},
		only: function(e) {
			if (!ae(e)) throw Error("React.Children.only expected to receive a single React element child.");
			return e;
		}
	};
	e.Activity = f, e.Children = me, e.Component = y, e.Fragment = r, e.Profiler = a, e.PureComponent = ee, e.StrictMode = i, e.Suspense = l, e.ViewTransition = p, e.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = S, e.__COMPILER_RUNTIME = {
		__proto__: null,
		c: function(e) {
			return S.H.useMemoCache(e);
		}
	}, e.addTransitionType = pe, e.cache = function(e) {
		return function() {
			return e.apply(null, arguments);
		};
	}, e.cacheSignal = function() {
		return null;
	}, e.cloneElement = function(e, t, n) {
		if (e == null) throw Error("The argument must be a React element, but you passed " + e + ".");
		var r = _({}, e.props), i = e.key;
		if (t != null) for (a in t.key !== void 0 && (i = "" + t.key), t) !re.call(t, a) || a === "key" || a === "__self" || a === "__source" || a === "ref" && t.ref === void 0 || (r[a] = t[a]);
		var a = arguments.length - 2;
		if (a === 1) r.children = n;
		else if (1 < a) {
			for (var o = Array(a), s = 0; s < a; s++) o[s] = arguments[s + 2];
			r.children = o;
		}
		return C(e.type, i, r);
	}, e.createContext = function(e) {
		return e = {
			$$typeof: s,
			_currentValue: e,
			_currentValue2: e,
			_threadCount: 0,
			Provider: null,
			Consumer: null
		}, e.Provider = e, e.Consumer = {
			$$typeof: o,
			_context: e
		}, e;
	}, e.createElement = function(e, t, n) {
		var r, i = {}, a = null;
		if (t != null) for (r in t.key !== void 0 && (a = "" + t.key), t) re.call(t, r) && r !== "key" && r !== "__self" && r !== "__source" && (i[r] = t[r]);
		var o = arguments.length - 2;
		if (o === 1) i.children = n;
		else if (1 < o) {
			for (var s = Array(o), c = 0; c < o; c++) s[c] = arguments[c + 2];
			i.children = s;
		}
		if (e && e.defaultProps) for (r in o = e.defaultProps, o) i[r] === void 0 && (i[r] = o[r]);
		return C(e, a, i);
	}, e.createRef = function() {
		return { current: null };
	}, e.forwardRef = function(e) {
		return {
			$$typeof: c,
			render: e
		};
	}, e.isValidElement = ae, e.lazy = function(e) {
		return {
			$$typeof: d,
			_payload: {
				_status: -1,
				_result: e
			},
			_init: T
		};
	}, e.memo = function(e, t) {
		return {
			$$typeof: u,
			type: e,
			compare: t === void 0 ? null : t
		};
	}, e.startTransition = fe, e.unstable_useCacheRefresh = function() {
		return S.H.useCacheRefresh();
	}, e.use = function(e) {
		return S.H.use(e);
	}, e.useActionState = function(e, t, n) {
		return S.H.useActionState(e, t, n);
	}, e.useCallback = function(e, t) {
		return S.H.useCallback(e, t);
	}, e.useContext = function(e) {
		return S.H.useContext(e);
	}, e.useDebugValue = function() {}, e.useDeferredValue = function(e, t) {
		return S.H.useDeferredValue(e, t);
	}, e.useEffect = function(e, t) {
		return S.H.useEffect(e, t);
	}, e.useEffectEvent = function(e) {
		return S.H.useEffectEvent(e);
	}, e.useId = function() {
		return S.H.useId();
	}, e.useImperativeHandle = function(e, t, n) {
		return S.H.useImperativeHandle(e, t, n);
	}, e.useInsertionEffect = function(e, t) {
		return S.H.useInsertionEffect(e, t);
	}, e.useLayoutEffect = function(e, t) {
		return S.H.useLayoutEffect(e, t);
	}, e.useMemo = function(e, t) {
		return S.H.useMemo(e, t);
	}, e.useOptimistic = function(e, t) {
		return S.H.useOptimistic(e, t);
	}, e.useReducer = function(e, t, n) {
		return S.H.useReducer(e, t, n);
	}, e.useRef = function(e) {
		return S.H.useRef(e);
	}, e.useState = function(e) {
		return S.H.useState(e);
	}, e.useSyncExternalStore = function(e, t, n) {
		return S.H.useSyncExternalStore(e, t, n);
	}, e.useTransition = function() {
		return S.H.useTransition();
	}, e.version = "19.3.0";
})), u = /* @__PURE__ */ o(((e, t) => {
	t.exports = l();
})), d = /* @__PURE__ */ o(((e) => {
	function t(e, t) {
		var n = e.length;
		e.push(t);
		a: for (; 0 < n;) {
			var r = n - 1 >>> 1, a = e[r];
			if (0 < i(a, t)) e[r] = t, e[n] = a, n = r;
			else break a;
		}
	}
	function n(e) {
		return e.length === 0 ? null : e[0];
	}
	function r(e) {
		if (e.length === 0) return null;
		var t = e[0], n = e.pop();
		if (n !== t) {
			e[0] = n;
			a: for (var r = 0, a = e.length, o = a >>> 1; r < o;) {
				var s = 2 * (r + 1) - 1, c = e[s], l = s + 1, u = e[l];
				if (0 > i(c, n)) l < a && 0 > i(u, c) ? (e[r] = u, e[l] = n, r = l) : (e[r] = c, e[s] = n, r = s);
				else if (l < a && 0 > i(u, n)) e[r] = u, e[l] = n, r = l;
				else break a;
			}
		}
		return t;
	}
	function i(e, t) {
		var n = e.sortIndex - t.sortIndex;
		return n === 0 ? e.id - t.id : n;
	}
	if (e.unstable_now = void 0, typeof performance == "object" && typeof performance.now == "function") {
		var a = performance;
		e.unstable_now = function() {
			return a.now();
		};
	} else {
		var o = Date, s = o.now();
		e.unstable_now = function() {
			return o.now() - s;
		};
	}
	var c = [], l = [], u = 1, d = null, f = 3, p = !1, m = !1, h = !1, g = !1, _ = typeof setTimeout == "function" ? setTimeout : null, v = typeof clearTimeout == "function" ? clearTimeout : null, y = typeof setImmediate < "u" ? setImmediate : null;
	function b(e) {
		for (var i = n(l); i !== null;) {
			if (i.callback === null) r(l);
			else if (i.startTime <= e) r(l), i.sortIndex = i.expirationTime, t(c, i);
			else break;
			i = n(l);
		}
	}
	function ee(e) {
		if (h = !1, b(e), !m) {
			if (n(c) !== null) m = !0, x || (x = !0, ie());
			else {
				var t = n(l);
				t !== null && w(ee, t.startTime - e);
			}
		}
	}
	var x = !1, te = -1, ne = 5, S = -1;
	function re() {
		return g ? !0 : !(e.unstable_now() - S < ne);
	}
	function C() {
		if (g = !1, x) {
			var t = e.unstable_now();
			S = t;
			var i = !0;
			try {
				a: {
					m = !1, h && (h = !1, v(te), te = -1), p = !0;
					var a = f;
					try {
						b: {
							for (b(t), d = n(c); d !== null && !(d.expirationTime > t && re());) {
								var o = d.callback;
								if (typeof o == "function") {
									d.callback = null, f = d.priorityLevel;
									var s = o(d.expirationTime <= t);
									if (t = e.unstable_now(), typeof s == "function") {
										d.callback = s, b(t), i = !0;
										break b;
									}
									d === n(c) && r(c), b(t);
								} else r(c);
								d = n(c);
							}
							if (d !== null) i = !0;
							else {
								var u = n(l);
								u !== null && w(ee, u.startTime - t), i = !1;
							}
						}
						break a;
					} finally {
						d = null, f = a, p = !1;
					}
					i = void 0;
				}
			} finally {
				i ? ie() : x = !1;
			}
		}
	}
	var ie;
	if (typeof y == "function") ie = function() {
		y(C);
	};
	else if (typeof MessageChannel < "u") {
		var ae = new MessageChannel(), oe = ae.port2;
		ae.port1.onmessage = C, ie = function() {
			oe.postMessage(null);
		};
	} else ie = function() {
		_(C, 0);
	};
	function w(t, n) {
		te = _(function() {
			t(e.unstable_now());
		}, n);
	}
	e.unstable_IdlePriority = 5, e.unstable_ImmediatePriority = 1, e.unstable_LowPriority = 4, e.unstable_NormalPriority = 3, e.unstable_Profiling = null, e.unstable_UserBlockingPriority = 2, e.unstable_cancelCallback = function(e) {
		e.callback = null;
	}, e.unstable_forceFrameRate = function(e) {
		0 > e || 125 < e ? console.error("forceFrameRate takes a positive int between 0 and 125, forcing frame rates higher than 125 fps is not supported") : ne = 0 < e ? Math.floor(1e3 / e) : 5;
	}, e.unstable_getCurrentPriorityLevel = function() {
		return f;
	}, e.unstable_next = function(e) {
		switch (f) {
			case 1:
			case 2:
			case 3:
				var t = 3;
				break;
			default: t = f;
		}
		var n = f;
		f = t;
		try {
			return e();
		} finally {
			f = n;
		}
	}, e.unstable_requestPaint = function() {
		g = !0;
	}, e.unstable_runWithPriority = function(e, t) {
		switch (e) {
			case 1:
			case 2:
			case 3:
			case 4:
			case 5: break;
			default: e = 3;
		}
		var n = f;
		f = e;
		try {
			return t();
		} finally {
			f = n;
		}
	}, e.unstable_scheduleCallback = function(r, i, a) {
		var o = e.unstable_now();
		switch (typeof a == "object" && a ? (a = a.delay, a = typeof a == "number" && 0 < a ? o + a : o) : a = o, r) {
			case 1:
				var s = -1;
				break;
			case 2:
				s = 250;
				break;
			case 5:
				s = 1073741823;
				break;
			case 4:
				s = 1e4;
				break;
			default: s = 5e3;
		}
		return s = a + s, r = {
			id: u++,
			callback: i,
			priorityLevel: r,
			startTime: a,
			expirationTime: s,
			sortIndex: -1
		}, a > o ? (r.sortIndex = a, t(l, r), n(c) === null && r === n(l) && (h ? (v(te), te = -1) : h = !0, w(ee, a - o))) : (r.sortIndex = s, t(c, r), m || p || (m = !0, x || (x = !0, ie()))), r;
	}, e.unstable_shouldYield = re, e.unstable_wrapCallback = function(e) {
		var t = f;
		return function() {
			var n = f;
			f = t;
			try {
				return e.apply(this, arguments);
			} finally {
				f = n;
			}
		};
	};
})), f = /* @__PURE__ */ o(((e, t) => {
	t.exports = d();
})), p = /* @__PURE__ */ o(((e) => {
	var t = u();
	function n(e) {
		var t = "https://react.dev/errors/" + e;
		if (1 < arguments.length) {
			t += "?args[]=" + encodeURIComponent(arguments[1]);
			for (var n = 2; n < arguments.length; n++) t += "&args[]=" + encodeURIComponent(arguments[n]);
		}
		return "Minified React error #" + e + "; visit " + t + " for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
	}
	function r() {}
	var i = {
		d: {
			f: r,
			r: function() {
				throw Error(n(522));
			},
			D: r,
			C: r,
			L: r,
			m: r,
			X: r,
			S: r,
			M: r
		},
		p: 0,
		findDOMNode: null
	}, a = Symbol.for("react.portal"), o = Symbol.for("react.recoverable"), s = Symbol.for("react.optimistic_key");
	function c(e, t, n) {
		var r = 3 < arguments.length && arguments[3] !== void 0 ? arguments[3] : null;
		return {
			$$typeof: a,
			key: r == null ? null : r === s ? s : "" + r,
			children: e,
			containerInfo: t,
			implementation: n
		};
	}
	var l = t.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
	function d(e, t) {
		if (e === "font") return "";
		if (typeof t == "string") return t === "use-credentials" ? t : "";
	}
	e.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = i, e.browser = function(e) {
		return {
			$$typeof: o,
			_reason: e
		};
	}, e.createPortal = function(e, t) {
		var r = 2 < arguments.length && arguments[2] !== void 0 ? arguments[2] : null;
		if (!t || t.nodeType !== 1 && t.nodeType !== 9 && t.nodeType !== 11) throw Error(n(299));
		return c(e, t, null, r);
	}, e.flushSync = function(e) {
		var t = l.T, n = i.p;
		try {
			if (l.T = null, i.p = 2, e) return e();
		} finally {
			l.T = t, i.p = n, i.d.f();
		}
	}, e.preconnect = function(e, t) {
		typeof e == "string" && (t ? (t = t.crossOrigin, t = typeof t == "string" ? t === "use-credentials" ? t : "" : void 0) : t = null, i.d.C(e, t));
	}, e.prefetchDNS = function(e) {
		typeof e == "string" && i.d.D(e);
	}, e.preinit = function(e, t) {
		if (typeof e == "string" && t && typeof t.as == "string") {
			var n = t.as, r = d(n, t.crossOrigin), a = typeof t.integrity == "string" ? t.integrity : void 0, o = typeof t.fetchPriority == "string" ? t.fetchPriority : void 0;
			n === "style" ? i.d.S(e, typeof t.precedence == "string" ? t.precedence : void 0, {
				crossOrigin: r,
				integrity: a,
				fetchPriority: o
			}) : n === "script" && i.d.X(e, {
				crossOrigin: r,
				integrity: a,
				fetchPriority: o,
				nonce: typeof t.nonce == "string" ? t.nonce : void 0
			});
		}
	}, e.preinitModule = function(e, t) {
		if (typeof e == "string") {
			if (typeof t == "object" && t) {
				if (t.as == null || t.as === "script") {
					var n = d(t.as, t.crossOrigin);
					i.d.M(e, {
						crossOrigin: n,
						integrity: typeof t.integrity == "string" ? t.integrity : void 0,
						nonce: typeof t.nonce == "string" ? t.nonce : void 0,
						fetchPriority: typeof t.fetchPriority == "string" ? t.fetchPriority : void 0
					});
				}
			} else t ?? i.d.M(e);
		}
	}, e.preload = function(e, t) {
		if (typeof e == "string" && typeof t == "object" && t && typeof t.as == "string") {
			var n = t.as, r = d(n, t.crossOrigin);
			i.d.L(e, n, {
				crossOrigin: r,
				integrity: typeof t.integrity == "string" ? t.integrity : void 0,
				nonce: typeof t.nonce == "string" ? t.nonce : void 0,
				type: typeof t.type == "string" ? t.type : void 0,
				fetchPriority: typeof t.fetchPriority == "string" ? t.fetchPriority : void 0,
				referrerPolicy: typeof t.referrerPolicy == "string" ? t.referrerPolicy : void 0,
				imageSrcSet: typeof t.imageSrcSet == "string" ? t.imageSrcSet : void 0,
				imageSizes: typeof t.imageSizes == "string" ? t.imageSizes : void 0,
				media: typeof t.media == "string" ? t.media : void 0
			});
		}
	}, e.preloadModule = function(e, t) {
		if (typeof e == "string") {
			if (t) {
				var n = d(t.as, t.crossOrigin);
				i.d.m(e, {
					as: typeof t.as == "string" && t.as !== "script" ? t.as : void 0,
					crossOrigin: n,
					integrity: typeof t.integrity == "string" ? t.integrity : void 0,
					nonce: typeof t.nonce == "string" ? t.nonce : void 0,
					fetchPriority: typeof t.fetchPriority == "string" ? t.fetchPriority : void 0
				});
			} else i.d.m(e);
		}
	}, e.requestFormReset = function(e) {
		i.d.r(e);
	}, e.unstable_batchedUpdates = function(e, t) {
		return e(t);
	}, e.useFormState = function(e, t, n) {
		return l.H.useFormState(e, t, n);
	}, e.useFormStatus = function() {
		return l.H.useHostTransitionStatus();
	}, e.version = "19.3.0";
})), m = /* @__PURE__ */ o(((e, t) => {
	function n() {
		if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ < "u" && typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE == "function") try {
			__REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(n);
		} catch (e) {
			console.error(e);
		}
	}
	n(), t.exports = p();
})), h = /* @__PURE__ */ o(((e) => {
	var t = f(), n = u(), r = m();
	function i(e) {
		var t = "https://react.dev/errors/" + e;
		if (1 < arguments.length) {
			t += "?args[]=" + encodeURIComponent(arguments[1]);
			for (var n = 2; n < arguments.length; n++) t += "&args[]=" + encodeURIComponent(arguments[n]);
		}
		return "Minified React error #" + e + "; visit " + t + " for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
	}
	function a(e) {
		return !(!e || e.nodeType !== 1 && e.nodeType !== 9 && e.nodeType !== 11);
	}
	function o(e) {
		for (var t = e, n = t; n && !n.alternate;) t = n, t.flags & 4098 && (e = t.return), n = t.return;
		for (; t.return;) t = t.return;
		return t.tag === 3 ? e : null;
	}
	function s(e) {
		if (e.tag === 13) {
			var t = e.memoizedState;
			if (t === null && (e = e.alternate, e !== null && (t = e.memoizedState)), t !== null) return t.dehydrated;
		}
		return null;
	}
	function c(e) {
		if (e.tag === 31) {
			var t = e.memoizedState;
			if (t === null && (e = e.alternate, e !== null && (t = e.memoizedState)), t !== null) return t.dehydrated;
		}
		return null;
	}
	function l(e) {
		if (o(e) !== e) throw Error(i(188));
	}
	function d(e) {
		var t = e.alternate;
		if (!t) {
			if (t = o(e), t === null) throw Error(i(188));
			return t === e ? e : null;
		}
		for (var n = e, r = t;;) {
			var a = n.return;
			if (a === null) break;
			var s = a.alternate;
			if (s === null) {
				if (r = a.return, r !== null) {
					n = r;
					continue;
				}
				break;
			}
			if (a.child === s.child) {
				for (s = a.child; s;) {
					if (s === n) return l(a), e;
					if (s === r) return l(a), t;
					s = s.sibling;
				}
				throw Error(i(188));
			}
			if (n.return !== r.return) n = a, r = s;
			else {
				for (var c = !1, u = a.child; u;) {
					if (u === n) {
						c = !0, n = a, r = s;
						break;
					}
					if (u === r) {
						c = !0, r = a, n = s;
						break;
					}
					u = u.sibling;
				}
				if (!c) {
					for (u = s.child; u;) {
						if (u === n) {
							c = !0, n = s, r = a;
							break;
						}
						if (u === r) {
							c = !0, r = s, n = a;
							break;
						}
						u = u.sibling;
					}
					if (!c) throw Error(i(189));
				}
			}
			if (n.alternate !== r) throw Error(i(190));
		}
		if (n.tag !== 3) throw Error(i(188));
		return n.stateNode.current === n ? e : t;
	}
	function p(e) {
		var t = e.tag;
		if (t === 5 || t === 26 || t === 27 || t === 6) return e;
		for (e = e.child; e !== null;) {
			if (t = p(e), t !== null) return t;
			e = e.sibling;
		}
		return null;
	}
	function h(e, t, n, r, i, a) {
		for (; e !== null;) {
			if ((e.tag === 5 || e.tag === 27 || e.tag === 6) && n(e, r, i, a) || (e.tag !== 22 || e.memoizedState === null) && (t || e.tag !== 5 && e.tag !== 27) && h(e.child, t, n, r, i, a)) return !0;
			e = e.sibling;
		}
		return !1;
	}
	function g(e) {
		for (e = e.return; e !== null;) {
			if (e.tag === 3 || e.tag === 5 || e.tag === 27) return e;
			e = e.return;
		}
		return null;
	}
	function _(e) {
		var t = !1;
		for (e = e.return; e !== null && (e.tag === 4 && (t = !0), e.tag !== 3 && e.tag !== 5 && e.tag !== 27);) e = e.return;
		return t;
	}
	function v(e) {
		var t = [null, null], n = g(e);
		return n === null || y(t, e, n.child, { foundSelf: !1 }), t;
	}
	function y(e, t, n, r) {
		for (; n !== null;) {
			if (n === t) r.foundSelf = !0;
			else if (n.tag === 5 || n.tag === 27 || n.tag === 6) {
				if (r.foundSelf) return e[1] = n, !0;
				e[0] = n;
			} else if ((n.tag !== 22 || n.memoizedState === null) && y(e, t, n.child, r)) return !0;
			n = n.sibling;
		}
		return !1;
	}
	function b(e) {
		switch (e.tag) {
			case 5:
			case 27:
			case 6: return e.stateNode;
			case 3: return e.stateNode.containerInfo;
			default: throw Error(i(559));
		}
	}
	var ee = null, x = null;
	function te(e, t, n) {
		return e === n || e === t && (ee = e, !0);
	}
	function ne(e, t, n) {
		return e === n ? (x = e, !1) : e === t && (x !== null && (ee = e), !0);
	}
	function S(e) {
		if (e === null) return null;
		do
			e = e === null ? null : e.return;
		while (e && e.tag !== 5 && e.tag !== 27 && e.tag !== 3);
		return e || null;
	}
	function re(e, t, n) {
		for (var r = 0, i = e; i; i = n(i)) r++;
		i = 0;
		for (var a = t; a; a = n(a)) i++;
		for (; 0 < r - i;) e = n(e), r--;
		for (; 0 < i - r;) t = n(t), i--;
		for (; r--;) {
			if (e === t || t !== null && e === t.alternate) return e;
			e = n(e), t = n(t);
		}
		return null;
	}
	var C = Object.assign, ie = Symbol.for("react.element"), ae = Symbol.for("react.transitional.element"), oe = Symbol.for("react.portal"), w = Symbol.for("react.fragment"), se = Symbol.for("react.strict_mode"), ce = Symbol.for("react.profiler"), le = Symbol.for("react.consumer"), ue = Symbol.for("react.context"), T = Symbol.for("react.forward_ref"), de = Symbol.for("react.suspense"), fe = Symbol.for("react.suspense_list"), pe = Symbol.for("react.memo"), me = Symbol.for("react.lazy"), he = Symbol.for("react.activity"), ge = Symbol.for("react.legacy_hidden"), _e = Symbol.for("react.memo_cache_sentinel"), ve = Symbol.for("react.view_transition"), ye = Symbol.for("react.recoverable"), be = Symbol.iterator;
	function xe(e) {
		return typeof e != "object" || !e ? null : (e = be && e[be] || e["@@iterator"], typeof e == "function" ? e : null);
	}
	var Se = Symbol.for("react.client.reference");
	function Ce(e) {
		if (e == null) return null;
		if (typeof e == "function") return e.$$typeof === Se ? null : e.displayName || e.name || null;
		if (typeof e == "string") return e;
		switch (e) {
			case w: return "Fragment";
			case ce: return "Profiler";
			case se: return "StrictMode";
			case de: return "Suspense";
			case fe: return "SuspenseList";
			case he: return "Activity";
			case ve: return "ViewTransition";
		}
		if (typeof e == "object") switch (e.$$typeof) {
			case oe: return "Portal";
			case ue: return e.displayName || "Context";
			case le: return (e._context.displayName || "Context") + ".Consumer";
			case T:
				var t = e.render;
				return e = e.displayName, e ||= (e = t.displayName || t.name || "", e === "" ? "ForwardRef" : "ForwardRef(" + e + ")"), e;
			case pe: return t = e.displayName || null, t === null ? Ce(e.type) || "Memo" : t;
			case me:
				t = e._payload, e = e._init;
				try {
					return Ce(e(t));
				} catch {}
		}
		return null;
	}
	var we = Array.isArray, E = n.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, D = r.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, Te = {
		pending: !1,
		data: null,
		method: null,
		action: null
	}, Ee = [], De = -1;
	function Oe(e) {
		return { current: e };
	}
	function O(e) {
		0 > De || (e.current = Ee[De], Ee[De] = null, De--);
	}
	function k(e, t) {
		De++, Ee[De] = e.current, e.current = t;
	}
	var ke = Oe(null), Ae = Oe(null), je = Oe(null), Me = Oe(null);
	function Ne(e, t) {
		switch (k(je, t), k(Ae, e), k(ke, null), t.nodeType) {
			case 9:
			case 11:
				e = (e = t.documentElement) && (e = e.namespaceURI) ? up(e) : 0;
				break;
			default: if (e = t.tagName, t = t.namespaceURI) t = up(t), e = dp(t, e);
			else switch (e) {
				case "svg":
					e = 1;
					break;
				case "math":
					e = 2;
					break;
				default: e = 0;
			}
		}
		O(ke), k(ke, e);
	}
	function Pe() {
		O(ke), O(Ae), O(je);
	}
	function Fe(e) {
		var t = e.memoizedState;
		t !== null && (sh._currentValue = t.memoizedState, k(Me, e)), t = ke.current;
		var n = dp(t, e.type);
		t !== n && (k(Ae, e), k(ke, n));
	}
	function Ie(e) {
		Ae.current === e && (O(ke), O(Ae)), Me.current === e && (O(Me), sh._currentValue = Te);
	}
	var Le, Re;
	function ze(e) {
		if (Le === void 0) try {
			throw Error();
		} catch (e) {
			var t = e.stack.trim().match(/\n( *(at )?)/);
			Le = t && t[1] || "", Re = -1 < e.stack.indexOf("\n    at") ? " (<anonymous>)" : -1 < e.stack.indexOf("@") ? "@unknown:0:0" : "";
		}
		return "\n" + Le + e + Re;
	}
	var Be = !1;
	function Ve(e, t) {
		if (!e || Be) return "";
		Be = !0;
		var n = Error.prepareStackTrace;
		Error.prepareStackTrace = void 0;
		try {
			var r = { DetermineComponentFrameRoot: function() {
				try {
					if (t) {
						var n = function() {
							throw Error();
						};
						if (Object.defineProperty(n.prototype, "props", { set: function() {
							throw Error();
						} }), typeof Reflect == "object" && Reflect.construct) {
							try {
								Reflect.construct(n, []);
							} catch (e) {
								var r = e;
							}
							Reflect.construct(e, [], n);
						} else {
							try {
								n.call();
							} catch (e) {
								r = e;
							}
							n = !1;
							try {
								var i = Object.getOwnPropertyDescriptor(e.prototype, "props");
								Object.defineProperty(e.prototype, "props", {
									configurable: !0,
									set: function() {
										throw Error();
									}
								}), n = !0, new e();
							} finally {
								n && (i === void 0 ? delete e.prototype.props : Object.defineProperty(e.prototype, "props", i));
							}
						}
					} else {
						try {
							throw Error();
						} catch (e) {
							r = e;
						}
						(n = e()) && typeof n.catch == "function" && n.catch(function() {});
					}
				} catch (e) {
					if (e && r && typeof e.stack == "string") return [e.stack, r.stack];
				}
				return [null, null];
			} };
			r.DetermineComponentFrameRoot.displayName = "DetermineComponentFrameRoot";
			var i = Object.getOwnPropertyDescriptor(r.DetermineComponentFrameRoot, "name");
			i && i.configurable && Object.defineProperty(r.DetermineComponentFrameRoot, "name", { value: "DetermineComponentFrameRoot" });
			var a = r.DetermineComponentFrameRoot(), o = a[0], s = a[1];
			if (o && s) {
				var c = o.split("\n"), l = s.split("\n");
				for (i = r = 0; r < c.length && !c[r].includes("DetermineComponentFrameRoot");) r++;
				for (; i < l.length && !l[i].includes("DetermineComponentFrameRoot");) i++;
				if (r === c.length || i === l.length) for (r = c.length - 1, i = l.length - 1; 1 <= r && 0 <= i && c[r] !== l[i];) i--;
				for (; 1 <= r && 0 <= i; r--, i--) if (c[r] !== l[i]) {
					if (r !== 1 || i !== 1) do
						if (r--, i--, 0 > i || c[r] !== l[i]) {
							var u = "\n" + c[r].replace(" at new ", " at ");
							return e.displayName && u.includes("<anonymous>") && (u = u.replace("<anonymous>", e.displayName)), u;
						}
					while (1 <= r && 0 <= i);
					break;
				}
			}
		} finally {
			Be = !1, Error.prepareStackTrace = n;
		}
		return (n = e ? e.displayName || e.name : "") ? ze(n) : "";
	}
	function He(e, t) {
		switch (e.tag) {
			case 26:
			case 27:
			case 5: return ze(e.type);
			case 16: return ze("Lazy");
			case 13: return e.child !== t && t !== null ? ze("Suspense Fallback") : ze("Suspense");
			case 19: return ze("SuspenseList");
			case 0:
			case 15: return Ve(e.type, !1);
			case 11: return Ve(e.type.render, !1);
			case 1: return Ve(e.type, !0);
			case 31: return ze("Activity");
			case 30: return ze("ViewTransition");
			default: return "";
		}
	}
	function Ue(e) {
		try {
			var t = "", n = null;
			do
				t += He(e, n), n = e, e = e.return;
			while (e);
			return t;
		} catch (e) {
			return "\nError generating stack: " + e.message + "\n" + e.stack;
		}
	}
	var We = Object.prototype.hasOwnProperty, Ge = t.unstable_scheduleCallback, Ke = t.unstable_cancelCallback, qe = t.unstable_shouldYield, Je = t.unstable_requestPaint, A = t.unstable_now, Ye = t.unstable_getCurrentPriorityLevel, Xe = t.unstable_ImmediatePriority, Ze = t.unstable_UserBlockingPriority, Qe = t.unstable_NormalPriority, $e = t.unstable_LowPriority, et = t.unstable_IdlePriority, tt = t.log, nt = t.unstable_setDisableYieldValue, rt = null, it = null;
	function at(e) {
		if (typeof tt == "function" && nt(e), it && typeof it.setStrictMode == "function") try {
			it.setStrictMode(rt, e);
		} catch {}
	}
	var ot = Math.clz32 ? Math.clz32 : lt, st = Math.log, ct = Math.LN2;
	function lt(e) {
		return e >>>= 0, e === 0 ? 32 : 31 - (st(e) / ct | 0) | 0;
	}
	var ut = 256, dt = 262144, ft = 4194304;
	function pt(e) {
		var t = e & 42;
		if (t !== 0) return t;
		switch (e & -e) {
			case 1: return 1;
			case 2: return 2;
			case 4: return 4;
			case 8: return 8;
			case 16: return 16;
			case 32: return 32;
			case 64: return 64;
			case 128: return 128;
			case 256:
			case 512:
			case 1024:
			case 2048:
			case 4096:
			case 8192:
			case 16384:
			case 32768:
			case 65536:
			case 131072: return e & -e;
			case 262144:
			case 524288:
			case 1048576:
			case 2097152: return e & 3932160;
			case 4194304:
			case 8388608:
			case 16777216:
			case 33554432: return e & 62914560;
			case 67108864: return 67108864;
			case 134217728: return 134217728;
			case 268435456: return 268435456;
			case 536870912: return 536870912;
			case 1073741824: return 0;
			default: return e;
		}
	}
	function mt(e, t, n) {
		var r = e.pendingLanes;
		if (r === 0) return 0;
		var i = 0, a = e.suspendedLanes, o = e.pingedLanes;
		e = e.warmLanes;
		var s = r & 134217727;
		return s === 0 ? (s = r & ~a, s === 0 ? o === 0 ? n || (n = r & ~e, n !== 0 && (i = pt(n))) : i = pt(o) : i = pt(s)) : (r = s & ~a, r === 0 ? (o &= s, o === 0 ? n || (n = s & ~e, n !== 0 && (i = pt(n))) : i = pt(o)) : i = pt(r)), i === 0 ? 0 : t !== 0 && t !== i && (t & a) === 0 && (a = i & -i, n = t & -t, a >= n || a === 32 && n & 4194048) ? t : i;
	}
	function ht(e, t) {
		return (e.pendingLanes & ~(e.suspendedLanes & ~e.pingedLanes) & t) === 0;
	}
	function gt(e, t) {
		t & 8 && (t |= t & 32);
		var n = e.entangledLanes;
		if (n !== 0) for (e = e.entanglements, n &= t; 0 < n;) {
			var r = 31 - ot(n), i = 1 << r;
			t |= e[r], n &= ~i;
		}
		return t;
	}
	function _t(e, t) {
		switch (e) {
			case 1:
			case 2:
			case 4:
			case 8:
			case 64: return t + 250;
			case 16:
			case 32:
			case 128:
			case 256:
			case 512:
			case 1024:
			case 2048:
			case 4096:
			case 8192:
			case 16384:
			case 32768:
			case 65536:
			case 131072:
			case 262144:
			case 524288:
			case 1048576:
			case 2097152: return t + 5e3;
			case 4194304:
			case 8388608:
			case 16777216:
			case 33554432: return -1;
			case 67108864:
			case 134217728:
			case 268435456:
			case 536870912:
			case 1073741824: return -1;
			default: return -1;
		}
	}
	function vt() {
		var e = ft;
		return ft <<= 1, !(ft & 62914560) && (ft = 4194304), e;
	}
	function yt(e) {
		for (var t = [], n = 0; 31 > n; n++) t.push(e);
		return t;
	}
	function bt(e, t) {
		e.pendingLanes |= t, t !== 268435456 && (e.suspendedLanes = 0, e.pingedLanes = 0, e.warmLanes = 0);
	}
	function xt(e, t, n, r, i, a) {
		var o = e.pendingLanes;
		e.pendingLanes = n, e.suspendedLanes = 0, e.pingedLanes = 0, e.warmLanes = 0, e.expiredLanes &= n, e.entangledLanes &= n, e.errorRecoveryDisabledLanes &= n, e.shellSuspendCounter = 0;
		var s = e.entanglements, c = e.expirationTimes, l = e.hiddenUpdates;
		for (n = o & ~n; 0 < n;) {
			var u = 31 - ot(n), d = 1 << u;
			s[u] = 0, c[u] = -1;
			var f = l[u];
			if (f !== null) for (l[u] = null, u = 0; u < f.length; u++) {
				var p = f[u];
				p !== null && (p.lane &= -536870913);
			}
			n &= ~d;
		}
		r !== 0 && St(e, r, 0), a !== 0 && i === 0 && e.tag !== 0 && (e.suspendedLanes |= a & ~(o & ~t));
	}
	function St(e, t, n) {
		e.pendingLanes |= t, e.suspendedLanes &= ~t;
		var r = 31 - ot(t);
		e.entangledLanes |= t, e.entanglements[r] = e.entanglements[r] | 1073741824 | n & 261930;
	}
	function Ct(e, t) {
		var n = e.entangledLanes |= t;
		for (e = e.entanglements; n;) {
			var r = 31 - ot(n), i = 1 << r;
			i & t | e[r] & t && (e[r] |= t), n &= ~i;
		}
	}
	function wt(e, t) {
		var n = t & -t;
		return n = n & 42 ? 1 : Tt(n), (n & (e.suspendedLanes | t)) === 0 ? n : 0;
	}
	function Tt(e) {
		switch (e) {
			case 2:
				e = 1;
				break;
			case 8:
				e = 4;
				break;
			case 32:
				e = 16;
				break;
			case 256:
			case 512:
			case 1024:
			case 2048:
			case 4096:
			case 8192:
			case 16384:
			case 32768:
			case 65536:
			case 131072:
			case 262144:
			case 524288:
			case 1048576:
			case 2097152:
			case 4194304:
			case 8388608:
			case 16777216:
			case 33554432:
				e = 128;
				break;
			case 268435456:
				e = 134217728;
				break;
			default: e = 0;
		}
		return e;
	}
	function Et(e) {
		return e &= -e, 2 < e ? 8 < e ? e & 134217727 ? 32 : 268435456 : 8 : 2;
	}
	function Dt() {
		var e = D.p;
		return e === 0 ? (e = window.event, e === void 0 ? 32 : Ch(e.type)) : e;
	}
	function Ot(e, t) {
		var n = D.p;
		try {
			return D.p = e, t();
		} finally {
			D.p = n;
		}
	}
	var kt = Math.random().toString(36).slice(2), At = "__reactFiber$" + kt, jt = "__reactProps$" + kt, Mt = "__reactContainer$" + kt, Nt = "__reactEvents$" + kt, Pt = "__reactListeners$" + kt, Ft = "__reactHandles$" + kt, It = "__reactResources$" + kt, Lt = "__reactMarker$" + kt, Rt = "__reactLoad$" + kt;
	function zt(e) {
		delete e[At], delete e[jt], delete e[Pt], delete e[Ft];
	}
	function Bt(e) {
		var t;
		if (t = e[At]) return t;
		for (var n = e.parentNode; n;) {
			if (t = n[Mt] || n[At]) {
				if (n = t.alternate, t.child !== null || n !== null && n.child !== null) for (e = fm(e); e !== null;) {
					if (n = e[At]) return n;
					e = fm(e);
				}
				return t;
			}
			e = n, n = e.parentNode;
		}
		return null;
	}
	function Vt(e) {
		if (e = e[At] || e[Mt]) {
			var t = e.tag;
			if (t === 5 || t === 6 || t === 13 || t === 31 || t === 26 || t === 27 || t === 3) return e;
		}
		return null;
	}
	function Ht(e) {
		var t = e.tag;
		if (t === 5 || t === 26 || t === 27 || t === 6) return e.stateNode;
		throw Error(i(33));
	}
	function Ut(e) {
		var t = e[It];
		return t ||= e[It] = {
			hoistableStyles: /* @__PURE__ */ new Map(),
			hoistableScripts: /* @__PURE__ */ new Map()
		}, t;
	}
	function Wt(e) {
		e[Lt] = !0;
	}
	function Gt(e) {
		e[Rt] = void 0;
	}
	var Kt = /* @__PURE__ */ new Set(), qt = {};
	function Jt(e, t) {
		Yt(e, t), Yt(e + "Capture", t);
	}
	function Yt(e, t) {
		for (qt[e] = t, e = 0; e < t.length; e++) Kt.add(t[e]);
	}
	var Xt = RegExp("^[:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD][:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$"), Zt = {}, Qt = {};
	function $t(e) {
		return We.call(Qt, e) ? !0 : We.call(Zt, e) ? !1 : Xt.test(e) ? Qt[e] = !0 : (Zt[e] = !0, !1);
	}
	var j = !1;
	function en() {
		var e = j;
		return j = !1, e;
	}
	function tn(e, t, n) {
		if ($t(t)) {
			if (n === null) e.removeAttribute(t);
			else {
				switch (typeof n) {
					case "undefined":
					case "function":
					case "symbol":
						e.removeAttribute(t);
						return;
					case "boolean":
						var r = t.toLowerCase().slice(0, 5);
						if (r !== "data-" && r !== "aria-") {
							e.removeAttribute(t);
							return;
						}
				}
				e.setAttribute(t, n);
			}
		}
	}
	function nn(e, t, n) {
		if (n === null) e.removeAttribute(t);
		else {
			switch (typeof n) {
				case "undefined":
				case "function":
				case "symbol":
				case "boolean":
					e.removeAttribute(t);
					return;
			}
			e.setAttribute(t, n);
		}
	}
	function rn(e, t, n, r) {
		if (r === null) e.removeAttribute(n);
		else {
			switch (typeof r) {
				case "undefined":
				case "function":
				case "symbol":
				case "boolean":
					e.removeAttribute(n);
					return;
			}
			e.setAttributeNS(t, n, r);
		}
	}
	function an(e) {
		switch (typeof e) {
			case "bigint":
			case "boolean":
			case "number":
			case "string":
			case "undefined": return e;
			case "object": return e;
			default: return "";
		}
	}
	function on(e) {
		var t = e.type;
		return (e = e.nodeName) && e.toLowerCase() === "input" && (t === "checkbox" || t === "radio");
	}
	function sn(e, t, n) {
		var r = Object.getOwnPropertyDescriptor(e.constructor.prototype, t);
		if (!e.hasOwnProperty(t) && r !== void 0 && typeof r.get == "function" && typeof r.set == "function") {
			var i = r.get, a = r.set;
			return Object.defineProperty(e, t, {
				configurable: !0,
				get: function() {
					return i.call(this);
				},
				set: function(e) {
					n = "" + e, a.call(this, e);
				}
			}), Object.defineProperty(e, t, { enumerable: r.enumerable }), {
				getValue: function() {
					return n;
				},
				setValue: function(e) {
					n = "" + e;
				},
				stopTracking: function() {
					e._valueTracker = null, delete e[t];
				}
			};
		}
	}
	function cn(e) {
		if (!e._valueTracker) {
			var t = on(e) ? "checked" : "value";
			e._valueTracker = sn(e, t, "" + e[t]);
		}
	}
	function ln(e) {
		if (!e) return !1;
		var t = e._valueTracker;
		if (!t) return !0;
		var n = t.getValue(), r = "";
		return e && (r = on(e) ? e.checked ? "true" : "false" : e.value), e = r, e !== n && (t.setValue(e), !0);
	}
	var un = /[\n"\\]/g;
	function dn(e) {
		return e.replace(un, function(e) {
			return "\\" + e.charCodeAt(0).toString(16) + " ";
		});
	}
	function fn(e, t, n, r, i, a, o, s) {
		e.name = "", o != null && typeof o != "function" && typeof o != "symbol" && typeof o != "boolean" ? e.type = o : e.removeAttribute("type"), t == null ? o !== "submit" && o !== "reset" || e.removeAttribute("value") : o === "number" ? (t === 0 && e.value === "" || e.value != t) && (e.value = "" + an(t)) : e.value !== "" + an(t) && (e.value = "" + an(t)), t == null ? n == null ? r != null && e.removeAttribute("value") : mn(e, an(n)) : o === "number" && e.value == t ? mn(e, an(e.value)) : mn(e, an(t)), i == null && a != null && (e.defaultChecked = !!a), i != null && (e.checked = i && typeof i != "function" && typeof i != "symbol"), s != null && typeof s != "function" && typeof s != "symbol" && typeof s != "boolean" ? e.name = "" + an(s) : e.removeAttribute("name");
	}
	function pn(e, t, n, r, i, a, o, s) {
		if (a != null && typeof a != "function" && typeof a != "symbol" && typeof a != "boolean" && (e.type = a), t != null || n != null) {
			if (!(a !== "submit" && a !== "reset" || t != null)) {
				cn(e);
				return;
			}
			n = n == null ? "" : "" + an(n), t = t == null ? n : "" + an(t), s || t === e.value || (e.value = t), e.defaultValue = t;
		}
		r ??= i, r = typeof r != "function" && typeof r != "symbol" && !!r, e.checked = s ? e.checked : !!r, e.defaultChecked = !!r, o != null && typeof o != "function" && typeof o != "symbol" && typeof o != "boolean" && (e.name = o), cn(e);
	}
	function mn(e, t) {
		e.defaultValue !== "" + t && (e.defaultValue = "" + t);
	}
	function hn(e, t, n, r) {
		if (e = e.options, t) {
			t = {};
			for (var i = 0; i < n.length; i++) t["$" + n[i]] = !0;
			for (n = 0; n < e.length; n++) i = t.hasOwnProperty("$" + e[n].value), e[n].selected !== i && (e[n].selected = i), i && r && (e[n].defaultSelected = !0);
		} else {
			for (n = "" + an(n), t = null, i = 0; i < e.length; i++) {
				if (e[i].value === n) {
					e[i].selected = !0, r && (e[i].defaultSelected = !0);
					return;
				}
				t !== null || e[i].disabled || (t = e[i]);
			}
			t !== null && (t.selected = !0);
		}
	}
	function gn(e, t, n) {
		if (t != null && (t = "" + an(t), t !== e.value && (e.value = t), n == null)) {
			e.defaultValue !== t && (e.defaultValue = t);
			return;
		}
		e.defaultValue = n == null ? "" : "" + an(n);
	}
	function _n(e, t, n, r) {
		if (t == null) {
			if (r != null) {
				if (n != null) throw Error(i(92));
				if (we(r)) {
					if (1 < r.length) throw Error(i(93));
					r = r[0];
				}
				n = r;
			}
			n ??= "", t = n;
		}
		n = an(t), e.defaultValue = n, r = e.textContent, r === n && r !== "" && r !== null && (e.value = r), cn(e);
	}
	function vn(e, t) {
		if (t) {
			var n = e.firstChild;
			if (n && n === e.lastChild && n.nodeType === 3) {
				n.nodeValue = t;
				return;
			}
		}
		e.textContent = t;
	}
	var yn = new Set("animationIterationCount aspectRatio borderImageOutset borderImageSlice borderImageWidth boxFlex boxFlexGroup boxOrdinalGroup columnCount columns flex flexGrow flexPositive flexShrink flexNegative flexOrder gridArea gridRow gridRowEnd gridRowSpan gridRowStart gridColumn gridColumnEnd gridColumnSpan gridColumnStart fontWeight lineClamp lineHeight opacity order orphans scale tabSize widows zIndex zoom fillOpacity floodOpacity stopOpacity strokeDasharray strokeDashoffset strokeMiterlimit strokeOpacity strokeWidth MozAnimationIterationCount MozBoxFlex MozBoxFlexGroup MozLineClamp msAnimationIterationCount msFlex msZoom msFlexGrow msFlexNegative msFlexOrder msFlexPositive msFlexShrink msGridColumn msGridColumnSpan msGridRow msGridRowSpan WebkitAnimationIterationCount WebkitBoxFlex WebKitBoxFlexGroup WebkitBoxOrdinalGroup WebkitColumnCount WebkitColumns WebkitFlex WebkitFlexGrow WebkitFlexPositive WebkitFlexShrink WebkitLineClamp".split(" "));
	function bn(e, t, n) {
		var r = t.indexOf("--") === 0;
		n == null || typeof n == "boolean" || n === "" ? r ? e.setProperty(t, "") : t === "float" ? e.cssFloat = "" : e[t] = "" : r ? e.setProperty(t, n) : typeof n != "number" || n === 0 || yn.has(t) ? t === "float" ? e.cssFloat = n : e[t] = ("" + n).trim() : e[t] = n + "px";
	}
	function xn(e, t, n) {
		if (t != null && typeof t != "object") throw Error(i(62));
		if (e = e.style, n != null) {
			for (var r in n) !n.hasOwnProperty(r) || t != null && t.hasOwnProperty(r) || (r.indexOf("--") === 0 ? e.setProperty(r, "") : r === "float" ? e.cssFloat = "" : e[r] = "", j = !0);
			for (var a in t) r = t[a], t.hasOwnProperty(a) && n[a] !== r && (bn(e, a, r), j = !0);
		} else for (var o in t) t.hasOwnProperty(o) && bn(e, o, t[o]);
	}
	function Sn(e) {
		if (e.indexOf("-") === -1) return !1;
		switch (e) {
			case "annotation-xml":
			case "color-profile":
			case "font-face":
			case "font-face-src":
			case "font-face-uri":
			case "font-face-format":
			case "font-face-name":
			case "missing-glyph": return !1;
			default: return !0;
		}
	}
	var Cn = /* @__PURE__ */ new Map([
		["acceptCharset", "accept-charset"],
		["htmlFor", "for"],
		["httpEquiv", "http-equiv"],
		["crossOrigin", "crossorigin"],
		["accentHeight", "accent-height"],
		["alignmentBaseline", "alignment-baseline"],
		["arabicForm", "arabic-form"],
		["baselineShift", "baseline-shift"],
		["capHeight", "cap-height"],
		["clipPath", "clip-path"],
		["clipRule", "clip-rule"],
		["colorInterpolation", "color-interpolation"],
		["colorInterpolationFilters", "color-interpolation-filters"],
		["colorProfile", "color-profile"],
		["colorRendering", "color-rendering"],
		["dominantBaseline", "dominant-baseline"],
		["enableBackground", "enable-background"],
		["fillOpacity", "fill-opacity"],
		["fillRule", "fill-rule"],
		["floodColor", "flood-color"],
		["floodOpacity", "flood-opacity"],
		["fontFamily", "font-family"],
		["fontSize", "font-size"],
		["fontSizeAdjust", "font-size-adjust"],
		["fontStretch", "font-stretch"],
		["fontStyle", "font-style"],
		["fontVariant", "font-variant"],
		["fontWeight", "font-weight"],
		["glyphName", "glyph-name"],
		["glyphOrientationHorizontal", "glyph-orientation-horizontal"],
		["glyphOrientationVertical", "glyph-orientation-vertical"],
		["horizAdvX", "horiz-adv-x"],
		["horizOriginX", "horiz-origin-x"],
		["imageRendering", "image-rendering"],
		["letterSpacing", "letter-spacing"],
		["lightingColor", "lighting-color"],
		["markerEnd", "marker-end"],
		["markerMid", "marker-mid"],
		["markerStart", "marker-start"],
		["maskType", "mask-type"],
		["overlinePosition", "overline-position"],
		["overlineThickness", "overline-thickness"],
		["paintOrder", "paint-order"],
		["panose-1", "panose-1"],
		["pointerEvents", "pointer-events"],
		["renderingIntent", "rendering-intent"],
		["shapeRendering", "shape-rendering"],
		["stopColor", "stop-color"],
		["stopOpacity", "stop-opacity"],
		["strikethroughPosition", "strikethrough-position"],
		["strikethroughThickness", "strikethrough-thickness"],
		["strokeDasharray", "stroke-dasharray"],
		["strokeDashoffset", "stroke-dashoffset"],
		["strokeLinecap", "stroke-linecap"],
		["strokeLinejoin", "stroke-linejoin"],
		["strokeMiterlimit", "stroke-miterlimit"],
		["strokeOpacity", "stroke-opacity"],
		["strokeWidth", "stroke-width"],
		["textAnchor", "text-anchor"],
		["textDecoration", "text-decoration"],
		["textRendering", "text-rendering"],
		["transformOrigin", "transform-origin"],
		["underlinePosition", "underline-position"],
		["underlineThickness", "underline-thickness"],
		["unicodeBidi", "unicode-bidi"],
		["unicodeRange", "unicode-range"],
		["unitsPerEm", "units-per-em"],
		["vAlphabetic", "v-alphabetic"],
		["vHanging", "v-hanging"],
		["vIdeographic", "v-ideographic"],
		["vMathematical", "v-mathematical"],
		["vectorEffect", "vector-effect"],
		["vertAdvY", "vert-adv-y"],
		["vertOriginX", "vert-origin-x"],
		["vertOriginY", "vert-origin-y"],
		["wordSpacing", "word-spacing"],
		["writingMode", "writing-mode"],
		["xmlnsXlink", "xmlns:xlink"],
		["xHeight", "x-height"]
	]), wn = /^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i;
	function Tn(e) {
		return wn.test("" + e) ? "javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')" : e;
	}
	function En() {}
	var Dn = null;
	function On(e) {
		return e = e.target || e.srcElement || window, e.correspondingUseElement && (e = e.correspondingUseElement), e.nodeType === 3 ? e.parentNode : e;
	}
	var kn = null, An = null;
	function jn(e) {
		var t = Vt(e);
		if (t && (e = t.stateNode)) {
			var n = e[jt] || null;
			a: switch (e = t.stateNode, t.type) {
				case "input":
					if (fn(e, n.value, n.defaultValue, n.defaultValue, n.checked, n.defaultChecked, n.type, n.name), t = n.name, n.type === "radio" && t != null) {
						for (n = e; n.parentNode;) n = n.parentNode;
						for (n = n.querySelectorAll("input[name=\"" + dn("" + t) + "\"][type=\"radio\"]"), t = 0; t < n.length; t++) {
							var r = n[t];
							if (r !== e && r.form === e.form) {
								var a = r[jt] || null;
								if (!a) throw Error(i(90));
								fn(r, a.value, a.defaultValue, a.defaultValue, a.checked, a.defaultChecked, a.type, a.name);
							}
						}
						for (t = 0; t < n.length; t++) r = n[t], r.form === e.form && ln(r);
					}
					break a;
				case "textarea":
					gn(e, n.value, n.defaultValue);
					break a;
				case "select": t = n.value, t != null && hn(e, !!n.multiple, t, !1);
			}
		}
	}
	var Mn = !1;
	function Nn(e, t, n) {
		if (Mn) return e(t, n);
		Mn = !0;
		try {
			return e(t);
		} finally {
			if (Mn = !1, (kn !== null || An !== null) && (zd(), kn && (t = kn, e = An, An = kn = null, jn(t), e))) for (t = 0; t < e.length; t++) jn(e[t]);
		}
	}
	function Pn(e, t) {
		var n = e.stateNode;
		if (n === null) return null;
		var r = n[jt] || null;
		if (r === null) return null;
		n = r[t];
		a: switch (t) {
			case "onClick":
			case "onClickCapture":
			case "onDoubleClick":
			case "onDoubleClickCapture":
			case "onMouseDown":
			case "onMouseDownCapture":
			case "onMouseMove":
			case "onMouseMoveCapture":
			case "onMouseUp":
			case "onMouseUpCapture":
			case "onMouseEnter":
				(r = !r.disabled) || (e = e.type, r = e !== "button" && e !== "input" && e !== "select" && e !== "textarea"), e = !r;
				break a;
			default: e = !1;
		}
		if (e) return null;
		if (n && typeof n != "function") throw Error(i(231, t, typeof n));
		return n;
	}
	var Fn = typeof window < "u" && window.document !== void 0 && window.document.createElement !== void 0, In = !1;
	if (Fn) try {
		var Ln = {};
		Object.defineProperty(Ln, "passive", { get: function() {
			In = !0;
		} }), window.addEventListener("test", Ln, Ln), window.removeEventListener("test", Ln, Ln);
	} catch {
		In = !1;
	}
	var Rn = null, zn = null, Bn = null;
	function Vn() {
		if (Bn) return Bn;
		var e, t = zn, n = t.length, r, i = "value" in Rn ? Rn.value : Rn.textContent, a = i.length;
		for (e = 0; e < n && t[e] === i[e]; e++);
		var o = n - e;
		for (r = 1; r <= o && t[n - r] === i[a - r]; r++);
		return Bn = i.slice(e, 1 < r ? 1 - r : void 0);
	}
	function Hn(e) {
		var t = e.keyCode;
		return "charCode" in e ? (e = e.charCode, e === 0 && t === 13 && (e = 13)) : e = t, e === 10 && (e = 13), 32 <= e || e === 13 ? e : 0;
	}
	function Un() {
		return !0;
	}
	function Wn() {
		return !1;
	}
	function Gn(e) {
		function t(t, n, r, i, a) {
			for (var o in this._reactName = t, this._targetInst = r, this.type = n, this.nativeEvent = i, this.target = a, this.currentTarget = null, e) e.hasOwnProperty(o) && (t = e[o], this[o] = t ? t(i) : i[o]);
			return this.isDefaultPrevented = (i.defaultPrevented == null ? !1 === i.returnValue : i.defaultPrevented) ? Un : Wn, this.isPropagationStopped = Wn, this;
		}
		return C(t.prototype, {
			preventDefault: function() {
				this.defaultPrevented = !0;
				var e = this.nativeEvent;
				e && (e.preventDefault ? e.preventDefault() : typeof e.returnValue != "unknown" && (e.returnValue = !1), this.isDefaultPrevented = Un);
			},
			stopPropagation: function() {
				var e = this.nativeEvent;
				e && (e.stopPropagation ? e.stopPropagation() : typeof e.cancelBubble != "unknown" && (e.cancelBubble = !0), this.isPropagationStopped = Un);
			},
			persist: function() {},
			isPersistent: Un
		}), t;
	}
	var Kn = {
		eventPhase: 0,
		bubbles: 0,
		cancelable: 0,
		timeStamp: function(e) {
			return e.timeStamp || Date.now();
		},
		defaultPrevented: 0,
		isTrusted: 0
	}, qn = Gn(Kn), Jn = C({}, Kn, {
		view: 0,
		detail: 0
	}), Yn = Gn(Jn), Xn, Zn, Qn, $n = C({}, Jn, {
		screenX: 0,
		screenY: 0,
		clientX: 0,
		clientY: 0,
		pageX: 0,
		pageY: 0,
		ctrlKey: 0,
		shiftKey: 0,
		altKey: 0,
		metaKey: 0,
		getModifierState: ur,
		button: 0,
		buttons: 0,
		relatedTarget: function(e) {
			return e.relatedTarget === void 0 ? e.fromElement === e.srcElement ? e.toElement : e.fromElement : e.relatedTarget;
		},
		movementX: function(e) {
			return "movementX" in e ? e.movementX : (e !== Qn && (Qn && e.type === "mousemove" ? (Xn = e.screenX - Qn.screenX, Zn = e.screenY - Qn.screenY) : Zn = Xn = 0, Qn = e), Xn);
		},
		movementY: function(e) {
			return "movementY" in e ? e.movementY : Zn;
		}
	}), er = Gn($n), tr = Gn(C({}, $n, { dataTransfer: 0 })), nr = Gn(C({}, Jn, { relatedTarget: 0 })), rr = Gn(C({}, Kn, {
		animationName: 0,
		elapsedTime: 0,
		pseudoElement: 0
	})), ir = Gn(C({}, Kn, { clipboardData: function(e) {
		return "clipboardData" in e ? e.clipboardData : window.clipboardData;
	} })), ar = Gn(C({}, Kn, { data: 0 })), or = {
		Esc: "Escape",
		Spacebar: " ",
		Left: "ArrowLeft",
		Up: "ArrowUp",
		Right: "ArrowRight",
		Down: "ArrowDown",
		Del: "Delete",
		Win: "OS",
		Menu: "ContextMenu",
		Apps: "ContextMenu",
		Scroll: "ScrollLock",
		MozPrintableKey: "Unidentified"
	}, sr = {
		8: "Backspace",
		9: "Tab",
		12: "Clear",
		13: "Enter",
		16: "Shift",
		17: "Control",
		18: "Alt",
		19: "Pause",
		20: "CapsLock",
		27: "Escape",
		32: " ",
		33: "PageUp",
		34: "PageDown",
		35: "End",
		36: "Home",
		37: "ArrowLeft",
		38: "ArrowUp",
		39: "ArrowRight",
		40: "ArrowDown",
		45: "Insert",
		46: "Delete",
		112: "F1",
		113: "F2",
		114: "F3",
		115: "F4",
		116: "F5",
		117: "F6",
		118: "F7",
		119: "F8",
		120: "F9",
		121: "F10",
		122: "F11",
		123: "F12",
		144: "NumLock",
		145: "ScrollLock",
		224: "Meta"
	}, cr = {
		Alt: "altKey",
		Control: "ctrlKey",
		Meta: "metaKey",
		Shift: "shiftKey"
	};
	function lr(e) {
		var t = this.nativeEvent;
		return t.getModifierState ? t.getModifierState(e) : (e = cr[e]) ? !!t[e] : !1;
	}
	function ur() {
		return lr;
	}
	var dr = Gn(C({}, Jn, {
		key: function(e) {
			if (e.key) {
				var t = or[e.key] || e.key;
				if (t !== "Unidentified") return t;
			}
			return e.type === "keypress" ? (e = Hn(e), e === 13 ? "Enter" : String.fromCharCode(e)) : e.type === "keydown" || e.type === "keyup" ? sr[e.keyCode] || "Unidentified" : "";
		},
		code: 0,
		location: 0,
		ctrlKey: 0,
		shiftKey: 0,
		altKey: 0,
		metaKey: 0,
		repeat: 0,
		locale: 0,
		getModifierState: ur,
		charCode: function(e) {
			return e.type === "keypress" ? Hn(e) : 0;
		},
		keyCode: function(e) {
			return e.type === "keydown" || e.type === "keyup" ? e.keyCode : 0;
		},
		which: function(e) {
			return e.type === "keypress" ? Hn(e) : e.type === "keydown" || e.type === "keyup" ? e.keyCode : 0;
		}
	})), fr = Gn(C({}, $n, {
		pointerId: 0,
		width: 0,
		height: 0,
		pressure: 0,
		tangentialPressure: 0,
		tiltX: 0,
		tiltY: 0,
		twist: 0,
		pointerType: 0,
		isPrimary: 0
	})), pr = Gn(C({}, Kn, { submitter: 0 })), mr = Gn(C({}, Jn, {
		touches: 0,
		targetTouches: 0,
		changedTouches: 0,
		altKey: 0,
		metaKey: 0,
		ctrlKey: 0,
		shiftKey: 0,
		getModifierState: ur
	})), hr = Gn(C({}, Kn, {
		propertyName: 0,
		elapsedTime: 0,
		pseudoElement: 0
	})), gr = Gn(C({}, $n, {
		deltaX: function(e) {
			return "deltaX" in e ? e.deltaX : "wheelDeltaX" in e ? -e.wheelDeltaX : 0;
		},
		deltaY: function(e) {
			return "deltaY" in e ? e.deltaY : "wheelDeltaY" in e ? -e.wheelDeltaY : "wheelDelta" in e ? -e.wheelDelta : 0;
		},
		deltaZ: 0,
		deltaMode: 0
	})), _r = Gn(C({}, Kn, {
		newState: 0,
		oldState: 0,
		source: 0
	})), vr = [
		9,
		13,
		27,
		32
	], yr = Fn && "CompositionEvent" in window, br = null;
	Fn && "documentMode" in document && (br = document.documentMode);
	var xr = Fn && "TextEvent" in window && !br, Sr = Fn && (!yr || br && 8 < br && 11 >= br), Cr = " ", wr = !1;
	function Tr(e, t) {
		switch (e) {
			case "keyup": return vr.indexOf(t.keyCode) !== -1;
			case "keydown": return t.keyCode !== 229;
			case "keypress":
			case "mousedown":
			case "focusout": return !0;
			default: return !1;
		}
	}
	function Er(e) {
		return e = e.detail, typeof e == "object" && "data" in e ? e.data : null;
	}
	var Dr = !1;
	function Or(e, t) {
		switch (e) {
			case "compositionend": return Er(t);
			case "keypress": return t.which === 32 ? (wr = !0, Cr) : null;
			case "textInput": return e = t.data, e === Cr && wr ? null : e;
			default: return null;
		}
	}
	function kr(e, t) {
		if (Dr) return e === "compositionend" || !yr && Tr(e, t) ? (e = Vn(), Bn = zn = Rn = null, Dr = !1, e) : null;
		switch (e) {
			case "paste": return null;
			case "keypress":
				if (!(t.ctrlKey || t.altKey || t.metaKey) || t.ctrlKey && t.altKey) {
					if (t.char && 1 < t.char.length) return t.char;
					if (t.which) return String.fromCharCode(t.which);
				}
				return null;
			case "compositionend": return Sr && t.locale !== "ko" ? null : t.data;
			default: return null;
		}
	}
	var Ar = {
		color: !0,
		date: !0,
		datetime: !0,
		"datetime-local": !0,
		email: !0,
		month: !0,
		number: !0,
		password: !0,
		range: !0,
		search: !0,
		tel: !0,
		text: !0,
		time: !0,
		url: !0,
		week: !0
	};
	function jr(e) {
		var t = e && e.nodeName && e.nodeName.toLowerCase();
		return t === "input" ? !!Ar[e.type] : t === "textarea";
	}
	function Mr(e, t, n, r) {
		kn ? An ? An.push(r) : An = [r] : kn = r, t = Jf(t, "onChange"), 0 < t.length && (n = new qn("onChange", "change", null, n, r), e.push({
			event: n,
			listeners: t
		}));
	}
	var Nr = null, Pr = null;
	function Fr(e) {
		Vf(e, 0);
	}
	function Ir(e) {
		if (ln(Ht(e))) return e;
	}
	function Lr(e, t) {
		if (e === "change") return t;
	}
	var Rr = !1;
	if (Fn) {
		var zr;
		if (Fn) {
			var Br = "oninput" in document;
			if (!Br) {
				var Vr = document.createElement("div");
				Vr.setAttribute("oninput", "return;"), Br = typeof Vr.oninput == "function";
			}
			zr = Br;
		} else zr = !1;
		Rr = zr && (!document.documentMode || 9 < document.documentMode);
	}
	function Hr() {
		Nr && (Nr.detachEvent("onpropertychange", Ur), Pr = Nr = null);
	}
	function Ur(e) {
		if (e.propertyName === "value" && Ir(Pr)) {
			var t = [];
			Mr(t, Pr, e, On(e)), Nn(Fr, t);
		}
	}
	function Wr(e, t, n) {
		e === "focusin" ? (Hr(), Nr = t, Pr = n, Nr.attachEvent("onpropertychange", Ur)) : e === "focusout" && Hr();
	}
	function Gr(e) {
		if (e === "selectionchange" || e === "keyup" || e === "keydown") return Ir(Pr);
	}
	function Kr(e, t) {
		if (e === "click") return Ir(t);
	}
	function qr(e, t) {
		if (e === "input" || e === "change") return Ir(t);
	}
	function Jr(e, t) {
		return e === t && (e !== 0 || 1 / e == 1 / t) || e !== e && t !== t;
	}
	var Yr = typeof Object.is == "function" ? Object.is : Jr;
	function Xr(e, t) {
		if (Yr(e, t)) return !0;
		if (typeof e != "object" || !e || typeof t != "object" || !t) return !1;
		var n = Object.keys(e), r = Object.keys(t);
		if (n.length !== r.length) return !1;
		for (r = 0; r < n.length; r++) {
			var i = n[r];
			if (!We.call(t, i) || !Yr(e[i], t[i])) return !1;
		}
		return !0;
	}
	function Zr(e) {
		if (e ||= typeof document < "u" ? document : void 0, e === void 0) return null;
		try {
			return e.activeElement || e.body;
		} catch {
			return e.body;
		}
	}
	function Qr(e) {
		for (; e && e.firstChild;) e = e.firstChild;
		return e;
	}
	function $r(e, t) {
		var n = Qr(e);
		e = 0;
		for (var r; n;) {
			if (n.nodeType === 3) {
				if (r = e + n.textContent.length, e <= t && r >= t) return {
					node: n,
					offset: t - e
				};
				e = r;
			}
			a: {
				for (; n;) {
					if (n.nextSibling) {
						n = n.nextSibling;
						break a;
					}
					n = n.parentNode;
				}
				n = void 0;
			}
			n = Qr(n);
		}
	}
	function ei(e, t) {
		return e && t ? e === t ? !0 : e && e.nodeType === 3 ? !1 : t && t.nodeType === 3 ? ei(e, t.parentNode) : "contains" in e ? e.contains(t) : e.compareDocumentPosition ? !!(e.compareDocumentPosition(t) & 16) : !1 : !1;
	}
	function ti(e) {
		e = e != null && e.ownerDocument != null && e.ownerDocument.defaultView != null ? e.ownerDocument.defaultView : window;
		for (var t = Zr(e.document); t instanceof e.HTMLIFrameElement;) {
			try {
				var n = typeof t.contentWindow.location.href == "string";
			} catch {
				n = !1;
			}
			if (n) e = t.contentWindow;
			else break;
			t = Zr(e.document);
		}
		return t;
	}
	function ni(e) {
		var t = e && e.nodeName && e.nodeName.toLowerCase();
		return t && (t === "input" && (e.type === "text" || e.type === "search" || e.type === "tel" || e.type === "url" || e.type === "password") || t === "textarea" || e.contentEditable === "true");
	}
	var ri = Fn && "documentMode" in document && 11 >= document.documentMode, ii = null, ai = null, oi = null, si = !1;
	function ci(e, t, n) {
		var r = n.window === n ? n.document : n.nodeType === 9 ? n : n.ownerDocument;
		si || ii == null || ii !== Zr(r) || (r = ii, "selectionStart" in r && ni(r) ? r = {
			start: r.selectionStart,
			end: r.selectionEnd
		} : (r = (r.ownerDocument && r.ownerDocument.defaultView || window).getSelection(), r = {
			anchorNode: r.anchorNode,
			anchorOffset: r.anchorOffset,
			focusNode: r.focusNode,
			focusOffset: r.focusOffset
		}), oi && Xr(oi, r) || (oi = r, r = Jf(ai, "onSelect"), 0 < r.length && (t = new qn("onSelect", "select", null, t, n), e.push({
			event: t,
			listeners: r
		}), t.target = ii)));
	}
	function li(e, t) {
		var n = {};
		return n[e.toLowerCase()] = t.toLowerCase(), n["Webkit" + e] = "webkit" + t, n["Moz" + e] = "moz" + t, n;
	}
	var ui = {
		animationend: li("Animation", "AnimationEnd"),
		animationiteration: li("Animation", "AnimationIteration"),
		animationstart: li("Animation", "AnimationStart"),
		transitionrun: li("Transition", "TransitionRun"),
		transitionstart: li("Transition", "TransitionStart"),
		transitioncancel: li("Transition", "TransitionCancel"),
		transitionend: li("Transition", "TransitionEnd")
	}, di = {}, fi = {};
	Fn && (fi = document.createElement("div").style, "AnimationEvent" in window || (delete ui.animationend.animation, delete ui.animationiteration.animation, delete ui.animationstart.animation), "TransitionEvent" in window || delete ui.transitionend.transition);
	function pi(e) {
		if (di[e]) return di[e];
		if (!ui[e]) return e;
		var t = ui[e], n;
		for (n in t) if (t.hasOwnProperty(n) && n in fi) return di[e] = t[n];
		return e;
	}
	var mi = pi("animationend"), hi = pi("animationiteration"), gi = pi("animationstart"), _i = pi("transitionrun"), vi = pi("transitionstart"), yi = pi("transitioncancel"), bi = pi("transitionend"), xi = /* @__PURE__ */ new Map(), Si = "abort auxClick beforeToggle cancel canPlay canPlayThrough click close contextMenu copy cut drag dragEnd dragEnter dragExit dragLeave dragOver dragStart drop durationChange emptied encrypted ended error fullscreenChange fullscreenError gotPointerCapture input invalid keyDown keyPress keyUp load loadedData loadedMetadata loadStart lostPointerCapture mouseDown mouseMove mouseOut mouseOver mouseUp paste pause play playing pointerCancel pointerDown pointerMove pointerOut pointerOver pointerUp progress rateChange reset resize seeked seeking stalled submit suspend timeUpdate touchCancel touchEnd touchStart volumeChange scroll toggle touchMove waiting wheel".split(" ");
	Si.push("scrollEnd");
	function Ci(e, t) {
		xi.set(e, t), Jt(t, [e]);
	}
	var wi = 0;
	function Ti(e, t) {
		if (e.name != null && e.name !== "auto") return e.name;
		if (t.autoName !== null) return t.autoName;
		e = bd.identifierPrefix;
		var n = wi++;
		return e = "_" + e + "t_" + n.toString(32) + "_", t.autoName = e;
	}
	function Ei(e) {
		if (e == null || typeof e == "string") return e;
		var t = null, n = Od;
		if (n !== null) for (var r = 0; r < n.length; r++) {
			var i = e[n[r]];
			if (i != null) {
				if (i === "none") return "none";
				t = t == null ? i : t + (" " + i);
			}
		}
		return t ?? e.default;
	}
	function Di(e, t) {
		return e = Ei(e), t = Ei(t), t == null ? e === "auto" ? null : e : t === "auto" ? null : t;
	}
	var Oi = typeof reportError == "function" ? reportError : function(e) {
		if (typeof window == "object" && typeof window.ErrorEvent == "function") {
			var t = new window.ErrorEvent("error", {
				bubbles: !0,
				cancelable: !0,
				message: typeof e == "object" && e && typeof e.message == "string" ? String(e.message) : String(e),
				error: e
			});
			if (!window.dispatchEvent(t)) return;
		} else if (typeof process == "object" && typeof process.emit == "function") {
			process.emit("uncaughtException", e);
			return;
		}
		console.error(e);
	}, ki = [], Ai = 0, ji = 0;
	function Mi() {
		for (var e = Ai, t = ji = Ai = 0; t < e;) {
			var n = ki[t];
			ki[t++] = null;
			var r = ki[t];
			ki[t++] = null;
			var i = ki[t];
			ki[t++] = null;
			var a = ki[t];
			if (ki[t++] = null, r !== null && i !== null) {
				var o = r.pending;
				o === null ? i.next = i : (i.next = o.next, o.next = i), r.pending = i;
			}
			a !== 0 && Ii(n, i, a);
		}
	}
	function Ni(e, t, n, r) {
		ki[Ai++] = e, ki[Ai++] = t, ki[Ai++] = n, ki[Ai++] = r, ji |= r, e.lanes |= r, e = e.alternate, e !== null && (e.lanes |= r);
	}
	function Pi(e, t, n, r) {
		return Ni(e, t, n, r), Li(e);
	}
	function Fi(e, t) {
		return Ni(e, null, null, t), Li(e);
	}
	function Ii(e, t, n) {
		e.lanes |= n;
		var r = e.alternate;
		r !== null && (r.lanes |= n);
		for (var i = !1, a = e.return; a !== null;) a.childLanes |= n, r = a.alternate, r !== null && (r.childLanes |= n), a.tag === 22 && (e = a.stateNode, e === null || e._visibility & 1 || (i = !0)), e = a, a = a.return;
		return e.tag === 3 ? (a = e.stateNode, i && t !== null && (i = 31 - ot(n), e = a.hiddenUpdates, r = e[i], r === null ? e[i] = [t] : r.push(t), t.lane = n | 536870912), a) : null;
	}
	function Li(e) {
		if (50 < kd) throw kd = 0, Ad = null, Error(i(185));
		for (var t = e.return; t !== null;) e = t, t = e.return;
		return e.tag === 3 ? e.stateNode : null;
	}
	var Ri = {};
	function zi(e, t, n, r) {
		this.tag = e, this.key = n, this.sibling = this.child = this.return = this.stateNode = this.type = this.elementType = null, this.index = 0, this.refCleanup = this.ref = null, this.pendingProps = t, this.dependencies = this.memoizedState = this.updateQueue = this.memoizedProps = null, this.mode = r, this.subtreeFlags = this.flags = 0, this.deletions = null, this.childLanes = this.lanes = 0, this.alternate = null;
	}
	function Bi(e, t, n, r) {
		return new zi(e, t, n, r);
	}
	function Vi(e) {
		return e = e.prototype, !(!e || !e.isReactComponent);
	}
	function Hi(e, t) {
		var n = e.alternate;
		return n === null ? (n = Bi(e.tag, t, e.key, e.mode), n.elementType = e.elementType, n.type = e.type, n.stateNode = e.stateNode, n.alternate = e, e.alternate = n) : (n.pendingProps = t, n.type = e.type, n.flags = 0, n.subtreeFlags = 0, n.deletions = null), n.flags = e.flags & 1206910976, n.childLanes = e.childLanes, n.lanes = e.lanes, n.child = e.child, n.memoizedProps = e.memoizedProps, n.memoizedState = e.memoizedState, n.updateQueue = e.updateQueue, t = e.dependencies, n.dependencies = t === null ? null : {
			lanes: t.lanes,
			firstContext: t.firstContext
		}, n.sibling = e.sibling, n.index = e.index, n.ref = e.ref, n.refCleanup = e.refCleanup, n;
	}
	function Ui(e, t) {
		e.flags &= 1206910978;
		var n = e.alternate;
		return n === null ? (e.childLanes = 0, e.lanes = t, e.child = null, e.subtreeFlags = 0, e.memoizedProps = null, e.memoizedState = null, e.updateQueue = null, e.dependencies = null, e.stateNode = null) : (e.childLanes = n.childLanes, e.lanes = n.lanes, e.child = n.child, e.subtreeFlags = 0, e.deletions = null, e.memoizedProps = n.memoizedProps, e.memoizedState = n.memoizedState, e.updateQueue = n.updateQueue, e.type = n.type, t = n.dependencies, e.dependencies = t === null ? null : {
			lanes: t.lanes,
			firstContext: t.firstContext
		}), e;
	}
	function Wi(e, t, n, r, a, o) {
		var s = 0;
		if (r = e, typeof r == "function") Vi(r) && (s = 1);
		else if (typeof r == "string") s = qm(e, n, ke.current) ? 26 : e === "html" || e === "head" || e === "body" ? 27 : 5;
		else a: switch (r) {
			case he: return e = Bi(31, n, t, a), e.elementType = he, e.lanes = o, e;
			case w: return Gi(n.children, a, o, t);
			case se:
				s = 8, a |= 24;
				break;
			case ce: return e = Bi(12, n, t, a | 2), e.elementType = ce, e.lanes = o, e;
			case de: return e = Bi(13, n, t, a), e.elementType = de, e.lanes = o, e;
			case fe: return e = Bi(19, n, t, a), e.elementType = fe, e.lanes = o, e;
			case ge:
			case ve: return e = a | 32, e = Bi(30, n, t, e), e.elementType = ve, e.lanes = o, e.stateNode = {
				autoName: null,
				paired: null,
				clones: null,
				ref: null
			}, e;
			default:
				if (typeof r == "object" && r) switch (r.$$typeof) {
					case ue:
						s = 10;
						break a;
					case le:
						s = 9;
						break a;
					case T:
						s = 11;
						break a;
					case pe:
						s = 14;
						break a;
					case me:
						s = 16, r = null;
						break a;
				}
				s = 29, n = Error(i(130, e === null ? "null" : typeof e, "")), r = null;
		}
		return t = Bi(s, n, t, a), t.elementType = e, t.type = r, t.lanes = o, t;
	}
	function Gi(e, t, n, r) {
		return e = Bi(7, e, r, t), e.lanes = n, e;
	}
	function Ki(e, t, n) {
		return e = Bi(6, e, null, t), e.lanes = n, e;
	}
	function qi(e) {
		var t = Bi(18, null, null, 0);
		return t.stateNode = e, t;
	}
	function Ji(e, t, n) {
		return t = Bi(4, e.children === null ? [] : e.children, e.key, t), t.lanes = n, t.stateNode = {
			containerInfo: e.containerInfo,
			pendingChildren: null,
			implementation: e.implementation
		}, t;
	}
	var Yi = /* @__PURE__ */ new WeakMap();
	function Xi(e, t) {
		if (typeof e == "object" && e) {
			var n = Yi.get(e);
			return n === void 0 ? (t = {
				value: e,
				source: t,
				stack: Ue(t)
			}, Yi.set(e, t), t) : n;
		}
		return {
			value: e,
			source: t,
			stack: Ue(t)
		};
	}
	var Zi = [], Qi = 0, $i = null, ea = 0, ta = [], na = 0, ra = null, ia = 1, aa = "";
	function oa(e, t) {
		Zi[Qi++] = ea, Zi[Qi++] = $i, $i = e, ea = t;
	}
	function sa(e, t, n) {
		ta[na++] = ia, ta[na++] = aa, ta[na++] = ra, ra = e;
		var r = ia;
		e = aa;
		var i = 32 - ot(r) - 1;
		r &= ~(1 << i), n += 1;
		var a = 32 - ot(t) + i;
		if (30 < a) {
			var o = i - i % 5;
			a = (r & (1 << o) - 1).toString(32), r >>= o, i -= o, ia = 1 << 32 - ot(t) + i | n << i | r, aa = a + e;
		} else ia = 1 << a | n << i | r, aa = e;
	}
	function ca(e) {
		e.return !== null && (oa(e, 1), sa(e, 1, 0));
	}
	function la(e) {
		for (; e === $i;) $i = Zi[--Qi], Zi[Qi] = null, ea = Zi[--Qi], Zi[Qi] = null;
		for (; e === ra;) ra = ta[--na], ta[na] = null, aa = ta[--na], ta[na] = null, ia = ta[--na], ta[na] = null;
	}
	function ua(e, t) {
		ta[na++] = ia, ta[na++] = aa, ta[na++] = ra, ia = t.id, aa = t.overflow, ra = e;
	}
	var da = null, M = null, N = !1, fa = null, pa = !1, ma = Error(i(519));
	function ha(e) {
		throw xa(Xi(Error(i(418, 1 < arguments.length && arguments[1] !== void 0 && arguments[1] ? "text" : "HTML", "")), e)), ma;
	}
	function ga(e) {
		var t = e.stateNode, n = e.type, r = e.memoizedProps;
		switch (t[At] = e, t[jt] = r, n) {
			case "dialog":
				Q("cancel", t), Q("close", t);
				break;
			case "iframe":
			case "object":
			case "embed":
				Q("load", t);
				break;
			case "video":
			case "audio":
				for (n = 0; n < zf.length; n++) Q(zf[n], t);
				break;
			case "source":
				Q("error", t);
				break;
			case "img":
			case "image":
			case "link":
				Q("error", t), Q("load", t);
				break;
			case "details":
				Q("toggle", t);
				break;
			case "input":
				Q("invalid", t), pn(t, r.value, r.defaultValue, r.checked, r.defaultChecked, r.type, r.name, !0);
				break;
			case "select":
				Q("invalid", t);
				break;
			case "textarea": Q("invalid", t), _n(t, r.value, r.defaultValue, r.children);
		}
		n = r.children, typeof n != "string" && typeof n != "number" && typeof n != "bigint" || t.textContent === "" + n || !0 === r.suppressHydrationWarning || ep(t.textContent, n) ? (r.popover != null && (Q("beforetoggle", t), Q("toggle", t)), r.onScroll != null && Q("scroll", t), r.onScrollEnd != null && Q("scrollend", t), r.onClick != null && (t.onclick = En), t = !0) : t = !1, t || ha(e, !0);
	}
	function _a(e) {
		for (da = e.return; da;) switch (da.tag) {
			case 5:
			case 31:
			case 13:
				pa = !1;
				return;
			case 27:
			case 3:
				pa = !0;
				return;
			default: da = da.return;
		}
	}
	function va(e) {
		if (e !== da) return !1;
		if (!N) return _a(e), N = !0, !1;
		var t = e.tag, n;
		if ((n = t !== 3 && t !== 27) && ((n = t === 5) && (n = e.type, n = n === "form" || n === "button" || pp(e.type, e.memoizedProps)), n = !n), n && M && ha(e), _a(e), t === 13) {
			if (e = e.memoizedState, e = e === null ? null : e.dehydrated, !e) throw Error(i(317));
			M = dm(e);
		} else if (t === 31) {
			if (e = e.memoizedState, e = e === null ? null : e.dehydrated, !e) throw Error(i(317));
			M = dm(e);
		} else t === 27 ? (t = M, Sp(e.type) ? (e = um, um = null, M = e) : M = t) : M = da ? lm(e.stateNode.nextSibling) : null;
		return !0;
	}
	function ya() {
		M = da = null, N = !1;
	}
	function ba() {
		var e = fa;
		return e !== null && (pd === null ? pd = e : pd.push.apply(pd, e), fa = null), e;
	}
	function xa(e) {
		fa === null ? fa = [e] : fa.push(e);
	}
	var Sa = Oe(null), Ca = null, wa = null;
	function Ta(e, t, n) {
		k(Sa, t._currentValue), t._currentValue = n;
	}
	function Ea(e) {
		e._currentValue = Sa.current, O(Sa);
	}
	function Da(e, t, n) {
		for (; e !== null;) {
			var r = e.alternate;
			if ((e.childLanes & t) === t ? r !== null && (r.childLanes & t) !== t && (r.childLanes |= t) : (e.childLanes |= t, r !== null && (r.childLanes |= t)), e === n) break;
			e = e.return;
		}
	}
	function Oa(e, t, n, r) {
		var a = e.child;
		for (a !== null && (a.return = e); a !== null;) {
			var o = a.dependencies;
			if (o !== null) {
				var s = a.child;
				o = o.firstContext;
				a: for (; o !== null;) {
					var c = o;
					o = a;
					for (var l = 0; l < t.length; l++) if (c.context === t[l]) {
						o.lanes |= n, c = o.alternate, c !== null && (c.lanes |= n), Da(o.return, n, e), r || (s = null);
						break a;
					}
					o = c.next;
				}
			} else if (a.tag === 18) {
				if (s = a.return, s === null) throw Error(i(341));
				s.lanes |= n, o = s.alternate, o !== null && (o.lanes |= n), Da(s, n, e), s = null;
			} else a.tag === 13 && a.memoizedState !== null && a.memoizedState.dehydrated === null ? (a.lanes |= n, s = a.alternate, s !== null && (s.lanes |= n), Da(a.return, n, e), s = a.child, s = s === null ? null : s.sibling) : s = a.child;
			if (s !== null) s.return = a;
			else for (s = a; s !== null;) {
				if (s === e) {
					s = null;
					break;
				}
				if (a = s.sibling, a !== null) {
					a.return = s.return, s = a;
					break;
				}
				s = s.return;
			}
			a = s;
		}
	}
	function ka(e, t, n, r) {
		e = null;
		for (var a = t, o = !1; a !== null;) {
			if (!o) {
				if (a.flags & 524288) o = !0;
				else if (a.flags & 262144) break;
			}
			if (a.tag === 10) {
				var s = a.alternate;
				if (s === null) throw Error(i(387));
				if (s = s.memoizedProps, s !== null) {
					var c = a.type;
					Yr(a.pendingProps.value, s.value) || (e === null ? e = [c] : e.push(c));
				}
			} else if (a === Me.current) {
				if (s = a.alternate, s === null) throw Error(i(387));
				s.memoizedState.memoizedState !== a.memoizedState.memoizedState && (e === null ? e = [sh] : e.push(sh));
			}
			a = a.return;
		}
		return e !== null && Oa(t, e, n, r), t.flags |= 262144, e !== null;
	}
	function Aa(e) {
		for (e = e.firstContext; e !== null;) {
			if (!Yr(e.context._currentValue, e.memoizedValue)) return !0;
			e = e.next;
		}
		return !1;
	}
	function ja(e) {
		Ca = e, wa = null, e = e.dependencies, e !== null && (e.firstContext = null);
	}
	function Ma(e) {
		return Pa(Ca, e);
	}
	function Na(e, t) {
		return Ca === null && ja(e), Pa(e, t);
	}
	function Pa(e, t) {
		var n = t._currentValue;
		if (t = {
			context: t,
			memoizedValue: n,
			next: null
		}, wa === null) {
			if (e === null) throw Error(i(308));
			wa = t, e.dependencies = {
				lanes: 0,
				firstContext: t
			}, e.flags |= 524288;
		} else wa = wa.next = t;
		return n;
	}
	var Fa = typeof AbortController < "u" ? AbortController : function() {
		var e = [], t = this.signal = {
			aborted: !1,
			addEventListener: function(t, n) {
				e.push(n);
			}
		};
		this.abort = function() {
			t.aborted = !0, e.forEach(function(e) {
				return e();
			});
		};
	}, Ia = t.unstable_scheduleCallback, La = t.unstable_NormalPriority, P = {
		$$typeof: ue,
		Consumer: null,
		Provider: null,
		_currentValue: null,
		_currentValue2: null,
		_threadCount: 0
	};
	function Ra() {
		return {
			controller: new Fa(),
			data: /* @__PURE__ */ new Map(),
			refCount: 0
		};
	}
	function za(e) {
		e.refCount--, e.refCount === 0 && Ia(La, function() {
			e.controller.abort();
		});
	}
	function Ba(e, t) {
		if (e.pendingLanes & 4194048) {
			var n = e.transitionTypes;
			for (n === null && (n = e.transitionTypes = []), e = 0; e < t.length; e++) {
				var r = t[e];
				n.indexOf(r) === -1 && n.push(r);
			}
		}
	}
	var Va = null;
	function Ha(e) {
		var t = e.transitionTypes;
		return e.transitionTypes = null, t;
	}
	var Ua = null, Wa = 0, Ga = 0, Ka = null;
	function qa(e, t) {
		if (Ua === null) {
			var n = Ua = [];
			Wa = 0, Ga = Pf(), Ka = {
				status: "pending",
				value: void 0,
				then: function(e) {
					n.push(e);
				}
			};
		}
		return Wa++, t.then(Ja, Ja), t;
	}
	function Ja() {
		if (--Wa === 0 && (Va = null, Ua !== null)) {
			Ka !== null && (Ka.status = "fulfilled");
			var e = Ua;
			Ua = null, Ga = 0, Ka = null;
			for (var t = 0; t < e.length; t++) (0, e[t])();
		}
	}
	function Ya(e, t) {
		var n = [], r = {
			status: "pending",
			value: null,
			reason: null,
			then: function(e) {
				n.push(e);
			}
		};
		return e.then(function() {
			r.status = "fulfilled", r.value = t;
			for (var e = 0; e < n.length; e++) (0, n[e])(t);
		}, function(e) {
			for (r.status = "rejected", r.reason = e, e = 0; e < n.length; e++) (0, n[e])(void 0);
		}), r;
	}
	var Xa = E.S;
	E.S = function(e, t) {
		if (gd = A(), typeof t == "object" && t && typeof t.then == "function" && qa(e, t), Va !== null) for (var n = bf; n !== null;) Ba(n, Va), n = n.next;
		if (n = e.types, n !== null) {
			for (var r = bf; r !== null;) Ba(r, n), r = r.next;
			if (Ga !== 0) {
				r = Va, r === null && (r = Va = []);
				for (var i = 0; i < n.length; i++) {
					var a = n[i];
					r.indexOf(a) === -1 && r.push(a);
				}
			}
		}
		Xa !== null && Xa(e, t);
	};
	var Za = Oe(null);
	function Qa() {
		var e = Za.current;
		return e === null ? G.pooledCache : e;
	}
	function $a(e, t) {
		t === null ? k(Za, Za.current) : k(Za, t.pool);
	}
	function eo() {
		var e = Qa();
		return e === null ? null : {
			parent: P._currentValue,
			pool: e
		};
	}
	var to = Error(i(460)), no = Error(i(474)), ro = Error(i(542)), io = { then: function() {} };
	function ao(e) {
		return e = e.status, e === "fulfilled" || e === "rejected";
	}
	function oo(e, t, n) {
		switch (n = e[n], n === void 0 ? e.push(t) : n !== t && (t.then(En, En), t = n), t.status) {
			case "fulfilled": return t.value;
			case "rejected": throw e = t.reason, uo(e), e === void 0 && !("reason" in t) ? Error(i(600)) : e;
			default:
				if (typeof t.status == "string") t.then(En, En);
				else {
					if (e = G, e !== null && 100 < e.shellSuspendCounter) throw Error(i(482));
					e = t, e.status = "pending", e.then(function(e) {
						if (t.status === "pending") {
							var n = t;
							n.status = "fulfilled", n.value = e;
						}
					}, function(e) {
						if (t.status === "pending") {
							var n = t;
							n.status = "rejected", n.reason = e;
						}
					});
				}
				switch (t.status) {
					case "fulfilled": return t.value;
					case "rejected": throw e = t.reason, uo(e), e;
				}
				throw co = t, to;
		}
	}
	function so(e) {
		try {
			var t = e._init;
			return t(e._payload);
		} catch (e) {
			throw typeof e == "object" && e && typeof e.then == "function" ? (co = e, to) : e;
		}
	}
	var co = null;
	function lo() {
		if (co === null) throw Error(i(459));
		var e = co;
		return co = null, e;
	}
	function uo(e) {
		if (e === to || e === ro) throw Error(i(483));
	}
	var fo = null, po = 0;
	function mo(e) {
		var t = po;
		return po += 1, fo === null && (fo = []), oo(fo, e, t);
	}
	function ho(e, t) {
		t = t.props.ref, e.ref = t === void 0 ? null : t;
	}
	function go(e, t) {
		throw t.$$typeof === ie ? Error(i(525)) : (e = Object.prototype.toString.call(t), Error(i(31, e === "[object Object]" ? "object with keys {" + Object.keys(t).join(", ") + "}" : e)));
	}
	function _o(e) {
		function t(t, n) {
			if (e) {
				var r = t.deletions;
				r === null ? (t.deletions = [n], t.flags |= 16) : r.push(n);
			}
		}
		function n(n, r) {
			if (!e) return null;
			for (; r !== null;) t(n, r), r = r.sibling;
			return null;
		}
		function r(e) {
			for (var t = /* @__PURE__ */ new Map(); e !== null;) e.key === null ? t.set(e.index, e) : t.set(e.key, e), e = e.sibling;
			return t;
		}
		function a(e, t) {
			return e = Hi(e, t), e.index = 0, e.sibling = null, e;
		}
		function o(t, n, r) {
			return t.index = r, e ? (r = t.alternate, r === null ? (t.flags |= 134217730, n) : (r = r.index, r < n ? (t.flags |= 2, n) : r)) : (t.flags |= 1048576, n);
		}
		function s(t) {
			return e && t.alternate === null && (t.flags |= 134217730), t;
		}
		function c(e, t, n, r) {
			return t === null || t.tag !== 6 ? (t = Ki(n, e.mode, r), t.return = e, t) : (t = a(t, n), t.return = e, t);
		}
		function l(e, t, n, r) {
			var i = n.type;
			return i === w ? (e = d(e, t, n.props.children, r, n.key), ho(e, n), e) : t !== null && (t.elementType === i || typeof i == "object" && i && i.$$typeof === me && so(i) === t.type) ? (t = a(t, n.props), ho(t, n), t.return = e, t) : (t = Wi(n.type, n.key, n.props, null, e.mode, r), ho(t, n), t.return = e, t);
		}
		function u(e, t, n, r) {
			return t === null || t.tag !== 4 || t.stateNode.containerInfo !== n.containerInfo || t.stateNode.implementation !== n.implementation ? (t = Ji(n, e.mode, r), t.return = e, t) : (t = a(t, n.children || []), t.return = e, t);
		}
		function d(e, t, n, r, i) {
			return t === null || t.tag !== 7 ? (t = Gi(n, e.mode, r, i), t.return = e, t) : (t = a(t, n), t.return = e, t);
		}
		function f(e, t, n) {
			if (typeof t == "string" && t !== "" || typeof t == "number" || typeof t == "bigint") return t = Ki("" + t, e.mode, n), t.return = e, t;
			if (typeof t == "object" && t) {
				switch (t.$$typeof) {
					case ae: return n = Wi(t.type, t.key, t.props, null, e.mode, n), ho(n, t), n.return = e, n;
					case oe: return t = Ji(t, e.mode, n), t.return = e, t;
					case me: return t = so(t), f(e, t, n);
				}
				if (we(t) || xe(t)) return t = Gi(t, e.mode, n, null), t.return = e, t;
				if (typeof t.then == "function") return f(e, mo(t), n);
				if (t.$$typeof === ue) return f(e, Na(e, t), n);
				go(e, t);
			}
			return null;
		}
		function p(e, t, n, r) {
			var i = t === null ? null : t.key;
			if (typeof n == "string" && n !== "" || typeof n == "number" || typeof n == "bigint") return i === null ? c(e, t, "" + n, r) : null;
			if (typeof n == "object" && n) {
				switch (n.$$typeof) {
					case ae: return n.key === i ? l(e, t, n, r) : null;
					case oe: return n.key === i ? u(e, t, n, r) : null;
					case me: return n = so(n), p(e, t, n, r);
				}
				if (we(n) || xe(n)) return i === null ? d(e, t, n, r, null) : null;
				if (typeof n.then == "function") return p(e, t, mo(n), r);
				if (n.$$typeof === ue) return p(e, t, Na(e, n), r);
				go(e, n);
			}
			return null;
		}
		function m(e, t, n, r, i) {
			if (typeof r == "string" && r !== "" || typeof r == "number" || typeof r == "bigint") return e = e.get(n) || null, c(t, e, "" + r, i);
			if (typeof r == "object" && r) {
				switch (r.$$typeof) {
					case ae: return e = e.get(r.key === null ? n : r.key) || null, l(t, e, r, i);
					case oe: return e = e.get(r.key === null ? n : r.key) || null, u(t, e, r, i);
					case me: return r = so(r), m(e, t, n, r, i);
				}
				if (we(r) || xe(r)) return e = e.get(n) || null, d(t, e, r, i, null);
				if (typeof r.then == "function") return m(e, t, n, mo(r), i);
				if (r.$$typeof === ue) return m(e, t, n, Na(t, r), i);
				go(t, r);
			}
			return null;
		}
		function h(i, a, s, c) {
			for (var l = null, u = null, d = a, h = a = 0, g = null; d !== null && h < s.length; h++) {
				d.index > h ? (g = d, d = null) : g = d.sibling;
				var _ = p(i, d, s[h], c);
				if (_ === null) {
					d === null && (d = g);
					break;
				}
				e && d && _.alternate === null && t(i, d), a = o(_, a, h), u === null ? l = _ : u.sibling = _, u = _, d = g;
			}
			if (h === s.length) return n(i, d), N && oa(i, h), l;
			if (d === null) {
				for (; h < s.length; h++) d = f(i, s[h], c), d !== null && (a = o(d, a, h), u === null ? l = d : u.sibling = d, u = d);
				return N && oa(i, h), l;
			}
			for (d = r(d); h < s.length; h++) g = m(d, i, h, s[h], c), g !== null && (e && (_ = g.alternate, _ !== null && d.delete(_.key === null ? h : _.key)), a = o(g, a, h), u === null ? l = g : u.sibling = g, u = g);
			return e && d.forEach(function(e) {
				return t(i, e);
			}), N && oa(i, h), l;
		}
		function g(a, s, c, l) {
			if (c == null) throw Error(i(151));
			for (var u = null, d = null, h = s, g = s = 0, _ = null, v = c.next(); h !== null && !v.done; g++, v = c.next()) {
				h.index > g ? (_ = h, h = null) : _ = h.sibling;
				var y = p(a, h, v.value, l);
				if (y === null) {
					h === null && (h = _);
					break;
				}
				e && h && y.alternate === null && t(a, h), s = o(y, s, g), d === null ? u = y : d.sibling = y, d = y, h = _;
			}
			if (v.done) return n(a, h), N && oa(a, g), u;
			if (h === null) {
				for (; !v.done; g++, v = c.next()) v = f(a, v.value, l), v !== null && (s = o(v, s, g), d === null ? u = v : d.sibling = v, d = v);
				return N && oa(a, g), u;
			}
			for (h = r(h); !v.done; g++, v = c.next()) v = m(h, a, g, v.value, l), v !== null && (e && (_ = v.alternate, _ !== null && h.delete(_.key === null ? g : _.key)), s = o(v, s, g), d === null ? u = v : d.sibling = v, d = v);
			return e && h.forEach(function(e) {
				return t(a, e);
			}), N && oa(a, g), u;
		}
		function _(e, r, o, c) {
			if (typeof o == "object" && o && o.type === w && o.key === null && o.props.ref === void 0 && (o = o.props.children), typeof o == "object" && o) {
				switch (o.$$typeof) {
					case ae:
						a: {
							for (var l = o.key; r !== null;) {
								if (r.key === l) {
									if (l = o.type, l === w) {
										if (r.tag === 7) {
											n(e, r.sibling), c = a(r, o.props.children), ho(c, o), c.return = e, e = c;
											break a;
										}
									} else if (r.elementType === l || typeof l == "object" && l && l.$$typeof === me && so(l) === r.type) {
										n(e, r.sibling), c = a(r, o.props), ho(c, o), c.return = e, e = c;
										break a;
									}
									n(e, r);
									break;
								}
								t(e, r), r = r.sibling;
							}
							o.type === w ? (c = Gi(o.props.children, e.mode, c, o.key), ho(c, o), c.return = e, e = c) : (c = Wi(o.type, o.key, o.props, null, e.mode, c), ho(c, o), c.return = e, e = c);
						}
						return s(e);
					case oe:
						a: {
							for (l = o.key; r !== null;) {
								if (r.key === l) {
									if (r.tag === 4 && r.stateNode.containerInfo === o.containerInfo && r.stateNode.implementation === o.implementation) {
										n(e, r.sibling), c = a(r, o.children || []), c.return = e, e = c;
										break a;
									}
									n(e, r);
									break;
								}
								t(e, r), r = r.sibling;
							}
							c = Ji(o, e.mode, c), c.return = e, e = c;
						}
						return s(e);
					case me: return o = so(o), _(e, r, o, c);
				}
				if (we(o)) return h(e, r, o, c);
				if (xe(o)) {
					if (l = xe(o), typeof l != "function") throw Error(i(150));
					return o = l.call(o), g(e, r, o, c);
				}
				if (typeof o.then == "function") return _(e, r, mo(o), c);
				if (o.$$typeof === ue) return _(e, r, Na(e, o), c);
				go(e, o);
			}
			return typeof o == "string" && o !== "" || typeof o == "number" || typeof o == "bigint" ? (o = "" + o, r !== null && r.tag === 6 ? (n(e, r.sibling), c = a(r, o), c.return = e, e = c) : (n(e, r), c = Ki(o, e.mode, c), c.return = e, e = c), s(e)) : n(e, r);
		}
		return function(e, t, n, r) {
			try {
				po = 0;
				var i = _(e, t, n, r);
				return fo = null, i;
			} catch (t) {
				if (t === to || t === ro) throw t;
				var a = Bi(29, t, null, e.mode);
				return a.lanes = r, a.return = e, a;
			}
		};
	}
	var vo = _o(!0), yo = _o(!1), bo = !1;
	function xo(e) {
		e.updateQueue = {
			baseState: e.memoizedState,
			firstBaseUpdate: null,
			lastBaseUpdate: null,
			shared: {
				pending: null,
				lanes: 0,
				hiddenCallbacks: null
			},
			callbacks: null
		};
	}
	function So(e, t) {
		e = e.updateQueue, t.updateQueue === e && (t.updateQueue = {
			baseState: e.baseState,
			firstBaseUpdate: e.firstBaseUpdate,
			lastBaseUpdate: e.lastBaseUpdate,
			shared: e.shared,
			callbacks: null
		});
	}
	function Co(e) {
		return {
			lane: e,
			tag: 0,
			payload: null,
			callback: null,
			next: null
		};
	}
	function wo(e, t, n) {
		var r = e.updateQueue;
		if (r === null) return null;
		if (r = r.shared, W & 2) {
			var i = r.pending;
			return i === null ? t.next = t : (t.next = i.next, i.next = t), r.pending = t, t = Li(e), Ii(e, null, n), t;
		}
		return Ni(e, r, t, n), Li(e);
	}
	function To(e, t, n) {
		if (t = t.updateQueue, t !== null && (t = t.shared, n & 4194048)) {
			var r = t.lanes;
			r &= e.pendingLanes, n |= r, t.lanes = n, Ct(e, n);
		}
	}
	function Eo(e, t) {
		var n = e.updateQueue, r = e.alternate;
		if (r !== null && (r = r.updateQueue, n === r)) {
			var i = null, a = null;
			if (n = n.firstBaseUpdate, n !== null) {
				do {
					var o = {
						lane: n.lane,
						tag: n.tag,
						payload: n.payload,
						callback: null,
						next: null
					};
					a === null ? i = a = o : a = a.next = o, n = n.next;
				} while (n !== null);
				a === null ? i = a = t : a = a.next = t;
			} else i = a = t;
			n = {
				baseState: r.baseState,
				firstBaseUpdate: i,
				lastBaseUpdate: a,
				shared: r.shared,
				callbacks: r.callbacks
			}, e.updateQueue = n;
			return;
		}
		e = n.lastBaseUpdate, e === null ? n.firstBaseUpdate = t : e.next = t, n.lastBaseUpdate = t;
	}
	var Do = !1;
	function Oo() {
		if (Do) {
			var e = Ka;
			if (e !== null) throw e;
		}
	}
	function ko(e, t, n, r) {
		Do = !1;
		var i = e.updateQueue;
		bo = !1;
		var a = i.firstBaseUpdate, o = i.lastBaseUpdate, s = i.shared.pending;
		if (s !== null) {
			i.shared.pending = null;
			var c = s, l = c.next;
			c.next = null, o === null ? a = l : o.next = l, o = c;
			var u = e.alternate;
			u !== null && (u = u.updateQueue, s = u.lastBaseUpdate, s !== o && (s === null ? u.firstBaseUpdate = l : s.next = l, u.lastBaseUpdate = c));
		}
		if (a !== null) {
			var d = i.baseState;
			o = 0, u = l = c = null, s = a;
			do {
				var f = s.lane & -536870913, p = f !== s.lane;
				if (p ? (q & f) === f : (r & f) === f) {
					f !== 0 && f === Ga && (Do = !0), u !== null && (u = u.next = {
						lane: 0,
						tag: s.tag,
						payload: s.payload,
						callback: null,
						next: null
					});
					a: {
						var m = e, h = s;
						f = t;
						var g = n;
						switch (h.tag) {
							case 1:
								if (m = h.payload, typeof m == "function") {
									d = m.call(g, d, f);
									break a;
								}
								d = m;
								break a;
							case 3: m.flags = m.flags & -65537 | 128;
							case 0:
								if (m = h.payload, f = typeof m == "function" ? m.call(g, d, f) : m, f == null) break a;
								d = C({}, d, f);
								break a;
							case 2: bo = !0;
						}
					}
					f = s.callback, f !== null && (e.flags |= 64, p && (e.flags |= 8192), p = i.callbacks, p === null ? i.callbacks = [f] : p.push(f));
				} else p = {
					lane: f,
					tag: s.tag,
					payload: s.payload,
					callback: s.callback,
					next: null
				}, u === null ? (l = u = p, c = d) : u = u.next = p, o |= f;
				if (s = s.next, s === null) {
					if (s = i.shared.pending, s === null) break;
					p = s, s = p.next, p.next = null, i.lastBaseUpdate = p, i.shared.pending = null;
				}
			} while (1);
			u === null && (c = d), i.baseState = c, i.firstBaseUpdate = l, i.lastBaseUpdate = u, a === null && (i.shared.lanes = 0), sd |= o, e.lanes = o, e.memoizedState = d;
		}
	}
	function Ao(e, t) {
		if (typeof e != "function") throw Error(i(191, e));
		e.call(t);
	}
	function jo(e, t) {
		var n = e.callbacks;
		if (n !== null) for (e.callbacks = null, e = 0; e < n.length; e++) Ao(n[e], t);
	}
	var Mo = Oe(null), No = Oe(0);
	function Po(e, t) {
		e = od, k(No, e), k(Mo, t), od = e | t.baseLanes;
	}
	function Fo() {
		k(No, od), k(Mo, Mo.current);
	}
	function Io() {
		od = No.current, O(Mo), O(No);
	}
	var Lo = Oe(null), Ro = null;
	function zo(e) {
		var t = e.alternate;
		k(Wo, Wo.current & 1), k(Lo, e), Ro === null && (t === null || Mo.current !== null || t.memoizedState !== null) && (Ro = e);
	}
	function Bo(e) {
		k(Wo, Wo.current), k(Lo, e), Ro === null && (Ro = e);
	}
	function Vo(e) {
		e.tag === 22 ? (k(Wo, Wo.current), k(Lo, e), Ro === null && (Ro = e)) : Ho();
	}
	function Ho() {
		k(Wo, Wo.current), k(Lo, Lo.current);
	}
	function Uo(e) {
		O(Lo), Ro === e && (Ro = null), O(Wo);
	}
	var Wo = Oe(0);
	function Go(e, t) {
		k(Lo, Lo.current), k(Wo, t);
	}
	function Ko(e) {
		O(Wo), O(Lo), Ro === e && (Ro = null);
	}
	function qo(e) {
		for (var t = e; t !== null;) {
			if (t.tag === 13) {
				var n = t.memoizedState;
				if (n !== null && (n = n.dehydrated, n === null || om(n) || sm(n))) return t;
			} else if (t.tag === 19 && t.memoizedProps.revealOrder !== "independent") {
				if (t.flags & 128) return t;
			} else if (t.child !== null) {
				t.child.return = t, t = t.child;
				continue;
			}
			if (t === e) break;
			for (; t.sibling === null;) {
				if (t.return === null || t.return === e) return null;
				t = t.return;
			}
			t.sibling.return = t.return, t = t.sibling;
		}
		return null;
	}
	var Jo = 0, F = null, I = null, L = null, Yo = !1, Xo = !1, Zo = !1, Qo = 0, $o = 0, es = null, ts = 0;
	function R() {
		throw Error(i(321));
	}
	function ns(e, t) {
		if (t === null) return !1;
		for (var n = 0; n < t.length && n < e.length; n++) if (!Yr(e[n], t[n])) return !1;
		return !0;
	}
	function rs(e, t, n, r, i, a) {
		return Jo = a, F = t, t.memoizedState = null, t.updateQueue = null, t.lanes = 0, E.H = e === null || e.memoizedState === null ? yc : bc, Zo = !1, a = n(r, i), Zo = !1, Xo && (a = as(t, n, r, i)), is(e), a;
	}
	function is(e) {
		E.H = vc;
		var t = I !== null && I.next !== null;
		if (Jo = 0, L = I = F = null, Yo = !1, $o = 0, es = null, t) throw Error(i(300));
		e === null || B || (e = e.dependencies, e !== null && Aa(e) && (B = !0));
	}
	function as(e, t, n, r) {
		F = e;
		var a = 0;
		do {
			if (Xo && (es = null), $o = 0, Xo = !1, 25 <= a) throw Error(i(301));
			if (a += 1, L = I = null, e.updateQueue != null) {
				var o = e.updateQueue;
				o.lastEffect = null, o.events = null, o.stores = null, o.memoCache != null && (o.memoCache.index = 0);
			}
			E.H = xc, o = t(n, r);
		} while (Xo);
		return o;
	}
	function os() {
		var e = E.H, t = e.useState()[0];
		return t = typeof t.then == "function" ? fs(t) : t, e = e.useState()[0], (I === null ? null : I.memoizedState) !== e && (F.flags |= 1024), t;
	}
	function ss() {
		var e = Qo !== 0;
		return Qo = 0, e;
	}
	function cs(e, t, n) {
		t.updateQueue = e.updateQueue, t.flags &= -2053, e.lanes &= ~n;
	}
	function ls(e) {
		if (Yo) {
			for (e = e.memoizedState; e !== null;) {
				var t = e.queue;
				t !== null && (t.pending = null), e = e.next;
			}
			Yo = !1;
		}
		Jo = 0, L = I = F = null, Xo = !1, $o = Qo = 0, es = null;
	}
	function us() {
		var e = {
			memoizedState: null,
			baseState: null,
			baseQueue: null,
			queue: null,
			next: null
		};
		return L === null ? F.memoizedState = L = e : L = L.next = e, L;
	}
	function z() {
		if (I === null) {
			var e = F.alternate;
			e = e === null ? null : e.memoizedState;
		} else e = I.next;
		var t = L === null ? F.memoizedState : L.next;
		if (t !== null) L = t, I = e;
		else {
			if (e === null) throw F.alternate === null ? Error(i(467)) : Error(i(310));
			I = e, e = {
				memoizedState: I.memoizedState,
				baseState: I.baseState,
				baseQueue: I.baseQueue,
				queue: I.queue,
				next: null
			}, L === null ? F.memoizedState = L = e : L = L.next = e;
		}
		return L;
	}
	function ds() {
		return {
			lastEffect: null,
			events: null,
			stores: null,
			memoCache: null
		};
	}
	function fs(e) {
		var t = $o;
		return $o += 1, es === null && (es = []), e = oo(es, e, t), t = F, (L === null ? t.memoizedState : L.next) === null && (t = t.alternate, E.H = t === null || t.memoizedState === null ? yc : bc), e;
	}
	function ps(e) {
		if (typeof e == "object" && e) {
			if (typeof e.then == "function") return fs(e);
			if (e.$$typeof === ye) return;
			if (e.$$typeof === ue) return Ma(e);
		}
		throw Error(i(438, String(e)));
	}
	function ms(e) {
		var t = null, n = F.updateQueue;
		if (n !== null && (t = n.memoCache), t == null) {
			var r = F.alternate;
			r !== null && (r = r.updateQueue, r !== null && (r = r.memoCache, r != null && (t = {
				data: r.data.map(function(e) {
					return e.slice();
				}),
				index: 0
			})));
		}
		if (t ??= {
			data: [],
			index: 0
		}, n === null && (n = ds(), F.updateQueue = n), n.memoCache = t, n = t.data[t.index], n === void 0) for (n = t.data[t.index] = Array(e), r = 0; r < e; r++) n[r] = _e;
		return t.index++, n;
	}
	function hs(e, t) {
		return typeof t == "function" ? t(e) : t;
	}
	function gs(e) {
		return _s(z(), I, e);
	}
	function _s(e, t, n) {
		var r = e.queue;
		if (r === null) throw Error(i(311));
		r.lastRenderedReducer = n;
		var a = e.baseQueue, o = r.pending;
		if (o !== null) {
			if (a !== null) {
				var s = a.next;
				a.next = o.next, o.next = s;
			}
			t.baseQueue = a = o, r.pending = null;
		}
		if (o = e.baseState, a === null) e.memoizedState = o;
		else {
			t = a.next;
			var c = s = null, l = null, u = t, d = !1;
			do {
				var f = u.lane & -536870913;
				if (f === u.lane ? (Jo & f) === f : (q & f) === f) {
					var p = u.revertLane;
					if (p === 0) l !== null && (l = l.next = {
						lane: 0,
						revertLane: 0,
						gesture: null,
						action: u.action,
						hasEagerState: u.hasEagerState,
						eagerState: u.eagerState,
						next: null
					}), f === Ga && (d = !0);
					else if ((Jo & p) === p) {
						u = u.next, p === Ga && (d = !0);
						continue;
					} else f = {
						lane: 0,
						revertLane: u.revertLane,
						gesture: null,
						action: u.action,
						hasEagerState: u.hasEagerState,
						eagerState: u.eagerState,
						next: null
					}, l === null ? (c = l = f, s = o) : l = l.next = f, F.lanes |= p, sd |= p;
					f = u.action, Zo && n(o, f), o = u.hasEagerState ? u.eagerState : n(o, f);
				} else p = {
					lane: f,
					revertLane: u.revertLane,
					gesture: u.gesture,
					action: u.action,
					hasEagerState: u.hasEagerState,
					eagerState: u.eagerState,
					next: null
				}, l === null ? (c = l = p, s = o) : l = l.next = p, F.lanes |= f, sd |= f;
				u = u.next;
			} while (u !== null && u !== t);
			if (l === null ? s = o : l.next = c, !Yr(o, e.memoizedState) && (B = !0, d && (n = Ka, n !== null))) throw n;
			e.memoizedState = o, e.baseState = s, e.baseQueue = l, r.lastRenderedState = o;
		}
		return a === null && (r.lanes = 0), [e.memoizedState, r.dispatch];
	}
	function vs(e) {
		var t = z(), n = t.queue;
		if (n === null) throw Error(i(311));
		n.lastRenderedReducer = e;
		var r = n.dispatch, a = n.pending, o = t.memoizedState;
		if (a !== null) {
			n.pending = null;
			var s = a = a.next;
			do
				o = e(o, s.action), s = s.next;
			while (s !== a);
			Yr(o, t.memoizedState) || (B = !0), t.memoizedState = o, t.baseQueue === null && (t.baseState = o), n.lastRenderedState = o;
		}
		return [o, r];
	}
	function ys(e, t, n) {
		var r = F, a = z(), o = N;
		if (o) {
			if (n === void 0) throw Error(i(407));
			n = n();
		} else n = t();
		var s = !Yr((I || a).memoizedState, n);
		if (s && (a.memoizedState = n, B = !0), a = a.queue, Ws(Ss.bind(null, r, a, e), [e]), e = a.getSnapshot !== t || s || L !== null && !!(L.memoizedState.tag & 1), zs(e ? 9 : 8, { destroy: void 0 }, xs.bind(null, r, a, n, t), null), e) {
			if (r.flags |= 2048, G === null) throw Error(i(349));
			o || Jo & 127 || bs(r, t, n);
		}
		return n;
	}
	function bs(e, t, n) {
		e.flags |= 16384, e = {
			getSnapshot: t,
			value: n
		}, t = F.updateQueue, t === null ? (t = ds(), F.updateQueue = t, t.stores = [e]) : (n = t.stores, n === null ? t.stores = [e] : n.push(e));
	}
	function xs(e, t, n, r) {
		t.value = n, t.getSnapshot = r, Cs(t) && ws(e);
	}
	function Ss(e, t, n) {
		return n(function() {
			Cs(t) && ws(e);
		});
	}
	function Cs(e) {
		var t = e.getSnapshot;
		e = e.value;
		try {
			var n = t();
			return !Yr(e, n);
		} catch {
			return !0;
		}
	}
	function ws(e) {
		var t = Fi(e, 2);
		t !== null && Pd(t, e, 2);
	}
	function Ts(e) {
		var t = us();
		if (typeof e == "function") {
			var n = e;
			if (e = n(), Zo) {
				at(!0);
				try {
					n();
				} finally {
					at(!1);
				}
			}
		}
		return t.memoizedState = t.baseState = e, t.queue = {
			pending: null,
			lanes: 0,
			dispatch: null,
			lastRenderedReducer: hs,
			lastRenderedState: e
		}, t;
	}
	function Es(e, t, n, r) {
		return e.baseState = n, _s(e, I, typeof r == "function" ? r : hs);
	}
	function Ds(e, t, n, r, a) {
		if (hc(e)) throw Error(i(485));
		if (e = t.action, e !== null) {
			var o = {
				payload: a,
				action: e,
				next: null,
				isTransition: !0,
				status: "pending",
				value: null,
				reason: null,
				listeners: [],
				then: function(e) {
					o.listeners.push(e);
				}
			};
			E.T === null ? o.isTransition = !1 : n(!0), r(o), n = t.pending, n === null ? (o.next = t.pending = o, Os(t, o)) : (o.next = n.next, t.pending = n.next = o);
		}
	}
	function Os(e, t) {
		var n = t.action, r = t.payload, i = e.state;
		if (t.isTransition) {
			var a = E.T, o = {};
			o.types = a === null ? null : a.types, E.T = o;
			try {
				var s = n(i, r), c = E.S;
				c !== null && c(o, s), ks(e, t, s);
			} catch (n) {
				js(e, t, n);
			} finally {
				a !== null && o.types !== null && (a.types = o.types), E.T = a;
			}
		} else try {
			a = n(i, r), ks(e, t, a);
		} catch (n) {
			js(e, t, n);
		}
	}
	function ks(e, t, n) {
		typeof n == "object" && n && typeof n.then == "function" ? n.then(function(n) {
			As(e, t, n);
		}, function(n) {
			return js(e, t, n);
		}) : As(e, t, n);
	}
	function As(e, t, n) {
		t.status = "fulfilled", t.value = n, Ms(t), e.state = n, t = e.pending, t !== null && (n = t.next, n === t ? e.pending = null : (n = n.next, t.next = n, Os(e, n)));
	}
	function js(e, t, n) {
		var r = e.pending;
		if (e.pending = null, r !== null) {
			r = r.next;
			do
				t.status = "rejected", t.reason = n, Ms(t), t = t.next;
			while (t !== r);
		}
		e.action = null;
	}
	function Ms(e) {
		e = e.listeners;
		for (var t = 0; t < e.length; t++) (0, e[t])();
	}
	function Ns(e, t) {
		return t;
	}
	function Ps(e, t) {
		if (N) {
			var n = G.formState;
			if (n !== null) {
				a: {
					var r = F;
					if (N) {
						if (M) {
							b: {
								for (var i = M, a = pa; i.nodeType !== 8;) {
									if (!a) {
										i = null;
										break b;
									}
									if (i = lm(i.nextSibling), i === null) {
										i = null;
										break b;
									}
								}
								a = i.data, i = a === "F!" || a === "F" ? i : null;
							}
							if (i) {
								M = lm(i.nextSibling), r = i.data === "F!";
								break a;
							}
						}
						ha(r);
					}
					r = !1;
				}
				r && (t = n[0]);
			}
		}
		return n = us(), n.memoizedState = n.baseState = t, r = {
			pending: null,
			lanes: 0,
			dispatch: null,
			lastRenderedReducer: Ns,
			lastRenderedState: t
		}, n.queue = r, n = fc.bind(null, F, r), r.dispatch = n, r = Ts(!1), a = mc.bind(null, F, !1, r.queue), r = us(), i = {
			state: t,
			dispatch: null,
			action: e,
			pending: null
		}, r.queue = i, n = Ds.bind(null, F, i, a, n), i.dispatch = n, r.memoizedState = e, [
			t,
			n,
			!1
		];
	}
	function Fs(e) {
		return Is(z(), I, e);
	}
	function Is(e, t, n) {
		if (t = _s(e, t, Ns)[0], e = gs(hs)[0], typeof t == "object" && t && typeof t.then == "function") try {
			var r = fs(t);
		} catch (e) {
			throw e === to ? ro : e;
		}
		else r = t;
		t = z();
		var i = t.queue, a = i.dispatch;
		return n !== t.memoizedState && (F.flags |= 2048, zs(9, { destroy: void 0 }, Ls.bind(null, i, n), null)), [
			r,
			a,
			e
		];
	}
	function Ls(e, t) {
		e.action = t;
	}
	function Rs(e) {
		var t = z(), n = I;
		if (n !== null) return Is(t, n, e);
		z(), t = t.memoizedState, n = z();
		var r = n.queue.dispatch;
		return n.memoizedState = e, [
			t,
			r,
			!1
		];
	}
	function zs(e, t, n, r) {
		return e = {
			tag: e,
			create: n,
			deps: r,
			inst: t,
			next: null
		}, t = F.updateQueue, t === null && (t = ds(), F.updateQueue = t), n = t.lastEffect, n === null ? t.lastEffect = e.next = e : (r = n.next, n.next = e, e.next = r, t.lastEffect = e), e;
	}
	function Bs() {
		return z().memoizedState;
	}
	function Vs(e, t, n, r) {
		var i = us();
		F.flags |= e, i.memoizedState = zs(1 | t, { destroy: void 0 }, n, r === void 0 ? null : r);
	}
	function Hs(e, t, n, r) {
		var i = z();
		r = r === void 0 ? null : r;
		var a = i.memoizedState.inst;
		I !== null && r !== null && ns(r, I.memoizedState.deps) ? i.memoizedState = zs(t, a, n, r) : (F.flags |= e, i.memoizedState = zs(1 | t, a, n, r));
	}
	function Us(e, t) {
		Vs(8390656, 8, e, t);
	}
	function Ws(e, t) {
		Hs(2048, 8, e, t);
	}
	function Gs(e) {
		F.flags |= 4;
		var t = F.updateQueue;
		if (t === null) t = ds(), F.updateQueue = t, t.events = [e];
		else {
			var n = t.events;
			n === null ? t.events = [e] : n.push(e);
		}
	}
	function Ks(e) {
		var t = z().memoizedState;
		return Gs({
			ref: t,
			nextImpl: e
		}), function() {
			if (W & 2) throw Error(i(440));
			return t.impl.apply(void 0, arguments);
		};
	}
	function qs(e, t) {
		return Hs(4, 2, e, t);
	}
	function Js(e, t) {
		return Hs(4, 4, e, t);
	}
	function Ys(e, t) {
		if (typeof t == "function") {
			e = e();
			var n = t(e);
			return function() {
				typeof n == "function" ? n() : t(null);
			};
		}
		if (t != null) return e = e(), t.current = e, function() {
			t.current = null;
		};
	}
	function Xs(e, t, n) {
		n = n == null ? null : n.concat([e]), Hs(4, 4, Ys.bind(null, t, e), n);
	}
	function Zs() {}
	function Qs(e, t) {
		var n = z();
		t = t === void 0 ? null : t;
		var r = n.memoizedState;
		return t !== null && ns(t, r[1]) ? r[0] : (n.memoizedState = [e, t], e);
	}
	function $s(e, t) {
		var n = z();
		t = t === void 0 ? null : t;
		var r = n.memoizedState;
		if (t !== null && ns(t, r[1])) return r[0];
		if (r = e(), Zo) {
			at(!0);
			try {
				e();
			} finally {
				at(!1);
			}
		}
		return n.memoizedState = [r, t], r;
	}
	function ec(e, t, n) {
		return n === void 0 || Jo & 1073741824 && !(q & 261930) ? e.memoizedState = t : (e.memoizedState = n, e = Md(), F.lanes |= e, sd |= e, n);
	}
	function tc(e, t, n, r) {
		return Yr(n, t) ? n : Mo.current === null ? !(Jo & 106) || Jo & 1073741824 && !(q & 261930) ? (B = !0, e.memoizedState = n) : (e = Md(), F.lanes |= e, sd |= e, t) : (e = ec(e, n, r), Yr(e, t) || (B = !0), e);
	}
	function nc(e, t, n, r, i) {
		var a = D.p;
		D.p = a !== 0 && 8 > a ? a : 8;
		var o = E.T, s = {};
		s.types = o === null ? null : o.types, E.T = s, mc(e, !1, t, n);
		try {
			var c = i(), l = E.S;
			l !== null && l(s, c), typeof c == "object" && c && typeof c.then == "function" ? pc(e, t, Ya(c, r), jd(e)) : pc(e, t, r, jd(e));
		} catch (n) {
			pc(e, t, {
				then: function() {},
				status: "rejected",
				reason: n
			}, jd());
		} finally {
			D.p = a, o !== null && s.types !== null && (o.types = s.types), E.T = o;
		}
	}
	function rc() {}
	function ic(e, t, n, r) {
		if (e.tag !== 5) throw Error(i(476));
		var a = ac(e).queue;
		nc(e, a, t, Te, n === null ? rc : function() {
			return oc(e), n(r);
		});
	}
	function ac(e) {
		var t = e.memoizedState;
		if (t !== null) return t;
		t = {
			memoizedState: Te,
			baseState: Te,
			baseQueue: null,
			queue: {
				pending: null,
				lanes: 0,
				dispatch: null,
				lastRenderedReducer: hs,
				lastRenderedState: Te
			},
			next: null
		};
		var n = {};
		return t.next = {
			memoizedState: n,
			baseState: n,
			baseQueue: null,
			queue: {
				pending: null,
				lanes: 0,
				dispatch: null,
				lastRenderedReducer: hs,
				lastRenderedState: n
			},
			next: null
		}, e.memoizedState = t, e = e.alternate, e !== null && (e.memoizedState = t), t;
	}
	function oc(e) {
		var t = ac(e);
		t.next === null && (t = e.alternate.memoizedState), pc(e, t.next.queue, {}, jd());
	}
	function sc() {
		return Ma(sh);
	}
	function cc() {
		return z().memoizedState;
	}
	function lc() {
		return z().memoizedState;
	}
	function uc(e) {
		for (var t = e.return; t !== null;) {
			switch (t.tag) {
				case 24:
				case 3:
					var n = jd();
					e = Co(n);
					var r = wo(t, e, n);
					r !== null && (Pd(r, t, n), To(r, t, n)), t = { cache: Ra() }, e.payload = t;
					return;
			}
			t = t.return;
		}
	}
	function dc(e, t, n) {
		var r = jd();
		n = {
			lane: r,
			revertLane: 0,
			gesture: null,
			action: n,
			hasEagerState: !1,
			eagerState: null,
			next: null
		}, hc(e) ? gc(t, n) : (n = Pi(e, t, n, r), n !== null && (Pd(n, e, r), _c(n, t, r)));
	}
	function fc(e, t, n) {
		pc(e, t, n, jd());
	}
	function pc(e, t, n, r) {
		var i = {
			lane: r,
			revertLane: 0,
			gesture: null,
			action: n,
			hasEagerState: !1,
			eagerState: null,
			next: null
		};
		if (hc(e)) gc(t, i);
		else {
			var a = e.alternate;
			if (e.lanes === 0 && (a === null || a.lanes === 0) && (a = t.lastRenderedReducer, a !== null)) try {
				var o = t.lastRenderedState, s = a(o, n);
				if (i.hasEagerState = !0, i.eagerState = s, Yr(s, o)) return Ni(e, t, i, 0), G === null && Mi(), !1;
			} catch {}
			if (n = Pi(e, t, i, r), n !== null) return Pd(n, e, r), _c(n, t, r), !0;
		}
		return !1;
	}
	function mc(e, t, n, r) {
		if (r = {
			lane: 2,
			revertLane: Pf(),
			gesture: null,
			action: r,
			hasEagerState: !1,
			eagerState: null,
			next: null
		}, hc(e)) {
			if (t) throw Error(i(479));
		} else t = Pi(e, n, r, 2), t !== null && Pd(t, e, 2);
	}
	function hc(e) {
		var t = e.alternate;
		return e === F || t !== null && t === F;
	}
	function gc(e, t) {
		Xo = Yo = !0;
		var n = e.pending;
		n === null ? t.next = t : (t.next = n.next, n.next = t), e.pending = t;
	}
	function _c(e, t, n) {
		if (n & 4194048) {
			var r = t.lanes;
			r &= e.pendingLanes, n |= r, t.lanes = n, Ct(e, n);
		}
	}
	var vc = {
		readContext: Ma,
		use: ps,
		useCallback: R,
		useContext: R,
		useEffect: R,
		useImperativeHandle: R,
		useLayoutEffect: R,
		useInsertionEffect: R,
		useMemo: R,
		useReducer: R,
		useRef: R,
		useState: R,
		useDebugValue: R,
		useDeferredValue: R,
		useTransition: R,
		useSyncExternalStore: R,
		useId: R,
		useHostTransitionStatus: R,
		useFormState: R,
		useActionState: R,
		useOptimistic: R,
		useMemoCache: R,
		useCacheRefresh: R,
		useEffectEvent: R
	}, yc = {
		readContext: Ma,
		use: ps,
		useCallback: function(e, t) {
			return us().memoizedState = [e, t === void 0 ? null : t], e;
		},
		useContext: Ma,
		useEffect: Us,
		useImperativeHandle: function(e, t, n) {
			n = n == null ? null : n.concat([e]), Vs(4194308, 4, Ys.bind(null, t, e), n);
		},
		useLayoutEffect: function(e, t) {
			return Vs(4194308, 4, e, t);
		},
		useInsertionEffect: function(e, t) {
			Vs(4, 2, e, t);
		},
		useMemo: function(e, t) {
			var n = us();
			t = t === void 0 ? null : t;
			var r = e();
			if (Zo) {
				at(!0);
				try {
					e();
				} finally {
					at(!1);
				}
			}
			return n.memoizedState = [r, t], r;
		},
		useReducer: function(e, t, n) {
			var r = us();
			if (n !== void 0) {
				var i = n(t);
				if (Zo) {
					at(!0);
					try {
						n(t);
					} finally {
						at(!1);
					}
				}
			} else i = t;
			return r.memoizedState = r.baseState = i, e = {
				pending: null,
				lanes: 0,
				dispatch: null,
				lastRenderedReducer: e,
				lastRenderedState: i
			}, r.queue = e, e = e.dispatch = dc.bind(null, F, e), [r.memoizedState, e];
		},
		useRef: function(e) {
			var t = us();
			return e = { current: e }, t.memoizedState = e;
		},
		useState: function(e) {
			e = Ts(e);
			var t = e.queue, n = fc.bind(null, F, t);
			return t.dispatch = n, [e.memoizedState, n];
		},
		useDebugValue: Zs,
		useDeferredValue: function(e, t) {
			return ec(us(), e, t);
		},
		useTransition: function() {
			var e = Ts(!1);
			return e = nc.bind(null, F, e.queue, !0, !1), us().memoizedState = e, [!1, e];
		},
		useSyncExternalStore: function(e, t, n) {
			var r = F, a = us();
			if (N) {
				if (n === void 0) throw Error(i(407));
				n = n();
			} else {
				if (n = t(), G === null) throw Error(i(349));
				q & 127 || bs(r, t, n);
			}
			a.memoizedState = n;
			var o = {
				value: n,
				getSnapshot: t
			};
			return a.queue = o, Us(Ss.bind(null, r, o, e), [e]), r.flags |= 2048, zs(9, { destroy: void 0 }, xs.bind(null, r, o, n, t), null), n;
		},
		useId: function() {
			var e = us(), t = G.identifierPrefix;
			if (N) {
				var n = aa, r = ia;
				n = (r & ~(1 << 32 - ot(r) - 1)).toString(32) + n, t = "_" + t + "R_" + n, n = Qo++, 0 < n && (t += "H" + n.toString(32)), t += "_";
			} else n = ts++, t = "_" + t + "r_" + n.toString(32) + "_";
			return e.memoizedState = t;
		},
		useHostTransitionStatus: sc,
		useFormState: Ps,
		useActionState: Ps,
		useOptimistic: function(e) {
			var t = us();
			t.memoizedState = t.baseState = e;
			var n = {
				pending: null,
				lanes: 0,
				dispatch: null,
				lastRenderedReducer: null,
				lastRenderedState: null
			};
			return t.queue = n, t = mc.bind(null, F, !0, n), n.dispatch = t, [e, t];
		},
		useMemoCache: ms,
		useCacheRefresh: function() {
			return us().memoizedState = uc.bind(null, F);
		},
		useEffectEvent: function(e) {
			var t = us(), n = { impl: e };
			return t.memoizedState = n, function() {
				if (W & 2) throw Error(i(440));
				return n.impl.apply(void 0, arguments);
			};
		}
	}, bc = {
		readContext: Ma,
		use: ps,
		useCallback: Qs,
		useContext: Ma,
		useEffect: Ws,
		useImperativeHandle: Xs,
		useInsertionEffect: qs,
		useLayoutEffect: Js,
		useMemo: $s,
		useReducer: gs,
		useRef: Bs,
		useState: function() {
			return gs(hs);
		},
		useDebugValue: Zs,
		useDeferredValue: function(e, t) {
			return tc(z(), I.memoizedState, e, t);
		},
		useTransition: function() {
			var e = gs(hs)[0], t = z().memoizedState;
			return [typeof e == "boolean" ? e : fs(e), t];
		},
		useSyncExternalStore: ys,
		useId: cc,
		useHostTransitionStatus: sc,
		useFormState: Fs,
		useActionState: Fs,
		useOptimistic: function(e, t) {
			return Es(z(), I, e, t);
		},
		useMemoCache: ms,
		useCacheRefresh: lc,
		useEffectEvent: Ks
	}, xc = {
		readContext: Ma,
		use: ps,
		useCallback: Qs,
		useContext: Ma,
		useEffect: Ws,
		useImperativeHandle: Xs,
		useInsertionEffect: qs,
		useLayoutEffect: Js,
		useMemo: $s,
		useReducer: vs,
		useRef: Bs,
		useState: function() {
			return vs(hs);
		},
		useDebugValue: Zs,
		useDeferredValue: function(e, t) {
			var n = z();
			return I === null ? ec(n, e, t) : tc(n, I.memoizedState, e, t);
		},
		useTransition: function() {
			var e = vs(hs)[0], t = z().memoizedState;
			return [typeof e == "boolean" ? e : fs(e), t];
		},
		useSyncExternalStore: ys,
		useId: cc,
		useHostTransitionStatus: sc,
		useFormState: Rs,
		useActionState: Rs,
		useOptimistic: function(e, t) {
			var n = z();
			return I === null ? (n.baseState = e, [e, n.queue.dispatch]) : Es(n, I, e, t);
		},
		useMemoCache: ms,
		useCacheRefresh: lc,
		useEffectEvent: Ks
	};
	function Sc(e, t, n, r) {
		t = e.memoizedState, n = n(r, t), n = n == null ? t : C({}, t, n), e.memoizedState = n, e.lanes === 0 && (e.updateQueue.baseState = n);
	}
	var Cc = {
		enqueueSetState: function(e, t, n) {
			e = e._reactInternals;
			var r = jd(), i = Co(r);
			i.payload = t, n != null && (i.callback = n), t = wo(e, i, r), t !== null && (Pd(t, e, r), To(t, e, r));
		},
		enqueueReplaceState: function(e, t, n) {
			e = e._reactInternals;
			var r = jd(), i = Co(r);
			i.tag = 1, i.payload = t, n != null && (i.callback = n), t = wo(e, i, r), t !== null && (Pd(t, e, r), To(t, e, r));
		},
		enqueueForceUpdate: function(e, t) {
			e = e._reactInternals;
			var n = jd(), r = Co(n);
			r.tag = 2, t != null && (r.callback = t), t = wo(e, r, n), t !== null && (Pd(t, e, n), To(t, e, n));
		}
	};
	function wc(e, t, n, r, i, a, o) {
		return e = e.stateNode, typeof e.shouldComponentUpdate == "function" ? e.shouldComponentUpdate(r, a, o) : t.prototype && t.prototype.isPureReactComponent ? !Xr(n, r) || !Xr(i, a) : !0;
	}
	function Tc(e, t, n, r) {
		e = t.state, typeof t.componentWillReceiveProps == "function" && t.componentWillReceiveProps(n, r), typeof t.UNSAFE_componentWillReceiveProps == "function" && t.UNSAFE_componentWillReceiveProps(n, r), t.state !== e && Cc.enqueueReplaceState(t, t.state, null);
	}
	function Ec(e, t) {
		var n = t;
		if ("ref" in t) for (var r in n = {}, t) r !== "ref" && (n[r] = t[r]);
		if (e = e.defaultProps) for (var i in n === t && (n = C({}, n)), e) n[i] === void 0 && (n[i] = e[i]);
		return n;
	}
	function Dc(e) {
		Oi(e);
	}
	function Oc(e) {
		console.error(e);
	}
	function kc(e) {
		Oi(e);
	}
	function Ac(e, t) {
		try {
			var n = e.onUncaughtError;
			n(t.value, { componentStack: t.stack });
		} catch (e) {
			setTimeout(function() {
				throw e;
			});
		}
	}
	function jc(e, t, n) {
		try {
			var r = e.onCaughtError;
			r(n.value, {
				componentStack: n.stack,
				errorBoundary: t.tag === 1 ? t.stateNode : null
			});
		} catch (e) {
			setTimeout(function() {
				throw e;
			});
		}
	}
	function Mc(e, t, n) {
		return n = Co(n), n.tag = 3, n.payload = { element: null }, n.callback = function() {
			Ac(e, t);
		}, n;
	}
	function Nc(e) {
		return e = Co(e), e.tag = 3, e;
	}
	function Pc(e, t, n, r) {
		var i = n.type.getDerivedStateFromError;
		if (typeof i == "function") {
			var a = r.value;
			e.payload = function() {
				return i(a);
			}, e.callback = function() {
				jc(t, n, r);
			};
		}
		var o = n.stateNode;
		o !== null && typeof o.componentDidCatch == "function" && (e.callback = function() {
			jc(t, n, r), typeof i != "function" && (yd === null ? yd = /* @__PURE__ */ new Set([this]) : yd.add(this));
			var e = r.stack;
			this.componentDidCatch(r.value, { componentStack: e === null ? "" : e });
		});
	}
	function Fc(e, t, n, r, a) {
		if (n.flags |= 32768, typeof r == "object" && r && typeof r.then == "function") {
			if (t = n.alternate, t !== null && ka(t, n, a, !0), n = Lo.current, n !== null) {
				switch (n.tag) {
					case 31:
					case 13:
					case 19: return Ro === null ? Kd() : n.alternate === null && Y === 0 && (Y = 3), n.flags &= -257, n.flags |= 65536, n.lanes = a, r === io ? n.flags |= 16384 : (t = n.updateQueue, t === null ? n.updateQueue = /* @__PURE__ */ new Set([r]) : t.add(r), mf(e, r, a)), !1;
					case 22: return n.flags |= 65536, r === io ? n.flags |= 16384 : (t = n.updateQueue, t === null ? (t = {
						transitions: null,
						markerInstances: null,
						retryQueue: /* @__PURE__ */ new Set([r])
					}, n.updateQueue = t) : (n = t.retryQueue, n === null ? t.retryQueue = /* @__PURE__ */ new Set([r]) : n.add(r)), mf(e, r, a)), !1;
				}
				throw Error(i(435, n.tag));
			}
			return mf(e, r, a), Kd(), !1;
		}
		if (N) return t = Lo.current, t === null ? (r !== ma && (t = Error(i(423), { cause: r }), xa(Xi(t, n))), e = e.current.alternate, e.flags |= 65536, a &= -a, e.lanes |= a, r = Xi(r, n), a = Mc(e.stateNode, r, a), Eo(e, a), Y !== 4 && (Y = 2)) : (!(t.flags & 65536) && (t.flags |= 256), t.flags |= 65536, t.lanes = a, r !== ma && (e = Error(i(422), { cause: r }), xa(Xi(e, n)))), !1;
		var o = Error(i(520), { cause: r });
		if (o = Xi(o, n), fd === null ? fd = [o] : fd.push(o), Y !== 4 && (Y = 2), t === null) return !0;
		r = Xi(r, n), n = t;
		do {
			switch (n.tag) {
				case 3: return n.flags |= 65536, e = a & -a, n.lanes |= e, e = Mc(n.stateNode, r, e), Eo(n, e), !1;
				case 1:
					if (t = n.type, o = n.stateNode, !(n.flags & 128) && (typeof t.getDerivedStateFromError == "function" || o !== null && typeof o.componentDidCatch == "function" && (yd === null || !yd.has(o)))) return n.flags |= 65536, a &= -a, n.lanes |= a, a = Nc(a), Pc(a, e, n, r), Eo(n, a), !1;
					break;
				case 22: if (n.memoizedState !== null) return n.flags |= 65536, !1;
			}
			n = n.return;
		} while (n !== null);
		return !1;
	}
	var Ic = Error(i(461)), B = !1;
	function Lc(e, t, n, r) {
		t.child = e === null ? yo(t, null, n, r) : vo(t, e.child, n, r);
	}
	function Rc(e, t, n, r, i) {
		n = n.render;
		var a = t.ref;
		if ("ref" in r) {
			var o = {};
			for (var s in r) s !== "ref" && (o[s] = r[s]);
		} else o = r;
		return ja(t), r = rs(e, t, n, o, a, i), s = ss(), e !== null && !B ? (cs(e, t, i), fl(e, t, i)) : (N && s && ca(t), t.flags |= 1, Lc(e, t, r, i), t.child);
	}
	function zc(e, t, n, r, i) {
		if (e === null) {
			var a = n.type;
			return typeof a == "function" && !Vi(a) && a.defaultProps === void 0 && n.compare === null ? (t.tag = 15, t.type = a, Bc(e, t, a, r, i)) : (e = Wi(n.type, null, r, t, t.mode, i), e.ref = t.ref, e.return = t, t.child = e);
		}
		if (a = e.child, !pl(e, i)) {
			var o = a.memoizedProps;
			if (n = n.compare, n = n === null ? Xr : n, n(o, r) && e.ref === t.ref) return fl(e, t, i);
		}
		return t.flags |= 1, e = Hi(a, r), e.ref = t.ref, e.return = t, t.child = e;
	}
	function Bc(e, t, n, r, i) {
		if (e !== null) {
			var a = e.memoizedProps;
			if (Xr(a, r) && e.ref === t.ref) {
				if (B = !1, t.pendingProps = r = a, pl(e, i)) e.flags & 131072 && (B = !0);
				else return t.lanes = e.lanes, fl(e, t, i);
			}
		}
		return Jc(e, t, n, r, i);
	}
	function Vc(e, t, n, r) {
		var i = r.children, a = e === null ? null : e.memoizedState;
		if (e === null && t.stateNode === null && (t.stateNode = {
			_visibility: 1,
			_pendingMarkers: null,
			_retryCache: null,
			_transitions: null
		}), r.mode === "hidden") {
			if (t.flags & 128) {
				if (a = a === null ? n : a.baseLanes | n, e !== null) {
					for (r = t.child = e.child, i = 0; r !== null;) i = i | r.lanes | r.childLanes, r = r.sibling;
					r = i & ~a;
				} else r = 0, t.child = null;
				return Uc(e, t, a, n, r);
			}
			if (n & 536870912) t.memoizedState = {
				baseLanes: 0,
				cachePool: null
			}, e !== null && $a(t, a === null ? null : a.cachePool), a === null ? Fo() : Po(t, a), Vo(t);
			else return r = t.lanes = 536870912, Uc(e, t, a === null ? n : a.baseLanes | n, n, r);
		} else a === null ? (e !== null && $a(t, null), Fo(), Ho()) : ($a(t, a.cachePool), Po(t, a), Ho(), t.memoizedState = null);
		return Lc(e, t, i, n), t.child;
	}
	function Hc(e, t) {
		return e !== null && e.tag === 22 || t.stateNode !== null || (t.stateNode = {
			_visibility: 1,
			_pendingMarkers: null,
			_retryCache: null,
			_transitions: null
		}), t.sibling;
	}
	function Uc(e, t, n, r, i) {
		var a = Qa();
		return a = a === null ? null : {
			parent: P._currentValue,
			pool: a
		}, t.memoizedState = {
			baseLanes: n,
			cachePool: a
		}, e !== null && $a(t, null), Fo(), Vo(t), e !== null && ka(e, t, r, !0), t.childLanes = i, null;
	}
	function Wc(e, t) {
		return t = rl({
			mode: t.mode,
			children: t.children
		}, e.mode), t.ref = e.ref, e.child = t, t.return = e, t;
	}
	function Gc(e, t, n) {
		return vo(t, e.child, null, n), e = Wc(t, t.pendingProps), e.flags |= 2, Uo(t), t.memoizedState = null, e;
	}
	function Kc(e, t, n) {
		var r = t.pendingProps, a = !!(t.flags & 128);
		if (t.flags &= -129, e === null) {
			if (N) {
				if (r.mode === "hidden") return e = Wc(t, r), t.lanes = 536870912, e.memoizedState = {
					baseLanes: 0,
					cachePool: null
				}, Hc(null, e);
				if (Bo(t), (e = M) ? (e = am(e, pa), e = e !== null && e.data === "&" ? e : null, e !== null && (t.memoizedState = {
					dehydrated: e,
					treeContext: ra === null ? null : {
						id: ia,
						overflow: aa
					},
					retryLane: 536870912,
					hydrationErrors: null
				}, n = qi(e), n.return = t, t.child = n, da = t, M = null)) : e = null, e === null) throw ha(t);
				return t.lanes = 536870912, null;
			}
			return Wc(t, r);
		}
		var o = e.memoizedState;
		if (o !== null) {
			var s = o.dehydrated;
			if (Bo(t), a) {
				if (t.flags & 256) t.flags &= -257, t = Gc(e, t, n);
				else if (t.memoizedState !== null) t.child = e.child, t.flags |= 128, t = null;
				else throw Error(i(558));
			} else if (B || ka(e, t, n, !1), a = (n & e.childLanes) !== 0, B || a) {
				if (Mo.current === null) {
					if (r = G, r !== null && (s = wt(r, n), s !== 0 && s !== o.retryLane)) throw o.retryLane = s, Fi(e, s), Pd(r, e, s), Ic;
					Kd();
				}
				t = Gc(e, t, n);
			} else e = o.treeContext, M = lm(s.nextSibling), da = t, N = !0, fa = null, pa = !1, e !== null && ua(t, e), t = Wc(t, r), t.flags |= 134221824;
			return t;
		}
		return e = Hi(e.child, {
			mode: r.mode,
			children: r.children
		}), e.ref = t.ref, t.child = e, e.return = t, e;
	}
	function qc(e, t) {
		var n = t.ref;
		if (n === null) e !== null && e.ref !== null && (t.flags |= 4194816);
		else {
			if (typeof n != "function" && typeof n != "object") throw Error(i(284));
			(e === null || e.ref !== n) && (t.flags |= 4194816);
		}
	}
	function Jc(e, t, n, r, i) {
		return ja(t), n = rs(e, t, n, r, void 0, i), r = ss(), e !== null && !B ? (cs(e, t, i), fl(e, t, i)) : (N && r && ca(t), t.flags |= 1, Lc(e, t, n, i), t.child);
	}
	function Yc(e, t, n, r, i, a) {
		return ja(t), t.updateQueue = null, n = as(t, r, n, i), is(e), r = ss(), e !== null && !B ? (cs(e, t, a), fl(e, t, a)) : (N && r && ca(t), t.flags |= 1, Lc(e, t, n, a), t.child);
	}
	function Xc(e, t, n, r, i) {
		if (ja(t), t.stateNode === null) {
			var a = Ri, o = n.contextType;
			typeof o == "object" && o && (a = Ma(o)), a = new n(r, a), t.memoizedState = a.state !== null && a.state !== void 0 ? a.state : null, a.updater = Cc, t.stateNode = a, a._reactInternals = t, a = t.stateNode, a.props = r, a.state = t.memoizedState, a.refs = {}, xo(t), o = n.contextType, a.context = typeof o == "object" && o ? Ma(o) : Ri, a.state = t.memoizedState, o = n.getDerivedStateFromProps, typeof o == "function" && (Sc(t, n, o, r), a.state = t.memoizedState), typeof n.getDerivedStateFromProps == "function" || typeof a.getSnapshotBeforeUpdate == "function" || typeof a.UNSAFE_componentWillMount != "function" && typeof a.componentWillMount != "function" || (o = a.state, typeof a.componentWillMount == "function" && a.componentWillMount(), typeof a.UNSAFE_componentWillMount == "function" && a.UNSAFE_componentWillMount(), o !== a.state && Cc.enqueueReplaceState(a, a.state, null), ko(t, r, a, i), Oo(), a.state = t.memoizedState), typeof a.componentDidMount == "function" && (t.flags |= 4194308), r = !0;
		} else if (e === null) {
			a = t.stateNode;
			var s = t.memoizedProps, c = Ec(n, s);
			a.props = c;
			var l = a.context, u = n.contextType;
			o = Ri, typeof u == "object" && u && (o = Ma(u));
			var d = n.getDerivedStateFromProps;
			u = typeof d == "function" || typeof a.getSnapshotBeforeUpdate == "function", s = t.pendingProps !== s, u || typeof a.UNSAFE_componentWillReceiveProps != "function" && typeof a.componentWillReceiveProps != "function" || (s || l !== o) && Tc(t, a, r, o), bo = !1;
			var f = t.memoizedState;
			a.state = f, ko(t, r, a, i), Oo(), l = t.memoizedState, s || f !== l || bo ? (typeof d == "function" && (Sc(t, n, d, r), l = t.memoizedState), (c = bo || wc(t, n, c, r, f, l, o)) ? (u || typeof a.UNSAFE_componentWillMount != "function" && typeof a.componentWillMount != "function" || (typeof a.componentWillMount == "function" && a.componentWillMount(), typeof a.UNSAFE_componentWillMount == "function" && a.UNSAFE_componentWillMount()), typeof a.componentDidMount == "function" && (t.flags |= 4194308)) : (typeof a.componentDidMount == "function" && (t.flags |= 4194308), t.memoizedProps = r, t.memoizedState = l), a.props = r, a.state = l, a.context = o, r = c) : (typeof a.componentDidMount == "function" && (t.flags |= 4194308), r = !1);
		} else {
			a = t.stateNode, So(e, t), o = t.memoizedProps, u = Ec(n, o), a.props = u, d = t.pendingProps, f = a.context, l = n.contextType, c = Ri, typeof l == "object" && l && (c = Ma(l)), s = n.getDerivedStateFromProps, (l = typeof s == "function" || typeof a.getSnapshotBeforeUpdate == "function") || typeof a.UNSAFE_componentWillReceiveProps != "function" && typeof a.componentWillReceiveProps != "function" || (o !== d || f !== c) && Tc(t, a, r, c), bo = !1, f = t.memoizedState, a.state = f, ko(t, r, a, i), Oo();
			var p = t.memoizedState;
			o !== d || f !== p || bo || e !== null && e.dependencies !== null && Aa(e.dependencies) ? (typeof s == "function" && (Sc(t, n, s, r), p = t.memoizedState), (u = bo || wc(t, n, u, r, f, p, c) || e !== null && e.dependencies !== null && Aa(e.dependencies)) ? (l || typeof a.UNSAFE_componentWillUpdate != "function" && typeof a.componentWillUpdate != "function" || (typeof a.componentWillUpdate == "function" && a.componentWillUpdate(r, p, c), typeof a.UNSAFE_componentWillUpdate == "function" && a.UNSAFE_componentWillUpdate(r, p, c)), typeof a.componentDidUpdate == "function" && (t.flags |= 4), typeof a.getSnapshotBeforeUpdate == "function" && (t.flags |= 1024)) : (typeof a.componentDidUpdate != "function" || o === e.memoizedProps && f === e.memoizedState || (t.flags |= 4), typeof a.getSnapshotBeforeUpdate != "function" || o === e.memoizedProps && f === e.memoizedState || (t.flags |= 1024), t.memoizedProps = r, t.memoizedState = p), a.props = r, a.state = p, a.context = c, r = u) : (typeof a.componentDidUpdate != "function" || o === e.memoizedProps && f === e.memoizedState || (t.flags |= 4), typeof a.getSnapshotBeforeUpdate != "function" || o === e.memoizedProps && f === e.memoizedState || (t.flags |= 1024), r = !1);
		}
		return a = r, qc(e, t), r = !!(t.flags & 128), a || r ? (a = t.stateNode, n = r && typeof n.getDerivedStateFromError != "function" ? null : a.render(), t.flags |= 1, e !== null && r ? (t.child = vo(t, e.child, null, i), t.child = vo(t, null, n, i)) : Lc(e, t, n, i), t.memoizedState = a.state, e = t.child) : e = fl(e, t, i), e;
	}
	function Zc(e, t, n, r) {
		return ya(), t.flags |= 256, Lc(e, t, n, r), t.child;
	}
	var Qc = {
		dehydrated: null,
		treeContext: null,
		retryLane: 0,
		hydrationErrors: null
	};
	function $c(e) {
		return {
			baseLanes: e,
			cachePool: eo()
		};
	}
	function el(e, t, n) {
		return e = e === null ? 0 : e.childLanes & ~n, t && (e |= ud), e;
	}
	function tl(e, t, n) {
		var r = t.pendingProps, i = !1, a = !!(t.flags & 128), o;
		if ((o = a) || (o = e !== null && e.memoizedState === null ? !1 : !!(Wo.current & 2)), o && (i = !0, t.flags &= -129), o = !!(t.flags & 32), t.flags &= -33, e === null) {
			if (N) {
				if (i ? zo(t) : Ho(), (e = M) ? (e = am(e, pa), e = e !== null && e.data !== "&" ? e : null, e !== null && (t.memoizedState = {
					dehydrated: e,
					treeContext: ra === null ? null : {
						id: ia,
						overflow: aa
					},
					retryLane: 536870912,
					hydrationErrors: null
				}, n = qi(e), n.return = t, t.child = n, da = t, M = null)) : e = null, e === null) throw ha(t);
				return t.lanes = sm(e) ? 32 : 536870912, null;
			}
			return a = r.children, r = r.fallback, i ? (Ho(), i = t.mode, a = rl({
				mode: "hidden",
				children: a
			}, i), r = Gi(r, i, n, null), a.return = t, r.return = t, a.sibling = r, t.child = a, r = t.child, r.memoizedState = $c(n), r.childLanes = el(e, o, n), t.memoizedState = Qc, Hc(null, r)) : (zo(t), nl(t, a));
		}
		var s = e.memoizedState;
		if (s !== null) {
			var c = s.dehydrated;
			if (c !== null) return al(e, t, a, o, r, c, s, n);
		}
		return i ? (Ho(), i = r.fallback, a = t.mode, s = e.child, c = s.sibling, r = Hi(s, {
			mode: "hidden",
			children: r.children
		}), r.subtreeFlags = s.subtreeFlags & 1206910976, c === null ? (i = Gi(i, a, n, null), i.flags |= 2) : i = Hi(c, i), i.return = t, r.return = t, r.sibling = i, t.child = r, Hc(null, r), r = t.child, i = e.child.memoizedState, i === null ? i = $c(n) : (a = i.cachePool, a === null ? a = eo() : (s = P._currentValue, a = a.parent === s ? a : {
			parent: s,
			pool: s
		}), i = {
			baseLanes: i.baseLanes | n,
			cachePool: a
		}), r.memoizedState = i, r.childLanes = el(e, o, n), t.memoizedState = Qc, Hc(e.child, r)) : (zo(t), n = e.child, e = n.sibling, n = Hi(n, {
			mode: "visible",
			children: r.children
		}), n.return = t, n.sibling = null, e !== null && (o = t.deletions, o === null ? (t.deletions = [e], t.flags |= 16) : o.push(e)), t.child = n, t.memoizedState = null, n);
	}
	function nl(e, t) {
		return t = rl({
			mode: "visible",
			children: t
		}, e.mode), t.return = e, e.child = t;
	}
	function rl(e, t) {
		return e = Bi(22, e, null, t), e.lanes = 0, e;
	}
	function il(e, t, n) {
		return vo(t, e.child, null, n), e = nl(t, t.pendingProps.children), e.flags |= 2, t.memoizedState = null, e;
	}
	function al(e, t, n, r, a, o, s, c) {
		if (n) return t.flags & 256 ? (zo(t), t.flags &= -257, il(e, t, c)) : t.memoizedState === null ? (Ho(), o = a.fallback, s = t.mode, a = rl({
			mode: "visible",
			children: a.children
		}, s), o = Gi(o, s, c, null), o.flags |= 2, a.return = t, o.return = t, a.sibling = o, t.child = a, vo(t, e.child, null, c), a = t.child, a.memoizedState = $c(c), a.childLanes = el(e, r, c), t.memoizedState = Qc, Hc(null, a)) : (Ho(), t.child = e.child, t.flags |= 128, null);
		if (zo(t), sm(o)) {
			if (r = o.nextSibling && o.nextSibling.dataset, r) var l = r.dgst;
			return r = l, r !== "" && (a = Error(i(419)), a.stack = "", a.digest = r, xa({
				value: a,
				source: null,
				stack: null
			})), il(e, t, c);
		}
		if (B || ka(e, t, c, !1), r = (c & e.childLanes) !== 0, B || r) {
			if (Mo.current !== null) return il(e, t, c);
			if (r = G, r !== null && (a = wt(r, c), a !== 0 && a !== s.retryLane)) throw s.retryLane = a, Fi(e, a), Pd(r, e, a), Ic;
			return om(o) || Kd(), il(e, t, c);
		}
		return om(o) ? (t.flags |= 192, t.child = e.child, null) : (e = s.treeContext, M = lm(o.nextSibling), da = t, N = !0, fa = null, pa = !1, e !== null && ua(t, e), t = nl(t, a.children), t.flags |= 134221824, t);
	}
	function ol(e, t, n) {
		e.lanes |= t;
		var r = e.alternate;
		r !== null && (r.lanes |= t), Da(e.return, t, n);
	}
	function sl(e) {
		for (var t = null; e !== null;) {
			var n = e.alternate;
			n !== null && qo(n) === null && (t = e), e = e.sibling;
		}
		return t;
	}
	function cl(e, t, n, r, i, a) {
		var o = e.memoizedState;
		o === null ? e.memoizedState = {
			isBackwards: t,
			rendering: null,
			renderingStartTime: 0,
			last: r,
			tail: n,
			tailMode: i,
			treeForkCount: a
		} : (o.isBackwards = t, o.rendering = null, o.renderingStartTime = 0, o.last = r, o.tail = n, o.tailMode = i, o.treeForkCount = a);
	}
	function ll(e) {
		var t = e.child;
		for (e.child = null; t !== null;) {
			var n = t.sibling;
			t.sibling = e.child, e.child = t, t = n;
		}
	}
	function ul(e, t, n) {
		var r = t.pendingProps, i = r.revealOrder, a = r.tail;
		r = r.children;
		var o = Wo.current;
		if (t.flags & 128) return Go(t, o), null;
		var s = !!(o & 2);
		if (s ? (o = o & 1 | 2, t.flags |= 128) : o &= 1, Go(t, o), i === "backwards" && e !== null ? (ll(e), Lc(e, t, r, n), ll(e)) : Lc(e, t, r, n), r = N ? ea : 0, !s && e !== null && e.flags & 128) a: for (e = t.child; e !== null;) {
			if (e.tag === 13) e.memoizedState !== null && ol(e, n, t);
			else if (e.tag === 19) ol(e, n, t);
			else if (e.child !== null) {
				e.child.return = e, e = e.child;
				continue;
			}
			if (e === t) break a;
			for (; e.sibling === null;) {
				if (e.return === null || e.return === t) break a;
				e = e.return;
			}
			e.sibling.return = e.return, e = e.sibling;
		}
		switch (i) {
			case "backwards":
				n = sl(t.child), n === null ? (i = t.child, t.child = null) : (i = n.sibling, n.sibling = null, ll(t)), cl(t, !0, i, null, a, r);
				break;
			case "unstable_legacy-backwards":
				for (n = null, i = t.child, t.child = null; i !== null;) {
					if (e = i.alternate, e !== null && qo(e) === null) {
						t.child = i;
						break;
					}
					e = i.sibling, i.sibling = n, n = i, i = e;
				}
				cl(t, !0, n, null, a, r);
				break;
			case "together":
				cl(t, !1, null, null, void 0, r);
				break;
			case "independent":
				t.memoizedState = null;
				break;
			default: n = sl(t.child), n === null ? (i = t.child, t.child = null) : (i = n.sibling, n.sibling = null), cl(t, !1, i, n, a, r);
		}
		return t.child;
	}
	function dl(e, t, n) {
		var r = t.pendingProps;
		return Ta(t, t.type, r.value), Lc(e, t, r.children, n), t.child;
	}
	function fl(e, t, n) {
		if (e !== null && (t.dependencies = e.dependencies), sd |= t.lanes, (n & t.childLanes) === 0) {
			if (e !== null) {
				if (ka(e, t, n, !1), (n & t.childLanes) === 0) return null;
			} else return null;
		}
		if (e !== null && t.child !== e.child) throw Error(i(153));
		if (t.child !== null) {
			for (e = t.child, n = Hi(e, e.pendingProps), t.child = n, n.return = t; e.sibling !== null;) e = e.sibling, n = n.sibling = Hi(e, e.pendingProps), n.return = t;
			n.sibling = null;
		}
		return t.child;
	}
	function pl(e, t) {
		return (e.lanes & t) !== 0 || (e = e.dependencies, !!(e !== null && Aa(e)));
	}
	function ml(e, t, n) {
		switch (t.tag) {
			case 3:
				Ne(t, t.stateNode.containerInfo), Ta(t, P, e.memoizedState.cache), ya();
				break;
			case 27:
			case 5:
				Fe(t);
				break;
			case 4:
				Ne(t, t.stateNode.containerInfo);
				break;
			case 10:
				Ta(t, t.type, t.memoizedProps.value);
				break;
			case 31:
				if (t.memoizedState !== null) return t.flags |= 128, Bo(t), null;
				break;
			case 13:
				var r = t.memoizedState;
				if (r !== null) {
					if (r.dehydrated !== null) return zo(t), t.flags |= 128, null;
					r = ka(e, t, n, !1);
					var i = t.child.childLanes;
					return r || (n & i) !== 0 ? tl(e, t, n) : (zo(t), e = fl(e, t, n), e === null ? null : e.sibling);
				}
				zo(t);
				break;
			case 19:
				if (t.flags & 128) return ul(e, t, n);
				if (i = !!(e.flags & 128), r = (n & t.childLanes) !== 0, r ||= (ka(e, t, n, !1), (n & t.childLanes) !== 0), i) {
					if (r) return ul(e, t, n);
					t.flags |= 128;
				}
				if (i = t.memoizedState, i !== null && (i.rendering = null, i.tail = null, i.lastEffect = null), Go(t, Wo.current), r) break;
				return null;
			case 22: return t.lanes = 0, Vc(e, t, n, t.pendingProps);
			case 24: Ta(t, P, e.memoizedState.cache);
		}
		return fl(e, t, n);
	}
	function hl(e, t, n) {
		if (e !== null) {
			if (e.memoizedProps !== t.pendingProps) B = !0;
			else {
				if (!pl(e, n) && !(t.flags & 128)) return B = !1, ml(e, t, n);
				B = !!(e.flags & 131072);
			}
		} else B = !1, N && t.flags & 1048576 && sa(t, ea, t.index);
		switch (t.lanes = 0, t.tag) {
			case 16:
				a: {
					var r = t.pendingProps;
					if (e = so(t.elementType), t.type = e, typeof e == "function") Vi(e) ? (r = Ec(e, r), t.tag = 1, t = Xc(null, t, e, r, n)) : (t.tag = 0, t = Jc(null, t, e, r, n));
					else {
						if (e != null) {
							var a = e.$$typeof;
							if (a === T) {
								t.tag = 11, t = Rc(null, t, e, r, n);
								break a;
							}
							if (a === pe) {
								t.tag = 14, t = zc(null, t, e, r, n);
								break a;
							}
							if (a === ue) {
								t.tag = 10, t.type = e, t = dl(null, t, n);
								break a;
							}
						}
						throw t = Ce(e) || e, Error(i(306, t, ""));
					}
				}
				return t;
			case 0: return Jc(e, t, t.type, t.pendingProps, n);
			case 1: return r = t.type, a = Ec(r, t.pendingProps), Xc(e, t, r, a, n);
			case 3:
				a: {
					if (Ne(t, t.stateNode.containerInfo), e === null) throw Error(i(387));
					r = t.pendingProps;
					var o = t.memoizedState;
					a = o.element, So(e, t), ko(t, r, null, n);
					var s = t.memoizedState;
					if (r = s.cache, Ta(t, P, r), r !== o.cache && Oa(t, [P], n, !0), Oo(), r = s.element, o.isDehydrated) {
						if (o = {
							element: r,
							isDehydrated: !1,
							cache: s.cache
						}, t.updateQueue.baseState = o, t.memoizedState = o, t.flags & 256) {
							t = Zc(e, t, r, n);
							break a;
						}
						if (r !== a) {
							a = Xi(Error(i(424)), t), xa(a), t = Zc(e, t, r, n);
							break a;
						}
						switch (e = t.stateNode.containerInfo, e.nodeType) {
							case 9:
								e = e.body;
								break;
							default: e = e.nodeName === "HTML" ? e.ownerDocument.body : e;
						}
						for (M = lm(e.firstChild), da = t, N = !0, fa = null, pa = !0, n = yo(t, null, r, n), t.child = n; n;) n.flags = n.flags & -3 | 134221824, n = n.sibling;
					} else {
						if (ya(), r === a) {
							t = fl(e, t, n);
							break a;
						}
						Lc(e, t, r, n);
					}
					t = t.child;
				}
				return t;
			case 26: return qc(e, t), e === null ? (n = Nm(t.type, null, t.pendingProps, null)) ? t.memoizedState = n : N || (t.stateNode = fp(t.type, t.pendingProps, je.current, t)) : t.memoizedState = Nm(t.type, e.memoizedProps, t.pendingProps, e.memoizedState), null;
			case 27: return Fe(t), e === null && N && (r = t.stateNode = hm(t.type, t.pendingProps, je.current), da = t, pa = !0, a = M, Sp(t.type) ? (um = a, M = lm(r.firstChild)) : M = a), Lc(e, t, t.pendingProps.children, n), qc(e, t), e === null && (t.flags |= 4194304), t.child;
			case 5: return e === null && N && ((a = r = M) && (r = rm(r, t.type, t.pendingProps, pa), r === null ? a = !1 : (t.stateNode = r, da = t, M = lm(r.firstChild), pa = !1, a = !0)), a || ha(t)), Fe(t), a = t.type, o = t.pendingProps, s = e === null ? null : e.memoizedProps, r = o.children, pp(a, o) ? r = null : s !== null && pp(a, s) && (t.flags |= 32), t.memoizedState !== null && (a = rs(e, t, os, null, null, n), sh._currentValue = a), qc(e, t), Lc(e, t, r, n), t.child;
			case 6: return e === null && N && ((e = n = M) && (n = im(n, t.pendingProps, pa), n === null ? e = !1 : (t.stateNode = n, da = t, M = null, e = !0)), e || ha(t)), null;
			case 13: return tl(e, t, n);
			case 4: return Ne(t, t.stateNode.containerInfo), r = t.pendingProps, e === null ? t.child = vo(t, null, r, n) : Lc(e, t, r, n), t.child;
			case 11: return Rc(e, t, t.type, t.pendingProps, n);
			case 7: return r = t.pendingProps, qc(e, t), Lc(e, t, r, n), t.child;
			case 8: return Lc(e, t, t.pendingProps.children, n), t.child;
			case 12: return Lc(e, t, t.pendingProps.children, n), t.child;
			case 10: return dl(e, t, n);
			case 9: return a = t.type._context, r = t.pendingProps.children, ja(t), a = Ma(a), r = r(a), t.flags |= 1, Lc(e, t, r, n), t.child;
			case 14: return zc(e, t, t.type, t.pendingProps, n);
			case 15: return Bc(e, t, t.type, t.pendingProps, n);
			case 19: return ul(e, t, n);
			case 31: return Kc(e, t, n);
			case 22: return Vc(e, t, n, t.pendingProps);
			case 24: return ja(t), r = Ma(P), e === null ? (a = Qa(), a === null && (a = G, o = Ra(), a.pooledCache = o, o.refCount++, o !== null && (a.pooledCacheLanes |= n), a = o), t.memoizedState = {
				parent: r,
				cache: a
			}, xo(t), Ta(t, P, a)) : ((e.lanes & n) !== 0 && (So(e, t), ko(t, null, null, n), Oo()), a = e.memoizedState, o = t.memoizedState, a.parent === r ? (r = o.cache, Ta(t, P, r), r !== a.cache && Oa(t, [P], n, !0)) : (a = {
				parent: r,
				cache: r
			}, t.memoizedState = a, t.lanes === 0 && (t.memoizedState = t.updateQueue.baseState = a), Ta(t, P, r))), Lc(e, t, t.pendingProps.children, n), t.child;
			case 30: return t.stateNode === null && (t.stateNode = {
				autoName: null,
				paired: null,
				clones: null,
				ref: null
			}), r = t.pendingProps, r.name != null && r.name !== "auto" ? t.flags |= e === null ? 18882560 : 18874368 : N && ca(t), e !== null && e.memoizedProps.name !== r.name ? t.flags |= 4194816 : qc(e, t), Lc(e, t, r.children, n), t.child;
			case 29: throw t.pendingProps;
		}
		throw Error(i(156, t.tag));
	}
	function gl(e) {
		e.flags |= 4;
	}
	function _l(e, t, n, r, i) {
		var a;
		if ((a = !!(e.mode & 32)) && (a = n === null ? Jm(t, r) : Jm(t, r) && (r.src !== n.src || r.srcSet !== n.srcSet)), a) {
			if (e.flags |= 16777216, (i & 335544128) === i) {
				if (e.stateNode.complete) e.flags |= 8192;
				else if (Ud()) e.flags |= 8192;
				else throw co = io, no;
			}
		} else e.flags &= -16777217;
	}
	function vl(e, t) {
		if (t.type !== "stylesheet" || t.state.loading & 4) e.flags &= -16777217;
		else if (e.flags |= 16777216, !Ym(t)) {
			if (Ud()) e.flags |= 8192;
			else throw co = io, no;
		}
	}
	function yl(e, t) {
		t !== null && (e.flags |= 4), e.flags & 16384 && (t = e.tag === 22 ? 536870912 : vt(), e.lanes |= t, dd |= t);
	}
	function bl(e, t) {
		if (!N) switch (e.tailMode) {
			case "visible": break;
			case "collapsed":
				for (var n = e.tail, r = null; n !== null;) n.alternate !== null && (r = n), n = n.sibling;
				r === null ? t || e.tail === null ? e.tail = null : e.tail.sibling = null : r.sibling = null;
				break;
			default:
				for (t = e.tail, n = null; t !== null;) t.alternate !== null && (n = t), t = t.sibling;
				n === null ? e.tail = null : n.sibling = null;
		}
	}
	function V(e) {
		var t = e.alternate !== null && e.alternate.child === e.child, n = 0, r = 0;
		if (t) for (var i = e.child; i !== null;) n |= i.lanes | i.childLanes, r |= i.subtreeFlags & 1206910976, r |= i.flags & 1206910976, i.return = e, i = i.sibling;
		else for (i = e.child; i !== null;) n |= i.lanes | i.childLanes, r |= i.subtreeFlags, r |= i.flags, i.return = e, i = i.sibling;
		return e.subtreeFlags |= r, e.childLanes = n, t;
	}
	function xl(e, t, n) {
		var r = t.pendingProps;
		switch (la(t), t.tag) {
			case 16:
			case 15:
			case 0:
			case 11:
			case 7:
			case 8:
			case 12:
			case 9:
			case 14: return V(t), null;
			case 1: return V(t), null;
			case 3: return n = t.stateNode, r = null, e !== null && (r = e.memoizedState.cache), t.memoizedState.cache !== r && (t.flags |= 2048), Ea(P), Pe(), n.pendingContext && (n.context = n.pendingContext, n.pendingContext = null), (e === null || e.child === null) && (va(t) ? gl(t) : e === null || e.memoizedState.isDehydrated && !(t.flags & 256) || (t.flags |= 1024, ba())), V(t), null;
			case 26:
				var a = t.type, o = t.memoizedState;
				return e === null ? (gl(t), o === null ? (V(t), _l(t, a, null, r, n)) : (V(t), vl(t, o))) : o ? o === e.memoizedState ? (V(t), t.flags &= -16777217) : (gl(t), V(t), vl(t, o)) : (e = e.memoizedProps, e !== r && gl(t), V(t), _l(t, a, e, r, n)), null;
			case 27:
				if (Ie(t), n = je.current, a = t.type, e !== null && t.stateNode != null) e.memoizedProps !== r && gl(t);
				else {
					if (!r) {
						if (t.stateNode === null) throw Error(i(166));
						return V(t), t.subtreeFlags &= -33554433, null;
					}
					e = ke.current, va(t) ? ga(t, e) : (e = hm(a, r, n), t.stateNode = e, gl(t));
				}
				return V(t), t.subtreeFlags &= -33554433, null;
			case 5:
				if (Ie(t), a = t.type, e !== null && t.stateNode != null) e.memoizedProps !== r && gl(t);
				else {
					if (!r) {
						if (t.stateNode === null) throw Error(i(166));
						return V(t), t.subtreeFlags &= -33554433, null;
					}
					if (o = ke.current, va(t)) ga(t, o);
					else {
						var s = lp(je.current);
						switch (o) {
							case 1:
								o = s.createElementNS("http://www.w3.org/2000/svg", a);
								break;
							case 2:
								o = s.createElementNS("http://www.w3.org/1998/Math/MathML", a);
								break;
							default: switch (a) {
								case "svg":
									o = s.createElementNS("http://www.w3.org/2000/svg", a);
									break;
								case "math":
									o = s.createElementNS("http://www.w3.org/1998/Math/MathML", a);
									break;
								case "script":
									o = s.createElement("div"), o.innerHTML = "<script><\/script>", o = o.removeChild(o.firstChild);
									break;
								case "select":
									o = typeof r.is == "string" ? s.createElement("select", { is: r.is }) : s.createElement("select"), r.multiple ? o.multiple = !0 : r.size && (o.size = r.size);
									break;
								default: o = typeof r.is == "string" ? s.createElement(a, { is: r.is }) : s.createElement(a);
							}
						}
						o[At] = t, o[jt] = r;
						a: for (s = t.child; s !== null;) {
							if (s.tag === 5 || s.tag === 6) o.appendChild(s.stateNode);
							else if (s.tag !== 4 && s.tag !== 27 && s.child !== null) {
								s.child.return = s, s = s.child;
								continue;
							}
							if (s === t) break a;
							for (; s.sibling === null;) {
								if (s.return === null || s.return === t) break a;
								s = s.return;
							}
							s.sibling.return = s.return, s = s.sibling;
						}
						t.stateNode = o;
						a: switch (np(o, a, r), a) {
							case "button":
							case "input":
							case "select":
							case "textarea":
								r = !!r.autoFocus;
								break a;
							case "img":
								r = !0;
								break a;
							default: r = !1;
						}
						r && gl(t);
					}
				}
				return V(t), t.subtreeFlags &= -33554433, _l(t, t.type, e === null ? null : e.memoizedProps, t.pendingProps, n), null;
			case 6:
				if (e && t.stateNode != null) e.memoizedProps !== r && gl(t);
				else {
					if (typeof r != "string" && t.stateNode === null) throw Error(i(166));
					if (e = je.current, va(t)) {
						if (e = t.stateNode, n = t.memoizedProps, r = null, a = da, a !== null) switch (a.tag) {
							case 27:
							case 5: r = a.memoizedProps;
						}
						e[At] = t, e = !!(e.nodeValue === n || r !== null && !0 === r.suppressHydrationWarning || ep(e.nodeValue, n)), e || ha(t, !0);
					} else e = lp(e).createTextNode(r), e[At] = t, t.stateNode = e;
				}
				return V(t), null;
			case 31:
				if (n = t.memoizedState, e === null || e.memoizedState !== null) {
					if (r = va(t), n !== null) {
						if (e === null) {
							if (!r) throw Error(i(318));
							if (e = t.memoizedState, e = e === null ? null : e.dehydrated, !e) throw Error(i(557));
							e[At] = t;
						} else ya(), !(t.flags & 128) && (t.memoizedState = null), t.flags |= 4;
						V(t), e = !1;
					} else n = ba(), e !== null && e.memoizedState !== null && (e.memoizedState.hydrationErrors = n), e = !0;
					if (!e) return t.flags & 256 ? (Uo(t), t) : (Uo(t), null);
					if (t.flags & 128) throw Error(i(558));
				}
				return V(t), null;
			case 13:
				if (r = t.memoizedState, e === null || e.memoizedState !== null && e.memoizedState.dehydrated !== null) {
					if (a = va(t), r !== null && r.dehydrated !== null) {
						if (e === null) {
							if (!a) throw Error(i(318));
							if (a = t.memoizedState, a = a === null ? null : a.dehydrated, !a) throw Error(i(317));
							a[At] = t;
						} else ya(), !(t.flags & 128) && (t.memoizedState = null), t.flags |= 4;
						V(t), a = !1;
					} else a = ba(), e !== null && e.memoizedState !== null && (e.memoizedState.hydrationErrors = a), a = !0;
					if (!a) return t.flags & 256 ? (Uo(t), t) : (Uo(t), null);
				}
				return Uo(t), t.flags & 128 ? (t.lanes = n, t) : (n = r !== null, e = e !== null && e.memoizedState !== null, n && (r = t.child, a = null, r.alternate !== null && r.alternate.memoizedState !== null && r.alternate.memoizedState.cachePool !== null && (a = r.alternate.memoizedState.cachePool.pool), o = null, r.memoizedState !== null && r.memoizedState.cachePool !== null && (o = r.memoizedState.cachePool.pool), o !== a && (r.flags |= 2048)), n !== e && n && (t.child.flags |= 8192), yl(t, t.updateQueue), V(t), null);
			case 4: return Pe(), e === null && Wf(t.stateNode.containerInfo), t.flags |= 67108864, V(t), null;
			case 10: return Ea(t.type), V(t), null;
			case 19:
				if (Ko(t), r = t.memoizedState, r === null) return V(t), null;
				if (a = !!(t.flags & 128), o = r.rendering, o === null) {
					if (a) bl(r, !1);
					else {
						if (Y !== 0 || e !== null && e.flags & 128) for (e = t.child; e !== null;) {
							if (o = qo(e), o !== null) {
								for (t.flags |= 128, bl(r, !1), e = o.updateQueue, t.updateQueue = e, yl(t, e), t.subtreeFlags = 0, e = n, n = t.child; n !== null;) Ui(n, e), n = n.sibling;
								return Go(t, Wo.current & 1 | 2), N && oa(t, r.treeForkCount), t.child;
							}
							e = e.sibling;
						}
						r.tail !== null && A() > _d && (t.flags |= 128, a = !0, bl(r, !1), t.lanes = 4194304);
					}
				} else {
					if (!a) {
						if (e = qo(o), e !== null) {
							if (t.flags |= 128, a = !0, e = e.updateQueue, t.updateQueue = e, yl(t, e), bl(r, !0), r.tail === null && r.tailMode !== "collapsed" && r.tailMode !== "visible" && !o.alternate && !N) return V(t), null;
						} else 2 * A() - r.renderingStartTime > _d && n !== 536870912 && (t.flags |= 128, a = !0, bl(r, !1), t.lanes = 4194304);
					}
					r.isBackwards ? (o.sibling = t.child, t.child = o) : (e = r.last, e === null ? t.child = o : e.sibling = o, r.last = o);
				}
				if (r.tail !== null) {
					e = r.tail;
					a: {
						for (n = e; n !== null;) {
							if (n.alternate !== null) {
								n = !1;
								break a;
							}
							n = n.sibling;
						}
						n = !0;
					}
					return r.rendering = e, r.tail = e.sibling, r.renderingStartTime = A(), e.sibling = null, o = Wo.current, o = a ? o & 1 | 2 : o & 1, r.tailMode === "visible" || r.tailMode === "collapsed" || !n || N ? Go(t, o) : (n = o, k(Lo, t), k(Wo, n), Ro === null && (Ro = t)), N && oa(t, r.treeForkCount), e;
				}
				return V(t), null;
			case 22:
			case 23: return Uo(t), Io(), r = t.memoizedState !== null, e === null ? r && (t.flags |= 8192) : e.memoizedState !== null !== r && (t.flags |= 8192), r ? n & 536870912 && !(t.flags & 128) && (V(t), t.subtreeFlags & 6 && (t.flags |= 8192)) : V(t), n = t.updateQueue, n !== null && yl(t, n.retryQueue), n = null, e !== null && e.memoizedState !== null && e.memoizedState.cachePool !== null && (n = e.memoizedState.cachePool.pool), r = null, t.memoizedState !== null && t.memoizedState.cachePool !== null && (r = t.memoizedState.cachePool.pool), r !== n && (t.flags |= 2048), e !== null && O(Za), null;
			case 24: return n = null, e !== null && (n = e.memoizedState.cache), t.memoizedState.cache !== n && (t.flags |= 2048), Ea(P), V(t), null;
			case 25: return null;
			case 30: return t.flags |= 33554432, V(t), null;
		}
		throw Error(i(156, t.tag));
	}
	function Sl(e, t) {
		switch (la(t), t.tag) {
			case 1: return e = t.flags, e & 65536 ? (t.flags = e & -65537 | 128, t) : null;
			case 3: return Ea(P), Pe(), e = t.flags, e & 65536 && !(e & 128) ? (t.flags = e & -65537 | 128, t) : null;
			case 26:
			case 27:
			case 5: return Ie(t), null;
			case 31:
				if (t.memoizedState !== null) {
					if (Uo(t), t.alternate === null) throw Error(i(340));
					ya();
				}
				return e = t.flags, e & 65536 ? (t.flags = e & -65537 | 128, t) : null;
			case 13:
				if (Uo(t), e = t.memoizedState, e !== null && e.dehydrated !== null) {
					if (t.alternate === null) throw Error(i(340));
					ya();
				}
				return e = t.flags, e & 65536 ? (t.flags = e & -65537 | 128, t) : null;
			case 19: return Ko(t), e = t.flags, e & 65536 ? (t.flags = e & -65537 | 128, e = t.memoizedState, e !== null && (e.rendering = null, e.tail = null), t.flags |= 4, t) : null;
			case 4: return Pe(), null;
			case 10: return Ea(t.type), null;
			case 22:
			case 23: return Uo(t), Io(), e !== null && O(Za), e = t.flags, e & 65536 ? (t.flags = e & -65537 | 128, t) : null;
			case 24: return Ea(P), null;
			case 25: return null;
			default: return null;
		}
	}
	function Cl(e, t) {
		switch (la(t), t.tag) {
			case 3:
				Ea(P), Pe();
				break;
			case 26:
			case 27:
			case 5:
				Ie(t);
				break;
			case 4:
				Pe();
				break;
			case 31:
				t.memoizedState !== null && Uo(t);
				break;
			case 13:
				Uo(t);
				break;
			case 19:
				Ko(t);
				break;
			case 10:
				Ea(t.type);
				break;
			case 22:
			case 23:
				Uo(t), Io(), e !== null && O(Za);
				break;
			case 24: Ea(P);
		}
	}
	function wl(e, t) {
		try {
			var n = t.updateQueue, r = n === null ? null : n.lastEffect;
			if (r !== null) {
				var i = r.next;
				n = i;
				do {
					if ((n.tag & e) === e) {
						r = void 0;
						var a = n.create, o = n.inst;
						r = a(), o.destroy = r;
					}
					n = n.next;
				} while (n !== i);
			}
		} catch (e) {
			Z(t, t.return, e);
		}
	}
	function Tl(e, t, n) {
		try {
			var r = t.updateQueue, i = r === null ? null : r.lastEffect;
			if (i !== null) {
				var a = i.next;
				r = a;
				do {
					if ((r.tag & e) === e) {
						var o = r.inst, s = o.destroy;
						if (s !== void 0) {
							o.destroy = void 0, i = t;
							var c = n, l = s;
							try {
								l();
							} catch (e) {
								Z(i, c, e);
							}
						}
					}
					r = r.next;
				} while (r !== a);
			}
		} catch (e) {
			Z(t, t.return, e);
		}
	}
	function El(e) {
		var t = e.updateQueue;
		if (t !== null) {
			var n = e.stateNode;
			try {
				jo(t, n);
			} catch (t) {
				Z(e, e.return, t);
			}
		}
	}
	function Dl(e, t, n) {
		n.props = Ec(e.type, e.memoizedProps), n.state = e.memoizedState;
		try {
			n.componentWillUnmount();
		} catch (n) {
			Z(e, t, n);
		}
	}
	function Ol(e, t) {
		try {
			var n = e.ref;
			if (n !== null) {
				switch (e.tag) {
					case 26:
					case 27:
					case 5:
						var r = e.stateNode;
						break;
					case 30:
						var i = e.stateNode, a = Ti(e.memoizedProps, i);
						(i.ref === null || i.ref.name !== a) && (i.ref = Pp(a)), r = i.ref;
						break;
					case 7:
						if (e.stateNode === null) {
							var o = new Fp(e);
							h(e.child, !1, Qp, o, void 0, void 0), e.stateNode = o;
						}
						r = e.stateNode;
						break;
					default: r = e.stateNode;
				}
				typeof n == "function" ? e.refCleanup = n(r) : n.current = r;
			}
		} catch (n) {
			Z(e, t, n);
		}
	}
	function kl(e, t) {
		var n = e.ref, r = e.refCleanup;
		if (n !== null) {
			if (typeof r == "function") try {
				r();
			} catch (n) {
				Z(e, t, n);
			} finally {
				e.refCleanup = null, e = e.alternate, e != null && (e.refCleanup = null);
			}
			else if (typeof n == "function") try {
				n(null);
			} catch (n) {
				Z(e, t, n);
			}
			else n.current = null;
		}
	}
	function Al(e, t) {
		if ((e.tag === 5 || e.tag === 27 || e.tag === 6) && e.alternate === null && t !== null) for (var n = 0; n < t.length; n++) em(e.stateNode, t[n]);
	}
	function jl(e) {
		for (var t = e.return; t !== null && (Pl(t) && em(e.stateNode, t.stateNode), !Nl(t));) t = t.return;
	}
	function Ml(e) {
		for (var t = e.return; t !== null && (Pl(t) && tm(e.stateNode, t.stateNode), !Nl(t));) t = t.return;
	}
	function Nl(e) {
		return e.tag === 5 || e.tag === 3 || e.tag === 27;
	}
	function Pl(e) {
		return e && e.tag === 7 && e.stateNode !== null;
	}
	function Fl(e) {
		var t = e.type, n = e.memoizedProps, r = e.stateNode;
		try {
			a: switch (t) {
				case "button":
				case "input":
				case "select":
				case "textarea":
					n.autoFocus && r.focus();
					break a;
				case "img": n.src ? r.src = n.src : n.srcSet && (r.srcset = n.srcSet);
			}
		} catch (t) {
			Z(e, e.return, t);
		}
	}
	function Il(e, t, n) {
		try {
			var r = e.stateNode;
			ip(r, e.type, n, t), r[jt] = t;
		} catch (t) {
			Z(e, e.return, t);
		}
	}
	function Ll(e) {
		return e.tag === 5 || e.tag === 3 || e.tag === 26 || e.tag === 27 && Sp(e.type) || e.tag === 4;
	}
	function Rl(e) {
		a: for (;;) {
			for (; e.sibling === null;) {
				if (e.return === null || Ll(e.return)) return null;
				e = e.return;
			}
			for (e.sibling.return = e.return, e = e.sibling; e.tag !== 5 && e.tag !== 6 && e.tag !== 18;) {
				if (e.tag === 27 && Sp(e.type) || e.flags & 2 || e.child === null || e.tag === 4) continue a;
				e.child.return = e, e = e.child;
			}
			if (!(e.flags & 2)) return e.stateNode;
		}
	}
	function zl(e, t, n, r) {
		var i = e.tag;
		if (i === 5 || i === 6) i = e.stateNode, t ? (n.nodeType === 9 ? n.body : n.nodeName === "HTML" ? n.ownerDocument.body : n).insertBefore(i, t) : (t = n.nodeType === 9 ? n.body : n.nodeName === "HTML" ? n.ownerDocument.body : n, t.appendChild(i), n = n._reactRootContainer, n != null || t.onclick !== null || (t.onclick = En)), Al(e, r), j = !0;
		else if (i !== 4 && (i === 27 && (Al(e, r), r = null, Sp(e.type) && (n = e.stateNode, t = null)), e = e.child, e !== null)) for (zl(e, t, n, r), e = e.sibling; e !== null;) zl(e, t, n, r), e = e.sibling;
	}
	function Bl(e, t, n, r) {
		var i = e.tag;
		if (i === 5 || i === 6) i = e.stateNode, t ? n.insertBefore(i, t) : n.appendChild(i), Al(e, r), j = !0;
		else if (i !== 4 && (i === 27 && (Al(e, r), r = null, Sp(e.type) && (n = e.stateNode)), e = e.child, e !== null)) for (Bl(e, t, n, r), e = e.sibling; e !== null;) Bl(e, t, n, r), e = e.sibling;
	}
	function Vl(e) {
		var t = e.stateNode, n = e.memoizedProps;
		try {
			for (var r = e.type, i = t.attributes; i.length;) t.removeAttributeNode(i[0]);
			np(t, r, n), t[At] = e, t[jt] = n;
		} catch (t) {
			Z(e, e.return, t);
		}
	}
	var Hl = !1, Ul = null;
	function Wl(e) {
		(e.tag === 30 || e.subtreeFlags & 33554432) && (Hl = !0);
	}
	var Gl = null;
	function Kl() {
		var e = Gl;
		return Gl = null, e;
	}
	var ql = 0;
	function Jl(e, t, n, r, i) {
		return ql = 0, Yl(e.child, t, n, r, i);
	}
	function Yl(e, t, n, r, i) {
		for (var a = !1; e !== null;) {
			if (e.tag === 5) {
				var o = e.stateNode;
				if (r !== null) {
					var s = Op(o);
					r.push(s), s.view && (a = !0);
				} else a || Op(o).view && (a = !0);
				Hl = !0, Tp(o, ql === 0 ? t : t + "_" + ql, n), ql++;
			} else (e.tag !== 22 || e.memoizedState === null) && (e.tag === 30 && i || Yl(e.child, t, n, r, i) && (a = !0));
			e = e.sibling;
		}
		return a;
	}
	function Xl(e, t) {
		for (; e !== null;) e.tag === 5 ? Ep(e.stateNode, e.memoizedProps) : (e.tag !== 22 || e.memoizedState === null) && (e.tag === 30 && t || Xl(e.child, t)), e = e.sibling;
	}
	function Zl(e) {
		if (e.subtreeFlags & 18874368) for (e = e.child; e !== null;) {
			if ((e.tag !== 22 || e.memoizedState === null) && (Zl(e), e.tag === 30 && e.flags & 18874368 && e.stateNode.paired)) {
				var t = e.memoizedProps;
				if (t.name == null || t.name === "auto") throw Error(i(544));
				var n = t.name;
				t = Di(t.default, t.share), t !== "none" && (Jl(e, n, t, null, !1) || Xl(e.child, !1));
			}
			e = e.sibling;
		}
	}
	function Ql(e, t) {
		if (e.tag === 30) {
			var n = e.stateNode, r = e.memoizedProps, i = Ti(r, n), a = Di(r.default, n.paired ? r.share : r.enter);
			a === "none" ? Zl(e) : Jl(e, i, a, null, !1) ? (Zl(e), n.paired || t || Nd(e, r.onEnter)) : Xl(e.child, !1);
		} else if (e.subtreeFlags & 33554432) for (e = e.child; e !== null;) Ql(e, t), e = e.sibling;
		else Zl(e);
	}
	function $l(e) {
		if (Ul !== null && Ul.size !== 0) {
			var t = Ul;
			if (e.subtreeFlags & 18874368) for (e = e.child; e !== null;) {
				if (e.tag !== 22 || e.memoizedState === null) {
					if (e.tag === 30 && e.flags & 18874368) {
						var n = e.memoizedProps, r = n.name;
						if (r != null && r !== "auto") {
							var i = t.get(r);
							if (i !== void 0) {
								var a = Di(n.default, n.share);
								if (a !== "none" && (Jl(e, r, a, null, !1) ? (a = e.stateNode, i.paired = a, a.paired = i, Nd(e, n.onShare)) : Xl(e.child, !1)), t.delete(r), t.size === 0) break;
							}
						}
					}
					$l(e);
				}
				e = e.sibling;
			}
		}
	}
	function eu(e) {
		if (e.tag === 30) {
			var t = e.memoizedProps, n = Ti(t, e.stateNode), r = Ul === null ? void 0 : Ul.get(n), i = Di(t.default, r === void 0 ? t.exit : t.share);
			i !== "none" && (Jl(e, n, i, null, !1) ? r === void 0 ? Nd(e, t.onExit) : (i = e.stateNode, r.paired = i, i.paired = r, Ul.delete(n), Nd(e, t.onShare)) : Xl(e.child, !1)), Ul !== null && $l(e);
		} else if (e.subtreeFlags & 33554432) for (e = e.child; e !== null;) eu(e), e = e.sibling;
		else Ul !== null && $l(e);
	}
	function tu(e) {
		for (e = e.child; e !== null;) {
			if (e.tag === 30) {
				var t = e.memoizedProps, n = Ti(t, e.stateNode);
				t = Di(t.default, t.update), e.flags &= -5, t !== "none" && Jl(e, n, t, e.memoizedState = [], !1);
			} else e.subtreeFlags & 33554432 && tu(e);
			e = e.sibling;
		}
	}
	function nu(e) {
		if (e.subtreeFlags & 18874368) for (e = e.child; e !== null;) {
			if (e.tag !== 22 || e.memoizedState === null) {
				if (e.tag === 30 && e.flags & 18874368) {
					var t = e.stateNode;
					t.paired !== null && (t.paired = null, Xl(e.child, !1));
				}
				nu(e);
			}
			e = e.sibling;
		}
	}
	function ru(e) {
		if (e.tag === 30) e.stateNode.paired = null, Xl(e.child, !1), nu(e);
		else if (e.subtreeFlags & 33554432) for (e = e.child; e !== null;) ru(e), e = e.sibling;
		else nu(e);
	}
	function iu(e) {
		for (e = e.child; e !== null;) e.tag === 30 ? Xl(e.child, !1) : e.subtreeFlags & 33554432 && iu(e), e = e.sibling;
	}
	function au(e, t, n, r, i, a, o) {
		for (var s = !1; t !== null;) {
			if (t.tag === 5) {
				var c = t.stateNode;
				if (a !== null && ql < a.length) {
					var l = a[ql], u = Op(c);
					(l.view || u.view) && (s = !0);
					var d;
					if (d = !(e.flags & 4)) {
						if (u.clip) d = !0;
						else {
							d = l.rect;
							var f = u.rect;
							d = d.y !== f.y || d.x !== f.x || d.height !== f.height || d.width !== f.width;
						}
					}
					d && (e.flags |= 4), u.abs ? u = !l.abs : (l = l.rect, u = u.rect, u = l.height !== u.height || l.width !== u.width), u && (e.flags |= 32);
				} else e.flags |= 32;
				e.flags & 4 && Tp(c, ql === 0 ? n : n + "_" + ql, i), s && e.flags & 4 || (Gl === null && (Gl = []), Gl.push(c, ql === 0 ? r : r + "_" + ql, t.memoizedProps)), ql++;
			} else (t.tag !== 22 || t.memoizedState === null) && (t.tag === 30 && o ? e.flags |= t.flags & 32 : au(e, t.child, n, r, i, a, o) && (s = !0));
			t = t.sibling;
		}
		return s;
	}
	function ou(e, t) {
		for (e = e.child; e !== null;) {
			if (e.tag === 30) {
				var n = e.memoizedProps, r = e.stateNode, i = Ti(n, r), a = Di(n.default, n.update);
				if (t) {
					r = r.clones;
					var o = r === null ? null : r.map(kp);
				} else o = e.memoizedState, e.memoizedState = null;
				r = e;
				var s = e.child;
				ql = 0, i = au(r, s, i, i, a, o, !1), e.flags & 4 && i && (t || Nd(e, n.onUpdate));
			} else e.subtreeFlags & 33554432 && ou(e, t);
			e = e.sibling;
		}
	}
	var su = !1, H = !1, cu = !1, lu = !1, uu = typeof WeakSet == "function" ? WeakSet : Set, du = null, fu = !1, pu = !1, mu = !1, hu = !1;
	function gu(e, t, n) {
		if (e = e.containerInfo, sp = gh, e = ti(e), ni(e)) {
			if ("selectionStart" in e) var r = {
				start: e.selectionStart,
				end: e.selectionEnd
			};
			else a: {
				r = (r = e.ownerDocument) && r.defaultView || window;
				var i = r.getSelection && r.getSelection();
				if (i && i.rangeCount !== 0) {
					r = i.anchorNode;
					var a = i.anchorOffset, o = i.focusNode;
					i = i.focusOffset;
					try {
						r.nodeType, o.nodeType;
					} catch {
						r = null;
						break a;
					}
					var s = 0, c = -1, l = -1, u = 0, d = 0, f = e, p = null;
					b: for (;;) {
						for (var m; f !== r || a !== 0 && f.nodeType !== 3 || (c = s + a), f !== o || i !== 0 && f.nodeType !== 3 || (l = s + i), f.nodeType === 3 && (s += f.nodeValue.length), (m = f.firstChild) !== null;) p = f, f = m;
						for (;;) {
							if (f === e) break b;
							if (p === r && ++u === a && (c = s), p === o && ++d === i && (l = s), (m = f.nextSibling) !== null) break;
							f = p, p = f.parentNode;
						}
						f = m;
					}
					r = c === -1 || l === -1 ? null : {
						start: c,
						end: l
					};
				} else r = null;
			}
			r ||= {
				start: 0,
				end: 0
			};
		} else r = null;
		for (cp = {
			focusedElem: e,
			selectionRange: r
		}, gh = !1, n = (n & 335544064) === n, du = t, t = n ? 9270 : 1024; du !== null;) {
			if (e = du, n && (r = e.deletions, r !== null)) for (a = 0; a < r.length; a++) n && eu(r[a]);
			if (e.alternate === null && e.flags & 2) n && Wl(e), _u(n);
			else {
				if (e.tag === 22) {
					if (r = e.alternate, e.memoizedState !== null) {
						r !== null && r.memoizedState === null && n && eu(r), _u(n);
						continue;
					}
					if (r !== null && r.memoizedState !== null) {
						n && Wl(e), _u(n);
						continue;
					}
				}
				r = e.child, (e.subtreeFlags & t) !== 0 && r !== null ? (r.return = e, du = r) : (n && tu(e), _u(n));
			}
		}
		Ul = null;
	}
	function _u(e) {
		for (; du !== null;) {
			var t = du, n = e, r = t.alternate, a = t.flags;
			switch (t.tag) {
				case 0:
				case 11:
				case 15: break;
				case 1:
					if (a & 1024 && r !== null) {
						n = void 0, a = r.memoizedProps, r = r.memoizedState;
						var o = t.stateNode;
						try {
							var s = Ec(t.type, a);
							n = o.getSnapshotBeforeUpdate(s, r), o.__reactInternalSnapshotBeforeUpdate = n;
						} catch (e) {
							Z(t, t.return, e);
						}
					}
					break;
				case 3:
					if (a & 1024) {
						if (r = t.stateNode.containerInfo, n = r.nodeType, n === 9) nm(r);
						else if (n === 1) switch (r.nodeName) {
							case "HEAD":
							case "HTML":
							case "BODY":
								nm(r);
								break;
							default: r.textContent = "";
						}
					}
					break;
				case 5:
				case 26:
				case 27:
				case 6:
				case 4:
				case 17: break;
				case 30:
					n && r !== null && (n = Ti(r.memoizedProps, r.stateNode), a = t.memoizedProps, a = Di(a.default, a.update), a !== "none" && Jl(r, n, a, r.memoizedState = [], !0));
					break;
				default: if (a & 1024) throw Error(i(163));
			}
			if (r = t.sibling, r !== null) {
				r.return = t.return, du = r;
				break;
			}
			du = t.return;
		}
	}
	function vu(e, t, n) {
		var r = n.flags;
		switch (n.tag) {
			case 0:
			case 11:
			case 15:
				Lu(e, n), r & 4 && wl(5, n);
				break;
			case 1:
				if (Lu(e, n), r & 4) {
					if (e = n.stateNode, t === null) try {
						e.componentDidMount();
					} catch (e) {
						Z(n, n.return, e);
					}
					else {
						var i = Ec(n.type, t.memoizedProps);
						t = t.memoizedState;
						try {
							e.componentDidUpdate(i, t, e.__reactInternalSnapshotBeforeUpdate);
						} catch (e) {
							Z(n, n.return, e);
						}
					}
				}
				r & 64 && El(n), r & 512 && Ol(n, n.return);
				break;
			case 3:
				if (Lu(e, n), r & 64 && (e = n.updateQueue, e !== null)) {
					if (t = null, n.child !== null) switch (n.child.tag) {
						case 27:
						case 5:
							t = n.child.stateNode;
							break;
						case 1: t = n.child.stateNode;
					}
					try {
						jo(e, t);
					} catch (e) {
						Z(n, n.return, e);
					}
				}
				break;
			case 27: t === null && r & 4 && Vl(n);
			case 26:
			case 5:
				Lu(e, n), t === null && r & 4 && Fl(n), r & 512 && Ol(n, n.return);
				break;
			case 12:
				Lu(e, n);
				break;
			case 31:
				Lu(e, n), r & 4 && Eu(e, n);
				break;
			case 13:
				Lu(e, n), r & 4 && Du(e, n), r & 64 && (e = n.memoizedState, e !== null && (e = e.dehydrated, e !== null && (n = _f.bind(null, n), cm(e, n))));
				break;
			case 22:
				if (r = n.memoizedState !== null || su, !r) {
					var a = t !== null && t.memoizedState !== null || H;
					t = su, i = H, su = r, (H = a) && !i ? (r = 2, n.subtreeFlags & 8772 && (r |= 1), zu(e, n, r)) : Lu(e, n), su = t, H = i;
				}
				break;
			case 30:
				Lu(e, n), r & 512 && Ol(n, n.return);
				break;
			case 7: r & 512 && Ol(n, n.return);
			default: Lu(e, n);
		}
	}
	function yu(e, t) {
		for (e = e.child; e !== null;) bu(e, t), e = e.sibling;
	}
	function bu(e, t) {
		switch (e.tag) {
			case 5:
			case 26:
				try {
					var n = e.stateNode;
					if (t) {
						var r = n.style;
						typeof r.setProperty == "function" ? r.setProperty("display", "none", "important") : r.display = "none";
					} else {
						var i = e.stateNode, a = e.memoizedProps.style, o = a != null && a.hasOwnProperty("display") ? a.display : null;
						i.style.display = o == null || typeof o == "boolean" ? "" : ("" + o).trim();
					}
				} catch (t) {
					Z(e, e.return, t);
				}
				xu(e, t);
				break;
			case 6:
				try {
					e.stateNode.nodeValue = t ? "" : e.memoizedProps, j = !0;
				} catch (t) {
					Z(e, e.return, t);
				}
				break;
			case 18:
				try {
					var s = e.stateNode;
					t ? wp(s, !0) : wp(e.stateNode, !1);
				} catch (t) {
					Z(e, e.return, t);
				}
				break;
			case 22:
			case 23:
				e.memoizedState === null && yu(e, t);
				break;
			default: yu(e, t);
		}
	}
	function xu(e, t) {
		if (e.subtreeFlags & 67108864) for (e = e.child; e !== null;) {
			a: {
				var n = e, r = t;
				switch (n.tag) {
					case 4:
						bu(n, r);
						break a;
					case 22:
						n.memoizedState === null && xu(n, r);
						break a;
					default: xu(n, r);
				}
			}
			e = e.sibling;
		}
	}
	function Su(e) {
		var t = e.alternate;
		t !== null && (e.alternate = null, Su(t)), e.child = null, e.deletions = null, e.sibling = null, e.tag === 5 && (t = e.stateNode, t !== null && zt(t)), e.stateNode = null, e.return = null, e.dependencies = null, e.memoizedProps = null, e.memoizedState = null, e.pendingProps = null, e.stateNode = null, e.updateQueue = null;
	}
	var U = null, Cu = !1;
	function wu(e, t, n) {
		for (n = n.child; n !== null;) Tu(e, t, n), n = n.sibling;
	}
	function Tu(e, t, n) {
		if (it && typeof it.onCommitFiberUnmount == "function") try {
			it.onCommitFiberUnmount(rt, n);
		} catch {}
		switch (n.tag) {
			case 26:
				H || kl(n, t), wu(e, t, n), n.memoizedState ? n.memoizedState.count-- : n.stateNode && !H && (n = n.stateNode, n.parentNode.removeChild(n));
				break;
			case 27:
				H || kl(n, t), Ml(n);
				var r = U, i = Cu;
				Sp(n.type) && (U = n.stateNode, Cu = !1), wu(e, t, n), gm(n.stateNode, n.type, n.memoizedProps), U = r, Cu = i;
				break;
			case 5: H || kl(n, t), Ml(n);
			case 6:
				if (n.tag === 6 && Ml(n), r = U, i = Cu, U = null, wu(e, t, n), U = r, Cu = i, U !== null) {
					if (Cu) try {
						(U.nodeType === 9 ? U.body : U.nodeName === "HTML" ? U.ownerDocument.body : U).removeChild(n.stateNode), j = !0;
					} catch (e) {
						Z(n, t, e);
					}
					else try {
						U.removeChild(n.stateNode), j = !0;
					} catch (e) {
						Z(n, t, e);
					}
				}
				break;
			case 18:
				U !== null && (Cu ? (e = U, Cp(e.nodeType === 9 ? e.body : e.nodeName === "HTML" ? e.ownerDocument.body : e, n.stateNode), Hh(e)) : Cp(U, n.stateNode));
				break;
			case 4:
				r = U, i = Cu, U = n.stateNode.containerInfo, Cu = !0, wu(e, t, n), U = r, Cu = i;
				break;
			case 0:
			case 11:
			case 14:
			case 15:
				Tl(2, n, t), H || Tl(4, n, t), wu(e, t, n);
				break;
			case 1:
				H || (kl(n, t), r = n.stateNode, typeof r.componentWillUnmount == "function" && Dl(n, t, r)), wu(e, t, n);
				break;
			case 21:
				wu(e, t, n);
				break;
			case 22:
				H = (r = H) || n.memoizedState !== null, wu(e, t, n), H = r;
				break;
			case 30:
				kl(n, t), wu(e, t, n);
				break;
			case 7:
				H || kl(n, t), wu(e, t, n);
				break;
			default: wu(e, t, n);
		}
	}
	function Eu(e, t) {
		if (t.memoizedState === null && (e = t.alternate, e !== null && (e = e.memoizedState, e !== null))) {
			e = e.dehydrated;
			try {
				Hh(e);
			} catch (e) {
				Z(t, t.return, e);
			}
		}
	}
	function Du(e, t) {
		if (t.memoizedState === null && (e = t.alternate, e !== null && (e = e.memoizedState, e !== null && (e = e.dehydrated, e !== null)))) try {
			Hh(e);
		} catch (e) {
			Z(t, t.return, e);
		}
	}
	function Ou(e) {
		switch (e.tag) {
			case 31:
			case 13:
			case 19:
				var t = e.stateNode;
				return t === null && (t = e.stateNode = new uu()), t;
			case 22: return e = e.stateNode, t = e._retryCache, t === null && (t = e._retryCache = new uu()), t;
			default: throw Error(i(435, e.tag));
		}
	}
	function ku(e, t) {
		var n = Ou(e);
		t.forEach(function(t) {
			if (!n.has(t)) {
				n.add(t);
				var r = vf.bind(null, e, t);
				t.then(r, r);
			}
		});
	}
	function Au(e, t, n) {
		var r = t.deletions;
		if (r !== null) for (var a = 0; a < r.length; a++) {
			var o = r[a], s = e, c = t, l = c;
			a: for (; l !== null;) {
				switch (l.tag) {
					case 27:
						if (Sp(l.type)) {
							U = l.stateNode, Cu = !1;
							break a;
						}
						break;
					case 5:
						U = l.stateNode, Cu = !1;
						break a;
					case 3:
					case 4:
						U = l.stateNode.containerInfo, Cu = !0;
						break a;
				}
				l = l.return;
			}
			if (U === null) throw Error(i(160));
			Tu(s, c, o), U = null, Cu = !1, s = o.alternate, s !== null && (s.return = null), o.return = null;
		}
		if (t.subtreeFlags & 13886) for (t = t.child; t !== null;) Mu(t, e, n), t = t.sibling;
	}
	var ju = null;
	function Mu(e, t, n) {
		var r = e.alternate, a = e.flags;
		switch (e.tag) {
			case 0:
			case 11:
			case 14:
			case 15:
				if (a & 4 && (r = e.updateQueue, r = r === null ? null : r.events, r !== null)) for (var o = 0; o < r.length; o++) {
					var s = r[o];
					s.ref.impl = s.nextImpl;
				}
				Au(t, e, n), Nu(e), a & 4 && (Tl(3, e, e.return), wl(3, e), Tl(5, e, e.return));
				break;
			case 1:
				Au(t, e, n), Nu(e), a & 512 && (H || r === null || kl(r, r.return)), a & 64 && su && (e = e.updateQueue, e !== null && (t = e.callbacks, t !== null && (n = e.shared.hiddenCallbacks, e.shared.hiddenCallbacks = n === null ? t : n.concat(t))));
				break;
			case 26:
				if (o = ju, Au(t, e, n), Nu(e), a & 512 && (H || r === null || kl(r, r.return)), a & 4) {
					if (a = r === null ? null : r.memoizedState, n = e.memoizedState, r === null) {
						if (n === null) {
							if (e.stateNode === null) {
								if (su) e.stateNode = fp(e.type, e.memoizedProps, t.containerInfo, e);
								else {
									a: {
										t = e.type, n = e.memoizedProps, a = o.ownerDocument || o;
										b: switch (t) {
											case "title":
												r = a.getElementsByTagName("title")[0], (!r || r[Lt] || r[At] || r.namespaceURI === "http://www.w3.org/2000/svg" || r.hasAttribute("itemprop")) && (r = a.createElement(t), a.head.insertBefore(r, a.querySelector("head > title"))), np(r, t, n), r[At] = e, Wt(r), t = r;
												break a;
											case "link":
												if (o = Gm("link", "href", a).get(t + (n.href || ""))) {
													for (s = 0; s < o.length; s++) if (r = o[s], r.getAttribute("href") === (n.href == null || n.href === "" ? null : n.href) && r.getAttribute("rel") === (n.rel == null ? null : n.rel) && r.getAttribute("title") === (n.title == null ? null : n.title) && r.getAttribute("crossorigin") === (n.crossOrigin == null ? null : n.crossOrigin)) {
														o.splice(s, 1);
														break b;
													}
												}
												r = a.createElement(t), np(r, t, n), a.head.appendChild(r);
												break;
											case "meta":
												if (o = Gm("meta", "content", a).get(t + (n.content || ""))) {
													for (s = 0; s < o.length; s++) if (r = o[s], r.getAttribute("content") === (n.content == null ? null : "" + n.content) && r.getAttribute("name") === (n.name == null ? null : n.name) && r.getAttribute("property") === (n.property == null ? null : n.property) && r.getAttribute("http-equiv") === (n.httpEquiv == null ? null : n.httpEquiv) && r.getAttribute("charset") === (n.charSet == null ? null : n.charSet)) {
														o.splice(s, 1);
														break b;
													}
												}
												r = a.createElement(t), np(r, t, n), a.head.appendChild(r);
												break;
											default: throw Error(i(468, t));
										}
										r[At] = e, Wt(r), t = r;
									}
									e.stateNode = t;
								}
							} else su || Km(o, e.type, e.stateNode);
						} else e.stateNode = Bm(o, n, e.memoizedProps);
					} else a === n ? n === null && e.stateNode !== null && Il(e, e.memoizedProps, r.memoizedProps) : (a === null ? (t = r.stateNode, t === null || H || t.parentNode.removeChild(t)) : a.count--, n === null ? su || Km(o, e.type, e.stateNode) : Bm(o, n, e.memoizedProps));
				}
				break;
			case 27:
				Au(t, e, n), Nu(e), a & 512 && (H || r === null || kl(r, r.return)), r !== null && a & 4 && Il(e, e.memoizedProps, r.memoizedProps);
				break;
			case 5:
				if (o = cu, cu = !1, Au(t, e, n), cu = o, Nu(e), a & 512 && (H || r === null || kl(r, r.return)), e.flags & 32) {
					t = e.stateNode;
					try {
						vn(t, ""), j = !0;
					} catch (t) {
						Z(e, e.return, t);
					}
				}
				a & 4 && e.stateNode != null && (t = e.memoizedProps, Il(e, t, r === null ? t : r.memoizedProps)), a & 1024 && (lu = !0);
				break;
			case 6:
				if (Au(t, e, n), Nu(e), a & 4) {
					if (e.stateNode === null) throw Error(i(162));
					t = e.memoizedProps, n = e.stateNode;
					try {
						n.nodeValue = t, j = !0;
					} catch (t) {
						Z(e, e.return, t);
					}
				}
				break;
			case 3:
				if (j = !1, Wm = null, o = ju, ju = bm(t.containerInfo), Au(t, e, n), ju = o, Nu(e), a & 4 && r !== null && r.memoizedState.isDehydrated) try {
					Hh(t.containerInfo);
				} catch (t) {
					Z(e, e.return, t);
				}
				lu && (lu = !1, Pu(e)), j = !1;
				break;
			case 4:
				a = cu, cu = su, r = en(), o = ju, ju = bm(e.stateNode.containerInfo), Au(t, e, n), Nu(e), ju = o, j && pu && (mu = !0), j = r, cu = a;
				break;
			case 12:
				Au(t, e, n), Nu(e);
				break;
			case 31:
				Au(t, e, n), Nu(e), a & 4 && (t = e.updateQueue, t !== null && (e.updateQueue = null, ku(e, t)));
				break;
			case 13:
				Au(t, e, n), Nu(e), e.child.flags & 8192 && e.memoizedState !== null != (r !== null && r.memoizedState !== null) && (hd = A()), a & 4 && (t = e.updateQueue, t !== null && (e.updateQueue = null, ku(e, t)));
				break;
			case 22:
				o = e.memoizedState !== null, s = r !== null && r.memoizedState !== null;
				var c = su, l = H, u = cu;
				su = c || o, cu = u || o, H = l || s, Au(t, e, n), H = l, cu = u, su = c, Nu(e), a & 8192 && (t = e.stateNode, t._visibility = o ? t._visibility & -2 : t._visibility | 1, !o || r === null || s || su || H || (t = s || H, n = su, r = H, su = o || su, H = t, Ru(e, 2), su = n, H = r), !o && cu || yu(e, o)), a & 4 && (t = e.updateQueue, t !== null && (n = t.retryQueue, n !== null && (t.retryQueue = null, ku(e, n))));
				break;
			case 19:
				Au(t, e, n), Nu(e), a & 4 && (t = e.updateQueue, t !== null && (e.updateQueue = null, ku(e, t)));
				break;
			case 30:
				a & 512 && (H || r === null || kl(r, r.return)), a = en(), o = pu, s = (n & 335544064) === n, c = e.memoizedProps, pu = s && Di(c.default, c.update) !== "none", Au(t, e, n), Nu(e), s && r !== null && j && (e.flags |= 4), pu = o, j = a;
				break;
			case 21: break;
			case 7: a & 512 && (H || r === null || kl(r, r.return)), r && r.stateNode !== null && (r.stateNode._fragmentFiber = e);
			default: Au(t, e, n), Nu(e);
		}
	}
	function Nu(e) {
		var t = e.flags;
		if (t & 2) {
			try {
				for (var n, r = e.return; r !== null;) {
					if (Ll(r)) {
						n = r;
						break;
					}
					r = r.return;
				}
				r = null;
				for (var a = e.return; a !== null;) {
					if (Pl(a)) {
						var o = a.stateNode;
						r === null ? r = [o] : r.push(o);
					}
					if (Nl(a)) break;
					a = a.return;
				}
				var s = r;
				if (n == null) throw Error(i(160));
				switch (n.tag) {
					case 27:
						var c = n.stateNode;
						Bl(e, Rl(e), c, s);
						break;
					case 5:
						var l = n.stateNode;
						n.flags & 32 && (vn(l, ""), n.flags &= -33), Bl(e, Rl(e), l, s);
						break;
					case 3:
					case 4:
						var u = n.stateNode.containerInfo;
						zl(e, Rl(e), u, s);
						break;
					default: throw Error(i(161));
				}
			} catch (t) {
				Z(e, e.return, t);
			}
			e.flags &= -3;
		}
		t & 4096 && (e.flags &= -4097);
	}
	function Pu(e) {
		if (e.subtreeFlags & 1024) for (e = e.child; e !== null;) {
			var t = e;
			Pu(t), t.tag === 5 && t.flags & 1024 && (t = t.stateNode, gh = !0, t.reset(), gh = !1), e = e.sibling;
		}
	}
	function Fu(e, t) {
		if (t.subtreeFlags & 9270) for (t = t.child; t !== null;) Iu(t, e), t = t.sibling;
		else ou(t, !1);
	}
	function Iu(e, t) {
		var n = e.alternate;
		if (n === null) Ql(e, !1);
		else switch (e.tag) {
			case 3:
				if (hu = fu = !1, Kl(), Fu(t, e), !fu && !mu) {
					if (e = Gl, e !== null) for (var r = 0; r < e.length; r += 3) {
						n = e[r];
						var i = e[r + 1];
						Ep(n, e[r + 2]), n = n.ownerDocument.documentElement, n !== null && n.animate({
							opacity: [0, 0],
							pointerEvents: ["none", "none"]
						}, {
							duration: 0,
							fill: "forwards",
							pseudoElement: "::view-transition-group(" + i + ")"
						});
					}
					e = t.containerInfo, e = e.nodeType === 9 ? e.documentElement : e.ownerDocument.documentElement, e !== null && e.style.viewTransitionName === "" && (e.style.viewTransitionName = "none", e.animate({
						opacity: [0, 0],
						pointerEvents: ["none", "none"]
					}, {
						duration: 0,
						fill: "forwards",
						pseudoElement: "::view-transition-group(root)"
					}), e.animate({
						width: [0, 0],
						height: [0, 0]
					}, {
						duration: 0,
						fill: "forwards",
						pseudoElement: "::view-transition"
					})), hu = !0;
				}
				Gl = null;
				break;
			case 5:
				Fu(t, e);
				break;
			case 4:
				r = fu, fu = !1, Fu(t, e), fu && (mu = !0), fu = r;
				break;
			case 22:
				e.memoizedState === null && (n.memoizedState === null ? Fu(t, e) : Ql(e, !1));
				break;
			case 30:
				r = fu, i = Kl(), fu = !1, Fu(t, e), fu && (e.flags |= 4);
				var a = e.memoizedProps, o = e.stateNode;
				t = Ti(a, o), o = Ti(n.memoizedProps, o);
				var s = Di(a.default, a.update);
				s === "none" ? t = !1 : (a = n.memoizedState, n.memoizedState = null, n = e.child, ql = 0, t = au(e, n, t, o, s, a, !0), ql !== (a === null ? 0 : a.length) && (e.flags |= 32)), e.flags & 4 && t ? (Nd(e, e.memoizedProps.onUpdate), Gl = i) : i !== null && (i.push.apply(i, Gl), Gl = i), fu = e.flags & 32 ? !0 : r;
				break;
			default: Fu(t, e);
		}
	}
	function Lu(e, t) {
		if (t.subtreeFlags & 8772) for (t = t.child; t !== null;) vu(e, t.alternate, t), t = t.sibling;
	}
	function Ru(e, t) {
		for (e = e.child; e !== null;) {
			var n = e, r = t;
			switch (n.tag) {
				case 0:
				case 11:
				case 14:
				case 15:
					Tl(4, n, n.return), Ru(n, r);
					break;
				case 1:
					kl(n, n.return);
					var i = n.stateNode;
					typeof i.componentWillUnmount == "function" && Dl(n, n.return, i), Ru(n, r);
					break;
				case 27: r & 2 && gm(n.stateNode, n.type, n.memoizedProps);
				case 5:
					kl(n, n.return), n.tag !== 5 && n.tag !== 27 || Ml(n), Ru(n, r);
					break;
				case 6:
					Ml(n);
					break;
				case 26:
					kl(n, n.return), i = n.stateNode, n.memoizedState !== null || i === null || H || i.parentNode.removeChild(i), Ru(n, r);
					break;
				case 22:
					n.memoizedState === null && Ru(n, r);
					break;
				case 30:
					kl(n, n.return), Ru(n, r);
					break;
				case 7: kl(n, n.return);
				default: Ru(n, r);
			}
			e = e.sibling;
		}
	}
	function zu(e, t, n) {
		for (n = t.subtreeFlags & 8772 ? n : n & -2, t = t.child; t !== null;) {
			var r = t.alternate, i = e, a = t, o = a.flags, s = !!(n & 1);
			switch (a.tag) {
				case 0:
				case 11:
				case 15:
					zu(i, a, n), wl(4, a);
					break;
				case 1:
					if (zu(i, a, n), r = a, i = r.stateNode, typeof i.componentDidMount == "function") try {
						i.componentDidMount();
					} catch (e) {
						Z(r, r.return, e);
					}
					if (r = a, i = r.updateQueue, i !== null) {
						var c = r.stateNode;
						try {
							var l = i.shared.hiddenCallbacks;
							if (l !== null) for (i.shared.hiddenCallbacks = null, i = 0; i < l.length; i++) Ao(l[i], c);
						} catch (e) {
							Z(r, r.return, e);
						}
					}
					s && o & 64 && El(a), Ol(a, a.return);
					break;
				case 27: n & 2 && Vl(a);
				case 5:
					a.tag !== 5 && a.tag !== 27 || jl(a), zu(i, a, n), s && r === null && o & 4 && Fl(a), Ol(a, a.return);
					break;
				case 6:
					jl(a);
					break;
				case 26:
					c = a.stateNode, a.memoizedState !== null || c === null || su || Km(bm(c.ownerDocument), a.type, c), zu(i, a, n), s && r === null && o & 4 && Fl(a), Ol(a, a.return);
					break;
				case 12:
					zu(i, a, n);
					break;
				case 31:
					zu(i, a, n), s && o & 4 && Eu(i, a);
					break;
				case 13:
					zu(i, a, n), s && o & 4 && Du(i, a);
					break;
				case 22:
					a.memoizedState === null && zu(i, a, n), Ol(a, a.return);
					break;
				case 30:
					zu(i, a, n), Ol(a, a.return);
					break;
				case 7: Ol(a, a.return);
				default: zu(i, a, n);
			}
			t = t.sibling;
		}
	}
	function Bu(e, t) {
		var n = null;
		e !== null && e.memoizedState !== null && e.memoizedState.cachePool !== null && (n = e.memoizedState.cachePool.pool), e = null, t.memoizedState !== null && t.memoizedState.cachePool !== null && (e = t.memoizedState.cachePool.pool), e !== n && (e != null && e.refCount++, n != null && za(n));
	}
	function Vu(e, t) {
		e = null, t.alternate !== null && (e = t.alternate.memoizedState.cache), t = t.memoizedState.cache, t !== e && (t.refCount++, e != null && za(e));
	}
	function Hu(e, t, n, r) {
		var i = (n & 335544064) === n;
		if (t.subtreeFlags & (i ? 10262 : 10256)) for (t = t.child; t !== null;) Uu(e, t, n, r), t = t.sibling;
		else i && iu(t);
	}
	function Uu(e, t, n, r) {
		var i = (n & 335544064) === n;
		i && t.alternate === null && t.return !== null && t.return.alternate !== null && ru(t);
		var a = t.flags;
		switch (t.tag) {
			case 0:
			case 11:
			case 15:
				Hu(e, t, n, r), a & 2048 && wl(9, t);
				break;
			case 1:
				Hu(e, t, n, r);
				break;
			case 3:
				Hu(e, t, n, r), i && hu && (e = e.containerInfo, e = e.nodeType === 9 ? e.body : e.nodeName === "HTML" ? e.ownerDocument.body : e, e.style.viewTransitionName === "root" && (e.style.viewTransitionName = ""), e = e.ownerDocument.documentElement, e !== null && e.style.viewTransitionName === "none" && (e.style.viewTransitionName = "")), a & 2048 && (a = null, t.alternate !== null && (a = t.alternate.memoizedState.cache), t = t.memoizedState.cache, t !== a && (t.refCount++, a != null && za(a)));
				break;
			case 12:
				if (a & 2048) {
					Hu(e, t, n, r), a = t.stateNode;
					try {
						var o = t.memoizedProps, s = o.id, c = o.onPostCommit;
						typeof c == "function" && c(s, t.alternate === null ? "mount" : "update", a.passiveEffectDuration, -0);
					} catch (e) {
						Z(t, t.return, e);
					}
				} else Hu(e, t, n, r);
				break;
			case 31:
				Hu(e, t, n, r);
				break;
			case 13:
				Hu(e, t, n, r);
				break;
			case 23: break;
			case 22:
				o = t.stateNode, s = t.alternate, t.memoizedState === null ? (i && s !== null && s.memoizedState !== null && ru(t), o._visibility & 2 ? Hu(e, t, n, r) : (o._visibility |= 2, Wu(e, t, n, r, !!(t.subtreeFlags & 10256) || !1))) : (i && s !== null && s.memoizedState === null && ru(s), o._visibility & 2 ? Hu(e, t, n, r) : Gu(e, t)), a & 2048 && Bu(s, t);
				break;
			case 24:
				Hu(e, t, n, r), a & 2048 && Vu(t.alternate, t);
				break;
			case 30:
				i && (a = t.alternate, a !== null && (Xl(a.child, !0), Xl(t.child, !0))), Hu(e, t, n, r);
				break;
			default: Hu(e, t, n, r);
		}
	}
	function Wu(e, t, n, r, i) {
		for (i &&= !!(t.subtreeFlags & 10256) || !1, t = t.child; t !== null;) {
			var a = e, o = t, s = n, c = r, l = o.flags;
			switch (o.tag) {
				case 0:
				case 11:
				case 15:
					Wu(a, o, s, c, i), wl(8, o);
					break;
				case 23: break;
				case 22:
					var u = o.stateNode;
					o.memoizedState === null ? (u._visibility |= 2, Wu(a, o, s, c, i)) : u._visibility & 2 ? Wu(a, o, s, c, i) : Gu(a, o), i && l & 2048 && Bu(o.alternate, o);
					break;
				case 24:
					Wu(a, o, s, c, i), i && l & 2048 && Vu(o.alternate, o);
					break;
				default: Wu(a, o, s, c, i);
			}
			t = t.sibling;
		}
	}
	function Gu(e, t) {
		if (t.subtreeFlags & 10256) for (t = t.child; t !== null;) {
			var n = e, r = t, i = r.flags;
			switch (r.tag) {
				case 22:
					Gu(n, r), i & 2048 && Bu(r.alternate, r);
					break;
				case 24:
					Gu(n, r), i & 2048 && Vu(r.alternate, r);
					break;
				default: Gu(n, r);
			}
			t = t.sibling;
		}
	}
	var Ku = 8192;
	function qu(e, t, n) {
		if (e.subtreeFlags & Ku) for (e = e.child; e !== null;) Ju(e, t, n), e = e.sibling;
	}
	function Ju(e, t, n) {
		switch (e.tag) {
			case 26:
				qu(e, t, n), e.flags & Ku && (e.memoizedState === null ? (e = e.stateNode, (t & 335544128) === t && Zm(n, e)) : Qm(n, ju, e.memoizedState, e.memoizedProps));
				break;
			case 5:
				qu(e, t, n), e.flags & Ku && (e = e.stateNode, (t & 335544128) === t && Zm(n, e));
				break;
			case 3:
			case 4:
				var r = ju;
				ju = bm(e.stateNode.containerInfo), qu(e, t, n), ju = r;
				break;
			case 22:
				e.memoizedState === null && (r = e.alternate, r !== null && r.memoizedState !== null ? (r = Ku, Ku = 16777216, qu(e, t, n), Ku = r) : qu(e, t, n));
				break;
			case 30:
				if ((e.flags & Ku) !== 0 && (r = e.memoizedProps.name, r != null && r !== "auto")) {
					var i = e.stateNode;
					i.paired = null, Ul === null && (Ul = /* @__PURE__ */ new Map()), Ul.set(r, i);
				}
				qu(e, t, n);
				break;
			default: qu(e, t, n);
		}
	}
	function Yu(e) {
		var t = e.alternate;
		if (t !== null && (e = t.child, e !== null)) {
			t.child = null;
			do
				t = e.sibling, e.sibling = null, e = t;
			while (e !== null);
		}
	}
	function Xu(e) {
		var t = e.deletions;
		if (e.flags & 16) {
			if (t !== null) for (var n = 0; n < t.length; n++) {
				var r = t[n];
				du = r, $u(r, e);
			}
			Yu(e);
		}
		if (e.subtreeFlags & 10256) for (e = e.child; e !== null;) Zu(e), e = e.sibling;
	}
	function Zu(e) {
		switch (e.tag) {
			case 0:
			case 11:
			case 15:
				Xu(e), e.flags & 2048 && Tl(9, e, e.return);
				break;
			case 3:
				Xu(e);
				break;
			case 12:
				Xu(e);
				break;
			case 22:
				var t = e.stateNode;
				e.memoizedState !== null && t._visibility & 2 && (e.return === null || e.return.tag !== 13) ? (t._visibility &= -3, Qu(e)) : Xu(e);
				break;
			default: Xu(e);
		}
	}
	function Qu(e) {
		var t = e.deletions;
		if (e.flags & 16) {
			if (t !== null) for (var n = 0; n < t.length; n++) {
				var r = t[n];
				du = r, $u(r, e);
			}
			Yu(e);
		}
		for (e = e.child; e !== null;) {
			switch (t = e, t.tag) {
				case 0:
				case 11:
				case 15:
					Tl(8, t, t.return), Qu(t);
					break;
				case 22:
					n = t.stateNode, n._visibility & 2 && (n._visibility &= -3, Qu(t));
					break;
				default: Qu(t);
			}
			e = e.sibling;
		}
	}
	function $u(e, t) {
		for (; du !== null;) {
			var n = du;
			switch (n.tag) {
				case 0:
				case 11:
				case 15:
					Tl(8, n, t);
					break;
				case 23:
				case 22:
					if (n.memoizedState !== null && n.memoizedState.cachePool !== null) {
						var r = n.memoizedState.cachePool.pool;
						r != null && r.refCount++;
					}
					break;
				case 24: za(n.memoizedState.cache);
			}
			if (r = n.child, r !== null) r.return = n, du = r;
			else a: for (n = e; du !== null;) {
				r = du;
				var i = r.sibling, a = r.return;
				if (Su(r), r === n) {
					du = null;
					break a;
				}
				if (i !== null) {
					i.return = a, du = i;
					break a;
				}
				du = a;
			}
		}
	}
	var ed = {
		getCacheForType: function(e) {
			var t = Ma(P), n = t.data.get(e);
			return n === void 0 && (n = e(), t.data.set(e, n)), n;
		},
		cacheSignal: function() {
			return Ma(P).controller.signal;
		}
	}, td = typeof WeakMap == "function" ? WeakMap : Map, W = 0, G = null, K = null, q = 0, J = 0, nd = null, rd = !1, id = !1, ad = !1, od = 0, Y = 0, sd = 0, cd = 0, ld = 0, ud = 0, dd = 0, fd = null, pd = null, md = !1, hd = 0, gd = 0, _d = Infinity, vd = null, yd = null, X = 0, bd = null, xd = null, Sd = 0, Cd = 0, wd = null, Td = null, Ed = null, Dd = null, Od = null, kd = 0, Ad = null;
	function jd() {
		return W & 2 && q !== 0 ? q & -q : E.T === null ? Dt() : Pf();
	}
	function Md() {
		if (ud === 0) {
			if (!(q & 536870912) || N) {
				var e = dt;
				dt <<= 1, !(dt & 3932160) && (dt = 262144), ud = e;
			} else ud = 536870912;
		}
		return e = Lo.current, e !== null && (e.flags |= 32), ud;
	}
	function Nd(e, t) {
		if (t != null) {
			var n = e.stateNode, r = n.ref;
			r === null && (r = n.ref = Pp(Ti(e.memoizedProps, n))), Dd === null && (Dd = []), Dd.push(t.bind(null, r));
		}
	}
	function Pd(e, t, n) {
		(e === G && (J === 2 || J === 9) || e.cancelPendingCommit !== null) && (Vd(e, 0), Rd(e, q, ud, !1)), bt(e, n), (!(W & 2) || e !== G) && (e === G && (!(W & 2) && (cd |= n), Y === 4 && Rd(e, q, ud, !1)), Ef(e));
	}
	function Fd(e, t, n) {
		if (W & 6) throw Error(i(327));
		var r = !n && !(t & 127) && (t & e.expiredLanes) === 0 || ht(e, t), a = r ? Yd(e, t) : qd(e, t, !0), o = r;
		do {
			if (a === 0) {
				id && !r && Rd(e, t, 0, !1);
				break;
			}
			if (n = e.current.alternate, o && !Ld(n)) {
				a = qd(e, t, !1), o = !1;
				continue;
			}
			if (a === 2) {
				if (o = t, e.errorRecoveryDisabledLanes & o) var s = 0;
				else s = e.pendingLanes & -536870913, s = s === 0 ? s & 536870912 ? 536870912 : 0 : s;
				if (s !== 0) {
					t = s;
					a: {
						var c = e;
						a = fd;
						var l = c.current.memoizedState.isDehydrated;
						if (l && (Vd(c, s).flags |= 256), s = qd(c, s, !1), s !== 2 && s !== 6) {
							if (ad && !l) {
								c.errorRecoveryDisabledLanes |= o, cd |= o, a = 4;
								break a;
							}
							o = pd, pd = a, o !== null && (pd === null ? pd = o : pd.push.apply(pd, o));
						}
						a = s;
					}
					if (o = !1, a !== 2) continue;
				}
			}
			if (a === 1) {
				Vd(e, 0), Rd(e, t, 0, !0);
				break;
			}
			a: {
				switch (r = e, o = a, o) {
					case 0:
					case 1: throw Error(i(345));
					case 4: if ((t & 4194048) !== t && (t & 62914560) !== t) break;
					case 6:
						Rd(r, t, ud, !rd);
						break a;
					case 2:
						pd = null;
						break;
					case 3:
					case 5: break;
					default: throw Error(i(329));
				}
				if ((t & 62914560) === t && (a = hd + 300 - A(), 10 < a)) {
					if (Rd(r, t, ud, !rd), mt(r, 0, !0) !== 0) break a;
					Sd = t, r.timeoutHandle = gp(Id.bind(null, r, n, pd, vd, md, t, ud, cd, dd, rd, o, "Throttled", -0, 0), a);
					break a;
				}
				Id(r, n, pd, vd, md, t, ud, cd, dd, rd, o, null, -0, 0);
			}
			break;
		} while (1);
		Ef(e);
	}
	function Id(e, t, n, r, i, a, o, s, c, l, u, d, f, p) {
		e.timeoutHandle = -1;
		var m = t.subtreeFlags, h = (a & 335544064) === a;
		if (d = null, (h || m & 8192 || (m & 16785408) == 16785408) && (d = {
			stylesheets: null,
			count: 0,
			imgCount: 0,
			imgBytes: 0,
			suspenseyImages: [],
			waitingForImages: !0,
			waitingForViewTransition: !1,
			unsuspend: En
		}, Ul = null, Ju(t, a, d), h && (m = d, h = e.containerInfo, h = (h.nodeType === 9 ? h : h.ownerDocument).__reactViewTransition, h != null && (m.count++, m.waitingForViewTransition = !0, m = nh.bind(m), h.finished.then(m, m))), m = (a & 62914560) === a ? hd - A() : (a & 4194048) === a ? gd - A() : 0, m = eh(d, m), m !== null)) {
			Sd = a, e.cancelPendingCommit = m(nf.bind(null, e, t, a, n, r, i, o, s, c, l, u, d, null, f, p)), Rd(e, a, o, !l);
			return;
		}
		nf(e, t, a, n, r, i, o, s, c, l, u, d);
	}
	function Ld(e) {
		for (var t = e;;) {
			var n = t.tag;
			if ((n === 0 || n === 11 || n === 15) && t.flags & 16384 && (n = t.updateQueue, n !== null && (n = n.stores, n !== null))) for (var r = 0; r < n.length; r++) {
				var i = n[r], a = i.getSnapshot;
				i = i.value;
				try {
					if (!Yr(a(), i)) return !1;
				} catch {
					return !1;
				}
			}
			if (n = t.child, t.subtreeFlags & 16384 && n !== null) n.return = t, t = n;
			else {
				if (t === e) break;
				for (; t.sibling === null;) {
					if (t.return === null || t.return === e) return !0;
					t = t.return;
				}
				t.sibling.return = t.return, t = t.sibling;
			}
		}
		return !0;
	}
	function Rd(e, t, n, r) {
		t = gt(e, t), t &= ~ld, t &= ~cd, e.suspendedLanes |= t, e.pingedLanes &= ~t, r && (e.warmLanes |= t), r = e.expirationTimes;
		for (var i = t; 0 < i;) {
			var a = 31 - ot(i), o = 1 << a;
			r[a] = -1, i &= ~o;
		}
		n !== 0 && St(e, n, t);
	}
	function zd() {
		return W & 6 ? !0 : (Df(0, !1), !1);
	}
	function Bd() {
		if (K !== null) {
			if (J === 0) var e = K.return;
			else e = K, wa = Ca = null, ls(e), fo = null, po = 0, e = K;
			for (; e !== null;) Cl(e.alternate, e), e = e.return;
			K = null;
		}
	}
	function Vd(e, t) {
		var n = e.timeoutHandle;
		return n !== -1 && (e.timeoutHandle = -1, _p(n)), n = e.cancelPendingCommit, n !== null && (e.cancelPendingCommit = null, n()), Sd = 0, Bd(), G = e, K = n = Hi(e.current, null), q = t, J = 0, nd = null, rd = !1, id = ht(e, t), ad = !1, dd = ud = ld = cd = sd = Y = 0, pd = fd = null, md = !1, od = gt(e, t), Mi(), n;
	}
	function Hd(e, t) {
		F = null, E.H = vc, t === to || t === ro ? (t = lo(), J = 3) : t === no ? (t = lo(), J = 4) : J = t === Ic ? 8 : typeof t == "object" && t && typeof t.then == "function" ? 6 : 1, nd = t, K === null && (Y = 1, Ac(e, Xi(t, e.current)));
	}
	function Ud() {
		var e = Lo.current;
		return e === null ? !0 : (q & 4194048) === q ? Ro === null : (q & 62914560) === q || q & 536870912 ? e === Ro : !1;
	}
	function Wd() {
		var e = E.H;
		return E.H = vc, e === null ? vc : e;
	}
	function Gd() {
		var e = E.A;
		return E.A = ed, e;
	}
	function Kd() {
		Y = 4, rd || (q & 4194048) !== q && Lo.current !== null || (id = !0), !(sd & 134217727) && !(cd & 134217727) || G === null || Rd(G, q, ud, !1);
	}
	function qd(e, t, n) {
		var r = W;
		W |= 2;
		var i = Wd(), a = Gd();
		(G !== e || q !== t) && (vd = null, Vd(e, t)), t = !1;
		var o = Y;
		a: do
			try {
				if (J !== 0 && K !== null) {
					var s = K, c = nd;
					switch (J) {
						case 8:
							Bd(), o = 6;
							break a;
						case 3:
						case 2:
						case 9:
						case 6:
							Lo.current === null && (t = !0);
							var l = J;
							if (J = 0, nd = null, $d(e, s, c, l), n && id) {
								o = 0;
								break a;
							}
							break;
						default: l = J, J = 0, nd = null, $d(e, s, c, l);
					}
				}
				Jd(), o = Y;
				break;
			} catch (t) {
				Hd(e, t);
			}
		while (1);
		return t && e.shellSuspendCounter++, wa = Ca = null, W = r, E.H = i, E.A = a, K === null && (G = null, q = 0, Mi()), o;
	}
	function Jd() {
		for (; K !== null;) Zd(K);
	}
	function Yd(e, t) {
		var n = W;
		W |= 2;
		var r = Wd(), a = Gd();
		G !== e || q !== t ? (vd = null, _d = A() + 500, Vd(e, t)) : id = ht(e, t);
		a: do
			try {
				if (J !== 0 && K !== null) {
					t = K;
					var o = nd;
					b: switch (J) {
						case 1:
							J = 0, nd = null, $d(e, t, o, 1);
							break;
						case 2:
						case 9:
							if (ao(o)) {
								J = 0, nd = null, Qd(t);
								break;
							}
							t = function() {
								J !== 2 && J !== 9 || G !== e || (J = 7), Ef(e);
							}, o.then(t, t);
							break a;
						case 3:
							J = 7;
							break a;
						case 4:
							J = 5;
							break a;
						case 7:
							ao(o) ? (J = 0, nd = null, Qd(t)) : (J = 0, nd = null, $d(e, t, o, 7));
							break;
						case 5:
							var s = null;
							switch (K.tag) {
								case 26: s = K.memoizedState;
								case 5:
								case 27:
									var c = K;
									if (s ? Ym(s) : c.stateNode.complete) {
										J = 0, nd = null;
										var l = c.sibling;
										if (l !== null) K = l;
										else {
											var u = c.return;
											u === null ? K = null : (K = u, ef(u));
										}
										break b;
									}
							}
							J = 0, nd = null, $d(e, t, o, 5);
							break;
						case 6:
							J = 0, nd = null, $d(e, t, o, 6);
							break;
						case 8:
							Bd(), Y = 6;
							break a;
						default: throw Error(i(462));
					}
				}
				Xd();
				break;
			} catch (t) {
				Hd(e, t);
			}
		while (1);
		return wa = Ca = null, E.H = r, E.A = a, W = n, K === null ? (G = null, q = 0, Mi(), Y) : 0;
	}
	function Xd() {
		for (; K !== null && !qe();) Zd(K);
	}
	function Zd(e) {
		var t = hl(e.alternate, e, od);
		e.memoizedProps = e.pendingProps, t === null ? ef(e) : K = t;
	}
	function Qd(e) {
		var t = e, n = t.alternate;
		switch (t.tag) {
			case 15:
			case 0:
				t = Yc(n, t, t.pendingProps, t.type, void 0, q);
				break;
			case 11:
				t = Yc(n, t, t.pendingProps, t.type.render, t.ref, q);
				break;
			case 5:
				ls(t);
				var r = t;
				r === da && (N ? (_a(r), r.tag === 5 && r.stateNode != null && (M = r.stateNode)) : (_a(r), N = !0));
			default: Cl(n, t), t = K = Ui(t, od), t = hl(n, t, od);
		}
		e.memoizedProps = e.pendingProps, t === null ? ef(e) : K = t;
	}
	function $d(e, t, n, r) {
		wa = Ca = null, ls(t), fo = null, po = 0;
		var i = t.return;
		try {
			if (Fc(e, i, t, n, q)) {
				Y = 1, Ac(e, Xi(n, e.current)), K = null;
				return;
			}
		} catch (t) {
			if (i !== null) throw K = i, t;
			Y = 1, Ac(e, Xi(n, e.current)), K = null;
			return;
		}
		t.flags & 32768 ? (N || r === 1 ? e = !0 : id || q & 536870912 ? e = !1 : (rd = e = !0, (r === 2 || r === 9 || r === 3 || r === 6) && (r = Lo.current, r !== null && r.tag === 13 && (r.flags |= 16384))), tf(t, e)) : ef(t);
	}
	function ef(e) {
		var t = e;
		do {
			if (t.flags & 32768) {
				tf(t, rd);
				return;
			}
			e = t.return;
			var n = xl(t.alternate, t, od);
			if (n !== null) {
				K = n;
				return;
			}
			if (t = t.sibling, t !== null) {
				K = t;
				return;
			}
			K = t = e;
		} while (t !== null);
		Y === 0 && (Y = 5);
	}
	function tf(e, t) {
		do {
			var n = Sl(e.alternate, e);
			if (n !== null) {
				n.flags &= 32767, K = n;
				return;
			}
			if (n = e.return, n !== null && (n.flags |= 32768, n.subtreeFlags = 0, n.deletions = null), !t && (e = e.sibling, e !== null)) {
				K = e;
				return;
			}
			K = e = n;
		} while (e !== null);
		Y = 6, K = null;
	}
	function nf(e, t, n, r, a, o, s, c, l, u, d, f) {
		e.cancelPendingCommit = null;
		do
			df();
		while (X !== 0);
		if (W & 6) throw Error(i(327));
		if (t !== null) {
			if (t === e.current) throw Error(i(177));
			e === G && (K = G = null, q = 0), xd = t, bd = e, Sd = n, wd = a, Td = r, rf(e, t, n, s, c, l, f);
		}
	}
	function rf(e, t, n, r, i, a, o) {
		var s = t.lanes | t.childLanes;
		if (Cd = s, s |= ji, xt(e, n, s, r, i, a), Dd = null, (n & 335544064) === n ? (Od = Ha(e), r = 10262) : (Od = null, r = 10256), (t.subtreeFlags & r) !== 0 || (t.flags & r) !== 0 ? (e.callbackNode = null, e.callbackPriority = 0, yf(Qe, function() {
			return ff(), null;
		})) : (e.callbackNode = null, e.callbackPriority = 0), Hl = !1, r = !!(t.flags & 13878), t.subtreeFlags & 13878 || r) {
			r = E.T, E.T = null, i = D.p, D.p = 2, a = W, W |= 4;
			try {
				gu(e, t, n);
			} finally {
				W = a, D.p = i, E.T = r;
			}
		}
		X = 1, Hl ? Ed = Mp(o, e.containerInfo, Od, sf, cf, of, lf, ff, af, null, null) : (sf(), cf(), lf());
	}
	function af(e) {
		if (X !== 0) {
			var t = bd.onRecoverableError;
			t(e, { componentStack: null });
		}
	}
	function of() {
		X === 3 && (X = 0, Iu(xd, bd), X = 4);
	}
	function sf() {
		if (X === 1) {
			X = 0;
			var e = bd, t = xd, n = Sd, r = !!(t.flags & 13878);
			if (t.subtreeFlags & 13878 || r) {
				r = E.T, E.T = null;
				var i = D.p;
				D.p = 2;
				var a = W;
				W |= 4;
				try {
					pu = mu = !1, Mu(t, e, n), n = cp;
					var o = ti(e.containerInfo), s = n.focusedElem, c = n.selectionRange;
					if (o !== s && s && s.ownerDocument && ei(s.ownerDocument.documentElement, s)) {
						if (c !== null && ni(s)) {
							var l = c.start, u = c.end;
							if (u === void 0 && (u = l), "selectionStart" in s) s.selectionStart = l, s.selectionEnd = Math.min(u, s.value.length);
							else {
								var d = s.ownerDocument || document, f = d && d.defaultView || window;
								if (f.getSelection) {
									var p = f.getSelection(), m = s.textContent.length, h = Math.min(c.start, m), g = c.end === void 0 ? h : Math.min(c.end, m);
									!p.extend && h > g && (o = g, g = h, h = o);
									var _ = $r(s, h), v = $r(s, g);
									if (_ && v && (p.rangeCount !== 1 || p.anchorNode !== _.node || p.anchorOffset !== _.offset || p.focusNode !== v.node || p.focusOffset !== v.offset)) {
										var y = d.createRange();
										y.setStart(_.node, _.offset), p.removeAllRanges(), h > g ? (p.addRange(y), p.extend(v.node, v.offset)) : (y.setEnd(v.node, v.offset), p.addRange(y));
									}
								}
							}
						}
						for (d = [], p = s; p = p.parentNode;) p.nodeType === 1 && d.push({
							element: p,
							left: p.scrollLeft,
							top: p.scrollTop
						});
						for (typeof s.focus == "function" && s.focus(), s = 0; s < d.length; s++) {
							var b = d[s];
							b.element.scrollLeft = b.left, b.element.scrollTop = b.top;
						}
					}
					gh = !!sp, cp = sp = null;
				} finally {
					W = a, D.p = i, E.T = r;
				}
			}
			e.current = t, X = 2;
		}
	}
	function cf() {
		if (X === 2) {
			X = 0;
			var e = bd, t = xd, n = !!(t.flags & 8772);
			if (t.subtreeFlags & 8772 || n) {
				n = E.T, E.T = null;
				var r = D.p;
				D.p = 2;
				var i = W;
				W |= 4;
				try {
					vu(e, t.alternate, t);
				} finally {
					W = i, D.p = r, E.T = n;
				}
			}
			X = 3;
		}
	}
	function lf() {
		if (X === 4 || X === 3) {
			X = 0;
			var e = Ed;
			Ed = null, Je();
			var t = bd, n = xd, r = Sd, i = Td, a = (r & 335544064) === r ? 10262 : 10256;
			if ((n.subtreeFlags & a) !== 0 || (n.flags & a) !== 0 ? X = 5 : (X = 0, xd = bd = null, uf(t, t.pendingLanes)), a = t.pendingLanes, a === 0 && (yd = null), Et(r), n = n.stateNode, it && typeof it.onCommitFiberRoot == "function") try {
				it.onCommitFiberRoot(rt, n, void 0, (n.current.flags & 128) == 128);
			} catch {}
			if (i !== null) {
				n = E.T, a = D.p, D.p = 2, E.T = null;
				try {
					for (var o = t.onRecoverableError, s = 0; s < i.length; s++) {
						var c = i[s];
						o(c.value, { componentStack: c.stack });
					}
				} finally {
					E.T = n, D.p = a;
				}
			}
			if (i = Dd, o = Od, Od = null, i !== null && (Dd = null, o === null && (o = []), e !== null)) for (c = 0; c < i.length; c++) n = (0, i[c])(o), n !== void 0 && e.finished.finally(n);
			Sd & 3 && df(), Ef(t), a = t.pendingLanes, r & 261930 && a & 42 ? t === Ad ? kd++ : (kd = 0, Ad = t) : (kd = 0, Ad = null), Df(0, !1);
		}
	}
	function uf(e, t) {
		(e.pooledCacheLanes &= t) === 0 && (t = e.pooledCache, t != null && (e.pooledCache = null, za(t)));
	}
	function df() {
		return Ed !== null && (Ed.skipTransition(), Ed = null), sf(), cf(), lf(), ff();
	}
	function ff() {
		if (X !== 5) return !1;
		var e = bd, t = Cd;
		Cd = 0;
		var n = Et(Sd), r = E.T, a = D.p;
		try {
			D.p = 32 > n ? 32 : n, E.T = null, n = wd, wd = null;
			var o = bd, s = Sd;
			if (X = 0, xd = bd = null, Sd = 0, W & 6) throw Error(i(331));
			var c = W;
			if (W |= 4, Zu(o.current), Uu(o, o.current, s, n), W = c, Df(0, !1), it && typeof it.onPostCommitFiberRoot == "function") try {
				it.onPostCommitFiberRoot(rt, o);
			} catch {}
			return !0;
		} finally {
			D.p = a, E.T = r, uf(e, t);
		}
	}
	function pf(e, t, n) {
		t = Xi(n, t), t = Mc(e.stateNode, t, 2), e = wo(e, t, 2), e !== null && (bt(e, 2), Ef(e));
	}
	function Z(e, t, n) {
		if (e.tag === 3) pf(e, e, n);
		else for (; t !== null;) {
			if (t.tag === 3) {
				pf(t, e, n);
				break;
			}
			if (t.tag === 1) {
				var r = t.stateNode;
				if (typeof t.type.getDerivedStateFromError == "function" || typeof r.componentDidCatch == "function" && (yd === null || !yd.has(r))) {
					e = Xi(n, e), n = Nc(2), r = wo(t, n, 2), r !== null && (Pc(n, r, t, e), bt(r, 2), Ef(r));
					break;
				}
			}
			t = t.return;
		}
	}
	function mf(e, t, n) {
		var r = e.pingCache;
		if (r === null) {
			r = e.pingCache = new td();
			var i = /* @__PURE__ */ new Set();
			r.set(t, i);
		} else i = r.get(t), i === void 0 && (i = /* @__PURE__ */ new Set(), r.set(t, i));
		i.has(n) || (ad = !0, i.add(n), e = hf.bind(null, e, t, n), t.then(e, e));
	}
	function hf(e, t, n) {
		var r = e.pingCache;
		r !== null && r.delete(t), e.pingedLanes |= e.suspendedLanes & n, e.warmLanes &= ~n, G === e && (q & n) === n && (Y === 4 || Y === 3 && (q & 62914560) === q && 300 > A() - hd ? W & 2 ? ld |= n : Vd(e, 0) : ld |= n, dd === q && (dd = 0)), Ef(e);
	}
	function gf(e, t) {
		t === 0 && (t = vt()), e = Fi(e, t), e !== null && (bt(e, t), Ef(e));
	}
	function _f(e) {
		var t = e.memoizedState, n = 0;
		t !== null && (n = t.retryLane), gf(e, n);
	}
	function vf(e, t) {
		var n = 0;
		switch (e.tag) {
			case 31:
			case 13:
				var r = e.stateNode, a = e.memoizedState;
				a !== null && (n = a.retryLane);
				break;
			case 19:
				r = e.stateNode;
				break;
			case 22:
				r = e.stateNode._retryCache;
				break;
			default: throw Error(i(314));
		}
		r !== null && r.delete(t), gf(e, n);
	}
	function yf(e, t) {
		return Ge(e, t);
	}
	var bf = null, xf = null, Sf = !1, Cf = !1, wf = !1, Tf = 0;
	function Ef(e) {
		e !== xf && e.next === null && (xf === null ? bf = xf = e : xf = xf.next = e), Cf = !0, Sf || (Sf = !0, Nf());
	}
	function Df(e, t) {
		if (!wf && Cf) {
			wf = !0;
			do
				for (var n = !1, r = bf; r !== null;) {
					if (!t) {
						if (e !== 0) {
							var i = r.pendingLanes;
							if (i === 0) var a = 0;
							else {
								var o = r.suspendedLanes, s = r.pingedLanes;
								a = (1 << 31 - ot(42 | e) + 1) - 1, a &= i & ~(o & ~s), a = a & 201326741 ? a & 201326741 | 1 : a ? a | 2 : 0;
							}
							a !== 0 && (n = !0, Mf(r, a));
						} else a = q, a = mt(r, r === G ? a : 0, r.cancelPendingCommit !== null || r.timeoutHandle !== -1), !(a & 3) || ht(r, a) || (n = !0, Mf(r, a));
					}
					r = r.next;
				}
			while (n);
			wf = !1;
		}
	}
	function Of() {
		kf();
	}
	function kf() {
		Cf = Sf = !1;
		var e = 0;
		Tf !== 0 && hp() && (e = Tf);
		for (var t = A(), n = null, r = bf; r !== null;) {
			var i = r.next, a = Af(r, t);
			a === 0 ? (r.next = null, n === null ? bf = i : n.next = i, i === null && (xf = n)) : (n = r, (e !== 0 || a & 3) && (Cf = !0)), r = i;
		}
		X !== 0 && X !== 5 || Df(e, !1), Tf !== 0 && (Tf = 0);
	}
	function Af(e, t) {
		for (var n = e.suspendedLanes, r = e.pingedLanes, i = e.expirationTimes, a = e.pendingLanes & -62914561; 0 < a;) {
			var o = 31 - ot(a), s = 1 << o, c = i[o];
			c === -1 ? ((s & n) === 0 || (s & r) !== 0) && (i[o] = _t(s, t)) : c <= t && (e.expiredLanes |= s), a &= ~s;
		}
		if (t = G, n = q, n = mt(e, e === t ? n : 0, e.cancelPendingCommit !== null || e.timeoutHandle !== -1), r = e.callbackNode, n === 0 || e === t && (J === 2 || J === 9) || e.cancelPendingCommit !== null) return r !== null && r !== null && Ke(r), e.callbackNode = null, e.callbackPriority = 0;
		if (!(n & 3) || ht(e, n)) {
			if (t = n & -n, t === e.callbackPriority) return t;
			switch (r !== null && Ke(r), Et(n)) {
				case 2:
				case 8:
					n = Ze;
					break;
				case 32:
					n = Qe;
					break;
				case 268435456:
					n = et;
					break;
				default: n = Qe;
			}
			return r = jf.bind(null, e), n = Ge(n, r), e.callbackPriority = t, e.callbackNode = n, t;
		}
		return r !== null && r !== null && Ke(r), e.callbackPriority = 2, e.callbackNode = null, 2;
	}
	function jf(e, t) {
		if (X !== 0 && X !== 5) return e.callbackNode = null, e.callbackPriority = 0, null;
		var n = e.callbackNode;
		if (df() && e.callbackNode !== n) return null;
		var r = q;
		return r = mt(e, e === G ? r : 0, e.cancelPendingCommit !== null || e.timeoutHandle !== -1), r === 0 ? null : (Fd(e, r, t), Af(e, A()), e.callbackNode != null && e.callbackNode === n ? jf.bind(null, e) : null);
	}
	function Mf(e, t) {
		if (df()) return null;
		Fd(e, t, !0);
	}
	function Nf() {
		bp(function() {
			W & 6 ? Ge(Xe, Of) : kf();
		});
	}
	function Pf() {
		if (Tf === 0) {
			var e = Ga;
			e === 0 && (e = ut, ut <<= 1, !(ut & 261888) && (ut = 256)), Tf = e;
		}
		return Tf;
	}
	function Ff(e) {
		return e == null || typeof e == "symbol" || typeof e == "boolean" ? null : typeof e == "function" ? e : Tn(e);
	}
	function If(e, t, n, r, i) {
		if (t === "submit" && n && n.stateNode === i) {
			var a = Ff((i[jt] || null).action), o = r.submitter;
			o && (t = (t = o[jt] || null) ? Ff(t.formAction) : o.getAttribute("formAction"), t !== null && (a = t, o = null));
			var s = new qn("action", "action", null, r, i);
			e.push({
				event: s,
				listeners: [{
					instance: null,
					listener: function() {
						if (r.defaultPrevented) {
							if (Tf !== 0) {
								var e = new FormData(i, o);
								ic(n, {
									pending: !0,
									data: e,
									method: i.method,
									action: a
								}, null, e);
							}
						} else typeof a == "function" && (s.preventDefault(), e = new FormData(i, o), ic(n, {
							pending: !0,
							data: e,
							method: i.method,
							action: a
						}, a, e));
					},
					currentTarget: i
				}]
			});
		}
	}
	for (var Lf = 0; Lf < Si.length; Lf++) {
		var Rf = Si[Lf];
		Ci(Rf.toLowerCase(), "on" + (Rf[0].toUpperCase() + Rf.slice(1)));
	}
	Ci(mi, "onAnimationEnd"), Ci(hi, "onAnimationIteration"), Ci(gi, "onAnimationStart"), Ci("dblclick", "onDoubleClick"), Ci("focusin", "onFocus"), Ci("focusout", "onBlur"), Ci(_i, "onTransitionRun"), Ci(vi, "onTransitionStart"), Ci(yi, "onTransitionCancel"), Ci(bi, "onTransitionEnd"), Yt("onMouseEnter", ["mouseout", "mouseover"]), Yt("onMouseLeave", ["mouseout", "mouseover"]), Yt("onPointerEnter", ["pointerout", "pointerover"]), Yt("onPointerLeave", ["pointerout", "pointerover"]), Jt("onChange", "change click focusin focusout input keydown keyup selectionchange".split(" ")), Jt("onSelect", "focusout contextmenu dragend focusin keydown keyup mousedown mouseup selectionchange".split(" ")), Jt("onBeforeInput", [
		"compositionend",
		"keypress",
		"textInput",
		"paste"
	]), Jt("onCompositionEnd", "compositionend focusout keydown keypress keyup mousedown".split(" ")), Jt("onCompositionStart", "compositionstart focusout keydown keypress keyup mousedown".split(" ")), Jt("onCompositionUpdate", "compositionupdate focusout keydown keypress keyup mousedown".split(" "));
	var zf = "abort canplay canplaythrough durationchange emptied encrypted ended error loadeddata loadedmetadata loadstart pause play playing progress ratechange resize seeked seeking stalled suspend timeupdate volumechange waiting".split(" "), Bf = new Set("beforetoggle cancel close invalid load scroll scrollend toggle".split(" ").concat(zf));
	function Vf(e, t) {
		t = !!(t & 4);
		for (var n = 0; n < e.length; n++) {
			var r = e[n], i = r.event;
			r = r.listeners;
			a: {
				var a = void 0;
				if (t) for (var o = r.length - 1; 0 <= o; o--) {
					var s = r[o], c = s.instance, l = s.currentTarget;
					if (s = s.listener, c !== a && i.isPropagationStopped()) break a;
					a = s, i.currentTarget = l;
					try {
						a(i);
					} catch (e) {
						Oi(e);
					}
					i.currentTarget = null, a = c;
				}
				else for (o = 0; o < r.length; o++) {
					if (s = r[o], c = s.instance, l = s.currentTarget, s = s.listener, c !== a && i.isPropagationStopped()) break a;
					a = s, i.currentTarget = l;
					try {
						a(i);
					} catch (e) {
						Oi(e);
					}
					i.currentTarget = null, a = c;
				}
			}
		}
	}
	function Q(e, t) {
		var n = t[Nt];
		n === void 0 && (n = t[Nt] = /* @__PURE__ */ new Set());
		var r = e + "__bubble";
		n.has(r) || (Gf(t, e, 2, !1), n.add(r));
	}
	function Hf(e, t, n) {
		var r = 0;
		t && (r |= 4), Gf(n, e, r, t);
	}
	var Uf = "_reactListening" + Math.random().toString(36).slice(2);
	function Wf(e) {
		if (!e[Uf]) {
			e[Uf] = !0, Kt.forEach(function(t) {
				t !== "selectionchange" && (Bf.has(t) || Hf(t, !1, e), Hf(t, !0, e));
			});
			var t = e.nodeType === 9 ? e : e.ownerDocument;
			t === null || t[Uf] || (t[Uf] = !0, Hf("selectionchange", !1, t));
		}
	}
	function Gf(e, t, n, r) {
		switch (Ch(t)) {
			case 2:
				var i = _h;
				break;
			case 8:
				i = vh;
				break;
			default: i = yh;
		}
		n = i.bind(null, t, n, e), i = void 0, !In || t !== "touchstart" && t !== "touchmove" && t !== "wheel" || (i = !0), r ? i === void 0 ? e.addEventListener(t, n, !0) : e.addEventListener(t, n, {
			capture: !0,
			passive: i
		}) : i === void 0 ? e.addEventListener(t, n, !1) : e.addEventListener(t, n, { passive: i });
	}
	function Kf(e, t, n, r, i) {
		var a = r;
		if (!(t & 1) && !(t & 2) && r !== null) a: for (;;) {
			if (r === null) return;
			var s = r.tag;
			if (s === 3 || s === 4) {
				var c = r.stateNode.containerInfo;
				if (c === i) break;
				if (s === 4) for (s = r.return; s !== null;) {
					var l = s.tag;
					if ((l === 3 || l === 4) && s.stateNode.containerInfo === i) return;
					s = s.return;
				}
				for (; c !== null;) {
					if (s = Bt(c), s === null) return;
					if (l = s.tag, l === 5 || l === 6 || l === 26 || l === 27) {
						r = a = s;
						continue a;
					}
					c = c.parentNode;
				}
			}
			r = r.return;
		}
		Nn(function() {
			var r = a, i = On(n), s = [];
			a: {
				var c = xi.get(e);
				if (c !== void 0) {
					var l = qn, u = e;
					switch (e) {
						case "keypress": if (Hn(n) === 0) break a;
						case "keydown":
						case "keyup":
							l = dr;
							break;
						case "focusin":
							u = "focus", l = nr;
							break;
						case "focusout":
							u = "blur", l = nr;
							break;
						case "beforeblur":
						case "afterblur":
							l = nr;
							break;
						case "click": if (n.button === 2) break a;
						case "auxclick":
						case "dblclick":
						case "mousedown":
						case "mousemove":
						case "mouseup":
						case "mouseout":
						case "mouseover":
						case "contextmenu":
							l = er;
							break;
						case "drag":
						case "dragend":
						case "dragenter":
						case "dragexit":
						case "dragleave":
						case "dragover":
						case "dragstart":
						case "drop":
							l = tr;
							break;
						case "touchcancel":
						case "touchend":
						case "touchmove":
						case "touchstart":
							l = mr;
							break;
						case mi:
						case hi:
						case gi:
							l = rr;
							break;
						case bi:
							l = hr;
							break;
						case "scroll":
						case "scrollend":
							l = Yn;
							break;
						case "wheel":
							l = gr;
							break;
						case "copy":
						case "cut":
						case "paste":
							l = ir;
							break;
						case "gotpointercapture":
						case "lostpointercapture":
						case "pointercancel":
						case "pointerdown":
						case "pointermove":
						case "pointerout":
						case "pointerover":
						case "pointerup":
							l = fr;
							break;
						case "submit":
							l = pr;
							break;
						case "toggle":
						case "beforetoggle": l = _r;
					}
					var d = !!(t & 4), f = !d && (e === "scroll" || e === "scrollend"), p = d ? c === null ? null : c + "Capture" : c;
					d = [];
					for (var m = r, h; m !== null;) {
						var g = m;
						if (h = g.stateNode, g = g.tag, g !== 5 && g !== 26 && g !== 27 || h === null || p === null || (g = Pn(m, p), g != null && d.push(qf(m, g, h))), f) break;
						m = m.return;
					}
					0 < d.length && (c = new l(c, u, null, n, i), s.push({
						event: c,
						listeners: d
					}));
				}
			}
			if (!(t & 7)) {
				a: {
					if (l = e === "mouseover" || e === "pointerover", c = e === "mouseout" || e === "pointerout", l && n !== Dn && (u = n.relatedTarget || n.fromElement) && (Bt(u) || u[Mt])) break a;
					(c || l) && (u = i.window === i ? i : (l = i.ownerDocument) ? l.defaultView || l.parentWindow : window, c ? (l = n.relatedTarget || n.toElement, c = r, l = l ? Bt(l) : null, l !== null && (f = o(l), d = l.tag, l !== f || d !== 5 && d !== 27 && d !== 6) && (l = null)) : (c = null, l = r), c !== l && (d = er, g = "onMouseLeave", p = "onMouseEnter", m = "mouse", (e === "pointerout" || e === "pointerover") && (d = fr, g = "onPointerLeave", p = "onPointerEnter", m = "pointer"), f = c == null ? u : Ht(c), h = l == null ? u : Ht(l), u = new d(g, m + "leave", c, n, i), u.target = f, u.relatedTarget = h, g = null, Bt(i) === r && (d = new d(p, m + "enter", l, n, i), d.target = h, d.relatedTarget = f, g = d), f = g, d = c && l ? re(c, l, Yf) : null, c !== null && Xf(s, u, c, d, !1), l !== null && f !== null && Xf(s, f, l, d, !0)));
				}
				a: {
					if (c = r ? Ht(r) : window, l = c.nodeName && c.nodeName.toLowerCase(), l === "select" || l === "input" && c.type === "file") var _ = Lr;
					else if (jr(c)) {
						if (Rr) _ = qr;
						else {
							_ = Gr;
							var v = Wr;
						}
					} else l = c.nodeName, !l || l.toLowerCase() !== "input" || c.type !== "checkbox" && c.type !== "radio" ? r && Sn(r.elementType) && (_ = Lr) : _ = Kr;
					if (_ &&= _(e, r)) {
						Mr(s, _, n, i);
						break a;
					}
					v && v(e, c, r);
				}
				switch (v = r ? Ht(r) : window, e) {
					case "focusin":
						(jr(v) || v.contentEditable === "true") && (ii = v, ai = r, oi = null);
						break;
					case "focusout":
						oi = ai = ii = null;
						break;
					case "mousedown":
						si = !0;
						break;
					case "contextmenu":
					case "mouseup":
					case "dragend":
						si = !1, ci(s, n, i);
						break;
					case "selectionchange": if (ri) break;
					case "keydown":
					case "keyup": ci(s, n, i);
				}
				var y;
				if (yr) b: {
					switch (e) {
						case "compositionstart":
							var b = "onCompositionStart";
							break b;
						case "compositionend":
							b = "onCompositionEnd";
							break b;
						case "compositionupdate":
							b = "onCompositionUpdate";
							break b;
					}
					b = void 0;
				}
				else Dr ? Tr(e, n) && (b = "onCompositionEnd") : e === "keydown" && n.keyCode === 229 && (b = "onCompositionStart");
				b && (Sr && n.locale !== "ko" && (Dr || b !== "onCompositionStart" ? b === "onCompositionEnd" && Dr && (y = Vn()) : (Rn = i, zn = "value" in Rn ? Rn.value : Rn.textContent, Dr = !0)), v = Jf(r, b), 0 < v.length && (b = new ar(b, e, null, n, i), s.push({
					event: b,
					listeners: v
				}), y ? b.data = y : (y = Er(n), y !== null && (b.data = y)))), (y = xr ? Or(e, n) : kr(e, n)) && (b = Jf(r, "onBeforeInput"), 0 < b.length && (v = new ar("onBeforeInput", "beforeinput", null, n, i), s.push({
					event: v,
					listeners: b
				}), v.data = y)), If(s, e, r, n, i);
			}
			Vf(s, t);
		});
	}
	function qf(e, t, n) {
		return {
			instance: e,
			listener: t,
			currentTarget: n
		};
	}
	function Jf(e, t) {
		for (var n = t + "Capture", r = []; e !== null;) {
			var i = e, a = i.stateNode;
			if (i = i.tag, i !== 5 && i !== 26 && i !== 27 || a === null || (i = Pn(e, n), i != null && r.unshift(qf(e, i, a)), i = Pn(e, t), i != null && r.push(qf(e, i, a))), e.tag === 3) return r;
			e = e.return;
		}
		return [];
	}
	function Yf(e) {
		if (e === null) return null;
		do
			e = e.return;
		while (e && e.tag !== 5 && e.tag !== 27);
		return e || null;
	}
	function Xf(e, t, n, r, i) {
		for (var a = t._reactName, o = []; n !== null && n !== r;) {
			var s = n, c = s.alternate, l = s.stateNode;
			if (s = s.tag, c !== null && c === r) break;
			s !== 5 && s !== 26 && s !== 27 || l === null || (c = l, i ? (l = Pn(n, a), l != null && o.unshift(qf(n, l, c))) : i || (l = Pn(n, a), l != null && o.push(qf(n, l, c)))), n = n.return;
		}
		o.length !== 0 && e.push({
			event: t,
			listeners: o
		});
	}
	var Zf = /\r\n?/g, Qf = /\u0000|\uFFFD/g;
	function $f(e) {
		return (typeof e == "string" ? e : "" + e).replace(Zf, "\n").replace(Qf, "");
	}
	function ep(e, t) {
		return t = $f(t), $f(e) === t;
	}
	function $(e, t, n, r, a, o) {
		switch (n) {
			case "children":
				if (typeof r == "string") t === "body" || t === "textarea" && r === "" || vn(e, r);
				else if (typeof r == "number" || typeof r == "bigint") t !== "body" && vn(e, "" + r);
				else return;
				break;
			case "className":
				nn(e, "class", r);
				break;
			case "tabIndex":
				nn(e, "tabindex", r);
				break;
			case "dir":
			case "role":
			case "viewBox":
			case "width":
			case "height":
				nn(e, n, r);
				break;
			case "style":
				xn(e, r, o);
				return;
			case "data": if (t !== "object") {
				nn(e, "data", r);
				break;
			}
			case "src":
			case "href":
				if (r === "" && (t !== "a" || n !== "href")) {
					e.removeAttribute(n);
					break;
				}
				if (r == null || typeof r == "function" || typeof r == "symbol" || typeof r == "boolean") {
					e.removeAttribute(n);
					break;
				}
				r = Tn(r), e.setAttribute(n, r);
				break;
			case "action":
			case "formAction":
				if (typeof r == "function") {
					e.setAttribute(n, "javascript:throw new Error('A React form was unexpectedly submitted. If you called form.submit() manually, consider using form.requestSubmit() instead. If you\\'re trying to use event.stopPropagation() in a submit event handler, consider also calling event.preventDefault().')");
					break;
				}
				if (typeof o == "function" && (n === "formAction" ? (t !== "input" && $(e, t, "name", a.name, a, null), $(e, t, "formEncType", a.formEncType, a, null), $(e, t, "formMethod", a.formMethod, a, null), $(e, t, "formTarget", a.formTarget, a, null)) : ($(e, t, "encType", a.encType, a, null), $(e, t, "method", a.method, a, null), $(e, t, "target", a.target, a, null))), r == null || typeof r == "symbol" || typeof r == "boolean") {
					e.removeAttribute(n);
					break;
				}
				r = Tn(r), e.setAttribute(n, r);
				break;
			case "onClick":
				r != null && (e.onclick = En);
				return;
			case "onScroll":
				r != null && Q("scroll", e);
				return;
			case "onScrollEnd":
				r != null && Q("scrollend", e);
				return;
			case "dangerouslySetInnerHTML":
				if (r != null) {
					if (typeof r != "object" || !("__html" in r)) throw Error(i(61));
					if (n = r.__html, n != null) {
						if (a.children != null) throw Error(i(60));
						o?.__html !== n && (e.innerHTML = n);
					}
				}
				break;
			case "multiple":
				e.multiple = r && typeof r != "function" && typeof r != "symbol";
				break;
			case "muted":
				e.muted = r && typeof r != "function" && typeof r != "symbol";
				break;
			case "suppressContentEditableWarning":
			case "suppressHydrationWarning":
			case "defaultValue":
			case "defaultChecked":
			case "innerHTML":
			case "ref": break;
			case "autoFocus": break;
			case "xlinkHref":
				if (r == null || typeof r == "function" || typeof r == "boolean" || typeof r == "symbol") {
					e.removeAttribute("xlink:href");
					break;
				}
				n = Tn(r), e.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", n);
				break;
			case "contentEditable":
			case "spellCheck":
			case "draggable":
			case "value":
			case "autoReverse":
			case "externalResourcesRequired":
			case "focusable":
			case "preserveAlpha":
				r != null && typeof r != "function" && typeof r != "symbol" ? e.setAttribute(n, r) : e.removeAttribute(n);
				break;
			case "inert":
			case "allowFullScreen":
			case "async":
			case "autoPlay":
			case "controls":
			case "credentialless":
			case "default":
			case "defer":
			case "disabled":
			case "disablePictureInPicture":
			case "disableRemotePlayback":
			case "formNoValidate":
			case "hidden":
			case "loop":
			case "noModule":
			case "noValidate":
			case "open":
			case "playsInline":
			case "readOnly":
			case "required":
			case "reversed":
			case "scoped":
			case "seamless":
			case "itemScope":
				r && typeof r != "function" && typeof r != "symbol" ? e.setAttribute(n, "") : e.removeAttribute(n);
				break;
			case "capture":
			case "download":
				!0 === r ? e.setAttribute(n, "") : !1 !== r && r != null && typeof r != "function" && typeof r != "symbol" ? e.setAttribute(n, r) : e.removeAttribute(n);
				break;
			case "cols":
			case "rows":
			case "size":
			case "span":
				r != null && typeof r != "function" && typeof r != "symbol" && !isNaN(r) && 1 <= r ? e.setAttribute(n, r) : e.removeAttribute(n);
				break;
			case "rowSpan":
			case "start":
				r == null || typeof r == "function" || typeof r == "symbol" || isNaN(r) ? e.removeAttribute(n) : e.setAttribute(n, r);
				break;
			case "popover":
				Q("beforetoggle", e), Q("toggle", e), tn(e, "popover", r);
				break;
			case "xlinkActuate":
				rn(e, "http://www.w3.org/1999/xlink", "xlink:actuate", r);
				break;
			case "xlinkArcrole":
				rn(e, "http://www.w3.org/1999/xlink", "xlink:arcrole", r);
				break;
			case "xlinkRole":
				rn(e, "http://www.w3.org/1999/xlink", "xlink:role", r);
				break;
			case "xlinkShow":
				rn(e, "http://www.w3.org/1999/xlink", "xlink:show", r);
				break;
			case "xlinkTitle":
				rn(e, "http://www.w3.org/1999/xlink", "xlink:title", r);
				break;
			case "xlinkType":
				rn(e, "http://www.w3.org/1999/xlink", "xlink:type", r);
				break;
			case "xmlBase":
				rn(e, "http://www.w3.org/XML/1998/namespace", "xml:base", r);
				break;
			case "xmlLang":
				rn(e, "http://www.w3.org/XML/1998/namespace", "xml:lang", r);
				break;
			case "xmlSpace":
				rn(e, "http://www.w3.org/XML/1998/namespace", "xml:space", r);
				break;
			case "is":
				tn(e, "is", r);
				break;
			case "innerText":
			case "textContent": return;
			default: if (!(2 < n.length) || n[0] !== "o" && n[0] !== "O" || n[1] !== "n" && n[1] !== "N") n = Cn.get(n) || n, tn(e, n, r);
			else return;
		}
		j = !0;
	}
	function tp(e, t, n, r, a, o) {
		switch (n) {
			case "style":
				xn(e, r, o);
				return;
			case "dangerouslySetInnerHTML":
				if (r != null) {
					if (typeof r != "object" || !("__html" in r)) throw Error(i(61));
					if (n = r.__html, n != null) {
						if (a.children != null) throw Error(i(60));
						o?.__html !== n && (e.innerHTML = n);
					}
				}
				break;
			case "children":
				if (typeof r == "string") vn(e, r);
				else if (typeof r == "number" || typeof r == "bigint") vn(e, "" + r);
				else return;
				break;
			case "onScroll":
				r != null && Q("scroll", e);
				return;
			case "onScrollEnd":
				r != null && Q("scrollend", e);
				return;
			case "onClick":
				r != null && (e.onclick = En);
				return;
			case "suppressContentEditableWarning":
			case "suppressHydrationWarning":
			case "innerHTML":
			case "ref": return;
			case "innerText":
			case "textContent": return;
			default:
				if (!qt.hasOwnProperty(n)) a: {
					if (n[0] === "o" && n[1] === "n" && (a = n.endsWith("Capture"), o = n.slice(2, a ? n.length - 7 : void 0), t = e[jt] || null, t = t == null ? null : t[n], typeof t == "function" && e.removeEventListener(o, t, a), typeof r == "function")) {
						typeof t != "function" && t !== null && (n in e ? e[n] = null : e.hasAttribute(n) && e.removeAttribute(n)), e.addEventListener(o, r, a);
						break a;
					}
					j = !0, n in e ? e[n] = r : !0 === r ? e.setAttribute(n, "") : tn(e, n, r);
				}
				return;
		}
		j = !0;
	}
	function np(e, t, n) {
		switch (t) {
			case "div":
			case "span":
			case "svg":
			case "path":
			case "a":
			case "g":
			case "p":
			case "li": break;
			case "img":
				Q("error", e), Q("load", e);
				var r = !1, a = !1, o;
				for (o in n) if (n.hasOwnProperty(o)) {
					var s = n[o];
					if (s != null) switch (o) {
						case "src":
							r = !0;
							break;
						case "srcSet":
							a = !0;
							break;
						case "children":
						case "dangerouslySetInnerHTML": throw Error(i(137, t));
						default: $(e, t, o, s, n, null);
					}
				}
				a && $(e, t, "srcSet", n.srcSet, n, null), r && $(e, t, "src", n.src, n, null);
				return;
			case "input":
				Q("invalid", e);
				var c = o = s = a = null, l = null, u = null;
				for (r in n) if (n.hasOwnProperty(r)) {
					var d = n[r];
					if (d != null) switch (r) {
						case "name":
							a = d;
							break;
						case "type":
							s = d;
							break;
						case "checked":
							l = d;
							break;
						case "defaultChecked":
							u = d;
							break;
						case "value":
							o = d;
							break;
						case "defaultValue":
							c = d;
							break;
						case "children":
						case "dangerouslySetInnerHTML":
							if (d != null) throw Error(i(137, t));
							break;
						default: $(e, t, r, d, n, null);
					}
				}
				pn(e, o, c, l, u, s, a, !1);
				return;
			case "select":
				for (a in Q("invalid", e), r = s = o = null, n) if (n.hasOwnProperty(a) && (c = n[a], c != null)) switch (a) {
					case "value":
						o = c;
						break;
					case "defaultValue":
						s = c;
						break;
					case "multiple": r = c;
					default: $(e, t, a, c, n, null);
				}
				t = o, n = s, e.multiple = !!r, t == null ? n != null && hn(e, !!r, n, !0) : hn(e, !!r, t, !1);
				return;
			case "textarea":
				for (s in Q("invalid", e), o = a = r = null, n) if (n.hasOwnProperty(s) && (c = n[s], c != null)) switch (s) {
					case "value":
						r = c;
						break;
					case "defaultValue":
						a = c;
						break;
					case "children":
						o = c;
						break;
					case "dangerouslySetInnerHTML":
						if (c != null) throw Error(i(91));
						break;
					default: $(e, t, s, c, n, null);
				}
				_n(e, r, a, o);
				return;
			case "option":
				for (l in n) if (n.hasOwnProperty(l) && (r = n[l], r != null)) switch (l) {
					case "selected":
						e.selected = r && typeof r != "function" && typeof r != "symbol";
						break;
					default: $(e, t, l, r, n, null);
				}
				return;
			case "dialog":
				Q("beforetoggle", e), Q("toggle", e), Q("cancel", e), Q("close", e);
				break;
			case "iframe":
			case "object":
				Q("load", e);
				break;
			case "video":
			case "audio":
				for (r = 0; r < zf.length; r++) Q(zf[r], e);
				break;
			case "image":
				Q("error", e), Q("load", e);
				break;
			case "details":
				Q("toggle", e);
				break;
			case "embed":
			case "source":
			case "link": Q("error", e), Q("load", e);
			case "area":
			case "base":
			case "br":
			case "col":
			case "hr":
			case "keygen":
			case "meta":
			case "param":
			case "track":
			case "wbr":
			case "menuitem":
				for (u in n) if (n.hasOwnProperty(u) && (r = n[u], r != null)) switch (u) {
					case "children":
					case "dangerouslySetInnerHTML": throw Error(i(137, t));
					default: $(e, t, u, r, n, null);
				}
				return;
			default: if (Sn(t)) {
				for (d in n) n.hasOwnProperty(d) && (r = n[d], r !== void 0 && tp(e, t, d, r, n, void 0));
				return;
			}
		}
		for (c in n) n.hasOwnProperty(c) && (r = n[c], r != null && $(e, t, c, r, n, null));
	}
	var rp = {};
	function ip(e, t, n, r) {
		switch (t) {
			case "div":
			case "span":
			case "svg":
			case "path":
			case "a":
			case "g":
			case "p":
			case "li": break;
			case "input":
				var a = null, o = null, s = null, c = null, l = null, u = null, d = null;
				for (m in n) {
					var f = n[m];
					if (n.hasOwnProperty(m) && f != null) switch (m) {
						case "checked": break;
						case "value": break;
						case "defaultValue": l = f;
						default: r.hasOwnProperty(m) || $(e, t, m, null, r, f);
					}
				}
				for (var p in r) {
					var m = r[p];
					if (f = n[p], r.hasOwnProperty(p) && (m != null || f != null)) switch (p) {
						case "type":
							m !== f && (j = !0), o = m;
							break;
						case "name":
							m !== f && (j = !0), a = m;
							break;
						case "checked":
							m !== f && (j = !0), u = m;
							break;
						case "defaultChecked":
							m !== f && (j = !0), d = m;
							break;
						case "value":
							m !== f && (j = !0), s = m;
							break;
						case "defaultValue":
							m !== f && (j = !0), c = m;
							break;
						case "children":
						case "dangerouslySetInnerHTML":
							if (m != null) throw Error(i(137, t));
							break;
						default: m !== f && $(e, t, p, m, r, f);
					}
				}
				fn(e, s, c, l, u, d, o, a);
				return;
			case "select":
				for (o in m = s = c = p = null, n) if (l = n[o], n.hasOwnProperty(o) && l != null) switch (o) {
					case "value": break;
					case "multiple": m = l;
					default: r.hasOwnProperty(o) || $(e, t, o, null, r, l);
				}
				for (a in r) if (o = r[a], l = n[a], r.hasOwnProperty(a) && (o != null || l != null)) switch (a) {
					case "value":
						o !== l && (j = !0), p = o;
						break;
					case "defaultValue":
						o !== l && (j = !0), c = o;
						break;
					case "multiple": o !== l && (j = !0), s = o;
					default: o !== l && $(e, t, a, o, r, l);
				}
				t = c, n = s, r = m, p == null ? !!r != !!n && (t == null ? hn(e, !!n, n ? [] : "", !1) : hn(e, !!n, t, !0)) : hn(e, !!n, p, !1);
				return;
			case "textarea":
				for (c in m = p = null, n) if (a = n[c], n.hasOwnProperty(c) && a != null && !r.hasOwnProperty(c)) switch (c) {
					case "value": break;
					case "children": break;
					default: $(e, t, c, null, r, a);
				}
				for (s in r) if (a = r[s], o = n[s], r.hasOwnProperty(s) && (a != null || o != null)) switch (s) {
					case "value":
						a !== o && (j = !0), p = a;
						break;
					case "defaultValue":
						a !== o && (j = !0), m = a;
						break;
					case "children": break;
					case "dangerouslySetInnerHTML":
						if (a != null) throw Error(i(91));
						break;
					default: a !== o && $(e, t, s, a, r, o);
				}
				gn(e, p, m);
				return;
			case "option":
				for (var h in n) if (p = n[h], n.hasOwnProperty(h) && p != null && !r.hasOwnProperty(h)) switch (h) {
					case "selected":
						e.selected = !1;
						break;
					default: $(e, t, h, null, r, p);
				}
				for (l in r) if (p = r[l], m = n[l], r.hasOwnProperty(l) && p !== m && (p != null || m != null)) switch (l) {
					case "selected":
						p !== m && (j = !0), e.selected = p && typeof p != "function" && typeof p != "symbol";
						break;
					default: $(e, t, l, p, r, m);
				}
				return;
			case "img":
			case "link":
			case "area":
			case "base":
			case "br":
			case "col":
			case "embed":
			case "hr":
			case "keygen":
			case "meta":
			case "param":
			case "source":
			case "track":
			case "wbr":
			case "menuitem":
				for (var g in n) p = n[g], n.hasOwnProperty(g) && p != null && !r.hasOwnProperty(g) && $(e, t, g, null, r, p);
				for (u in r) if (p = r[u], m = n[u], r.hasOwnProperty(u) && p !== m && (p != null || m != null)) switch (u) {
					case "children":
					case "dangerouslySetInnerHTML":
						if (p != null) throw Error(i(137, t));
						break;
					default: $(e, t, u, p, r, m);
				}
				return;
			default: if (Sn(t)) {
				for (var _ in n) p = n[_], n.hasOwnProperty(_) && p !== void 0 && !r.hasOwnProperty(_) && tp(e, t, _, void 0, r, p);
				for (d in r) p = r[d], m = n[d], !r.hasOwnProperty(d) || p === m || p === void 0 && m === void 0 || tp(e, t, d, p, r, m);
				return;
			}
		}
		for (var v in n) p = n[v], n.hasOwnProperty(v) && p != null && !r.hasOwnProperty(v) && $(e, t, v, null, r, p);
		for (f in r) p = r[f], m = n[f], !r.hasOwnProperty(f) || p === m || p == null && m == null || $(e, t, f, p, r, m);
	}
	function ap(e) {
		switch (e) {
			case "css":
			case "script":
			case "font":
			case "img":
			case "image":
			case "input":
			case "link": return !0;
			default: return !1;
		}
	}
	function op() {
		if (typeof performance.getEntriesByType == "function") {
			for (var e = 0, t = 0, n = performance.getEntriesByType("resource"), r = 0; r < n.length; r++) {
				var i = n[r], a = i.transferSize, o = i.initiatorType, s = i.duration;
				if (a && s && ap(o)) {
					for (o = 0, s = i.responseEnd, r += 1; r < n.length; r++) {
						var c = n[r], l = c.startTime;
						if (l > s) break;
						var u = c.transferSize, d = c.initiatorType;
						u && ap(d) && (c = c.responseEnd, o += u * (c < s ? 1 : (s - l) / (c - l)));
					}
					if (--r, t += 8 * (a + o) / (i.duration / 1e3), e++, 10 < e) break;
				}
			}
			if (0 < e) return t / e / 1e6;
		}
		return navigator.connection && (e = navigator.connection.downlink, typeof e == "number") ? e : 5;
	}
	var sp = null, cp = null;
	function lp(e) {
		return e.nodeType === 9 ? e : e.ownerDocument;
	}
	function up(e) {
		switch (e) {
			case "http://www.w3.org/2000/svg": return 1;
			case "http://www.w3.org/1998/Math/MathML": return 2;
			default: return 0;
		}
	}
	function dp(e, t) {
		if (e === 0) switch (t) {
			case "svg": return 1;
			case "math": return 2;
			default: return 0;
		}
		return e === 1 && t === "foreignObject" ? 0 : e;
	}
	function fp(e, t, n, r) {
		return n = lp(n).createElement(e), n[At] = r, n[jt] = t, np(n, e, t), Wt(n), n;
	}
	function pp(e, t) {
		return e === "textarea" || e === "noscript" || typeof t.children == "string" || typeof t.children == "number" || typeof t.children == "bigint" || typeof t.dangerouslySetInnerHTML == "object" && t.dangerouslySetInnerHTML !== null && t.dangerouslySetInnerHTML.__html != null;
	}
	var mp = null;
	function hp() {
		var e = window.event;
		return e && e.type === "popstate" ? e !== mp && (mp = e, !0) : (mp = null, !1);
	}
	var gp = typeof setTimeout == "function" ? setTimeout : void 0, _p = typeof clearTimeout == "function" ? clearTimeout : void 0, vp = typeof Promise == "function" ? Promise : void 0, yp = typeof requestAnimationFrame == "function" ? requestAnimationFrame : gp, bp = typeof queueMicrotask == "function" ? queueMicrotask : vp === void 0 ? gp : function(e) {
		return vp.resolve(null).then(e).catch(xp);
	};
	function xp(e) {
		setTimeout(function() {
			throw e;
		});
	}
	function Sp(e) {
		return e === "head";
	}
	function Cp(e, t) {
		var n = t, r = 0;
		do {
			var i = n.nextSibling;
			if (e.removeChild(n), i && i.nodeType === 8) {
				if (n = i.data, n === "/$" || n === "/&") {
					if (r === 0) {
						e.removeChild(i), Hh(t);
						return;
					}
					r--;
				} else if (n === "$" || n === "$?" || n === "$~" || n === "$!" || n === "&") r++;
				else if (n === "html") _m(e.ownerDocument.documentElement);
				else if (n === "head") {
					n = e.ownerDocument.head, _m(n);
					for (var a = n.firstChild; a;) {
						var o = a.nextSibling, s = a.nodeName;
						a[Lt] || s === "SCRIPT" || s === "STYLE" || s === "LINK" && a.rel.toLowerCase() === "stylesheet" || n.removeChild(a), a = o;
					}
				} else n === "body" && _m(e.ownerDocument.body);
			}
			n = i;
		} while (n);
		Hh(t);
	}
	function wp(e, t) {
		var n = e;
		e = 0;
		do {
			var r = n.nextSibling;
			if (n.nodeType === 1 ? t ? (n._stashedDisplay = n.style.display, n.style.display = "none") : (n.style.display = n._stashedDisplay || "", n.getAttribute("style") === "" && n.removeAttribute("style")) : n.nodeType === 3 && (t ? (n._stashedText = n.nodeValue, n.nodeValue = "") : n.nodeValue = n._stashedText || ""), r && r.nodeType === 8) {
				if (n = r.data, n === "/$") {
					if (e === 0) break;
					e--;
				} else n !== "$" && n !== "$?" && n !== "$~" && n !== "$!" || e++;
			}
			n = r;
		} while (n);
	}
	function Tp(e, t, n) {
		if (t = CSS.escape(t) === t ? t : "r-" + btoa(t).replace(/=/g, ""), e.style.viewTransitionName = t, n != null && (e.style.viewTransitionClass = n), n = getComputedStyle(e), n.display === "inline") {
			if (t = e.getClientRects(), t.length === 1) var r = 1;
			else for (var i = r = 0; i < t.length; i++) {
				var a = t[i];
				0 < a.width && 0 < a.height && r++;
			}
			r === 1 && (e = e.style, e.display = t.length === 1 ? "inline-block" : "block", e.marginTop = "-" + n.paddingTop, e.marginBottom = "-" + n.paddingBottom);
		}
	}
	function Ep(e, t) {
		e = e.style, t = t.style;
		var n = t == null ? null : t.hasOwnProperty("viewTransitionName") ? t.viewTransitionName : t.hasOwnProperty("view-transition-name") ? t["view-transition-name"] : null;
		e.viewTransitionName = n == null || typeof n == "boolean" ? "" : ("" + n).trim(), n = t == null ? null : t.hasOwnProperty("viewTransitionClass") ? t.viewTransitionClass : t.hasOwnProperty("view-transition-class") ? t["view-transition-class"] : null, e.viewTransitionClass = n == null || typeof n == "boolean" ? "" : ("" + n).trim(), e.display === "inline-block" && (t == null ? e.display = e.margin = "" : (n = t.display, e.display = n == null || typeof n == "boolean" ? "" : n, n = t.margin, n == null ? (n = t.hasOwnProperty("marginTop") ? t.marginTop : t["margin-top"], e.marginTop = n == null || typeof n == "boolean" ? "" : n, t = t.hasOwnProperty("marginBottom") ? t.marginBottom : t["margin-bottom"], e.marginBottom = t == null || typeof t == "boolean" ? "" : t) : e.margin = n));
	}
	function Dp(e, t, n) {
		return n = n.ownerDocument.defaultView, {
			rect: e,
			abs: t.position === "absolute" || t.position === "fixed",
			clip: t.clipPath !== "none" || t.overflow !== "visible" || t.filter !== "none" || t.mask !== "none" || t.mask !== "none" || t.borderRadius !== "0px",
			view: 0 <= e.bottom && 0 <= e.right && e.top <= n.innerHeight && e.left <= n.innerWidth
		};
	}
	function Op(e) {
		return Dp(e.getBoundingClientRect(), getComputedStyle(e), e);
	}
	function kp(e) {
		var t = e.getBoundingClientRect();
		t = new DOMRect(t.x + 2e4, t.y + 2e4, t.width, t.height);
		var n = getComputedStyle(e);
		return Dp(t, n, e);
	}
	function Ap(e) {
		return e.documentElement.clientHeight;
	}
	function jp(e) {
		this.addEventListener("load", e), this.addEventListener("error", e);
	}
	function Mp(e, t, n, r, i, a, o, s, c) {
		var l = t.nodeType === 9 ? t : t.ownerDocument;
		try {
			var u = l.startViewTransition({
				update: function() {
					var t = l.defaultView, n = t.navigation && t.navigation.transition, o = l.fonts.status;
					r();
					var s = [];
					if (o === "loaded" && (Ap(l), l.fonts.status === "loading" && s.push(l.fonts.ready)), o = s.length, e !== null) for (var c = e.suspenseyImages, u = 0, d = 0; d < c.length; d++) {
						var f = c[d];
						if (!f.complete) {
							var p = f.getBoundingClientRect();
							if (0 < p.bottom && 0 < p.right && p.top < t.innerHeight && p.left < t.innerWidth) {
								if (u += Xm(f), u > $m) {
									s.length = o;
									break;
								}
								f = new Promise(jp.bind(f)), s.push(f);
							}
						}
					}
					if (0 < s.length) return t = Promise.race([Promise.all(s), new Promise(function(e) {
						return setTimeout(e, 500);
					})]).then(i, i), (n ? Promise.allSettled([n.finished, t]) : t).then(a, a);
					if (i(), n) return n.finished.then(a, a);
					a();
				},
				types: n
			});
			l.__reactViewTransition = u;
			var d = [];
			return u.ready.then(function() {
				for (var e = l.documentElement.getAnimations({ subtree: !0 }), t = 0; t < e.length; t++) {
					var n = e[t], r = n.effect, i = r.pseudoElement;
					if (i != null && i.startsWith("::view-transition")) {
						d.push(n), n = r.getKeyframes();
						for (var a = i = void 0, s = !0, c = 0; c < n.length; c++) {
							var u = n[c], f = u.width;
							if (i === void 0) i = f;
							else if (i !== f) {
								s = !1;
								break;
							}
							if (f = u.height, a === void 0) a = f;
							else if (a !== f) {
								s = !1;
								break;
							}
							delete u.width, delete u.height, u.transform === "none" && delete u.transform;
						}
						s && i !== void 0 && a !== void 0 && (r.setKeyframes(n), s = getComputedStyle(r.target, r.pseudoElement), s.width !== i || s.height !== a) && (s = n[0], s.width = i, s.height = a, s = n[n.length - 1], s.width = i, s.height = a, r.setKeyframes(n));
					}
				}
				o();
			}, function(e) {
				l.__reactViewTransition === u && (l.__reactViewTransition = null);
				try {
					if (typeof e == "object" && e) switch (e.name) {
						case "InvalidStateError": (e.message === "View transition was skipped because document visibility state is hidden." || e.message === "Skipping view transition because document visibility state has become hidden." || e.message === "Skipping view transition because viewport size changed." || e.message === "Transition was aborted because of invalid state") && (e = null);
					}
					e !== null && c(e);
				} finally {
					r(), i(), o();
				}
			}), u.finished.finally(function() {
				for (var e = 0; e < d.length; e++) d[e].cancel();
				l.__reactViewTransition === u && (l.__reactViewTransition = null), s();
			}), u;
		} catch {
			return r(), i(), o(), null;
		}
	}
	function Np(e, t) {
		this._scope = document.documentElement, this._selector = "::view-transition-" + e + "(" + t + ")";
	}
	Np.prototype.animate = function(e, t) {
		return t = typeof t == "number" ? { duration: t } : C({}, t), t.pseudoElement = this._selector, this._scope.animate(e, t);
	}, Np.prototype.getAnimations = function() {
		for (var e = this._scope, t = this._selector, n = e.getAnimations({ subtree: !0 }), r = [], i = 0; i < n.length; i++) {
			var a = n[i].effect;
			a !== null && a.target === e && a.pseudoElement === t && r.push(n[i]);
		}
		return r;
	}, Np.prototype.getComputedStyle = function() {
		return getComputedStyle(this._scope, this._selector);
	};
	function Pp(e) {
		return {
			name: e,
			group: new Np("group", e),
			imagePair: new Np("image-pair", e),
			old: new Np("old", e),
			new: new Np("new", e)
		};
	}
	function Fp(e) {
		this._fragmentFiber = e, this._observers = this._eventListeners = null;
	}
	Fp.prototype.addEventListener = function(e, t, n) {
		var r = null, i = null;
		if (!(n != null && typeof n != "boolean" && (r = n.signal || null, r !== null && r.aborted))) {
			this._eventListeners === null && (this._eventListeners = []);
			var a = this._eventListeners;
			if (Bp(a, e, t, n) === -1) {
				var o = this, s = t;
				n != null && typeof n != "boolean" && !0 === n.once && (s = function(r) {
					o.removeEventListener(e, t, n), typeof t == "function" ? t.call(this, r) : t.handleEvent(r);
				}), r !== null && (i = o.removeEventListener.bind(o, e, t, n), r.addEventListener("abort", i, { once: !0 }), i = r.removeEventListener.bind(r, "abort", i)), r = Rp(n), a.push({
					type: e,
					listener: t,
					optionsOrUseCapture: n,
					attachedListener: s,
					cleanup: i
				}), h(this._fragmentFiber.child, !1, Ip, e, s, r);
			}
			this._eventListeners = a;
		}
	};
	function Ip(e, t, n, r) {
		return b(e).addEventListener(t, n, r), !1;
	}
	Fp.prototype.removeEventListener = function(e, t, n) {
		var r = this._eventListeners;
		if (r !== null && (t = Bp(r, e, t, n), t !== -1)) {
			var i = r[t];
			n = i.attachedListener;
			var a = i.cleanup;
			i = Rp(i.optionsOrUseCapture), h(this._fragmentFiber.child, !1, Lp, e, n, i), r.splice(t, 1), a !== null && a();
		}
	};
	function Lp(e, t, n, r) {
		return b(e).removeEventListener(t, n, r), !1;
	}
	function Rp(e) {
		return e != null && typeof e != "boolean" && (!0 === e.once || e.signal instanceof AbortSignal) ? {
			capture: e.capture,
			passive: e.passive
		} : e;
	}
	function zp(e) {
		return e == null ? "c=0" : typeof e == "boolean" ? "c=" + (e ? "1" : "0") : "c=" + (e.capture ? "1" : "0");
	}
	function Bp(e, t, n, r) {
		if (e.length === 0) return -1;
		r = zp(r);
		for (var i = 0; i < e.length; i++) {
			var a = e[i];
			if (a.type === t && a.listener === n && zp(a.optionsOrUseCapture) === r) return i;
		}
		return -1;
	}
	Fp.prototype.dispatchEvent = function(e) {
		var t = g(this._fragmentFiber);
		if (t === null) return !0;
		t = b(t);
		var n = this._eventListeners;
		if (n !== null && 0 < n.length || !e.bubbles) {
			var r = t.nodeType === 9 ? t.createComment("") : document.createTextNode("");
			if (n) for (var i = 0; i < n.length; i++) {
				var a = n[i];
				r.addEventListener(a.type, a.attachedListener, Rp(a.optionsOrUseCapture));
			}
			if (t.appendChild(r), e = r.dispatchEvent(e), n) for (i = 0; i < n.length; i++) a = n[i], r.removeEventListener(a.type, a.attachedListener, Rp(a.optionsOrUseCapture));
			return t.removeChild(r), e;
		}
		return t.dispatchEvent(e);
	}, Fp.prototype.focus = function(e) {
		h(this._fragmentFiber.child, !0, Vp, e, void 0, void 0);
	};
	function Vp(e, t) {
		return e.tag !== 6 && (e = b(e), pm(e, t));
	}
	Fp.prototype.focusLast = function(e) {
		var t = [];
		h(this._fragmentFiber.child, !0, Hp, t, void 0, void 0);
		for (var n = t.length - 1; 0 <= n && !Vp(t[n], e); n--);
	};
	function Hp(e, t) {
		return t.push(e), !1;
	}
	Fp.prototype.blur = function() {
		var e = g(this._fragmentFiber);
		e !== null && (e = b(e), e = lp(e).activeElement, e !== null && h(this._fragmentFiber.child, !1, Up, e, void 0, void 0));
	};
	function Up(e, t) {
		return e.tag !== 6 && (e = b(e), e === t || e.contains(t) ? (t.blur(), !0) : !1);
	}
	Fp.prototype.observeUsing = function(e) {
		this._observers === null && (this._observers = /* @__PURE__ */ new Set()), this._observers.add(e), h(this._fragmentFiber.child, !1, Wp, e, void 0, void 0);
	};
	function Wp(e, t) {
		return e.tag !== 6 && (e = b(e), t.observe(e), !1);
	}
	Fp.prototype.unobserveUsing = function(e) {
		var t = this._observers;
		if (t !== null && t.has(e)) {
			t.delete(e), h(this._fragmentFiber.child, !1, Gp, e, void 0, void 0);
			for (var n = t = 0; n < Kp.length; n++) {
				var r = Kp[n];
				r.fragmentInstance === this && r.observer === e ? e.unobserve(r.instance) : Kp[t++] = r;
			}
			Kp.length = t;
		}
	};
	function Gp(e, t) {
		return e.tag !== 6 && (e = b(e), t.unobserve(e), !1);
	}
	var Kp = [], qp = !1;
	function Jp(e, t, n) {
		Kp.push({
			fragmentInstance: e,
			observer: t,
			instance: n
		}), qp || (qp = !0, mm(function() {
			qp = !1;
			var e = Kp;
			Kp = [];
			for (var t = 0; t < e.length; t++) {
				var n = e[t];
				n.observer.unobserve(n.instance);
			}
		}));
	}
	Fp.prototype.getClientRects = function() {
		var e = [];
		return h(this._fragmentFiber.child, !1, Yp, e, void 0, void 0), e;
	};
	function Yp(e, t) {
		if (e.tag === 6) {
			e = e.stateNode;
			var n = e.ownerDocument.createRange();
			n.selectNodeContents(e), t.push.apply(t, n.getClientRects());
		} else e = b(e), t.push.apply(t, e.getClientRects());
		return !1;
	}
	Fp.prototype.getRootNode = function(e) {
		var t = g(this._fragmentFiber);
		return t === null ? this : b(t).getRootNode(e);
	}, Fp.prototype.compareDocumentPosition = function(e) {
		var t = g(this._fragmentFiber);
		if (t === null) return Node.DOCUMENT_POSITION_DISCONNECTED;
		var n = [];
		h(this._fragmentFiber.child, !1, Hp, n, void 0, void 0);
		var r = b(t);
		if (n.length === 0) {
			if (n = r, _(this._fragmentFiber)) {
				a: {
					for (t = this._fragmentFiber.return; t !== null;) {
						if (t.tag === 4) {
							t = t.stateNode.containerInfo;
							break a;
						}
						if (t.tag === 3 || t.tag === 5 || t.tag === 27) break;
						t = t.return;
					}
					t = null;
				}
				t != null && (n = t);
			}
			t = this._fragmentFiber;
			var i = r = n.compareDocumentPosition(e);
			return n === e ? i = Node.DOCUMENT_POSITION_CONTAINS : r & Node.DOCUMENT_POSITION_CONTAINED_BY && (n = v(t)[1], n === null ? i = Node.DOCUMENT_POSITION_PRECEDING : (e = b(n).compareDocumentPosition(e), i = e === 0 || e & Node.DOCUMENT_POSITION_FOLLOWING ? Node.DOCUMENT_POSITION_FOLLOWING : Node.DOCUMENT_POSITION_PRECEDING)), i |= Node.DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC;
		}
		t = b(n[0]), i = b(n[n.length - 1]);
		var a = _(this._fragmentFiber) ? t.parentElement : r;
		if (a == null) return Node.DOCUMENT_POSITION_DISCONNECTED;
		r = a.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_CONTAINED_BY, a = a.compareDocumentPosition(i) & Node.DOCUMENT_POSITION_CONTAINED_BY;
		var o = t.compareDocumentPosition(e), s = i.compareDocumentPosition(e), c = o & Node.DOCUMENT_POSITION_CONTAINED_BY || s & Node.DOCUMENT_POSITION_CONTAINED_BY;
		return s = r && a && o & Node.DOCUMENT_POSITION_FOLLOWING && s & Node.DOCUMENT_POSITION_PRECEDING, t = r && t === e || a && i === e || c || s ? Node.DOCUMENT_POSITION_CONTAINED_BY : !r && t === e || !a && i === e ? Node.DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC : o, t & Node.DOCUMENT_POSITION_DISCONNECTED || t & Node.DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC || Xp(t, this._fragmentFiber, n[0], n[n.length - 1], e) ? t : Node.DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC;
	};
	function Xp(e, t, n, r, i) {
		var a = Bt(i);
		if (e & Node.DOCUMENT_POSITION_CONTAINED_BY) {
			if (n = !!a) a: {
				for (; a !== null;) {
					if (a.tag === 7 && (a === t || a.alternate === t)) {
						n = !0;
						break a;
					}
					a = a.return;
				}
				n = !1;
			}
			return n;
		}
		if (e & Node.DOCUMENT_POSITION_CONTAINS) {
			if (a === null) return a = i.ownerDocument, i === a || i === a.documentElement || i === a.body;
			a: {
				for (a = t, t = g(t); a !== null;) {
					if (!(a.tag !== 5 && a.tag !== 3 && a.tag !== 27 || a !== t && a.alternate !== t)) {
						a = !0;
						break a;
					}
					a = a.return;
				}
				a = !1;
			}
			return a;
		}
		return e & Node.DOCUMENT_POSITION_PRECEDING ? ((t = !!a) && !(t = a === n) && (t = re(n, a, S), t === null ? t = !1 : (h(t, !0, te, a, n), a = ee, ee = null, t = a !== null)), t) : e & Node.DOCUMENT_POSITION_FOLLOWING ? ((t = !!a) && !(t = a === r) && (t = re(r, a, S), t === null ? t = !1 : (h(t, !0, ne, a, r), a = ee, x = ee = null, t = a !== null)), t) : !1;
	}
	function Zp(e, t) {
		var n = e.ownerDocument.createRange();
		n.selectNodeContents(e), e = n.getBoundingClientRect(), window.scrollTo(window.scrollX + e.left, t ? window.scrollY + e.top : window.scrollY + e.bottom - window.innerHeight);
	}
	Fp.prototype.scrollIntoView = function(e) {
		if (typeof e == "object") throw Error(i(566));
		var t = [];
		h(this._fragmentFiber.child, !1, Hp, t, void 0, void 0);
		var n = !1 !== e;
		if (t.length === 0) {
			var r = v(this._fragmentFiber);
			if (r = n ? r[1] || r[0] || g(this._fragmentFiber) : r[0] || r[1], r === null) return;
			if (r.tag === 6) {
				e = b(r), Zp(e, n);
				return;
			}
			if (r = b(r), r.nodeType !== 9) {
				if (r.nodeType === 11) {
					n = "host" in r ? r.host : null, n !== null && n.scrollIntoView(e);
					return;
				}
				r.scrollIntoView(e);
			}
		}
		for (r = n ? t.length - 1 : 0; r !== (n ? -1 : t.length);) {
			var a = t[r];
			a.tag === 6 ? (a = b(a), Zp(a, n)) : b(a).scrollIntoView(e), r += n ? -1 : 1;
		}
	};
	function Qp(e, t) {
		return e = b(e), $p(e, t), !1;
	}
	function $p(e, t) {
		e.reactFragments ??= /* @__PURE__ */ new Set(), e.reactFragments.add(t);
	}
	function em(e, t) {
		var n = t._eventListeners;
		if (n !== null) for (var r = 0; r < n.length; r++) {
			var i = n[r];
			e.addEventListener(i.type, i.attachedListener, Rp(i.optionsOrUseCapture));
		}
		e.nodeType !== 3 && (n = t._observers, n !== null && n.forEach(function(n) {
			for (var r = 0, i = 0; i < Kp.length; i++) {
				var a = Kp[i];
				(a.fragmentInstance !== t || a.observer !== n || a.instance !== e) && (Kp[r++] = a);
			}
			Kp.length = r, n.observe(e);
		}), $p(e, t));
	}
	function tm(e, t) {
		var n = t._eventListeners;
		if (n !== null) for (var r = 0; r < n.length; r++) {
			var i = n[r];
			e.removeEventListener(i.type, i.attachedListener, Rp(i.optionsOrUseCapture));
		}
		e.nodeType !== 3 && (n = t._observers, n !== null && n.forEach(function(n) {
			typeof n.rootMargin == "string" ? Jp(t, n, e) : n.unobserve(e);
		}), e.reactFragments != null && e.reactFragments.delete(t));
	}
	function nm(e) {
		var t = e.firstChild;
		for (t && t.nodeType === 10 && (t = t.nextSibling); t;) {
			var n = t;
			switch (t = t.nextSibling, n.nodeName) {
				case "HTML":
				case "HEAD":
				case "BODY":
					nm(n), zt(n);
					continue;
				case "SCRIPT":
				case "STYLE": continue;
				case "LINK": if (n.rel.toLowerCase() === "stylesheet") continue;
			}
			e.removeChild(n);
		}
	}
	function rm(e, t, n, r) {
		for (; e.nodeType === 1;) {
			var i = n;
			if (e.nodeName.toLowerCase() !== t.toLowerCase()) {
				if (!r && (e.nodeName !== "INPUT" || e.type !== "hidden")) break;
			} else if (!r) {
				if (t === "input" && e.type === "hidden") {
					var a = i.name == null ? null : "" + i.name;
					if (i.type === "hidden" && e.getAttribute("name") === a) return e;
				} else return e;
			} else if (!e[Lt]) switch (t) {
				case "meta":
					if (!e.hasAttribute("itemprop")) break;
					return e;
				case "link":
					if (a = e.getAttribute("rel"), a === "stylesheet" && e.hasAttribute("data-precedence") || a !== i.rel || e.getAttribute("href") !== (i.href == null || i.href === "" ? null : i.href) || e.getAttribute("crossorigin") !== (i.crossOrigin == null ? null : i.crossOrigin) || e.getAttribute("title") !== (i.title == null ? null : i.title)) break;
					return e;
				case "style":
					if (e.hasAttribute("data-precedence")) break;
					return e;
				case "script":
					if (a = e.getAttribute("src"), (a !== (i.src == null ? null : i.src) || e.getAttribute("type") !== (i.type == null ? null : i.type) || e.getAttribute("crossorigin") !== (i.crossOrigin == null ? null : i.crossOrigin)) && a && e.hasAttribute("async") && !e.hasAttribute("itemprop")) break;
					return e;
				default: return e;
			}
			if (e = lm(e.nextSibling), e === null) break;
		}
		return null;
	}
	function im(e, t, n) {
		if (t === "") return null;
		for (; e.nodeType !== 3;) if ((e.nodeType !== 1 || e.nodeName !== "INPUT" || e.type !== "hidden") && !n || (e = lm(e.nextSibling), e === null)) return null;
		return e;
	}
	function am(e, t) {
		for (; e.nodeType !== 8;) if ((e.nodeType !== 1 || e.nodeName !== "INPUT" || e.type !== "hidden") && !t || (e = lm(e.nextSibling), e === null)) return null;
		return e;
	}
	function om(e) {
		return e.data === "$?" || e.data === "$~";
	}
	function sm(e) {
		return e.data === "$!" || e.data === "$?" && e.ownerDocument.readyState !== "loading";
	}
	function cm(e, t) {
		var n = e.ownerDocument;
		if (e.data === "$~") e._reactRetry = t;
		else if (e.data !== "$?" || n.readyState !== "loading") t();
		else {
			var r = function() {
				t(), n.removeEventListener("DOMContentLoaded", r);
			};
			n.addEventListener("DOMContentLoaded", r), e._reactRetry = r;
		}
	}
	function lm(e) {
		for (; e != null; e = e.nextSibling) {
			var t = e.nodeType;
			if (t === 1 || t === 3) break;
			if (t === 8) {
				if (t = e.data, t === "$" || t === "$!" || t === "$?" || t === "$~" || t === "&" || t === "F!" || t === "F") break;
				if (t === "/$" || t === "/&") return null;
			}
		}
		return e;
	}
	var um = null;
	function dm(e) {
		e = e.nextSibling;
		for (var t = 0; e;) {
			if (e.nodeType === 8) {
				var n = e.data;
				if (n === "/$" || n === "/&") {
					if (t === 0) return lm(e.nextSibling);
					t--;
				} else n !== "$" && n !== "$!" && n !== "$?" && n !== "$~" && n !== "&" || t++;
			}
			e = e.nextSibling;
		}
		return null;
	}
	function fm(e) {
		e = e.previousSibling;
		for (var t = 0; e;) {
			if (e.nodeType === 8) {
				var n = e.data;
				if (n === "$" || n === "$!" || n === "$?" || n === "$~" || n === "&") {
					if (t === 0) return e;
					t--;
				} else n !== "/$" && n !== "/&" || t++;
			}
			e = e.previousSibling;
		}
		return null;
	}
	function pm(e, t) {
		function n() {
			r = !0;
		}
		if (e.ownerDocument.activeElement === e) return !0;
		var r = !1;
		try {
			e.ownerDocument.addEventListener("focus", n, !0), (e.focus || HTMLElement.prototype.focus).call(e, t);
		} finally {
			e.ownerDocument.removeEventListener("focus", n, !0);
		}
		return r;
	}
	function mm(e) {
		yp(function() {
			yp(function(t) {
				return e(t);
			});
		});
	}
	function hm(e, t, n) {
		switch (t = lp(n), e) {
			case "html":
				if (e = t.documentElement, !e) throw Error(i(452));
				return e;
			case "head":
				if (e = t.head, !e) throw Error(i(453));
				return e;
			case "body":
				if (e = t.body, !e) throw Error(i(454));
				return e;
			default: throw Error(i(451));
		}
	}
	function gm(e, t, n) {
		for (var r in n) {
			var i = n[r];
			n.hasOwnProperty(r) && i != null && $(e, t, r, null, rp, i);
		}
		n.dangerouslySetInnerHTML != null && (e.textContent = ""), e.onclick === En && (e.onclick = null), zt(e);
	}
	function _m(e) {
		for (var t = e.attributes; t.length;) e.removeAttributeNode(t[0]);
		zt(e);
	}
	var vm = /* @__PURE__ */ new Map(), ym = /* @__PURE__ */ new Set();
	function bm(e) {
		if (typeof e.getRootNode == "function") {
			var t = e.getRootNode();
			if (t.nodeType === 9 || t.nodeType === 11) return t;
		}
		return e.nodeType === 9 ? e : e.ownerDocument;
	}
	var xm = D.d;
	D.d = {
		f: Sm,
		r: Cm,
		D: Em,
		C: Dm,
		L: Om,
		m: km,
		X: jm,
		S: Am,
		M: Mm
	};
	function Sm() {
		var e = xm.f(), t = zd();
		return e || t;
	}
	function Cm(e) {
		var t = Vt(e);
		t !== null && t.tag === 5 && t.type === "form" ? oc(t) : xm.r(e);
	}
	var wm = typeof document > "u" ? null : document;
	function Tm(e, t, n) {
		var r = wm;
		if (r && typeof t == "string" && t) {
			var i = dn(t);
			i = "link[rel=\"" + e + "\"][href=\"" + i + "\"]", typeof n == "string" && (i += "[crossorigin=\"" + n + "\"]"), ym.has(i) || (ym.add(i), e = {
				rel: e,
				crossOrigin: n,
				href: t
			}, r.querySelector(i) === null && (t = r.createElement("link"), np(t, "link", e), Wt(t), r.head.appendChild(t)));
		}
	}
	function Em(e) {
		xm.D(e), Tm("dns-prefetch", e, null);
	}
	function Dm(e, t) {
		xm.C(e, t), Tm("preconnect", e, t);
	}
	function Om(e, t, n) {
		xm.L(e, t, n);
		var r = wm;
		if (r && e && t) {
			var i = "link[rel=\"preload\"][as=\"" + dn(t) + "\"]";
			t === "image" && n && n.imageSrcSet ? (i += "[imagesrcset=\"" + dn(n.imageSrcSet) + "\"]", typeof n.imageSizes == "string" && (i += "[imagesizes=\"" + dn(n.imageSizes) + "\"]")) : i += "[href=\"" + dn(e) + "\"]";
			var a = i;
			switch (t) {
				case "style":
					a = Pm(e);
					break;
				case "script": a = Rm(e);
			}
			if (!(vm.has(a) || (e = C({
				rel: "preload",
				href: t === "image" && n && n.imageSrcSet ? void 0 : e,
				as: t
			}, n), vm.set(a, e), r.querySelector(i) !== null || t === "style" && r.querySelector(Fm(a)) || t === "script" && r.querySelector(zm(a))))) {
				var o = r.createElement("link");
				np(o, "link", e), t === "style" && (o[Rt] = !0, o.onload = o.onerror = function() {
					Gt(o);
				}), Wt(o), r.head.appendChild(o);
			}
		}
	}
	function km(e, t) {
		xm.m(e, t);
		var n = wm;
		if (n && e) {
			var r = t && typeof t.as == "string" ? t.as : "script", i = "link[rel=\"modulepreload\"][as=\"" + dn(r) + "\"][href=\"" + dn(e) + "\"]", a = i;
			switch (r) {
				case "audioworklet":
				case "paintworklet":
				case "serviceworker":
				case "sharedworker":
				case "worker":
				case "script": a = Rm(e);
			}
			if (!vm.has(a) && (e = C({
				rel: "modulepreload",
				href: e
			}, t), vm.set(a, e), n.querySelector(i) === null)) {
				switch (r) {
					case "audioworklet":
					case "paintworklet":
					case "serviceworker":
					case "sharedworker":
					case "worker":
					case "script": if (n.querySelector(zm(a))) return;
				}
				r = n.createElement("link"), np(r, "link", e), Wt(r), n.head.appendChild(r);
			}
		}
	}
	function Am(e, t, n) {
		xm.S(e, t, n);
		var r = wm;
		if (r && e) {
			var i = Ut(r).hoistableStyles, a = Pm(e);
			t ||= "default";
			var o = i.get(a);
			if (!o) {
				var s = {
					loading: 0,
					preload: null
				};
				if (o = r.querySelector(Fm(a))) s.loading = 5;
				else {
					e = C({
						rel: "stylesheet",
						href: e,
						"data-precedence": t
					}, n), (n = vm.get(a)) && Hm(e, n);
					var c = o = r.createElement("link");
					Wt(c), np(c, "link", e), c._p = new Promise(function(e, t) {
						c.onload = e, c.onerror = t;
					}), c.addEventListener("load", function() {
						s.loading |= 1;
					}), c.addEventListener("error", function() {
						s.loading |= 2;
					}), s.loading |= 4, Vm(o, t, r);
				}
				o = {
					type: "stylesheet",
					instance: o,
					count: 1,
					state: s
				}, i.set(a, o);
			}
		}
	}
	function jm(e, t) {
		xm.X(e, t);
		var n = wm;
		if (n && e) {
			var r = Ut(n).hoistableScripts, i = Rm(e), a = r.get(i);
			a || (a = n.querySelector(zm(i)), a || (e = C({
				src: e,
				async: !0
			}, t), (t = vm.get(i)) && Um(e, t), a = n.createElement("script"), Wt(a), np(a, "link", e), n.head.appendChild(a)), a = {
				type: "script",
				instance: a,
				count: 1,
				state: null
			}, r.set(i, a));
		}
	}
	function Mm(e, t) {
		xm.M(e, t);
		var n = wm;
		if (n && e) {
			var r = Ut(n).hoistableScripts, i = Rm(e), a = r.get(i);
			a || (a = n.querySelector(zm(i)), a || (e = C({
				src: e,
				async: !0,
				type: "module"
			}, t), (t = vm.get(i)) && Um(e, t), a = n.createElement("script"), Wt(a), np(a, "link", e), n.head.appendChild(a)), a = {
				type: "script",
				instance: a,
				count: 1,
				state: null
			}, r.set(i, a));
		}
	}
	function Nm(e, t, n, r) {
		var a = (a = je.current) ? bm(a) : null;
		if (!a) throw Error(i(446));
		switch (e) {
			case "meta":
			case "title": return null;
			case "style": return typeof n.precedence == "string" && typeof n.href == "string" ? (n = Pm(n.href), t = Ut(a).hoistableStyles, r = t.get(n), r || (r = {
				type: "style",
				instance: null,
				count: 0,
				state: null
			}, t.set(n, r)), r) : {
				type: "void",
				instance: null,
				count: 0,
				state: null
			};
			case "link":
				if (n.rel === "stylesheet" && typeof n.href == "string" && typeof n.precedence == "string") {
					e = Pm(n.href);
					var o = Ut(a).hoistableStyles, s = o.get(e);
					if (s || (a = a.ownerDocument || a, s = {
						type: "stylesheet",
						instance: null,
						count: 0,
						state: {
							loading: 0,
							preload: null
						}
					}, o.set(e, s), (o = a.querySelector(Fm(e))) ? o._p || (s.instance = o, s.state.loading = 5) : (o = vm.get(e), o || (o = {
						rel: "preload",
						as: "style",
						href: n.href,
						crossOrigin: n.crossOrigin,
						integrity: n.integrity,
						media: n.media,
						hrefLang: n.hrefLang,
						referrerPolicy: n.referrerPolicy
					}, vm.set(e, o)), Lm(a, e, o, s.state))), t && r === null) throw Error(i(528, ""));
					return s;
				}
				if (t && r !== null) throw Error(i(529, ""));
				return null;
			case "script": return t = n.async, n = n.src, typeof n == "string" && t && typeof t != "function" && typeof t != "symbol" ? (n = Rm(n), t = Ut(a).hoistableScripts, r = t.get(n), r || (r = {
				type: "script",
				instance: null,
				count: 0,
				state: null
			}, t.set(n, r)), r) : {
				type: "void",
				instance: null,
				count: 0,
				state: null
			};
			default: throw Error(i(444, e));
		}
	}
	function Pm(e) {
		return "href=\"" + dn(e) + "\"";
	}
	function Fm(e) {
		return "link[rel=\"stylesheet\"][" + e + "]";
	}
	function Im(e) {
		return C({}, e, {
			"data-precedence": e.precedence,
			precedence: null
		});
	}
	function Lm(e, t, n, r) {
		if (t = e.querySelector("link[rel=\"preload\"][as=\"style\"][" + t + "]")) {
			if (!0 !== t[Rt]) {
				r.loading = 1;
				return;
			}
		} else t = e.createElement("link"), t[Rt] = !0, t.onload = t.onerror = Gt.bind(null, t), np(t, "link", n), Wt(t), e.head.appendChild(t);
		r.preload = t, t.addEventListener("load", function() {
			return r.loading |= 1;
		}), t.addEventListener("error", function() {
			return r.loading |= 2;
		});
	}
	function Rm(e) {
		return "[src=\"" + dn(e) + "\"]";
	}
	function zm(e) {
		return "script[async]" + e;
	}
	function Bm(e, t, n) {
		if (t.count++, t.instance === null) switch (t.type) {
			case "style":
				var r = e.querySelector("style[data-href~=\"" + dn(n.href) + "\"]");
				if (r) return t.instance = r, Wt(r), r;
				var a = C({}, n, {
					"data-href": n.href,
					"data-precedence": n.precedence,
					href: null,
					precedence: null
				});
				return r = (e.ownerDocument || e).createElement("style"), Wt(r), np(r, "style", a), Vm(r, n.precedence, e), t.instance = r;
			case "stylesheet":
				a = Pm(n.href);
				var o = e.querySelector(Fm(a));
				if (o) return t.state.loading |= 4, t.instance = o, Wt(o), o;
				r = Im(n), (a = vm.get(a)) && Hm(r, a), o = (e.ownerDocument || e).createElement("link"), Wt(o);
				var s = o;
				return s._p = new Promise(function(e, t) {
					s.onload = e, s.onerror = t;
				}), np(o, "link", r), t.state.loading |= 4, Vm(o, n.precedence, e), t.instance = o;
			case "script": return o = Rm(n.src), (a = e.querySelector(zm(o))) ? (t.instance = a, Wt(a), a) : (r = n, (a = vm.get(o)) && (r = C({}, n), Um(r, a)), e = e.ownerDocument || e, a = e.createElement("script"), Wt(a), np(a, "link", r), e.head.appendChild(a), t.instance = a);
			case "void": return null;
			default: throw Error(i(443, t.type));
		}
		else t.type === "stylesheet" && !(t.state.loading & 4) && (r = t.instance, t.state.loading |= 4, Vm(r, n.precedence, e));
		return t.instance;
	}
	function Vm(e, t, n) {
		for (var r = n.querySelectorAll("link[rel=\"stylesheet\"][data-precedence],style[data-precedence]"), i = r.length ? r[r.length - 1] : null, a = i, o = 0; o < r.length; o++) {
			var s = r[o];
			if (s.dataset.precedence === t) a = s;
			else if (a !== i) break;
		}
		a ? a.parentNode.insertBefore(e, a.nextSibling) : (t = n.nodeType === 9 ? n.head : n, t.insertBefore(e, t.firstChild));
	}
	function Hm(e, t) {
		e.crossOrigin ??= t.crossOrigin, e.referrerPolicy ??= t.referrerPolicy, e.title ??= t.title;
	}
	function Um(e, t) {
		e.crossOrigin ??= t.crossOrigin, e.referrerPolicy ??= t.referrerPolicy, e.integrity ??= t.integrity;
	}
	var Wm = null;
	function Gm(e, t, n) {
		if (Wm === null) {
			var r = /* @__PURE__ */ new Map(), i = Wm = /* @__PURE__ */ new Map();
			i.set(n, r);
		} else i = Wm, r = i.get(n), r || (r = /* @__PURE__ */ new Map(), i.set(n, r));
		if (r.has(e)) return r;
		for (r.set(e, null), n = n.getElementsByTagName(e), i = 0; i < n.length; i++) {
			var a = n[i];
			if (!(a[Lt] || a[At] || e === "link" && a.getAttribute("rel") === "stylesheet") && a.namespaceURI !== "http://www.w3.org/2000/svg") {
				var o = a.getAttribute(t) || "";
				o = e + o;
				var s = r.get(o);
				s ? s.push(a) : r.set(o, [a]);
			}
		}
		return r;
	}
	function Km(e, t, n) {
		e = e.ownerDocument || e, e.head.insertBefore(n, t === "title" ? e.querySelector("head > title") : null);
	}
	function qm(e, t, n) {
		if (n === 1 || t.itemProp != null) return !1;
		switch (e) {
			case "meta":
			case "title": return !0;
			case "style":
				if (typeof t.precedence != "string" || typeof t.href != "string" || t.href === "") break;
				return !0;
			case "link":
				if (typeof t.rel != "string" || typeof t.href != "string" || t.href === "" || t.onLoad || t.onError) break;
				switch (t.rel) {
					case "stylesheet": return e = t.disabled, typeof t.precedence == "string" && e == null;
					default: return !0;
				}
			case "script": if (t.async && typeof t.async != "function" && typeof t.async != "symbol" && !t.onLoad && !t.onError && t.src && typeof t.src == "string") return !0;
		}
		return !1;
	}
	function Jm(e, t) {
		return e === "img" && t.src != null && t.src !== "" && t.onLoad == null && t.loading !== "lazy";
	}
	function Ym(e) {
		return !(e.type === "stylesheet" && !(e.state.loading & 3));
	}
	function Xm(e) {
		return (e.width || 100) * (e.height || 100) * (typeof devicePixelRatio == "number" ? devicePixelRatio : 1) * .25;
	}
	function Zm(e, t) {
		typeof t.decode == "function" && (e.imgCount++, t.complete || (e.imgBytes += Xm(t), e.suspenseyImages.push(t)), e = rh.bind(e), t.decode().then(e, e));
	}
	function Qm(e, t, n, r) {
		if (n.type === "stylesheet" && (typeof r.media != "string" || !1 !== matchMedia(r.media).matches) && !(n.state.loading & 4)) {
			if (n.instance === null) {
				var i = Pm(r.href), a = t.querySelector(Fm(i));
				if (a) {
					t = a._p, typeof t == "object" && t && typeof t.then == "function" && (e.count++, e = nh.bind(e), t.then(e, e)), n.state.loading |= 4, n.instance = a, Wt(a);
					return;
				}
				a = t.ownerDocument || t, r = Im(r), (i = vm.get(i)) && Hm(r, i), a = a.createElement("link"), Wt(a);
				var o = a;
				o._p = new Promise(function(e, t) {
					o.onload = e, o.onerror = t;
				}), np(a, "link", r), n.instance = a;
			}
			e.stylesheets === null && (e.stylesheets = /* @__PURE__ */ new Map()), e.stylesheets.set(n, t), (t = n.state.preload) && !(n.state.loading & 3) && (e.count++, n = nh.bind(e), t.addEventListener("load", n), t.addEventListener("error", n));
		}
	}
	var $m = 0;
	function eh(e, t) {
		return e.stylesheets && e.count === 0 && ah(e, e.stylesheets), 0 < e.count || 0 < e.imgCount ? function(n) {
			var r = setTimeout(function() {
				if (e.stylesheets && ah(e, e.stylesheets), e.unsuspend) {
					var t = e.unsuspend;
					e.unsuspend = null, t();
				}
			}, 6e4 + t);
			0 < e.imgBytes && $m === 0 && ($m = 62500 * op());
			var i = setTimeout(function() {
				if (e.waitingForImages = !1, e.count === 0 && (e.stylesheets && ah(e, e.stylesheets), e.unsuspend)) {
					var t = e.unsuspend;
					e.unsuspend = null, t();
				}
			}, (e.imgBytes > $m ? 50 : 800) + t);
			return e.unsuspend = n, function() {
				e.unsuspend = null, clearTimeout(r), clearTimeout(i);
			};
		} : null;
	}
	function th(e) {
		if (e.count === 0 && (e.imgCount === 0 || !e.waitingForImages)) {
			if (e.stylesheets) ah(e, e.stylesheets);
			else if (e.unsuspend) {
				var t = e.unsuspend;
				e.unsuspend = null, t();
			}
		}
	}
	function nh() {
		this.count--, th(this);
	}
	function rh() {
		this.imgCount--, th(this);
	}
	var ih = null;
	function ah(e, t) {
		e.stylesheets = null, e.unsuspend !== null && (e.count++, ih = /* @__PURE__ */ new Map(), t.forEach(oh, e), ih = null, nh.call(e));
	}
	function oh(e, t) {
		if (!(t.state.loading & 4)) {
			var n = ih.get(e);
			if (n) var r = n.get(null);
			else {
				n = /* @__PURE__ */ new Map(), ih.set(e, n);
				for (var i = e.querySelectorAll("link[data-precedence],style[data-precedence]"), a = 0; a < i.length; a++) {
					var o = i[a];
					(o.nodeName === "LINK" || o.getAttribute("media") !== "not all") && (n.set(o.dataset.precedence, o), r = o);
				}
				r && n.set(null, r);
			}
			i = t.instance, o = i.getAttribute("data-precedence"), a = n.get(o) || r, a === r && n.set(null, i), n.set(o, i), this.count++, r = nh.bind(this), i.addEventListener("load", r), i.addEventListener("error", r), a ? a.parentNode.insertBefore(i, a.nextSibling) : (e = e.nodeType === 9 ? e.head : e, e.insertBefore(i, e.firstChild)), t.state.loading |= 4;
		}
	}
	var sh = {
		$$typeof: ue,
		Provider: null,
		Consumer: null,
		_currentValue: Te,
		_currentValue2: Te,
		_threadCount: 0
	};
	function ch(e, t, n, r, i, a, o, s, c) {
		this.tag = 1, this.containerInfo = e, this.pingCache = this.current = this.pendingChildren = null, this.timeoutHandle = -1, this.callbackNode = this.next = this.pendingContext = this.context = this.cancelPendingCommit = null, this.callbackPriority = 0, this.expirationTimes = yt(-1), this.entangledLanes = this.shellSuspendCounter = this.errorRecoveryDisabledLanes = this.expiredLanes = this.warmLanes = this.pingedLanes = this.suspendedLanes = this.pendingLanes = 0, this.entanglements = yt(0), this.hiddenUpdates = yt(null), this.identifierPrefix = r, this.onUncaughtError = i, this.onCaughtError = a, this.onRecoverableError = o, this.pooledCache = null, this.pooledCacheLanes = 0, this.formState = c, this.transitionTypes = null, this.incompleteTransitions = /* @__PURE__ */ new Map();
	}
	function lh(e, t, n, r, i, a, o, s, c, l, u, d) {
		return e = new ch(e, t, n, o, c, l, u, d, s), t = 1, !0 === a && (t |= 24), a = Bi(3, null, null, t), e.current = a, a.stateNode = e, t = Ra(), t.refCount++, e.pooledCache = t, t.refCount++, a.memoizedState = {
			element: r,
			isDehydrated: n,
			cache: t
		}, xo(a), e;
	}
	function uh(e) {
		return e ? (e = Ri, e) : Ri;
	}
	function dh(e, t, n, r, i, a) {
		i = uh(i), r.context === null ? r.context = i : r.pendingContext = i, r = Co(t), r.payload = { element: n }, a = a === void 0 ? null : a, a !== null && (r.callback = a), n = wo(e, r, t), n !== null && (Pd(n, e, t), To(n, e, t));
	}
	function fh(e, t) {
		if (e = e.memoizedState, e !== null && e.dehydrated !== null) {
			var n = e.retryLane;
			e.retryLane = n !== 0 && n < t ? n : t;
		}
	}
	function ph(e, t) {
		fh(e, t), (e = e.alternate) && fh(e, t);
	}
	function mh(e) {
		if (e.tag === 13 || e.tag === 31) {
			var t = Fi(e, 67108864);
			t !== null && Pd(t, e, 67108864), ph(e, 67108864);
		}
	}
	function hh(e) {
		if (e.tag === 13 || e.tag === 31) {
			var t = jd();
			t = Tt(t);
			var n = Fi(e, t);
			n !== null && Pd(n, e, t), ph(e, t);
		}
	}
	var gh = !0;
	function _h(e, t, n, r) {
		var i = E.T;
		E.T = null;
		var a = D.p;
		try {
			D.p = 2, yh(e, t, n, r);
		} finally {
			D.p = a, E.T = i;
		}
	}
	function vh(e, t, n, r) {
		var i = E.T;
		E.T = null;
		var a = D.p;
		try {
			D.p = 8, yh(e, t, n, r);
		} finally {
			D.p = a, E.T = i;
		}
	}
	function yh(e, t, n, r) {
		if (gh) {
			var i = bh(r);
			if (i === null) Kf(e, t, r, xh, n), Mh(e, r);
			else if (Ph(i, e, t, n, r)) r.stopPropagation();
			else if (Mh(e, r), t & 4 && -1 < jh.indexOf(e)) {
				for (; i !== null;) {
					var a = Vt(i);
					if (a !== null) switch (a.tag) {
						case 3:
							if (a = a.stateNode, a.current.memoizedState.isDehydrated) {
								var o = pt(a.pendingLanes);
								if (o !== 0) {
									var s = a;
									for (s.pendingLanes |= 2, s.entangledLanes |= 2; o;) {
										var c = 1 << 31 - ot(o);
										s.entanglements[1] |= c, o &= ~c;
									}
									Ef(a), !(W & 6) && (_d = A() + 500, Df(0, !1));
								}
							}
							break;
						case 31:
						case 13: s = Fi(a, 2), s !== null && Pd(s, a, 2), zd(), ph(a, 2);
					}
					if (a = bh(r), a === null && Kf(e, t, r, xh, n), a === i) break;
					i = a;
				}
				i !== null && r.stopPropagation();
			} else Kf(e, t, r, null, n);
		}
	}
	function bh(e) {
		return e = On(e), Sh(e);
	}
	var xh = null;
	function Sh(e) {
		if (xh = null, e = Bt(e), e !== null) {
			var t = o(e);
			if (t === null) e = null;
			else {
				var n = t.tag;
				if (n === 13) {
					if (e = s(t), e !== null) return e;
					e = null;
				} else if (n === 31) {
					if (e = c(t), e !== null) return e;
					e = null;
				} else if (n === 3) {
					if (t.stateNode.current.memoizedState.isDehydrated) return t.tag === 3 ? t.stateNode.containerInfo : null;
					e = null;
				} else t !== e && (e = null);
			}
		}
		return xh = e, null;
	}
	function Ch(e) {
		switch (e) {
			case "beforetoggle":
			case "cancel":
			case "click":
			case "close":
			case "contextmenu":
			case "copy":
			case "cut":
			case "auxclick":
			case "dblclick":
			case "dragend":
			case "dragstart":
			case "drop":
			case "focusin":
			case "focusout":
			case "input":
			case "invalid":
			case "keydown":
			case "keypress":
			case "keyup":
			case "mousedown":
			case "mouseup":
			case "paste":
			case "pause":
			case "play":
			case "pointercancel":
			case "pointerdown":
			case "pointerup":
			case "ratechange":
			case "reset":
			case "seeked":
			case "submit":
			case "toggle":
			case "touchcancel":
			case "touchend":
			case "touchstart":
			case "volumechange":
			case "change":
			case "selectionchange":
			case "textInput":
			case "compositionstart":
			case "compositionend":
			case "compositionupdate":
			case "beforeblur":
			case "afterblur":
			case "beforeinput":
			case "blur":
			case "fullscreenchange":
			case "fullscreenerror":
			case "focus":
			case "hashchange":
			case "popstate":
			case "select":
			case "selectstart": return 2;
			case "drag":
			case "dragenter":
			case "dragexit":
			case "dragleave":
			case "dragover":
			case "mousemove":
			case "mouseout":
			case "mouseover":
			case "pointermove":
			case "pointerout":
			case "pointerover":
			case "resize":
			case "scroll":
			case "touchmove":
			case "wheel":
			case "mouseenter":
			case "mouseleave":
			case "pointerenter":
			case "pointerleave": return 8;
			case "message": switch (Ye()) {
				case Xe: return 2;
				case Ze: return 8;
				case Qe:
				case $e: return 32;
				case et: return 268435456;
				default: return 32;
			}
			default: return 32;
		}
	}
	var wh = !1, Th = null, Eh = null, Dh = null, Oh = /* @__PURE__ */ new Map(), kh = /* @__PURE__ */ new Map(), Ah = [], jh = "mousedown mouseup touchcancel touchend touchstart auxclick dblclick pointercancel pointerdown pointerup dragend dragstart drop compositionend compositionstart keydown keypress keyup input textInput copy cut paste click change contextmenu reset".split(" ");
	function Mh(e, t) {
		switch (e) {
			case "focusin":
			case "focusout":
				Th = null;
				break;
			case "dragenter":
			case "dragleave":
				Eh = null;
				break;
			case "mouseover":
			case "mouseout":
				Dh = null;
				break;
			case "pointerover":
			case "pointerout":
				Oh.delete(t.pointerId);
				break;
			case "gotpointercapture":
			case "lostpointercapture": kh.delete(t.pointerId);
		}
	}
	function Nh(e, t, n, r, i, a) {
		return e === null || e.nativeEvent !== a ? (e = {
			blockedOn: t,
			domEventName: n,
			eventSystemFlags: r,
			nativeEvent: a,
			targetContainers: [i]
		}, t !== null && (t = Vt(t), t !== null && mh(t)), e) : (e.eventSystemFlags |= r, t = e.targetContainers, i !== null && t.indexOf(i) === -1 && t.push(i), e);
	}
	function Ph(e, t, n, r, i) {
		switch (t) {
			case "focusin": return Th = Nh(Th, e, t, n, r, i), !0;
			case "dragenter": return Eh = Nh(Eh, e, t, n, r, i), !0;
			case "mouseover": return Dh = Nh(Dh, e, t, n, r, i), !0;
			case "pointerover":
				var a = i.pointerId;
				return Oh.set(a, Nh(Oh.get(a) || null, e, t, n, r, i)), !0;
			case "gotpointercapture": return a = i.pointerId, kh.set(a, Nh(kh.get(a) || null, e, t, n, r, i)), !0;
		}
		return !1;
	}
	function Fh(e) {
		var t = Bt(e.target);
		if (t !== null) {
			var n = o(t);
			if (n !== null) {
				if (t = n.tag, t === 13) {
					if (t = s(n), t !== null) {
						e.blockedOn = t, Ot(e.priority, function() {
							hh(n);
						});
						return;
					}
				} else if (t === 31) {
					if (t = c(n), t !== null) {
						e.blockedOn = t, Ot(e.priority, function() {
							hh(n);
						});
						return;
					}
				} else if (t === 3 && n.stateNode.current.memoizedState.isDehydrated) {
					e.blockedOn = n.tag === 3 ? n.stateNode.containerInfo : null;
					return;
				}
			}
		}
		e.blockedOn = null;
	}
	function Ih(e) {
		if (e.blockedOn !== null) return !1;
		for (var t = e.targetContainers; 0 < t.length;) {
			var n = bh(e.nativeEvent);
			if (n === null) {
				n = e.nativeEvent;
				var r = new n.constructor(n.type, n);
				Dn = r, n.target.dispatchEvent(r), Dn = null;
			} else return t = Vt(n), t !== null && mh(t), e.blockedOn = n, !1;
			t.shift();
		}
		return !0;
	}
	function Lh(e, t, n) {
		Ih(e) && n.delete(t);
	}
	function Rh() {
		wh = !1, Th !== null && Ih(Th) && (Th = null), Eh !== null && Ih(Eh) && (Eh = null), Dh !== null && Ih(Dh) && (Dh = null), Oh.forEach(Lh), kh.forEach(Lh);
	}
	function zh(e, n) {
		e.blockedOn === n && (e.blockedOn = null, wh || (wh = !0, t.unstable_scheduleCallback(t.unstable_NormalPriority, Rh)));
	}
	var Bh = null;
	function Vh(e) {
		Bh !== e && (Bh = e, t.unstable_scheduleCallback(t.unstable_NormalPriority, function() {
			Bh === e && (Bh = null);
			for (var t = 0; t < e.length; t += 3) {
				var n = e[t], r = e[t + 1], i = e[t + 2];
				if (typeof r != "function") {
					if (Sh(r || n) === null) continue;
					break;
				}
				var a = Vt(n);
				a !== null && (e.splice(t, 3), t -= 3, ic(a, {
					pending: !0,
					data: i,
					method: n.method,
					action: r
				}, r, i));
			}
		}));
	}
	function Hh(e) {
		function t(t) {
			return zh(t, e);
		}
		Th !== null && zh(Th, e), Eh !== null && zh(Eh, e), Dh !== null && zh(Dh, e), Oh.forEach(t), kh.forEach(t);
		for (var n = 0; n < Ah.length; n++) {
			var r = Ah[n];
			r.blockedOn === e && (r.blockedOn = null);
		}
		for (; 0 < Ah.length && (n = Ah[0], n.blockedOn === null);) Fh(n), n.blockedOn === null && Ah.shift();
		if (n = (e.ownerDocument || e).$$reactFormReplay, n != null) for (r = 0; r < n.length; r += 3) {
			var i = n[r], a = n[r + 1], o = i[jt] || null;
			if (typeof a == "function") o || Vh(n);
			else if (o) {
				var s = null;
				if (a && a.hasAttribute("formAction")) {
					if (i = a, o = a[jt] || null) s = o.formAction;
					else if (Sh(i) !== null) continue;
				} else s = o.action;
				typeof s == "function" ? n[r + 1] = s : (n.splice(r, 3), r -= 3), Vh(n);
			}
		}
	}
	function Uh() {
		function e(e) {
			e.canIntercept && e.info === "react-transition" && e.intercept({
				handler: function() {
					return new Promise(function(e) {
						return i = e;
					});
				},
				focusReset: "manual",
				scroll: "manual"
			});
		}
		function t() {
			i !== null && (i(), i = null), r || setTimeout(n, 20);
		}
		function n() {
			if (!r && !navigation.transition) {
				var e = navigation.currentEntry;
				e && e.url != null && navigation.navigate(e.url, {
					state: e.getState(),
					info: "react-transition",
					history: "replace"
				});
			}
		}
		if (typeof navigation == "object") {
			var r = !1, i = null;
			return navigation.addEventListener("navigate", e), navigation.addEventListener("navigatesuccess", t), navigation.addEventListener("navigateerror", t), setTimeout(n, 100), function() {
				r = !0, navigation.removeEventListener("navigate", e), navigation.removeEventListener("navigatesuccess", t), navigation.removeEventListener("navigateerror", t), i !== null && (i(), i = null);
			};
		}
	}
	function Wh(e) {
		this._internalRoot = e;
	}
	Gh.prototype.render = Wh.prototype.render = function(e) {
		var t = this._internalRoot;
		if (t === null) throw Error(i(409));
		var n = t.current;
		dh(n, jd(), e, t, null, null);
	}, Gh.prototype.unmount = Wh.prototype.unmount = function() {
		var e = this._internalRoot;
		if (e !== null) {
			this._internalRoot = null;
			var t = e.containerInfo;
			dh(e.current, 2, null, e, null, null), zd(), t[Mt] = null;
		}
	};
	function Gh(e) {
		this._internalRoot = e;
	}
	Gh.prototype.unstable_scheduleHydration = function(e) {
		if (e) {
			var t = Dt();
			e = {
				blockedOn: null,
				target: e,
				priority: t
			};
			for (var n = 0; n < Ah.length && t !== 0 && t < Ah[n].priority; n++);
			Ah.splice(n, 0, e), n === 0 && Fh(e);
		}
	};
	var Kh = n.version;
	if (Kh !== "19.3.0") throw Error(i(527, Kh, "19.3.0"));
	D.findDOMNode = function(e) {
		var t = e._reactInternals;
		if (t === void 0) throw typeof e.render == "function" ? Error(i(188)) : (e = Object.keys(e).join(","), Error(i(268, e)));
		return e = d(t), e = e === null ? null : p(e), e = e === null ? null : e.stateNode, e;
	};
	var qh = {
		bundleType: 0,
		version: "19.3.0",
		rendererPackageName: "react-dom",
		currentDispatcherRef: E,
		reconcilerVersion: "19.3.0"
	};
	if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ < "u") {
		var Jh = __REACT_DEVTOOLS_GLOBAL_HOOK__;
		if (!Jh.isDisabled && Jh.supportsFiber) try {
			rt = Jh.inject(qh), it = Jh;
		} catch {}
	}
	e.createRoot = function(e, t) {
		if (!a(e)) throw Error(i(299));
		var n = !1, r = "", o = Dc, s = Oc, c = kc;
		return t != null && (!0 === t.unstable_strictMode && (n = !0), t.identifierPrefix !== void 0 && (r = t.identifierPrefix), t.onUncaughtError !== void 0 && (o = t.onUncaughtError), t.onCaughtError !== void 0 && (s = t.onCaughtError), t.onRecoverableError !== void 0 && (c = t.onRecoverableError)), t = lh(e, 1, !1, null, null, n, r, null, o, s, c, Uh), e[Mt] = t.current, Wf(e), new Wh(t);
	};
})), g = /* @__PURE__ */ o(((e, t) => {
	function n() {
		if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ < "u" && typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE == "function") try {
			__REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(n);
		} catch (e) {
			console.error(e);
		}
	}
	n(), t.exports = h();
})), _ = /* @__PURE__ */ new Map(), v = "visualize-widget-height:", y = (e) => {
	let t = String(e || "");
	if (!t) return "";
	let n = 2166136261;
	for (let e = 0; e < t.length; e += 1) n ^= t.charCodeAt(e), n = Math.imul(n, 16777619);
	return `${t.length}:${(n >>> 0).toString(36)}`;
}, b = (e) => {
	let t = String(e || "");
	if (!t) return null;
	let n = _.get(t);
	if (typeof n == "number" && Number.isFinite(n) && n > 0) return n;
	if (typeof window > "u" || !window.localStorage) return null;
	try {
		let e = Number(window.localStorage.getItem(`${v}${t}`));
		if (Number.isFinite(e) && e > 0) return _.set(t, e), e;
	} catch {
		return null;
	}
	return null;
}, ee = (e, t) => {
	let n = String(e || ""), r = Math.ceil(Number(t) || 0);
	if (!(!n || r <= 0) && (_.set(n, r), typeof window < "u" && window.localStorage)) try {
		window.localStorage.setItem(`${v}${n}`, String(r));
	} catch {}
}, x = (e) => {
	let t = "";
	for (let n = 0; n < e.length; n += 1) {
		let r = e[n];
		if (r !== "\\") {
			t += r;
			continue;
		}
		let i = e[n + 1];
		if (!i) break;
		if (n += 1, i === "n") t += "\n";
		else if (i === "r") t += "\r";
		else if (i === "t") t += "	";
		else if (i === "b") t += "\b";
		else if (i === "f") t += "\f";
		else if (i === "\"" || i === "\\" || i === "/") t += i;
		else if (i === "u") {
			let r = e.slice(n + 1, n + 5);
			if (/^[0-9a-fA-F]{4}$/.test(r)) t += String.fromCharCode(Number.parseInt(r, 16)), n += 4;
			else break;
		} else t += i;
	}
	return t;
}, te = (e, t) => {
	let n = String(e || ""), r = `"${t}"`, i = n.indexOf(r);
	if (i < 0) return "";
	let a = n.indexOf(":", i + r.length);
	if (a < 0) return "";
	let o = a + 1;
	for (; o < n.length && /\s/.test(n[o]);) o += 1;
	if (n[o] !== "\"") return "";
	let s = !1, c = "";
	for (let e = o + 1; e < n.length; e += 1) {
		let t = n[e];
		if (s) {
			c += `\\${t}`, s = !1;
			continue;
		}
		if (t === "\\") {
			s = !0;
			continue;
		}
		if (t === "\"") return x(c);
		c += t;
	}
	return s && (c += "\\"), x(c);
}, ne = (e, t) => {
	let n = String(e || ""), r = `"${t}"`, i = n.indexOf(r);
	if (i < 0) return [];
	let a = n.indexOf(":", i + r.length);
	if (a < 0) return [];
	let o = a + 1;
	for (; o < n.length && /\s/.test(n[o]);) o += 1;
	if (n[o] !== "[") return [];
	o += 1;
	let s = [];
	for (; o < n.length;) {
		for (; o < n.length && /[\s,]/.test(n[o]);) o += 1;
		if (n[o] === "]" || n[o] !== "\"") break;
		o += 1;
		let e = !1, t = "", r = !1;
		for (; o < n.length; o += 1) {
			let i = n[o];
			if (e) {
				t += `\\${i}`, e = !1;
				continue;
			}
			if (i === "\\") {
				e = !0;
				continue;
			}
			if (i === "\"") {
				r = !0, o += 1;
				break;
			}
			t += i;
		}
		e && (t += "\\");
		let i = x(t).trim();
		if (i && s.push(i), !r) break;
	}
	return s;
};
//#endregion
//#region ../../../Users/yunsa/.Trash/mentora-inline-fix-20261027-1826/mentora-inline-fix-20261027/node_modules/streamviz-react/src/core/completeStreamHtml.ts
function S(e) {
	let t = String(e || "");
	if (!t.includes("<")) return t;
	let n = t.toLowerCase(), r = [], i = /* @__PURE__ */ new Set([
		"area",
		"base",
		"br",
		"col",
		"embed",
		"hr",
		"img",
		"input",
		"link",
		"meta",
		"param",
		"source",
		"track",
		"wbr"
	]), a = 0, o = [], s = 0;
	for (; s < t.length;) {
		let e = r.at(-1), c = e && [
			"style",
			"script",
			"textarea",
			"title"
		].includes(e), l = c ? n.indexOf(`</${e}`, s) : t.indexOf("<", s);
		if (!c && (l < 0 || l > s) && (a = l < 0 ? t.length : l, o = [...r].reverse()), l < 0) break;
		if (t.startsWith("<!--", l)) {
			let e = t.indexOf("-->", l + 4);
			if (e < 0) break;
			s = e + 3;
			continue;
		}
		let u = l + 1, d = "";
		for (; u < t.length; u++) {
			let e = t[u];
			if (d) e === d && (d = "");
			else if (e === "\"" || e === "'") d = e;
			else if (e === ">") break;
		}
		if (u === t.length) break;
		let f = t.slice(l, u + 1), p = f.match(/^<\s*(\/?)\s*([a-z][\w:-]*)\b/i);
		if (s = u + 1, !p) continue;
		let m = p[2].toLowerCase();
		if (p[1]) {
			if (r.at(-1) !== m) continue;
			r.pop();
		} else if (!i.has(m) && !/\/\s*>$/.test(f) && (r.push(m), [
			"style",
			"script",
			"textarea",
			"title"
		].includes(m))) continue;
		a = s, o = [...r].reverse();
	}
	return a ? t.slice(0, a) + o.map((e) => `</${e}>`).join("") : "";
}
//#endregion
//#region ../../../Users/yunsa/.Trash/mentora-inline-fix-20261027-1826/mentora-inline-fix-20261027/node_modules/lucide-react/dist/esm/shared/src/utils/toKebabCase.mjs
var re = (e) => e?.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
//#endregion
//#region ../../../Users/yunsa/.Trash/mentora-inline-fix-20261027-1826/mentora-inline-fix-20261027/node_modules/lucide-react/dist/esm/shared/src/utils/toLucideIconData.mjs
function C(e, t, n = []) {
	if (t == null) throw Error("[lucide]: iconNode is required when icon name is used");
	return {
		name: re(e),
		size: 24,
		node: t,
		...n.length > 0 ? { aliases: n } : {}
	};
}
//#endregion
//#region ../../../Users/yunsa/.Trash/mentora-inline-fix-20261027-1826/mentora-inline-fix-20261027/node_modules/lucide-react/dist/esm/shared/src/utils/toCamelCase.mjs
var ie = (e) => {
	let t = "", n = !1;
	for (let r of e) {
		if (r === "-" || r === "_" || r <= " ") {
			n = t.length > 0;
			continue;
		}
		t.length === 0 ? t += r.toLowerCase() : t += n ? r.toUpperCase() : r, n = !1;
	}
	return t;
}, ae = (e) => {
	let t = ie(e);
	return t.charAt(0).toUpperCase() + t.slice(1);
}, oe = (...e) => e.filter((e, t, n) => !!e && e.trim() !== "" && n.indexOf(e) === t).join(" ").trim(), w = {
	xmlns: "http://www.w3.org/2000/svg",
	width: 24,
	height: 24,
	viewBox: "0 0 24 24",
	fill: "none",
	stroke: "currentColor",
	"stroke-width": 2,
	"stroke-linecap": "round",
	"stroke-linejoin": "round"
};
//#endregion
//#region ../../../Users/yunsa/.Trash/mentora-inline-fix-20261027-1826/mentora-inline-fix-20261027/node_modules/lucide-react/dist/esm/shared/src/build/buildLucideIconNode.mjs
function se(e) {
	return e != null;
}
function ce(e, t = {}) {
	let n = t.attributeNames ?? {}, r = (e) => n[e] ?? e, i = e.size ?? e.width ?? w.width, a = e.size ?? e.height ?? w.height, o = e.aliases?.filter((e) => typeof e == "string" && e.trim() !== "").map((e) => `lucide-${e}`) ?? [], s = [...e.name ? [`lucide-${e.name}`] : [], ...o], c = t.className?.split(" ").filter(Boolean) ?? [], l = t.includeDefaultClasses === !1 ? oe(...c) : oe("lucide", ...s, ...c), u = t.absoluteStrokeWidth ? Number(t.strokeWidth ?? w["stroke-width"]) * Number(e.size ?? e.width ?? w.width) / Number(t.size ?? t.width ?? w.width) : t.strokeWidth ?? w["stroke-width"];
	return [
		"svg",
		{
			...Object.entries(w).reduce((e, [t, n]) => (e[r(t)] = n, e), {}),
			..."color" in t && t.color && { [r("stroke")]: t.color },
			..."size" in t && se(t.size) && {
				[r("width")]: t.size,
				[r("height")]: t.size
			},
			..."width" in t && se(t.width) && { [r("width")]: t.width },
			..."height" in t && se(t.height) && { [r("height")]: t.height },
			[r("stroke-width")]: u,
			...l && { [r("class")]: l },
			[r("viewBox")]: `0 0 ${i} ${a}`,
			...t.hasA11yProp === !1 ? { [r("aria-hidden")]: "true" } : {},
			..."attributes" in t && t.attributes
		},
		e.node.map((e) => {
			let [n, i, a] = e, o = t.nonScalingStroke ? {
				[r("vector-effect")]: "non-scaling-stroke",
				...i
			} : i;
			return a ? [
				n,
				o,
				a
			] : [n, o];
		})
	];
}
//#endregion
//#region ../../../Users/yunsa/.Trash/mentora-inline-fix-20261027-1826/mentora-inline-fix-20261027/node_modules/lucide-react/dist/esm/shared/src/build/buildLucideIconForReact.mjs
function le(e, t = {}) {
	return ce(e, {
		...t,
		attributeNames: {
			...t.attributeNames,
			class: "className",
			"stroke-width": "strokeWidth",
			"stroke-linecap": "strokeLinecap",
			"stroke-linejoin": "strokeLinejoin",
			"vector-effect": "vectorEffect"
		}
	});
}
//#endregion
//#region ../../../Users/yunsa/.Trash/mentora-inline-fix-20261027-1826/mentora-inline-fix-20261027/node_modules/lucide-react/dist/esm/shared/src/utils/hasA11yProp.mjs
var ue = (e) => {
	for (let t in e) if (t.startsWith("aria-") || t === "role" || t === "title") return !0;
	return !1;
}, T = /* @__PURE__ */ c(u(), 1), de = (0, T.createContext)({}), fe = () => (0, T.useContext)(de), pe = (0, T.forwardRef)(({ color: e, size: t, width: n, height: r, strokeWidth: i, absoluteStrokeWidth: a, nonScalingStroke: o, className: s = "", children: c, iconNode: l = [], icon: u = {
	node: l,
	aliases: [],
	size: 24
}, ...d }, f) => {
	let { size: p = 24, strokeWidth: m = 2, absoluteStrokeWidth: h = !1, nonScalingStroke: g = !1, color: _ = "currentColor", className: v = "" } = fe() ?? {}, y = !!c || ue(d), [b, ee, x = []] = le(u, {
		color: e ?? _,
		width: n ?? t ?? p,
		height: r ?? t ?? p,
		strokeWidth: i ?? m,
		absoluteStrokeWidth: a ?? h,
		nonScalingStroke: o ?? g,
		className: oe(v, s),
		hasA11yProp: y,
		attributes: d
	});
	return (0, T.createElement)(b, {
		ref: f,
		...ee
	}, [...x.map(([e, t]) => (0, T.createElement)(e, t)), ...Array.isArray(c) ? c : [c]]);
});
//#endregion
//#region ../../../Users/yunsa/.Trash/mentora-inline-fix-20261027-1826/mentora-inline-fix-20261027/node_modules/lucide-react/dist/esm/createLucideIcon.mjs
function me(e, t = [], n = []) {
	let r = typeof e == "string" ? C(e, t, n) : e, i = (0, T.forwardRef)(({ className: e, ...t }, n) => (0, T.createElement)(pe, {
		ref: n,
		icon: r,
		className: e,
		...t
	}));
	return r.name && (i.displayName = ae(r.name)), i;
}
//#endregion
//#region ../../../Users/yunsa/.Trash/mentora-inline-fix-20261027-1826/mentora-inline-fix-20261027/node_modules/lucide-react/dist/esm/icons/check.mjs
var he = {
	name: "check",
	size: 24,
	node: [["path", {
		d: "M20 6 9 17l-5-5",
		key: "1gmf2c"
	}]]
};
he.node;
var ge = me(he), _e = {
	name: "code-xml",
	size: 24,
	node: [
		["path", {
			d: "m18 16 4-4-4-4",
			key: "1inbqp"
		}],
		["path", {
			d: "m6 8-4 4 4 4",
			key: "15zrgr"
		}],
		["path", {
			d: "m14.5 4-5 16",
			key: "e7oirm"
		}]
	],
	aliases: ["code-2"]
};
_e.node;
var ve = me(_e), ye = {
	name: "copy",
	size: 24,
	node: [["rect", {
		width: "14",
		height: "14",
		x: "8",
		y: "8",
		rx: "2",
		ry: "2",
		key: "17jyea"
	}], ["path", {
		d: "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2",
		key: "zix9uf"
	}]]
};
ye.node;
var be = me(ye), xe = {
	name: "download",
	size: 24,
	node: [
		["path", {
			d: "M12 15V3",
			key: "m9g1x1"
		}],
		["path", {
			d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4",
			key: "ih7n3h"
		}],
		["path", {
			d: "m7 10 5 5 5-5",
			key: "brsn70"
		}]
	]
};
xe.node;
var Se = me(xe), Ce = (e) => String(e || "visualize-widget").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "-").slice(0, 80) || "visualize-widget", we = (e, t) => {
	let n = String(e || "");
	return /<html[\s>]/i.test(n) ? n : [
		"<!doctype html>",
		"<html lang=\"zh-CN\">",
		"<head>",
		"<meta charset=\"utf-8\">",
		"<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">",
		`<title>${t.replace(/[<&>]/g, "") || "Visualize Widget"}</title>`,
		"</head>",
		"<body>",
		n,
		"</body>",
		"</html>"
	].join("\n");
}, E = (e, t) => {
	if (typeof document > "u" || typeof URL > "u") return;
	let n = URL.createObjectURL(new Blob([e], { type: "text/html;charset=utf-8" })), r = document.createElement("a");
	r.href = n, r.download = t, r.click(), URL.revokeObjectURL(n);
}, D = async (e, t) => {
	if (t) return !!await t(e);
	if (typeof ClipboardItem > "u") return !1;
	let n = await (await fetch(e)).blob();
	return await navigator.clipboard?.write([new ClipboardItem({ "image/png": n })]), !0;
}, Te = (e, t, n = Infinity) => Math.min(n, Math.max(t, Math.ceil(e))), Ee = (e, t) => {
	if (!t) return 48;
	let n = String(e || "");
	if (!n.trim()) return 48;
	let r = n.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<script[\s\S]*?<\/script>/gi, ""), i = r.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(), a = (r.match(/<(?:section|article|header|footer|div|p|li|tr|h[1-6])\b/gi) || []).length, o = (r.match(/<svg\b/gi) || []).length, s = (r.match(/<tr\b/gi) || []).length, c = (r.match(/<(?:button|input|select|textarea)\b/gi) || []).length, l = Math.ceil(i.length / 88) * 24, u = a * 10 + s * 24 + c * 20 + o * 192;
	return Te(96 + l + u, 176, 1280);
}, De = (e) => {
	let t = String(e || "").trim();
	if (!t) return !1;
	if (typeof DOMParser < "u") try {
		let e = new DOMParser().parseFromString(t, "text/html").body;
		return e ? (e.querySelectorAll("style,script,template,title,meta,link").forEach((e) => e.remove()), String(e.textContent || "").replace(/\s+/g, "").trim() ? !0 : !!e.querySelector("svg,canvas,img,picture,video,table,ul,ol,button,input,select,textarea,progress")) : !1;
	} catch {
		return !1;
	}
	return !!t.replace(/<head[\s\S]*?(?:<\/head>|$)/gi, "").replace(/<style[\s\S]*?(?:<\/style>|$)/gi, "").replace(/<script[\s\S]*?(?:<\/script>|$)/gi, "").replace(/<template[\s\S]*?(?:<\/template>|$)/gi, "").replace(/<title[\s\S]*?(?:<\/title>|$)/gi, "").replace(/<(?:meta|link)\b[^>]*>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, "").trim();
}, Oe = /* @__PURE__ */ "--sem-bg-page.--sem-bg-surface.--sem-bg-card.--sem-bg-muted.--sem-border-subtle.--sem-border-default.--sem-border-strong.--sem-text-primary.--sem-text-secondary.--sem-text-tertiary.--sem-accent-primary.--sem-status-info.--sem-status-success.--sem-status-warning.--sem-status-danger.--blue-9.--cyan-9.--green-9.--amber-9.--orange-9.--red-9.--violet-9.--pink-9.--shadow-lg.--text-sm.--font-sans.--font-mono.--spacing".split("."), O = {
	backgroundPage: [
		"--sv-bg-page",
		"--color-background-tertiary",
		"--sem-bg-page"
	],
	backgroundSurface: [
		"--sv-bg-surface",
		"--color-background-primary",
		"--sem-bg-surface"
	],
	backgroundElevated: [
		"--sv-bg-elevated",
		"--color-background-secondary",
		"--sem-bg-card"
	],
	backgroundMuted: [
		"--sv-bg-muted",
		"--color-background-muted",
		"--sem-bg-muted"
	],
	backgroundInfo: ["--sv-bg-info", "--color-background-info"],
	backgroundSuccess: ["--sv-bg-success", "--color-background-success"],
	backgroundWarning: ["--sv-bg-warning", "--color-background-warning"],
	backgroundDanger: ["--sv-bg-danger", "--color-background-danger"],
	textPrimary: [
		"--sv-text-primary",
		"--color-text-primary",
		"--sem-text-primary"
	],
	textSecondary: [
		"--sv-text-secondary",
		"--color-text-secondary",
		"--sem-text-secondary"
	],
	textMuted: [
		"--sv-text-muted",
		"--color-text-tertiary",
		"--sem-text-tertiary"
	],
	textInfo: ["--sv-text-info", "--color-text-info"],
	textSuccess: ["--sv-text-success", "--color-text-success"],
	textWarning: ["--sv-text-warning", "--color-text-warning"],
	textDanger: ["--sv-text-danger", "--color-text-danger"],
	borderSubtle: [
		"--sv-border-subtle",
		"--color-border-tertiary",
		"--sem-border-subtle"
	],
	borderDefault: [
		"--sv-border-default",
		"--color-border-secondary",
		"--sem-border-default"
	],
	borderStrong: [
		"--sv-border-strong",
		"--color-border-primary",
		"--sem-border-strong"
	],
	borderInfo: ["--sv-border-info", "--color-border-info"],
	borderSuccess: ["--sv-border-success", "--color-border-success"],
	borderWarning: ["--sv-border-warning", "--color-border-warning"],
	borderDanger: ["--sv-border-danger", "--color-border-danger"],
	accent: ["--sv-accent", "--sem-accent-primary"],
	statusInfo: ["--sv-status-info", "--sem-status-info"],
	statusSuccess: ["--sv-status-success", "--sem-status-success"],
	statusWarning: ["--sv-status-warning", "--sem-status-warning"],
	statusDanger: ["--sv-status-danger", "--sem-status-danger"],
	radiusMedium: ["--sv-radius-md", "--border-radius-md"],
	radiusLarge: ["--sv-radius-lg", "--border-radius-lg"],
	radiusExtraLarge: ["--sv-radius-xl", "--border-radius-xl"],
	fontSans: ["--sv-font-sans", "--font-sans"],
	fontSerif: ["--sv-font-serif", "--font-serif"],
	fontMono: ["--sv-font-mono", "--font-mono"]
}, k = (e) => {
	let t = String(e || "").trim();
	return !t || t.length > 512 || /[;{}<>]/.test(t) ? "" : t;
}, ke = (e) => e.match(/^var\(\s*(--[a-z0-9-]+)\s*\)$/i)?.[1] || "", Ae = (e) => {
	let t = e?.tokens;
	if (!t) return "";
	let n = [];
	return Object.entries(O).forEach(([e, r]) => {
		let i = k(t[e]);
		if (!i) return;
		let a = ke(i);
		r.forEach((e) => {
			e !== a && n.push(`${e}:${i};`);
		});
	}), t.chartSeries?.slice(0, 8).forEach((e, t) => {
		let r = k(e);
		if (!r) return;
		let i = ke(r);
		[`--sv-chart-series-${t + 1}`, `--chart-series-${t + 1}`].forEach((e) => {
			e !== i && n.push(`${e}:${r};`);
		});
	}), n.join("");
}, je = (e, t) => {
	let n = e?.mode;
	if (n === "light" || n === "dark") return n;
	let r = String(t?.() || document.documentElement.dataset.theme || "").trim();
	return r === "light" || r === "dark" ? r : window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}, Me = (e, t) => t.map((t) => {
	let n = e.getPropertyValue(t).trim();
	return n ? `${t}:${n};` : "";
}).join("");
//#endregion
//#region ../../../Users/yunsa/.Trash/mentora-inline-fix-20261027-1826/mentora-inline-fix-20261027/node_modules/streamviz-react/src/react/reconcileArtifactDom.ts
function Ne(e, t) {
	let n = (e, t) => {
		let r = Array.from(e.childNodes).filter((e) => !(e instanceof Element && e.hasAttribute("data-visualize-platform-normalize"))), i = Array.from(t.childNodes);
		i.forEach((t, i) => {
			let a = r[i];
			if (!(a && a.nodeType === t.nodeType && (!(a instanceof Element) || t instanceof Element && a.tagName === t.tagName && a.namespaceURI === t.namespaceURI))) {
				let n = t.cloneNode(!0);
				a ? e.replaceChild(n, a) : e.appendChild(n);
				return;
			}
			a instanceof Element && t instanceof Element ? (Array.from(a.attributes).forEach((e) => {
				!t.hasAttribute(e.name) && e.name !== "data-visualize-root" && a.removeAttribute(e.name);
			}), Array.from(t.attributes).forEach((e) => {
				a.getAttribute(e.name) !== e.value && a.setAttribute(e.name, e.value);
			}), n(a, t)) : a.nodeValue !== t.nodeValue && (a.nodeValue = t.nodeValue);
		}), r.slice(i.length).forEach((t) => e.removeChild(t));
	};
	n(e, t);
}
[
	":root{",
	"--color-background-primary:Canvas;",
	"--border-radius-md:0;",
	"}",
	".c-purple{}",
	".sr-only{}",
	".t,.ts,.th{}"
].join("");
//#endregion
//#region ../../../Users/yunsa/.Trash/mentora-inline-fix-20261027-1826/mentora-inline-fix-20261027/node_modules/streamviz-react/src/react/runtimeDocument.ts
var Pe = ":root,\n[data-theme=\"light\"] {\n  color-scheme: light;\n  --sv-slate-1: #fcfcfd;\n  --sv-slate-2: #f9f9fb;\n  --sv-slate-3: #f0f0f3;\n  --sv-slate-6: #d9d9e0;\n  --sv-slate-7: #cdced6;\n  --sv-slate-8: #b9bbc6;\n  --sv-slate-11: #60646c;\n  --sv-slate-12: #1c2024;\n  --sv-indigo-3: #edf2fe;\n  --sv-indigo-7: #abbdf9;\n  --sv-indigo-9: #3e63dd;\n  --sv-indigo-11: #3a5bc7;\n  --sv-jade-3: #e6f4ea;\n  --sv-jade-7: #92ceac;\n  --sv-jade-9: #29a383;\n  --sv-jade-11: #208368;\n  --sv-amber-3: #fff3d0;\n  --sv-amber-7: #e8c36a;\n  --sv-amber-9: #f5b31b;\n  --sv-amber-11: #915930;\n  --sv-red-3: #feebec;\n  --sv-red-7: #f3aeaf;\n  --sv-red-9: #e5484d;\n  --sv-red-11: #ce2c31;\n  --sv-bg-page: var(--sv-slate-3);\n  --sv-bg-surface: var(--sv-slate-1);\n  --sv-bg-elevated: var(--sv-slate-2);\n  --sv-bg-muted: var(--sv-slate-3);\n  --sv-bg-info: var(--sv-indigo-3);\n  --sv-bg-success: var(--sv-jade-3);\n  --sv-bg-warning: var(--sv-amber-3);\n  --sv-bg-danger: var(--sv-red-3);\n  --sv-text-primary: var(--sv-slate-12);\n  --sv-text-secondary: var(--sv-slate-11);\n  --sv-text-muted: #6f737c;\n  --sv-text-info: var(--sv-indigo-11);\n  --sv-text-success: var(--sv-jade-11);\n  --sv-text-warning: var(--sv-amber-11);\n  --sv-text-danger: var(--sv-red-11);\n  --sv-border-subtle: var(--sv-slate-6);\n  --sv-border-default: var(--sv-slate-7);\n  --sv-border-strong: var(--sv-slate-8);\n  --sv-border-info: var(--sv-indigo-7);\n  --sv-border-success: var(--sv-jade-7);\n  --sv-border-warning: var(--sv-amber-7);\n  --sv-border-danger: var(--sv-red-7);\n  --sv-accent: var(--sv-indigo-9);\n  --sv-status-info: var(--sv-indigo-9);\n  --sv-status-success: var(--sv-jade-9);\n  --sv-status-warning: var(--sv-amber-9);\n  --sv-status-danger: var(--sv-red-9);\n  --sv-radius-md: 8px;\n  --sv-radius-lg: 12px;\n  --sv-radius-xl: 16px;\n  --sv-space-1: 4px;\n  --sv-space-2: 8px;\n  --sv-space-3: 12px;\n  --sv-space-4: 16px;\n  --sv-space-5: 20px;\n  --sv-space-6: 24px;\n  --sv-font-sans: ui-sans-serif, system-ui, sans-serif;\n  --sv-font-serif: ui-serif, Georgia, Cambria, \"Times New Roman\", Times, serif;\n  --sv-font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;\n  --color-background-primary: var(--sv-bg-surface);\n  --color-background-secondary: var(--sv-bg-elevated);\n  --color-background-tertiary: var(--sv-bg-page);\n  --color-background-muted: var(--sv-bg-muted);\n  --color-background-info: var(--sv-bg-info);\n  --color-background-danger: var(--sv-bg-danger);\n  --color-background-success: var(--sv-bg-success);\n  --color-background-warning: var(--sv-bg-warning);\n  --color-text-primary: var(--sv-text-primary);\n  --color-text-secondary: var(--sv-text-secondary);\n  --color-text-tertiary: var(--sv-text-muted);\n  --color-text-info: var(--sv-text-info);\n  --color-text-danger: var(--sv-text-danger);\n  --color-text-success: var(--sv-text-success);\n  --color-text-warning: var(--sv-text-warning);\n  --color-border-primary: var(--sv-border-strong);\n  --color-border-secondary: var(--sv-border-default);\n  --color-border-tertiary: var(--sv-border-subtle);\n  --color-border-info: var(--sv-border-info);\n  --color-border-danger: var(--sv-border-danger);\n  --color-border-success: var(--sv-border-success);\n  --color-border-warning: var(--sv-border-warning);\n  --sem-bg-page: var(--sv-bg-page);\n  --sem-bg-surface: var(--sv-bg-surface);\n  --sem-bg-card: var(--sv-bg-elevated);\n  --sem-bg-muted: var(--sv-bg-muted);\n  --sem-border-subtle: var(--sv-border-subtle);\n  --sem-border-default: var(--sv-border-default);\n  --sem-border-strong: var(--sv-border-strong);\n  --sem-text-primary: var(--sv-text-primary);\n  --sem-text-secondary: var(--sv-text-secondary);\n  --sem-text-tertiary: var(--sv-text-muted);\n  --sem-accent-primary: var(--sv-accent);\n  --sem-status-info: var(--sv-status-info);\n  --sem-status-success: var(--sv-status-success);\n  --sem-status-warning: var(--sv-status-warning);\n  --sem-status-danger: var(--sv-status-danger);\n  --sv-chart-series-1: #3e63dd;\n  --sv-chart-series-2: #12a594;\n  --sv-chart-series-3: #8e4ec6;\n  --sv-chart-series-4: #e5484d;\n  --sv-chart-series-5: #f5b31b;\n  --sv-chart-series-6: #0090ff;\n  --sv-chart-series-7: #ab4aba;\n  --sv-chart-series-8: #46a758;\n  --chart-series-1: var(--sv-chart-series-1);\n  --chart-series-2: var(--sv-chart-series-2);\n  --chart-series-3: var(--sv-chart-series-3);\n  --chart-series-4: var(--sv-chart-series-4);\n  --chart-series-5: var(--sv-chart-series-5);\n  --chart-series-6: var(--sv-chart-series-6);\n  --chart-series-7: var(--sv-chart-series-7);\n  --chart-series-8: var(--sv-chart-series-8);\n  --border-radius-md: var(--sv-radius-md);\n  --border-radius-lg: var(--sv-radius-lg);\n  --border-radius-xl: var(--sv-radius-xl);\n  --font-sans: var(--sv-font-sans);\n  --font-serif: var(--sv-font-serif);\n  --font-mono: var(--sv-font-mono);\n}\n\n[data-theme=\"dark\"] {\n  color-scheme: dark;\n  --sv-slate-1: #111113;\n  --sv-slate-2: #18191b;\n  --sv-slate-3: #212225;\n  --sv-slate-6: #363a3f;\n  --sv-slate-7: #43484e;\n  --sv-slate-8: #5a6169;\n  --sv-slate-11: #b0b4ba;\n  --sv-slate-12: #edeef0;\n  --sv-indigo-3: #182449;\n  --sv-indigo-7: #3a4f97;\n  --sv-indigo-9: #3e63dd;\n  --sv-indigo-11: #9eb1ff;\n  --sv-jade-3: #132d21;\n  --sv-jade-7: #1b5745;\n  --sv-jade-9: #29a383;\n  --sv-jade-11: #7ce2bd;\n  --sv-amber-3: #35290f;\n  --sv-amber-7: #6a4f0b;\n  --sv-amber-9: #f5b31b;\n  --sv-amber-11: #facf72;\n  --sv-red-3: #3b1219;\n  --sv-red-7: #7e2e33;\n  --sv-red-9: #e5484d;\n  --sv-red-11: #ff9592;\n  --sv-text-muted: #7b7f88;\n  --sv-chart-series-1: #9eb1ff;\n  --sv-chart-series-2: #0bd8b6;\n  --sv-chart-series-3: #d19dff;\n  --sv-chart-series-4: #ff9592;\n  --sv-chart-series-5: #facf72;\n  --sv-chart-series-6: #70b8ff;\n  --sv-chart-series-7: #e796f3;\n  --sv-chart-series-8: #7ce2bd;\n}\n\n/* Preserve meaning when the operating system owns the color palette. */\n@media (forced-colors: active) {\n  :root,\n  [data-theme=\"light\"],\n  [data-theme=\"dark\"] {\n    --sv-bg-page: Canvas;\n    --sv-bg-surface: Canvas;\n    --sv-bg-elevated: ButtonFace;\n    --sv-bg-muted: ButtonFace;\n    --sv-bg-info: Canvas;\n    --sv-bg-success: Canvas;\n    --sv-bg-warning: Canvas;\n    --sv-bg-danger: Canvas;\n    --sv-text-primary: CanvasText;\n    --sv-text-secondary: CanvasText;\n    --sv-text-muted: GrayText;\n    --sv-text-info: LinkText;\n    --sv-text-success: CanvasText;\n    --sv-text-warning: CanvasText;\n    --sv-text-danger: CanvasText;\n    --sv-border-subtle: GrayText;\n    --sv-border-default: ButtonText;\n    --sv-border-strong: CanvasText;\n    --sv-border-info: LinkText;\n    --sv-border-success: CanvasText;\n    --sv-border-warning: CanvasText;\n    --sv-border-danger: CanvasText;\n    --sv-accent: Highlight;\n    --sv-status-info: LinkText;\n    --sv-status-success: CanvasText;\n    --sv-status-warning: CanvasText;\n    --sv-status-danger: CanvasText;\n  }\n\n  a {\n    color: LinkText;\n  }\n\n  button,\n  input,\n  select,\n  textarea {\n    forced-color-adjust: auto;\n  }\n}\n\nhtml,\nbody {\n  margin: 0;\n  padding: 0;\n  overflow: hidden;\n  background: transparent;\n  color: var(--color-text-primary);\n  font: 400 16px/1.7 var(--font-sans, ui-sans-serif, system-ui, sans-serif);\n}\n\n#root {\n  min-height: 1px;\n  margin: 0;\n  padding: 0;\n  overflow: visible;\n  background: transparent;\n  color: inherit;\n  font: inherit;\n}\n\n*,\n*::before,\n*::after {\n  box-sizing: border-box;\n}\n\nimg,\nsvg,\ncanvas,\nvideo {\n  max-width: 100%;\n  height: auto;\n}\n\n[data-visualize-root] {\n  width: 100%;\n  max-width: 100%;\n  color: var(--color-text-primary);\n}\n\n.sr-only {\n  position: absolute;\n  width: 1px;\n  height: 1px;\n  padding: 0;\n  margin: -1px;\n  overflow: hidden;\n  clip: rect(0, 0, 0, 0);\n  white-space: nowrap;\n  border: 0;\n}\n\nh1,\nh2,\nh3,\nh4,\np,\nul,\nol,\nfigure,\ntable,\nsvg {\n  margin-block-start: 0;\n}\n\nh1 {\n  margin: 0 0 16px;\n  color: var(--color-text-primary);\n  font-size: 22px;\n  line-height: 1.3;\n  font-weight: 500;\n}\n\nh2 {\n  margin: 0 0 12px;\n  color: var(--color-text-primary);\n  font-size: 18px;\n  line-height: 1.35;\n  font-weight: 500;\n}\n\nh3 {\n  margin: 16px 0 8px;\n  color: var(--color-text-primary);\n  font-size: 16px;\n  line-height: 1.4;\n  font-weight: 500;\n}\n\np,\nul,\nol {\n  color: var(--color-text-secondary);\n}\n\np {\n  margin: 0 0 1rem;\n}\n\nul,\nol {\n  margin: 0 0 1rem;\n  padding-inline-start: 1.25rem;\n}\n\nli {\n  margin: 0 0 0.5rem;\n}\n\n.grid,\n.cards,\n.metrics,\n.metric-grid,\n.status-grid,\n.status-board,\n.board,\n.columns,\n.kpi-grid {\n  display: grid;\n  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));\n  gap: 12px;\n}\n\n.card,\n.panel,\n.metric,\n.metric-card,\n.kpi,\n.status,\n.item,\n.column,\n.lane,\n.check-item {\n  border: 0.5px solid var(--color-border-tertiary);\n  background: var(--color-background-primary);\n  border-radius: var(--border-radius-lg);\n  padding: 1rem 1.25rem;\n}\n\n.metric,\n.metric-card,\n.kpi {\n  display: grid;\n  gap: 4px;\n  border: 0;\n  background: var(--color-background-secondary);\n  border-radius: var(--border-radius-md);\n  padding: 1rem;\n}\n\n.metric > :is(span, small, .label),\n.metric-card > :is(span, small, .label),\n.kpi > :is(span, small, .label) {\n  color: var(--color-text-secondary);\n  font-size: 13px;\n  line-height: 1.35;\n}\n\n.metric > :is(strong, .value),\n.metric-card > :is(strong, .value),\n.kpi > :is(strong, .value) {\n  color: var(--color-text-primary);\n  font-size: 24px;\n  line-height: 1.15;\n  font-weight: 500;\n}\n\n.chip,\n.badge,\n.pill,\n.tag {\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n  border: 0.5px solid var(--color-border-tertiary);\n  border-radius: var(--border-radius-md);\n  padding: 4px 12px;\n  color: var(--color-text-primary);\n  background: var(--color-background-secondary);\n}\n\nbutton,\ninput,\nselect,\ntextarea {\n  font: inherit;\n  color: var(--color-text-primary);\n  border: 0.5px solid var(--color-border-secondary);\n  background: transparent;\n  border-radius: var(--border-radius-md);\n}\n\ninput,\nselect,\ntextarea {\n  display: block;\n  width: 100%;\n  max-width: 100%;\n  min-height: 36px;\n  margin: 6px 0 10px;\n  padding: 6px 10px;\n}\n\nlabel {\n  display: block;\n  margin: 0;\n  color: var(--color-text-secondary);\n  font-size: 13px;\n  line-height: 1.35;\n}\n\ntextarea {\n  min-height: 80px;\n  resize: var(--sem-resize-y);\n}\n\nbutton {\n  min-height: 32px;\n  padding: 6px 12px;\n  cursor: var(--sem-cursor-pointer);\n}\n\nbutton:hover,\ninput:hover,\nselect:hover,\ntextarea:hover {\n  background: var(--color-background-secondary);\n}\n\nbutton:active {\n  transform: scale(var(--sem-scale-98));\n}\n\nbutton:focus-visible,\ninput:focus-visible,\nselect:focus-visible,\ntextarea:focus-visible {\n  outline: none;\n  box-shadow: 0 0 0 2px var(--color-border-info);\n}\n\ninput[type=\"range\"] {\n  height: 18px;\n  padding: 0;\n  accent-color: var(--color-border-info);\n  border: 0;\n  background: transparent;\n}\n\ntable {\n  width: 100%;\n  border-collapse: var(--sem-table-border-collapse);\n  border: 0.5px solid var(--color-border-tertiary);\n  border-radius: var(--border-radius-lg);\n  overflow: hidden;\n  background: var(--color-background-primary);\n}\n\nth,\ntd {\n  padding: 8px 12px;\n  border-bottom: 0.5px solid var(--color-border-tertiary);\n  text-align: left;\n  vertical-align: top;\n}\n\nth {\n  color: var(--color-text-primary);\n  background: var(--color-background-secondary);\n  font-weight: 500;\n}\n\ntd {\n  color: var(--color-text-secondary);\n}\n\nsvg {\n  display: block;\n  max-width: 100%;\n  height: auto;\n  color: var(--color-text-secondary);\n}\n\nsvg text,\nsvg tspan {\n  fill: var(--color-text-secondary);\n}\n\n.t {\n  color: var(--color-text-primary);\n  fill: var(--color-text-primary);\n}\n\n.ts {\n  color: var(--color-text-secondary);\n  fill: var(--color-text-secondary);\n}\n\n.th {\n  color: var(--color-text-tertiary);\n  fill: var(--color-text-tertiary);\n}\n\n:root,\n[data-theme=\"light\"] {\n  --c-purple-fill: #eeedfe;\n  --c-purple-stroke: #534ab7;\n  --c-purple-title: #3c3489;\n  --c-purple-subtitle: #534ab7;\n  --c-teal-fill: #e1f5ee;\n  --c-teal-stroke: #0f6e56;\n  --c-teal-title: #085041;\n  --c-teal-subtitle: #0f6e56;\n  --c-coral-fill: #faece7;\n  --c-coral-stroke: #993c1d;\n  --c-coral-title: #712b13;\n  --c-coral-subtitle: #993c1d;\n  --c-pink-fill: #fbeaf0;\n  --c-pink-stroke: #993556;\n  --c-pink-title: #72243e;\n  --c-pink-subtitle: #993556;\n  --c-gray-fill: #f1efe8;\n  --c-gray-stroke: #5f5e5a;\n  --c-gray-title: #444441;\n  --c-gray-subtitle: #5f5e5a;\n  --c-blue-fill: #e6f1fb;\n  --c-blue-stroke: #185fa5;\n  --c-blue-title: #0c447c;\n  --c-blue-subtitle: #185fa5;\n  --c-green-fill: #eaf3de;\n  --c-green-stroke: #3b6d11;\n  --c-green-title: #27500a;\n  --c-green-subtitle: #3b6d11;\n  --c-amber-fill: #faeeda;\n  --c-amber-stroke: #854f0b;\n  --c-amber-title: #633806;\n  --c-amber-subtitle: #854f0b;\n  --c-red-fill: #fcebeb;\n  --c-red-stroke: #a32d2d;\n  --c-red-title: #791f1f;\n  --c-red-subtitle: #a32d2d;\n}\n\n[data-theme=\"dark\"] {\n  --c-purple-fill: #3c3489;\n  --c-purple-stroke: #afa9ec;\n  --c-purple-title: #cecbf6;\n  --c-purple-subtitle: #afa9ec;\n  --c-teal-fill: #085041;\n  --c-teal-stroke: #5dcaa5;\n  --c-teal-title: #9fe1cb;\n  --c-teal-subtitle: #5dcaa5;\n  --c-coral-fill: #712b13;\n  --c-coral-stroke: #f0997b;\n  --c-coral-title: #f5c4b3;\n  --c-coral-subtitle: #f0997b;\n  --c-pink-fill: #72243e;\n  --c-pink-stroke: #ed93b1;\n  --c-pink-title: #f4c0d1;\n  --c-pink-subtitle: #ed93b1;\n  --c-gray-fill: #444441;\n  --c-gray-stroke: #b4b2a9;\n  --c-gray-title: #d3d1c7;\n  --c-gray-subtitle: #b4b2a9;\n  --c-blue-fill: #0c447c;\n  --c-blue-stroke: #85b7eb;\n  --c-blue-title: #b5d4f4;\n  --c-blue-subtitle: #85b7eb;\n  --c-green-fill: #27500a;\n  --c-green-stroke: #97c459;\n  --c-green-title: #c0dd97;\n  --c-green-subtitle: #97c459;\n  --c-amber-fill: #633806;\n  --c-amber-stroke: #ef9f27;\n  --c-amber-title: #fac775;\n  --c-amber-subtitle: #ef9f27;\n  --c-red-fill: #791f1f;\n  --c-red-stroke: #f09595;\n  --c-red-title: #f7c1c1;\n  --c-red-subtitle: #f09595;\n}\n\n.c-purple {\n  --c-fill: var(--c-purple-fill);\n  --c-stroke: var(--c-purple-stroke);\n  --c-title: var(--c-purple-title);\n  --c-subtitle: var(--c-purple-subtitle);\n}\n\n.c-teal {\n  --c-fill: var(--c-teal-fill);\n  --c-stroke: var(--c-teal-stroke);\n  --c-title: var(--c-teal-title);\n  --c-subtitle: var(--c-teal-subtitle);\n}\n\n.c-coral {\n  --c-fill: var(--c-coral-fill);\n  --c-stroke: var(--c-coral-stroke);\n  --c-title: var(--c-coral-title);\n  --c-subtitle: var(--c-coral-subtitle);\n}\n\n.c-pink {\n  --c-fill: var(--c-pink-fill);\n  --c-stroke: var(--c-pink-stroke);\n  --c-title: var(--c-pink-title);\n  --c-subtitle: var(--c-pink-subtitle);\n}\n\n.c-gray {\n  --c-fill: var(--c-gray-fill);\n  --c-stroke: var(--c-gray-stroke);\n  --c-title: var(--c-gray-title);\n  --c-subtitle: var(--c-gray-subtitle);\n}\n\n.c-blue {\n  --c-fill: var(--c-blue-fill);\n  --c-stroke: var(--c-blue-stroke);\n  --c-title: var(--c-blue-title);\n  --c-subtitle: var(--c-blue-subtitle);\n}\n\n.c-green {\n  --c-fill: var(--c-green-fill);\n  --c-stroke: var(--c-green-stroke);\n  --c-title: var(--c-green-title);\n  --c-subtitle: var(--c-green-subtitle);\n}\n\n.c-amber {\n  --c-fill: var(--c-amber-fill);\n  --c-stroke: var(--c-amber-stroke);\n  --c-title: var(--c-amber-title);\n  --c-subtitle: var(--c-amber-subtitle);\n}\n\n.c-red {\n  --c-fill: var(--c-red-fill);\n  --c-stroke: var(--c-red-stroke);\n  --c-title: var(--c-red-title);\n  --c-subtitle: var(--c-red-subtitle);\n}\n\n:is(.c-purple, .c-teal, .c-coral, .c-pink, .c-gray, .c-blue, .c-green, .c-amber, .c-red) {\n  color: var(--c-title);\n}\n\n:is(.c-purple, .c-teal, .c-coral, .c-pink, .c-gray, .c-blue, .c-green, .c-amber, .c-red):is(rect, circle, ellipse, polygon),\n:is(.c-purple, .c-teal, .c-coral, .c-pink, .c-gray, .c-blue, .c-green, .c-amber, .c-red) :is(rect, circle, ellipse, polygon) {\n  fill: var(--c-fill);\n  stroke: var(--c-stroke);\n}\n\n:is(.c-purple, .c-teal, .c-coral, .c-pink, .c-gray, .c-blue, .c-green, .c-amber, .c-red) :is(text, tspan),\n:is(.c-purple, .c-teal, .c-coral, .c-pink, .c-gray, .c-blue, .c-green, .c-amber, .c-red) .t {\n  fill: var(--c-title);\n  color: var(--c-title);\n}\n\n:is(.c-purple, .c-teal, .c-coral, .c-pink, .c-gray, .c-blue, .c-green, .c-amber, .c-red) .ts,\n:is(.c-purple, .c-teal, .c-coral, .c-pink, .c-gray, .c-blue, .c-green, .c-amber, .c-red) .th {\n  fill: var(--c-subtitle);\n  color: var(--c-subtitle);\n}\n\n.ti {\n  display: inline-block;\n  min-width: 1em;\n  font-style: normal;\n  line-height: 1;\n  text-align: center;\n}\n\n.ti::before {\n  content: \"□\";\n}\n\n.ti-home::before { content: \"⌂\"; }\n.ti-settings::before { content: \"⚙\"; }\n.ti-user::before { content: \"◯\"; }\n.ti-search::before { content: \"⌕\"; }\n.ti-x::before { content: \"×\"; }\n.ti-check::before { content: \"✓\"; }\n.ti-plus::before { content: \"+\"; }\n.ti-trash::before { content: \"⌫\"; }\n.ti-edit::before { content: \"✎\"; }\n.ti-download::before { content: \"↓\"; }\n.ti-upload::before { content: \"↑\"; }\n.ti-file::before { content: \"□\"; }\n.ti-folder::before { content: \"▱\"; }\n.ti-chart-bar::before { content: \"▥\"; }\n.ti-calendar::before { content: \"▦\"; }\n.ti-clock::before { content: \"◷\"; }\n.ti-arrow-right::before { content: \"→\"; }\n.ti-arrow-left::before { content: \"←\"; }\n.ti-chevron-down::before { content: \"⌄\"; }\n.ti-external-link::before { content: \"↗\"; }\n.ti-copy::before { content: \"⧉\"; }\n.ti-refresh::before { content: \"↻\"; }\n.ti-player-play::before { content: \"▷\"; }\n.ti-player-pause::before { content: \"Ⅱ\"; }\n.ti-heart::before { content: \"♡\"; }\n.ti-star::before { content: \"☆\"; }\n.ti-bell::before { content: \"◌\"; }\n.ti-mail::before { content: \"✉\"; }\n.ti-lock::before { content: \"⌐\"; }\n.ti-eye::before { content: \"◉\"; }\n.ti-menu-2::before { content: \"☰\"; }", Fe = "/* StreamViz authoring primitives. Keep this set small, semantic, and stable. */\n.sv-stack {\n  display: grid;\n  gap: var(--sv-space-3);\n}\n\n.sv-cluster {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: var(--sv-space-2);\n}\n\n.sv-grid {\n  display: grid;\n  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));\n  gap: var(--sv-space-3);\n}\n\n.sv-card {\n  min-width: 0;\n  padding: var(--sv-space-4) var(--sv-space-5);\n  border: 0.5px solid var(--sv-border-subtle);\n  border-radius: var(--sv-radius-lg);\n  background: var(--sv-bg-surface);\n  color: var(--sv-text-primary);\n}\n\n.sv-card-muted {\n  background: var(--sv-bg-elevated);\n}\n\n.sv-card-accent {\n  border-color: var(--sv-border-info);\n  background: var(--sv-bg-info);\n}\n\n.sv-metric {\n  display: grid;\n  min-width: 0;\n  gap: var(--sv-space-1);\n  padding: var(--sv-space-4);\n  border: 0;\n  border-radius: var(--sv-radius-md);\n  background: var(--sv-bg-elevated);\n}\n\n.sv-label,\n.sv-kicker {\n  margin: 0;\n  color: var(--sv-text-secondary);\n  font-size: 13px;\n  line-height: 1.35;\n  font-weight: 400;\n}\n\n.sv-value {\n  margin: 0;\n  color: var(--sv-text-primary);\n  font-size: 24px;\n  line-height: 1.15;\n  font-weight: 500;\n  font-variant-numeric: tabular-nums;\n}\n\n.sv-muted {\n  color: var(--sv-text-muted);\n}\n\n.sv-badge {\n  display: inline-flex;\n  width: fit-content;\n  align-items: center;\n  gap: var(--sv-space-1);\n  padding: 4px 10px;\n  border: 0.5px solid var(--sv-border-subtle);\n  border-radius: var(--sv-radius-md);\n  background: var(--sv-bg-elevated);\n  color: var(--sv-text-primary);\n  font-size: 12px;\n  line-height: 1.3;\n}\n\n.sv-badge-info {\n  border-color: var(--sv-border-info);\n  background: var(--sv-bg-info);\n  color: var(--sv-text-info);\n}\n\n.sv-badge-success {\n  border-color: var(--sv-border-success);\n  background: var(--sv-bg-success);\n  color: var(--sv-text-success);\n}\n\n.sv-badge-warning {\n  border-color: var(--sv-border-warning);\n  background: var(--sv-bg-warning);\n  color: var(--sv-text-warning);\n}\n\n.sv-badge-danger {\n  border-color: var(--sv-border-danger);\n  background: var(--sv-bg-danger);\n  color: var(--sv-text-danger);\n}\n\n.sv-divider {\n  height: 0.5px;\n  margin: var(--sv-space-3) 0;\n  border: 0;\n  background: var(--sv-border-subtle);\n}\n\n.sv-action {\n  display: inline-flex;\n  min-height: 36px;\n  align-items: center;\n  justify-content: center;\n  gap: var(--sv-space-2);\n  padding: 8px 14px;\n  border: 0.5px solid var(--sv-border-default);\n  border-radius: var(--sv-radius-md);\n  background: var(--sv-bg-surface);\n  color: var(--sv-text-primary);\n  font: 500 13px/1.3 var(--sv-font-sans);\n  cursor: pointer;\n}\n\n.sv-action:hover {\n  border-color: var(--sv-border-info);\n  background: var(--sv-bg-info);\n  color: var(--sv-text-info);\n}\n\n.sv-action:focus-visible {\n  outline: none;\n  box-shadow: 0 0 0 2px var(--sv-border-info);\n}\n\n.sv-chart-frame {\n  position: relative;\n  width: 100%;\n  min-height: 240px;\n}\n\n@media (max-width: 520px) {\n  .sv-card {\n    padding: var(--sv-space-4);\n  }\n}\n\n@media (prefers-reduced-motion: reduce) {\n  .sv-action {\n    transition: none;\n  }\n}", Ie = (e) => {
	let t = `
(() => {
  const widgetId = ${JSON.stringify(e)};
  const root = document.getElementById('root');
  let lastExecuted = '';
  let lastRenderedSource = '';
  let lastRenderedTitle = '';
  let lastRenderedFinal = false;
  const reconcileArtifactDom = ${Ne.toString()};
  let pendingUpdate = null;
  let renderFrame = 0;
  const blockedElements = new Set(['iframe', 'object', 'embed', 'base']);
  const urlAttributes = new Set(['href', 'src', 'xlink:href', 'formaction', 'poster']);
  const allowedResourceOrigins = new Set([
    'https://cdnjs.cloudflare.com',
    'https://esm.sh',
    'https://cdn.jsdelivr.net',
    'https://unpkg.com',
  ]);
  const isAllowedResourceUrl = (value) => {
    try {
      const url = new URL(String(value || ''), document.baseURI);
      return url.protocol === 'https:' && allowedResourceOrigins.has(url.origin);
    } catch (_error) {
      return false;
    }
  };
  const stripActiveContent = (doc) => {
    Array.from(doc.querySelectorAll(Array.from(blockedElements).join(','))).forEach((node) => node.remove());
    Array.from(doc.querySelectorAll('*')).forEach((node) => {
      Array.from(node.attributes || []).forEach((attribute) => {
        const name = String(attribute.name || '').trim().toLowerCase();
        const value = String(attribute.value || '').trim();
        if (name.startsWith('on')) {
          node.removeAttribute(attribute.name);
          return;
        }
        if (urlAttributes.has(name) && /^javascript:/i.test(value)) {
          node.removeAttribute(attribute.name);
        }
      });
    });
  };
  const applyHostCssVars = (cssText, theme) => {
    let style = document.getElementById('host-vars');
    if (!style) {
      style = document.createElement('style');
      style.id = 'host-vars';
      document.head.appendChild(style);
    }
    const normalizedTheme = String(theme || '').trim() === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = normalizedTheme;
    document.documentElement.style.colorScheme = normalizedTheme;
    style.textContent = ':root{' + String(cssText || '') + '}';
  };
  window.sendPrompt = (text) => {
    const prompt = String(text || '').trim().slice(0, 4000);
    if (!prompt) return;
    parent.postMessage({ type: 'visualize-widget:send-prompt', id: widgetId, prompt }, '*');
  };
  const visibleContentNodes = () =>
    Array.from(root?.children || []).filter((node) =>
      !['STYLE', 'SCRIPT', 'TEMPLATE', 'TITLE', 'META', 'LINK'].includes(node.tagName)
      && !node.hasAttribute('data-visualize-title')
    );
  const platformNormalizeCss = [
    '[data-visualize-root]{width:100%!important;min-width:0!important;max-width:none!important;height:auto!important;min-height:0!important;max-height:none!important;overflow:visible!important;margin:0!important;padding-top:0!important;background:transparent!important}',
    '[data-visualize-root]>:is(section,main,article,div):first-child{width:100%!important;min-width:0!important;max-width:none!important;margin-left:0!important;margin-right:0!important}',
    '[data-visualize-title]{display:block!important;margin:0 0 var(--sv-space-3)!important;padding:0!important;background:transparent!important;color:var(--sv-text-primary)!important;font:500 22px/1.35 var(--sv-font-sans)!important;letter-spacing:normal!important}',
    '[data-theme="light"] [data-visualize-root] :is(h1,h2,h3,h4,h5,h6){color:var(--sv-text-primary)!important}',
    '[data-theme="light"] [data-visualize-root] table{background:transparent!important;border-color:var(--sv-border-subtle)!important}',
    '[data-theme="light"] [data-visualize-root] :is(thead,tbody,tr){background:transparent!important}',
    '[data-theme="light"] [data-visualize-root] :is(th,td){border-color:var(--sv-border-subtle)!important}',
    '[data-theme="light"] [data-visualize-root] th{background:var(--sv-surface-primary)!important;color:var(--sv-text-secondary)!important}',
    '[data-theme="light"] [data-visualize-root] td{background:transparent!important}',
    '[data-theme="light"] [data-visualize-root] td:first-child{color:var(--sv-text-secondary)!important}',
    '[data-theme="light"] :is([data-visualize-root].sv,[data-visualize-root] .sv,[data-visualize-root].svv,[data-visualize-root] .svv){--ink:var(--sv-text-primary)!important;--sub:var(--sv-text-secondary)!important;--line:var(--sv-border-subtle)!important;--card:var(--sv-bg-elevated)!important;--card2:var(--sv-bg-surface)!important;--text:var(--sv-text-primary)!important;--muted:var(--sv-text-secondary)!important;--bg:transparent!important;background:transparent!important;color:var(--sv-text-primary)!important}',
    '[data-theme="light"] :is([data-visualize-root].sv,[data-visualize-root] .sv,[data-visualize-root].svv,[data-visualize-root] .svv) :is(h1,h2,h3,h4,h5,h6,b,strong,.sv-title,.sv-value,.v){color:var(--sv-text-primary)!important}',
    '[data-theme="light"] :is([data-visualize-root].svv,[data-visualize-root] .svv){border-color:var(--sv-border-subtle)!important;box-shadow:none!important}',
    '[data-theme="light"] :is([data-visualize-root].svv,[data-visualize-root] .svv) :is(.sub,.lg,ul,[style*="color:#b9c6dc"]){color:var(--sv-text-secondary)!important}',
    '[data-theme="light"] :is([data-visualize-root].svv,[data-visualize-root] .svv) :is(.chart,.table-wrap){background:transparent!important}',
    '[data-theme="light"] :is([data-visualize-root].svv,[data-visualize-root] .svv) :is(.panel,.rank-html){background:var(--sv-bg-surface)!important;border-color:var(--sv-border-subtle)!important}',
    '[data-theme="light"] :is([data-visualize-root].svv,[data-visualize-root] .svv) svg text[fill="#e8eefb"]{fill:var(--sv-text-primary)!important}',
    '[data-theme="light"] :is([data-visualize-root].svv,[data-visualize-root] .svv) svg text[fill="#93a4bd"]{fill:var(--sv-text-secondary)!important}',
    '[data-theme="light"] :is([data-visualize-root].svv,[data-visualize-root] .svv) svg :is(line,path)[stroke="#233247"]{stroke:var(--sv-border-subtle)!important}',
    '[data-theme="light"] :is([data-visualize-root].sv,[data-visualize-root] .sv) :is(p,li,.sv-sum,.pp-sub,.two p,ol.steps,.sv-label,.sv-muted,.k,.d){color:var(--sv-text-secondary)!important}',
    '[data-theme="light"] :is([data-visualize-root].sv,[data-visualize-root] .sv) :is(.sv-card,.sv-metric,.pp-tabs>div,.sv-narr>div,.sv-note,svg.payoff){background:var(--sv-bg-elevated)!important;border-color:var(--sv-border-subtle)!important;color:var(--sv-text-primary)!important}',
    '[data-theme="light"] :is([data-visualize-root].sv,[data-visualize-root] .sv) table{background:transparent!important;color:var(--sv-text-secondary)!important;border-color:var(--sv-border-subtle)!important}',
    '[data-theme="light"] :is([data-visualize-root].sv,[data-visualize-root] .sv) thead th{background:var(--sv-surface-primary)!important;color:var(--sv-text-secondary)!important;border-color:var(--sv-border-subtle)!important}',
    '[data-theme="light"] :is([data-visualize-root].sv,[data-visualize-root] .sv) tbody td{background:transparent!important;color:var(--sv-text-secondary)!important;border-color:var(--sv-border-subtle)!important}',
    '[data-theme="light"] :is([data-visualize-root].sv,[data-visualize-root] .sv) tbody tr.hl td{background:var(--sv-bg-info)!important;color:var(--sv-text-primary)!important}',
    '[data-theme="dark"] :is([data-visualize-root].sv,[data-visualize-root] .sv,[data-visualize-root].svv,[data-visualize-root] .svv){--ink:var(--sv-text-primary)!important;--sub:var(--sv-text-secondary)!important;--line:var(--sv-border-subtle)!important;--card:var(--sv-bg-elevated)!important;--card2:var(--sv-bg-surface)!important;--text:var(--sv-text-primary)!important;--muted:var(--sv-text-secondary)!important;color:var(--sv-text-primary)!important}',
    '[data-theme="dark"] :is([data-visualize-root].svv,[data-visualize-root] .svv){--bg:transparent!important;background:transparent!important;border-color:var(--sv-border-subtle)!important;box-shadow:none!important}',
    '[data-theme="dark"] :is([data-visualize-root].svv,[data-visualize-root] .svv) :is(.sub,.lg,ul,[style*="color:#b9c6dc"]){color:var(--sv-text-secondary)!important}',
    '[data-theme="dark"] :is([data-visualize-root].svv,[data-visualize-root] .svv) :is(.chart,.table-wrap){background:transparent!important}',
    '[data-theme="dark"] :is([data-visualize-root].svv,[data-visualize-root] .svv) :is(.panel,.rank-html){background:var(--sv-bg-elevated)!important;border-color:var(--sv-border-subtle)!important}',
    '[data-theme="dark"] :is([data-visualize-root].svv,[data-visualize-root] .svv) svg text[fill="#e8eefb"]{fill:var(--sv-text-primary)!important}',
    '[data-theme="dark"] :is([data-visualize-root].svv,[data-visualize-root] .svv) svg text[fill="#93a4bd"]{fill:var(--sv-text-secondary)!important}',
    '[data-theme="dark"] :is([data-visualize-root].svv,[data-visualize-root] .svv) svg :is(line,path)[stroke="#233247"]{stroke:var(--sv-border-subtle)!important}',
    '[data-theme="dark"] [data-visualize-root] :is(h1,h2,h3,h4,h5,h6){color:var(--sv-text-primary)!important}',
    '[data-theme="dark"] [data-visualize-root] table{background:transparent!important;border-color:var(--sv-border-subtle)!important}',
    '[data-theme="dark"] [data-visualize-root] :is(thead,tbody,tr){background:transparent!important}',
    '[data-theme="dark"] [data-visualize-root] :is(th,td){border-color:var(--sv-border-subtle)!important}',
    '[data-theme="dark"] [data-visualize-root] th{background:var(--sv-surface-primary)!important;color:var(--sv-text-secondary)!important}',
    '[data-theme="dark"] [data-visualize-root] td{background:transparent!important}',
    '[data-theme="dark"] [data-visualize-root] td:first-child{color:var(--sv-text-secondary)!important}',
    '[data-theme="dark"] :is([data-visualize-root].sv,[data-visualize-root] .sv) :is(h1,h2,h3,h4,h5,h6,b,strong,.sv-title,.sv-value,.v){color:var(--sv-text-primary)!important}',
    '[data-theme="dark"] :is([data-visualize-root].sv,[data-visualize-root] .sv) :is(p,li,.sv-sum,.pp-sub,.two p,ol.steps,.sv-label,.sv-muted,.k,.d){color:var(--sv-text-secondary)!important}',
    '[data-theme="dark"] :is([data-visualize-root].sv,[data-visualize-root] .sv) :is(.sv-card,.sv-metric,.pp-tabs>div,.sv-narr>div,.sv-note,svg.payoff){background:var(--sv-bg-elevated)!important;border-color:var(--sv-border-subtle)!important;color:var(--sv-text-primary)!important}',
    '[data-theme="dark"] :is([data-visualize-root].sv,[data-visualize-root] .sv) table{background:transparent!important;color:var(--sv-text-secondary)!important;border-color:var(--sv-border-subtle)!important}',
    '[data-theme="dark"] :is([data-visualize-root].sv,[data-visualize-root] .sv) thead th{background:var(--sv-surface-primary)!important;color:var(--sv-text-secondary)!important;border-color:var(--sv-border-subtle)!important}',
    '[data-theme="dark"] :is([data-visualize-root].sv,[data-visualize-root] .sv) tbody td{background:transparent!important;color:var(--sv-text-secondary)!important;border-color:var(--sv-border-subtle)!important}',
    '[data-theme="dark"] :is([data-visualize-root].sv,[data-visualize-root] .sv) tbody tr.hl td{background:var(--sv-bg-info)!important;color:var(--sv-text-primary)!important}',
    '[data-theme="dark"] :is([data-visualize-root].sv,[data-visualize-root] .sv) :is(.sv-chip.success,.sv-badge-success){background:var(--sv-bg-success)!important;color:var(--sv-text-success)!important;border-color:var(--sv-border-success)!important}',
    '[data-theme="dark"] :is([data-visualize-root].sv,[data-visualize-root] .sv) :is(.sv-chip.warning,.sv-badge-warning){background:var(--sv-bg-warning)!important;color:var(--sv-text-warning)!important;border-color:var(--sv-border-warning)!important}',
    '[data-theme="dark"] :is([data-visualize-root].sv,[data-visualize-root] .sv) :is(.sv-chip.danger,.sv-badge-danger){background:var(--sv-bg-danger)!important;color:var(--sv-text-danger)!important;border-color:var(--sv-border-danger)!important}',
    '[data-theme="dark"] :is([data-visualize-root].sv,[data-visualize-root] .sv) svg :is(.ax,.lk,.lg){fill:var(--sv-text-secondary)!important}',
    '[data-theme="dark"] :is([data-visualize-root].sv,[data-visualize-root] .sv) svg :is(rect[fill="#eef2f7"],rect[fill="#f8fafc"],rect[fill="#fff"],rect[fill="#ffffff"]){fill:var(--sv-bg-muted)!important}',
    '[data-theme="dark"] :is([data-visualize-root].sv-card,[data-visualize-root].sv-metric,[data-visualize-root] .sv-card,[data-visualize-root] .sv-metric){background:var(--sv-bg-elevated)!important;color:var(--sv-text-primary)!important;border-color:var(--sv-border-subtle)!important}',
    '[data-theme="dark"] [data-visualize-root] :is(.sv-label,.sv-kicker,.sv-muted){color:var(--sv-text-secondary)!important}',
    '[data-theme="dark"] [data-visualize-root] .sv-value{color:var(--sv-text-primary)!important}',
    '[data-theme="dark"] [data-visualize-root] :is(.sv-badge,.sv-action){background:var(--sv-bg-elevated)!important;color:var(--sv-text-primary)!important;border-color:var(--sv-border-subtle)!important}',
    '[data-theme="dark"] [data-visualize-root] .sv-badge-info{background:var(--sv-bg-info)!important;color:var(--sv-text-info)!important;border-color:var(--sv-border-info)!important}',
    '[data-theme="dark"] [data-visualize-root] .sv-badge-success{background:var(--sv-bg-success)!important;color:var(--sv-text-success)!important;border-color:var(--sv-border-success)!important}',
    '[data-theme="dark"] [data-visualize-root] .sv-badge-warning{background:var(--sv-bg-warning)!important;color:var(--sv-text-warning)!important;border-color:var(--sv-border-warning)!important}',
    '[data-theme="dark"] [data-visualize-root] .sv-badge-danger{background:var(--sv-bg-danger)!important;color:var(--sv-text-danger)!important;border-color:var(--sv-border-danger)!important}',
  ].join('');
  const installPlatformNormalize = () => {
    if (!root) return;
    let style = root.querySelector('style[data-visualize-platform-normalize]');
    if (!style) {
      style = document.createElement('style');
      style.setAttribute('data-visualize-platform-normalize', '');
      root.appendChild(style);
    }
    // Reinstall the shared contract after model styles on every streamed update.
    style.textContent = platformNormalizeCss + ${JSON.stringify("/* StreamViz owns both artifact palettes and legacy compatibility. */\n/* Compact artifact spacing: card gap 16, safe inset 12, component gap 8. */\n:is([data-aime-streamviz-root],[data-visualize-root]){--sv-card-gap:16px;--sv-card-padding:12px;--sv-component-gap:8px}\n/* Semantic contract; legacy card/metric classes are aliases, outer names do not matter. */\n:is([data-aime-streamviz-root],[data-visualize-root],[data-aime-streamviz-root] *,[data-visualize-root] *):not(:is(.card,.sv-card,[data-sv-card])):is([data-sv-layout],:has(>:is(.card,.sv-card,[data-sv-card],.metrics,[data-sv-layout]))){display:grid!important;gap:var(--sv-card-gap)!important;min-width:0!important}\n:is([data-aime-streamviz-root],[data-visualize-root],[data-aime-streamviz-root] *,[data-visualize-root] *):not(:is(.card,.sv-card,[data-sv-card])):is([data-sv-layout],:has(>:is(.card,.sv-card,[data-sv-card],.metrics,[data-sv-layout])))>:not(:is(style,script,template)){margin-block:0!important;min-width:0!important}\n:is([data-aime-streamviz-root],[data-visualize-root],[data-aime-streamviz-root] *,[data-visualize-root] *):is(.card,.sv-card,[data-sv-card],.metric,.sv-metric,[data-sv-metric]){padding:var(--sv-card-padding)!important;margin-block:0!important;min-width:0!important}\n:is([data-aime-streamviz-root],[data-visualize-root],[data-aime-streamviz-root] *,[data-visualize-root] *):is(.card,.sv-card,[data-sv-card]){display:flex!important;flex-direction:column!important;gap:var(--sv-component-gap)!important}\n:is([data-aime-streamviz-root],[data-visualize-root],[data-aime-streamviz-root] *,[data-visualize-root] *):is(.card,.sv-card,[data-sv-card])>:not(:is(style,script,template)){margin-block:0!important;min-width:0!important}\n:is([data-aime-streamviz-root],[data-visualize-root],[data-aime-streamviz-root] *,[data-visualize-root] *):is(.metrics,[data-sv-layout=\"metrics\"]){display:grid!important;grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr))!important;gap:var(--sv-card-gap)!important}\n:is([data-aime-streamviz-root],[data-visualize-root]) [data-sv-layout=\"stack\"]{grid-template-columns:minmax(0,1fr)!important}\n:is([data-aime-streamviz-root],[data-visualize-root]) [data-sv-layout=\"grid\"]{grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr))!important}\n:is([data-aime-streamviz-root],[data-visualize-root]) [data-sv-layout=\"components\"]{gap:var(--sv-component-gap)!important}\n:is([data-aime-streamviz-root],[data-visualize-root]) :is(.chips,.hk-chips,.bars,.sv-line-values){gap:var(--sv-component-gap)!important}\n/* Embedded reports use the host column in both palettes, without a second centered canvas. */\n:is([data-aime-streamviz-root],[data-visualize-root])>:is(div,main,section,article):not(:is(.card,.sv-card,[data-sv-card],.metric,.sv-metric,[data-sv-metric])){width:100%!important;max-width:none!important;margin-inline:0!important}\n/* Keep intrinsic chart widths inside their own scroll area, not the page grid. */\n:is([data-aime-streamviz-root],[data-visualize-root]){min-width:0;max-width:100%}\n:is([data-aime-streamviz-root],[data-visualize-root]) :is(div,section,article,header,footer){min-width:0}\n:is([data-aime-streamviz-root],[data-visualize-root]) :is(.chips,.sv-chips){flex-wrap:wrap}\n:is([data-aime-streamviz-root],[data-visualize-root]) .chip{max-width:100%;white-space:normal;overflow-wrap:anywhere}\n@media(max-width:640px){\n  :is([data-aime-streamviz-root],[data-visualize-root]) .metrics{grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr))!important}\n  :is([data-aime-streamviz-root],[data-visualize-root]) .metric{overflow-wrap:anywhere}\n  :is([data-aime-streamviz-root],[data-visualize-root]) :is(.sv-grid,.cols){grid-template-columns:minmax(0,1fr)!important}\n  .svx .bd{min-width:0!important}\n  .svx .bdr3,.svx .scale-r{grid-template-columns:88px minmax(0,1fr) 64px!important}\n  .svx .bdrow{padding:10px 8px;column-gap:8px}\n  .svx .bfrow{grid-template-columns:80px minmax(0,1fr) minmax(0,1fr);height:52px}\n  .svx :is(.bleft,.brgt){position:relative;padding-bottom:18px}\n  .svx .bval{position:absolute;bottom:0;min-width:0;font-size:11px}\n  .svx .bleft .bval{right:4px}\n  .svx .brgt .bval{left:4px}\n  .svx .bdaxis{padding-top:16px;height:42px}\n  .svx .bdval{position:absolute;top:0;right:0;font-size:11px}\n}\n.sv-responsive-line{width:100%;min-width:0;color:var(--sv-text-secondary);font-size:12px}\n.sv-line-note{margin:0 0 12px 48px;line-height:1.5}\n.sv-line-body{display:grid;grid-template-columns:48px minmax(0,1fr);grid-template-rows:minmax(0,1fr);height:clamp(220px,24vw,320px);box-sizing:border-box;padding-top:8px}\n.sv-line-y-axis,.sv-line-plot{position:relative;min-width:0;min-height:0}\n.sv-line-y-axis span{position:absolute;right:8px;transform:translateY(-50%);white-space:nowrap;font-variant-numeric:tabular-nums}\n.sv-line-plot svg{display:block;width:100%;height:100%;max-width:none}\n.sv-line-dot{position:absolute;left:100%;right:auto;width:7px;height:7px;box-sizing:border-box;border-radius:50%;transform:translate(-50%,-50%)}\n.sv-line-x-axis{position:relative;height:18px;margin:8px 0 0 48px}\n.sv-line-x-axis span{position:absolute;transform:translateX(-50%);white-space:nowrap}\n.sv-line-x-axis span:last-child{transform:translateX(-100%)}\n.sv-line-values{display:flex;justify-content:center;flex-wrap:wrap;gap:8px 20px;margin-top:10px;font-size:13px;line-height:1.5}\n.sv-line-values span{white-space:nowrap;font-variant-numeric:tabular-nums}\n.sv-line-values i{display:inline-block;width:16px;height:3px;margin-right:6px;vertical-align:middle}\n/* Generated palettes are aliases, never a separate fixed light/dark theme. */\n[data-aime-streamviz-root],[data-aime-streamviz-root] *{--c-bg:transparent!important;--c-surface:var(--sv-surface-primary)!important;--c-surface2:var(--sv-surface-secondary)!important;--c-border:var(--sv-border-subtle)!important;--c-text:var(--sv-text-primary)!important;--c-text2:var(--sv-text-secondary)!important;--c-muted:var(--sv-text-secondary)!important;--c-up:var(--sv-price-up)!important;--c-dn:var(--sv-price-down)!important;--c-flat:var(--sv-text-secondary)!important}\n:root:not([data-theme=\"dark\"]){color-scheme:light;--sv-gain:#08745f;--sv-loss:#c43244;--sv-warning:#925f0b;--sv-status-success:#08745f;--sv-status-danger:#c43244;--sv-bg-success:#e9f8f2;--sv-bg-warning:#fff5db;--sv-bg-danger:#fff0f1}\n:root[data-theme=\"dark\"]{color-scheme:dark;--sv-gain:#64b79d;--sv-loss:#ee777d;--sv-warning:#ffd28b;--sv-bg-success:#133c36;--sv-bg-warning:#493617;--sv-bg-danger:#49202a}\n[data-aime-streamviz-root]{color:var(--sv-text-primary)!important;background:transparent!important}\n[data-aime-streamviz-root] :is(h1,h2,h3,h4){color:var(--sv-text-primary)!important}\n:is(.stv,.sv-report,.svv,.sv){color:var(--sv-text-primary)!important}\n:is(.stv,.sv-report,.svv,.sv) :is(.card,.panel,.sv-metric,.sv-node,.sv-rank){background:var(--sv-surface-primary)!important;border-color:var(--sv-border-subtle)!important}\n:is(.stv,.sv-report,.svv,.sv) :is(.stat,.metric,.chart,.table-wrap,.sv-table-wrap){background:var(--sv-surface-secondary)!important;border-color:var(--sv-border-subtle)!important}\n:is(.stv,.sv-report,.svv,.sv) :is(.cap,.bles,.note,.sub,.lg,.sv-summary,.sv-narrative p,.sv-node span,.sv-metric p,.sv-metric small,.sv-note,.sv-kicker,.stat span){color:var(--sv-text-secondary)!important}\n:is(.stv,.sv-report,.svv,.sv) :is(table,.sv-node b,.sv-rank b,.sv-event b){color:var(--sv-text-primary)!important;border-color:var(--sv-border-subtle)!important}\n:is(.stv,.sv-report,.svv,.sv) :is(th,.sv-event time,.sv-rank small,.sv-event p){color:var(--sv-text-secondary)!important;background:var(--sv-surface-secondary)!important;border-color:var(--sv-border-subtle)!important}\n.stv .up{color:var(--sv-price-up)!important}.stv .dn{color:var(--sv-price-down)!important}.stv .nt{color:var(--sv-warning)!important}\n:is(.sv-chip--success,.sv-badge-success,.chip.success){color:var(--sv-status-success)!important;background:var(--sv-bg-success)!important}\n:is(.sv-chip--warning,.sv-badge-warning,.chip.warning){color:var(--sv-warning)!important;background:var(--sv-bg-warning)!important}\n:is(.sv-chip--danger,.sv-badge-danger,.chip.danger){color:var(--sv-status-danger)!important;background:var(--sv-bg-danger)!important}\n:is(.sv-chip--neutral,.sv-badge,.chip){color:var(--sv-text-secondary);background:var(--sv-surface-secondary);border-color:var(--sv-border-subtle)}\n:root:not([data-theme=\"dark\"]) [data-aime-streamviz-root] :is([style*=\"color:#8fa2bd\"],[style*=\"color:#c3cfe0\"],[style*=\"color:#b9c6dc\"],[style*=\"color:#c7d2e8\"]){color:var(--sv-text-secondary)!important}\n:root:not([data-theme=\"dark\"]) [data-aime-streamviz-root] svg :is(text[fill=\"#e8eefb\"],text[fill=\"#c3cfe0\"],g[fill=\"#c3cfe0\"],g[fill=\"#e8eefb\"]){fill:var(--sv-text-primary)!important}\n[data-aime-streamviz-root] svg :is(text[fill=\"#8fa2bd\"],g[fill=\"#8fa2bd\"]){fill:var(--sv-text-secondary)!important}\n:root:not([data-theme=\"dark\"]){--sv-surface-primary:#ffffff;--sv-surface-secondary:#f6f7f9}\n:root:not([data-theme=\"dark\"]){--sv-text-primary:#171b22;--sv-text-secondary:#5f6876;--sv-text-muted:#8b94a2;--sv-border-subtle:#edf0f4;--sv-chart-series-1:#4d63f6;--sv-chart-series-2:#00b899;--sv-chart-series-3:#ff2f57;--sv-status-success:#00b899;--sv-status-warning:#d97706;--sv-status-danger:#ff2f57}\n:root:not([data-theme=\"dark\"]) *{box-sizing:border-box}\nhtml,body{margin:0;background:transparent!important;color:var(--sv-text-primary);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,\"Segoe UI\",\"PingFang SC\",\"Microsoft YaHei\",sans-serif}\n:root:not([data-theme=\"dark\"]) [data-aime-streamviz-root]>.sv-wrap,:root:not([data-theme=\"dark\"]) .sv-wrap{width:100%!important;max-width:none!important;margin:0!important}\n:root:not([data-theme=\"dark\"]) .sv-muted{color:var(--sv-text-muted)}\n:root:not([data-theme=\"dark\"]) .sv-label{color:var(--sv-text-secondary)}\n:root:not([data-theme=\"dark\"]) .sv-badge{display:inline-flex;align-items:center;padding:5px 9px;border:1px solid var(--sv-border-subtle);border-radius:999px;font-size:12px}\n:root:not([data-theme=\"dark\"]) .sv-badge-success{color:#09836f;background:#eaf8f2;border-color:#b7e6d5}\n:root:not([data-theme=\"dark\"]) .sv-badge-warning{color:#a56417;background:#fff6df;border-color:#f0d28f}\n:root:not([data-theme=\"dark\"]) .sv-badge-danger{color:#c34650;background:#fff0f1;border-color:#ffc3c8}\n:root:not([data-theme=\"dark\"]) .svv{--bg:transparent!important;--card:#fff!important;--card2:#f6f7f9!important;--line:#dfe4eb!important;--text:#171b22!important;--muted:#667085!important;background:transparent!important;color:var(--text)!important;border-color:var(--line)!important;box-shadow:none!important}\n:root:not([data-theme=\"dark\"]) .svv :is(.sub,.lg,ul,[style*=\"color:#b9c6dc\"]){color:#475467!important}\n:root:not([data-theme=\"dark\"]) .svv .chip{color:#475467!important;background:#f6f7f9!important;border-color:#d0d5dd!important}\n:root:not([data-theme=\"dark\"]) .svv .chip.success{color:#08745f!important;background:#e9f8f2!important;border-color:#9bdac7!important}\n:root:not([data-theme=\"dark\"]) .svv .chip.warning{color:#925f0b!important;background:#fff5db!important;border-color:#ebc86f!important}\n:root:not([data-theme=\"dark\"]) .svv .chip.danger{color:#b42335!important;background:#fff0f1!important;border-color:#f4aeb7!important}\n:root:not([data-theme=\"dark\"]) .svv :is(.chart,.table-wrap){background:transparent!important}\n:root:not([data-theme=\"dark\"]) .svv :is(.panel,.rank-html){background:#f6f7f9!important}\n:root:not([data-theme=\"dark\"]) .svv table{color:#344054!important}\n:root:not([data-theme=\"dark\"]) .svv thead th{color:#667085!important}\n:root:not([data-theme=\"dark\"]) .svv tbody td{border-color:#dfe4eb!important}\n:root:not([data-theme=\"dark\"]) .svv svg text[fill=\"#e8eefb\"]{fill:#344054!important}\n:root:not([data-theme=\"dark\"]) .svv svg text[fill=\"#93a4bd\"]{fill:#667085!important}\n:root:not([data-theme=\"dark\"]) .svv svg :is(line,path)[stroke=\"#233247\"]{stroke:#cbd3df!important}\n:root:not([data-theme=\"dark\"]) .svv svg line[stroke=\"#93a4bd\"]{stroke:#98a2b3!important}\n\n:root[data-theme=\"dark\"]{--sv-surface-primary:#181818;--sv-surface-secondary:#202020}\n:root[data-theme=\"dark\"]{color-scheme:dark;--sv-text-primary:#f5f5f5;--sv-text-secondary:#aaa;--sv-text-muted:#858585;--sv-border-subtle:#343434;--sv-chart-series-1:#a580ef;--sv-chart-series-2:#64b79d;--sv-chart-series-3:#ee777d;--sv-status-success:#64b79d;--sv-status-warning:#f6ad55;--sv-status-danger:#ee777d}\n:root[data-theme=\"dark\"] html,:root[data-theme=\"dark\"] body{color:var(--sv-text-primary)}\n:root[data-theme=\"dark\"] .svv{--bg:transparent!important;--card:#181e28!important;--card2:#181e28!important;--line:#334052!important;--text:#f1f5f9!important;--muted:#aab6c7!important;background:transparent!important;color:var(--text)!important;border-color:var(--line)!important;box-shadow:none!important}\n:root[data-theme=\"dark\"] .svv :is(.sub,.lg,ul,[style*=\"color:#b9c6dc\"]){color:#c1cad7!important}\n:root[data-theme=\"dark\"] .svv .chip{color:#dbe3ee!important;background:#202733!important;border-color:#465268!important}\n:root[data-theme=\"dark\"] .svv .chip.success{color:#7ce6c6!important;background:#133c36!important;border-color:#276658!important}\n:root[data-theme=\"dark\"] .svv .chip.warning{color:#ffd28b!important;background:#493617!important;border-color:#806128!important}\n:root[data-theme=\"dark\"] .svv .chip.danger{color:#ffabb7!important;background:#49202a!important;border-color:#7b3643!important}\n:root[data-theme=\"dark\"] .svv :is(.chart,.table-wrap){background:transparent!important}\n:root[data-theme=\"dark\"] .svv :is(.panel,.rank-html){background:#181e28!important}\n:root[data-theme=\"dark\"] .svv table{color:#dbe3ee!important}\n:root[data-theme=\"dark\"] .svv thead th{color:#aab6c7!important}\n:root[data-theme=\"dark\"] .svv tbody td{border-color:#334052!important}\n:root[data-theme=\"dark\"] .svv svg text[fill=\"#e8eefb\"]{fill:#dbe3ee!important}\n:root[data-theme=\"dark\"] .svv svg text[fill=\"#93a4bd\"]{fill:#aab6c7!important}\n:root[data-theme=\"dark\"] .svv svg :is(line,path)[stroke=\"#233247\"]{stroke:#334052!important}\n:root[data-theme=\"dark\"] .svv svg line[stroke=\"#93a4bd\"]{stroke:#7d8ca3!important}\n:root[data-theme=\"dark\"] .sv-report{color:#f1f5f9!important;background:transparent!important}\n:root[data-theme=\"dark\"] .sv-report :is(.sv-kicker,.sv-lead,.dsub,.dlabel,.dlabel-flat,.dhead-c,.bval,.tval,.mv-meta,.keyline){color:#aab6c7!important}\n:root[data-theme=\"dark\"] .sv-report :is(.card,.metric){background:#181e28!important;border-color:#334052!important}\n:root[data-theme=\"dark\"] .sv-report :is(.metric span,.metric em,.bname em,.tname em,.mv-id em){color:#aab6c7!important}\n:root[data-theme=\"dark\"] .sv-report .chip{color:#dbe3ee!important;background:#202733!important;border-color:#465268!important}\n:root[data-theme=\"dark\"] .sv-report .chip.success{color:#7ce6c6!important;background:#133c36!important;border-color:#276658!important}\n:root[data-theme=\"dark\"] .sv-report .chip.warning{color:#ffd28b!important;background:#493617!important;border-color:#806128!important}\n:root[data-theme=\"dark\"] .sv-report .chip.danger{color:#ffabb7!important;background:#49202a!important;border-color:#7b3643!important}\n:root[data-theme=\"dark\"] .sv-report .counts li{color:#aab6c7!important;border-color:#334052!important}\n:root[data-theme=\"dark\"] .sv-report .counts b{color:#f1f5f9!important}\n:root[data-theme=\"dark\"] .sv-report :is(.btrack,.ttrack){background:#202733!important}\n:root[data-theme=\"dark\"] .sv-report .mv{border-color:#334052!important}\n:root[data-theme=\"dark\"] .sv-report .note{color:#aab6c7!important;background:#181e28!important;border-color:#334052!important}\n:root[data-theme=\"dark\"] .sv-report .note b{color:#dbe3ee!important}\n:root[data-theme=\"dark\"] .sv{--ink:#f1f5f9!important;--sub:#aab6c7!important;--line:#334052!important;--card:#181e28!important;color:#f1f5f9!important}\n:root[data-theme=\"dark\"] .sv .sv-sum,:root[data-theme=\"dark\"] .sv .two p,:root[data-theme=\"dark\"] .sv ol.steps{color:#c1cad7!important}\n:root[data-theme=\"dark\"] .sv ol.steps b{color:#f1f5f9!important}\n:root[data-theme=\"dark\"] .sv .sv-metric,:root[data-theme=\"dark\"] .sv .pp-tabs>div,:root[data-theme=\"dark\"] .sv .sv-narr>div,:root[data-theme=\"dark\"] .sv .sv-note,:root[data-theme=\"dark\"] .sv svg.payoff,:root[data-theme=\"dark\"] .sv-card,:root[data-theme=\"dark\"] .sv-metric{background:#181e28!important;border-color:#334052!important;color:#f1f5f9!important}\n:root[data-theme=\"dark\"] .sv table{color:#dbe3ee!important}\n:root[data-theme=\"dark\"] .sv thead th{color:#aab6c7!important;border-color:#334052!important}\n:root[data-theme=\"dark\"] .sv tbody td{border-color:#2b3544!important}\n:root[data-theme=\"dark\"] .sv tbody tr.hl{background:#1f3b46!important}\n:root[data-theme=\"dark\"] .sv svg .ax,:root[data-theme=\"dark\"] .sv svg .lk,:root[data-theme=\"dark\"] .sv svg .lg{fill:#b9c5d5!important}\n:root[data-theme=\"dark\"] .sv svg rect[fill=\"#eef2f7\"],:root[data-theme=\"dark\"] .sv svg rect[fill=\"#f8fafc\"]{fill:#202733!important}\n:root[data-theme=\"dark\"] .sv-badge-success,:root[data-theme=\"dark\"] .sv .sv-chip.success{color:#7ce6c6!important;background:#133c36!important;border-color:#276658!important}\n:root[data-theme=\"dark\"] .sv-badge-warning,:root[data-theme=\"dark\"] .sv .sv-chip.warning{color:#ffd28b!important;background:#493617!important;border-color:#806128!important}\n:root[data-theme=\"dark\"] .sv-badge-danger,:root[data-theme=\"dark\"] .sv .sv-chip.danger{color:#ffabb7!important;background:#49202a!important;border-color:#7b3643!important}\n\n/* Report tables sit on the same card surface as ranked lists. Override the\n   widget runtime's independent neutral table palette inside report roots. */\n:is([data-aime-streamviz-root],[data-visualize-root]) :is(table,.table-wrap,.sv-table-wrap){background:transparent!important;border-color:var(--sv-border-subtle)!important}\n:is([data-aime-streamviz-root],[data-visualize-root]) thead th{background:var(--sv-surface-primary)!important;color:var(--sv-text-secondary)!important;border-color:var(--sv-border-subtle)!important}\n\n/* Financial direction is market-specific; success/danger remain status colors. */\n:root{--sv-price-up:var(--sv-loss);--sv-price-down:var(--sv-gain);--sv-price-flat:var(--sv-text-secondary)}\n[data-financial-market=\"CN\"],[data-financial-market=\"HK\"]{--sv-price-up:var(--sv-loss);--sv-price-down:var(--sv-gain)}\n[data-financial-market=\"US\"]{--sv-price-up:var(--sv-gain);--sv-price-down:var(--sv-loss)}\n\n/* Report sections stay open; compact metrics have their own outlined cards. */\n:root[data-theme] :is([data-aime-streamviz-root],[data-visualize-root]) :is(.sv-head,.sv-metrics){border:0!important}\n:root[data-theme] :is([data-aime-streamviz-root],[data-visualize-root]) :is(.sv-metric,.metric,.stat):not([data-sv-surface]){background:transparent!important;border-width:1px!important;border-style:solid!important;border-color:var(--sv-border-subtle)!important;border-radius:8px!important;box-shadow:none!important}\n:root[data-theme] :is([data-aime-streamviz-root],[data-visualize-root]) :is(.sv-head,.sv-section,.sv-note){border-color:var(--sv-border-subtle)!important}\n:root[data-theme] :is([data-aime-streamviz-root],[data-visualize-root]) :is(.sv-chip--success,.sv-badge-success,.chip.success){color:var(--sv-text-success,var(--sv-status-success))!important;background:var(--sv-bg-success)!important;border-color:var(--sv-border-success,var(--sv-border-subtle))!important}\n:root[data-theme] :is([data-aime-streamviz-root],[data-visualize-root]) :is(.sv-chip--warning,.sv-badge-warning,.chip.warning){color:var(--sv-text-warning,var(--sv-warning))!important;background:var(--sv-bg-warning)!important;border-color:var(--sv-border-warning,var(--sv-border-subtle))!important}\n:root[data-theme] :is([data-aime-streamviz-root],[data-visualize-root]) :is(.sv-chip--danger,.sv-badge-danger,.chip.danger){color:var(--sv-text-danger,var(--sv-status-danger))!important;background:var(--sv-bg-danger)!important;border-color:var(--sv-border-danger,var(--sv-border-subtle))!important}\n\n/* Standalone reports and sandboxed reports share the semantic runtime palette. */\n:root:not([data-theme=\"dark\"]){--sv-text-success:var(--sv-jade-11,#208368);--sv-text-warning:var(--sv-amber-11,#915930);--sv-text-danger:var(--sv-red-11,#ce2c31);--sv-border-success:var(--sv-jade-7,#92ceac);--sv-border-warning:var(--sv-amber-7,#e8c36a);--sv-border-danger:var(--sv-red-7,#f3aeaf);--sv-bg-success:var(--sv-jade-3,#e6f4ea);--sv-bg-warning:var(--sv-amber-3,#fff3d0);--sv-bg-danger:var(--sv-red-3,#feebec)}\n:root[data-theme=\"dark\"]{--sv-text-success:var(--sv-jade-11,#7ce2bd);--sv-text-warning:var(--sv-amber-11,#facf72);--sv-text-danger:var(--sv-red-11,#ff9592);--sv-border-success:var(--sv-jade-7,#1b5745);--sv-border-warning:var(--sv-amber-7,#6a4f0b);--sv-border-danger:var(--sv-red-7,#7e2e33);--sv-bg-success:var(--sv-jade-3,#132d21);--sv-bg-warning:var(--sv-amber-3,#35290f);--sv-bg-danger:var(--sv-red-3,#3b1219)}\n/* Timeline copy stays on the page; only status badges get a tinted surface. */\n:root[data-theme] :is([data-aime-streamviz-root],[data-visualize-root]) :is(.sv-event time,.sv-event p,.sv-rank small){background:transparent!important}\n:root[data-theme] :is([data-aime-streamviz-root],[data-visualize-root]) .sv-timeline{border-left:1px solid var(--sv-border-subtle)!important}\n:root[data-theme] :is([data-aime-streamviz-root],[data-visualize-root]) .sv-chip{border-width:.5px!important}\n/* Timeline events without dates do not reserve an empty tinted date column. */\n:root[data-theme] :is([data-aime-streamviz-root],[data-visualize-root]) .sv-event:is(:has(>time:empty),:not(:has(>time))){grid-template-columns:minmax(0,1fr)!important}\n:root[data-theme] :is([data-aime-streamviz-root],[data-visualize-root]) .sv-event>time:empty{display:none!important}\n:root[data-theme] :is([data-aime-streamviz-root],[data-visualize-root]) .sv-timeline :is(time,p){background:transparent!important;border:0!important;color:var(--sv-text-secondary)!important}\n\n/* Template reports share the compact metric rhythm; legacy margins must not stack. */\n:root[data-theme] :is([data-aime-streamviz-root],[data-visualize-root]) .sv-metrics{display:grid!important;grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr))!important;gap:var(--sv-card-gap)!important;padding:12px 0!important;align-items:start}\n:root[data-theme] :is([data-aime-streamviz-root],[data-visualize-root]) .sv-metric{display:grid!important;gap:var(--sv-component-gap)!important;align-content:start}\n:root[data-theme] :is([data-aime-streamviz-root],[data-visualize-root]) .sv-metric>:is(p,strong,small){margin:0!important;line-height:1.5;overflow-wrap:anywhere}\n:root[data-theme] :is([data-aime-streamviz-root],[data-visualize-root]) .sv-metric strong{font-size:clamp(22px,2.5vw,27px);line-height:1.3}\n/* Place the dot's centre on the centre of the 1px connector, independent of radius. */\n:root[data-theme] :is([data-aime-streamviz-root],[data-visualize-root]) .sv-timeline{--sv-timeline-inset:20px;padding-left:var(--sv-timeline-inset)!important}\n:root[data-theme] :is([data-aime-streamviz-root],[data-visualize-root]) .sv-event::before{left:calc(-1 * var(--sv-timeline-inset) - .5px)!important;transform:translateX(-50%);background:var(--sv-chart-series-1)!important}\n\n/* Compact metric cards tile across the available width and wrap as a group. */\n:root :is([data-aime-streamviz-root],[data-visualize-root]) :is([data-sv-metric],.metrics>.insight){box-sizing:border-box;min-width:0!important;padding:var(--sv-card-padding)!important;margin:0!important;border-width:1px!important;border-style:solid!important;border-color:var(--sv-border-subtle)!important;border-radius:8px!important;background:transparent!important;overflow-wrap:anywhere}\n:root[data-theme] :is([data-aime-streamviz-root],[data-visualize-root]) :is(.metrics,.sv-metrics,[data-sv-layout=\"metrics\"]){align-items:stretch!important}\n@media(max-width:640px){\n  :root[data-theme] :is([data-aime-streamviz-root],[data-visualize-root]) :is(.metrics,.sv-metrics,[data-sv-layout=\"metrics\"]){grid-template-columns:repeat(auto-fit,minmax(min(100%,120px),1fr))!important;gap:12px!important}\n  :root :is([data-aime-streamviz-root],[data-visualize-root]) :is(.stat-value,.sv-metric strong){font-size:22px!important}\n}\n\n/* Mobile summary metrics form compact swipeable cards, not a vertical feed. */\n@media(max-width:760px){\n :root[data-theme] :is([data-aime-streamviz-root],[data-visualize-root]) :is(.metrics,.sv-metrics,.pv-metrics,[data-sv-layout=\"metrics\"]){\n  display:grid!important;grid-auto-flow:column!important;grid-template-columns:none!important;\n  grid-auto-columns:clamp(196px,68vw,260px)!important;grid-template-rows:auto!important;\n  gap:10px!important;align-items:stretch!important;max-width:100%;min-width:0;\n  overflow-x:auto!important;overflow-y:hidden;scroll-snap-type:x mandatory;\n  scroll-padding-inline:1px;overscroll-behavior-inline:contain;-webkit-overflow-scrolling:touch;\n  padding:2px 1px 8px!important;scrollbar-width:thin;scrollbar-color:var(--sv-border-subtle) transparent;\n }\n :root[data-theme] :is([data-aime-streamviz-root],[data-visualize-root]) :is(.metrics,.sv-metrics,.pv-metrics,[data-sv-layout=\"metrics\"])>:not(:is(style,script,template)){\n  display:flex!important;flex-direction:column;justify-content:flex-start;gap:6px!important;\n  width:auto!important;min-width:0!important;min-height:0!important;height:auto!important;\n  padding:10px!important;margin:0!important;box-sizing:border-box;scroll-snap-align:start;\n }\n :root[data-theme] :is([data-aime-streamviz-root],[data-visualize-root]) :is(.metrics,.sv-metrics,.pv-metrics,[data-sv-layout=\"metrics\"])>:not(:is(style,script,template))>:is(p,strong,small,em){margin:0!important;overflow-wrap:anywhere}\n :root[data-theme] :is([data-aime-streamviz-root],[data-visualize-root]) :is(.metrics,.sv-metrics,.pv-metrics,[data-sv-layout=\"metrics\"])>:not(:is(style,script,template))>p{font-size:13px;line-height:1.4}\n :root[data-theme] :is([data-aime-streamviz-root],[data-visualize-root]) :is(.metrics,.sv-metrics,.pv-metrics,[data-sv-layout=\"metrics\"])>:not(:is(style,script,template))>strong{font-size:24px!important;line-height:1.2!important;white-space:nowrap}\n :root[data-theme] :is([data-aime-streamviz-root],[data-visualize-root]) :is(.metrics,.sv-metrics,.pv-metrics,[data-sv-layout=\"metrics\"])>:not(:is(style,script,template))>:is(small,em){font-size:12px;line-height:1.45}\n}\n\n/* Table headers stay on one line; each wide table owns its horizontal scroll. */\n:root[data-theme] :is([data-aime-streamviz-root],[data-visualize-root]) :is(.table-wrap,.sv-table-wrap,.pv-table-wrap){overflow-x:auto!important;max-width:100%;min-width:0}\n:root[data-theme] :is([data-aime-streamviz-root],[data-visualize-root]) th{white-space:nowrap!important;word-break:normal!important;overflow-wrap:normal!important}\n:root[data-theme] :is([data-aime-streamviz-root],[data-visualize-root]) .pv-table-wrap table{table-layout:auto!important;min-width:640px;width:100%}\n:root[data-theme] :is([data-aime-streamviz-root],[data-visualize-root]) .pv-table-wrap :is(th,td):nth-last-child(-n+2){white-space:nowrap!important;min-width:92px}\n\n/* Touch feedback is handled by the host; avoid native tap overlay blocks. */\nhtml{-webkit-tap-highlight-color:transparent}\n\n/* Additional categorical series stay distinct from the first three in both themes. */\n:root:not([data-theme=\"dark\"]){--sv-chart-series-4:#d97706;--sv-chart-series-5:#8e4ec6;--sv-chart-series-6:#0090ff;--sv-chart-series-7:#ab4aba;--sv-chart-series-8:#46a758}\n:root[data-theme=\"dark\"]{--sv-chart-series-4:#f6ad55;--sv-chart-series-5:#d19dff;--sv-chart-series-6:#70b8ff;--sv-chart-series-7:#e796f3;--sv-chart-series-8:#7ce2bd}\n\n/* Double-ring charts: subdued surfaces and readable hierarchy in dark mode.\n   Ratios, series colors, labels and light-mode output remain data-owned. */\n:root[data-theme=\"dark\"] .double-ring-component {\n  --ring-surface:#111214;\n  --ring-track:#25272c;\n  --ring-text:#f1f2f4;\n  --ring-muted:#a2a6af;\n  --ring-tooltip:#23252a;\n  --ring-border:rgba(255,255,255,.09);\n  padding:16px 20px 20px!important;\n  color:var(--ring-text);\n}\n:root[data-theme=\"dark\"] .double-ring-component .ring-layout {gap:16px!important}\n:root[data-theme=\"dark\"] .double-ring-component .ring-stage {height:280px!important;min-width:0}\n:root[data-theme=\"dark\"] .double-ring-component .ring-stage>svg {width:280px!important;height:280px!important;max-width:100%;flex-shrink:1}\n:root[data-theme=\"dark\"] .double-ring-component .ring-track {fill:var(--ring-track)!important}\n:root[data-theme=\"dark\"] .double-ring-component .ring-arc {stroke:var(--ring-surface);stroke-width:1.5;stroke-linejoin:round;transition:opacity .15s ease}\n:root[data-theme=\"dark\"] .double-ring-component .center-text {fill:var(--ring-text)!important;font-size:18px!important;font-weight:650!important;font-variant-numeric:tabular-nums}\n:root[data-theme=\"dark\"] .double-ring-component .center-text:first-of-type:not(:last-of-type),\n:root[data-theme=\"dark\"] .double-ring-component .center-caption {fill:var(--ring-muted)!important;font-size:12px!important;font-weight:400!important}\n:root[data-theme=\"dark\"] .double-ring-component .component-title {color:var(--ring-text)!important;font-size:15px!important;font-weight:600!important;line-height:1.5!important;margin-bottom:12px!important}\n:root[data-theme=\"dark\"] .double-ring-component .ring-legend {gap:12px 20px!important;color:var(--ring-muted)!important;font-size:12px!important;line-height:1.5!important}\n:root[data-theme=\"dark\"] .double-ring-component .legend-item {gap:7px}\n:root[data-theme=\"dark\"] .double-ring-component .legend-dot {width:7px;height:7px;flex:none}\n:root[data-theme=\"dark\"] .double-ring-component .ring-legend .legend-item:first-child .legend-dot {background:var(--ring-track)!important;box-shadow:inset 0 0 0 1px #70757e}\n:root[data-theme=\"dark\"] .double-ring-component .ring-baseline {color:var(--ring-muted)!important;font-size:12px;line-height:1.5}\n:root[data-theme=\"dark\"] .double-ring-component .ring-tooltip {background:var(--ring-tooltip)!important;color:var(--ring-text)!important;border:1px solid var(--ring-border);border-radius:8px;padding:10px 12px;font-size:12px;line-height:1.5;box-shadow:0 6px 20px #0004}\n:root[data-theme=\"dark\"] .double-ring-component .ring-tooltip::after {background:var(--ring-tooltip)!important}\n@media(max-width:520px){\n  :root[data-theme=\"dark\"] .double-ring-component {padding:12px 16px 16px!important}\n  :root[data-theme=\"dark\"] .double-ring-component .ring-stage {height:232px!important}\n  :root[data-theme=\"dark\"] .double-ring-component .ring-stage>svg {width:232px!important;height:232px!important}\n  :root[data-theme=\"dark\"] .double-ring-component .ring-legend {gap:10px 16px!important}\n}\n@media(prefers-reduced-motion:reduce){\n  :root[data-theme=\"dark\"] .double-ring-component :is(.ring-arc,.ring-track,.ring-highlight,.ring-tooltip){transition:none}\n}\n\n/* Neutral dark report tables, including saved StreamViz artifacts. */\n/* Neutral night applies to new templates and the old private palette aliases.\n   Financial direction and success/error states stay independent. */\n:root[data-theme=\"dark\"] :is(.sv,.svv,.sv-report,.stv){--ink:var(--sv-text-primary)!important;--sub:var(--sv-text-secondary)!important;--text:var(--sv-text-primary)!important;--muted:var(--sv-text-secondary)!important;--line:var(--sv-border-subtle)!important;--card:var(--sv-surface-primary)!important;--card2:var(--sv-surface-secondary)!important;color:var(--sv-text-primary)!important}\n:root[data-theme=\"dark\"] :is([data-aime-streamviz-root],[data-visualize-root],.sv,.svv,.sv-report,.stv) :is(.card,.panel,.sv-card,.sv-node,.sv-rank,.rank-html,[data-sv-card]){background:var(--sv-surface-primary)!important;border-color:var(--sv-border-subtle)!important;box-shadow:none!important;border-radius:8px!important}\n:root[data-theme=\"dark\"] :is(.sv,.svv,.sv-report,.stv) :is(.sub,.lg,ul,.note,.sv-note,.sv-sum,.sv-narrative p,.dsub,.dlabel,.dlabel-flat,.keyline,.sv-rank small){color:var(--sv-text-secondary)!important}\n:root[data-theme=\"dark\"] :is(.sv,.svv,.sv-report,.stv) :is(.sv-note,.note,.pp-tabs>div,.sv-narr>div,svg.payoff){background:var(--sv-surface-primary)!important;border-color:var(--sv-border-subtle)!important}\n:root[data-theme=\"dark\"] :is(.sv,.svv,.sv-report,.stv) :is(.btrack,.ttrack){background:var(--sv-surface-secondary)!important}\n:root[data-theme=\"dark\"] :is(.sv,.svv,.sv-report,.stv) .chip:not(:is(.success,.warning,.danger)){background:var(--sv-surface-secondary)!important;color:var(--sv-text-secondary)!important;border-color:var(--sv-border-subtle)!important}\n:root[data-theme] :is([data-aime-streamviz-root],[data-visualize-root]) .sv-rank>strong{white-space:nowrap;font-variant-numeric:tabular-nums}\n/* Only explicitly typed directional values receive financial color. */\n:root[data-theme] :is([data-aime-streamviz-root],[data-visualize-root]) [data-sv-direction=\"up\"]{color:var(--sv-price-up)!important}\n:root[data-theme] :is([data-aime-streamviz-root],[data-visualize-root]) [data-sv-direction=\"down\"]{color:var(--sv-price-down)!important}\n:root[data-theme] :is([data-aime-streamviz-root],[data-visualize-root]) [data-sv-direction=\"flat\"]{color:var(--sv-price-flat)!important}\n:root[data-theme=\"dark\"] :is([data-aime-streamviz-root],[data-visualize-root],.sv,.svv,.sv-report,.stv) :is(.sv-table-wrap,.table-wrap){background:transparent!important;border:1px solid #2c2c2c!important;border-radius:10px!important}\n:root[data-theme=\"dark\"] :is([data-aime-streamviz-root],[data-visualize-root],.sv,.svv,.sv-report,.stv) table{background:transparent!important;color:#d4d4d4}\n:root[data-theme=\"dark\"] :is([data-aime-streamviz-root],[data-visualize-root],.sv,.svv,.sv-report,.stv) table thead tr th{background:#1c1c1c!important;color:#e4e4e4!important}\n:root[data-theme=\"dark\"] :is([data-aime-streamviz-root],[data-visualize-root],.sv,.svv,.sv-report,.stv) table :is(thead,tbody) tr :is(th,td){border-color:#2c2c2c!important}\n:root[data-theme=\"dark\"] :is([data-aime-streamviz-root],[data-visualize-root],.sv,.svv,.sv-report,.stv) :is(tbody,tr,td){background:transparent!important}\n\n/* Reports share the host canvas in both themes and throughout streaming/export. */\n:root[data-theme] :is([data-aime-streamviz-root],[data-visualize-root]){background:transparent!important;background-image:none!important}\n:root[data-theme] :is([data-aime-streamviz-root],[data-visualize-root]) :is(.sv-native-canvas,.card,.panel,.sv-card,[data-sv-card],.sv-section){background:transparent!important;background-image:none!important;box-shadow:none!important}\n")};
    root.appendChild(style);
  };
  const isTransparentColor = (value) => {
    const color = String(value || '').replace(/\\s+/g, '').toLowerCase();
    if (!color || color === 'transparent') return true;
    if (!color.startsWith('rgb')) return false;
    const channels = color.match(/[\\d.]+/g) || [];
    return channels.length >= 4 && Number(channels[3]) === 0;
  };
  const hasVisiblePaintBox = (node) => {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
    const element = node;
    const styles = window.getComputedStyle(element);
    if (styles.display === 'none' || styles.visibility === 'hidden' || Number(styles.opacity) === 0) return false;
    const rects = Array.from(element.getClientRects ? element.getClientRects() : []);
    if (!rects.some((rect) => rect.width > 0 && rect.height > 0)) return false;
    if (element.matches('svg,canvas,img,picture,video,table,ul,ol,button,input,select,textarea,progress')) return true;
    const borderPainted = ['Top', 'Right', 'Bottom', 'Left'].some((side) => Number.parseFloat(styles['border-app' + side + 'Width'] || '0') > 0);
    return borderPainted || styles.backgroundImage !== 'none' || styles.boxShadow !== 'none' || !isTransparentColor(styles.backgroundColor);
  };
  const measureContentHeight = () => {
    if (!root) return 0;
    const nodes = visibleContentNodes();
    if (!nodes.length) return 0;
    const rootRect = root.getBoundingClientRect();
    let bottom = Math.max(0, root.scrollHeight);
    const paintedNodes = nodes.flatMap((node) => [node, ...Array.from(node.querySelectorAll('*'))]);
    paintedNodes.forEach((node) => {
      // Closed details can retain descendant layout boxes despite not painting them.
      if (typeof node.checkVisibility === 'function' && !node.checkVisibility()) return;
      for (let ancestor = node.parentElement; ancestor && ancestor !== root; ancestor = ancestor.parentElement) {
        if (ancestor.tagName !== 'DETAILS' || ancestor.hasAttribute('open')) continue;
        const summary = Array.from(ancestor.children).find((child) => child.tagName === 'SUMMARY');
        if (!summary || !summary.contains(node)) return;
      }
      const styles = window.getComputedStyle(node);
      if (styles.display === 'none' || styles.visibility === 'hidden') return;
      const rect = node.getBoundingClientRect();
      bottom = Math.max(bottom, rect.bottom - rootRect.top);
    });
    const height = Math.max(1, bottom);
    return Number.isFinite(height) ? height : 0;
  };
  const postSize = () => {
    const height = measureContentHeight();
    parent.postMessage({ type: 'visualize-widget:size', id: widgetId, height, hasContent: hasRenderedContent() }, '*');
  };
  const hasRenderedContent = () => {
    if (!root) return false;
    const clone = root.cloneNode(true);
    clone.querySelectorAll?.('style,script,template,title,meta,link,[data-visualize-title]').forEach((node) => node.remove());
    const visibleText = String(clone.textContent || '').replace(/\\s+/g, '').trim();
    if (visibleText) return true;
    if (root.querySelector('svg,canvas,img,picture,video,table,ul,ol,button,input,select,textarea,progress')) return true;
    return Array.from(root.querySelectorAll('*')).some((node) => !['STYLE', 'SCRIPT'].includes(node.tagName) && hasVisiblePaintBox(node));
  };
  const htmlHasRenderedContent = (html) => {
    const container = document.createElement('div');
    container.innerHTML = String(html || '');
    container.querySelectorAll('style,script,template,title,meta,link').forEach((node) => node.remove());
    const visibleText = String(container.textContent || '').replace(/\\s+/g, '').trim();
    if (visibleText) return true;
    return Boolean(container.querySelector('svg,canvas,img,picture,video,table,ul,ol,button,input,select,textarea,progress'));
  };
  const normalizeSvgInk = () => {
    if (!root) return;
    const blackInk = new Set(['black', '#' + '000', '#' + '000000']);
    root.querySelectorAll('svg text, svg tspan').forEach((node) => {
      const fill = String(node.getAttribute('fill') || '').trim().toLowerCase();
      if (!fill || blackInk.has(fill)) node.style.fill = 'var(--sem-text-secondary)';
    });
    root.querySelectorAll('svg [stroke]').forEach((node) => {
      const stroke = String(node.getAttribute('stroke') || '').trim().toLowerCase();
      if (blackInk.has(stroke)) node.style.stroke = 'var(--sem-border-default)';
    });
    root.querySelectorAll('svg [fill]').forEach((node) => {
      if (node.matches('text,tspan')) return;
      const fill = String(node.getAttribute('fill') || '').trim().toLowerCase();
      if (blackInk.has(fill)) node.style.fill = 'var(--sem-bg-surface)';
    });
  };
  const snapshotStyleText = () =>
    Array.from(document.querySelectorAll('style')).map((node) => node.textContent || '').join('\\n');
  const canvasDataUrlFromSerializedSvg = (serialized, width, height, background) => new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' }));
    const image = new Image();
    image.onload = () => {
      try {
        const scale = Math.min(Math.max(window.devicePixelRatio || 1, 1), 2);
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(width * scale);
        canvas.height = Math.ceil(height * scale);
        const context = canvas.getContext('2d');
        if (!context) {
          URL.revokeObjectURL(url);
          reject(new Error('missing canvas context'));
          return;
        }
        context.scale(scale, scale);
        context.fillStyle = background;
        context.fillRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/png'));
      } catch (error) {
        URL.revokeObjectURL(url);
        reject(error);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('snapshot render failed'));
    };
    image.src = url;
  });
  const directSvgSnapshotElement = () => {
    const nodes = visibleContentNodes();
    if (nodes.length !== 1) return null;
    const only = nodes[0];
    if (only?.matches?.('svg')) return only;
    const children = Array.from(only?.children || []).filter((node) => !['STYLE', 'SCRIPT', 'TEMPLATE', 'TITLE', 'META', 'LINK'].includes(node.tagName));
    if (children.length === 1 && children[0]?.matches?.('svg')) return children[0];
    return null;
  };
  const svgSnapshotSize = (svgNode, fallbackWidth, fallbackHeight) => {
    const rect = svgNode.getBoundingClientRect();
    const viewBox = svgNode.viewBox?.baseVal;
    const attrWidth = Number.parseFloat(svgNode.getAttribute('width') || '');
    const attrHeight = Number.parseFloat(svgNode.getAttribute('height') || '');
    return {
      width: Math.max(1, Math.ceil(viewBox?.width || attrWidth || rect.width || fallbackWidth || 1)),
      height: Math.max(1, Math.ceil(viewBox?.height || attrHeight || rect.height || fallbackHeight || 1)),
    };
  };
  const freezeSvgComputedStyles = (sourceNode, targetNode) => {
    const styleProperties = [
      'color',
      'fill',
      'fill-opacity',
      'stroke',
      'stroke-opacity',
      'stroke-width',
      'stroke-linecap',
      'stroke-linejoin',
      'stroke-dasharray',
      'stroke-dashoffset',
      'opacity',
      'font-family',
      'font-size',
      'font-style',
      'font-weight',
      'letter-spacing',
      'text-anchor',
      'dominant-baseline',
      'paint-order',
      'stop-color',
      'stop-opacity',
      'marker-start',
      'marker-mid',
      'marker-end',
    ];
    const sourceNodes = [sourceNode, ...Array.from(sourceNode.querySelectorAll('*'))];
    const targetNodes = [targetNode, ...Array.from(targetNode.querySelectorAll('*'))];
    sourceNodes.forEach((node, index) => {
      const target = targetNodes[index];
      if (!target || node.nodeType !== Node.ELEMENT_NODE) return;
      const styles = window.getComputedStyle(node);
      styleProperties.forEach((property) => {
        const value = styles.getPropertyValue(property);
        if (value) target.style.setProperty(property, value);
      });
    });
  };
  const serializeSvgForSnapshot = (svgNode, width, height) => {
    const clone = svgNode.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', String(width));
    clone.setAttribute('height', String(height));
    if (!clone.getAttribute('viewBox')) clone.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
    freezeSvgComputedStyles(svgNode, clone);
    const styleText = snapshotStyleText();
    if (styleText) {
      const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
      style.textContent = styleText;
      clone.insertBefore(style, clone.firstChild);
    }
    return new XMLSerializer().serializeToString(clone);
  };
  const buildSnapshotDataUrl = () => new Promise((resolve, reject) => {
    try {
      if (!root) {
        reject(new Error('missing root'));
        return;
      }
      const rootRect = root.getBoundingClientRect();
      const width = Math.max(1, Math.ceil(document.documentElement.clientWidth || root.scrollWidth || rootRect.width || 1));
      const height = Math.max(1, Math.ceil(measureContentHeight() || root.scrollHeight || rootRect.height || 1));
      const rootStyles = window.getComputedStyle(document.documentElement);
      const bodyStyles = window.getComputedStyle(document.body);
      const background = rootStyles.getPropertyValue('--sem-bg-page').trim() || bodyStyles.backgroundColor || 'Canvas';
      const renderForeignObjectSnapshot = () => {
        const wrapper = document.createElement('div');
        wrapper.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
        wrapper.style.width = width + 'px';
        wrapper.style.minHeight = height + 'px';
        wrapper.style.margin = '0';
        wrapper.style.background = background;
        wrapper.style.color = bodyStyles.color || 'CanvasText';
        wrapper.style.font = bodyStyles.font || '14px system-ui';
        wrapper.style.boxSizing = 'border-box';
        const style = document.createElement('style');
        style.textContent = snapshotStyleText() + '\\nhtml,body,#root{overflow:visible!important;background:transparent!important}';
        wrapper.appendChild(style);
        const content = root.cloneNode(true);
        const sourceCanvases = Array.from(root.querySelectorAll('canvas'));
        const snapshotCanvases = Array.from(content.querySelectorAll('canvas'));
        sourceCanvases.forEach((canvas, index) => {
          const target = snapshotCanvases[index];
          if (!target) return;
          try {
            const dataUrl = canvas.toDataURL('image/png');
            if (!String(dataUrl || '').startsWith('data:image/')) return;
            const rect = canvas.getBoundingClientRect();
            const image = document.createElement('img');
            image.src = dataUrl;
            image.className = target.className || '';
            image.style.cssText = target.getAttribute('style') || '';
            image.setAttribute('alt', target.getAttribute('aria-label') || 'Canvas snapshot');
            const width = canvas.getAttribute('width') || String(canvas.width || Math.ceil(rect.width || 0));
            const height = canvas.getAttribute('height') || String(canvas.height || Math.ceil(rect.height || 0));
            if (Number(width) > 0) image.setAttribute('width', width);
            if (Number(height) > 0) image.setAttribute('height', height);
            target.replaceWith(image);
          } catch (_error) {}
        });
        wrapper.appendChild(content);
        const foreignObject = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
        foreignObject.setAttribute('width', '100%');
        foreignObject.setAttribute('height', '100%');
        foreignObject.appendChild(wrapper);
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        svg.setAttribute('width', String(width));
        svg.setAttribute('height', String(height));
        svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
        svg.appendChild(foreignObject);
        return canvasDataUrlFromSerializedSvg(new XMLSerializer().serializeToString(svg), width, height, background);
      };
      const svgCandidate = directSvgSnapshotElement();
      if (svgCandidate) {
        const size = svgSnapshotSize(svgCandidate, width, height);
        canvasDataUrlFromSerializedSvg(serializeSvgForSnapshot(svgCandidate, size.width, size.height), size.width, size.height, background)
          .then(resolve)
          .catch(() => renderForeignObjectSnapshot().then(resolve).catch(reject));
        return;
      }
      renderForeignObjectSnapshot().then(resolve).catch(reject);
    } catch (error) {
      reject(error);
    }
  });
  const sanitizeAndRender = (html, final, title) => {
    const source = String(html || '');
    const reportTitle = String(title || '').trim();
    if (source.trim() && source === lastRenderedSource && reportTitle === lastRenderedTitle && Boolean(final) === lastRenderedFinal) {
      postSize();
      parent.postMessage({ type: 'visualize-widget:rendered', id: widgetId, hasContent: hasRenderedContent() }, '*');
      return;
    }
    const parsed = new DOMParser().parseFromString(source, 'text/html');
    const scripts = Array.from(parsed.querySelectorAll('script'));
    scripts.forEach((script) => script.remove());
    stripActiveContent(parsed);
    const headStyles = Array.from(parsed.head?.querySelectorAll('style') || []).map((node) => node.outerHTML).join('');
    const nextHtml = headStyles + (parsed.body ? parsed.body.innerHTML : source);
    if (!final && !htmlHasRenderedContent(nextHtml) && hasRenderedContent()) {
      postSize();
      parent.postMessage({ type: 'visualize-widget:rendered', id: widgetId, hasContent: true }, '*');
      return;
    }
    const fragment = document.createElement('template');
    fragment.innerHTML = nextHtml;
    if (reportTitle) {
      const heading = document.createElement('h2');
      heading.setAttribute('data-visualize-title', '');
      heading.textContent = reportTitle;
      fragment.content.prepend(heading);
    }
    reconcileArtifactDom(root, fragment.content);
    if (source.trim()) {
      lastRenderedSource = source;
      lastRenderedTitle = reportTitle;
      lastRenderedFinal = Boolean(final);
    }
    const firstContent = visibleContentNodes()[0];
    if (firstContent) firstContent.setAttribute('data-visualize-root', '');
    installPlatformNormalize();
    normalizeSvgInk();
    postSize();
    parent.postMessage({ type: 'visualize-widget:rendered', id: widgetId, hasContent: hasRenderedContent() }, '*');
    if (!final || !source.trim() || source === lastExecuted) return;
    lastExecuted = source;
    const runScripts = async () => {
      for (const script of scripts) {
        const nextScript = document.createElement('script');
        nextScript.async = false;
        if (script.src) {
          if (!isAllowedResourceUrl(script.src)) continue;
          nextScript.src = script.src;
          await new Promise((resolve) => {
            nextScript.onload = resolve;
            nextScript.onerror = resolve;
            document.body.appendChild(nextScript);
          });
          continue;
        }
        nextScript.textContent = script.textContent || '';
        document.body.appendChild(nextScript);
      }
    };
    runScripts().finally(() => {
      requestAnimationFrame(postSize);
      setTimeout(postSize, 80);
      setTimeout(postSize, 300);
    });
    requestAnimationFrame(postSize);
    setTimeout(postSize, 80);
    setTimeout(postSize, 300);
  };
  window.addEventListener('message', (event) => {
    const data = event.data || {};
    if (data.id !== widgetId) return;
    if (data.type === 'visualize-widget:copy-snapshot') {
      buildSnapshotDataUrl()
        .then((dataUrl) => parent.postMessage({ type: 'visualize-widget:snapshot', id: widgetId, dataUrl }, '*'))
        .catch((error) => parent.postMessage({ type: 'visualize-widget:snapshot', id: widgetId, error: String(error?.message || error || 'snapshot failed') }, '*'));
      return;
    }
    if (data.type !== 'visualize-widget:update') return;
    applyHostCssVars(data.cssVars, data.theme);
    pendingUpdate = data;
    if (!renderFrame) renderFrame = requestAnimationFrame(() => {
      renderFrame = 0;
      const data = pendingUpdate;
      pendingUpdate = null;
      sanitizeAndRender(data.html, Boolean(data.final), data.title);
    });
  });
  window.addEventListener('load', postSize);
  window.addEventListener('resize', postSize);
  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(postSize);
    if (root) observer.observe(root);
  }
  if (root && typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver(() => requestAnimationFrame(postSize));
    observer.observe(root, { childList: true, subtree: true, characterData: true, attributes: true });
  }
  parent.postMessage({ type: 'visualize-widget:ready', id: widgetId }, '*');
  requestAnimationFrame(postSize);
})();
`, n = "https://cdnjs.cloudflare.com https://esm.sh https://cdn.jsdelivr.net https://unpkg.com";
	return [
		"<!doctype html>",
		"<html lang=\"zh-CN\">",
		"<head>",
		"<meta charset=\"utf-8\">",
		"<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">",
		`<meta http-equiv="Content-Security-Policy" content="${"default-src 'none'; script-src 'unsafe-inline' " + n + "; style-src 'unsafe-inline' " + n + "; img-src data: blob: " + n + "; media-src data: blob: " + n + "; font-src data: " + n + "; connect-src " + n + "; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"}">`,
		"<style>",
		Pe,
		Fe,
		"/* StreamViz owns both artifact palettes and legacy compatibility. */\n/* Compact artifact spacing: card gap 16, safe inset 12, component gap 8. */\n:is([data-aime-streamviz-root],[data-visualize-root]){--sv-card-gap:16px;--sv-card-padding:12px;--sv-component-gap:8px}\n/* Semantic contract; legacy card/metric classes are aliases, outer names do not matter. */\n:is([data-aime-streamviz-root],[data-visualize-root],[data-aime-streamviz-root] *,[data-visualize-root] *):not(:is(.card,.sv-card,[data-sv-card])):is([data-sv-layout],:has(>:is(.card,.sv-card,[data-sv-card],.metrics,[data-sv-layout]))){display:grid!important;gap:var(--sv-card-gap)!important;min-width:0!important}\n:is([data-aime-streamviz-root],[data-visualize-root],[data-aime-streamviz-root] *,[data-visualize-root] *):not(:is(.card,.sv-card,[data-sv-card])):is([data-sv-layout],:has(>:is(.card,.sv-card,[data-sv-card],.metrics,[data-sv-layout])))>:not(:is(style,script,template)){margin-block:0!important;min-width:0!important}\n:is([data-aime-streamviz-root],[data-visualize-root],[data-aime-streamviz-root] *,[data-visualize-root] *):is(.card,.sv-card,[data-sv-card],.metric,.sv-metric,[data-sv-metric]){padding:var(--sv-card-padding)!important;margin-block:0!important;min-width:0!important}\n:is([data-aime-streamviz-root],[data-visualize-root],[data-aime-streamviz-root] *,[data-visualize-root] *):is(.card,.sv-card,[data-sv-card]){display:flex!important;flex-direction:column!important;gap:var(--sv-component-gap)!important}\n:is([data-aime-streamviz-root],[data-visualize-root],[data-aime-streamviz-root] *,[data-visualize-root] *):is(.card,.sv-card,[data-sv-card])>:not(:is(style,script,template)){margin-block:0!important;min-width:0!important}\n:is([data-aime-streamviz-root],[data-visualize-root],[data-aime-streamviz-root] *,[data-visualize-root] *):is(.metrics,[data-sv-layout=\"metrics\"]){display:grid!important;grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr))!important;gap:var(--sv-card-gap)!important}\n:is([data-aime-streamviz-root],[data-visualize-root]) [data-sv-layout=\"stack\"]{grid-template-columns:minmax(0,1fr)!important}\n:is([data-aime-streamviz-root],[data-visualize-root]) [data-sv-layout=\"grid\"]{grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr))!important}\n:is([data-aime-streamviz-root],[data-visualize-root]) [data-sv-layout=\"components\"]{gap:var(--sv-component-gap)!important}\n:is([data-aime-streamviz-root],[data-visualize-root]) :is(.chips,.hk-chips,.bars,.sv-line-values){gap:var(--sv-component-gap)!important}\n/* Embedded reports use the host column in both palettes, without a second centered canvas. */\n:is([data-aime-streamviz-root],[data-visualize-root])>:is(div,main,section,article):not(:is(.card,.sv-card,[data-sv-card],.metric,.sv-metric,[data-sv-metric])){width:100%!important;max-width:none!important;margin-inline:0!important}\n/* Keep intrinsic chart widths inside their own scroll area, not the page grid. */\n:is([data-aime-streamviz-root],[data-visualize-root]){min-width:0;max-width:100%}\n:is([data-aime-streamviz-root],[data-visualize-root]) :is(div,section,article,header,footer){min-width:0}\n:is([data-aime-streamviz-root],[data-visualize-root]) :is(.chips,.sv-chips){flex-wrap:wrap}\n:is([data-aime-streamviz-root],[data-visualize-root]) .chip{max-width:100%;white-space:normal;overflow-wrap:anywhere}\n@media(max-width:640px){\n  :is([data-aime-streamviz-root],[data-visualize-root]) .metrics{grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr))!important}\n  :is([data-aime-streamviz-root],[data-visualize-root]) .metric{overflow-wrap:anywhere}\n  :is([data-aime-streamviz-root],[data-visualize-root]) :is(.sv-grid,.cols){grid-template-columns:minmax(0,1fr)!important}\n  .svx .bd{min-width:0!important}\n  .svx .bdr3,.svx .scale-r{grid-template-columns:88px minmax(0,1fr) 64px!important}\n  .svx .bdrow{padding:10px 8px;column-gap:8px}\n  .svx .bfrow{grid-template-columns:80px minmax(0,1fr) minmax(0,1fr);height:52px}\n  .svx :is(.bleft,.brgt){position:relative;padding-bottom:18px}\n  .svx .bval{position:absolute;bottom:0;min-width:0;font-size:11px}\n  .svx .bleft .bval{right:4px}\n  .svx .brgt .bval{left:4px}\n  .svx .bdaxis{padding-top:16px;height:42px}\n  .svx .bdval{position:absolute;top:0;right:0;font-size:11px}\n}\n.sv-responsive-line{width:100%;min-width:0;color:var(--sv-text-secondary);font-size:12px}\n.sv-line-note{margin:0 0 12px 48px;line-height:1.5}\n.sv-line-body{display:grid;grid-template-columns:48px minmax(0,1fr);grid-template-rows:minmax(0,1fr);height:clamp(220px,24vw,320px);box-sizing:border-box;padding-top:8px}\n.sv-line-y-axis,.sv-line-plot{position:relative;min-width:0;min-height:0}\n.sv-line-y-axis span{position:absolute;right:8px;transform:translateY(-50%);white-space:nowrap;font-variant-numeric:tabular-nums}\n.sv-line-plot svg{display:block;width:100%;height:100%;max-width:none}\n.sv-line-dot{position:absolute;left:100%;right:auto;width:7px;height:7px;box-sizing:border-box;border-radius:50%;transform:translate(-50%,-50%)}\n.sv-line-x-axis{position:relative;height:18px;margin:8px 0 0 48px}\n.sv-line-x-axis span{position:absolute;transform:translateX(-50%);white-space:nowrap}\n.sv-line-x-axis span:last-child{transform:translateX(-100%)}\n.sv-line-values{display:flex;justify-content:center;flex-wrap:wrap;gap:8px 20px;margin-top:10px;font-size:13px;line-height:1.5}\n.sv-line-values span{white-space:nowrap;font-variant-numeric:tabular-nums}\n.sv-line-values i{display:inline-block;width:16px;height:3px;margin-right:6px;vertical-align:middle}\n/* Generated palettes are aliases, never a separate fixed light/dark theme. */\n[data-aime-streamviz-root],[data-aime-streamviz-root] *{--c-bg:transparent!important;--c-surface:var(--sv-surface-primary)!important;--c-surface2:var(--sv-surface-secondary)!important;--c-border:var(--sv-border-subtle)!important;--c-text:var(--sv-text-primary)!important;--c-text2:var(--sv-text-secondary)!important;--c-muted:var(--sv-text-secondary)!important;--c-up:var(--sv-price-up)!important;--c-dn:var(--sv-price-down)!important;--c-flat:var(--sv-text-secondary)!important}\n:root:not([data-theme=\"dark\"]){color-scheme:light;--sv-gain:#08745f;--sv-loss:#c43244;--sv-warning:#925f0b;--sv-status-success:#08745f;--sv-status-danger:#c43244;--sv-bg-success:#e9f8f2;--sv-bg-warning:#fff5db;--sv-bg-danger:#fff0f1}\n:root[data-theme=\"dark\"]{color-scheme:dark;--sv-gain:#64b79d;--sv-loss:#ee777d;--sv-warning:#ffd28b;--sv-bg-success:#133c36;--sv-bg-warning:#493617;--sv-bg-danger:#49202a}\n[data-aime-streamviz-root]{color:var(--sv-text-primary)!important;background:transparent!important}\n[data-aime-streamviz-root] :is(h1,h2,h3,h4){color:var(--sv-text-primary)!important}\n:is(.stv,.sv-report,.svv,.sv){color:var(--sv-text-primary)!important}\n:is(.stv,.sv-report,.svv,.sv) :is(.card,.panel,.sv-metric,.sv-node,.sv-rank){background:var(--sv-surface-primary)!important;border-color:var(--sv-border-subtle)!important}\n:is(.stv,.sv-report,.svv,.sv) :is(.stat,.metric,.chart,.table-wrap,.sv-table-wrap){background:var(--sv-surface-secondary)!important;border-color:var(--sv-border-subtle)!important}\n:is(.stv,.sv-report,.svv,.sv) :is(.cap,.bles,.note,.sub,.lg,.sv-summary,.sv-narrative p,.sv-node span,.sv-metric p,.sv-metric small,.sv-note,.sv-kicker,.stat span){color:var(--sv-text-secondary)!important}\n:is(.stv,.sv-report,.svv,.sv) :is(table,.sv-node b,.sv-rank b,.sv-event b){color:var(--sv-text-primary)!important;border-color:var(--sv-border-subtle)!important}\n:is(.stv,.sv-report,.svv,.sv) :is(th,.sv-event time,.sv-rank small,.sv-event p){color:var(--sv-text-secondary)!important;background:var(--sv-surface-secondary)!important;border-color:var(--sv-border-subtle)!important}\n.stv .up{color:var(--sv-price-up)!important}.stv .dn{color:var(--sv-price-down)!important}.stv .nt{color:var(--sv-warning)!important}\n:is(.sv-chip--success,.sv-badge-success,.chip.success){color:var(--sv-status-success)!important;background:var(--sv-bg-success)!important}\n:is(.sv-chip--warning,.sv-badge-warning,.chip.warning){color:var(--sv-warning)!important;background:var(--sv-bg-warning)!important}\n:is(.sv-chip--danger,.sv-badge-danger,.chip.danger){color:var(--sv-status-danger)!important;background:var(--sv-bg-danger)!important}\n:is(.sv-chip--neutral,.sv-badge,.chip){color:var(--sv-text-secondary);background:var(--sv-surface-secondary);border-color:var(--sv-border-subtle)}\n:root:not([data-theme=\"dark\"]) [data-aime-streamviz-root] :is([style*=\"color:#8fa2bd\"],[style*=\"color:#c3cfe0\"],[style*=\"color:#b9c6dc\"],[style*=\"color:#c7d2e8\"]){color:var(--sv-text-secondary)!important}\n:root:not([data-theme=\"dark\"]) [data-aime-streamviz-root] svg :is(text[fill=\"#e8eefb\"],text[fill=\"#c3cfe0\"],g[fill=\"#c3cfe0\"],g[fill=\"#e8eefb\"]){fill:var(--sv-text-primary)!important}\n[data-aime-streamviz-root] svg :is(text[fill=\"#8fa2bd\"],g[fill=\"#8fa2bd\"]){fill:var(--sv-text-secondary)!important}\n:root:not([data-theme=\"dark\"]){--sv-surface-primary:#ffffff;--sv-surface-secondary:#f6f7f9}\n:root:not([data-theme=\"dark\"]){--sv-text-primary:#171b22;--sv-text-secondary:#5f6876;--sv-text-muted:#8b94a2;--sv-border-subtle:#edf0f4;--sv-chart-series-1:#4d63f6;--sv-chart-series-2:#00b899;--sv-chart-series-3:#ff2f57;--sv-status-success:#00b899;--sv-status-warning:#d97706;--sv-status-danger:#ff2f57}\n:root:not([data-theme=\"dark\"]) *{box-sizing:border-box}\nhtml,body{margin:0;background:transparent!important;color:var(--sv-text-primary);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,\"Segoe UI\",\"PingFang SC\",\"Microsoft YaHei\",sans-serif}\n:root:not([data-theme=\"dark\"]) [data-aime-streamviz-root]>.sv-wrap,:root:not([data-theme=\"dark\"]) .sv-wrap{width:100%!important;max-width:none!important;margin:0!important}\n:root:not([data-theme=\"dark\"]) .sv-muted{color:var(--sv-text-muted)}\n:root:not([data-theme=\"dark\"]) .sv-label{color:var(--sv-text-secondary)}\n:root:not([data-theme=\"dark\"]) .sv-badge{display:inline-flex;align-items:center;padding:5px 9px;border:1px solid var(--sv-border-subtle);border-radius:999px;font-size:12px}\n:root:not([data-theme=\"dark\"]) .sv-badge-success{color:#09836f;background:#eaf8f2;border-color:#b7e6d5}\n:root:not([data-theme=\"dark\"]) .sv-badge-warning{color:#a56417;background:#fff6df;border-color:#f0d28f}\n:root:not([data-theme=\"dark\"]) .sv-badge-danger{color:#c34650;background:#fff0f1;border-color:#ffc3c8}\n:root:not([data-theme=\"dark\"]) .svv{--bg:transparent!important;--card:#fff!important;--card2:#f6f7f9!important;--line:#dfe4eb!important;--text:#171b22!important;--muted:#667085!important;background:transparent!important;color:var(--text)!important;border-color:var(--line)!important;box-shadow:none!important}\n:root:not([data-theme=\"dark\"]) .svv :is(.sub,.lg,ul,[style*=\"color:#b9c6dc\"]){color:#475467!important}\n:root:not([data-theme=\"dark\"]) .svv .chip{color:#475467!important;background:#f6f7f9!important;border-color:#d0d5dd!important}\n:root:not([data-theme=\"dark\"]) .svv .chip.success{color:#08745f!important;background:#e9f8f2!important;border-color:#9bdac7!important}\n:root:not([data-theme=\"dark\"]) .svv .chip.warning{color:#925f0b!important;background:#fff5db!important;border-color:#ebc86f!important}\n:root:not([data-theme=\"dark\"]) .svv .chip.danger{color:#b42335!important;background:#fff0f1!important;border-color:#f4aeb7!important}\n:root:not([data-theme=\"dark\"]) .svv :is(.chart,.table-wrap){background:transparent!important}\n:root:not([data-theme=\"dark\"]) .svv :is(.panel,.rank-html){background:#f6f7f9!important}\n:root:not([data-theme=\"dark\"]) .svv table{color:#344054!important}\n:root:not([data-theme=\"dark\"]) .svv thead th{color:#667085!important}\n:root:not([data-theme=\"dark\"]) .svv tbody td{border-color:#dfe4eb!important}\n:root:not([data-theme=\"dark\"]) .svv svg text[fill=\"#e8eefb\"]{fill:#344054!important}\n:root:not([data-theme=\"dark\"]) .svv svg text[fill=\"#93a4bd\"]{fill:#667085!important}\n:root:not([data-theme=\"dark\"]) .svv svg :is(line,path)[stroke=\"#233247\"]{stroke:#cbd3df!important}\n:root:not([data-theme=\"dark\"]) .svv svg line[stroke=\"#93a4bd\"]{stroke:#98a2b3!important}\n\n:root[data-theme=\"dark\"]{--sv-surface-primary:#181818;--sv-surface-secondary:#202020}\n:root[data-theme=\"dark\"]{color-scheme:dark;--sv-text-primary:#f5f5f5;--sv-text-secondary:#aaa;--sv-text-muted:#858585;--sv-border-subtle:#343434;--sv-chart-series-1:#a580ef;--sv-chart-series-2:#64b79d;--sv-chart-series-3:#ee777d;--sv-status-success:#64b79d;--sv-status-warning:#f6ad55;--sv-status-danger:#ee777d}\n:root[data-theme=\"dark\"] html,:root[data-theme=\"dark\"] body{color:var(--sv-text-primary)}\n:root[data-theme=\"dark\"] .svv{--bg:transparent!important;--card:#181e28!important;--card2:#181e28!important;--line:#334052!important;--text:#f1f5f9!important;--muted:#aab6c7!important;background:transparent!important;color:var(--text)!important;border-color:var(--line)!important;box-shadow:none!important}\n:root[data-theme=\"dark\"] .svv :is(.sub,.lg,ul,[style*=\"color:#b9c6dc\"]){color:#c1cad7!important}\n:root[data-theme=\"dark\"] .svv .chip{color:#dbe3ee!important;background:#202733!important;border-color:#465268!important}\n:root[data-theme=\"dark\"] .svv .chip.success{color:#7ce6c6!important;background:#133c36!important;border-color:#276658!important}\n:root[data-theme=\"dark\"] .svv .chip.warning{color:#ffd28b!important;background:#493617!important;border-color:#806128!important}\n:root[data-theme=\"dark\"] .svv .chip.danger{color:#ffabb7!important;background:#49202a!important;border-color:#7b3643!important}\n:root[data-theme=\"dark\"] .svv :is(.chart,.table-wrap){background:transparent!important}\n:root[data-theme=\"dark\"] .svv :is(.panel,.rank-html){background:#181e28!important}\n:root[data-theme=\"dark\"] .svv table{color:#dbe3ee!important}\n:root[data-theme=\"dark\"] .svv thead th{color:#aab6c7!important}\n:root[data-theme=\"dark\"] .svv tbody td{border-color:#334052!important}\n:root[data-theme=\"dark\"] .svv svg text[fill=\"#e8eefb\"]{fill:#dbe3ee!important}\n:root[data-theme=\"dark\"] .svv svg text[fill=\"#93a4bd\"]{fill:#aab6c7!important}\n:root[data-theme=\"dark\"] .svv svg :is(line,path)[stroke=\"#233247\"]{stroke:#334052!important}\n:root[data-theme=\"dark\"] .svv svg line[stroke=\"#93a4bd\"]{stroke:#7d8ca3!important}\n:root[data-theme=\"dark\"] .sv-report{color:#f1f5f9!important;background:transparent!important}\n:root[data-theme=\"dark\"] .sv-report :is(.sv-kicker,.sv-lead,.dsub,.dlabel,.dlabel-flat,.dhead-c,.bval,.tval,.mv-meta,.keyline){color:#aab6c7!important}\n:root[data-theme=\"dark\"] .sv-report :is(.card,.metric){background:#181e28!important;border-color:#334052!important}\n:root[data-theme=\"dark\"] .sv-report :is(.metric span,.metric em,.bname em,.tname em,.mv-id em){color:#aab6c7!important}\n:root[data-theme=\"dark\"] .sv-report .chip{color:#dbe3ee!important;background:#202733!important;border-color:#465268!important}\n:root[data-theme=\"dark\"] .sv-report .chip.success{color:#7ce6c6!important;background:#133c36!important;border-color:#276658!important}\n:root[data-theme=\"dark\"] .sv-report .chip.warning{color:#ffd28b!important;background:#493617!important;border-color:#806128!important}\n:root[data-theme=\"dark\"] .sv-report .chip.danger{color:#ffabb7!important;background:#49202a!important;border-color:#7b3643!important}\n:root[data-theme=\"dark\"] .sv-report .counts li{color:#aab6c7!important;border-color:#334052!important}\n:root[data-theme=\"dark\"] .sv-report .counts b{color:#f1f5f9!important}\n:root[data-theme=\"dark\"] .sv-report :is(.btrack,.ttrack){background:#202733!important}\n:root[data-theme=\"dark\"] .sv-report .mv{border-color:#334052!important}\n:root[data-theme=\"dark\"] .sv-report .note{color:#aab6c7!important;background:#181e28!important;border-color:#334052!important}\n:root[data-theme=\"dark\"] .sv-report .note b{color:#dbe3ee!important}\n:root[data-theme=\"dark\"] .sv{--ink:#f1f5f9!important;--sub:#aab6c7!important;--line:#334052!important;--card:#181e28!important;color:#f1f5f9!important}\n:root[data-theme=\"dark\"] .sv .sv-sum,:root[data-theme=\"dark\"] .sv .two p,:root[data-theme=\"dark\"] .sv ol.steps{color:#c1cad7!important}\n:root[data-theme=\"dark\"] .sv ol.steps b{color:#f1f5f9!important}\n:root[data-theme=\"dark\"] .sv .sv-metric,:root[data-theme=\"dark\"] .sv .pp-tabs>div,:root[data-theme=\"dark\"] .sv .sv-narr>div,:root[data-theme=\"dark\"] .sv .sv-note,:root[data-theme=\"dark\"] .sv svg.payoff,:root[data-theme=\"dark\"] .sv-card,:root[data-theme=\"dark\"] .sv-metric{background:#181e28!important;border-color:#334052!important;color:#f1f5f9!important}\n:root[data-theme=\"dark\"] .sv table{color:#dbe3ee!important}\n:root[data-theme=\"dark\"] .sv thead th{color:#aab6c7!important;border-color:#334052!important}\n:root[data-theme=\"dark\"] .sv tbody td{border-color:#2b3544!important}\n:root[data-theme=\"dark\"] .sv tbody tr.hl{background:#1f3b46!important}\n:root[data-theme=\"dark\"] .sv svg .ax,:root[data-theme=\"dark\"] .sv svg .lk,:root[data-theme=\"dark\"] .sv svg .lg{fill:#b9c5d5!important}\n:root[data-theme=\"dark\"] .sv svg rect[fill=\"#eef2f7\"],:root[data-theme=\"dark\"] .sv svg rect[fill=\"#f8fafc\"]{fill:#202733!important}\n:root[data-theme=\"dark\"] .sv-badge-success,:root[data-theme=\"dark\"] .sv .sv-chip.success{color:#7ce6c6!important;background:#133c36!important;border-color:#276658!important}\n:root[data-theme=\"dark\"] .sv-badge-warning,:root[data-theme=\"dark\"] .sv .sv-chip.warning{color:#ffd28b!important;background:#493617!important;border-color:#806128!important}\n:root[data-theme=\"dark\"] .sv-badge-danger,:root[data-theme=\"dark\"] .sv .sv-chip.danger{color:#ffabb7!important;background:#49202a!important;border-color:#7b3643!important}\n\n/* Report tables sit on the same card surface as ranked lists. Override the\n   widget runtime's independent neutral table palette inside report roots. */\n:is([data-aime-streamviz-root],[data-visualize-root]) :is(table,.table-wrap,.sv-table-wrap){background:transparent!important;border-color:var(--sv-border-subtle)!important}\n:is([data-aime-streamviz-root],[data-visualize-root]) thead th{background:var(--sv-surface-primary)!important;color:var(--sv-text-secondary)!important;border-color:var(--sv-border-subtle)!important}\n\n/* Financial direction is market-specific; success/danger remain status colors. */\n:root{--sv-price-up:var(--sv-loss);--sv-price-down:var(--sv-gain);--sv-price-flat:var(--sv-text-secondary)}\n[data-financial-market=\"CN\"],[data-financial-market=\"HK\"]{--sv-price-up:var(--sv-loss);--sv-price-down:var(--sv-gain)}\n[data-financial-market=\"US\"]{--sv-price-up:var(--sv-gain);--sv-price-down:var(--sv-loss)}\n\n/* Report sections stay open; compact metrics have their own outlined cards. */\n:root[data-theme] :is([data-aime-streamviz-root],[data-visualize-root]) :is(.sv-head,.sv-metrics){border:0!important}\n:root[data-theme] :is([data-aime-streamviz-root],[data-visualize-root]) :is(.sv-metric,.metric,.stat):not([data-sv-surface]){background:transparent!important;border-width:1px!important;border-style:solid!important;border-color:var(--sv-border-subtle)!important;border-radius:8px!important;box-shadow:none!important}\n:root[data-theme] :is([data-aime-streamviz-root],[data-visualize-root]) :is(.sv-head,.sv-section,.sv-note){border-color:var(--sv-border-subtle)!important}\n:root[data-theme] :is([data-aime-streamviz-root],[data-visualize-root]) :is(.sv-chip--success,.sv-badge-success,.chip.success){color:var(--sv-text-success,var(--sv-status-success))!important;background:var(--sv-bg-success)!important;border-color:var(--sv-border-success,var(--sv-border-subtle))!important}\n:root[data-theme] :is([data-aime-streamviz-root],[data-visualize-root]) :is(.sv-chip--warning,.sv-badge-warning,.chip.warning){color:var(--sv-text-warning,var(--sv-warning))!important;background:var(--sv-bg-warning)!important;border-color:var(--sv-border-warning,var(--sv-border-subtle))!important}\n:root[data-theme] :is([data-aime-streamviz-root],[data-visualize-root]) :is(.sv-chip--danger,.sv-badge-danger,.chip.danger){color:var(--sv-text-danger,var(--sv-status-danger))!important;background:var(--sv-bg-danger)!important;border-color:var(--sv-border-danger,var(--sv-border-subtle))!important}\n\n/* Standalone reports and sandboxed reports share the semantic runtime palette. */\n:root:not([data-theme=\"dark\"]){--sv-text-success:var(--sv-jade-11,#208368);--sv-text-warning:var(--sv-amber-11,#915930);--sv-text-danger:var(--sv-red-11,#ce2c31);--sv-border-success:var(--sv-jade-7,#92ceac);--sv-border-warning:var(--sv-amber-7,#e8c36a);--sv-border-danger:var(--sv-red-7,#f3aeaf);--sv-bg-success:var(--sv-jade-3,#e6f4ea);--sv-bg-warning:var(--sv-amber-3,#fff3d0);--sv-bg-danger:var(--sv-red-3,#feebec)}\n:root[data-theme=\"dark\"]{--sv-text-success:var(--sv-jade-11,#7ce2bd);--sv-text-warning:var(--sv-amber-11,#facf72);--sv-text-danger:var(--sv-red-11,#ff9592);--sv-border-success:var(--sv-jade-7,#1b5745);--sv-border-warning:var(--sv-amber-7,#6a4f0b);--sv-border-danger:var(--sv-red-7,#7e2e33);--sv-bg-success:var(--sv-jade-3,#132d21);--sv-bg-warning:var(--sv-amber-3,#35290f);--sv-bg-danger:var(--sv-red-3,#3b1219)}\n/* Timeline copy stays on the page; only status badges get a tinted surface. */\n:root[data-theme] :is([data-aime-streamviz-root],[data-visualize-root]) :is(.sv-event time,.sv-event p,.sv-rank small){background:transparent!important}\n:root[data-theme] :is([data-aime-streamviz-root],[data-visualize-root]) .sv-timeline{border-left:1px solid var(--sv-border-subtle)!important}\n:root[data-theme] :is([data-aime-streamviz-root],[data-visualize-root]) .sv-chip{border-width:.5px!important}\n/* Timeline events without dates do not reserve an empty tinted date column. */\n:root[data-theme] :is([data-aime-streamviz-root],[data-visualize-root]) .sv-event:is(:has(>time:empty),:not(:has(>time))){grid-template-columns:minmax(0,1fr)!important}\n:root[data-theme] :is([data-aime-streamviz-root],[data-visualize-root]) .sv-event>time:empty{display:none!important}\n:root[data-theme] :is([data-aime-streamviz-root],[data-visualize-root]) .sv-timeline :is(time,p){background:transparent!important;border:0!important;color:var(--sv-text-secondary)!important}\n\n/* Template reports share the compact metric rhythm; legacy margins must not stack. */\n:root[data-theme] :is([data-aime-streamviz-root],[data-visualize-root]) .sv-metrics{display:grid!important;grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr))!important;gap:var(--sv-card-gap)!important;padding:12px 0!important;align-items:start}\n:root[data-theme] :is([data-aime-streamviz-root],[data-visualize-root]) .sv-metric{display:grid!important;gap:var(--sv-component-gap)!important;align-content:start}\n:root[data-theme] :is([data-aime-streamviz-root],[data-visualize-root]) .sv-metric>:is(p,strong,small){margin:0!important;line-height:1.5;overflow-wrap:anywhere}\n:root[data-theme] :is([data-aime-streamviz-root],[data-visualize-root]) .sv-metric strong{font-size:clamp(22px,2.5vw,27px);line-height:1.3}\n/* Place the dot's centre on the centre of the 1px connector, independent of radius. */\n:root[data-theme] :is([data-aime-streamviz-root],[data-visualize-root]) .sv-timeline{--sv-timeline-inset:20px;padding-left:var(--sv-timeline-inset)!important}\n:root[data-theme] :is([data-aime-streamviz-root],[data-visualize-root]) .sv-event::before{left:calc(-1 * var(--sv-timeline-inset) - .5px)!important;transform:translateX(-50%);background:var(--sv-chart-series-1)!important}\n\n/* Compact metric cards tile across the available width and wrap as a group. */\n:root :is([data-aime-streamviz-root],[data-visualize-root]) :is([data-sv-metric],.metrics>.insight){box-sizing:border-box;min-width:0!important;padding:var(--sv-card-padding)!important;margin:0!important;border-width:1px!important;border-style:solid!important;border-color:var(--sv-border-subtle)!important;border-radius:8px!important;background:transparent!important;overflow-wrap:anywhere}\n:root[data-theme] :is([data-aime-streamviz-root],[data-visualize-root]) :is(.metrics,.sv-metrics,[data-sv-layout=\"metrics\"]){align-items:stretch!important}\n@media(max-width:640px){\n  :root[data-theme] :is([data-aime-streamviz-root],[data-visualize-root]) :is(.metrics,.sv-metrics,[data-sv-layout=\"metrics\"]){grid-template-columns:repeat(auto-fit,minmax(min(100%,120px),1fr))!important;gap:12px!important}\n  :root :is([data-aime-streamviz-root],[data-visualize-root]) :is(.stat-value,.sv-metric strong){font-size:22px!important}\n}\n\n/* Mobile summary metrics form compact swipeable cards, not a vertical feed. */\n@media(max-width:760px){\n :root[data-theme] :is([data-aime-streamviz-root],[data-visualize-root]) :is(.metrics,.sv-metrics,.pv-metrics,[data-sv-layout=\"metrics\"]){\n  display:grid!important;grid-auto-flow:column!important;grid-template-columns:none!important;\n  grid-auto-columns:clamp(196px,68vw,260px)!important;grid-template-rows:auto!important;\n  gap:10px!important;align-items:stretch!important;max-width:100%;min-width:0;\n  overflow-x:auto!important;overflow-y:hidden;scroll-snap-type:x mandatory;\n  scroll-padding-inline:1px;overscroll-behavior-inline:contain;-webkit-overflow-scrolling:touch;\n  padding:2px 1px 8px!important;scrollbar-width:thin;scrollbar-color:var(--sv-border-subtle) transparent;\n }\n :root[data-theme] :is([data-aime-streamviz-root],[data-visualize-root]) :is(.metrics,.sv-metrics,.pv-metrics,[data-sv-layout=\"metrics\"])>:not(:is(style,script,template)){\n  display:flex!important;flex-direction:column;justify-content:flex-start;gap:6px!important;\n  width:auto!important;min-width:0!important;min-height:0!important;height:auto!important;\n  padding:10px!important;margin:0!important;box-sizing:border-box;scroll-snap-align:start;\n }\n :root[data-theme] :is([data-aime-streamviz-root],[data-visualize-root]) :is(.metrics,.sv-metrics,.pv-metrics,[data-sv-layout=\"metrics\"])>:not(:is(style,script,template))>:is(p,strong,small,em){margin:0!important;overflow-wrap:anywhere}\n :root[data-theme] :is([data-aime-streamviz-root],[data-visualize-root]) :is(.metrics,.sv-metrics,.pv-metrics,[data-sv-layout=\"metrics\"])>:not(:is(style,script,template))>p{font-size:13px;line-height:1.4}\n :root[data-theme] :is([data-aime-streamviz-root],[data-visualize-root]) :is(.metrics,.sv-metrics,.pv-metrics,[data-sv-layout=\"metrics\"])>:not(:is(style,script,template))>strong{font-size:24px!important;line-height:1.2!important;white-space:nowrap}\n :root[data-theme] :is([data-aime-streamviz-root],[data-visualize-root]) :is(.metrics,.sv-metrics,.pv-metrics,[data-sv-layout=\"metrics\"])>:not(:is(style,script,template))>:is(small,em){font-size:12px;line-height:1.45}\n}\n\n/* Table headers stay on one line; each wide table owns its horizontal scroll. */\n:root[data-theme] :is([data-aime-streamviz-root],[data-visualize-root]) :is(.table-wrap,.sv-table-wrap,.pv-table-wrap){overflow-x:auto!important;max-width:100%;min-width:0}\n:root[data-theme] :is([data-aime-streamviz-root],[data-visualize-root]) th{white-space:nowrap!important;word-break:normal!important;overflow-wrap:normal!important}\n:root[data-theme] :is([data-aime-streamviz-root],[data-visualize-root]) .pv-table-wrap table{table-layout:auto!important;min-width:640px;width:100%}\n:root[data-theme] :is([data-aime-streamviz-root],[data-visualize-root]) .pv-table-wrap :is(th,td):nth-last-child(-n+2){white-space:nowrap!important;min-width:92px}\n\n/* Touch feedback is handled by the host; avoid native tap overlay blocks. */\nhtml{-webkit-tap-highlight-color:transparent}\n\n/* Additional categorical series stay distinct from the first three in both themes. */\n:root:not([data-theme=\"dark\"]){--sv-chart-series-4:#d97706;--sv-chart-series-5:#8e4ec6;--sv-chart-series-6:#0090ff;--sv-chart-series-7:#ab4aba;--sv-chart-series-8:#46a758}\n:root[data-theme=\"dark\"]{--sv-chart-series-4:#f6ad55;--sv-chart-series-5:#d19dff;--sv-chart-series-6:#70b8ff;--sv-chart-series-7:#e796f3;--sv-chart-series-8:#7ce2bd}\n\n/* Double-ring charts: subdued surfaces and readable hierarchy in dark mode.\n   Ratios, series colors, labels and light-mode output remain data-owned. */\n:root[data-theme=\"dark\"] .double-ring-component {\n  --ring-surface:#111214;\n  --ring-track:#25272c;\n  --ring-text:#f1f2f4;\n  --ring-muted:#a2a6af;\n  --ring-tooltip:#23252a;\n  --ring-border:rgba(255,255,255,.09);\n  padding:16px 20px 20px!important;\n  color:var(--ring-text);\n}\n:root[data-theme=\"dark\"] .double-ring-component .ring-layout {gap:16px!important}\n:root[data-theme=\"dark\"] .double-ring-component .ring-stage {height:280px!important;min-width:0}\n:root[data-theme=\"dark\"] .double-ring-component .ring-stage>svg {width:280px!important;height:280px!important;max-width:100%;flex-shrink:1}\n:root[data-theme=\"dark\"] .double-ring-component .ring-track {fill:var(--ring-track)!important}\n:root[data-theme=\"dark\"] .double-ring-component .ring-arc {stroke:var(--ring-surface);stroke-width:1.5;stroke-linejoin:round;transition:opacity .15s ease}\n:root[data-theme=\"dark\"] .double-ring-component .center-text {fill:var(--ring-text)!important;font-size:18px!important;font-weight:650!important;font-variant-numeric:tabular-nums}\n:root[data-theme=\"dark\"] .double-ring-component .center-text:first-of-type:not(:last-of-type),\n:root[data-theme=\"dark\"] .double-ring-component .center-caption {fill:var(--ring-muted)!important;font-size:12px!important;font-weight:400!important}\n:root[data-theme=\"dark\"] .double-ring-component .component-title {color:var(--ring-text)!important;font-size:15px!important;font-weight:600!important;line-height:1.5!important;margin-bottom:12px!important}\n:root[data-theme=\"dark\"] .double-ring-component .ring-legend {gap:12px 20px!important;color:var(--ring-muted)!important;font-size:12px!important;line-height:1.5!important}\n:root[data-theme=\"dark\"] .double-ring-component .legend-item {gap:7px}\n:root[data-theme=\"dark\"] .double-ring-component .legend-dot {width:7px;height:7px;flex:none}\n:root[data-theme=\"dark\"] .double-ring-component .ring-legend .legend-item:first-child .legend-dot {background:var(--ring-track)!important;box-shadow:inset 0 0 0 1px #70757e}\n:root[data-theme=\"dark\"] .double-ring-component .ring-baseline {color:var(--ring-muted)!important;font-size:12px;line-height:1.5}\n:root[data-theme=\"dark\"] .double-ring-component .ring-tooltip {background:var(--ring-tooltip)!important;color:var(--ring-text)!important;border:1px solid var(--ring-border);border-radius:8px;padding:10px 12px;font-size:12px;line-height:1.5;box-shadow:0 6px 20px #0004}\n:root[data-theme=\"dark\"] .double-ring-component .ring-tooltip::after {background:var(--ring-tooltip)!important}\n@media(max-width:520px){\n  :root[data-theme=\"dark\"] .double-ring-component {padding:12px 16px 16px!important}\n  :root[data-theme=\"dark\"] .double-ring-component .ring-stage {height:232px!important}\n  :root[data-theme=\"dark\"] .double-ring-component .ring-stage>svg {width:232px!important;height:232px!important}\n  :root[data-theme=\"dark\"] .double-ring-component .ring-legend {gap:10px 16px!important}\n}\n@media(prefers-reduced-motion:reduce){\n  :root[data-theme=\"dark\"] .double-ring-component :is(.ring-arc,.ring-track,.ring-highlight,.ring-tooltip){transition:none}\n}\n\n/* Neutral dark report tables, including saved StreamViz artifacts. */\n/* Neutral night applies to new templates and the old private palette aliases.\n   Financial direction and success/error states stay independent. */\n:root[data-theme=\"dark\"] :is(.sv,.svv,.sv-report,.stv){--ink:var(--sv-text-primary)!important;--sub:var(--sv-text-secondary)!important;--text:var(--sv-text-primary)!important;--muted:var(--sv-text-secondary)!important;--line:var(--sv-border-subtle)!important;--card:var(--sv-surface-primary)!important;--card2:var(--sv-surface-secondary)!important;color:var(--sv-text-primary)!important}\n:root[data-theme=\"dark\"] :is([data-aime-streamviz-root],[data-visualize-root],.sv,.svv,.sv-report,.stv) :is(.card,.panel,.sv-card,.sv-node,.sv-rank,.rank-html,[data-sv-card]){background:var(--sv-surface-primary)!important;border-color:var(--sv-border-subtle)!important;box-shadow:none!important;border-radius:8px!important}\n:root[data-theme=\"dark\"] :is(.sv,.svv,.sv-report,.stv) :is(.sub,.lg,ul,.note,.sv-note,.sv-sum,.sv-narrative p,.dsub,.dlabel,.dlabel-flat,.keyline,.sv-rank small){color:var(--sv-text-secondary)!important}\n:root[data-theme=\"dark\"] :is(.sv,.svv,.sv-report,.stv) :is(.sv-note,.note,.pp-tabs>div,.sv-narr>div,svg.payoff){background:var(--sv-surface-primary)!important;border-color:var(--sv-border-subtle)!important}\n:root[data-theme=\"dark\"] :is(.sv,.svv,.sv-report,.stv) :is(.btrack,.ttrack){background:var(--sv-surface-secondary)!important}\n:root[data-theme=\"dark\"] :is(.sv,.svv,.sv-report,.stv) .chip:not(:is(.success,.warning,.danger)){background:var(--sv-surface-secondary)!important;color:var(--sv-text-secondary)!important;border-color:var(--sv-border-subtle)!important}\n:root[data-theme] :is([data-aime-streamviz-root],[data-visualize-root]) .sv-rank>strong{white-space:nowrap;font-variant-numeric:tabular-nums}\n/* Only explicitly typed directional values receive financial color. */\n:root[data-theme] :is([data-aime-streamviz-root],[data-visualize-root]) [data-sv-direction=\"up\"]{color:var(--sv-price-up)!important}\n:root[data-theme] :is([data-aime-streamviz-root],[data-visualize-root]) [data-sv-direction=\"down\"]{color:var(--sv-price-down)!important}\n:root[data-theme] :is([data-aime-streamviz-root],[data-visualize-root]) [data-sv-direction=\"flat\"]{color:var(--sv-price-flat)!important}\n:root[data-theme=\"dark\"] :is([data-aime-streamviz-root],[data-visualize-root],.sv,.svv,.sv-report,.stv) :is(.sv-table-wrap,.table-wrap){background:transparent!important;border:1px solid #2c2c2c!important;border-radius:10px!important}\n:root[data-theme=\"dark\"] :is([data-aime-streamviz-root],[data-visualize-root],.sv,.svv,.sv-report,.stv) table{background:transparent!important;color:#d4d4d4}\n:root[data-theme=\"dark\"] :is([data-aime-streamviz-root],[data-visualize-root],.sv,.svv,.sv-report,.stv) table thead tr th{background:#1c1c1c!important;color:#e4e4e4!important}\n:root[data-theme=\"dark\"] :is([data-aime-streamviz-root],[data-visualize-root],.sv,.svv,.sv-report,.stv) table :is(thead,tbody) tr :is(th,td){border-color:#2c2c2c!important}\n:root[data-theme=\"dark\"] :is([data-aime-streamviz-root],[data-visualize-root],.sv,.svv,.sv-report,.stv) :is(tbody,tr,td){background:transparent!important}\n\n/* Reports share the host canvas in both themes and throughout streaming/export. */\n:root[data-theme] :is([data-aime-streamviz-root],[data-visualize-root]){background:transparent!important;background-image:none!important}\n:root[data-theme] :is([data-aime-streamviz-root],[data-visualize-root]) :is(.sv-native-canvas,.card,.panel,.sv-card,[data-sv-card],.sv-section){background:transparent!important;background-image:none!important;box-shadow:none!important}\n",
		"</style>",
		"<link rel=\"stylesheet\" media=\"print\" onload=\"this.media='all'\" href=\"https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.34.1/dist/tabler-icons.min.css\">",
		"</head>",
		"<body>",
		"<div id=\"root\"></div>",
		"<script>",
		t,
		"<\/script>",
		"</body>",
		"</html>"
	].join("\n");
};
//#endregion
//#region ../../../Users/yunsa/.Trash/mentora-inline-fix-20261027-1826/mentora-inline-fix-20261027/node_modules/streamviz-react/src/react/useStreamingCode.ts
function Le(e, t, n) {
	let r = (0, T.useRef)(!t), i = (0, T.useRef)(e);
	i.current = e, t || (r.current = !0);
	let [a, o] = (0, T.useState)(t ? e : ""), s = (0, T.useRef)(a);
	return (0, T.useEffect)(() => {
		if (!n || !r.current) {
			s.current = e, o(e);
			return;
		}
		let t, a = () => {
			let e = String(i.current || ""), n = s.current, r = e.length - n.length, c = Math.max(4, Math.ceil(r / 6)), l = e.startsWith(n) ? e.slice(0, n.length + c) : e;
			s.current = l, o(l), l !== e && (t = requestAnimationFrame(a));
		};
		return t = requestAnimationFrame(a), () => cancelAnimationFrame(t);
	}, [
		e,
		t,
		n
	]), {
		code: n ? a : e,
		final: t && (!n || a === e)
	};
}
//#endregion
//#region ../../../Users/yunsa/.Trash/mentora-inline-fix-20261027-1826/mentora-inline-fix-20261027/node_modules/react/cjs/react-jsx-runtime.production.js
var Re = /* @__PURE__ */ o(((e) => {
	var t = Symbol.for("react.transitional.element");
	function n(e, n, r) {
		var i = null;
		if (r !== void 0 && (i = "" + r), n.key !== void 0 && (i = "" + n.key), "key" in n) for (var a in r = {}, n) a !== "key" && (r[a] = n[a]);
		else r = n;
		return n = r.ref, {
			$$typeof: t,
			type: e,
			key: i,
			ref: n === void 0 ? null : n,
			props: r
		};
	}
	e.jsx = n, e.jsxs = n;
})), ze = (/* @__PURE__ */ o(((e, t) => {
	t.exports = Re();
})))(), Be = (e) => e * 4, Ve = 1e3, He = Be(12), Ue = "正在生成可视化代码", We = 1e3, Ge = 8e3, Ke = (e, t) => /* @__PURE__ */ (0, ze.jsx)(e === "check" ? ge : e === "copy" ? be : e === "download" ? Se : ve, {
	className: t.className || "visualize-widget-action-icon",
	"aria-hidden": "true",
	strokeWidth: 1.75
});
function qe({ title: e, code: t, exportCode: n, loadingMessage: r, loadingMessages: i, loadingDwellMs: a = We, final: o, smoothStreaming: s = !1, showActions: c = !0, onSendPrompt: l, renderIcon: u = Ke, notify: d, writeImageToClipboard: f, theme: p, getTheme: m, cssVarNames: h = Oe }) {
	let { code: g, final: _ } = Le(t, o, s), v = (0, T.useRef)(null), x = (0, T.useRef)(null), te = (0, T.useRef)(`visualize-widget-${Math.random().toString(36).slice(2)}`), [ne, re] = (0, T.useState)(""), C = (0, T.useMemo)(() => y(n || g), [g, n]), ie = String(g || "").trim().length > 0, ae = (0, T.useMemo)(() => _ ? g : S(g), [g, _]), oe = (0, T.useMemo)(() => De(ae), [ae]), [w, se] = (0, T.useState)(() => b(C) || He), [ce, le] = (0, T.useState)(!1), [ue, de] = (0, T.useState)(!1), [fe, pe] = (0, T.useState)(!1), [me, he] = (0, T.useState)(!1), [ge, _e] = (0, T.useState)(0), [ve, ye] = (0, T.useState)(() => !!(_ && ie)), [be, xe] = (0, T.useState)(null), Se = (0, T.useRef)(""), O = (0, T.useRef)({
		code: "",
		final: !1
	}), k = (0, T.useRef)(null), ke = (0, T.useRef)(""), Ne = (0, T.useRef)(_);
	Ne.current = _;
	let Pe = (0, T.useRef)(null), Fe = (0, T.useMemo)(() => Ie(te.current), []), Re = (0, T.useMemo)(() => Ae(p), [p]), Be = je(p, m), qe = (0, T.useMemo)(() => {
		let e = Array.isArray(i) ? i.map((e) => String(e || "").trim()).filter(Boolean) : [], t = String(r || "").trim();
		return !e.length && t && t !== Ue && e.push(t), Array.from(new Set(e));
	}, [r, i]), Je = (0, T.useMemo)(() => qe.length ? qe : [Ue], [qe]), A = be || Je, Ye = A[ge % A.length] || Ue, Xe = ve ? ae : "", Ze = String(Xe || "").trim().length > 0, Qe = !Ze, $e = c && _ && ue && Ze, et = () => {
		let t = x.current?.contentWindow;
		t && t.postMessage({
			type: "visualize-widget:update",
			id: te.current,
			title: e,
			html: O.current.code,
			final: O.current.final,
			cssVars: Se.current,
			theme: Be
		}, "*");
	};
	(0, T.useEffect)(() => {
		let e = v.current;
		if (!e) return;
		let t = Me(window.getComputedStyle(e), h) + Re;
		Se.current = t, re(t);
	}, [h, Re]), (0, T.useEffect)(() => {
		le(!1), de(!1);
	}, [Fe]), (0, T.useEffect)(() => {
		_e(0);
	}, [A]), (0, T.useEffect)(() => {
		if (!be) {
			if (qe.length) {
				xe(qe);
				return;
			}
			ie && xe([Ue]);
		}
	}, [
		ie,
		be,
		qe
	]), (0, T.useEffect)(() => {
		if (!ie) {
			ye(!1);
			return;
		}
		if (!oe && !_) {
			ye(!1);
			return;
		}
		if (a <= 0) {
			ye(!0);
			return;
		}
		if (_) {
			ye(!0);
			return;
		}
		if (ve) return;
		let e = a * A.length, t = window.setTimeout(() => ye(!0), e);
		return () => window.clearTimeout(t);
	}, [
		A.length,
		_,
		ie,
		oe,
		a,
		ve
	]), (0, T.useEffect)(() => {
		if (!Qe || A.length <= 1) return;
		let e = window.setInterval(() => {
			_e((e) => e + 1);
		}, We);
		return () => window.clearInterval(e);
	}, [A.length, Qe]), (0, T.useEffect)(() => {
		let e = (e) => {
			if (e.source !== x.current?.contentWindow) return;
			let t = e.data || {};
			if (t.id !== te.current) return;
			if (t.type === "visualize-widget:ready") {
				le(!0), et();
				return;
			}
			if (t.type === "visualize-widget:rendered") {
				let e = !!t.hasContent;
				de(e), !e && !Ne.current && ye(!1);
				return;
			}
			if (t.type === "visualize-widget:snapshot") {
				let e = Pe.current;
				if (!e) return;
				if (window.clearTimeout(e.timer), Pe.current = null, t.error) {
					e.reject(Error(String(t.error)));
					return;
				}
				e.resolve(String(t.dataUrl || ""));
				return;
			}
			if (t.type === "visualize-widget:send-prompt") {
				let e = String(t.prompt || "").trim().slice(0, 4e3);
				e && l?.(e);
				return;
			}
			if (t.type !== "visualize-widget:size") return;
			if (t.hasContent === !1) {
				k.current = null, ke.current = "", Ne.current || se((e) => e > He ? He : e);
				return;
			}
			let n = Te(Number(t.height) || 0, He);
			k.current = n, ke.current = y(O.current.code), C && n > He && ee(C, n), se((e) => Math.abs(e - n) <= 2 ? e : n);
		};
		return window.addEventListener("message", e), () => window.removeEventListener("message", e);
	}, [
		l,
		Be,
		C,
		e
	]), (0, T.useEffect)(() => () => {
		let e = Pe.current;
		e && (window.clearTimeout(e.timer), Pe.current = null, e.reject(/* @__PURE__ */ Error("snapshot cancelled")));
	}, []), (0, T.useEffect)(() => {
		if (Ne.current = _, !Ze || !ue) {
			_ || se((e) => e === He ? e : He), Ze || de(!1), Ze || (k.current = null, ke.current = ""), O.current = {
				code: Xe,
				final: _
			}, et();
			let e = window.requestAnimationFrame(et), t = [
				window.setTimeout(et, 50),
				window.setTimeout(et, 200),
				window.setTimeout(et, 600)
			];
			return () => {
				window.cancelAnimationFrame(e), t.forEach((e) => window.clearTimeout(e));
			};
		}
		let e = y(Xe), t = ke.current === e ? k.current : null, n = C ? b(C) : null, r = t || k.current || n || Ee(Xe, _);
		se((e) => Math.abs(e - r) <= 2 ? e : r), Ze || de(!1), O.current = {
			code: Xe,
			final: _
		}, et();
		let i = window.requestAnimationFrame(et), a = [
			window.setTimeout(et, 50),
			window.setTimeout(et, 200),
			window.setTimeout(et, 600)
		];
		return () => {
			window.cancelAnimationFrame(i), a.forEach((e) => window.clearTimeout(e));
		};
	}, [
		ne,
		Xe,
		n,
		_,
		Ze,
		ce,
		ue,
		Be,
		C,
		Fe,
		e
	]);
	let tt = () => {
		E(we(n || g, e), `${Ce(e)}.html`);
	}, nt = async (e) => new Promise((t, n) => {
		let r = window.setTimeout(() => {
			Pe.current &&= null, n(/* @__PURE__ */ Error("snapshot timeout"));
		}, Ge);
		Pe.current = {
			resolve: t,
			reject: n,
			timer: r
		}, e.postMessage({
			type: "visualize-widget:copy-snapshot",
			id: te.current
		}, "*");
	});
	return /* @__PURE__ */ (0, ze.jsxs)("div", {
		ref: v,
		className: `visualize-widget-block${Qe ? " is-loading" : " is-ready"}${_ ? " is-final" : " is-streaming"}`,
		"data-source-key": C,
		children: [$e ? /* @__PURE__ */ (0, ze.jsxs)("div", {
			className: "visualize-widget-actions",
			"aria-label": "可视化预览操作",
			children: [/* @__PURE__ */ (0, ze.jsx)("button", {
				className: `visualize-widget-action${fe ? " is-copied" : ""}`,
				type: "button",
				"aria-label": "复制可视化截图",
				"data-tooltip": fe ? "已复制截图" : "复制截图",
				onClick: async () => {
					if (me) return;
					let e = x.current?.contentWindow;
					if (!e) {
						d?.("复制截图失败", "error");
						return;
					}
					he(!0), pe(!1);
					try {
						let t = await nt(e);
						if (!t) throw Error("empty snapshot");
						if (!await D(t, f)) throw Error("clipboard unavailable");
						pe(!0), d?.("已复制到剪贴板", "success"), window.setTimeout(() => pe(!1), Ve);
					} catch {
						d?.("复制截图失败", "error");
					} finally {
						he(!1);
					}
				},
				children: u(fe ? "check" : "copy", {})
			}), /* @__PURE__ */ (0, ze.jsx)("button", {
				className: "visualize-widget-action",
				type: "button",
				"aria-label": "导出 HTML",
				"data-tooltip": "导出 HTML",
				onClick: tt,
				children: u("download", {})
			})]
		}) : null, Qe ? /* @__PURE__ */ (0, ze.jsxs)("div", {
			className: "visualize-widget-loading-inline",
			"aria-live": "polite",
			children: [u("code-xml", { className: "visualize-widget-loading-icon" }), /* @__PURE__ */ (0, ze.jsx)("span", {
				className: "visualize-widget-loading-text",
				children: Ye
			})]
		}) : /* @__PURE__ */ (0, ze.jsx)("div", {
			className: "visualize-widget-panel",
			style: {
				"--runtime-visualize-widget-height": `${w}px`,
				"--visualize-widget-height": `${w}px`
			},
			children: /* @__PURE__ */ (0, ze.jsx)("iframe", {
				ref: x,
				className: "visualize-widget-frame",
				title: e || "可视化预览",
				sandbox: "allow-scripts allow-forms",
				srcDoc: Fe,
				onLoad: () => {
					le(!0), window.requestAnimationFrame(et);
				}
			})
		})]
	});
}
//#endregion
//#region ../../../Users/yunsa/.Trash/mentora-inline-fix-20261027-1826/mentora-inline-fix-20261027/node_modules/streamviz-react/src/react/payload.ts
function Je(e) {
	return String(e || "").replace(/<(div|section|article|main|header|footer|span|p|h[1-6]|ul|ol|li|svg|g|rect|circle|path|line|polyline|text|tspan)(?=(?:class|style|id|role|aria-|data-|xmlns|viewBox|width|height|fill|stroke|points|font-size|font-weight|x|y|x1|y1|x2|y2|cx|cy|r|d)=)/gi, "<$1 ").replace(/<(marker)(?=id=)/gi, "<$1 ").replace(/(["'])(?=[A-Za-z_:][-A-Za-z0-9_:.]*=)/g, "$1 ").replace(/\bsv-badge(?=sv-badge-)/g, "sv-badge ").replace(/(\d|px|rem|%)(solid|dashed|dotted)(?=\b|var\()/gi, "$1 $2").replace(/(solid|dashed|dotted)(?=var\()/gi, "$1 ").replace(/viewBox=(["'])00(\d{2})(\d{2})\1/gi, (e, t, n, r) => `viewBox=${t}0 0 ${n} ${r}${t}`).replace(/viewBox=(["'])00(\d{3})(\d{3})\1/gi, (e, t, n, r) => `viewBox=${t}0 0 ${n} ${r}${t}`).replace(/viewBox=(["'])00(\d{4})(\d{3})\1/gi, (e, t, n, r) => `viewBox=${t}0 0 ${n} ${r}${t}`).replace(/(?<=,\d{3})(?=\d{3},)/g, " ").replace(/(?<=,\d{2})(?=\d{3},)/g, " ").replace(/(?<=,\d)(?=\d{3},)/g, " ").replace(/(\d+(?:px|rem|em|%))(?=\d+(?:px|rem|em|%|;|\b))/gi, "$1 ").replace(/(?<=[:\s])0(?=auto\b)/gi, "0 ").replace(/(?<=[:\s])0(?=\d+(?:px|rem|em|%))/gi, "0 ").replace(/(?<=[:\s])00(?=[;\s"'])/g, "0 0");
}
function A(e, t) {
	let n = String(t || "").toUpperCase();
	if ([
		"CN",
		"HK",
		"US"
	].includes(n)) return n;
	let r = e.match(/<html\b[^>]*data-financial-market\s*=\s*["'](CN|HK|US)["']/i)?.[1]?.toUpperCase();
	if (r) return r;
	if (/data-financial-market\s*=/.test(e)) return;
	let i = /A\s*股|A-shares?\b|\b\d{6}\.(?:SH|SZ|BJ)\b/i.test(e), a = /港股|Hong Kong stocks?|\b\d{4,5}\.HK\b/i.test(e), o = /美股|US stocks?|U\.S\. stocks?/i.test(e);
	if (!(o && (i || a))) return i ? "CN" : a ? "HK" : o ? "US" : void 0;
}
function Ye(e, t) {
	if (!e.trim() || /^<style data-financial-market=/.test(e)) return e;
	let n = A(e, t);
	return n ? `<style data-financial-market="${n}">:root{--sv-price-up:var(${n === "US" ? "--sv-gain" : "--sv-loss"})!important;--sv-price-down:var(${n === "US" ? "--sv-loss" : "--sv-gain"})!important}</style>` + e : e;
}
function Xe(e = {}) {
	let t = String(e.toolRawInput || e.rawArguments || ""), n = t ? te(t, "widget_code") : "", r = t ? te(t, "title") : "", i = t ? ne(t, "loading_messages") : [], a = Ye(Je(e.code || e.widgetCode || e.widget_code || n || ""), e.financialMarket);
	return {
		title: String(e.title || r || ""),
		code: a,
		exportCode: Ye(String(e.exportCode || e.export_code || a), e.financialMarket),
		loadingMessage: String(e.loadingMessage || e.loading_message || "正在生成可视化"),
		loadingMessages: Array.isArray(e.loadingMessages) ? e.loadingMessages.map(String) : Array.isArray(e.loading_messages) ? e.loading_messages.map(String) : i,
		loadingDwellMs: Number.isFinite(Number(e.loadingDwellMs)) ? Number(e.loadingDwellMs) : 0,
		final: !!e.final,
		showActions: !1,
		smoothStreaming: (e.smoothStreaming ?? e.localSmooth) !== !1
	};
}
//#endregion
//#region frontend/streamviz-document.mjs
var Ze = g();
function Qe(e, t, n) {
	let r = (e) => {
		if (!String(e || "").trim()) return e;
		let r = n(e);
		for (let [e, n] of t) r.includes(e) || (r += `<script ${e}>${n}<\/script>`);
		return r;
	};
	return {
		...e,
		smoothStreaming: !1,
		loadingMessage: "正在处理",
		loadingMessages: ["正在处理"],
		code: e.final ? r(e.code) : e.code,
		exportCode: e.final ? r(e.exportCode) : e.exportCode
	};
}
//#endregion
//#region app/skills/streamviz/assets/chart-geometry.js?raw
var $e = "/* Keep SVG geometry responsive while labels and endpoint markers retain pixel dimensions. */\n(() => {\n  const repair = () => document.querySelectorAll('.chartbox svg[viewBox][preserveAspectRatio=\"none\"]:not([data-sv-geometry])').forEach(svg => {\n    if (!svg.matches('.line,.hist,.xlab')) return;\n    const original=svg.getAttribute('viewBox').split(/[ ,]+/).map(Number);\n    if(original.length!==4||!original.every(Number.isFinite))return;\n    svg.dataset.svGeometry='true';\n    if(svg.matches('.hist'))svg.style.height='clamp(260px,26vw,360px)';\n    if(svg.matches('.line'))svg.style.height='clamp(260px,28vw,380px)';\n    const wrap=document.createElement('div');wrap.className='sv-geometry';\n    Object.assign(wrap.style,{position:'relative',width:'100%',minWidth:svg.closest('.chartbox').querySelector('.hist')?'624px':'0'});\n    svg.before(wrap);wrap.append(svg);\n    svg.closest('.chartbox').style.overflowX='auto';\n    const labels=[...svg.querySelectorAll(':scope > text')].map(text=>{\n      const label=document.createElement('span');label.textContent=text.textContent;\n      const anchor=text.getAttribute('text-anchor')||'start';\n      Object.assign(label.style,{position:'absolute',fontSize:parseFloat(text.getAttribute('font-size')||'12')+'px',lineHeight:'1',whiteSpace:'nowrap',pointerEvents:'none',color:text.getAttribute('fill')||'var(--sv-text-secondary)',transform:`translate(${anchor==='middle'?'-50%':anchor==='end'?'-100%':'0'},-80%)`});\n      wrap.append(label);text.remove();return {label,x:Number(text.getAttribute('x')),y:Number(text.getAttribute('y'))};\n    });\n    const dots=[...svg.querySelectorAll(':scope > circle')].map(circle=>{\n      const dot=document.createElement('span');Object.assign(dot.style,{position:'absolute',width:'7px',height:'7px',borderRadius:'50%',background:circle.getAttribute('fill'),transform:'translate(-50%,-50%)',pointerEvents:'none'});\n      wrap.append(dot);circle.remove();return {label:dot,x:Number(circle.getAttribute('cx')),y:Number(circle.getAttribute('cy'))};\n    });\n    let minY=original[1];\n    for(const line of svg.querySelectorAll('polyline[points]'))for(const point of line.getAttribute('points').trim().split(/\\s+/)){const y=Number(point.split(',')[1]);if(Number.isFinite(y))minY=Math.min(minY,y);}\n    // The saved report's x labels are siblings rather than children of .xl.\n    const external=svg.matches('.line')?svg.closest('.chartbox').nextElementSibling:null;\n    const xlabels=external?.matches('.xl')?[...external.querySelectorAll('span')].map(label=>({label,x:parseFloat(label.style.left)/100*original[2]})):[];\n    const layout=()=>{\n      const rect=svg.getBoundingClientRect();if(!rect.width||!rect.height)return;\n      const dx=5*original[2]/rect.width,dy=svg.matches('.xlab')?0:8*original[3]/rect.height;\n      const box=[original[0]-dx,minY-dy,original[2]+2*dx,original[1]+original[3]-minY+2*dy];\n      svg.setAttribute('viewBox',box.join(' '));\n      for(const {label,x,y} of [...labels,...dots]){label.style.left=(x-box[0])/box[2]*100+'%';label.style.top=(y-box[1])/box[3]*100+'%';}\n      for(const {label,x} of xlabels)label.style.left=(x-box[0])/box[2]*100+'%';\n    };\n    layout();if(typeof ResizeObserver==='function')new ResizeObserver(layout).observe(wrap);\n  });\n  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',repair,{once:true});else repair();\n})();\n\n\n// Repair confidently identified ranked bars, including legacy generated SVGs.\n// Keep every supplied mark/value; change only text placement and canvas bounds.\n(() => {\n  const repair = () => document.querySelectorAll('svg[viewBox]:not([data-sv-bar-layout])').forEach(svg => {\n    if (typeof svg.getBBox !== 'function') return;\n    const box=svg.viewBox.baseVal;\n    if (!box.width || !box.height) return;\n    const bars=[...svg.querySelectorAll('rect')].filter(r=>r.width.baseVal.value>0 && r.height.baseVal.value>0);\n    if (bars.length<3 || bars.some(r=>r.height.baseVal.value>box.height/5)) return;\n    const rows=bars.map(bar=>({bar,x:bar.x.baseVal.value,y:bar.y.baseVal.value,w:bar.width.baseVal.value,h:bar.height.baseVal.value}));\n    if (rows.some((r,i)=>rows.some((q,j)=>j!==i && Math.abs(r.y-q.y)<Math.max(r.h,q.h)))) return;\n    const zero=[rows[0].x,rows[0].x+rows[0].w].find(x=>rows.every(r=>Math.abs(r.x-x)<1 || Math.abs(r.x+r.w-x)<1));\n    if (zero===undefined) return;\n    const texts=[...svg.querySelectorAll('text')];\n    for (const row of rows) {\n      const near=texts.filter(t=>{const y=t.y.baseVal[0]?.value;return y>=row.y && y<=row.y+row.h+2;});\n      // A shared category column just before zero plus one value per row.\n      row.category=near.find(t=>Math.abs((t.x.baseVal[0]?.value??Infinity)-(zero-10))<8);\n      row.value=near.find(t=>t!==row.category);\n      if (!row.category || !row.value || near.length!==2) return;\n    }\n    svg.dataset.svBarLayout='true';\n    let left=Math.min(...rows.map(r=>r.x));\n    for (const row of rows) {\n      const positive=Math.abs(row.x-zero)<1;\n      row.value.setAttribute('x',String(positive?row.x+row.w+8:row.x-8));\n      row.value.setAttribute('text-anchor',positive?'start':'end');\n      const bounds=row.value.getBBox();left=Math.min(left,bounds.x);\n    }\n    for (const row of rows) row.category.setAttribute('x',String(left-12));\n    const bounds=svg.getBBox();\n    if (bounds.width>0 && bounds.height>0) {\n      const x=Math.min(box.x,bounds.x-8),y=Math.min(box.y,bounds.y-8);\n      const right=Math.max(box.x+box.width,bounds.x+bounds.width+8),bottom=Math.max(box.y+box.height,bounds.y+bounds.height+8);\n      svg.setAttribute('viewBox',[x,y,right-x,bottom-y].join(' '));\n      // On narrow screens scroll the chart locally rather than shrink labels.\n      svg.style.minWidth=Math.ceil(right-x)+'px';\n      if(svg.parentElement){svg.parentElement.style.minWidth='0';svg.parentElement.style.overflowX='auto';}\n\n    }\n  });\n  const schedule=()=>requestAnimationFrame(repair);\n  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();\n  document.fonts?.ready.then(schedule);\n})();\n", et = "/* Direction metadata is authoritative. Legacy repair is confined to financial\n   template values, never arbitrary percentages, prose, rankings or status text. */\n(() => {\n  if(window.__svFinancialSemantics)return;window.__svFinancialSemantics=true;\n  const repair=()=>{\n    document.querySelectorAll('.sv-rank>strong,.sv-metric>strong').forEach(node=>{\n      if(node.querySelector('[data-sv-direction]') || (node.hasAttribute('data-sv-direction')&&node.dataset.svDirectionOrigin!=='compat'))return;\n      const region=node.closest('[data-financial-market]');\n      const heading=node.closest('.sv-section')?.querySelector(':scope>h2')?.textContent||'';\n      const label=node.closest('.sv-metric')?.querySelector(':scope>p')?.textContent||'';\n      if(!region&&!/涨跌|涨幅|跌幅|领涨|领跌|强势行业|弱势行业|收益率|return|price change/i.test(heading+' '+label))return;\n      const raw=node.textContent.trim().replace(/−/g,'-').replace(/％/g,'%');\n      if(!/^[+-]?(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?%$/.test(raw))return;\n      const value=Number(raw.slice(0,-1).replace(/,/g,''));\n      if(!Number.isFinite(value))return;\n      if(value!==0&&!/^[+-]/.test(raw))return;\n      node.dataset.svDirection=value>0?'up':value<0?'down':'flat';node.dataset.svDirectionOrigin='compat';\n    });\n  };\n  let pending=false;\n  const schedule=()=>{if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;repair()})};\n  const start=()=>{repair();new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true,characterData:true})};\n  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();\n})();\n", tt = "(() => {\n  if(window.parent===window)return;\n  let enabled=Boolean(window.frameElement?.classList.contains(\"reportDocumentFrame\"));\n  const attach=()=>{\n    if(!enabled||!document?.documentElement)return;\n    const title=document.querySelector('.kline-title strong[data-business-title],.chart-title,.waterfall-title,.treemap-title,.pie-title,.card-title,#title,h1,h2');\n    if(!title?.textContent.trim())return;\n    let style=document.querySelector('[data-widget-title-action-style]');\n    if(!style){style=document.createElement('style');style.dataset.widgetTitleActionStyle='true';document.head.append(style);}\n    const actionStyle='[data-widget-title-action]{display:inline-flex!important;position:static!important;vertical-align:middle;align-items:center;justify-content:flex-start!important;box-sizing:border-box;width:28px;height:28px;margin:0 0 0 6px!important;padding:5px 10px 5px 0!important;border:0;border-radius:6px;background:transparent;color:inherit;opacity:0;pointer-events:none;transition:opacity .15s ease;cursor:pointer;flex-shrink:0}html:hover [data-widget-title-action]{opacity:.65;pointer-events:auto}[data-widget-title-action]:hover,[data-widget-title-action]:focus-visible{opacity:1;pointer-events:auto;background:#8882}[data-widget-title-action] svg{display:block;width:18px;height:18px;fill:currentColor}';\n    if(style.textContent!==actionStyle)style.textContent=actionStyle;\n    const actionHost=title.closest('header')?.querySelector('[data-widget-title-action-anchor]')||title;\n    const existing=actionHost.querySelector('.artifactAddToWidget,[data-widget-title-action]')||title.querySelector('.artifactAddToWidget,[data-widget-title-action]');\n    if(existing){if(existing.parentElement!==actionHost)actionHost.append(existing);return;}\n    const button=document.createElement('button');button.type='button';button.dataset.widgetTitleAction='true';button.title='添加到 Widget';button.setAttribute('aria-label','添加到 Widget');\n    button.innerHTML=\"<svg viewBox=\\\"0 0 1024 1024\\\" aria-hidden=\\\"true\\\"><path d=\\\"M960 224a32 32 0 0 0-32-32h-832a32 32 0 0 0-31.488 26.24L64 224v704a32 32 0 0 0 26.24 31.488L96 960H512a32 32 0 1 1 0 64H96a96 96 0 0 1-95.552-86.784L0 928v-704a96 96 0 0 1 86.784-95.552L96 128h832a96 96 0 0 1 95.552 86.784L1024 224V512a32 32 0 1 1-64 0V224zM801.92 576c16.64 0 30.08 13.44 30.08 30.08V768l161.92 0.064c16.64 0 30.08 13.44 30.08 30.08v3.84c0 16.64-13.44 30.08-30.08 30.08L832 831.936v161.92c0 16.64-13.44 30.144-30.08 30.144h-3.84A30.08 30.08 0 0 1 768 993.92V831.936L606.08 832A30.08 30.08 0 0 1 576 801.92v-3.84c0-16.64 13.44-30.08 30.08-30.08l161.92-.064V606.08c0-16.64 13.44-30.08 30.08-30.08h3.84zM736 0a32 32 0 1 1 0 64h-448a32 32 0 0 1 0-64h448z\\\"/></svg>\";\n    button.addEventListener('click',event=>{\n      event.stopPropagation();\n      const detail={title:title.textContent.trim()};\n      try{\n        const shell=window.frameElement?.closest('.chatArtifactShell');\n        if(shell){parent.dispatchEvent(new parent.CustomEvent('mentora:add-artifact-to-widget',{detail:{...detail,url:shell.dataset.artifactUrl,trigger:button}}));return;}\n      }catch{}\n      parent.postMessage({type:'mentora:add-widget',...detail},'*');\n    });\n    title.style.overflow='visible';title.style.maxHeight='none';actionHost.append(button);\n  };\n  window.addEventListener('message',event=>{if(event.source===parent&&event.data?.type==='mentora:widget-control'){enabled=true;attach();}});\n  attach();\n  parent.postMessage({type:'mentora:widget-ready'},'*');\n  new MutationObserver(attach).observe(document.documentElement,{childList:true,subtree:true});\n})();\n", nt = /* @__PURE__ */ new WeakMap(), rt = /* @__PURE__ */ new Map();
function it() {
	return { mode: document.documentElement.dataset.theme === "dark" ? "dark" : "light" };
}
function at(e, t = {}) {
	if (!(e instanceof Element)) return null;
	let n = nt.get(e);
	n || (n = (0, Ze.createRoot)(e), nt.set(e, n)), rt.set(e, t);
	let r = Qe(Xe(t), [
		["data-sv-chart-geometry", $e],
		["data-sv-financial-semantics", et],
		["data-widget-control", tt]
	], S);
	return n.render(/* @__PURE__ */ (0, ze.jsx)(qe, {
		...r,
		renderIcon: () => null,
		theme: it(),
		notify: (e, t) => {
			window.dispatchEvent(new CustomEvent("aime:streamviz-notify", { detail: {
				message: e,
				variant: t
			} }));
		},
		onSendPrompt: (e) => {
			window.dispatchEvent(new CustomEvent("aime:streamviz-followup", { detail: { prompt: e } }));
		}
	})), e;
}
function ot(e) {
	let t = nt.get(e);
	t && (t.unmount(), nt.delete(e), rt.delete(e));
}
window.AimeStreamViz = Object.freeze({
	mount: at,
	update: at,
	unmount: ot
}), window.addEventListener("aime:theme-change", () => {
	rt.forEach((e, t) => at(t, e));
}), window.dispatchEvent(new CustomEvent("aime:streamviz-ready"));
//#endregion

//# sourceMappingURL=streamviz.js.map