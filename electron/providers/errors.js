function outputTruncatedError(message) {
  const err = new Error(message)
  err.code = 'OUTPUT_TRUNCATED'
  return err
}

module.exports = { outputTruncatedError }
