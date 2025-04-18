'use strict';

const utils = require('@iobroker/adapter-core');
const wolfsmartset = require('./lib/wss');

// ipify.org REST API: get your public IP
const axios = require('axios').default;
const _GET_MY_PUBLIC_IP_URL = 'https://api.ipify.org?format=json';

const timeoutHandler = [];
let ParamObjList = [];
//const objects = {};

class WolfSmartsetAdapter extends utils.Adapter {
    wss;
    wss_user;
    wss_password;
    myPublicIp;
    device;
    onlinePoll;
    emptyCount;
    BundleIdShortCycle;
    ValueIdListShortCycle;
    BundleIdLongCycle;
    ValueIdListLongCycle;
    /**
     * @param [options] - adapter options
     */
    constructor(options) {
        super({
            ...options,
            name: 'wolf-smartset',
        });
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        // this.on('objectChange', this.onObjectChange.bind(this));
        this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    /**
     * Get our public IP from ipify.org
     *
     */
    async _getMyPublicIp() {
        if (this.config.doPubIpCheck) {
            try {
                const myIpDataResponse = await axios.get(_GET_MY_PUBLIC_IP_URL);

                if (myIpDataResponse.status == 200 && myIpDataResponse.data && myIpDataResponse.data.ip) {
                    return myIpDataResponse.data.ip;
                }
            } catch (error) {
                this.log.warn(`_getMyPublicIp() failed: ${error.message}`);
            }
        }
        return null;
    }

    async _getParamsWebGui(guiData) {
        if (guiData == null) {
            return;
        }
        const param = [];

        guiData.MenuItems.forEach(MenuItem => {
            const tabName = MenuItem.Name;

            // Benutzerebene: iterate over MenuItems
            MenuItem.TabViews.forEach(TabView => {
                const tabName2 = `${tabName}.${TabView.TabName}`;
                // BundleId and GuiId of TabView are required in each param below thie TabView
                const TabViewBundleId = TabView.BundleId;
                const TabViewGuiId = TabView.GuiId;

                TabView.ParameterDescriptors.forEach(ParameterDescriptor => {
                    var tabName3;
                    if (typeof ParameterDescriptor.Group !== 'undefined') {
                        tabName3 = `${tabName2}.${ParameterDescriptor.Group.replace(' ', '_')}`;
                    } else {
                        tabName3 = tabName2;
                    }

                    // ignore pseudo or intermediate/complex parameters (e.g list of time programs)
                    if (ParameterDescriptor.ParameterId > 0) {
                        const paramInfo = ParameterDescriptor;
                        paramInfo.BundleId = TabViewBundleId;
                        paramInfo.GuiId = TabViewGuiId;

                        //search duplicate
                        const find = param.find(element => element.ParameterId === paramInfo.ParameterId);

                        if (!find) {
                            paramInfo.TabName = tabName3;
                            // remove subtree if exists
                            // delete paramInfo.ChildParameterDescriptors;
                            param.push(paramInfo);
                        }
                    }

                    // Check for ChildParameterDescriptors (e.g. time program)
                    if (typeof ParameterDescriptor.ChildParameterDescriptors !== 'undefined') {
                        ParameterDescriptor.ChildParameterDescriptors.forEach(ChildParameterDescriptor => {
                            var tabName4 = `${tabName3}.${ParameterDescriptor.Name}`;

                            // ignore pseudo or intermediate/complex parameters (e.g time program)
                            if (
                                ChildParameterDescriptor.NoDataPoint == false &&
                                ChildParameterDescriptor.ParameterId > 0
                            ) {
                                const paramInfo = ChildParameterDescriptor;
                                paramInfo.BundleId = TabViewBundleId;
                                paramInfo.GuiId = TabViewGuiId;

                                //search duplicate
                                const find = param.find(element => element.ParameterId === paramInfo.ParameterId);

                                if (!find) {
                                    paramInfo.TabName = tabName4.replace(' ', '_');
                                    param.push(paramInfo);
                                }
                            }

                            if (typeof ChildParameterDescriptor.ChildParameterDescriptors !== 'undefined') {
                                ChildParameterDescriptor.ChildParameterDescriptors.forEach(
                                    ChildChildParameterDescriptor => {
                                        const tabName5 = `${tabName4}.${ChildParameterDescriptor.Name}`;

                                        if (ChildChildParameterDescriptor.ParameterId > 0) {
                                            const paramInfo = ChildChildParameterDescriptor;
                                            paramInfo.BundleId = TabViewBundleId;
                                            paramInfo.GuiId = TabViewGuiId;

                                            //search duplicate
                                            const find = param.find(
                                                element => element.ParameterId === paramInfo.ParameterId,
                                            );

                                            if (!find) {
                                                paramInfo.TabName = tabName5.replace(' ', '_');
                                                param.push(paramInfo);
                                            }
                                        }
                                    },
                                );
                            }
                        });
                    }
                });
            });

            // Fachmannebene: interate over SubMenuEntries
            MenuItem.SubMenuEntries.forEach(SubMenuEntry => {
                const tabName2 = `${tabName}.${SubMenuEntry.Name}`;
                SubMenuEntry.TabViews.forEach(TabView => {
                    const tabName3 = `${tabName2}.${TabView.TabName}`.replace(' ', '_');
                    // BundleId and GuiId of TabView are required in each param below thie TabView
                    const TabViewBundleId = TabView.BundleId;
                    const TabViewGuiId = TabView.GuiId;

                    TabView.ParameterDescriptors.forEach(ParameterDescriptor => {
                        var tabName4;
                        if (typeof ParameterDescriptor.Group !== 'undefined') {
                            tabName4 = `${tabName3}.${ParameterDescriptor.Group.replace(' ', '_')}`;
                        } else {
                            tabName4 = tabName3;
                        }

                        // ignore pseudo or intermediate/complex parameters (e.g list of time programs)
                        if (ParameterDescriptor.ParameterId > 0) {
                            const paramInfo = ParameterDescriptor;
                            paramInfo.BundleId = TabViewBundleId;
                            paramInfo.GuiId = TabViewGuiId;

                            //search duplicate
                            const find = param.find(element => element.ParameterId === paramInfo.ParameterId);

                            if (!find) {
                                paramInfo.TabName = tabName4;
                                param.push(paramInfo);
                            }
                        }
                    });
                });
            });
        });

        return param;
    }

    /**
     * Generates folders, channels and adapter object states for each param in WolfParamDescriptions.
     *
     * @param WolfParamDescriptions - flat list of ParamDescriptions for each state returned by getParamsWebGui()
     */
    async _CreateObjects(WolfParamDescriptions) {
        // get list of instance objects before fetching new list of params from Wolf server
        const oldInstanceObjects = await this.getForeignObjectsAsync(`${this.namespace}.*`);
        const collectedChannels = {};

        // 1.: Create states
        for (const WolfParamDescription of WolfParamDescriptions) {
            // export BundleId of object to associated channel
            collectedChannels[`${WolfParamDescription.TabName}`] = WolfParamDescription.BundleId;
            const id = `${WolfParamDescription.TabName}.${WolfParamDescription.ParameterId.toString()}`;

            const common = {
                name:
                    typeof WolfParamDescription.NamePrefix !== 'undefined'
                        ? `${WolfParamDescription.NamePrefix}: ${WolfParamDescription.Name}`
                        : WolfParamDescription.Name,
                // do not declare type and role here to avoid typecheck errors in setObjectNotExists()
                // type: 'number',
                // role: 'value',
                read: true,
                write: !WolfParamDescription.IsReadOnly,
            };
            common.type = 'number';
            common.role = 'value';

            // Wolf ControlTypes:
            // 0: Unknown
            // 1: Enum w/ ListItems (simple)
            // 5: Bool
            // 6: Number; 'Decimals' = decimal places (accuracy)
            // 9: Date
            // 10: Time
            // 13: list of time programs (1, 2 or 3) (not a Value)
            // 14: list of time ranges
            // 19: time program (Mon - Sun) (not a value)
            // 20: Name, SerialNo, MacAddr, SW-Version, HW-Version
            // 21: IPv4 addr or netmask
            // 31: Number of any kind
            // 35: Enum w/ ListItems (w/ Image, Decription, ...)

            if (WolfParamDescription.ControlType === 5) {
                //Boolean text
                common.type = 'boolean';
                common.role = WolfParamDescription.IsReadOnly ? 'indicator' : 'switch';
            } else if (
                WolfParamDescription.ControlType === 9 ||
                WolfParamDescription.ControlType === 10 ||
                WolfParamDescription.ControlType === 14 ||
                WolfParamDescription.ControlType === 20 ||
                WolfParamDescription.ControlType === 21
            ) {
                common.type = 'string';
                common.role = 'text';
            } else {
                if (typeof WolfParamDescription.Unit !== 'undefined') {
                    common.unit = WolfParamDescription.Unit;
                }

                // thresholds min/max : use Min/MaxValueCondition if available, otherwise use MinValue/MaxValue
                // Min/MaxValue might be wrong in case of floats, whereas Min/MaxValueCondition seem to be always correct
                if (typeof WolfParamDescription.MinValue !== 'undefined') {
                    common.min = WolfParamDescription.MinValue;
                }
                if (typeof WolfParamDescription.MinValueCondition !== 'undefined') {
                    common.min = parseFloat(WolfParamDescription.MinValueCondition);
                }
                if (typeof WolfParamDescription.MaxValue !== 'undefined') {
                    common.max = WolfParamDescription.MaxValue;
                }
                if (typeof WolfParamDescription.MaxValueCondition !== 'undefined') {
                    common.max = parseFloat(WolfParamDescription.MaxValueCondition);
                }

                if (typeof WolfParamDescription.StepWidth !== 'undefined') {
                    common.step = WolfParamDescription.StepWidth;
                }
                if (typeof WolfParamDescription.ListItems !== 'undefined') {
                    const states = {};
                    WolfParamDescription.ListItems.forEach(ListItems => {
                        states[ListItems.Value] = ListItems.DisplayText;
                    });
                    common.states = states;
                }
            }

            this.log.debug(
                `WolfParamDescription ${JSON.stringify(WolfParamDescription)} --> ioBrokerObj.common ${JSON.stringify(common)}`,
            );

            //  if this is a new object, create it first
            const fullId = `${this.namespace}.${id}`;
            if (typeof oldInstanceObjects[`${fullId}`] == 'undefined') {
                // create object w/ minimum set of attributes
                this.setObjectNotExists(id, {
                    type: 'state',
                    common: {
                        name: common.name,
                        type: common.type,
                        role: common.role,
                        read: common.read,
                        write: common.write,
                    },
                    native: {},
                });
            } else {
                oldInstanceObjects[fullId].common.desc = 'active';
            }

            // set all attributes for object
            this.extendObject(id, {
                type: 'state',
                common: common,
                native: {
                    ValueId: WolfParamDescription.ValueId,
                    ParameterId: WolfParamDescription.ParameterId,
                    ControlType: WolfParamDescription.ControlType,
                },
            });

            // 2.: Update object states
            await this._setStatesWithDiffTypes(WolfParamDescription.ControlType, id, WolfParamDescription.Value);
        }

        // 3.: mark obsoleted objects
        for (const fullId in oldInstanceObjects) {
            let re = new RegExp(String.raw`^${this.namespace}.info`, 'g');
            if (
                !fullId.match(re) &&
                typeof oldInstanceObjects[fullId].common != 'undefined' &&
                typeof oldInstanceObjects[fullId].common.desc == 'undefined'
            ) {
                oldInstanceObjects[fullId].common.desc = 'obsoleted';
                this.extendObject(fullId, oldInstanceObjects[fullId]);
            }
        }

        // 4.: Create folders and channels
        const createdObjects = {};
        for (const [channel, bundleId] of Object.entries(collectedChannels)) {
            const name = `${channel.split('.').pop()} (Bundle: ${bundleId})`;
            this.extendObject(channel, {
                type: 'channel',
                common: {
                    name: name,
                },
                native: {},
            });
            createdObjects[channel] = true;
            this.log.debug(`Create channel ${channel}`);
            const channelParts = channel.split('.');
            let id = channelParts.shift() || '';
            let folderName = id;
            while (id && channelParts.length > 0) {
                if (!createdObjects[id]) {
                    await this.extendObject(id, {
                        type: 'folder',
                        common: {
                            name: folderName,
                        },
                        native: {},
                    });
                    this.log.debug(`Create folder ${id}`);
                    createdObjects[id] = true;
                }
                folderName = channelParts.shift() || '';
                if (!folderName) {
                    break;
                }
                id += `.${folderName}`;
            }
        }

        this.log.debug('createParams DONE');
    }

    /**
     * Creates a list of ParameterId for each BundleId defined in WolfParamDescriptions and
     * From that create ValueIdListShortCycle and ValueIdListLongCycle
     *
     * @param WolfParamDescriptions - list of extended WolfParamDescriptions returned by getParamsWebGui()
     */
    async _CreateBundleValuesLists(WolfParamDescriptions) {
        let BundleValuesList = {};
        let DefaultBundleIdShortCycle = 0;
        let ValueIdListShortCycle = [];
        let DefaultBundleIdLongCycle = 0;
        let ValueIdListLongCycle = [];

        for (const WolfParamDescription of WolfParamDescriptions) {
            const bundleId = WolfParamDescription.BundleId;
            if (typeof BundleValuesList[bundleId] == 'undefined') {
                BundleValuesList[bundleId] = [];
            }

            // De-duplicate ParamterIds for bundleId: they might be at multiple locations in the tree
            if (typeof BundleValuesList[bundleId][WolfParamDescription.ParameterId] == 'undefined') {
                BundleValuesList[bundleId].push(WolfParamDescription.ParameterId);
            }
        }

        for (const bundleId of this.config.bundleIdTable) {
            if (bundleId.bundleIdUseShort && typeof BundleValuesList[bundleId.bundleIdName] != 'undefined') {
                ValueIdListShortCycle = ValueIdListShortCycle.concat(BundleValuesList[bundleId.bundleIdName]);
                DefaultBundleIdShortCycle =
                    Number(bundleId.bundleIdName) > DefaultBundleIdShortCycle
                        ? Number(bundleId.bundleIdName)
                        : DefaultBundleIdShortCycle;
            }
            if (bundleId.bundleIdUseLong && typeof BundleValuesList[bundleId.bundleIdName] != 'undefined') {
                ValueIdListLongCycle = ValueIdListLongCycle.concat(BundleValuesList[bundleId.bundleIdName]);
                DefaultBundleIdLongCycle =
                    Number(bundleId.bundleIdName) > DefaultBundleIdLongCycle
                        ? Number(bundleId.bundleIdName)
                        : DefaultBundleIdLongCycle;
            }
        }

        this.BundleIdShortCycle =
            this.config.bundleIdRequestedShort == 'Default'
                ? DefaultBundleIdShortCycle
                : this.config.bundleIdRequestedShort;
        this.ValueIdListShortCycle = ValueIdListShortCycle;

        this.BundleIdLongCycle =
            this.config.bundleIdRequestedLong == 'Default'
                ? DefaultBundleIdLongCycle
                : this.config.bundleIdRequestedLong;
        this.ValueIdListLongCycle = ValueIdListLongCycle;
    }

    async _setStatesWithDiffTypes(type, id, value) {
        if (type == null || id == null || value == null) {
            return;
        }

        // Wolf ControlTypes:
        // 0: Unknown
        // 1: Enum w/ ListItems (simple)
        // 5: Bool
        // 6: Number; 'Decimals' = decimal places (accuracy)
        // 9: Date
        // 10: Time
        // 13: list of time programs (1, 2 or 3) (not a Value)
        // 14: list of time ranges
        // 19: time program (Mon - Sun) (not a value)
        // 20: Name, SerialNo, MacAddr, SW-Version, HW-Version
        // 21: IPv4 addr or netmask
        // 31: Number of any kind
        // 35: Enum w/ ListItems (w/ Image, Decription, ...)
        switch (type) {
            case 5:
                this.setState(id, {
                    val: value === 'True' ? true : false,
                    ack: true,
                });
                break;
            case 9:
            case 10:
            case 14:
            case 20:
            case 21:
                this.setState(id, {
                    val: value.toString(),
                    ack: true,
                });
                break;

            default:
                this.setState(id, {
                    val: parseFloat(value),
                    ack: true,
                });
                break;
        }
    }

    /**
     * Poll parameter values from Wolf server as configured for the given poll cycle
     *
     * @param pollCycle - 'short or 'long'
     */
    async _PollValueList(pollCycle) {
        try {
            const recValList = await this.wss.getValList(
                this.device.GatewayId,
                this.device.SystemId,
                pollCycle == 'short' ? this.BundleIdShortCycle : this.BundleIdLongCycle,
                pollCycle == 'short' ? this.ValueIdListShortCycle : this.ValueIdListLongCycle,
                pollCycle,
            );
            if (recValList) {
                await this._SetStatesArray(recValList);
            }
        } catch (error) {
            this.log.warn(error);
        }
    }

    /**
     * Handler for Short Poll Cycle: poll parameter values from Wolf server and
     * additionally, every 4th poll cycle: getSystemState and check for PublicIP changes
     *
     */
    async _ShortPollValueList() {
        timeoutHandler['shortPollTimeout'] && clearTimeout(timeoutHandler['shortPollTimeout']);

        await this._PollValueList('short');

        this.onlinePoll++;
        if (this.onlinePoll > 4) {
            this.onlinePoll = 0;
            try {
                const myPublicIp = await this._getMyPublicIp();
                if (myPublicIp && this.myPublicIp && myPublicIp != this.myPublicIp) {
                    this.log.warn(
                        `_ShortPollValueList(); PubIP changed from ${this.myPublicIp} to ${myPublicIp}: triggering reload...`,
                    );
                    await this._mainloop(myPublicIp);
                    return;
                }

                const systemStatus = await this.wss.getSystemState(parseInt(this.device.SystemId));
                if (systemStatus && typeof systemStatus.IsOnline !== 'undefined') {
                    this.setState('info.connection', {
                        val: systemStatus.IsOnline,
                        ack: true,
                    });
                } else {
                    this.setState('info.connection', {
                        val: false,
                        ack: true,
                    });
                }
            } catch (error) {
                this.log.warn(error);
            }
        }

        timeoutHandler['shortPollTimeout'] = setTimeout(() => {
            this._ShortPollValueList();
        }, this.config.pollIntervalShort * 1000);
    }

    /**
     * Handler for Lhort Poll Cycle: poll parameter values from Wolf server
     *
     */
    async _LongPollValueList() {
        timeoutHandler['longPollTimeout'] && clearTimeout(timeoutHandler['longPollTimeout']);

        await this._PollValueList('long');

        timeoutHandler['longPollTimeout'] = setTimeout(
            () => {
                this._LongPollValueList();
            },
            // pollIntervalLong is given in minutes; add 5 seconds to avoid parallel execution w/ _ShortPollValueList()
            this.config.pollIntervalLong * 60 * 1000 + 5000,
        );
    }

    async _SetStatesArray(array) {
        if (array.Values.length === 0) {
            this.emptyCount++;
        } else {
            this.emptyCount = 0;
        }

        if (this.emptyCount >= 10) {
            // no data for long time try a restart
            this.emptyCount = 0;
            await this._mainloop(null);
            return;
        }

        array.Values.forEach(recVal => {
            //this.log.debug("search:" + JSON.stringify(recVal));

            //find ParamId for ValueId
            const findParamObj = ParamObjList.find(element => element.ValueId === recVal.ValueId);

            if (findParamObj) {
                for (const key in this.objects) {
                    if (this.objects[key].native && this.objects[key].native.ParameterId === findParamObj.ParameterId) {
                        this._setStatesWithDiffTypes(this.objects[key].native.ControlType, key, recVal.Value);
                    }
                }
            }
        });
    }

    /**
     * main loop is called from onReady(), and in case of an error by _ShortPollValueList(), _SetStatesArray() and itself
     *
     * @param myPublicIp - my current public IP or null if unknown
     */
    async _mainloop(myPublicIp) {
        timeoutHandler['restartTimeout'] && clearTimeout(timeoutHandler['restartTimeout']);
        timeoutHandler['shortPollTimeout'] && clearTimeout(timeoutHandler['shortPollTimeout']);
        timeoutHandler['longPollTimeout'] && clearTimeout(timeoutHandler['longPollTimeout']);

        try {
            // Note: Wolf Smartset is IP address aware: if we changed or IP, we have to re-init
            // if we have a wss matching our configured u/p and our current public IP then use it ...
            if (!myPublicIp) {
                myPublicIp = await this._getMyPublicIp();
            }
            if (
                !this.wss ||
                this.wss_user != this.config.username ||
                this.wss_password != this.config.password ||
                (myPublicIp && this.myPublicIp && this.myPublicIp != myPublicIp)
            ) {
                // ... otherwise kill old wss object and create a new one
                this.wss && (await this.wss.stop());
                this.wss = new wolfsmartset(this.config.username, this.config.password, this);
                this.wss_user = this.config.username;
                this.wss_password = this.config.password;
                if (myPublicIp) {
                    this.myPublicIp = myPublicIp;
                }
            }

            const wssInitialized = await this.wss.init();
            if (!wssInitialized) {
                throw new Error('Could not initialized WSS session');
            }

            const GUIDesc = await this.wss.getGUIDescription(this.device.GatewayId, this.device.SystemId);
            if (GUIDesc) {
                ParamObjList = (await this._getParamsWebGui(GUIDesc)) || [];
            } else {
                throw new Error('Could not get GUIDescription (device might be down)');
            }
            if (ParamObjList) {
                await this._CreateObjects(ParamObjList);
                // create a list of params for each BundleId as defined in the GUI Desc
                await this._CreateBundleValuesLists(ParamObjList);
            }

            this.objects = await this.getForeignObjectsAsync(`${this.namespace}.*`);
            this.log.debug(JSON.stringify(this.objects));

            await this._LongPollValueList();
            await this._ShortPollValueList();
        } catch (error) {
            this.log.warn(error);
            this.log.warn('Trying again in 60 sec...');
            timeoutHandler['restartTimeout'] = setTimeout(async () => {
                this._mainloop(null);
            }, 60000);
        }

        this.subscribeStates('*');
    }

    // /**
    //  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, adminUI...
    //  * Using this method requires "common.messagebox" property to be set to true in io-package.json
    //  * The main purpose for this handler is to handle Device Listing and Device Confirm from the adapter instance settings UI.
    //
    //  * @param {ioBroker.Message} obj
    //  */
    async onMessage(obj) {
        if (typeof obj === 'object' && obj.message) {
            if (obj.command === 'send') {
                // e.g. send email or pushover or whatever
                this.log.info('send command');

                // Send response in callback if required
                if (obj.callback) {
                    this.sendTo(obj.from, obj.command, 'Message received', obj.callback);
                }
            }

            // getDeviceList: triggered by adapter instance settings UI object 'deviceSelect'
            if (obj.command === 'getDeviceList') {
                this.log.debug('getDeviceList ...');
                let myPublicIp;
                let devicelist;
                let getDeviceListResponse;
                let adminWss;

                try {
                    if (obj.message.username == '' || obj.message.password == '') {
                        throw new Error('Please set username and password');
                    }

                    // check if we can use an already existing wss object from running adapter instance, otherwise create one
                    // Note: Wolf Smartset is IP address aware: if we changed or IP, we have to re-init
                    myPublicIp = await this._getMyPublicIp();
                    if (
                        !this.wss ||
                        this.wss_user != obj.message.username ||
                        this.wss_password != obj.message.password ||
                        (myPublicIp && this.myPublicIp && this.myPublicIp != myPublicIp)
                    ) {
                        adminWss = new wolfsmartset(obj.message.username, obj.message.password, this);
                    } else {
                        adminWss = this.wss;
                    }

                    devicelist = await adminWss.adminGetDevicelist();
                    if (typeof devicelist !== 'undefined') {
                        function convertToSelectEntry(value) {
                            return { label: value.Name, value: JSON.stringify(value) };
                        }
                        getDeviceListResponse = devicelist.map(convertToSelectEntry);
                        this.log.debug(`getDeviceList: returning '${JSON.stringify(getDeviceListResponse)}`);
                    } else {
                        getDeviceListResponse = [{ label: 'No devices found', value: '' }];
                        this.log.debug(`getDeviceList: got no devicelist`);
                    }
                } catch (error) {
                    getDeviceListResponse = [{ label: error.message, value: '' }];
                    this.wss = null;
                    this.log.debug(`getDeviceList: got error '${error.message}'`);
                }
                this.sendTo(obj.from, obj.command, getDeviceListResponse, obj.callback);
                // if getDeviceList was successful and this adapter instance has currently no wss object
                // then store our wss instance for use by adapter instance
                if (typeof devicelist !== 'undefined' && devicelist.length > 0 && !this.wss) {
                    this.wss = adminWss;
                    this.wss_user = obj.message.username;
                    this.wss_password = obj.message.password;
                    if (myPublicIp) {
                        this.myPublicIp = myPublicIp;
                    }
                }
            }

            // confirmDevice: triggered by adapter instance settings UI object 'deviceConfirm'
            if (obj.command === 'confirmDevice') {
                this.log.info('confirmDevice');
                let myDevice;
                let confirmDeviceResponse;

                try {
                    let jsonStringNoCrNl = obj.message.deviceObject.replace(/[\r\n]/g, ' ');
                    myDevice = JSON.parse(jsonStringNoCrNl);

                    if (
                        typeof myDevice.Name !== 'undefined' &&
                        typeof myDevice.Id !== 'undefined' &&
                        typeof myDevice.GatewayId !== 'undefined'
                    ) {
                        confirmDeviceResponse = {
                            native: {
                                deviceName: `${myDevice.Name}`,
                                device: jsonStringNoCrNl,
                            },
                        };
                    } else {
                        confirmDeviceResponse = {
                            error: `No valid device selected: got '${obj.message.deviceObject}'`,
                        };
                    }
                } catch (error) {
                    confirmDeviceResponse = {
                        error: `No device selected: got '${obj.message.deviceObject}', error: ${error.message}`,
                    };
                }
                this.sendTo(obj.from, obj.command, confirmDeviceResponse, obj.callback);
            }
        }
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        this.onlinePoll = 4;
        this.emptyCount = 0;

        try {
            this.device = JSON.parse(this.config.device);

            if (typeof this.device.Id !== 'undefined') {
                this.device.SystemId = this.device.Id;
            }

            if (
                this.config.username !== '' &&
                this.config.password !== '' &&
                this.config.deviceName !== '' &&
                typeof this.device.GatewayId !== 'undefined' &&
                typeof this.device.SystemId !== 'undefined'
            ) {
                const myPublicIp = await this._getMyPublicIp();
                await this._mainloop(myPublicIp);
            } else {
                this.log.warn('Please configure username, password and device in adapter instance settings');
            }
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (error) {
            this.log.warn('Please configure username, password and device in adapter instance settings');
        }
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     *
     * @param callback - callback function
     */
    onUnload(callback) {
        try {
            timeoutHandler['shortPollTimeout'] && clearTimeout(timeoutHandler['shortPollTimeout']);
            timeoutHandler['longPollTimeout'] && clearTimeout(timeoutHandler['longPollTimeout']);

            timeoutHandler['restartTimeout'] && clearTimeout(timeoutHandler['restartTimeout']);

            this.wss.stop();
            this.wss = null;

            callback();
        } catch {
            callback();
        }
    }

    /**
     * Is called if a subscribed state changes
     *
     * @param id - value id
     * @param state - value state
     */
    async onStateChange(id, state) {
        if (state && !state.ack) {
            //const ParamId = id.split('.').pop();
            const obj = await this.getObjectAsync(id);
            if (obj) {
                const findParamObj = ParamObjList.find(element => element.ParameterId === obj.native.ParameterId);

                this.log.info(`Change value for: ${obj.common.name}: ${JSON.stringify(state)}`);

                try {
                    const answer = await this.wss.setValList(this.device.GatewayId, this.device.SystemId, [
                        {
                            ValueId: findParamObj.ValueId,
                            ParameterId: obj.native.ParameterId,
                            Value: String(state.val),
                            ParameterName: obj.common.name,
                        },
                    ]);
                    if (typeof answer.Values !== 'undefined') {
                        this.setState(id, {
                            val: state.val,
                            ack: true,
                        });
                        await this._SetStatesArray(answer);
                    }
                } catch (err) {
                    this.log.error(err);
                }
            }
        }
    }
}

// @ts-expect-error parent is a valid property on module
if (module.parent) {
    // Export the constructor in compact mode
    module.exports = options => new WolfSmartsetAdapter(options);
} else {
    // otherwise start the instance directly
    new WolfSmartsetAdapter();
}
