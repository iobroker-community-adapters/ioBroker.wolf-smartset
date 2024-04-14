// @ts-nocheck
/* eslint-disable no-undef */
/* eslint-disable no-console */
const utils = require('@iobroker/adapter-core');

const axios = require('axios').default;
const _021a = ['\x68\x74\x74\x70\x73\x3a\x2f\x2f\x77\x77\x77\x2e\x77\x6f\x6c\x66\x2d\x73\x6d\x61\x72\x74\x73\x65\x74\x2e\x63\x6f\x6d','\x2f\x70\x6f\x72\x74\x61\x6c\x2f\x63\x6f\x6e\x6e\x65\x63\x74\x2f\x74\x6f\x6b\x65\x6e','\x2f\x70\x6f\x72\x74\x61\x6c\x2f\x61\x70\x69\x2f\x70\x6f\x72\x74\x61\x6c\x2f\x47\x65\x74\x53\x79\x73\x74\x65\x6d\x4c\x69\x73\x74','\x2f\x70\x6f\x72\x74\x61\x6c\x2f\x61\x70\x69\x2f\x70\x6f\x72\x74\x61\x6c\x2f\x47\x65\x74\x47\x75\x69\x44\x65\x73\x63\x72\x69\x70\x74\x69\x6f\x6e\x46\x6f\x72\x41\x70\x70\x47\x61\x74\x65\x77\x61\x79\x32\x3f\x47\x61\x74\x65\x77\x61\x79\x49\x64\x3d','\x26\x53\x79\x73\x74\x65\x6d\x49\x64\x3d','\x2f\x70\x6f\x72\x74\x61\x6c\x2f\x61\x70\x69\x2f\x70\x6f\x72\x74\x61\x6c\x2f\x47\x65\x74\x50\x61\x72\x61\x6d\x65\x74\x65\x72\x56\x61\x6c\x75\x65\x73','\x2f\x70\x6f\x72\x74\x61\x6c\x2f\x61\x70\x69\x2f\x70\x6f\x72\x74\x61\x6c\x2f\x57\x72\x69\x74\x65\x50\x61\x72\x61\x6d\x65\x74\x65\x72\x56\x61\x6c\x75\x65\x73','\x2f\x70\x6f\x72\x74\x61\x6c\x2f\x61\x70\x69\x2f\x70\x6f\x72\x74\x61\x6c\x2f\x55\x70\x64\x61\x74\x65\x53\x65\x73\x73\x69\x6f\x6e','\x2f\x70\x6f\x72\x74\x61\x6c\x2f\x61\x70\x69\x2f\x70\x6f\x72\x74\x61\x6c\x2f\x43\x72\x65\x61\x74\x65\x53\x65\x73\x73\x69\x6f\x6e\x32','\x2f\x70\x6f\x72\x74\x61\x6c\x2f\x61\x70\x69\x2f\x70\x6f\x72\x74\x61\x6c\x2f\x70\x61\x72\x61\x6d\x65\x74\x65\x72\x73\x2f\x77\x72\x69\x74\x65','\x2f\x70\x6f\x72\x74\x61\x6c\x2f\x61\x70\x69\x2f\x70\x6f\x72\x74\x61\x6c\x2f\x73\x79\x73\x74\x65\x6d\x73\x2f\x35\x30','\x2f\x70\x6f\x72\x74\x61\x6c\x2f\x61\x70\x69\x2f\x70\x6f\x72\x74\x61\x6c\x2f\x73\x79\x73\x74\x65\x6d\x73\x74\x61\x74\x65\x2f','\x2f\x70\x6f\x72\x74\x61\x6c\x2f\x61\x70\x69\x2f\x70\x6f\x72\x74\x61\x6c\x2f\x47\x65\x74\x47\x75\x69\x44\x65\x73\x63\x72\x69\x70\x74\x69\x6f\x6e\x46\x6f\x72\x47\x61\x74\x65\x77\x61\x79\x3f\x47\x61\x74\x65\x77\x61\x79\x49\x64\x3d'];


const { Issuer, TokenSet, custom, generators } = require('openid-client');
const fs = require('fs');
const path = require('path');
const util = require('util');


/**
 *
 * Create a new instance of the WolfSmartSet class
 *
 * @extends EventEmitter
 */
