// Wraps an async controller so thrown errors / rejected promises reach Express's error handler.
module.exports = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
