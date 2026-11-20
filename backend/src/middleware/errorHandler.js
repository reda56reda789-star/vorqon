// Central error handling — never leak stack traces / SQL details to clients.
function notFound(req, res) {
  res.status(404).json({ error: 'Not found', path: req.originalUrl });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // eslint-disable-next-line no-console
  console.error(err);
  if (err.name === 'ValidationError' || err.name === 'ZodError') {
    return res.status(400).json({ error: 'Invalid data', details: err.issues || err.message });
  }
  return res.status(500).json({ error: 'Internal server error' });
}
module.exports = { notFound, errorHandler };
