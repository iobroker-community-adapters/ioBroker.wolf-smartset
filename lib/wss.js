const utils = require('@iobroker/adapter-core');

const axios = require('axios').default;

const _API_STRING = {
    HOST: 'www.wolf-smartset.com',
    WEBSERVER: 'https://www.wolf-smartset.com',
    PATH_PORTAL_INIT: '/portal/api/portal/Init', // unused
    PATH_TOKEN: '/portal/connect/token', // unused
    PATH_OPENID_CFG: '/idsrv/.well-known/openid-configuration',
    PATH_OPENID_SIGNIN_CB: '/signin-callback.html',
    PATH_OPENID_GET_TOKEN: '/idsrv/connect/token',
    PATH_OPENID_USERINFO: '/idsrv/connect/userinfo',
    PATH_PORTAL_USERINFO: '/portal/api/portal/CurrentUserLoadDataSlim',
    PATH_EXPERT_LOGIN: '/portal/api/portal/ExpertLogin',
    PATH_GET_SYSTEM_LIST_OLD: '/portal/api/portal/GetSystemList', // unused
    PATH_GET_SYSTEM_LIST: '/portal/api/portal/systems/50',
    PATH_GET_GUI_DESC_FOR_GW: '/portal/api/portal/GetGuiDescriptionForGateway',
    PATH_GET_GUI_DESC_FOR_APP: '/portal/api/portal/GetGuiDescriptionForAppGateway2', // unused
    PATH_GET_PARAM_VALS: '/portal/api/portal/GetParameterValues',
    PATH_SET_PARAM_VALS: '/portal/api/portal/parameters/write',
    PATH_WRITE_PARAM_VALS: '/portal/api/portal/WriteParameterValues', // unused
    PATH_UPDATE_SESSION: '/portal/api/portal/UpdateSession',
    PATH_CREATE_SESSION: '/portal/api/portal/CreateSession2',
    PATH_GET_SYSTEM_STATE: '/portal/api/portal/systemstate/',
    PARAM_SYSTEM_ID: 'SystemId=',
    PARAM_GATEWAY_ID: 'GatewayId=',
    PARAM_EXPERT_PASSWORD: 'Password=',
};

const { Issuer, custom, generators } = require('openid-client');
const fs = require('fs');
const path = require('path');

/**
 *
 * Create a new instance of the WolfSmartSet class
 *
 */
