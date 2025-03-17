const fs = require('fs');
const path = require('path');
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
    PATH_GET_SYSTEM_LIST: '/portal/api/portal/systems/50', // unused
    PATH_GET_SYSTEM_LIST2: '/portal/api/portal/GetSystemList',
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

// periodic API activity intervals
const _API_INTERVAL_EXPERT_LOGIN = 7200000; // refresh Expert Login Interval: 2 hours
const _API_INTERVAL_SESSION_UPDATE = 60000;

const { Issuer, custom, generators } = require('openid-client');

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
        this.USER = username;
        this.PASS = password;
        this.adapter = adapter;
        this.UpdateInterval = _API_INTERVAL_SESSION_UPDATE;
        this.UpdateTimeout = null;
        this.refreshTimeout = null;
        this.destroyed = false;

        this.LastAccessShort = null; // must be null on first request to get full value list
        this.LastAccessLong = null; // must be null on first request to get full value list

        this.openIdStore = {};

        this.openIdClientId = 'smartset.web';
        this.openIdClient = null;
        this.auth = {};
        this.SessionId = null;
        this.isExpertSession = false;
        this.ExpertInterval = _API_INTERVAL_EXPERT_LOGIN;
        this.ExpertTimeout = null;

        const authPath = utils.getAbsoluteInstanceDataDir(this.adapter);
        // No more auth data caching
        // try {
        //     if (!fs.existsSync(authPath)) {
        //         fs.mkdirSync(authPath);
        //     }
        // } catch (error) {
        //     this.adapter.log.warn(`Error creating directory: ${error.message}`);
        // }
        this.authFile = path.join(authPath, 'auth.json');
    }

    /**
     * Return a HTTP header feasable for the id_srv (openId)
     */
    async _generateOpenIdHeader() {
        return {
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
    }

    /**
     * Return a HTTP header feasable for communication with Wolf server
     *
     * @param cType - the ContentType
     */
    async _generateApiHeader(cType) {
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

    /**
     * Return current timestmp as DateTime string feasable for Wolf server
     */
    _generateDateTimeString() {
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
     * Initialize auth object from adapter settings
     *
     * @param auth - the auth object holding credentials
     */
    _setAuthData(auth) {
        // No more auth data caching
        // _setAuthData(auth, doNotSave) {
        if (!auth) {
            return;
        }

        this.auth = auth;
        this.auth.USER = this.USER;
        this.auth.PASS = this.PASS;

        // No more auth data caching
        // if (!doNotSave) {
        //     try {
        //         fs.writeFileSync(this.authFile, JSON.stringify(auth), 'utf-8');
        //         this.adapter.log.debug(`Auth data saved to ${this.authFile}`);
        //     } catch (error) {
        //         this.adapter.log.warn(`Error writing auth.json: ${error.message}`);
        //     }
        // }
    }

    /**
     * Clear auth object and remove auth data cache file (incl: id_token, access_token, idsrv.session),
     * so the adapter is forced to do a fresh openId authentication next time
     *
     */
    _removeAuthData() {
        this.auth = {};

        try {
            fs.unlinkSync(this.authFile);
            this.adapter.log.info(`Auth data cache file ${this.authFile} was removed successfully.`);

            // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (error) {
            return;
        }
    }

    /**
     * Initialze OpenID object
     */
    async _openIdInit() {
        // initialize OpenID Issuer with Wolf relevant details
        const openIdIssuer = await Issuer.discover(_API_STRING['WEBSERVER'] + _API_STRING['PATH_OPENID_CFG']);
        const openIdClient = new openIdIssuer.Client({
            client_id: this.openIdClientId,
            redirect_uris: [_API_STRING['WEBSERVER'] + _API_STRING['PATH_OPENID_SIGNIN_CB']],
            response_types: ['code'],
            // id_token_signed_response_alg (default "RS256")
            token_endpoint_auth_method: 'none', // (default 'client_secret_basic')
        });

        custom.setHttpOptionsDefaults({
            timeout: 5000,
        });

        return openIdClient;
        // try {
        //     if (fs.existsSync(this.authFile)) {
        //         const auth = JSON.parse(fs.readFileSync(this.authFile, 'utf-8'));

        //         if (auth && auth.access_token && auth.USER === this.USER && auth.PASS === this.PASS) {
        //             this.auth = auth;

        //             this.adapter.log.debug(`Auth data loaded from ${this.authFile}`);

        //             await this._refreshAuthToken();
        //         }
        //     }
        // } catch (error) {
        //     this.adapter.log.warn(`Error reading auth.json: ${error.message}`);
        // }
    }

    /**
     * Get authentication token from OpenID authentication
     */
    async _getAuthToken() {
        this.adapter.log.debug(`_getAuthToken(): starting ...`);
        this.refreshTimeout && clearTimeout(this.refreshTimeout);

        const codeVerifier = generators.codeVerifier();
        const codeChallenge = generators.codeChallenge(codeVerifier);
        const state = generators.state();

        this.openIdStore[state] = {
            code_verifier: codeVerifier,
        };

        if (!this.openIdClient) {
            this.openIdClient = await this._openIdInit();
        }

        try {
            const authUrl = this.openIdClient.authorizationUrl({
                scope: 'openid profile api role',
                state,
                code_challenge: codeChallenge,
                code_challenge_method: 'S256',
            });

            this.adapter.log.debug(`_getAuthToken(): authUrl: ${authUrl}`);

            const headers = await this._generateOpenIdHeader();

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

            this.adapter.log.debug(`_getAuthToken(): callbackUrl: ${callbackUrl}`);

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

                this.adapter.log.info(
                    `_getAuthToken(): received and validated tokens: ${JSON.stringify(tokenSet.data)}`,
                );

                if (tokenSet.data.expires_in) {
                    this.adapter.log.info(
                        `_getAuthToken(): tokens will expire in ${tokenSet.data.expires_in} seconds, setting refresh timer.`,
                    );
                    this.refreshTimeout = setTimeout(() => {
                        this._refreshAuthToken();
                    }, tokenSet.data.expires_in * 1000);
                }
                tokenSet.data.idCookie = cookies.find(cookie => cookie.startsWith('idsrv.session='));
                tokenSet.data.allCookies = cookies;
                tokenSet.data.headers = headers;

                return tokenSet.data;
            } else if (params.error) {
                this.adapter.log.warn(`_getAuthToken(): ERROR: ${JSON.stringify(params)}`);
                throw new Error(`${params.error} / ${params.error_description}`);
            }
        } catch (error) {
            this.adapter.log.warn(`_getAuthToken(): ERROR: ${error.message}`);
            this.adapter.log.warn(error.stack);
        }
    }

    /**
     * Refresh OpenId auth token
     */
    async _refreshAuthToken() {
        this.adapter.log.debug(`_refreshAuthToken(): starting ...`);
        this.refreshTimeout && clearTimeout(this.refreshTimeout);

        // if no auth data available, start a fresh authentication
        if (!this.auth || !this.auth.id_token) {
            this._setAuthData(await this._getAuthToken());
            return;
        }

        // otherwise try refreshing existing auth tokens
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

        this.adapter.log.debug(`_refreshAuthToken(): refresh auth url: ${authUrl}`);

        const headers = await this._generateOpenIdHeader();
        headers['Cookie'] = this.auth.allCookies.join('; ');

        try {
            const refreshResponse = await axios.get(authUrl, {
                headers,
            });

            if (this.destroyed) {
                return;
            }

            const callbackUrl = refreshResponse.request.res.responseUrl;

            this.adapter.log.debug(`_refreshAuthToken(): callbackUrl: ${callbackUrl}`);

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

                this.adapter.log.debug(
                    `_refreshAuthToken(): received and validated tokens: ${JSON.stringify(tokenSet.data)}`,
                );

                if (tokenSet.data.expires_in) {
                    this.adapter.log.info(
                        `_refreshAuthToken(): tokens will expire in ${tokenSet.data.expires_in} seconds, setting refresh timer.`,
                    );
                    this.refreshTimeout = setTimeout(() => {
                        this._refreshAuthToken();
                    }, tokenSet.data.expires_in * 1000);
                }
                tokenSet.data.idCookie = this.auth.idCookie;
                tokenSet.data.allCookies = this.auth.allCookies;
                tokenSet.data.headers = this.auth.headers;

                this._setAuthData(tokenSet.data);
            } else if (params.error) {
                this.adapter.log.debug(`_refreshAuthToken(): ERROR: ${JSON.stringify(params)}`);
                throw new Error(`${params.error} / ${params.error_description}`);
            }
        } catch (error) {
            this.adapter.log.warn(`_refreshAuthToken(): ERROR: ${error.message}`);
            if (error.message.includes('login_required')) {
                this.adapter.log.info(`_refreshAuthToken(): starting fresh auth`);
                this.auth = {};
                await this.init();
            }
        }
    }

    /**
     * Logout and close OpenId session
     */
    async _destroyAuthToken() {
        this.adapter.log.debug(`_destroyAuthToken() starting ...`);

        if (!this.auth || !this.auth.id_token) {
            this.adapter.log.debug(`_destroyAuthToken(): id_token already removed ...`);
            this._removeAuthData();
            return;
        }

        if (!this.openIdClient) {
            this.adapter.log.debug(`_destroyAuthToken(): no openIdClient found ...`);
            this._removeAuthData();
            return;
        }

        let endSessionUrl = this.openIdClient.endSessionUrl();

        if (typeof endSessionUrl == 'undefined') {
            this.adapter.log.warn(`_destroyAuthToken(): endSession endpoint not found!`);
            this._removeAuthData();
            return;
        }

        endSessionUrl += `&id_token_hint=${this.auth.id_token}`;
        endSessionUrl += `&post_logout_redirect_uri=${_API_STRING['WEBSERVER']}/index.html`;
        this.adapter.log.debug(`endsession url: ${endSessionUrl}`);

        const headers = await this._generateOpenIdHeader();
        headers['Host'] = `${_API_STRING['HOST']}`;
        headers['Connection'] = 'keep-alive';
        headers['Priority'] = 'u=0, i';
        headers['Referer'] = `${_API_STRING['HOST']}/index.html`;
        headers['Upgrade-Insecure-Requests'] = '1';
        headers['Cookie'] = this.auth.allCookies.join('; ');

        try {
            const endsessionResponse = await axios.get(endSessionUrl, {
                headers,
            });

            if (endsessionResponse.status != 200) {
                this.adapter.log.warn(
                    `API ENDSESSION WARNING: unexpected response: ${endsessionResponse.statusText} (${endsessionResponse.statusText})`,
                );
            } else {
                this.adapter.log.info(`API ENDSESSION: successfully logged out`);
            }
        } catch (error) {
            this.adapter.log.warn(`API ENDSESSION ERROR: ${error.message}`);
            this.adapter.log.warn(error.stack);
        }

        this._removeAuthData();
    }

    /**
     * Create a Wolf server session using the existing OPenID Token
     */
    async _createSession() {
        if (!this.auth || !this.auth.token_type || !this.auth.access_token) {
            this.adapter.log.debug('_createSession(): No auth token found!');
            this._setAuthData(await this._getAuthToken());
        }

        try {
            const headers = await this._generateApiHeader('application/json; charset=utf-8');
            headers['Cookie'] = this.auth.idCookie;
            headers['Origin'] = _API_STRING['WEBSERVER'];
            headers['X-Requested-With'] = 'XMLHttpRequest';
            headers['Sec-Fetch-Dest'] = 'empty';
            headers['Sec-Fetch-Mode'] = 'cors';
            headers['SSec-Fetch-Site'] = 'same-origin';
            headers['TE'] = 'trailers';

            /*
            const initResponse = await axios.get(_API_STRING["WEBSERVER"] + _API_STRING["PATH_PORTAL_INIT"] + '?_=' + Date.now(), {
                headers
            });
            */

            const payload = {
                Timestamp: this._generateDateTimeString(),
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
     * Send session keepalive (UPDATE_SESSION) to Wolf server
     */
    async _sessionUpdate() {
        this.UpdateTimeout && clearTimeout(this.UpdateTimeout);

        const headers = await this._generateApiHeader('application/json');
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

    // /**
    //  * Get the list of systems from Wolf server, includes SystemId and GatewayId
    //  */
    // async _getSystemList() {
    //     const headers = await this._generateApiHeader('application/json');
    //     try {
    //         const response = await axios.get(_API_STRING['WEBSERVER'] + _API_STRING['PATH_GET_SYSTEM_LIST'], {
    //             headers: headers,
    //         });
    //         if (this.destroyed) {
    //             return;
    //         }
    //         this.adapter.log.debug(`API GET SYSTEM LIST: ${JSON.stringify(response.data)}`);
    //         return response.data.Systems;
    //     } catch (error) {
    //         this.adapter.log.warn(`API GET SYSTEM LIST ERROR: ${error.message}`);
    //     }
    // }

    /**
     * Get the list of systems from Wolf server, includes SystemId and GatewayId
     * This is an alternative implementation as done by the Web Portal
     */
    async _getSystemList2() {
        const headers = await this._generateApiHeader('application/json');
        try {
            const response = await axios.get(
                `${_API_STRING['WEBSERVER']}${_API_STRING['PATH_GET_SYSTEM_LIST2']}?_=${Date.now()}`,
                {
                    headers: headers,
                },
            );
            if (this.destroyed) {
                return;
            }
            this.adapter.log.debug(`API GET SYSTEM LIST2: ${JSON.stringify(response.data)}`);
            return response.data;
        } catch (error) {
            this.adapter.log.warn(`API GET SYSTEM LIST2 ERROR: ${error.message}`);
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
        const headers = await this._generateApiHeader('application/json');
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
     * Do an Expert Login to the Wolf server within the current session
     *
     * @param expertPassword - the expert password
     */
    async _expertLogin(expertPassword) {
        const headers = await this._generateApiHeader('');
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
            this.adapter.log.debug(`API EXPERT LOGIN: ${response.status}`);
            return true;
        } catch (error) {
            this.adapter.log.warn(`API EXPERT LOGIN: ${error.message}`);
            return false;
        }
    }

    /**
     * Initialze the adapter
     */
    async init() {
        // remove Expert Login Timer to avoid duplicate login
        this.ExpertTimeout && clearTimeout(this.ExpertTimeout);

        // make sure we have an auhtenticated session
        if (!this.auth || !this.auth.access_token) {
            this._setAuthData(await this._getAuthToken());
        }
        if (this.auth && this.auth.access_token) {
            this.SessionId = await this._createSession();
            this.UserInfo = await this._getUserCapabilities();

            this.adapter.log.info('Initialization with Login and new Session done!');

            if (typeof this.UserInfo != 'undefined') {
                if (this.adapter.config.pollIntervalShort < this.UserInfo.MaxSystemBusSamplingRateSec) {
                    this.adapter.log.warn(
                        `Adapter poll interval (${this.adapter.config.pollIntervalShort.toString()} s) is less than min poll interval (${this.UserInfo.MaxSystemBusSamplingRateSec.toString()} s) permitted by Wolf: consider changing adapter settings!`,
                    );
                }
            }

            this.LastAccessShort = null; // reset last access to get full value list after re-login
            this.LastAccessLong = null; // reset last access to get full value list after re-login

            if (this.adapter.config.doExpertLogin) {
                let expertLoggedIn = await this._expertLogin(this.adapter.config.expertPassword);
                if (expertLoggedIn) {
                    this.adapter.log.info('Expert Login done!');
                    this.isExpertSession = true;
                } else {
                    this.adapter.log.info("Expert Login failed: check 'Expert Password' in adapter settings!");
                }

                // Expert Mode needs periodic re-initialization
                this.adapter.log.debug('Setting up re-init for Expert Login');
                this.ExpertTimeout && clearTimeout(this.ExpertTimeout);
                this.ExpertTimeout = setTimeout(async () => {
                    await this.init();
                }, this.ExpertInterval);
            }

            // setup system update timer
            this.UpdateTimeout && clearTimeout(this.UpdateTimeout);
            this.UpdateTimeout = setTimeout(() => {
                this._sessionUpdate();
            }, this.UpdateInterval);

            // init finished successfully
            return true;
        }
        // init somewhere
        return false;
    }

    /**
     * Will bew called when adapter is stopped
     */
    async stop() {
        this.UpdateTimeout && clearTimeout(this.UpdateTimeout);
        this.refreshTimeout && clearTimeout(this.refreshTimeout);
        this.ExpertTimeout && clearTimeout(this.ExpertTimeout);
        this._destroyAuthToken();
        this.destroyed = true;
    }

    /**
     * Get the list of devices belonging to the given user from Wolf server
     *
     */
    async adminGetDevicelist() {
        let system;
        try {
            // make sure we have an auhtenticated session
            if (!this.auth || !this.auth.access_token) {
                this._setAuthData(await this._getAuthToken());
                this.SessionId = null;
            }

            if (this.auth && this.auth.access_token) {
                if (!this.SessionId) {
                    this.SessionId = await this._createSession();
                }
                if (!this.SessionId) {
                    throw new Error('Could not create session');
                }
                system = await this._getSystemList2();
            } else {
                throw new Error('Could not authenticate - check username/password');
            }
        } catch (error) {
            this.adapter.log.warn(`API GET ADMIN DEVICE LIST ERROR: ${error.message}`);
        }

        return system;
    }

    /**
     * Get list of value ids from Wolf server
     *
     * @param GatewayId - Gateway Id as received by _getSystemList()
     * @param SystemId - SystemId as received by _getSystemList()
     */
    async getGUIDescription(GatewayId, SystemId) {
        const headers = await this._generateApiHeader('application/json');
        try {
            const response = await axios.get(
                `${_API_STRING['WEBSERVER'] + _API_STRING['PATH_GET_GUI_DESC_FOR_GW']}?${_API_STRING['PARAM_GATEWAY_ID']}${GatewayId}&${_API_STRING['PARAM_SYSTEM_ID']}${SystemId}`,
                {
                    //_API_STRING["PATH_GET_GUI_DESC_FOR_APP"] for App data
                    headers: headers,
                },
            );
            if (this.destroyed) {
                return null;
            }
            this.adapter.log.debug(`API GET GUI DESC.: ${JSON.stringify(response.data)}`);
            return response.data;
        } catch (error) {
            this.adapter.log.warn(`API GET GUI DESC. ERROR: ${error.message}`);
            console.log(error);
            return null;
        }
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
        const headers = await this._generateApiHeader('application/json');

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
     * Get list of values from Wolf server
     *
     * @param GatewayId - Gateway Id as received by _getSystemList()
     * @param SystemId - SystemId as received by _getSystemList()
     * @param BundleIdRequested - BundleId to set in GetParameterValues request
     * @param ValueIdList - list values of interest to request in GetParameterValues request
     * @param PollCycle - the poll cycle type: 'short' or 'long'
     */
    async getValList(GatewayId, SystemId, BundleIdRequested, ValueIdList, PollCycle) {
        const headers = await this._generateApiHeader('application/json');
        const payload = {
            BundleId: BundleIdRequested,
            IsSubBundle: false,
            ValueIdList: ValueIdList,
            GatewayId: GatewayId,
            SystemId: SystemId,
            LastAccess: PollCycle == 'short' ? this.LastAccessShort : this.LastAccessLong,
            GuiIdChanged:
                (PollCycle == 'short' && this.LastAccessShort == null) ||
                (PollCycle == 'long' && this.LastAccessLong == null)
                    ? true
                    : false,
            SessionId: this.SessionId,
        };
        const requestParams = `BundleId:${BundleIdRequested}, ValuesReqd: ${ValueIdList.length}, LastAccess: ${payload.LastAccess == null ? '!!reset!!' : payload.LastAccess}`;

        // reset LastAccess of the other poll cycle
        this.LastAccessLong = PollCycle == 'short' ? null : this.LastAccessLong;
        this.LastAccessShort = PollCycle == 'long' ? null : this.LastAccessShort;

        if (this.adapter.config.doApiProfile) {
            this.adapter.setState('info_api.poll_req_bundle_id', { val: Number(BundleIdRequested), ack: true });
            this.adapter.setState('info_api.poll_req_num_params', { val: ValueIdList.length, ack: true });
        }

        try {
            const response = await axios.post(_API_STRING['WEBSERVER'] + _API_STRING['PATH_GET_PARAM_VALS'], payload, {
                headers: headers,
            });
            if (this.destroyed) {
                return;
            }
            if (payload.LastAccess == null) {
                this.adapter.log.info(
                    `API GET VAL LIST(${requestParams}) returns ${response.data.Values.length} values: ${JSON.stringify(response.data)}`,
                );
            } else {
                this.adapter.log.debug(
                    `API GET VAL LIST(${requestParams}) returns ${response.data.Values.length} values: ${JSON.stringify(response.data)}`,
                );
            }
            if (response.data.LastAccess) {
                if (PollCycle == 'short') {
                    this.LastAccessShort = response.data.LastAccess;
                } else {
                    this.LastAccessLong = response.data.LastAccess;
                }
            }
            if (this.adapter.config.doApiProfile) {
                this.adapter.setState('info_api.poll_resp_num_params', { val: response.data.Values.length, ack: true });

                // define a function to count elements matching given condition
                const countParams = (arr, condition) => arr.reduce((acc, c) => (condition(c) ? ++acc : acc), 0);

                const numValues = countParams(response.data.Values, o => o.State == 1);
                this.adapter.setState('info_api.poll_resp_num_values', { val: numValues, ack: true });

                // define a function to list ValueIds of all elemnents matching given condition
                const listParamsWithCondition = (arr, condition) =>
                    arr.reduce(
                        (keyList, c) =>
                            condition(c)
                                ? keyList == ''
                                    ? (keyList = c.ValueId)
                                    : `${keyList},${c.ValueId}`
                                : keyList,
                        '',
                    );

                const paramsNoValue = listParamsWithCondition(response.data.Values, o => o.State != 1);
                if (paramsNoValue != '') {
                    this.adapter.log.warn(`API GET VAL LIST(${requestParams}): got no value for: ${paramsNoValue}`);
                }
            }
            return response.data;
        } catch (error) {
            this.adapter.log.warn(`API GET VAL LIST(${requestParams}) - ERROR: ${error.message}`);
            if (error.response && (error.response.status === 400 || error.response.status === 401)) {
                await this._refreshAuthToken();
            }
        }
    }

    /**
     * Set param values on Wolf server
     *
     * @param GatewayId - Gateway Id as received by _getSystemList()
     * @param SystemId - SystemId as received by _getSystemList()
     * @param paramValList - list of parameter values to be changed
     */
    async setValList(GatewayId, SystemId, paramValList) {
        const payload = {
            SessionId: this.SessionId,
            BundleId: 1000,
            GatewayId: GatewayId,
            SystemId: SystemId,
            WriteParameterValues: paramValList,
            WaitForResponseTimeout: null,
            GuiId: null,
        };
        const headers = await this._generateApiHeader('application/json');

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
}

module.exports = WolfSmartSet;
