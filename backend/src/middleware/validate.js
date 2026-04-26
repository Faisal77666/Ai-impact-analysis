const validate = (schema) => (req, res, next) => {
  const parsed = schema.safeParse(req.body);
  if (parsed.success) {
    req.body = parsed.data;
    return next();
  }

  return res.status(400).json({
    success: false,
    message: 'Validation failed',
    details: parsed.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message
    }))
  });
};

module.exports = validate;