class WolfSmartSet {
    /**
     * Initialze a WolfSmartSet instance
     *
     * @param username - The login username
     * @param password - The login password
     * @param adapter - The adapter instance
     */
    constructor(username, password, adapter) {
        //super();
        if (typeof adapter === 'undefined') {
            adapter = adapter_helper;
        }

        this.USER = username;
        this.PASS = password;
        this.adapter = adapter;
        this.UpdateInterval = 60000; //3600000;
        this.UpdateTimeout = null;
        this.refreshTimeout = null;
        this.destroyed = false;

        this.LastAccess = null; // must be null on first request to get full value list

        //if (this.USER && this.PASS && this.USER != '' && this.PASS != '') this._init();
        //else this.adapter.log.warn('PLEASE enter username and password in config');
        this.openIdStore = {};

        this.auth = {};
        this.SessionId = null;
        this.System = {};
        this.isExpertSession = false;
        this.ExpertInterval = 3600000; // hourly re-init for Expert Mode
        this.ExpertTimeout = null;

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

    /**
     * Initialze OpenID object
     */
    async openIdInit() {
        // initialize OpenID Issuer with Wolf relevant details
        this.openIdIssuer = await Issuer.discover(_API_STRING['WEBSERVER'] + _API_STRING['PATH_OPENID_CFG']);

        // initialize OpenID Client with Wolf relevant details
        this.openIdClientId = 'smartset.web';
        this.openIdClient = new this.openIdIssuer.Client({
            client_id: this.openIdClientId,
            redirect_uris: [_API_STRING['WEBSERVER'] + _API_STRING['PATH_OPENID_SIGNIN_CB']],
            response_types: ['code'],
            // id_token_signed_response_alg (default "RS256")
            token_endpoint_auth_method: 'none', // (default 'client_secret_basic')
        });

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

    /**
     * Initialize auth object from adapter settings
     *
     * @param auth - the auth object holding credentials
     * @param doNotSave - whether or not to also save credential in auth file
     */
    setAuthData(auth, doNotSave) {
        if (!auth) {
            return;
        }

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

    /**
     * Initialze the adapter
     */
    async init() {
        // prepare Connection
        if (!this.auth || !this.auth.access_token) {
            this.setAuthData(await this._getAuthToken(), false);
        }
        if (this.auth && this.auth.access_token) {
            this.SessionId = await this._createSession();
            this.UserInfo = await this._getUserCapabilities();
            this.System = await this._getSystemList();

            this.adapter.log.info('Initialization with Login and new Session done!');

            if (typeof this.UserInfo != 'undefined') {
                if (this.adapter.config.pingInterval < this.UserInfo.MaxSystemBusSamplingRateSec) {
                    this.adapter.log.warn(
                        `Adapter poll interval (${this.adapter.config.pingInterval.toString()} s) is less than min poll interval (${this.UserInfo.MaxSystemBusSamplingRateSec.toString()} s) permitted by Wolf: consider changing adapter settings!`,
                    );
                }
            }

            this.adapter.log.debug(
                `Fetch Expert Values: ${this.adapter.config.doExpert.toString()}, Expert PW: ${
                    this.adapter.config.expertPassword.length > 0 ? '****' : 'not set'
                }`,
            );

            if (this.adapter.config.doExpert) {
                this.LastAccess = null;
                let expertLoggedIn = await this._expertLogin(this.adapter.config.expertPassword);
                if (expertLoggedIn) {
                    this.adapter.log.info('Expert Login done!');
                    this.isExpertSession = true;
                } else {
                    this.adapter.log.info("Expert Login failed: check 'Expert Password' in adapter settings!");
                }

                // Expert Mode needs periodic re-initialization
                this.adapter.log.debug('Setting up re-init for Expert Mode');
                this.ExpertTimeout && clearTimeout(this.ExpertTimeout);
                this.ExpertTimeout = setTimeout(async () => {
                    await this.init();
                }, this.ExpertInterval);
            }

            this.UpdateTimeout && clearTimeout(this.UpdateTimeout);
            this.UpdateTimeout = setTimeout(() => {
                this._sessionUpdate();
            }, this.UpdateInterval);
        }
    }

    /**
     * Do an Expert Login to the Wolf server within the current session
     *
     * @param expertPassword - the expert password
     */
    async _expertLogin(expertPassword) {
        const headers = await this._generateHeader('');
        try {
            const response = await axios.get(
                `${_API_STRING['WEBSERVER'] + _API_STRING['PATH_EXPERT_LOGIN']}?${
                    _API_STRING['PARAM_EXPERT_PASSWORD']
                }${expertPassword}`,
                {
                    headers: headers,
                },
            );
            if (this.destroyed) {
                return;
            }
            this.adapter.LastAccess = null; // reset last access to get full value list after re-login
            this.adapter.log.debug(`API EXPERT LOGIN: ${response.status}`);
            return true;
        } catch (error) {
            this.adapter.log.warn(`API EXPERT LOGIN: ${error.message}`);
            return false;
        }
    }

    /**
     * Get the list of devices belonging to the given user from Wolf server
     *
     * @param user - Wolf login username
     * @param password - Wolf login password
     */
    async adminGetDevicelist(user, password) {
        const origUser = this.USER;
        const origPass = this.PASS;
        const origAuth = this.auth;

        let system;
        try {
            this.USER = user;
            this.PASS = password;
            this.setAuthData(await this._getAuthToken(), true);

            if (this.auth && this.auth.access_token) {
                this.SessionId = await this._createSession();
                system = await this._getSystemList();
            }
        } catch (error) {
            this.adapter.log.warn(`API GET ADMIN DEVICE LIST ERROR: ${error.message}`);
        }

        this.USER = origUser;
        this.PASS = origPass;
        this.setAuthData(origAuth, true);

        if (this.auth && this.auth.access_token) {
            await this._refresh();
        }

        return system;
    }

    /**
     * Get authentication token from OpenID authentication
     */
    async _getAuthToken() {
        this.refreshTimeout && clearTimeout(this.refreshTimeout);

        const codeVerifier = generators.codeVerifier();
        const codeChallenge = generators.codeChallenge(codeVerifier);
        const state = generators.state();

        this.openIdStore[state] = {
            code_verifier: codeVerifier,
        };

        if (!this.openIdClient) {
            this.openIdInit();
        }

        try {
            const authUrl = this.openIdClient.authorizationUrl({
                scope: 'openid profile api role',
                state,
                code_challenge: codeChallenge,
                code_challenge_method: 'S256',
            });

            this.adapter.log.debug(`authUrl: ${authUrl}`);

            const headers = {
                'Cache-control': 'no-cache',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:108.0) Gecko/20100101 Firefox/108.0',
                Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'de-DE,de;q=0.8,en-US;q=0.5,en;q=0.3',
                Referer: `${_API_STRING['WEBSERVER']}/`,
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'same-origin',
                TE: 'trailers',
            };

            const loginPage = await axios.get(authUrl, {
                headers,
            });

            const loginUrl = loginPage.request.res.responseUrl;

            const requestVerificationToken = loginPage.data.match(
                /<input name="__RequestVerificationToken" type="hidden" value="(.*)" \/>/,
            )[1];
            // @ts-expect-error: we checked presence of 'setcookie' haeder above
            const cookies = loginPage.headers['set-cookie'].map(cookie => cookie.split(';')[0]);

            this.adapter.log.debug(`requestVerificationToken: ${requestVerificationToken}`);

            const data = {
                'Input.Username': this.USER,
                'Input.Password': this.PASS,
                __RequestVerificationToken: requestVerificationToken,
            };

            // convert to Query string
            const query = Object.keys(data)
                .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(data[k])}`)
                .join('&');

            headers['Content-Type'] = 'application/x-www-form-urlencoded';
            headers.Origin = _API_STRING['WEBSERVER'];
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

            const redirectUrl = `${_API_STRING['WEBSERVER']}${responsePost.headers.location}`;
            // @ts-expect-error: we checked presence of 'setcookie' haeder above
            cookies.push(...responsePost.headers['set-cookie'].map(cookie => cookie.split(';')[0]));
            headers.Cookie = cookies.join('; ');

            const response = await axios({
                url: redirectUrl,
                headers,
                method: 'GET',
            });

            if (this.destroyed) {
                return;
            }

            const callbackUrl = response.request.res.responseUrl;

            this.adapter.log.debug(`callbackUrl: ${callbackUrl}`);

            const params = this.openIdClient.callbackParams(callbackUrl);

            if (!this.openIdStore[params.state]) {
                throw new Error(
                    `Can not decode response for State ${params.state}. Please reload start page and try again!`,
                );
            }

            if (params.code) {
                const tokenData = {
                    client_id: this.openIdClientId,
                    code: params.code,
                    redirect_uri: _API_STRING['WEBSERVER'] + _API_STRING['PATH_OPENID_SIGNIN_CB'],
                    code_verifier: this.openIdStore[params.state].code_verifier,
                    grant_type: 'authorization_code',
                };

                this.adapter.log.debug(`token data: ${JSON.stringify(tokenData)}`);
                // convert to Query string
                const tokenQuery = Object.keys(tokenData)
                    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(tokenData[k])}`)
                    .join('&');

                const tokenSet = await axios({
                    url: _API_STRING['WEBSERVER'] + _API_STRING['PATH_OPENID_GET_TOKEN'],
                    data: tokenQuery,
                    headers,
                    method: 'POST',
                });

                this.adapter.log.debug(`Wolf-Cloud: received and validated tokens: ${JSON.stringify(tokenSet.data)}`);

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
            } else if (params.error) {
                this.adapter.log.warn(`Wolf-Cloud: ERROR: ${JSON.stringify(params)}`);
                throw new Error(`${params.error}: ${params.error_description}`);
            }
        } catch (error) {
            this.adapter.log.warn(`API GET AUTH TOKEN ERROR: ${error.message}`);
            this.adapter.log.warn(error.stack);
        }
    }

    /**
     * Get current user's Wolf Smartset portal capabilities
     *
     * @returns userCapabilities object
     *  {
     *      "IsPasswordReset":false,
     *      "UserName":"jdoe",
     *      "UserSalutationType":2,
     *      "Firstname":"John",
     *      "Surname":"Doe",
     *      "CultureInfoCode":"de-DE",
     *      "TwoLetterCountryCode":"DE",
     *      "Email":"john.doe@example.com",
     *      "MaxSystemBusSamplingRateSec":60
     *  }
     */
    async _getUserCapabilities() {
        const headers = await this._generateHeader('application/json');
        try {
            const response = await axios.post(
                _API_STRING['WEBSERVER'] + _API_STRING['PATH_PORTAL_USERINFO'],
                undefined,
                { headers: headers },
            );
            if (this.destroyed) {
                return;
            }
            this.adapter.log.debug(`API GET USERINFO: ${JSON.stringify(response.data)}`);
            return response.data;
        } catch (error) {
            this.adapter.log.warn(`API GET USERINFO ERROR: ${error.message}`);
        }
    }

    /**
     * Get the list of systems feom Wolf server, includes SystemId and GatewayId
     */
    async _getSystemList() {
        const headers = await this._generateHeader('application/json');
        try {
            const response = await axios.get(_API_STRING['WEBSERVER'] + _API_STRING['PATH_GET_SYSTEM_LIST'], {
                headers: headers,
            });
            if (this.destroyed) {
                return;
            }
            this.adapter.log.debug(`API GET SYSTEM LIST: ${JSON.stringify(response.data)}`);
            return response.data.Systems;
        } catch (error) {
            this.adapter.log.warn(`API GET SYSTEM LIST ERROR: ${error.message}`);
        }
    }

    /**
     * Get list of value ids from Wolf server
     *
     * @param GatewayId - Gateway Id as received by _getSystemList()
     * @param SystemId - SystemId as received by _getSystemList()
     */
    async getGUIDescription(GatewayId, SystemId) {
        const headers = await this._generateHeader('application/json');
        try {
            const response = await axios.get(
                `${_API_STRING['WEBSERVER'] + _API_STRING['PATH_GET_GUI_DESC_FOR_GW']}?${_API_STRING['PARAM_GATEWAY_ID']}${GatewayId}&${_API_STRING['PARAM_SYSTEM_ID']}${SystemId}`,
                {
                    //_API_STRING["PATH_GET_GUI_DESC_FOR_APP"] for App data
                    headers: headers,
                },
            );
            if (this.destroyed) {
                return;
            }
            this.adapter.log.debug(`API GET GUI DESC.: ${JSON.stringify(response.data)}`);
            return response.data;
        } catch (error) {
            this.adapter.log.warn(`API GET GUI DESC. ERROR: ${error.message}`);
            console.log(error);
        }
    }

    /**
     * Get list of values from Wolf server
     *
     * @param GatewayId - Gateway Id as received by _getSystemList()
     * @param SystemId - SystemId as received by _getSystemList()
     * @param BundleValuesList - list of lists values of interest
     */
    async getValList(GatewayId, SystemId, BundleValuesList) {
        const bundleId = this.isExpertSession ? 3100 : 1000;
        const valueIdList = this.isExpertSession
            ? BundleValuesList[1000].concat(BundleValuesList[3100])
            : BundleValuesList[1000];

        const headers = await this._generateHeader('application/json');
        const payload = {
            BundleId: bundleId,
            IsSubBundle: false,
            ValueIdList: valueIdList,
            GatewayId: GatewayId,
            SystemId: SystemId,
            LastAccess: this.LastAccess,
            GuiIdChanged: this.LastAccess == null ? true : false,
            SessionId: this.SessionId,
        };

        if (this.LastAccess == null) {
            this.adapter.log.info(`API GET VAL LIST: asking for full value list`);
        }

        try {
            const response = await axios.post(_API_STRING['WEBSERVER'] + _API_STRING['PATH_GET_PARAM_VALS'], payload, {
                headers: headers,
            });
            if (this.destroyed) {
                return;
            }
            this.adapter.log.debug(`API GET VAL LIST: ${JSON.stringify(response.data)}`);
            if (response.data.LastAccess) {
                this.LastAccess = response.data.LastAccess;
            }
            return response.data;
        } catch (error) {
            this.adapter.log.warn(`API GET VAL LIST ERROR: ${error.message}`);
            if (error.response && (error.response.status === 400 || error.response.status === 401)) {
                await this._refresh();
            }
        }
    }

    /**
     * Will bew called when adapter is stopped
     */
    async stop() {
        this.UpdateTimeout && clearTimeout(this.UpdateTimeout);
        this.refreshTimeout && clearTimeout(this.refreshTimeout);
        this.ExpertTimeout && clearTimeout(this.ExpertTimeout);
        this.destroyed = true;
    }

    /**
     * Refresh OpenID auth
     */
    async _refresh() {
        this.refreshTimeout && clearTimeout(this.refreshTimeout);

        if (!this.auth || !this.auth.id_token) {
            this.setAuthData(await this._getAuthToken(), false);
            return;
        }

        const codeVerifier = generators.codeVerifier();
        const codeChallenge = generators.codeChallenge(codeVerifier);
        const state = generators.state();

        this.openIdStore[state] = {
            code_verifier: codeVerifier,
        };

        // @ts-expect-error: openIdClient is initialized in init
        let authUrl = this.openIdClient.authorizationUrl({
            scope: 'openid profile api role',
            state,
            code_challenge: codeChallenge,
            code_challenge_method: 'S256',
        });

        authUrl += '&prompt=none';
        authUrl += '&response_mode=query';
        authUrl += `&id_token_hint=${this.auth.id_token}`;

        this.adapter.log.debug(`refresh auth url: ${authUrl}`);

        const headers = {
            'Cache-control': 'no-cache',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:108.0) Gecko/20100101 Firefox/108.0',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'de-DE,de;q=0.8,en-US;q=0.5,en;q=0.3',
            Referer: `${_API_STRING['WEBSERVER']}/`,
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'same-origin',
            TE: 'trailers',
            Cookie: this.auth.allCookies.join('; '),
        };

        try {
            const refreshResponse = await axios.get(authUrl, {
                headers,
            });

            if (this.destroyed) {
                return;
            }

            const callbackUrl = refreshResponse.request.res.responseUrl;

            this.adapter.log.debug(`refresh callbackUrl: ${callbackUrl}`);

            // @ts-expect-error: openIdClient is initialized in init
            const params = this.openIdClient.callbackParams(callbackUrl);

            if (!this.openIdStore[params.state]) {
                throw new Error(
                    `Can not decode response for State ${params.state}. Please reload start page and try again!`,
                );
            }

            if (params.code) {
                const tokenData = {
                    client_id: this.openIdClientId,
                    code: params.code,
                    redirect_uri: _API_STRING['WEBSERVER'] + _API_STRING['PATH_OPENID_SIGNIN_CB'],
                    code_verifier: this.openIdStore[params.state].code_verifier,
                    grant_type: 'authorization_code',
                };

                this.adapter.log.debug(`token data: ${JSON.stringify(tokenData)}`);
                // convert to Query string
                const tokenQuery = Object.keys(tokenData)
                    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(tokenData[k])}`)
                    .join('&');

                const tokenSet = await axios({
                    url: _API_STRING['WEBSERVER'] + _API_STRING['PATH_OPENID_GET_TOKEN'],
                    data: tokenQuery,
                    headers,
                    method: 'POST',
                });

                this.adapter.log.debug(`Wolf-Cloud: received and validated tokens: ${JSON.stringify(tokenSet.data)}`);

                if (tokenSet.data.expires_in) {
                    this.refreshTimeout = setTimeout(() => {
                        this._refresh();
                    }, tokenSet.data.expires_in * 1000);
                }
                tokenSet.data.idCookie = this.auth.idCookie;
                tokenSet.data.allCookies = this.auth.allCookies;
                tokenSet.data.headers = this.auth.headers;

                this.setAuthData(tokenSet.data, false);

                if (tokenSet.data.expires_in) {
                    this.refreshTimeout && clearTimeout(this.refreshTimeout);
                    this.refreshTimeout = setTimeout(() => {
                        this._refresh();
                    }, tokenSet.data.expires_in * 1000);
                }
            } else if (params.error) {
                this.adapter.log.debug(`Wolf-Cloud: ERROR: ${JSON.stringify(params)}`);
                throw new Error(`${params.error}: ${params.error_description}`);
            }
        } catch (error) {
            this.adapter.log.warn(`API REFRESH TOKEN ERROR: ${error.message}`);
            this.adapter.log.warn(error.stack);
            if (error.message.includes('login_required')) {
                this.auth = {};
                await this.init();
            }
        }
    }

    /**
     * Set a param values on Wolf server
     *
     * @param GatewayId - Gateway Id as received by _getSystemList()
     * @param SystemId - SystemId as received by _getSystemList()
     * @param paramValList - list of parameter values to be changed
     */
    async setParameter(GatewayId, SystemId, paramValList) {
        const payload = {
            SessionId: this.SessionId,
            BundleId: 1000,
            GatewayId: GatewayId,
            SystemId: SystemId,
            WriteParameterValues: paramValList,
            WaitForResponseTimeout: null,
            GuiId: null,
        };
        const headers = await this._generateHeader('application/json');

        this.adapter.log.debug(
            `SEND VALUE ${_API_STRING['WEBSERVER']}${_API_STRING['PATH_SET_PARAM_VALS']} : ${JSON.stringify(payload)}`,
        );
        try {
            const response = await axios.post(_API_STRING['WEBSERVER'] + _API_STRING['PATH_SET_PARAM_VALS'], payload, {
                //old PATH_WRITE_PARAM_VALS, new PATH_SET_PARAM_VALS
                headers: headers,
            });
            if (this.destroyed) {
                return;
            }
            this.adapter.log.debug(`SEND VALUE : ${JSON.stringify(response.data)}`);
            return response.data;
        } catch (error) {
            this.adapter.log.warn(`SEND VALUE ERROR: ${error.message}`);
        }
    }

    /**
     * Send session keepalive (UPDATE_SESSION) to Wolf server
     */
    async _sessionUpdate() {
        this.UpdateTimeout && clearTimeout(this.UpdateTimeout);
        this.adapter.log.debug('Updating session!');

        const headers = await this._generateHeader('application/json');
        const payload = {
            SessionId: this.SessionId,
        };

        try {
            const response = await axios.post(_API_STRING['WEBSERVER'] + _API_STRING['PATH_UPDATE_SESSION'], payload, {
                headers: headers,
            });
            if (this.destroyed) {
                return;
            }
            this.adapter.log.debug(`SESSION UPDATE: ${JSON.stringify(response.data)}`);
            if (response.data.LastAccess) {
                this.LastAccess = response.data.LastAccess;
            }
            //return response.data;
        } catch (error) {
            this.adapter.log.warn(`SESSION UPDATE ERROR: ${error.message}`);

            if (this.SessionId && error.response && (error.response.status === 401 || error.response.status === 400)) {
                this.SessionId = await this._createSession();
            }
            if (!this.SessionId) {
                await this.init();
            }
        }

        this.UpdateTimeout = setTimeout(() => {
            this._sessionUpdate();
        }, this.UpdateInterval);
    }

    /**
     * Get system state from Wolf server
     *
     * @param SystemId - SystemId as received by _getSystemList()
     * @returns SystemState object
     *  {
     *  	"AccessLevel":4,
     *   	"IsSystemShareDeleted":false,
     * 		"IsSystemDeleted":false,
     * 		"IsOnline":true,
     * 		"IsLocked":false,
     * 		"MaintenanceState":{"Mode":0,"Progress":0,
     * 		"CWLFilterMaintenancePending":false},
     * 		"RequestDate":"2021-03-13T18:49:14.9610258Z",
     * 		"LastDisconnect":"2021-03-13T10:38:37.51"
     * 	}
     */
    async getSystemState(SystemId) {
        const headers = await this._generateHeader('application/json');

        try {
            const response = await axios.get(
                _API_STRING['WEBSERVER'] + _API_STRING['PATH_GET_SYSTEM_STATE'] + SystemId,
                {
                    headers: headers,
                },
            );
            if (this.destroyed) {
                return;
            }
            this.adapter.log.debug(`API GET SYSTEM STATE: ${JSON.stringify(response.data)}`);
            return response.data;
        } catch (error) {
            this.adapter.log.warn(`API GET SYSTEM STATE: ${error.message}`);
        }
    }

    /**
     * Return current timestmp as DateTime string feasable for Wolf server
     */
    generateDateTimeString() {
        const date = new Date();
        const year = date.getFullYear();
        const month = (1 + date.getMonth()).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        const hour = date.getHours().toString().padStart(2, '0');
        const minute = date.getMinutes().toString().padStart(2, '0');
        const second = date.getSeconds().toString().padStart(2, '0');
        return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
    }

    /**
     * Create a Wolf server session using the existing OPenID Token
     */
    async _createSession() {
        if (!this.auth || !this.auth.token_type || !this.auth.access_token) {
            this.adapter.log.debug('No auth token found!');
            this.setAuthData(await this._getAuthToken(), false);
        }

        try {
            const headers = {
                'Content-Type': 'application/json; charset=utf-8',
                Authorization: this.auth ? `${this.auth.token_type} ${this.auth.access_token}` : '',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:108.0) Gecko/20100101 Firefox/108.0', //'ioBroker.wolfsmartset',
                Accept: '*/*',
                'Accept-Language': 'de-DE,de;q=0.8,en-US;q=0.5,en;q=0.3',
                Host: _API_STRING['HOST'],
                Connection: 'keep-alive',
                'Cache-control': 'no-cache',
                Cookie: this.auth.idCookie,
                Origin: _API_STRING['WEBSERVER'],
                'X-Requested-With': 'XMLHttpRequest',
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'same-origin',
                TE: 'trailers',
            };

            /*
            const initResponse = await axios.get(_API_STRING["WEBSERVER"] + _API_STRING["PATH_PORTAL_INIT"] + '?_=' + Date.now(), {
                headers
            });
            */

            const payload = {
                Timestamp: this.generateDateTimeString(),
                //ClientSideIdentifier: '0001-01-01T00:00:00',
                //AppVersion: '3.0.29'
            };

            const response = await axios.post(_API_STRING['WEBSERVER'] + _API_STRING['PATH_CREATE_SESSION'], payload, {
                headers: headers,
            });
            if (this.destroyed) {
                return;
            }
            this.adapter.log.debug(`API CREATE SESSION: ${JSON.stringify(response.data)}`);
            this.adapter.log.debug(`API CREATE SESSION: ${response.data.BrowserSessionId}`);
            return response.data.BrowserSessionId;
        } catch (error) {
            this.adapter.log.warn(`API CREATE SESSION ERROR: ${error.message}`);
            this.adapter.log.warn(error.stack);
        }
    }

    /**
     * Return a HTTP header feasable for communication with Wolf server
     *
     * @param cType - the ContentType
     */
    async _generateHeader(cType) {
        return {
            'Content-Type': cType,
            Authorization: this.auth ? `${this.auth.token_type} ${this.auth.access_token}` : '',
            'User-Agent': 'ioBroker.wolfsmartset',
            Accept: '*/*',
            Host: _API_STRING['HOST'],
            Connection: 'keep-alive',
            'Cache-control': 'no-cache',
            'X-Pect': 'The Spanish Inquisition',
        };
    }
}

// just for testing
//-----------------------------------
const adapter_helper = {
    //config: Config.getInstance().get("landroid-s"),
    log: {
        info: function (msg) {
            console.log(`INFO: ${msg}`);
        },
        error: function (msg) {
            console.log(`ERROR: ${msg}`);
        },
        debug: function (msg) {
            console.log(`DEBUG: ${msg}`);
        },
        warn: function (msg) {
            console.log(`WARN: ${msg}`);
        },
    },
    msg: {
        info: [],
        error: [],
        debug: [],
        warn: [],
    },
};

module.exports = WolfSmartSet;