class WolfSmartSet {
	constructor(username, password, adapter) {
		//super();
		if (typeof (adapter) === 'undefined') adapter = adapter_helper;

		this.USER = username;
		this.PASS = password;
		this.adapter = adapter;
		this.UpdateInterval = 60000; //3600000;
		this.UpdateTimeout = null;
		this.refreshTimeout = null;
		this.destroyed = false;

		this.LastAccess = '2022-11-22T19:35:06.7715496Z'; //dummy for first request

		//if (this.USER && this.PASS && this.USER != '' && this.PASS != '') this._init();
		//else this.adapter.log.warn('PLEASE enter username and password in config');
		this.openIdStore = {};

		this.auth = {};
		this.SessioID = null;
		this.System = {};

		const authPath = utils.getAbsoluteInstanceDataDir(this.adapter);
		try {
			if (!fs.existsSync(authPath)) {
				fs.mkdirSync(authPath);
			}
		} catch (error) {
			this.adapter.log.warn(`Error creating directory: ${error.message}`);
		}
		this.authFile = path.join(authPath, 'auth.json');
	}

	async openIdInit() {
		this.adapter.log.info('openIdInit');
		// initialize OpenID Issuer with Wolf relevant details
		this.openIdIssuer = await Issuer.discover('https://www.wolf-smartset.com/idsrv/.well-known/openid-configuration');
		this.adapter.info(util.inspect(this.openIdIssuer, false, nulll, true))

		// initialize OpenID Client with Wolf relevant details
		this.openIdClientId = 'smartset.web';
		this.openIdClient = new this.openIdIssuer.Client({
			client_id: this.openIdClientId,
			redirect_uris: ['https://www.wolf-smartset.com/signin-callback.html'],
			response_types: ['code'],
			// id_token_signed_response_alg (default "RS256")
			// token_endpoint_auth_method: 'none' // (default 'client_secret_basic')
			token_endpoint_auth_method: 'client_secret_basic'
		});
		this.adapter.info(util.inspect(this.openIdClient, false, nulll, true))

		// enhance got client with additional logging for debug mode
		custom.setHttpOptionsDefaults({
			timeout: 5000,
		});

		try {
			if (fs.existsSync(this.authFile)) {
				const auth = JSON.parse(fs.readFileSync(this.authFile, 'utf-8'));

				if (auth && auth.access_token && auth.USER === this.USER && auth.PASS === this.PASS) {
					this.auth = auth;

					this.adapter.log.debug(`Auth data loaded from ${this.authFile}`);

					await this._refresh();
				}
			}
		} catch (error) {
			this.adapter.log.warn(`Error reading auth.json: ${error.message}`);
		}
	}

	setAuthData(auth, doNotSave) {
		this.adapter.log.info('setAuthData');
		if (!auth) return;

		this.auth = auth;
		this.auth.USER = this.USER;
		this.auth.PASS = this.PASS;

		if (!doNotSave) {
			try {
				fs.writeFileSync(this.authFile, JSON.stringify(auth), 'utf-8');
				this.adapter.log.debug(`Auth data saved to ${this.authFile}`);
			} catch (error) {
				this.adapter.log.warn(`Error writing auth.json: ${error.message}`);
			}
		}
	}

	async init() {
		// prepare Connection
		this.adapter.log.info('init');
		if (!this.auth || !this.auth.access_token) {
			this.setAuthData(await this._getAuthToken());
		}
		if (this.auth && this.auth.access_token) {
			this.SessioID = await this._createSession();
			this.System = await this._getSystemList();

			this.adapter.log.info('Initialization with Login and new Session done!');

			this.UpdateTimeout && clearTimeout(this.UpdateTimeout);
			this.UpdateTimeout = setTimeout(() => {
				this._sessionUpdate();
			}, this.UpdateInterval);
		}
	}

	async adminGetDevicelist(user, password) {
		const origUser = this.USER;
		const origPass = this.PASS;
		const origAuth = this.auth;

		this.adapter.log.info('adminGetDevicelist');
		let system;
		try {
			this.USER = user;
			this.PASS = password;
			this.setAuthData(await this._getAuthToken(), true);

			if (this.auth && this.auth.access_token) {
				this.SessioID = await this._createSession();
				system = await this._getSystemList();
			}
		} catch (error) {
			this.adapter.log.warn('API GET ADMIN DEVICE LIST ERROR: ' + error.message);
		}

		this.USER = origUser;
		this.PASS = origPass;
		this.setAuthData(origAuth, true);

		if (this.auth && this.auth.access_token) {
			await this._refresh();
		}

		return system;
	}

