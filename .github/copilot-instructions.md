# ioBroker Adapter Development with GitHub Copilot

**Version:** 0.4.0
**Template Source:** https://github.com/DrozmotiX/ioBroker-Copilot-Instructions

This file contains instructions and best practices for GitHub Copilot when working on ioBroker adapter development.

## Project Context

You are working on an ioBroker adapter. ioBroker is an integration platform for the Internet of Things, focused on building smart home and industrial IoT solutions. Adapters are plugins that connect ioBroker to external systems, devices, or services.

## Adapter-Specific Context
- **Adapter Name**: iobroker.wolf-smartset
- **Primary Function**: Connect Wolf cloud to IoBroker - integrates Wolf heating systems via Wolf Smartset cloud API
- **Target System**: Wolf heating/climate devices equipped with ISM7i WLAN/LAN module (Link Home)
- **Connection Type**: Cloud-based API integration to Wolf Smartset server (https://wolf-smartset.com)
- **Authentication**: OAuth2-based authentication with username/password and expert mode support
- **Key Features**: 
  - Dual poll cycles (short/long intervals) to optimize server load
  - Expert login capabilities for advanced parameter access
  - BundleId-based parameter grouping and polling
  - Public IP change detection for re-authentication
  - API profiling and usage tracking
- **External Dependencies**: 
  - axios for HTTP requests
  - openid-client for OAuth2 authentication
  - Wolf Smartset cloud API
- **Configuration**: JSON-based admin interface with device selection, poll intervals, and expert settings

## Development Patterns

### Error Handling Patterns
- Implement proper Wolf API error handling with automatic re-authentication
- Handle server-side minimum poll interval enforcement (60 seconds)
- Implement graceful degradation when Expert mode access fails
- Log periodic messages with appropriate levels (info for routine, warn for issues)

### Authentication & Session Management
```javascript
// Example authentication patterns for Wolf Smartset
async refreshAuthToken() {
    try {
        // Implement OpenID client token refresh
        // Handle expert vs user mode authentication
        // Update session tokens and handle failures
    } catch (error) {
        this.log.info('_refreshAuthToken(): ERROR - authentication failed, will retry');
        // Trigger re-initialization if needed
    }
}
```

### API Request Patterns
```javascript
// Wolf API polling with BundleId support
async pollParameterValues(bundleId, parameterIds) {
    try {
        // Respect server minimum poll intervals
        // Handle bundle ID validation
        // Process parameter value updates
        // Update API profiling metrics
    } catch (error) {
        this.log.warn(`Poll request failed for bundle ${bundleId}: ${error.message}`);
    }
}
```

### State Management
- Use proper ioBroker object creation for Wolf parameter hierarchies (Benutzer/Fachmann)
- Handle Min/MaxValueCondition constraints from Wolf API
- Implement proper state updates with value validation
- Support time programs, party mode, and vacation mode objects

## Testing

### Unit Testing
- Use Jest as the primary testing framework for ioBroker adapters
- Create tests for all adapter main functions and helper methods
- Test error handling scenarios and edge cases
- Mock external API calls and hardware dependencies
- For adapters connecting to APIs/devices not reachable by internet, provide example data files to allow testing of functionality without live connections
- Example test structure:
  ```javascript
  describe('AdapterName', () => {
    let adapter;
    
    beforeEach(() => {
      // Setup test adapter instance
    });
    
    test('should initialize correctly', () => {
      // Test adapter initialization
    });
  });
  ```

### Integration Testing

**IMPORTANT**: Use the official `@iobroker/testing` framework for all integration tests. This is the ONLY correct way to test ioBroker adapters.

**Official Documentation**: https://github.com/ioBroker/testing

#### Framework Structure
Integration tests MUST follow this exact pattern:

```javascript
const path = require('path');
const { tests } = require('@iobroker/testing');

// Define test coordinates or configuration
const TEST_COORDINATES = '52.520008,13.404954'; // Berlin
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// Use tests.integration() with defineAdditionalTests
tests.integration(path.join(__dirname, '..'), {
    defineAdditionalTests({ suite }) {
        suite('Test adapter with specific configuration', (getHarness) => {
            let harness;

            before(() => {
                harness = getHarness();
            });

            it('should configure and start adapter', function () {
                return new Promise(async (resolve, reject) => {
                    try {
                        harness = getHarness();
                        
                        // Get adapter object using promisified pattern
                        const obj = await new Promise((res, rej) => {
                            harness.objects.getObject('system.adapter.your-adapter.0', (err, o) => {
                                if (err) return rej(err);
                                res(o);
                            });
                        });
                        
                        if (!obj) {
                            return reject(new Error('Adapter object not found'));
                        }

                        // Configure adapter properties
                        Object.assign(obj.native, {
                            position: TEST_COORDINATES,
                            createCurrently: true,
                            createHourly: true,
                            createDaily: true,
                            // Add other configuration as needed
                        });

                        // Set the updated configuration
                        harness.objects.setObject(obj._id, obj);

                        console.log('✅ Step 1: Configuration written, starting adapter...');
                        
                        // Start adapter and wait
                        await harness.startAdapterAndWait();
                        
                        console.log('✅ Step 2: Adapter started');

                        // Wait for adapter to process data
                        const waitMs = 15000;
                        await wait(waitMs);

                        console.log('🔍 Step 3: Checking states after adapter run...');
                        
                        // Validate expected states exist
                        const states = await harness.states.getStatesAsync('your-adapter.0.*');
                        
                        // Assert expected behavior
                        expect(states).toBeDefined();
                        expect(Object.keys(states).length).toBeGreaterThan(0);
                        
                        resolve();
                    } catch (error) {
                        reject(error);
                    }
                });
            }).timeout(60000);
        });
    }
});
```

#### Critical Testing Requirements

1. **Always use `tests.integration()`** - Never try to manually instantiate adapters
2. **Use `defineAdditionalTests({ suite })`** - This is the correct way to add custom tests
3. **Get harness with `getHarness()`** - Don't try to create it manually
4. **Use promisified patterns** - Wrap callback-based operations in Promises
5. **Set adequate timeouts** - Integration tests often need 30-60 seconds
6. **Validate state creation** - Always check that expected states are created

#### Common Mistakes to Avoid

❌ **Wrong**: Trying to manually create adapter instances
```javascript
// DON'T DO THIS
const MyAdapter = require('../main');
const adapter = new MyAdapter({...});
```

❌ **Wrong**: Using synchronous patterns with harness
```javascript
// DON'T DO THIS
const obj = harness.objects.getObject('system.adapter.my-adapter.0');
```

✅ **Correct**: Use the official testing framework
```javascript
// DO THIS
tests.integration(path.join(__dirname, '..'), {
    defineAdditionalTests({ suite }) {
        suite('My Tests', (getHarness) => {
            // Your tests here
        });
    }
});
```

### Testing Authentication & API Integration
For the Wolf SmartSet adapter specifically:
- Mock Wolf Smartset API responses for unit tests
- Create integration tests with demo credentials when available
- Test both User and Expert authentication modes
- Validate parameter value parsing and state creation
- Test poll cycle management and BundleId handling

## ioBroker-Specific Development

### Admin Interface (JSON Config)
- Use jsonConfig.json for configuration UI
- Implement device selection dropdown with Wolf Smartset API integration
- Support for parameter bundle configuration tables
- Validation of poll intervals against server requirements

### State and Object Management
```javascript
// Wolf-specific object creation patterns
await this.setObjectNotExistsAsync(id, {
    type: 'state',
    common: {
        name: parameterName,
        type: getIoBrokerType(wolfType),
        role: getIoBrokerRole(wolfControlType),
        read: true,
        write: isWritable,
        min: wolfParam.MinValue || wolfParam.MinValueCondition,
        max: wolfParam.MaxValue || wolfParam.MaxValueCondition,
        unit: wolfParam.Unit
    },
    native: {
        parameterId: wolfParam.ParameterId,
        bundleId: wolfParam.BundleId
    }
});
```

### Connection and Lifecycle Management
```javascript
// ioBroker adapter lifecycle for cloud services
class WolfSmartsetAdapter extends utils.Adapter {
    constructor(options = {}) {
        super({ ...options, name: 'wolf-smartset' });
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    async onReady() {
        // Initialize Wolf API connection
        // Set up polling intervals
        // Create device objects
        this.setState('info.connection', true, true);
    }

    onUnload(callback) {
        try {
            // Clear polling timers
            if (this.shortPollTimer) clearInterval(this.shortPollTimer);
            if (this.longPollTimer) clearInterval(this.longPollTimer);
            // Cleanup Wolf API connections
            this.setState('info.connection', false, true);
        } catch (e) {
            callback();
        }
    }
}
```

## Error Handling and Logging

### ioBroker Logging Patterns
```javascript
// Use appropriate log levels
this.log.error('Critical error that prevents adapter operation');
this.log.warn('Warning that might affect functionality');
this.log.info('Important information for users');
this.log.debug('Detailed information for debugging');
```

### Wolf SmartSet Specific Error Handling
- Handle authentication failures with automatic retry
- Manage API rate limiting and minimum poll intervals  
- Process Expert mode access issues gracefully
- Handle device offline/online state changes

## Code Style and Standards

- Follow JavaScript/TypeScript best practices
- Use async/await for asynchronous operations
- Implement proper resource cleanup in `unload()` method
- Use semantic versioning for adapter releases
- Include proper JSDoc comments for public methods

## CI/CD and Testing Integration

### GitHub Actions for API Testing
For adapters with external API dependencies, implement separate CI/CD jobs:

```yaml
# Tests API connectivity with demo credentials (runs separately)
demo-api-tests:
  if: contains(github.event.head_commit.message, '[skip ci]') == false
  
  runs-on: ubuntu-22.04
  
  steps:
    - name: Checkout code
      uses: actions/checkout@v4
      
    - name: Use Node.js 20.x
      uses: actions/setup-node@v4
      with:
        node-version: 20.x
        cache: 'npm'
        
    - name: Install dependencies
      run: npm ci
      
    - name: Run demo API tests
      run: npm run test:integration-demo
```

### CI/CD Best Practices
- Run credential tests separately from main test suite
- Use ubuntu-22.04 for consistency
- Don't make credential tests required for deployment
- Provide clear failure messages for API connectivity issues
- Use appropriate timeouts for external API calls (120+ seconds)

### Package.json Script Integration
Add dedicated script for credential testing:
```json
{
  "scripts": {
    "test:integration-demo": "mocha test/integration-demo --exit"
  }
}
```

### Practical Example: Complete API Testing Implementation
Here's a complete example based on lessons learned from the Discovergy adapter:

#### test/integration-demo.js
```javascript
const path = require("path");
const { tests } = require("@iobroker/testing");

// Helper function to encrypt password using ioBroker's encryption method
async function encryptPassword(harness, password) {
    const systemConfig = await harness.objects.getObjectAsync("system.config");
    
    if (!systemConfig || !systemConfig.native || !systemConfig.native.secret) {
        throw new Error("Could not retrieve system secret for password encryption");
    }
    
    const secret = systemConfig.native.secret;
    let result = '';
    for (let i = 0; i < password.length; ++i) {
        result += String.fromCharCode(secret[i % secret.length].charCodeAt(0) ^ password.charCodeAt(i));
    }
    
    return result;
}

// Run integration tests with demo credentials
tests.integration(path.join(__dirname, ".."), {
    defineAdditionalTests({ suite }) {
        suite("API Testing with Demo Credentials", (getHarness) => {
            let harness;
            
            before(() => {
                harness = getHarness();
            });

            it("Should connect to API and initialize with demo credentials", async () => {
                console.log("Setting up demo credentials...");
                
                if (harness.isAdapterRunning()) {
                    await harness.stopAdapter();
                }
                
                const encryptedPassword = await encryptPassword(harness, "demo_password");
                
                await harness.changeAdapterConfig("your-adapter", {
                    native: {
                        username: "demo@provider.com",
                        password: encryptedPassword,
                        // other config options
                    }
                });

                console.log("Starting adapter with demo credentials...");
                await harness.startAdapter();
                
                // Wait for API calls and initialization
                await new Promise(resolve => setTimeout(resolve, 60000));
                
                const connectionState = await harness.states.getStateAsync("your-adapter.0.info.connection");
                
                if (connectionState && connectionState.val === true) {
                    console.log("✅ SUCCESS: API connection established");
                    return true;
                } else {
                    throw new Error("API Test Failed: Expected API connection to be established with demo credentials. " +
                        "Check logs above for specific API errors (DNS resolution, 401 Unauthorized, network issues, etc.)");
                }
            }).timeout(120000);
        });
    }
});
```

## Wolf SmartSet Specific Implementation Details

### API Integration Patterns
```javascript
// Wolf Smartset authentication with OpenID Client
const { Issuer, generators } = require('openid-client');

async initializeWolfAPI() {
    const issuer = await Issuer.discover('https://wolf-smartset.com/.well-known/openid_configuration');
    this.client = new issuer.Client({
        client_id: 'your-client-id',
        client_secret: 'your-client-secret'
    });
}

// Parameter polling with BundleId management
async pollParameters(bundleId, parameterList) {
    const response = await this.wolfAPI.post('/parameters/poll', {
        bundleId: bundleId,
        parameters: parameterList
    });
    
    // Process parameter values and update ioBroker states
    for (const param of response.data.parameters) {
        await this.setStateAsync(`${param.path}.${param.id}`, {
            val: param.value,
            ack: true
        });
    }
}
```

### Configuration Management
- Support device selection from Wolf Smartset account
- Manage dual poll cycles (short/long intervals) 
- Handle Expert mode authentication and parameter access
- Implement BundleId configuration for parameter groups

### State Structure
Follow Wolf's parameter hierarchy:
- `Benutzer` (User level parameters)
- `Fachmann` (Expert level parameters) 
- Support for time programs, party mode, vacation mode
- API profiling data in `info_api` channel