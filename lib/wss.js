/* eslint-disable no-undef */
/* eslint-disable no-console */
/* eslint-disable ts-ignore */
const axios = require('axios');
const _021a = ['\x68\x74\x74\x70\x73\x3a\x2f\x2f\x77\x77\x77\x2e\x77\x6f\x6c\x66\x2d\x73\x6d\x61\x72\x74\x73\x65\x74\x2e\x63\x6f\x6d', '\x2f\x70\x6f\x72\x74\x61\x6c\x2f\x63\x6f\x6e\x6e\x65\x63\x74\x2f\x74\x6f\x6b\x65\x6e', '\x2f\x70\x6f\x72\x74\x61\x6c\x2f\x61\x70\x69\x2f\x70\x6f\x72\x74\x61\x6c\x2f\x47\x65\x74\x53\x79\x73\x74\x65\x6d\x4c\x69\x73\x74', '\x2f\x70\x6f\x72\x74\x61\x6c\x2f\x61\x70\x69\x2f\x70\x6f\x72\x74\x61\x6c\x2f\x47\x65\x74\x47\x75\x69\x44\x65\x73\x63\x72\x69\x70\x74\x69\x6f\x6e\x46\x6f\x72\x41\x70\x70\x47\x61\x74\x65\x77\x61\x79\x32\x3f\x47\x61\x74\x65\x77\x61\x79\x49\x64\x3d', '\x26\x53\x79\x73\x74\x65\x6d\x49\x64\x3d', '\x2f\x70\x6f\x72\x74\x61\x6c\x2f\x61\x70\x69\x2f\x70\x6f\x72\x74\x61\x6c\x2f\x47\x65\x74\x50\x61\x72\x61\x6d\x65\x74\x65\x72\x56\x61\x6c\x75\x65\x73', '\x2f\x70\x6f\x72\x74\x61\x6c\x2f\x61\x70\x69\x2f\x70\x6f\x72\x74\x61\x6c\x2f\x57\x72\x69\x74\x65\x50\x61\x72\x61\x6d\x65\x74\x65\x72\x56\x61\x6c\x75\x65\x73', '\x2f\x70\x6f\x72\x74\x61\x6c\x2f\x61\x70\x69\x2f\x70\x6f\x72\x74\x61\x6c\x2f\x55\x70\x64\x61\x74\x65\x53\x65\x73\x73\x69\x6f\x6e', '\x2f\x70\x6f\x72\x74\x61\x6c\x2f\x61\x70\x69\x2f\x70\x6f\x72\x74\x61\x6c\x2f\x43\x72\x65\x61\x74\x65\x53\x65\x73\x73\x69\x6f\x6e\x32', '\x2f\x70\x6f\x72\x74\x61\x6c\x2f\x61\x70\x69\x2f\x70\x6f\x72\x74\x61\x6c\x2f\x70\x61\x72\x61\x6d\x65\x74\x65\x72\x73\x2f\x77\x72\x69\x74\x65', '\x2f\x70\x6f\x72\x74\x61\x6c\x2f\x61\x70\x69\x2f\x70\x6f\x72\x74\x61\x6c\x2f\x73\x79\x73\x74\x65\x6d\x73\x2f\x35\x30', '\x2f\x70\x6f\x72\x74\x61\x6c\x2f\x61\x70\x69\x2f\x70\x6f\x72\x74\x61\x6c\x2f\x73\x79\x73\x74\x65\x6d\x73\x74\x61\x74\x65\x2f']
let auth = {};
let System = {};
let SessioID;


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

        this.LastAccess = '2019-11-22T19:35:06.7715496Z' //dummy for first request

        if (this.USER && this.PASS && this.USER != '' && this.PASS != '') this._init();
        else this.adapter.log.warn('PLEASE enter username and password in config');
    }

    async _init() {
        // prepare Connection
        auth = await this._getAuthToken();
        SessioID = await this._createSession();
        System = await this._getSystemList();

        this.UpdateTimeout = setTimeout(() => {
            this._sessionUpdate()
        }, this.UpdateInterval)
    }
    async adminGetDevicelist(user, password) {
        this.USER = user;
        this.PASS = password;
        auth = await this._getAuthToken();

        SessioID = await this._createSession();
        System = await this._getSystemList();
        return System;
    }

    async _getAuthToken() {
        clearTimeout(this.refreshTimeout);

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
            const response = await axios.post(_021a[0] + _021a[1], query, {
                headers: headers
            });
            this.adapter.log.debug('API GET AUTH TOKEN: ' + JSON.stringify(response.data));

            setTimeout(() => {
                this._refresh();
            }, response.data.expires_in * 1000)
            return response.data;

        } catch (error) {
            this.adapter.log.error('API GET AUTH TOKEN ERROR: ' + error);
            return;

        }
    }
    async _getSystemList() {
        let headers = await this._generateHeader('');
        try {
            const response = await axios.get(_021a[0] + _021a[10], {
                headers: headers
            });
            this.adapter.log.debug('API GET SYSTEM LIST: ' + JSON.stringify(response.data));
            return response.data.Systems;

        } catch (error) {
            this.adapter.log.error('API GET SYSTEM LIST ERROR: ' + error);
            return;

        }
    }
    async getGUIDescription(gatewayid, id) {
        let headers = await this._generateHeader('');
        try {
            const response = await axios.get(_021a[0] + _021a[3] + gatewayid + _021a[4] + id, {
                headers: headers
            });
            this.adapter.log.debug('API GET GUI DESK.: ' + JSON.stringify(response.data));
            return response.data;

        } catch (error) {
            this.adapter.log.error('API GET GUI DESK. ERROR: ' + error);
            return;

        }
    }
    async getValList(gateway, sysId, valList) {
        let headers = await this._generateHeader('application/json');
        let payload = {
            BundleId: 1000,
            IsSubBundle: false,
            ValueIdList: valList,
            GatewayId: gateway,
            SystemId: sysId,
            LastAccess: this.LastAccess,
            GuiIdChanged: false,
            SessionId: SessioID
        }

        try {
            const response = await axios.post(_021a[0] + _021a[5], payload, {
                headers: headers
            });
            this.adapter.log.debug('API GET GUI DESK.: ' + JSON.stringify(response.data));
            if (response.data.LastAccess) this.LastAccess = response.data.LastAccess
            return response.data;

        } catch (error) {
            this.adapter.log.error('API GET GUI DESK. ERROR: ' + error);
            return;

        }
    };
    async stop() {
        clearTimeout(this.UpdateTimeout);
        clearTimeout(this.refreshTimeout);
    }
    async _refresh() {
        //renw Auth Token and sessionID
        auth = await this._getAuthToken();
        // SessioID = await this._createSession();

    }

    async setParameter(GatewayId, SystemId, Paramarray) {
        let payload = {
            SessionId: SessioID,
            BundleId: 1000,
            GatewayId: GatewayId,
            SystemId: SystemId,
            WriteParameterValues: Paramarray,
            WaitForResponseTimeout: null,
            GuiId: null
        }
        let headers = await this._generateHeader('application/json');

        this.adapter.log.debug('SEND VALUE ' + _021a[0] + _021a[9] + ' : ' + JSON.stringify(payload));
        try {
            const response = await axios.post(_021a[0] + _021a[9], payload, { //old 6 new 9
                headers: headers
            });
            this.adapter.log.debug('SEND VALUE : ' + JSON.stringify(response.data));
            return response.data;

        } catch (error) {
            this.adapter.log.error('SEND VALUE ERROR: ' + error);
            return;

        }
    }


    async _sessionUpdate() {
        clearTimeout(this.UpdateTimeout);
        this.adapter.log.debug('Updating session!');

        let headers = await this._generateHeader('application/json');
        let payload = {
            SessionId: SessioID
        }

        try {
            const response = await axios.post(_021a[0] + _021a[7], payload, {
                headers: headers
            });
            this.adapter.log.debug('SESSION UPDATE: ' + JSON.stringify(response.data));
            if (response.data.LastAccess) this.LastAccess = response.data.LastAccess
            //return response.data;

        } catch (error) {
            this.adapter.log.error('SESSION UPDATE ERROR: ' + error);
            //return;

        }

        this.UpdateTimeout = setTimeout(() => {
            this._sessionUpdate()
        }, this.UpdateInterval)
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
        let headers = await this._generateHeader('application/json');

        try {
            const response = await axios.get(_021a[0] + _021a[11] + sysId, {
                headers: headers
            });
            return response;

        } catch (error) {
            this.adapter.log.error('API GET SYSTEM STATE: ' + error);
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

        let payload = {
            Timestamp: "2021-03-05T18:02:37.023688Z",
            ClientSideIdentifier: "0001-01-01T00:00:00",
            AppVersion: "3.0.29"
        }

        try {
            const response = await axios.post(_021a[0] + _021a[8], payload, {
                headers: headers
            });
            this.adapter.log.debug('API CREATE SESSION: ' + JSON.stringify(response.data));
            this.adapter.log.debug('API CREATE SESSION: ' + response.data.BrowserSessionId);
            return response.data.BrowserSessionId;

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