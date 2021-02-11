/* eslint-disable no-undef */
/* eslint-disable no-console */
/* eslint-disable ts-ignore */

const axios = require('axios');
//const JSON = require('circular-json');

/*
const refreshSessionURL = "https://www.wolf-smartset.com/portal/api/portal/UpdateSession";
const authenticateURL = "https://www.wolf-smartset.com/portal/connect/token2";
const parameterValuesURL = "https://www.wolf-smartset.com/portal/api/portal/GetParameterValues";
const createSessionURL = "https://www.wolf-smartset.com/portal/api/portal/CreateSession";
const systemListURL = "https://www.wolf-smartset.com/portal/api/portal/GetSystemList";
*/

const apiPoint = 'https://www.wolf-smartset.com';

let auth = {};
let System = {};

/**
 * 
 * Create a new instance of the WolfSmartSet class
 *
 * @extends EventEmitter
 */
class WolfSmartSet{
    constructor(username, password, adapter) {
        //super();
        if (typeof (adapter) === 'undefined') adapter = adapter_helper;

        this.USER = username;
        this.PASS = password;
        this.adapter = adapter;
        this.interval = 5000; //3600000;

        if (this.USER && this.PASS && this.USER != '' && this.PASS != '') this._init();
        else this.adapter.log.warn('PLEASE enter username and password in config');
    }

    async _init() {
        // prepare Connection
        auth = await this._getAuthToken();
        await this._createSession();
        System = await this._getSystemList();

    }
    async adminGetDevicelist(user, password) {
        this.USER = user;
        this.PASS = password;
        auth = await this._getAuthToken();

        await this._createSession();
        System = await this._getSystemList();
        return System;
    }

    async _getAuthToken() {
        const data = {
            'username': this.USER,
            'password': this.PASS,
            'grant_type': 'password',
            'scope': 'all',
            'WebApiVersion': '2',
            'AppVersion': '2.1.12'
        };
        const headers = {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Cache-control': 'no-cache'
        };
        // convert to Query string
        let esc = encodeURIComponent;
        let query = Object.keys(data).map(k => esc(k) + '=' + esc(data[k])).join('&');

        try {
            const response = await axios.post(apiPoint + '/portal/connect/token', query, {
                headers: headers
            });
            this.adapter.log.debug('API GET AUTH TOKEN: ' + JSON.stringify(response.data));
            return response.data;

        } catch (error) {
            this.adapter.log.error('API GET AUTH TOKEN ERROR: ' + error);
            return;

        }
    }
    async _getSystemList() {
        let headers = await this._generateHeader('');
        try {
            const response = await axios.get(apiPoint + '/portal/api/portal/GetSystemList', {
                headers: headers
            });
            this.adapter.log.debug('API GET SYSTEM LIST: ' + JSON.stringify(response.data));
            return response.data;

        } catch (error) {
            this.adapter.log.error('API GET SYSTEM LIST ERROR: ' + error);
            return;

        }
    }
    async getGUIDescription(index) {
        let headers = await this._generateHeader('');
        try {
            const response = await axios.get(apiPoint + '/portal/api/portal/GetGuiDescriptionForGateway?GatewayId=' + System[index].GatewayId + '&SystemId=' + System[index].Id, {
                headers: headers
            });
            this.adapter.log.debug('API GET GUI DESK.: ' + JSON.stringify(response.data));
            return response.data;

        } catch (error) {
            this.adapter.log.error('API GET GUI DESK. ERROR: ' + error);
            return;

        }
    }

    async _createSession() {
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': auth.token_type + ' ' + auth.access_token,
            'User-Agent': 'ioBroker.wolfsmartset',
            'Accept': '*/*',
            'Host': 'www.wolf-smartset.com',
            'Connection': 'keep-alive',
            'Cache-control': 'no-cache'
        };

        try {
            const response = await axios.post(apiPoint + '/portal/api/portal/CreateSession', '{\n    \"Timestamp\": \"2019-11-04 21:53:50\"\n}', {
                headers: headers
            });
            this.adapter.log.debug('API CREATE SESSION: ' + JSON.stringify(response.data));
            return response.data;

        } catch (error) {
            this.adapter.log.error('API CREATE SESSION ERROR: ' + error);
            return;

        }

    }

    async _generateHeader(cType) {
        return {
            'Content-Type': cType,
            'Authorization': auth.token_type + ' ' + auth.access_token,
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