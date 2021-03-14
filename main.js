'use strict';

const utils = require('@iobroker/adapter-core');
const { runInThisContext } = require('vm');
const wolfsmartset = require(__dirname + '/lib/wss');

const pollIntervall = 15000; //10 Sekunden
let pollTimeout = null;
let device = {};
let ValList = [];
let ParamObjList = [];
let objects = {};

class WolfSmartset extends utils.Adapter {

	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
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
		this.subscribeStates('*');
		this.onlinePoll = 4;

		try {
			device = JSON.parse(this.config.devices)

			//parseWebFormat
			if(typeof (device.Id) !== 'undefined'){
				device.SystemId = device.Id
			}

			if (this.config.user && this.config.password && this.config.user != '' && this.config.password != '' && typeof (device.GatewayId) !== 'undefined' && typeof (device.SystemId) !== 'undefined') {
				this.wss = new wolfsmartset(this.config.user, this.config.password, this);

				//start main after timeout
				setTimeout(() => {
					this.main()
				}, 1000);
			} else {
				this.wss = new wolfsmartset('', '', this);
				this.log.warn('Please configure user, password and device in config')
			}

		} catch (error) {
			this.wss = new wolfsmartset('', '', this);
			this.log.error('Please configure user, password and device in config')
		}

	}
	async main() {
		await this.wss.init();
		
		let GUIdesk = await this.wss.getGUIDescription(device.GatewayId, device.SystemId);
		ParamObjList = await getParams(GUIdesk);
		await this.CreateParams(ParamObjList)

		setTimeout(async () => {
			this.objects = await this.getForeignObjectsAsync(this.namespace + '.*')
			this.log.debug(JSON.stringify(this.objects))

			this.PollValueList()
		}, 2000)

		async function getParams(guiData) {
			let param = [];

			guiData.UserSystemOverviewData.forEach(UserSystemOverviewData => {
				const tabName = UserSystemOverviewData.TabName

				UserSystemOverviewData.ParameterDescriptors.forEach(ParameterDescriptors => {
					let paramInfo = ParameterDescriptors

					//search duplicate
					const find = param.find(element => element.ParameterId === paramInfo.ParameterId);

					if (find) {
						//this.log.debug('find double: ' + paramInfo.Name)
					} else {
						paramInfo.TabName = tabName
						param.push(paramInfo)
					}

				});
			});
			return param;
		}
	}

	async PollValueList() {
		this.onlinePoll ++

		clearTimeout(pollTimeout)
		try {
			let recValList = await this.wss.getValList(device.GatewayId, device.SystemId, ValList);
			await this.SetStatesArray(recValList);

			if(this.onlinePoll > 4){
				this.onlinePoll = 0;

				let systemStatus = await this.wss.getSystemState(parseInt(device.SystemId));
				if(typeof(systemStatus.IsOnline)!== 'undefined'){
					this.setStateAsync('info.connection', {
						val: systemStatus.IsOnline,
						ack: true
					});
				}
			}

		} catch (error) {
			this.log.warn(error)
		}
		setTimeout(() => {
			this.PollValueList()
		}, pollIntervall)
	}

	async SetStatesArray(array) {
		array.Values.forEach(recVal => {
			//this.log.debug("search:" + JSON.stringify(recVal));

			//find ParamId for ValueId
			const findParamObj = ParamObjList.find(element => element.ValueId === recVal.ValueId);

			if (findParamObj) {
				for (let key in this.objects) {
					if (this.objects[key].native.ParameterId === findParamObj.ParameterId) {

						if (typeof (recVal.Value) != 'undefined') this.setStateAsync(key, {
							val: recVal.Value,
							ack: true
						});
					}
				}
			}
		})
	}


	async CreateParams(paramArry) {
		let that = this

		paramArry.forEach(Value => {

			let group = ''

			if (Value.Group) group = Value.Group.replace(' ', '_') + '.'

			let common = {
				name: Value.Name,
				type: 'number',
				role: 'value',
				read: true,
				write: Value.IsReadOnly ? false : true,
			}
			if (typeof (Value.Unit) != 'undefined') common.unit = Value.Unit
			if (typeof (Value.MinValue) != 'undefined') common.min = Value.MinValue
			if (typeof (Value.MaxValue) != 'undefined') common.max = Value.MaxValue
			if (typeof (Value.StepWidth) != 'undefined') common.step = Value.StepWidth
			if (typeof (Value.ListItems) != 'undefined') {
				let states = {};
				Value.ListItems.forEach(ListItems => {
					states[ListItems.Value] = ListItems.DisplayText
				})
				common.states = states;
			}

			// gereate ValueList for Polling
			ValList.push(Value.ValueId)


			this.genAndSetState(Value.TabName + '.' + group + Value.ParameterId, Value, common)

		})
	}
	async genAndSetState(name, paramObj, common) {

		await this.setObjectNotExistsAsync(name, {
			type: 'state',
			common: common,
			native: {
				ValueId: paramObj.ValueId,
				ParameterId: paramObj.ParameterId
			},
		})

		let value = typeof (paramObj.Value) != 'undefined' ? paramObj.Value : null;

		if (typeof (value) != 'undefined') this.setStateAsync(name, {
			val: value,
			ack: true
		});

	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		try {
			clearTimeout(pollTimeout);
			this.wss.stop();

			callback();
		} catch (e) {
			callback();
		}
	}


	/**
	 * Is called if a subscribed state changes
	 * @param {string} id
	 * @param {ioBroker.State | null | undefined} state
	 */
	async onStateChange(id, state) {
		if (state && !state.ack) {
			let ParamId = id.split('.').pop();
			let obj = await this.getObjectAsync(id)

			const findParamObj = ParamObjList.find(element => element.ParameterId === obj.native.ParameterId);
			

			this.log.warn('Change value for: ' + obj.common.name)

			try {
				let answer = await this.wss.setParameter(device.GatewayId, device.SystemId, [{
					ValueId: findParamObj.ValueId,
					ParameterId: obj.native.ParameterId,
					Value: String(state.val),
					ParameterName: obj.common.name
				}]);
				if (typeof (answer.Values) !== 'undefined') {
					this.setStateAsync(id, {
						val: state.val,
						ack: true
					});
					this.SetStatesArray(answer);
				}
			} catch (err) {
				this.log.error(err)
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
				if (obj.callback) this.sendTo(obj.from, obj.command, 'Message received', obj.callback);
			}
			if (obj.command === 'getDeviceList') {

				this.log.info('getDeviceList');
				let devicelist
				try {
					devicelist = await this.wss.adminGetDevicelist(obj.message.username, obj.message.password)

					if (obj.callback) this.sendTo(obj.from, obj.command, devicelist, obj.callback);

				} catch (error) {
					if (obj.callback) this.sendTo(obj.from, obj.command, {
						error: error
					}, obj.callback);
				}
			}
		}
	}

}

// @ts-ignore parent is a valid property on module
if (module.parent) {
	// Export the constructor in compact mode
	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	module.exports = (options) => new WolfSmartset(options);
} else {
	// otherwise start the instance directly
	new WolfSmartset();
}