# Older Changelogs
## 2.0.0-internal
- (flingo64) further internal changes omitted from news section due to size limitations
  - Demystified (decoded) API constants (array _021a[])
  - All API strings (URL, paths, params) as constants
  - Fixed various typechecker and eslint/prettier warnings
  - Replaced deprecated ioBroker async functions by sync function equivalents
  - Re-ordered and renamed private functions in main.js and admin/wss.js
  - Reorganized adapter initialization / openIdInit for more robust error handling
  - Added openId logout on instance unload to force a fresh AuthN on next adapter start
  - Added API Profiling option to track requested BundleId / # of requested params and # of returned params / # of returned values
  - Migrated translations from words.js to i18n
  - Added complete translation for all adapter instance setting strings
  - Disabled code for caching of auth data to allow a clean re-auth when required by server or on adapter reload
  - Added optional Check for public IP changes for faster Wolf Smartset expert session recovery
  - README: added descriptions on all instance settings and adpater operation

## 1.2.4 (2024-12-22)
- (flingo64) Bugfix for issues #281, #329, #365, #406: ioBroker object limits min/max use Wolf Smartset Min/MaxValueCondition if available, otherwise use Min/MaxValue now.
- (flingo64) Added some comments on Wolf Smartset ControlTypes
- (flingo64) Modified misspelled variable name to 'SubMenuEntry'
- (flingo64) Add NamePrefix, if exists, to object names (e.g. 'A1: ', 'WP001: ') for better parameter identification
- (mcm1957) Adapter has been adapted to @iobroker/eslint-config and eslint 9.x.
- (mcm1957) Dependencies have been updated

## 1.2.3 (2024-04-29)
- (mcm1957) Dependencies have been updated

## 1.2.2 (2024-04-22)
- (flingo64) A crash during re-authentication has been fixed. OpenIdInit will be called only once to avoid endless loop during re-authentication.

## 1.2.1 (2024-04-19)
- (flingo64) Initialization added to openId. This fixes GET_AUTH_TOKEN_ERROR [#304, #330]

## 1.2.0 (2024-04-19)
- (mcm1957) Adapter requires node.js >= 18 and js-controller >= 5 now
- (mcm1957) Dependencies have been updated

## 1.1.1 (2023-01-26)
* (Apollon77) Adjusted to new Login procedure
* (Apollon77) Tokens are now stored and tried to be refreshed automatically
* (Apollon77) Errors in session updates will try to create new session or authenticate anew
* (Apollon77) Generates folder and channel structures for created states
* (Apollon77) Fix some more crash cases
* (Apollon77) make sure adapter is stopped correctly in all cases

## 1.0.0 (2021-07-31)
* (MeisterTR) fix Sentry: IOBROKER-WOLF-SMARTSET-6,IOBROKER-WOLF-SMARTSET-5, IOBROKER-WOLF-SMARTSET-7,IOBROKER-WOLF-SMARTSET-8,IOBROKER-WOLF-SMARTSET-1,IOBROKER-WOLF-SMARTSET-3,IOBROKER-WOLF-SMARTSET-4
* (MeisterTR) Change api from app data to Web PEASE DELETE ADAPTER AND REINSTALL OR DELETE ALL OBJECTS
* (MEISTERTR) added "FACHMANN" states

## 0.2.2 (26.03.2021)
* (MeisterTR) fix timeouts, fix conection

## 0.2.1
* (MeisterTR) Rebuild api and objects, breaking change

## 0.1.2
* (MeisterTR) Poll and set Values
* (MeisterTR) Fix error at start

## 0.1.0
* (MeisterTR) First running Version, Poll Param Only
