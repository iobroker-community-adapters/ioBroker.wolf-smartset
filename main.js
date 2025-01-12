'use strict';

const utils = require('@iobroker/adapter-core');
const wolfsmartset = require('./lib/wss');

const timeoutHandler = [];
let device = {};
const ValList = [];
let ParamObjList = [];
//const objects = {};

class WolfSmartsetAdapter extends utils.Adapter {
    wss;
    onlinePoll;
    emptyCount;
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
            if (typeof device.Id !== 'undefined') {
                device.SystemId = device.Id;
            }

            if (
                this.config.user &&
                this.config.password &&
                this.config.user !== '' &&
                this.config.password !== '' &&
                typeof device.GatewayId !== 'undefined' &&
                typeof device.SystemId !== 'undefined'
            ) {
                this.wss = new wolfsmartset(this.config.user, this.config.password, this);
                await this.wss.openIdInit();

                await this.main();
            } else {
                this.wss = new wolfsmartset('', '', this);
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
                            tabName3 = `${tabName2}.${ParameterDescriptor.Group}`;
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
                                paramInfo.TabName = tabName3.replace(' ', '_');
                                // remove subtree if exists
                                // delete paramInfo.ChildParameterDescriptors;
                                param.push(paramInfo);
                            }
                        }

                        // Check for ChildParameterDescriptors (e.g. time program)
                        if (typeof ParameterDescriptor.ChildParameterDescriptors !== 'undefined') {
                            ParameterDescriptor.ChildParameterDescriptors.forEach(ChildParameterDescriptor => {
                                var tabName4 = `${tabName3}.${ParameterDescriptor.Name}`;
                                // if (ChildParameterDescriptor.NoDataPoint == false) {
                                //     tabName4 = `${tabName3}.${ParameterDescriptor.Name}`;
                                // } else {
                                //     // intermediate node: add own name to path for own childs
                                //     tabName4 = `${tabName3}.${ParameterDescriptor.Name}.${ChildParameterDescriptor.Name}`;
                                // }

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
                        const tabName3 = `${tabName2}.${TabView.TabName}`;
                        // BundleId and GuiId of TabView are required in each param below thie TabView
                        const TabViewBundleId = TabView.BundleId;
                        const TabViewGuiId = TabView.GuiId;

                        TabView.ParameterDescriptors.forEach(ParameterDescriptor => {
                            var tabName4;
                            if (typeof ParameterDescriptor.Group !== 'undefined') {
                                tabName4 = `${tabName3}.${ParameterDescriptor.Group}`;
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
                                    paramInfo.TabName = tabName4.replace(' ', '_');
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
            const recValList = await this.wss.getValList(device.GatewayId, device.SystemId, ValList);
            if (recValList) {
                await this.SetStatesArray(recValList);
            }

            if (this.onlinePoll > 4) {
                this.onlinePoll = 0;

                const systemStatus = await this.wss.getSystemState(parseInt(device.SystemId));
                if (systemStatus && typeof systemStatus.IsOnline !== 'undefined') {
                    await this.setStateAsync('info.connection', {
                        val: systemStatus.IsOnline,
                        ack: true,
                    });
                } else {
                    await this.setStateAsync('info.connection', {
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
                this.setStateAsync(id, {
                    val: value === 'True' ? true : false,
                    ack: true,
                });
                break;
            case 9:
            case 10:
            case 14:
            case 20:
            case 21:
                this.setStateAsync(id, {
                    val: value.toString(),
                    ack: true,
                });
                break;

            default:
                this.setStateAsync(id, {
                    val: parseFloat(value),
                    ack: true,
                });
                break;
        }
    }

    async CreateParams(paramArry) {
        const collectedChannels = {};

        for (const WolfObj of paramArry) {
            collectedChannels[`${WolfObj.TabName}`] = true;
            const id = `${WolfObj.TabName}.${WolfObj.ParameterId.toString()}`;

            const common = {
                name:
                    typeof WolfObj.NamePrefix !== 'undefined' ? `${WolfObj.NamePrefix}: ${WolfObj.Name}` : WolfObj.Name,
                type: 'number',
                role: 'value',
                read: true,
                write: !WolfObj.IsReadOnly,
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

            if (WolfObj.ControlType === 5) {
                //Boolean text
                common.type = 'boolean';
                common.role = WolfObj.IsReadOnly ? 'indicator' : 'switch';
            } else if (
                WolfObj.ControlType === 9 ||
                WolfObj.ControlType === 10 ||
                WolfObj.ControlType === 14 ||
                WolfObj.ControlType === 20 ||
                WolfObj.ControlType === 21
            ) {
                common.type = 'string';
                common.role = 'text';
            } else {
                if (typeof WolfObj.Unit !== 'undefined') {
                    common.unit = WolfObj.Unit;
                }

                // thresholds min/max : use Min/MaxValueCondition if available, otherwise use MinValue/MaxValue
                // Min/MaxValue might be wrong in case of floats, whereas Min/MaxValueCondition seem to be always correct
                if (typeof WolfObj.MinValue !== 'undefined') {
                    common.min = WolfObj.MinValue;
                }
                if (typeof WolfObj.MinValueCondition !== 'undefined') {
                    common.min = parseFloat(WolfObj.MinValueCondition);
                }
                if (typeof WolfObj.MaxValue !== 'undefined') {
                    common.max = WolfObj.MaxValue;
                }
                if (typeof WolfObj.MaxValueCondition !== 'undefined') {
                    common.max = parseFloat(WolfObj.MaxValueCondition);
                }

                if (typeof WolfObj.StepWidth !== 'undefined') {
                    common.step = WolfObj.StepWidth;
                }
                if (typeof WolfObj.ListItems !== 'undefined') {
                    const states = {};
                    WolfObj.ListItems.forEach(ListItems => {
                        states[ListItems.Value] = ListItems.DisplayText;
                    });
                    common.states = states;
                }
            }

            // generate ValueList for Polling
            // use ParameterId, not ValueId (may be 0) only if > 0
            ValList.push(WolfObj.ParameterId);

            this.log.debug(`WolfObj ${JSON.stringify(WolfObj)} --> ioBrokerObj.common ${JSON.stringify(common)}`);

            await this.extendObjectAsync(id, {
                type: 'state',
                common,
                native: {
                    ValueId: WolfObj.ValueId,
                    ParameterId: WolfObj.ParameterId,
                    ControlType: WolfObj.ControlType,
                },
            });
            await this.setStatesWithDiffTypes(WolfObj.ControlType, id, WolfObj.Value);
        }

        const createdObjects = {};
        for (let channel of Object.keys(collectedChannels)) {
            // channel = channel.substring(0, channel.length - 1);
            const name = channel.split('.').pop();
            await this.extendObjectAsync(channel, {
                type: 'channel',
                common: {
                    name,
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
                    await this.extendObjectAsync(id, {
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
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     *
     * @param callback - callback function
     */
    onUnload(callback) {
        try {
            if (timeoutHandler['pollTimeout']) {
                clearTimeout(timeoutHandler['pollTimeout']);
            }
            if (timeoutHandler['startTimeout']) {
                clearTimeout(timeoutHandler['startTimeout']);
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
                        await this.setStateAsync(id, {
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
