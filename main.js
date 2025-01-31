'use strict';

const utils = require('@iobroker/adapter-core');
const wolfsmartset = require('./lib/wss');

const timeoutHandler = [];
let device = {};
let ParamObjList = [];
//const objects = {};

class WolfSmartsetAdapter extends utils.Adapter {
    wss;
    onlinePoll;
    emptyCount;
    BundleValuesList;
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
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        this.onlinePoll = 4;
        this.emptyCount = 0;

        try {
            device = JSON.parse(this.config.devices);

            //parseWebFormat
            if (device && typeof device.Id !== 'undefined') {
                device.SystemId = device.Id;
            }

            if (
                this.config.user &&
                this.config.password &&
                this.config.user !== '' &&
                this.config.password !== '' &&
                device &&
                typeof device.GatewayId !== 'undefined' &&
                typeof device.SystemId !== 'undefined'
            ) {
                this.wss = new wolfsmartset(this.config.user, this.config.password, this);
                await this.wss.openIdInit();

                await this.main();
            } else {
                this.wss = new wolfsmartset(this.config.user || '', this.config.password || '', this);
                this.log.warn('Please configure user, password and device in config');
            }
        } catch (error) {
            this.wss = new wolfsmartset('', '', this);
            this.log.error('Please configure user, password and device in config');
            this.log.error(error.stack);
        }
    }

    /**
     * main function is called from onReady(), PollValueList() and in case of an error by itself
     */
    async main() {
        this.config.pingInterval = this.config.pingInterval || 60;

        // Abfrageintervall mindestens 15 sec.
        if (this.config.pingInterval < 15) {
            this.config.pingInterval = 15;
        }

        await this.wss.init();

        try {
            const GUIDesc = await this.wss.getGUIDescription(device.GatewayId, device.SystemId);
            if (GUIDesc) {
                ParamObjList = (await getParamsWebGui(GUIDesc)) || [];
            }
            if (ParamObjList) {
                await this.CreateParams(ParamObjList);
                // create a list of params for each BundleId as defined in the GUI Desc
                this.BundleValuesList = await this.CreateBundleValuesLists(ParamObjList);
            }

            this.objects = await this.getForeignObjectsAsync(`${this.namespace}.*`);
            this.log.debug(JSON.stringify(this.objects));

            await this.PollValueList();
        } catch (error) {
            this.log.warn(error);
            this.log.warn('Try again in 60 sek.');
            if (timeoutHandler['restartTimeout']) {
                clearTimeout(timeoutHandler['restartTimeout']);
            }
            timeoutHandler['restartTimeout'] = setTimeout(async () => {
                this.main();
            }, 60000);
        }

        // //find Parameter for App Objects
        // async function getParams(guiData) {
        //     if (guiData == null) {
        //         return;
        //     }
        //     const param = [];

        //     guiData.UserSystemOverviewData.forEach(UserSystemOverviewData => {
        //         const tabName = UserSystemOverviewData.TabName;

        //         UserSystemOverviewData.ParameterDescriptors.forEach(ParameterDescriptors => {
        //             const paramInfo = ParameterDescriptors;

        //             //search duplicate
        //             const find = param.find(element => element.ParameterId === paramInfo.ParameterId);

        //             if (find) {
        //                 //this.log.debug('find double: ' + paramInfo.Name)
        //             } else {
        //                 paramInfo.TabName = tabName;
        //                 param.push(paramInfo);
        //             }
        //         });
        //     });
        //     return param;
        // }

        async function getParamsWebGui(guiData) {
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
        this.subscribeStates('*');
    }

    async PollValueList() {
        this.onlinePoll++;

        if (timeoutHandler['pollTimeout']) {
            clearTimeout(timeoutHandler['pollTimeout']);
        }

        try {
            const recValList = await this.wss.getValList(device.GatewayId, device.SystemId, this.BundleValuesList);
            if (recValList) {
                await this.SetStatesArray(recValList);
            }

            if (this.onlinePoll > 4) {
                this.onlinePoll = 0;

                const systemStatus = await this.wss.getSystemState(parseInt(device.SystemId));
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
            }
        } catch (error) {
            this.log.warn(error);
        }
        timeoutHandler['pollTimeout'] = setTimeout(() => {
            this.PollValueList();
        }, this.config.pingInterval * 1000);
    }

    async SetStatesArray(array) {
        if (array.Values.length === 0) {
            this.emptyCount++;
        } else {
            this.emptyCount = 0;
        }

        if (this.emptyCount >= 10) {
            // no data for long time try a restart
            this.emptyCount = 0;
            this.main();
            return;
        }

        array.Values.forEach(recVal => {
            //this.log.debug("search:" + JSON.stringify(recVal));

            //find ParamId for ValueId
            const findParamObj = ParamObjList.find(element => element.ValueId === recVal.ValueId);

            if (findParamObj) {
                for (const key in this.objects) {
                    if (this.objects[key].native && this.objects[key].native.ParameterId === findParamObj.ParameterId) {
                        this.setStatesWithDiffTypes(this.objects[key].native.ControlType, key, recVal.Value);
                    }
                }
            }
        });
    }

    async setStatesWithDiffTypes(type, id, value) {
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
     * Generates folders, channels and adapter object states for each param in WolfParamDescriptions.
     *
     * @param WolfParamDescriptions - flat list of ParamDescriptions for each state returned by getParamsWebGui()
     */
    async CreateParams(WolfParamDescriptions) {
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
                type: 'number',
                role: 'value',
                read: true,
                write: !WolfParamDescription.IsReadOnly,
            };

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

            // const my_object = {
            //     type: 'state',
            //     common: common,
            //     native: {
            //         ValueId: WolfParamDescription.ValueId,
            //         ParameterId: WolfParamDescription.ParameterId,
            //         ControlType: WolfParamDescription.ControlType,
            //     },
            // };

            // this.setObjectNotExists(id, my_object);

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
            await this.setStatesWithDiffTypes(WolfParamDescription.ControlType, id, WolfParamDescription.Value);
        }

        // 3.: Create folders and channels
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

        this.log.debug('create states DONE');
    }

    /**
     * Creates a list of ParameterId for each BundleId defined in WolfParamDescriptions
     * The lists are required when calling PollValueList()
     *
     * @param WolfParamDescriptions - list of extended WolfParamDescriptions returned by getParamsWebGui()
     */
    async CreateBundleValuesLists(WolfParamDescriptions) {
        const BundleValuesList = {};
        // full pull value list is stored under pseudo bundleId 0
        BundleValuesList[0] = [];

        for (const WolfParamDescription of WolfParamDescriptions) {
            const bundleId = WolfParamDescription.BundleId;
            if (typeof BundleValuesList[bundleId] == 'undefined') {
                BundleValuesList[bundleId] = [];
            }

            // De-duplicate ParamterIds for FullPull bundle: they might be at multiple locations in the tree
            if (typeof BundleValuesList[0][WolfParamDescription.ParameterId] == 'undefined') {
                BundleValuesList[0].push(WolfParamDescription.ParameterId);
            }
            // De-duplicate ParamterIds for bundleId: they might be at multiple locations in the tree
            if (typeof BundleValuesList[bundleId][WolfParamDescription.ParameterId] == 'undefined') {
                BundleValuesList[bundleId].push(WolfParamDescription.ParameterId);
            }
        }

        return BundleValuesList;
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     *
     * @param callback - callback function
     */
    onUnload(callback) {
        try {
            if (timeoutHandler['pollTimeout']) {
                clearTimeout(timeoutHandler['pollTimeout']);
            }
            if (timeoutHandler['restartTimeout']) {
                clearTimeout(timeoutHandler['restartTimeout']);
            }
            this.wss.stop();

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
                    const answer = await this.wss.setParameter(device.GatewayId, device.SystemId, [
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
                        await this.SetStatesArray(answer);
                    }
                } catch (err) {
                    this.log.error(err);
                }
            }
        }
    }

    // If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
    // /**
    //  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
    //  * Using this method requires "common.messagebox" property to be set to true in io-package.json
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
            if (obj.command === 'getDeviceList') {
                this.log.info('getDeviceList');
                let devicelist;
                try {
                    devicelist = await this.wss.adminGetDevicelist(obj.message.username, obj.message.password);

                    if (obj.callback) {
                        this.sendTo(obj.from, obj.command, devicelist, obj.callback);
                    }
                } catch (error) {
                    if (obj.callback) {
                        this.sendTo(
                            obj.from,
                            obj.command,
                            {
                                error: error,
                            },
                            obj.callback,
                        );
                    }
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
