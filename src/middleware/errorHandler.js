// Centralized error handler — every asyncHandler-wrapped route funnels errors here,
// so the frontend always gets a clean JSON error instead of a raw stack trace or a hang.
function errorHandler(err, req, res, next) {
  console.error('[error]', err);

  if (err.code === '23505') {
    // Postgres unique_violation (e.g. duplicate email)
    return res.status(409).json({ error: 'This record already exists.' });
  }

  const status = err.statusCode || 500;
  const message = err.publicMessage || (status === 500 ? 'Something went wrong on our end. Please try again.' : err.message);

  res.status(status).json({ error: message });
}

module.exports = errorHandler;