	async _getAuthToken() {
		this.adapter.log.info('_getAuthToken');
		this.refreshTimeout && clearTimeout(this.refreshTimeout);

		const codeVerifier = generators.codeVerifier();
		const codeChallenge = generators.codeChallenge(codeVerifier);
		const state = generators.state();

		this.openIdStore[state] = {
			code_verifier: codeVerifier
		};

		this.openIdInit()
		try {
			const authUrl = this.openIdClient.authorizationUrl({
				scope: 'openid profile api role',
				state,
				code_challenge: codeChallenge,
				code_challenge_method: 'S256',
			});

			this.adapter.log.debug('authUrl: ' + authUrl);

			const headers = {
				'Cache-control': 'no-cache',
				'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:108.0) Gecko/20100101 Firefox/108.0',
				'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
				'Accept-Language': 'de-DE,de;q=0.8,en-US;q=0.5,en;q=0.3',
				'Referer': 'https://www.wolf-smartset.com/',
				'Sec-Fetch-Dest': 'document',
				'Sec-Fetch-Mode': 'navigate',
				'Sec-Fetch-Site': 'same-origin',
				'TE': 'trailers'
			};

			const loginPage = await axios.get(authUrl, {
				headers
			});
			const loginUrl = loginPage.request.res.responseUrl;

			const requestVerificationToken = loginPage.data.match(/<input name="__RequestVerificationToken" type="hidden" value="(.*)" \/>/)[1];
			const cookies = loginPage.headers['set-cookie'].map(cookie => cookie.split(';')[0]);

			this.adapter.log.debug(`requestVerificationToken: ${requestVerificationToken}`);

			const data = {
				'Input.Username': this.USER,
				'Input.Password': this.PASS,
				'__RequestVerificationToken': requestVerificationToken,
			};

			// convert to Query string
			const query = Object.keys(data).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(data[k])).join('&');

			headers['Content-Type'] = 'application/x-www-form-urlencoded';
			headers.Origin = 'https://www.wolf-smartset.com';
			headers.Referer = loginUrl;
			headers['Sec-Fetch-User'] = '?1';
			headers.Cookie = cookies.join('; ');

			const responsePost = await axios({
				url: loginUrl,
				data: query,
				headers,
				method: 'POST',
				maxRedirects: 0,
				validateStatus: function (status) {
					return status === 302;
				},
			});

			const redirectUrl = 'https://www.wolf-smartset.com' + responsePost.headers.location;
			cookies.push(...responsePost.headers['set-cookie'].map(cookie => cookie.split(';')[0]));
			headers.Cookie = cookies.join('; ');

			const response = await axios({
				url: redirectUrl,
				headers,
				method: 'GET',
			});

			if (this.destroyed) return;

			const callbackUrl = response.request.res.responseUrl;

			this.adapter.log.debug('callbackUrl: ' + callbackUrl);

			const params = this.openIdClient.callbackParams(callbackUrl);

			if (!this.openIdStore[params.state]) {
				throw new Error('Can not decode response for State ' + params.state + '. Please reload start page and try again!');
			}

			if (params.code) {
				const tokenData = {
					'client_id': this.openIdClientId,
					'code': params.code,
					'redirect_uri': 'https://www.wolf-smartset.com/signin-callback.html',
					'code_verifier': this.openIdStore[params.state].code_verifier,
					'grant_type': 'authorization_code',
				};

				this.adapter.log.debug('token data: ' + JSON.stringify(tokenData));
				// convert to Query string
				const tokenQuery = Object.keys(tokenData).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(tokenData[k])).join('&');

				const tokenSet = await axios({
					url: 'https://www.wolf-smartset.com/idsrv/connect/token',
					data: tokenQuery,
					headers,
					method: 'POST',
				});

				this.adapter.log.debug('Wolf-Cloud: received and validated tokens: ' + JSON.stringify(tokenSet.data));

				if (tokenSet.data.expires_in) {
					this.refreshTimeout && clearTimeout(this.refreshTimeout);
					this.refreshTimeout = setTimeout(() => {
						this._refresh();
					}, tokenSet.data.expires_in * 1000);
				}
				tokenSet.data.idCookie = cookies.find(cookie => cookie.startsWith('idsrv.session='));
				tokenSet.data.allCookies = cookies;
				tokenSet.data.headers = headers;

				return tokenSet.data;
			}
			else if (params.error) {
				this.adapter.log.warn('Wolf-Cloud: ERROR: ' + JSON.stringify(params));
				throw new Error(params.error + ': ' + params.error_description);
			}
		} catch (error) {
			this.adapter.log.warn('API GET AUTH TOKEN ERROR: ' + error.message);
			this.adapter.log.warn(error.stack);
		}
	}

	async _getSystemList() {
		this.adapter.log.info('_getSystemList');
		const headers = await this._generateHeader('');
		try {
			const response = await axios.get(_021a[0] + _021a[10], {
				headers: headers
			});
			if (this.destroyed) return;
			this.adapter.log.debug('API GET SYSTEM LIST: ' + JSON.stringify(response.data));
			return response.data.Systems;

		} catch (error) {
			this.adapter.log.warn('API GET SYSTEM LIST ERROR: ' + error.message);
		}
	}
	async getGUIDescription(gatewayid, id) {
		this.adapter.log.info('getGUIDescription');
		const headers = await this._generateHeader('');
		try {
			const response = await axios.get(_021a[0] + _021a[12]  + gatewayid + _021a[4] + id, {//_021a[3] for App data
				headers: headers
			});
			if (this.destroyed) return;
			this.adapter.log.debug('API GET GUI DESC.: ' + JSON.stringify(response.data));
			return response.data;

		} catch (error) {
			this.adapter.log.warn('API GET GUI DESC. ERROR: ' + error.message);
			console.log(error);
		}
	}
	async getValList(gateway, sysId, valList) {
		this.adapter.log.info('getValList');
		const headers = await this._generateHeader('application/json');
		const payload = {
			BundleId: 1000,
			IsSubBundle: false,
			ValueIdList: valList,
			GatewayId: gateway,
			SystemId: sysId,
			LastAccess: this.LastAccess,
			GuiIdChanged: false,
			SessionId: this.SessioID
		};

		try {
			const response = await axios.post(_021a[0] + _021a[5], payload, {
				headers: headers
			});
			if (this.destroyed) return;
			this.adapter.log.debug('API GET VAL LIST: ' + JSON.stringify(response.data));
			if (response.data.LastAccess) this.LastAccess = response.data.LastAccess;
			return response.data;

		} catch (error) {
			this.adapter.log.warn('API GET VAL LIST ERROR: ' + error.message);
			if (error.response && (error.response.status === 400 || error.response.status === 401)) {
				await this._refresh();
			}
		}
	}
	async stop() {
		this.adapter.log.info('stop');
		this.UpdateTimeout && clearTimeout(this.UpdateTimeout);
		this.refreshTimeout && clearTimeout(this.refreshTimeout);
		this.destroyed = true;
	}
	async _refresh() {
		this.adapter.log.info('_refresh');
		this.refreshTimeout && clearTimeout(this.refreshTimeout);

		if (!this.auth || !this.auth.id_token) {
			this.setAuthData(await this._getAuthToken());
			return;
		}

		const codeVerifier = generators.codeVerifier();
		const codeChallenge = generators.codeChallenge(codeVerifier);
		const state = generators.state();

		this.openIdStore[state] = {
			code_verifier: codeVerifier
		};

		let authUrl = this.openIdClient.authorizationUrl({
			scope: 'openid profile api role',
			state,
			code_challenge: codeChallenge,
			code_challenge_method: 'S256',
		});

		authUrl += '&prompt=none';
		authUrl += '&response_mode=query';
		authUrl += '&id_token_hint=' + this.auth.id_token;

		this.adapter.log.debug('refresh auth url: ' + authUrl);

		const headers = {
			'Cache-control': 'no-cache',
			'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:108.0) Gecko/20100101 Firefox/108.0',
			'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
			'Accept-Language': 'de-DE,de;q=0.8,en-US;q=0.5,en;q=0.3',
			'Referer': 'https://www.wolf-smartset.com/',
			'Sec-Fetch-Dest': 'document',
			'Sec-Fetch-Mode': 'navigate',
			'Sec-Fetch-Site': 'same-origin',
			'TE': 'trailers',
			'Cookie': this.auth.allCookies.join('; '),
		};

		try {
			const refreshResponse = await axios.get(authUrl, {
				headers
			});

			if (this.destroyed) return;

			const callbackUrl = refreshResponse.request.res.responseUrl;

			this.adapter.log.debug('refresh callbackUrl: ' + callbackUrl);

			const params = this.openIdClient.callbackParams(callbackUrl);

			if (!this.openIdStore[params.state]) {
				throw new Error('Can not decode response for State ' + params.state + '. Please reload start page and try again!');
			}

			if (params.code) {
				const tokenData = {
					'client_id': this.openIdClientId,
					'code': params.code,
					'redirect_uri': 'https://www.wolf-smartset.com/signin-callback.html',
					'code_verifier': this.openIdStore[params.state].code_verifier,
					'grant_type': 'authorization_code',
				};

				this.adapter.log.debug('token data: ' + JSON.stringify(tokenData));
				// convert to Query string
				const tokenQuery = Object.keys(tokenData).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(tokenData[k])).join('&');

				const tokenSet = await axios({
					url: 'https://www.wolf-smartset.com/idsrv/connect/token',
					data: tokenQuery,
					headers,
					method: 'POST',
				});

				this.adapter.log.debug('Wolf-Cloud: received and validated tokens: ' + JSON.stringify(tokenSet.data));

				if (tokenSet.data.expires_in) {
					this.refreshTimeout = setTimeout(() => {
						this._refresh();
					}, tokenSet.data.expires_in * 1000);
				}
				tokenSet.data.idCookie = this.auth.idCookie;
				tokenSet.data.allCookies =this.auth.allCookies;
				tokenSet.data.headers = this.auth.headers;

				this.setAuthData(tokenSet.data);

				if (tokenSet.data.expires_in) {
					this.refreshTimeout && clearTimeout(this.refreshTimeout);
					this.refreshTimeout = setTimeout(() => {
						this._refresh();
					}, tokenSet.data.expires_in * 1000);
				}
			}
			else if (params.error) {
				this.adapter.log.debug('Wolf-Cloud: ERROR: ' + JSON.stringify(params));
				throw new Error(params.error + ': ' + params.error_description);
			}
		} catch (error) {
			this.adapter.log.warn('API REFRESH TOKEN ERROR: ' + error.message);
			this.adapter.log.warn(error.stack);
			if (error.message.includes('login_required')) {
				this.auth = {};
				await this.init();
			}
		}
	}

	async setParameter(GatewayId, SystemId, Paramarray) {
		this.adapter.log.info('setParameter');
		const payload = {
			SessionId: this.SessioID,
			BundleId: 1000,
			GatewayId: GatewayId,
			SystemId: SystemId,
			WriteParameterValues: Paramarray,
			WaitForResponseTimeout: null,
			GuiId: null
		};
		const headers = await this._generateHeader('application/json');

		this.adapter.log.debug('SEND VALUE ' + _021a[0] + _021a[9] + ' : ' + JSON.stringify(payload));
		try {
			const response = await axios.post(_021a[0] + _021a[9], payload, { //old 6 new 9
				headers: headers
			});
			if (this.destroyed) return;
			this.adapter.log.debug('SEND VALUE : ' + JSON.stringify(response.data));
			return response.data;

		} catch (error) {
			this.adapter.log.warn('SEND VALUE ERROR: ' + error.message);
		}
	}


	async _sessionUpdate() {
		this.adapter.log.info('_sessionUpdate');
		this.UpdateTimeout && clearTimeout(this.UpdateTimeout);
		this.adapter.log.debug('Updating session!');

		const headers = await this._generateHeader('application/json');
		const payload = {
			SessionId: this.SessioID
		};

		try {
			const response = await axios.post(_021a[0] + _021a[7], payload, {
				headers: headers
			});
			if (this.destroyed) return;
			this.adapter.log.debug('SESSION UPDATE: ' + JSON.stringify(response.data));
			if (response.data.LastAccess) this.LastAccess = response.data.LastAccess;
			//return response.data;

		} catch (error) {
			this.adapter.log.warn('SESSION UPDATE ERROR: ' + error.message);

			if (this.SessioID && error.response && (error.response.status === 401 || error.response.status === 400)) {
				this.SessioID = await this._createSession();
			}
			if (!this.SessioID) {
				await this.init();
			}
		}

		this.UpdateTimeout = setTimeout(() => {
			this._sessionUpdate();
		}, this.UpdateInterval);
	}


	/**
     *
     * @param {number} sysId Input of SystemId
     * @returns {Promise}
     * {"AccessLevel":4,"IsSystemShareDeleted":false,
     * "IsSystemDeleted":false,
     * "IsOnline":true,
     * "IsLocked":false,
     * "MaintenanceState":{"Mode":0,"Progress":0,
     * "CWLFilterMaintenancePending":false},
     * "RequestDate":"2021-03-13T18:49:14.9610258Z",
     * "LastDisconnect":"2021-03-13T10:38:37.51"}
     */
	async getSystemState(sysId) {
		this.adapter.log.info('getSystemState');
		const headers = await this._generateHeader('application/json');

		try {
			const response = await axios.get(_021a[0] + _021a[11] + sysId, {
				headers: headers
			});
			if (this.destroyed) return;
			this.adapter.log.debug('API GET SYSTEM STATE: ' + JSON.stringify(response.data));
			return response.data;

		} catch (error) {
			this.adapter.log.warn('API GET SYSTEM STATE: ' + error.message);
		}
	}


	generateDateTimeString() {
		this.adapter.log.info('generateDateTimeString');
		const date = new Date();
		const year = date.getFullYear();
		const month = (1 + date.getMonth()).toString().padStart(2, '0');
		const day = date.getDate().toString().padStart(2, '0');
		const hour = date.getHours().toString().padStart(2, '0');
		const minute = date.getMinutes().toString().padStart(2, '0');
		const second = date.getSeconds().toString().padStart(2, '0');
		return year + '-' + month + '-' + day + ' ' + hour + ':' + minute + ':' + second;
	}

	async _createSession() {
		this.adapter.log.info('_createSession');
		if (!this.auth || !this.auth.token_type || !this.auth.access_token) {
			this.adapter.log.debug('No auth token found!');
			this.setAuthData(await this._getAuthToken());
		}

		try {
			const headers = {
				'Content-Type': 'application/json; charset=utf-8',
				'Authorization': this.auth ? (this.auth.token_type + ' ' + this.auth.access_token) : '',
				'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:108.0) Gecko/20100101 Firefox/108.0', //'ioBroker.wolfsmartset',
				'Accept': '*/*',
				'Accept-Language': 'de-DE,de;q=0.8,en-US;q=0.5,en;q=0.3',
				'Host': 'www.wolf-smartset.com',
				'Connection': 'keep-alive',
				'Cache-control': 'no-cache',
				'Cookie': this.auth.idCookie,
				'Origin': 'https://www.wolf-smartset.com',
				'X-Requested-With': 'XMLHttpRequest',
				'Sec-Fetch-Dest': 'empty',
				'Sec-Fetch-Mode': 'cors',
				'Sec-Fetch-Site': 'same-origin',
				'TE': 'trailers'
			};

			/*
			const initResponse = await axios.get('https://www.wolf-smartset.com/portal/api/portal/Init?_=' + Date.now(), {
				headers
			});
			*/

			const payload = {
				Timestamp: this.generateDateTimeString(),
				//ClientSideIdentifier: '0001-01-01T00:00:00',
				//AppVersion: '3.0.29'
			};

			const response = await axios.post(_021a[0] + _021a[8], payload, {
				headers: headers
			});
			if (this.destroyed) return;
			this.adapter.log.debug('API CREATE SESSION: ' + JSON.stringify(response.data));
			this.adapter.log.debug('API CREATE SESSION: ' + response.data.BrowserSessionId);
			return response.data.BrowserSessionId;

		} catch (error) {
			this.adapter.log.warn('API CREATE SESSION ERROR: ' + error.message);
			this.adapter.log.warn(error.stack);
		}
	}

	async _generateHeader(cType) {
		this.adapter.log.info('_generateHeader');
		return {
			'Content-Type': cType,
			'Authorization': this.auth ? (this.auth.token_type + ' ' + this.auth.access_token) : '',
			'User-Agent': 'ioBroker.wolfsmartset',
			'Accept': '*/*',
			'Host': 'www.wolf-smartset.com',
			'Connection': 'keep-alive',
			'Cache-control': 'no-cache',
			'X-Pect': 'The Spanish Inquisition'
		};

	}

}


// just for testing
//-----------------------------------
const adapter_helper = {
	//config: Config.getInstance().get("landroid-s"),
	log: {
		info: function (msg) {
			console.log('INFO: ' + msg);
		},
		error: function (msg) {
			console.log('ERROR: ' + msg);
		},
		debug: function (msg) {
			console.log('DEBUG: ' + msg);
		},
		warn: function (msg) {
			console.log('WARN: ' + msg);
		}
	},
	msg: {
		info: [],
		error: [],
		debug: [],
		warn: []
	}
};

module.exports = WolfSmartSet;
