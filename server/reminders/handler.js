// Yandex's documented loader uses CommonJS file.handler entry points.
// Keep the implementation in explicit .mjs modules; load it once per instance.
const implementation = import('./index.mjs');
exports.apiHandler = async (event, context) => (await implementation).apiHandler(event, context);
exports.operatorHandler = async (event, context) => (await implementation).operatorHandler(event, context);
exports.dispatchHandler = async (event, context) => (await implementation).dispatchHandler(event, context);
